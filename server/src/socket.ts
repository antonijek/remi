// Socket.io: prijava (JWT + /api/me na preferans serveru), sobe, potezi, chat, prisustvo.
// Klijent nikad ne bira mesto — server ga zna iz userLocation (withSeat).

import type { Server, Socket } from 'socket.io';
import { verifyToken, fetchMe } from './auth.js';
import { getRating, markActive, upsertPlayer } from './db.js';
import { applyAction, isPlayerCount, newGame } from './game.js';
import { broadcast, buildState, startNextDeal } from './driver.js';
import { markOnline, markOffline, listOnlineUsers, getSocketIdsForUser } from './presence.js';
import {
  CHAT_LOG_LIMIT, clearUserLocation, createRoom, emptySeat, getRoom, getUserLocation, humanSeats,
  listOpenRooms, removeRoom, seatIndexes, setUserLocation, status,
} from './rooms.js';
import type { Room } from './rooms.js';

type Ack = (res: Record<string, unknown>) => void;
const noAck: Ack = () => undefined;
const ackOf = (fn: unknown): Ack => (typeof fn === 'function' ? (fn as Ack) : noAck);

// Isto kao lora/preferans: jedan loš zahtev jednog klijenta ne sme da sruši ceo proces.
function wrapSocketErrors(socket: Socket): void {
  const originalOn = socket.on.bind(socket);
  socket.on = ((event: string, handler: (...args: unknown[]) => unknown) => originalOn(event, (...args: unknown[]) => {
    try {
      const result = handler(...args);
      if (result && typeof (result as Promise<unknown>).catch === 'function') {
        (result as Promise<unknown>).catch(err => console.error(`[socket:${event}] async error (${socket.id}):`, err));
      }
    } catch (err) {
      console.error(`[socket:${event}] error (${socket.id}):`, err);
    }
  })) as typeof socket.on;
}

function seatHuman(room: Room, seat: number, socket: Socket): void {
  const userId: number = socket.data.userId;
  room.seats[seat] = { kind: 'human', userId, name: socket.data.name, rating: getRating(userId), formerUserId: null };
  attach(room, seat, socket);
}

function attach(room: Room, seat: number, socket: Socket): void {
  const old = room.sockets[seat];
  if (old && old.id !== socket.id) old.leave(room.code);
  room.sockets[seat] = socket;
  room.offlineSince[seat] = null;
  socket.join(room.code);
  setUserLocation(socket.data.userId, { code: room.code, seat });
}

/** Čovek odlazi iz sobe: u čekaonici se mesto oslobađa, u meču ga preuzima računar (može da se vrati). */
function leaveRoom(room: Room, seat: number, socket: Socket): void {
  const userId: number = socket.data.userId;
  clearUserLocation(userId);
  socket.leave(room.code);
  room.sockets[seat] = null;
  room.ready.delete(seat);
  const st = status(room);
  if (st === 'WAITING') {
    room.seats[seat] = emptySeat();
    const humans = humanSeats(room);
    if (humans.length === 0) { removeRoom(room); return; }
    if (room.hostSeat === seat) room.hostSeat = humans[0];
  } else if (st === 'PLAYING') {
    room.seats[seat] = { ...room.seats[seat], kind: 'ai', userId: null, formerUserId: userId };
  }
  broadcast(room);
}

function joinRoom(room: Room, socket: Socket): string | null {
  const userId: number = socket.data.userId;
  const seats = seatIndexes(room);
  const mine = seats.find(s => room.seats[s].userId === userId);
  if (mine !== undefined) { attach(room, mine, socket); return null; }
  const st = status(room);
  if (st === 'PLAYING') {
    const former = seats.find(s => room.seats[s].formerUserId === userId);
    if (former === undefined) return 'Igra u toj sobi je već počela.';
    room.seats[former] = { ...room.seats[former], kind: 'human', userId, name: socket.data.name, formerUserId: null };
    attach(room, former, socket);
    return null;
  }
  if (st === 'FINISHED') return 'Ta igra je završena.';
  const free = seats.find(s => room.seats[s].kind === 'empty');
  if (free === undefined) return 'Soba je puna.';
  seatHuman(room, free, socket);
  return null;
}

