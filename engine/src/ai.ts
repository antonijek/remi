// AI za Remi — radi SAMO nad PlayerView.
//
// Srce je bestMelds(): od karata u ruci nađe skup disjunktnih kombinacija
// (nizova i kompleta, najviše jedan džoker po kombinaciji) sa najviše poena.
// Na tome se grade sve odluke:
//  - vučenje: uzmi sa gomile ako ta karta pomaže (otvaranje / nova kombinacija
//    / dopisivanje), inače sa špila;
//  - otvaranje čim kombinacije vrede ≥ 51;
//  - posle otvaranja: zameni džokere sa stola, spusti sve kombinacije, dopiši;
//  - odbacivanje: karta koja najmanje "obećava" (nema par/suseda), a među
//    takvima najskuplja (manje kazne ako neko drugi završi).

import type { Card, CardId, Meld, PlayerView, Suit } from './types.js';
import { rankNumber, penaltyPoints, SUITS, RANKS } from './cards.js';
import { buildMeld, extendMeld, meldPoints, swapJoker } from './melds.js';
import { legalDiscards } from './game.js';

export type AiLevel = 'easy' | 'medium' | 'hard';

export type AiAction =
  | { type: 'draw' }
  | { type: 'take' }
  | { type: 'return' }
  | { type: 'meld'; groups: CardId[][] }
  | { type: 'layoff'; meldId: number; cardIds: CardId[] }
  | { type: 'swap'; meldId: number; cardId: CardId }
  | { type: 'discard'; cardId: CardId };

// ================================================================ kombinacije u ruci

interface Candidate {
  ids: CardId[];
  points: number;
}

