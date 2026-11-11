// Zatvorene lige: osnivač pravi ligu, ostali ulaze kodom. Tabela se računa iz završenih mečeva
// u kojima su svi za stolom članovi lige (standings.ts). Isto kao lige u Preferansu.

import { Router } from 'express';
import { whoIs } from './auth.js';
import { all, finishedMatches, one, run } from './db.js';
import { computeStandings } from './standings.js';
import type { LeagueRankBy, LeagueScoring } from './standings.js';
import { rateLimit } from './rateLimit.js';

const MAX_LEAGUES_PER_OWNER = 5;
const MAX_MEMBERS = 50;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

interface LeagueRow {
  id: number; name: string; code: string; owner_id: number; scoring: LeagueScoring; rank_by: LeagueRankBy; norma: number;
}

export const leaguesRouter = Router();
const limit = rateLimit({ windowMs: 60_000, max: 30, keyPrefix: 'liga', message: 'Previše zahteva. Pokušajte kasnije.' });

function newCode(): string {
  for (;;) {
    const code = Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    if (!one('SELECT 1 FROM leagues WHERE code = ?', [code])) return code;
  }
}

const members = (leagueId: number) => all<{ userId: number; name: string }>(
  `SELECT m.user_id AS userId, COALESCE(p.name, '?') AS name FROM league_members m
   LEFT JOIN remi_players p ON p.user_id = m.user_id WHERE m.league_id = ?`, [leagueId]);

const isMember = (leagueId: number, userId: number) =>
  one('SELECT 1 FROM league_members WHERE league_id = ? AND user_id = ?', [leagueId, userId]) !== null;

function validSettings(b: Record<string, unknown>): { scoring: LeagueScoring; rankBy: LeagueRankBy; norma: number } | string {
  const scoring = b.scoring ?? 'places';
  const rankBy = b.rankBy ?? 'total';
  const norma = b.norma === undefined ? 5 : Number(b.norma);
  if (scoring !== 'places' && scoring !== 'result') return 'Bodovanje mora biti „po mestu“ ili „po rezultatu“.';
  if (rankBy !== 'total' && rankBy !== 'avg') return 'Poredak mora biti po zbiru ili po proseku.';
  if (!Number.isInteger(norma) || norma < 0 || norma > 100) return 'Norma je broj partija od 0 do 100.';
  return { scoring, rankBy, norma };
}

const info = (l: LeagueRow, userId: number) => ({
  id: l.id, name: l.name, norma: l.norma, scoring: l.scoring, rankBy: l.rank_by,
  ownerId: l.owner_id, mine: l.owner_id === userId,
});

leaguesRouter.use(limit);

/** Moje lige. */
leaguesRouter.get('/', async (req, res) => {
  const me = await whoIs(req);
  if (!me) return void res.status(401).json({ error: 'Niste prijavljeni.' });
  const rows = all<LeagueRow & { n: number }>(
    `SELECT l.*, (SELECT COUNT(*) FROM league_members x WHERE x.league_id = l.id) AS n
     FROM leagues l JOIN league_members m ON m.league_id = l.id WHERE m.user_id = ? ORDER BY l.id DESC`, [me.id]);
  res.json({ leagues: rows.map(l => ({ ...info(l, me.id), code: l.owner_id === me.id ? l.code : undefined, members: l.n })) });
});

leaguesRouter.post('/', async (req, res) => {
  const me = await whoIs(req);
  if (!me) return void res.status(401).json({ error: 'Niste prijavljeni.' });
  const name = String(req.body?.name ?? '').trim();
  if (name.length < 2 || name.length > 30) return void res.status(400).json({ error: 'Naziv lige ima 2 do 30 slova.' });
  const s = validSettings(req.body ?? {});
  if (typeof s === 'string') return void res.status(400).json({ error: s });
  const owned = one<{ n: number }>('SELECT COUNT(*) AS n FROM leagues WHERE owner_id = ?', [me.id])?.n ?? 0;
  if (owned >= MAX_LEAGUES_PER_OWNER) return void res.status(400).json({ error: `Najviše ${MAX_LEAGUES_PER_OWNER} liga po osnivaču.` });
  const code = newCode();
  run('INSERT INTO leagues (name, code, owner_id, scoring, rank_by, norma) VALUES (?, ?, ?, ?, ?, ?)',
    [name, code, me.id, s.scoring, s.rankBy, s.norma]);
  const id = one<{ id: number }>('SELECT id FROM leagues WHERE code = ?', [code])!.id;
  run('INSERT INTO league_members (league_id, user_id) VALUES (?, ?)', [id, me.id]);
  res.json({ id, code });
});

