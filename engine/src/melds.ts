// Provera kombinacija i njihova vrednost.
//
// - Komplet: 3–4 karte istog ranga, sve različite boje.
// - Niz: 3+ karte iste boje redom; kec je 1 (A-2-3) ili 14 (Q-K-A), ne oba (nema K-A-2).
// - Najviše JEDAN džoker u kombinaciji; džoker preuzima rang/boju karte koju menja.

import type { Card, Meld, MeldCard, MeldKind, Rank, Suit } from './types.js';
import { rankFromNumber, rankNumber, rankPoints, SUITS } from './cards.js';

export const MAX_JOKERS_PER_MELD = 1;

/** Pokušaj da od karata napraviš kombinaciju; null ako nije validna. */
export function buildMeld(cards: readonly Card[]): { kind: MeldKind; cards: MeldCard[] } | null {
  if (cards.length < 3) return null;
  const jokers = cards.filter(c => c.joker);
  if (jokers.length > MAX_JOKERS_PER_MELD) return null;
  return buildSet(cards) ?? buildRun(cards);
}

function buildSet(cards: readonly Card[]): { kind: MeldKind; cards: MeldCard[] } | null {
  if (cards.length > 4) return null;
  const naturals = cards.filter(c => !c.joker);
  if (naturals.length === 0) return null;
  const rank = naturals[0].rank!;
  if (!naturals.every(c => c.rank === rank)) return null;
  const suits = new Set(naturals.map(c => c.suit!));
  if (suits.size !== naturals.length) return null; // dve iste boje (iz dva špila) — ne može u komplet
  const free = SUITS.filter(s => !suits.has(s));
  let fi = 0;
  return {
    kind: 'set',
    cards: cards.map(c => (c.joker ? { card: c, rank, suit: free[fi++] } : { card: c, rank, suit: c.suit! })),
  };
}

function buildRun(cards: readonly Card[]): { kind: MeldKind; cards: MeldCard[] } | null {
  const naturals = cards.filter(c => !c.joker);
  const jokers = cards.filter(c => c.joker);
  if (naturals.length === 0) return null;
  const suit = naturals[0].suit!;
  if (!naturals.every(c => c.suit === suit)) return null;
  // probaj kec nisko, pa kec visoko
  for (const aceHigh of [false, true]) {
    const nums = naturals.map(c => rankNumber(c.rank!, aceHigh)).sort((a, b) => a - b);
    if (new Set(nums).size !== nums.length) continue;
    const min = nums[0];
    const max = nums[nums.length - 1];
    const gaps = max - min + 1 - nums.length;
    if (gaps > jokers.length) continue;
    let extra = jokers.length - gaps;
    let lo = min;
    let hi = max;
    // Granice: pravi kec kao 1 → niz ne sme do 14 (nema K-A-2), i obrnuto.
    const hasAce = naturals.some(c => c.rank === 'A');
    const hiMax = hasAce && !aceHigh ? 13 : 14;
    const loMin = hasAce && aceHigh ? 2 : 1;
    // višak džokera na krajeve: prvo naviše, pa naniže (i nikad 1 i 14 zajedno)
    while (extra > 0 && hi < hiMax && !(lo === 1 && hi + 1 === 14)) { hi++; extra--; }
    while (extra > 0 && lo > loMin && !(hi === 14 && lo - 1 === 1)) { lo--; extra--; }
    if (extra > 0) continue;
    const byNum = new Map<number, Card>();
    for (const c of naturals) byNum.set(rankNumber(c.rank!, aceHigh), c);
    const js = jokers.slice();
    const out: MeldCard[] = [];
    for (let n = lo; n <= hi; n++) {
      const nat = byNum.get(n);
      const card = nat ?? js.shift()!;
      out.push({ card, rank: rankFromNumber(n), suit });
    }
    if (out.length < 3) continue;
    return { kind: 'run', cards: out };
  }
  return null;
}

/** Vrednost kombinacije za otvaranje (džoker vredi kao karta koju menja). */
export function meldPoints(m: { kind: MeldKind; cards: MeldCard[] }): number {
  if (m.kind === 'set') return m.cards.reduce((s, mc) => s + rankPoints(mc.rank), 0);
  // u nizu je kec 1 ako je na početku (A-2-3), inače 10
  return m.cards.reduce((s, mc, i) => s + rankPoints(mc.rank, mc.rank === 'A' && i === 0), 0);
}

/** Da li se karte mogu dodati na postojeću kombinaciju (vraća novu verziju ili null). */
export function extendMeld(meld: Meld, add: readonly Card[]): { kind: MeldKind; cards: MeldCard[] } | null {
  const all = [...meld.cards.map(mc => mc.card), ...add];
  const built = buildMeld(all);
  if (!built || built.kind !== meld.kind) return null;
  return built;
}

/**
 * Zamena džokera: prava karta koju džoker predstavlja ide u kombinaciju,
 * džoker se vraća igraču. Vraća novu kombinaciju + džokera, ili null.
 */
export function swapJoker(meld: Meld, card: Card): { cards: MeldCard[]; joker: Card } | null {
  if (card.joker) return null;
  const idx = meld.cards.findIndex(mc => mc.card.joker);
  if (idx < 0) return null;
  const jmc = meld.cards[idx];
  if (meld.kind === 'run') {
    if (card.rank !== jmc.rank || card.suit !== jmc.suit) return null;
  } else {
    // u kompletu džoker menja bilo koju boju koja nedostaje
    if (card.rank !== jmc.rank) return null;
    if (meld.cards.some(mc => !mc.card.joker && mc.suit === card.suit)) return null;
  }
  const rebuilt = buildMeld(meld.cards.map((mc, i) => (i === idx ? card : mc.card)));
  if (!rebuilt) return null;
  return { cards: rebuilt.cards, joker: jmc.card };
}

export function describeMeld(m: { cards: MeldCard[] }): string {
  return m.cards.map(mc => (mc.card.joker ? `🃏(${mc.rank}${mc.suit})` : `${mc.rank}${mc.suit}`)).join(' ');
}

export type { Rank, Suit };
