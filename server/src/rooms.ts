// Sobe: mesta (ljudi ili računar), igra, chat, spremnost za sledeću partiju. Isti principi
// kao lora/preferans: sobe u memoriji, trajno čuvanje u active_rooms, userLocation za reconnect.

import type { Socket } from 'socket.io';
import type { PlayerCount } from './game.js';
import { phase, restoreGame } from './game.js';
import type { Game, GameState } from './game.js';
import { saveActiveRoom, deleteActiveRoom, getAllActiveRooms } from './db.js';

export type SeatKind = 'empty' | 'human' | 'ai';

export interface Seat {
  kind: SeatKind;
  userId: number | null;
  name: string | null;
  rating: number;
  /** Čovek koji je napustio meč — računar igra za njega, ali on može da se vrati. */
  formerUserId: number | null;
}

export interface ChatMessage { name: string; seat: number | null; text: string; ts: number }

export interface RatingResult {
  rated: boolean;
  /** Po mestu: poeni strane, promena i novi rejting (null za računar). */
  scores: number[];
  deltas: number[];
  newRatings: (number | null)[];
}

export type RoomStatus = 'WAITING' | 'PLAYING' | 'FINISHED';

export interface Room {
  code: string;
  createdAt: number;
  players: PlayerCount;
  hostSeat: number;
  seats: Seat[];
  sockets: (Socket | null)[];
  game: Game | null;
  /** Rangirano samo ako su bar 2 čoveka seli za sto na početku. */
  rated: boolean;
  chatLog: ChatMessage[];
  ready: Set<number>;
  ratingResult: RatingResult | null;
  finishedAt: number | null;
  lastActivity: number;
  // runtime (ne čuva se)
  aiTimer: ReturnType<typeof setTimeout> | null;
  nextDealTimer: ReturnType<typeof setTimeout> | null;
  offlineSince: (number | null)[];
}

export const CHAT_LOG_LIMIT = 50;
export const MAX_SEATS = 4;

export function status(room: Room): RoomStatus {
  if (!room.game) return 'WAITING';
  return phase(room.game) === 'MATCH_END' ? 'FINISHED' : 'PLAYING';
}

export const emptySeat = (): Seat => ({ kind: 'empty', userId: null, name: null, rating: 1000, formerUserId: null });
export const seatIndexes = (room: Room): number[] => Array.from({ length: room.players }, (_, i) => i);
export const humanSeats = (room: Room): number[] => seatIndexes(room).filter(s => room.seats[s].kind === 'human');
export const anyoneConnected = (room: Room): boolean => room.sockets.some(s => s !== null);

// ---------------------------------------------------------------- manager

export interface UserLocation { code: string; seat: number }

