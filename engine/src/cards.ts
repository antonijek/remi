// Dva špila + 4 džokera, mešanje, vrednosti.

import type { Card, Rank, Suit } from './types.js';

export const SUITS: readonly Suit[] = ['♠', '♥', '♦', '♣'];
export const RANKS: readonly Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const SUIT_LETTER: Record<Suit, string> = { '♠': 'S', '♥': 'H', '♦': 'D', '♣': 'C' };

export function makeCard(rank: Rank, suit: Suit, deck: number): Card {
  return { id: `${rank}${SUIT_LETTER[suit]}${deck}`, rank, suit, joker: false };
}

export function makeJoker(n: number): Card {
  return { id: `JK${n}`, rank: null, suit: null, joker: true };
}

/** "7H1", "AS2", "JK3" → karta (za testove). */
export function cardFromId(id: string): Card {
  if (id.startsWith('JK')) return makeJoker(Number(id.slice(2)));
  const deck = Number(id.slice(-1));
  const letter = id.slice(-2, -1);
  const rank = id.slice(0, -2) as Rank;
  const suit = SUITS.find(s => SUIT_LETTER[s] === letter);
  if (!suit || !RANKS.includes(rank)) throw new Error(`Nepoznata karta: ${id}`);
  return makeCard(rank, suit, deck);
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const d of [1, 2]) for (const suit of SUITS) for (const rank of RANKS) deck.push(makeCard(rank, suit, d));
  for (let j = 1; j <= 4; j++) deck.push(makeJoker(j));
  return deck;
}

/** Položaj u nizu: kec 1 (A-2-3) ili 14 (Q-K-A). */
export function rankNumber(rank: Rank, aceHigh = false): number {
  if (rank === 'A') return aceHigh ? 14 : 1;
  if (rank === 'J') return 11;
  if (rank === 'Q') return 12;
  if (rank === 'K') return 13;
  return Number(rank);
}

export function rankFromNumber(n: number): Rank {
  return n === 1 || n === 14 ? 'A' : n === 11 ? 'J' : n === 12 ? 'Q' : n === 13 ? 'K' : (String(n) as Rank);
}

/** Vrednost za otvaranje: 2–9 po broju, 10/J/Q/K/A = 10 (kec 1 u A-2-3). */
export function rankPoints(rank: Rank, aceLow = false): number {
  if (rank === 'A') return aceLow ? 1 : 10;
  const n = rankNumber(rank);
  return n >= 10 ? 10 : n;
}

/** Kazneni poeni karte koja ostane u ruci. Džoker 20. */
export function penaltyPoints(card: Card): number {
  return card.joker ? 20 : rankPoints(card.rank!);
}

export function makeRng(seed?: number): () => number {
  if (seed === undefined) return Math.random;
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Sortiranje ruke: po boji pa po rangu (džokeri na kraju). */
export function sortBySuit(cards: Card[]): Card[] {
  return cards.slice().sort((a, b) => {
    if (a.joker || b.joker) return Number(a.joker) - Number(b.joker);
    return SUITS.indexOf(a.suit!) - SUITS.indexOf(b.suit!) || rankNumber(a.rank!) - rankNumber(b.rank!);
  });
}

/** Sortiranje ruke: po rangu pa po boji (za komplete). */
export function sortByRank(cards: Card[]): Card[] {
  return cards.slice().sort((a, b) => {
    if (a.joker || b.joker) return Number(a.joker) - Number(b.joker);
    return rankNumber(a.rank!) - rankNumber(b.rank!) || SUITS.indexOf(a.suit!) - SUITS.indexOf(b.suit!);
  });
}
