// Jedino mesto gde se soba menja i šalje igračima (broadcast): čuva sobu, svakom šalje samo
// njegov prikaz, zakazuje potez računara (i za čoveka bez veze posle roka), prelazi na sledeću
// partiju i na kraju meča jednom upisuje rejting i istoriju.

import type { Server } from 'socket.io';
import { applyRatingChange, countGame, logMatch } from './db.js';
import { history, nextDeal, phase, playAi, sideOf, sideScores, turn, viewFor } from './game.js';
import { ratingDeltas } from './rating.js';
import { persistRoom, seatIndexes, status } from './rooms.js';
import type { Room } from './rooms.js';

const AI_DELAY_MS = Number(process.env.AI_DELAY_MS ?? 1300);       // klijent za to vreme pokaže prethodni potez
const OFFLINE_GRACE_MS = Number(process.env.OFFLINE_GRACE_MS ?? 20_000);
const NEXT_DEAL_MS = Number(process.env.NEXT_DEAL_MS ?? 15_000);

let io: Server | null = null;
export const setIo = (server: Server): void => { io = server; };
export const getIo = (): Server | null => io;

export function buildState(room: Room, seat: number) {
  return {
    code: room.code,
    status: status(room),
    players: room.players,
    hostSeat: room.hostSeat,
    mySeat: seat,
    seats: seatIndexes(room).map(s => ({
      kind: room.seats[s].kind,
      name: room.seats[s].name,
      rating: room.seats[s].rating,
      connected: room.seats[s].kind === 'human' ? room.sockets[s] !== null : null,
    })),
    ready: [...room.ready],
    view: room.game ? viewFor(room.game, seat) : null,
    rating: room.ratingResult,
  };
}

export function broadcast(room: Room): void {
  room.lastActivity = Date.now();
  if (room.game && phase(room.game) === 'MATCH_END') resolveMatch(room);
  persistRoom(room);
  for (const s of seatIndexes(room)) room.sockets[s]?.emit('room:state', buildState(room, s));
  schedule(room);
}

/** Da li računar sada igra na ovom mestu (računar, ili čovek bez veze posle roka). */
function aiSeatDelay(room: Room, seat: number): number | null {
  const s = room.seats[seat];
  if (s.kind === 'ai') return AI_DELAY_MS;
  if (s.kind === 'human' && !room.sockets[seat]) {
    const since = room.offlineSince[seat] ?? Date.now();
    return Math.max(AI_DELAY_MS, since + OFFLINE_GRACE_MS - Date.now());
  }
  return null;
}

function schedule(room: Room): void {
  if (room.aiTimer) clearTimeout(room.aiTimer);
  room.aiTimer = null;
  const g = room.game;
  if (!g) return;
  const ph = phase(g);
  if (ph === 'PLAYING') {
    const t = turn(g);
    const delay = aiSeatDelay(room, t);
    if (delay !== null) room.aiTimer = setTimeout(() => aiTurn(room, t), delay);
  } else if (ph === 'DEAL_END') {
    if (allReady(room)) setTimeout(() => startNextDeal(room), 0);
    else if (!room.nextDealTimer) room.nextDealTimer = setTimeout(() => startNextDeal(room), NEXT_DEAL_MS);
  }
}

function aiTurn(room: Room, seat: number): void {
  room.aiTimer = null;
  const g = room.game;
  if (!g || phase(g) !== 'PLAYING' || turn(g) !== seat || aiSeatDelay(room, seat) === null) return;
  playAi(g, seat);
  broadcast(room);
}

/** Sledeća partija kreće kad svi povezani ljudi kliknu „Dalje“ (ili posle roka). */
function allReady(room: Room): boolean {
  const connected = seatIndexes(room).filter(s => room.seats[s].kind === 'human' && room.sockets[s]);
  return connected.length > 0 && connected.every(s => room.ready.has(s));
}

export function startNextDeal(room: Room): void {
  if (room.nextDealTimer) clearTimeout(room.nextDealTimer);
  room.nextDealTimer = null;
  if (!room.game || phase(room.game) !== 'DEAL_END') return;
  nextDeal(room.game);
  room.ready.clear();
  broadcast(room);
}

/** Kraj meča: rejting (samo ako su bar 2 čoveka seli za sto) i istorija — tačno jednom. */
function resolveMatch(room: Room): void {
  if (room.ratingResult || !room.game) return;
  const g = room.game;
  const sides = sideScores(g);
  const seats = seatIndexes(room);
  const userOf = (s: number) => room.seats[s].userId ?? room.seats[s].formerUserId;
  const scores = seats.map(s => sides[sideOf(g, s)]);
  let deltas = seats.map(() => 0);
  if (room.rated) {
    const bySide = sides.map((score, side) => ({
      score,
      ratings: seats.filter(s => sideOf(g, s) === side).map(s => (userOf(s) !== null ? room.seats[s].rating : null)),
    }));
    const sideDelta = ratingDeltas(bySide);
    deltas = seats.map(s => (userOf(s) !== null ? sideDelta[sideOf(g, s)] : 0));
  }
  const newRatings = seats.map(s => {
    const uid = userOf(s);
    if (uid === null) return null;
    if (!room.rated) { countGame(uid); return room.seats[s].rating; }
    return applyRatingChange(uid, deltas[s]);
  });
  room.ratingResult = { rated: room.rated, scores, deltas, newRatings };
  room.finishedAt = Date.now();
  logMatch({
    code: room.code, players: room.players, rated: room.rated, scores, deltas, history: history(g),
    seats: seats.map(s => ({ kind: room.seats[s].kind, userId: userOf(s), name: room.seats[s].name })),
  });
}