function startGame(room: Room): void {
  for (const s of seatIndexes(room)) {
    if (room.seats[s].kind === 'empty') room.seats[s] = { kind: 'ai', userId: null, name: null, rating: 1000, formerUserId: null };
  }
  room.rated = humanSeats(room).length >= 2;
  room.game = newGame(room.players);
}

export function registerSocketHandlers(io: Server): void {
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string') return next(new Error('Missing auth token'));
    try {
      const payload = verifyToken(token);
      // ime + ban provera iz preferans naloga: ban važi odmah, ne tek po isteku tokena
      const me = await fetchMe(token);
      if (!me || me.id !== payload.userId) return next(new Error('Invalid auth token'));
      socket.data.userId = me.id;
      socket.data.name = String(me.name || `igrač-${me.id}`).slice(0, 40);
      next();
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('auth server')) return next(new Error('Auth server unavailable'));
      if (err instanceof TypeError) return next(new Error('Auth server unavailable'));
      next(new Error('Invalid auth token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId: number = socket.data.userId;
    upsertPlayer(userId, socket.data.name);
    markActive(userId);
    wrapSocketErrors(socket);
    // Jedan uređaj u isto vreme: stariji dobija poruku i prekida se (inače bi ostao sa zastarelim stolom).
    for (const sid of getSocketIdsForUser(userId)) {
      const old = io.sockets.sockets.get(sid);
      if (old && old.id !== socket.id) { old.emit('session:replaced'); old.disconnect(true); }
    }
    markOnline(socket.id, userId, socket.data.name);

    // Povratak za sto (osvežena stranica, pala veza, restart servera).
    const loc = getUserLocation(userId);
    const room = loc ? getRoom(loc.code) : undefined;
    if (loc && room && room.seats[loc.seat].userId === userId) {
      attach(room, loc.seat, socket);
      socket.emit('chat:backlog', room.chatLog);
      broadcast(room);
    } else {
      if (loc) clearUserLocation(userId);
      socket.emit('room:none');
    }

    /** Mesto ovog igrača u njegovoj sobi (klijent ga nikad ne šalje sam). */
    const withSeat = (fn: (room: Room, seat: number) => void) => {
      const l = getUserLocation(userId);
      const r = l ? getRoom(l.code) : undefined;
      if (!l || !r || r.sockets[l.seat]?.id !== socket.id) return socket.emit('game:error', 'Niste za stolom.');
      fn(r, l.seat);
    };
    const asHost = (fn: (room: Room) => void) => withSeat((r, seat) => {
      if (r.hostSeat !== seat) return socket.emit('game:error', 'Samo domaćin može to da uradi.');
      if (status(r) !== 'WAITING') return socket.emit('game:error', 'Igra je već počela.');
      fn(r);
    });
    const busy = () => {
      const l = getUserLocation(userId);
      return l && getRoom(l.code) ? 'Već ste u sobi.' : null;
    };

    socket.on('room:list', (_p, ack) => ackOf(ack)({ rooms: listOpenRooms() }));
    socket.on('presence:list', (_p, ack) => ackOf(ack)({ users: listOnlineUsers() }));

    socket.on('room:create', (p, ack) => {
      const err = busy();
      if (err) return ackOf(ack)({ error: err });
      const players = (p as { players?: unknown })?.players;
      const r = createRoom(isPlayerCount(players) ? players : 2);
      seatHuman(r, 0, socket);
      ackOf(ack)({ code: r.code });
      broadcast(r);
    });

    socket.on('room:join', (p, ack) => {
      const r = getRoom((p as { code?: unknown })?.code);
      if (!r) return ackOf(ack)({ error: 'Nema sobe sa tim kodom.' });
      const l = getUserLocation(userId);
      if (l && l.code !== r.code && getRoom(l.code)) return ackOf(ack)({ error: 'Već ste u drugoj sobi.' });
      const err = joinRoom(r, socket);
      if (err) return ackOf(ack)({ error: err });
      socket.emit('chat:backlog', r.chatLog);
      ackOf(ack)({ code: r.code });
      broadcast(r);
    });

    socket.on('room:quick', (_p, ack) => {
      const err = busy();
      if (err) return ackOf(ack)({ error: err });
      const open = listOpenRooms()[0];
      const r = open ? getRoom(open.code)! : createRoom(2);
      if (open) joinRoom(r, socket);
      else seatHuman(r, 0, socket);
      ackOf(ack)({ code: r.code });
      broadcast(r);
    });

    socket.on('room:setPlayers', p => asHost(r => {
      const players = (p as { players?: unknown })?.players;
      if (!isPlayerCount(players)) return;
      if (r.seats.slice(players).some(s => s.kind === 'human')) return socket.emit('game:error', 'Prvo neka igrači sa viška mesta izađu.');
      for (let s = players; s < r.seats.length; s++) r.seats[s] = emptySeat();
      r.players = players;
      broadcast(r);
    }));

    socket.on('room:addAi', p => asHost(r => {
      const seat = (p as { seat?: unknown })?.seat;
      if (typeof seat !== 'number' || !seatIndexes(r).includes(seat) || r.seats[seat].kind !== 'empty') return;
      r.seats[seat] = { kind: 'ai', userId: null, name: null, rating: 1000, formerUserId: null };
      broadcast(r);
    }));

    socket.on('room:removeAi', p => asHost(r => {
      const seat = (p as { seat?: unknown })?.seat;
      if (typeof seat !== 'number' || !seatIndexes(r).includes(seat) || r.seats[seat].kind !== 'ai') return;
      r.seats[seat] = emptySeat();
      broadcast(r);
    }));

    socket.on('room:start', () => asHost(r => {
      startGame(r);
      broadcast(r);
    }));

    socket.on('room:leave', () => withSeat((r, seat) => {
      leaveRoom(r, seat, socket);
      socket.emit('room:none');
    }));

    socket.on('room:leaveFinished', () => {
      const l = getUserLocation(userId);
      const r = l ? getRoom(l.code) : undefined;
      if (r && status(r) === 'FINISHED') {
        r.sockets[l!.seat] = null;
        socket.leave(r.code);
      }
      clearUserLocation(userId);
      socket.emit('room:none');
    });

    socket.on('game:play', p => withSeat((r, seat) => {
      if (!r.game || status(r) !== 'PLAYING') return socket.emit('game:error', 'Igra nije u toku.');
      const err = applyAction(r.game, seat, p);
      if (err) {
        socket.emit('game:error', err);
        socket.emit('room:state', buildState(r, seat)); // vrati klijenta na pravo stanje
        return;
      }
      broadcast(r);
    }));

    socket.on('game:ready', () => withSeat((r, seat) => {
      r.ready.add(seat);
      broadcast(r);
    }));

    socket.on('game:nextDeal', () => withSeat(r => startNextDeal(r)));

    socket.on('chat:send', p => withSeat((r, seat) => {
      const text = String((p as { text?: unknown })?.text ?? '').trim().slice(0, 200);
      if (!text) return;
      const msg = { name: socket.data.name, seat, text, ts: Date.now() };
      r.chatLog.push(msg);
      if (r.chatLog.length > CHAT_LOG_LIMIT) r.chatLog.shift();
      io.to(r.code).emit('chat:message', msg);
    }));

    socket.on('room:invite', p => withSeat(r => {
      const target = (p as { userId?: unknown })?.userId;
      if (typeof target !== 'number' || target === userId) return;
      for (const sid of getSocketIdsForUser(target)) io.to(sid).emit('room:invited', { code: r.code, from: socket.data.name });
    }));

    socket.on('disconnect', () => {
      markOffline(socket.id);
      const l = getUserLocation(userId);
      const r = l ? getRoom(l.code) : undefined;
      if (!l || !r || r.sockets[l.seat]?.id !== socket.id) return;
      r.sockets[l.seat] = null;
      r.offlineSince[l.seat] = Date.now();
      // čekaonica bez ikoga povezanog se briše odmah (kao u Lori)
      if (status(r) === 'WAITING' && !r.sockets.some(s => s)) { removeRoom(r); return; }
      broadcast(r);
    });
  });
}