const roomsByCode = new Map<string, Room>();
const userLocation = new Map<number, UserLocation>();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode(): string {
  let code: string;
  do {
    code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (roomsByCode.has(code));
  return code;
}

export function createRoom(players: PlayerCount): Room {
  const room: Room = {
    code: generateCode(),
    createdAt: Date.now(),
    players,
    hostSeat: 0,
    seats: Array.from({ length: MAX_SEATS }, emptySeat),
    sockets: Array.from({ length: MAX_SEATS }, () => null),
    game: null,
    rated: false,
    chatLog: [],
    ready: new Set(),
    ratingResult: null,
    finishedAt: null,
    lastActivity: Date.now(),
    aiTimer: null,
    nextDealTimer: null,
    offlineSince: Array.from({ length: MAX_SEATS }, () => null),
  };
  roomsByCode.set(room.code, room);
  return room;
}

export function getRoom(code: unknown): Room | undefined {
  return roomsByCode.get(String(code ?? '').trim().toUpperCase());
}

export function allRooms(): Room[] {
  return [...roomsByCode.values()];
}

export function removeRoom(room: Room): void {
  if (room.aiTimer) clearTimeout(room.aiTimer);
  if (room.nextDealTimer) clearTimeout(room.nextDealTimer);
  roomsByCode.delete(room.code);
  deleteActiveRoom(room.code);
  for (const [uid, loc] of userLocation) if (loc.code === room.code) userLocation.delete(uid);
}

export const getUserLocation = (userId: number) => userLocation.get(userId);
export const setUserLocation = (userId: number, loc: UserLocation) => void userLocation.set(userId, loc);
export const clearUserLocation = (userId: number) => void userLocation.delete(userId);

export interface RoomSummary { code: string; players: number; seated: number; host: string | null }

/** Javni lobi: sobe koje čekaju, imaju slobodno mesto i domaćin je tu. */
export function listOpenRooms(): RoomSummary[] {
  const out: RoomSummary[] = [];
  for (const room of roomsByCode.values()) {
    if (status(room) !== 'WAITING' || !room.sockets[room.hostSeat]) continue;
    const seated = seatIndexes(room).filter(s => room.seats[s].kind !== 'empty').length;
    if (seated < room.players) out.push({ code: room.code, players: room.players, seated, host: room.seats[room.hostSeat].name });
  }
  return out;
}

/** Završen meč se čuva još 15 min, da igrač kome je pukla veza po povratku vidi rezultat. */
export const FINISHED_KEEP_MS = 15 * 60 * 1000;
const STALE_MS = 30 * 60 * 1000;
const FORGOTTEN_MS = 24 * 60 * 60 * 1000;

/** Briše (samo kad niko nije povezan) napuštene čekaonice, stare završene mečeve i zaboravljene mečeve. */
export function removeAbandonedRooms(now = Date.now()): number {
  let removed = 0;
  for (const room of roomsByCode.values()) {
    if (anyoneConnected(room)) continue;
    const st = status(room);
    const idle = now - room.lastActivity;
    const gone = (st === 'WAITING' && idle > STALE_MS)
      || (st === 'FINISHED' && now - (room.finishedAt ?? 0) > FINISHED_KEEP_MS)
      || (st === 'PLAYING' && humanSeats(room).length === 0 && idle > STALE_MS)
      || (st === 'PLAYING' && idle > FORGOTTEN_MS);
    if (gone) {
      removeRoom(room);
      removed++;
    }
  }
  return removed;
}

// ---------------------------------------------------------------- persist

interface SerializedRoom {
  code: string;
  createdAt: number;
  players: PlayerCount;
  hostSeat: number;
  seats: Seat[];
  gameState: GameState | null;
  rated: boolean;
  chatLog: ChatMessage[];
  ready: number[];
  ratingResult: RatingResult | null;
  finishedAt: number | null;
}

export function persistRoom(room: Room): void {
  const data: SerializedRoom = {
    code: room.code,
    createdAt: room.createdAt,
    players: room.players,
    hostSeat: room.hostSeat,
    seats: room.seats,
    gameState: room.game ? room.game.getState() : null,
    rated: room.rated,
    chatLog: room.chatLog,
    ready: [...room.ready],
    ratingResult: room.ratingResult,
    finishedAt: room.finishedAt,
  };
  saveActiveRoom(room.code, JSON.stringify(data));
}

/** Pri startu servera: vrati sve nezavršene sobe; igrači se sami ponovo povežu. */
export function loadPersistedRooms(): Room[] {
  const loaded: Room[] = [];
  for (const row of getAllActiveRooms()) {
    let d: SerializedRoom;
    try {
      d = JSON.parse(row.state_json);
    } catch (e) {
      console.error(`[rooms] soba ${row.code} se ne može učitati:`, e);
      continue;
    }
    const room: Room = {
      ...createRoomShell(d),
      game: d.gameState ? restoreGame(d.gameState) : null,
    };
    roomsByCode.set(room.code, room);
    for (const s of seatIndexes(room)) {
      const uid = room.seats[s].userId;
      if (room.seats[s].kind === 'human' && uid !== null) userLocation.set(uid, { code: room.code, seat: s });
    }
    loaded.push(room);
  }
  return loaded;
}

function createRoomShell(d: SerializedRoom): Omit<Room, 'game'> {
  return {
    code: d.code,
    createdAt: d.createdAt,
    players: d.players,
    hostSeat: d.hostSeat,
    seats: d.seats,
    sockets: Array.from({ length: MAX_SEATS }, () => null),
    rated: d.rated,
    chatLog: d.chatLog ?? [],
    ready: new Set(d.ready ?? []),
    ratingResult: d.ratingResult ?? null,
    finishedAt: d.finishedAt ?? (d.gameState?.phase === 'MATCH_END' ? Date.now() : null),
    lastActivity: Date.now(),
    aiTimer: null,
    nextDealTimer: null,
    // posle restarta niko nije povezan: računa se kao da je svima upravo pukla veza
    offlineSince: Array.from({ length: MAX_SEATS }, () => Date.now()),
  };
}
