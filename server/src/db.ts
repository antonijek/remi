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
  // statistika za admin panel: ko je igrao kog dana i koliko je posetilaca otvorilo igru
  // (visitor je nasumičan id iz pregledača — bez ličnih podataka, broje se i oni bez naloga)
  db.run(`CREATE TABLE IF NOT EXISTS player_days (user_id INTEGER NOT NULL, day TEXT NOT NULL, PRIMARY KEY (user_id, day))`);
  db.run(`CREATE TABLE IF NOT EXISTS visits (day TEXT NOT NULL, visitor TEXT NOT NULL, PRIMARY KEY (day, visitor))`);
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

// ---------------------------------------------------------------- admin statistika

const today = () => new Date().toISOString().slice(0, 10);

export function markActive(userId: number): void {
  db.run('INSERT OR IGNORE INTO player_days (user_id, day) VALUES (?, ?)', [userId, today()]);
  persist();
}

export function recordVisit(visitor: string): void {
  db.run('INSERT OR IGNORE INTO visits (day, visitor) VALUES (?, ?)', [today(), visitor]);
  persist();
}

const since = (days: number) => new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
const count = (sql: string, params: (string | number)[]) => one<{ n: number }>(sql, params)?.n ?? 0;

export function adminOverview() {
  const window = (days: number) => ({
    players: count('SELECT COUNT(DISTINCT user_id) AS n FROM player_days WHERE day >= ?', [since(days)]),
    visitors: count('SELECT COUNT(DISTINCT visitor) AS n FROM visits WHERE day >= ?', [since(days)]),
    matches: count("SELECT COUNT(*) AS n FROM match_log WHERE substr(ended_at, 1, 10) >= ?", [since(days)]),
  });
  const days = all<{ day: string; players: number; visitors: number; matches: number }>(`
    WITH d(day) AS (SELECT day FROM visits UNION SELECT day FROM player_days UNION SELECT substr(ended_at, 1, 10) FROM match_log)
    SELECT day,
      (SELECT COUNT(*) FROM player_days p WHERE p.day = d.day) AS players,
      (SELECT COUNT(*) FROM visits v WHERE v.day = d.day) AS visitors,
      (SELECT COUNT(*) FROM match_log m WHERE substr(m.ended_at, 1, 10) = d.day) AS matches
    FROM d WHERE day >= ? ORDER BY day DESC`, [since(30)]);
  return {
    totalPlayers: count('SELECT COUNT(*) AS n FROM remi_players', []),
    today: window(1), week: window(7), month: window(30), days,
  };
}

export function adminPlayers(): { user_id: number; name: string; rating: number; games_played: number; last_seen: string }[] {
  return all('SELECT user_id, name, rating, games_played, last_seen FROM remi_players ORDER BY last_seen DESC LIMIT 300');
}

export function recentMatches(limit = 50): { id: number; room_code: string; ended_at: string; players: number; rated: number; seats_json: string; scores_json: string; rating_deltas_json: string }[] {
  return all('SELECT id, room_code, ended_at, players, rated, seats_json, scores_json, rating_deltas_json FROM match_log ORDER BY id DESC LIMIT ?', [limit]);
}
