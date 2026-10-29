// Remi baza — isti obrazac kao lora/preferans db.ts (sql.js u memoriji, upis na disk sa
// zakašnjenjem, flush pri gašenju). Nalozi NISU ovde: žive u preferans bazi.

import fs from 'node:fs';
import initSqlJs from 'sql.js';
import type { Database } from 'sql.js';

const DB_PATH = process.env.DB_PATH || './remi.db';
const PERSIST_DELAY_MS = 2000;

let db: Database;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

export async function initDb(): Promise<void> {
  const SQL = await initSqlJs();
  db = fs.existsSync(DB_PATH) ? new SQL.Database(fs.readFileSync(DB_PATH)) : new SQL.Database();
  db.run(`CREATE TABLE IF NOT EXISTS remi_players (
    user_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    rating INTEGER NOT NULL DEFAULT 1000,
    games_played INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS match_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_code TEXT NOT NULL,
    ended_at TEXT NOT NULL DEFAULT (datetime('now')),
    players INTEGER NOT NULL,
    rated INTEGER NOT NULL,
    seats_json TEXT NOT NULL,
    scores_json TEXT NOT NULL,
    rating_deltas_json TEXT NOT NULL,
    history_json TEXT NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS active_rooms (
    code TEXT PRIMARY KEY,
    state_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
}

function writeNow(): void {
  const tmp = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmp, Buffer.from(db.export()));
  fs.renameSync(tmp, DB_PATH); // ceo fajl ili ništa — pad usred upisa ne kvari bazu
}

/** Upis na disk najviše jednom u 2 s (sql.js drži bazu u memoriji). */
export function persist(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    writeNow();
  }, PERSIST_DELAY_MS);
}

export function flushPersist(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  if (db) writeNow();
}

function one<T>(sql: string, params: (string | number)[]): T | null {
  const st = db.prepare(sql);
  try {
    st.bind(params);
    return st.step() ? (st.getAsObject() as T) : null;
  } finally {
    st.free();
  }
}

function all<T>(sql: string, params: (string | number)[] = []): T[] {
  const st = db.prepare(sql);
  const rows: T[] = [];
  try {
    st.bind(params);
    while (st.step()) rows.push(st.getAsObject() as T);
  } finally {
    st.free();
  }
  return rows;
}

/** Upiši igrača (ili osveži ime). Vraća true ako je nov. */
export function upsertPlayer(userId: number, name: string): boolean {
  const existed = one<{ user_id: number }>('SELECT user_id FROM remi_players WHERE user_id = ?', [userId]) !== null;
  if (existed) db.run(`UPDATE remi_players SET name = ?, last_seen = datetime('now') WHERE user_id = ?`, [name, userId]);
  else db.run('INSERT INTO remi_players (user_id, name) VALUES (?, ?)', [userId, name]);
  persist();
  return !existed;
}

export function getRating(userId: number): number {
  return one<{ rating: number }>('SELECT rating FROM remi_players WHERE user_id = ?', [userId])?.rating ?? 1000;
}

export function applyRatingChange(userId: number, delta: number): number {
  db.run('UPDATE remi_players SET rating = rating + ?, games_played = games_played + 1 WHERE user_id = ?', [delta, userId]);
  persist();
  return getRating(userId);
}

export function countGame(userId: number): void {
  db.run('UPDATE remi_players SET games_played = games_played + 1 WHERE user_id = ?', [userId]);
  persist();
}

export function topPlayers(limit: number): { name: string; rating: number; games_played: number }[] {
  return all('SELECT name, rating, games_played FROM remi_players WHERE games_played > 0 ORDER BY rating DESC, games_played DESC LIMIT ?', [limit]);
}

export function logMatch(m: {
  code: string; players: number; rated: boolean; seats: unknown; scores: number[]; deltas: number[]; history: unknown;
}): void {
  db.run(
    'INSERT INTO match_log (room_code, players, rated, seats_json, scores_json, rating_deltas_json, history_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [m.code, m.players, m.rated ? 1 : 0, JSON.stringify(m.seats), JSON.stringify(m.scores), JSON.stringify(m.deltas), JSON.stringify(m.history)],
  );
  persist();
}

export function saveActiveRoom(code: string, stateJson: string): void {
  db.run(`INSERT INTO active_rooms (code, state_json, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(code) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`, [code, stateJson]);
  persist();
}

export function deleteActiveRoom(code: string): void {
  db.run('DELETE FROM active_rooms WHERE code = ?', [code]);
  persist();
}

export function getAllActiveRooms(): { code: string; state_json: string }[] {
  return all('SELECT code, state_json FROM active_rooms');
}