/** Sve moguće kombinacije od karata iz ruke (svaka sa konkretnim kartama). */
export function candidateMelds(hand: readonly Card[]): Candidate[] {
  const out: Candidate[] = [];
  const jokers = hand.filter(c => c.joker);
  const joker = jokers[0];
  const add = (cards: Card[]) => {
    const m = buildMeld(cards);
    if (m) out.push({ ids: cards.map(c => c.id), points: meldPoints(m) });
  };

  // kompleti: po rangu, najviše jedna karta po boji
  for (const rank of RANKS) {
    const bySuit = new Map<Suit, Card>();
    for (const c of hand) if (!c.joker && c.rank === rank && !bySuit.has(c.suit!)) bySuit.set(c.suit!, c);
    const cards = [...bySuit.values()];
    const subsets = (k: number) => combos(cards, k);
    for (const k of [3, 4]) for (const sub of subsets(k)) add(sub);
    if (joker) for (const k of [2, 3]) for (const sub of subsets(k)) add([...sub, joker]);
  }

  // nizovi: po boji, prozori uzastopnih rangova (kec nisko ili visoko)
  for (const suit of SUITS) {
    const byNum = new Map<number, Card>();
    for (const c of hand) {
      if (c.joker || c.suit !== suit) continue;
      const n = rankNumber(c.rank!);
      if (!byNum.has(n)) byNum.set(n, c);
      if (c.rank === 'A' && !byNum.has(14)) byNum.set(14, c);
    }
    for (let lo = 1; lo <= 12; lo++) {
      const cards: Card[] = [];
      let missing = 0;
      for (let hi = lo; hi <= 14; hi++) {
        if (lo === 1 && hi === 14) break;
        const c = byNum.get(hi);
        if (c) cards.push(c);
        else missing++;
        if (missing > (joker ? 1 : 0)) break;
        const len = hi - lo + 1;
        if (len < 3) continue;
        if (!byNum.has(lo) || !byNum.has(hi)) continue; // krajevi prirodni (džoker samo u rupi)
        if (missing === 0) add(cards.slice());
        else add([...cards, joker!]);
      }
      // niz od 2 prirodne + džoker na kraju
      if (joker) {
        const a = byNum.get(lo);
        const b = byNum.get(lo + 1);
        if (a && b && a !== b) add([a, b, joker]);
      }
    }
  }
  // ukloni duplikate (isti skup karata)
  const seen = new Set<string>();
  return out.filter(c => {
    const key = c.ids.slice().sort().join(',');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function combos<T>(arr: T[], k: number): T[][] {
  if (k > arr.length) return [];
  if (k === 0) return [[]];
  const [first, ...rest] = arr;
  return [...combos(rest, k - 1).map(c => [first, ...c]), ...combos(rest, k)];
}

export interface MeldPlan {
  groups: CardId[][];
  points: number;
  cards: number;
}

/**
 * Najbolji skup disjunktnih kombinacija (najviše poena; kod izjednačenja
 * više karata). Uvek ostavlja bar `keep` karata u ruci (za odbacivanje).
 */
export function bestMelds(hand: readonly Card[], opts: { keep?: number; mustInclude?: CardId | null } = {}): MeldPlan {
  const keep = opts.keep ?? 1;
  const cands = candidateMelds(hand).sort((a, b) => b.points - a.points);
  const maxCards = hand.length - keep;
  let best: MeldPlan = { groups: [], points: 0, cards: 0 };
  let nodes = 0;
  const used = new Set<CardId>();
  const chosen: Candidate[] = [];

  const better = (pts: number, cnt: number) => pts > best.points || (pts === best.points && cnt > best.cards);
  const dfs = (start: number, pts: number, cnt: number) => {
    if (++nodes > 30000) return;
    const valid = !opts.mustInclude || used.has(opts.mustInclude);
    if (valid && better(pts, cnt)) best = { groups: chosen.map(c => c.ids), points: pts, cards: cnt };
    for (let i = start; i < cands.length; i++) {
      const c = cands[i];
      if (cnt + c.ids.length > maxCards) continue;
      if (c.ids.some(id => used.has(id))) continue;
      c.ids.forEach(id => used.add(id));
      chosen.push(c);
      dfs(i + 1, pts + c.points, cnt + c.ids.length);
      chosen.pop();
      c.ids.forEach(id => used.delete(id));
    }
  };
  dfs(0, 0, 0);
  return best;
}

// ================================================================ odluke

export function chooseAction(view: PlayerView, level: AiLevel = 'medium', rng: () => number = Math.random): AiAction {
  const me = view.me;
  const hand = view.hand;
  const opened = view.opened[me];

  if (view.phase === 'DRAW') {
    const top = view.discard.at(-1);
    if (top && level !== 'easy' && wantsDiscard(view, top, level)) return { type: 'take' };
    return { type: 'draw' };
  }

  // ---- PLAY
  if (!opened) {
    const plan = bestMelds(hand, { mustInclude: view.tookDiscard });
    if (plan.points >= view.openingPoints) return { type: 'meld', groups: plan.groups };
    if (view.tookDiscard) return { type: 'return' };
    return { type: 'discard', cardId: chooseDiscard(view, level, rng) };
  }

  if (hand.length > 1) {
    // 1) džoker sa stola
    for (const m of view.melds) {
      if (!m.cards.some(mc => mc.card.joker)) continue;
      for (const c of hand) if (!c.joker && swapJoker(m, c)) return { type: 'swap', meldId: m.id, cardId: c.id };
    }
    // 2) nove kombinacije iz ruke
    const plan = bestMelds(hand);
    if (plan.groups.length) return { type: 'meld', groups: plan.groups };
    // 3) dopisivanje (prvo prirodne karte, džoker samo ako završava igru)
    const lay = findLayoff(view.melds, hand);
    if (lay) return { type: 'layoff', meldId: lay.meldId, cardIds: [lay.cardId] };
  }
  return { type: 'discard', cardId: chooseDiscard(view, level, rng) };
}

function findLayoff(melds: Meld[], hand: Card[]): { meldId: number; cardId: CardId } | null {
  if (hand.length <= 1) return null;
  const naturals = hand.filter(c => !c.joker);
  const order = hand.length === 2 ? hand : naturals; // džokera dopiši samo ako posle ostaje jedna karta
  for (const c of order) for (const m of melds) if (extendMeld(m, [c])) return { meldId: m.id, cardId: c.id };
  return null;
}

/** Da li vredi uzeti gornju kartu sa gomile. */
function wantsDiscard(view: PlayerView, top: Card, level: AiLevel = 'medium'): boolean {
  const hand = view.hand;
  // džoker se uvek isplati — ali pre otvaranja samo ako se sa njim odmah otvaram
  if (top.joker && (view.opened[view.me] || level !== 'hard')) return true;
  const withTop = [...hand, top];
  if (!view.opened[view.me]) {
    // uzmi samo ako sa njom mogu da se otvorim (i ona ulazi u otvaranje)
    const plan = bestMelds(withTop, { mustInclude: top.id });
    return plan.points >= view.openingPoints;
  }
  // otvoren: pomaže ako ide na sto ili pravi novu kombinaciju u ruci
  if (view.melds.some(m => extendMeld(m, [top]))) return true;
  const before = bestMelds(hand, { keep: 0 });
  const after = bestMelds(withTop, { keep: 0 });
  return after.cards > before.cards + 1;
}

/** Karta za odbacivanje: najmanje obećava, a među takvima najskuplja. */
export function chooseDiscard(view: PlayerView, level: AiLevel, rng: () => number): CardId {
  const hand = view.hand;
  const pool = legalDiscards(hand, view.takenCard);
  if (level === 'easy') return pool[Math.floor(rng() * pool.length)].id;

  // karte u najboljim kombinacijama se čuvaju
  const plan = bestMelds(hand, { keep: 0 });
  const inMeld = new Set(plan.groups.flat());
  const opened = view.opened[view.me];
  const n = view.playerCount;
  const next = (view.me + 1) % n;
  // koliko je najbliži protivnik blizu kraja (manje karata = veća opasnost)
  const minOpp = Math.min(...view.handCounts.filter((_, p) => p !== view.me));
  let best = pool[0];
  let bestScore = Infinity;
  for (const c of pool) {
    let score = inMeld.has(c.id) ? 1000 : 0;
    score += promise(c, hand) * 12;
    if (level === 'hard') {
      if (!opened) {
        // Pre otvaranja kazna je fiksnih 100 — visoke karte su dragocene za 51,
        // pa se odbacuju NISKE beskorisne karte.
        score += penaltyPoints(c) * 0.6;
      } else {
        // Otvoren: rešavaj se skupih karata, jače kad je neko blizu kraja.
        score -= penaltyPoints(c) * (minOpp <= 3 ? 2.5 : 1.2);
      }
      // sledeći igrač bi je dopisao / uzeo za svoju kombinaciju
      if (view.melds.some(m => extendMeld(m, [c]))) score += view.opened[next] ? 40 : 15;
    } else {
      score -= penaltyPoints(c);
      if (view.melds.some(m => extendMeld(m, [c]))) score += 15;
    }
    if (score < bestScore) { bestScore = score; best = c; }
  }
  return best.id;
}

/** Koliko karta "obećava": parovi istog ranga i susedi iste boje. */
function promise(card: Card, hand: readonly Card[]): number {
  if (card.joker) return 99;
  let p = 0;
  const n = rankNumber(card.rank!);
  for (const o of hand) {
    if (o.id === card.id || o.joker) continue;
    if (o.rank === card.rank && o.suit !== card.suit) p += 1;
    if (o.suit === card.suit) {
      const d = Math.min(Math.abs(rankNumber(o.rank!) - n), card.rank === 'A' || o.rank === 'A' ? Math.abs(rankNumber(o.rank!, true) - rankNumber(card.rank!, true)) : 99);
      if (d === 1) p += 1;
      else if (d === 2) p += 0.5;
    }
  }
  return p;
}