leaguesRouter.post('/join', async (req, res) => {
  const me = await whoIs(req);
  if (!me) return void res.status(401).json({ error: 'Niste prijavljeni.' });
  const code = String(req.body?.code ?? '').trim().toUpperCase();
  const l = one<LeagueRow>('SELECT * FROM leagues WHERE code = ?', [code]);
  if (!l) return void res.status(404).json({ error: 'Nema lige sa tim kodom.' });
  if (!isMember(l.id, me.id)) {
    if (members(l.id).length >= MAX_MEMBERS) return void res.status(400).json({ error: 'Liga je puna.' });
    run('INSERT INTO league_members (league_id, user_id) VALUES (?, ?)', [l.id, me.id]);
  }
  res.json({ id: l.id });
});

/** Tabela lige (samo članovima). */
leaguesRouter.get('/:id', async (req, res) => {
  const me = await whoIs(req);
  if (!me) return void res.status(401).json({ error: 'Niste prijavljeni.' });
  const l = one<LeagueRow>('SELECT * FROM leagues WHERE id = ?', [Number(req.params.id)]);
  if (!l || !isMember(l.id, me.id)) return void res.status(404).json({ error: 'Nema takve lige.' });
  const standings = computeStandings(members(l.id), finishedMatches(), { scoring: l.scoring, norma: l.norma, rankBy: l.rank_by });
  res.json({ league: { ...info(l, me.id), code: l.owner_id === me.id ? l.code : undefined }, standings });
});

leaguesRouter.post('/:id/leave', async (req, res) => {
  const me = await whoIs(req);
  if (!me) return void res.status(401).json({ error: 'Niste prijavljeni.' });
  const l = one<LeagueRow>('SELECT * FROM leagues WHERE id = ?', [Number(req.params.id)]);
  if (!l) return void res.status(404).json({ error: 'Nema takve lige.' });
  if (l.owner_id === me.id) return void res.status(400).json({ error: 'Osnivač ne može da napusti ligu — može da je obriše.' });
  run('DELETE FROM league_members WHERE league_id = ? AND user_id = ?', [l.id, me.id]);
  res.json({ ok: true });
});

/** Osnivač: izbaci člana. */
leaguesRouter.post('/:id/kick', async (req, res) => {
  const me = await whoIs(req);
  if (!me) return void res.status(401).json({ error: 'Niste prijavljeni.' });
  const l = one<LeagueRow>('SELECT * FROM leagues WHERE id = ?', [Number(req.params.id)]);
  if (!l || l.owner_id !== me.id) return void res.status(403).json({ error: 'Samo osnivač može da izbaci člana.' });
  const userId = Number(req.body?.userId);
  if (userId === me.id) return void res.status(400).json({ error: 'Ne možete izbaciti sebe.' });
  run('DELETE FROM league_members WHERE league_id = ? AND user_id = ?', [l.id, userId]);
  res.json({ ok: true });
});

/** Osnivač: promeni pravila (norma, bodovanje, poredak). */
leaguesRouter.patch('/:id', async (req, res) => {
  const me = await whoIs(req);
  if (!me) return void res.status(401).json({ error: 'Niste prijavljeni.' });
  const l = one<LeagueRow>('SELECT * FROM leagues WHERE id = ?', [Number(req.params.id)]);
  if (!l || l.owner_id !== me.id) return void res.status(403).json({ error: 'Samo osnivač može da menja ligu.' });
  const s = validSettings({ scoring: l.scoring, rankBy: l.rank_by, norma: l.norma, ...req.body });
  if (typeof s === 'string') return void res.status(400).json({ error: s });
  run('UPDATE leagues SET scoring = ?, rank_by = ?, norma = ? WHERE id = ?', [s.scoring, s.rankBy, s.norma, l.id]);
  res.json({ ok: true });
});

/** Osnivač: obriši ligu. */
leaguesRouter.delete('/:id', async (req, res) => {
  const me = await whoIs(req);
  if (!me) return void res.status(401).json({ error: 'Niste prijavljeni.' });
  const l = one<LeagueRow>('SELECT * FROM leagues WHERE id = ?', [Number(req.params.id)]);
  if (!l || l.owner_id !== me.id) return void res.status(403).json({ error: 'Samo osnivač može da obriše ligu.' });
  run('DELETE FROM league_members WHERE league_id = ?', [l.id]);
  run('DELETE FROM leagues WHERE id = ?', [l.id]);
  res.json({ ok: true });
});
