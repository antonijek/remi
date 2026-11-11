// Tabela lige — čista funkcija bez baze (leagues.ts čita match_log i zove computeStandings).
// Rezultati u match_log su „više je bolje“ (poeni sa minusom), svaki sedi za sebe.

export type LeagueScoring = 'places' | 'result';
export type LeagueRankBy = 'total' | 'avg';

/** Bodovi po mestu, prema broju igrača u partiji. */
export const PLACE_POINTS: Record<number, number[]> = { 2: [6, 2], 3: [10, 5, 1], 4: [12, 7, 3, 1] };

export interface LeagueMatch {
  userIds: (number | null)[];
  scores: number[];
}

export interface LeagueMemberRef {
  userId: number;
  name: string;
}

export interface StandingsRules {
  scoring: LeagueScoring;
  norma: number;
  rankBy: LeagueRankBy;
}

export interface StandingRow {
  userId: number;
  name: string;
  matches: number;
  points: number; // bodovi po mestu, ili zbir rezultata
  avg: number;
  result: number; // zbir rezultata (plus je dobro)
  wins: number;
  meetsNorma: boolean;
}

/** Izjednačeni dele bodove mesta koja zajedno zauzimaju (npr. dvojica prva kod 10-5-1 → po 7.5). */
export function placePoints(scores: number[], points: number[]): number[] {
  const order = scores.map((_, i) => i).sort((a, b) => scores[b]! - scores[a]!);
  const out = scores.map(() => 0);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && scores[order[j + 1]!] === scores[order[i]!]) j++;
    const share = points.slice(i, j + 1).reduce((s, p) => s + p, 0) / (j - i + 1);
    for (let k = i; k <= j; k++) out[order[k]!] = share;
    i = j + 1;
  }
  return out;
}

/**
 * Samo partije u kojima su SVI igrači članovi lige (bez računara) ulaze u tabelu.
 * Igrači ispod norme idu na dno.
 */
export function computeStandings(
  members: LeagueMemberRef[],
  matches: LeagueMatch[],
  rules: StandingsRules,
): StandingRow[] {
  const rows = new Map<number, StandingRow>();
  for (const m of members) {
    rows.set(m.userId, { userId: m.userId, name: m.name, matches: 0, points: 0, avg: 0, result: 0, wins: 0, meetsNorma: false });
  }
  for (const m of matches) {
    const n = m.scores.length;
    const table = PLACE_POINTS[n];
    if (!table || m.userIds.length !== n || m.userIds.some(u => u === null || !rows.has(u))) continue;
    if (new Set(m.userIds).size !== n) continue;
    const mean = m.scores.reduce((s, x) => s + x, 0) / n;
    const pts = placePoints(m.scores, table);
    const best = Math.max(...m.scores);
    const soleWinner = m.scores.filter(s => s === best).length === 1;
    m.userIds.forEach((u, seat) => {
      const r = rows.get(u!)!;
      const res = m.scores[seat]! - mean;
      r.matches++;
      r.result += res;
      r.points += rules.scoring === 'places' ? pts[seat]! : res;
      if (soleWinner && m.scores[seat] === best) r.wins++;
    });
  }
  const out = [...rows.values()].map(r => ({
    ...r,
    avg: r.matches ? Math.round((r.points / r.matches) * 100) / 100 : 0,
    points: Math.round(r.points * 10) / 10,
    result: Math.round(r.result),
    meetsNorma: r.matches >= rules.norma,
  }));
  const key = (r: StandingRow) => (rules.rankBy === 'avg' ? r.avg : r.points);
  return out.sort((a, b) =>
    Number(b.meetsNorma) - Number(a.meetsNorma) || key(b) - key(a) || b.result - a.result || b.matches - a.matches);
}
