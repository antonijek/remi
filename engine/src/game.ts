// Game klasa — partije i meč Remija 51.
//
// Tok poteza: DRAW (vuci sa špila ILI uzmi gornju kartu sa gomile) → PLAY
// (spuštanje/dopisivanje/zamena džokera, po želji) → odbacivanje jedne karte.
// Igrač posle delioca dobija 15 karata i počinje odmah odbacivanjem (bez vučenja).

import type { Card, CardId, DealResult, Meld, PlayerView, RemiOptions, RemiState } from './types.js';
import { createDeck, makeRng, penaltyPoints, shuffle, sortBySuit } from './cards.js';
import { buildMeld, extendMeld, meldPoints, swapJoker } from './melds.js';

export const HAND_SIZE = 14;
export const WIN_POINTS = -40;
// −140 i ostalima duplo: zoki.com i mycity.rs (forestrummy navodi −80 — manjina)
export const HAND_REMI_POINTS = -140;
export const UNOPENED_POINTS = 100;

export class RemiError extends Error {}

/**
 * Koje karte smeju da se odbace. Pravila: džoker se ne odbacuje, a karta upravo
 * uzeta sa gomile ne vraća se odmah — ALI ako drugog izbora nema (npr. u ruci su
 * samo uzeta karta i džoker), dozvoljava se ono što mora, da igra ne stane.
 */
export function legalDiscards(hand: readonly Card[], takenCard: CardId | null): Card[] {
  const naturals = hand.filter(c => !c.joker);
  const preferred = naturals.filter(c => c.id !== takenCard);
  if (preferred.length) return preferred;
  if (naturals.length) return naturals;
  return hand.slice();
}

export class RemiGame {
  private state: RemiState;
  private readonly rng: () => number;
  readonly openingPoints: number;
  readonly targetScore: number;

  constructor(opts: RemiOptions = {}) {
    const n = opts.players ?? 4;
    if (n < 2 || n > 4) throw new RemiError('Remi se ovde igra u 2–4 igrača');
    this.rng = makeRng(opts.seed);
    this.openingPoints = opts.openingPoints ?? 51;
    this.targetScore = opts.targetScore ?? 501;
    this.state = {
      phase: 'DRAW',
      playerCount: n,
      dealNo: 0,
      dealer: n - 1,
      turn: 0,
      hands: Array.from({ length: n }, () => []),
      stock: [],
      discard: [],
      melds: [],
      nextMeldId: 1,
      opened: Array(n).fill(false),
      tookDiscard: null,
      takenCard: null,
      openedAtTurnStart: false,
      scores: Array(n).fill(0),
      history: [],
      winners: [],
      lastAction: null,
      pickups: Array.from({ length: n }, () => []),
      discardsBy: Array.from({ length: n }, () => []),
    };
    this.startDeal(true);
  }

  static fromState(state: RemiState, opts: RemiOptions = {}): RemiGame {
    const g = new RemiGame({ ...opts, players: state.playerCount });
    g.state = structuredClone(state);
    g.state.pickups ??= Array.from({ length: state.playerCount }, () => []);
    g.state.discardsBy ??= Array.from({ length: state.playerCount }, () => []);
    return g;
  }

  getState(): RemiState {
    return structuredClone(this.state);
  }

  getPlayerView(me: number): PlayerView {
    const s = this.state;
    return structuredClone({
      me,
      phase: s.phase,
      playerCount: s.playerCount,
      dealNo: s.dealNo,
      dealer: s.dealer,
      turn: s.turn,
      hand: s.hands[me],
      handCounts: s.hands.map(h => h.length),
      stockCount: s.stock.length,
      discard: s.discard,
      melds: s.melds,
      opened: s.opened,
      tookDiscard: s.turn === me ? s.tookDiscard : null,
      takenCard: s.takenCard,
      openedAtTurnStart: s.openedAtTurnStart,
      scores: s.scores,
      history: s.history,
      winners: s.winners,
      lastAction: s.lastAction,
      openingPoints: this.openingPoints,
      pickups: s.pickups,
      discardsBy: s.discardsBy,
    });
  }

  // ---------------------------------------------------------------- vučenje

  /** Vuci sa špila. Vraća null ako karata više nema nigde (partija se tada završava bez pobednika). */
  drawStock(p: number): Card | null {
    this.expect(p, 'DRAW');
    const s = this.state;
    if (s.stock.length === 0) this.reshuffle();
    if (s.stock.length === 0) {
      this.endDeal(null, false);
      return null;
    }
    const card = s.stock.pop()!;
    s.hands[p].push(card);
    s.phase = 'PLAY';
    s.lastAction = `draw:${p}`;
    return structuredClone(card);
  }

  takeDiscard(p: number): Card {
    this.expect(p, 'DRAW');
    const s = this.state;
    const card = s.discard.pop();
    if (!card) throw new RemiError('Gomila je prazna');
    s.hands[p].push(card);
    // Pre otvaranja: uzeta karta MORA da uđe u otvaranje u ovom potezu.
    s.tookDiscard = s.opened[p] ? null : card.id;
    s.takenCard = card.id;
    s.pickups[p].push(card.id);
    s.phase = 'PLAY';
    s.lastAction = `take:${p}:${card.id}`;
    return structuredClone(card);
  }

  /** Vrati kartu uzetu sa gomile (ako ipak ne možete da otvorite). */
  returnDiscard(p: number): void {
    this.expect(p, 'PLAY');
    const s = this.state;
    if (!s.tookDiscard) throw new RemiError('Niste uzeli kartu sa gomile');
    const i = s.hands[p].findIndex(c => c.id === s.tookDiscard);
    if (i < 0) throw new RemiError('Uzeta karta je već iskorišćena');
    s.discard.push(s.hands[p].splice(i, 1)[0]);
    s.pickups[p].pop();
    s.tookDiscard = null;
    s.takenCard = null;
    s.phase = 'DRAW';
  }

  // ---------------------------------------------------------------- spuštanje

  /**
   * Spusti jednu ili više kombinacija. Pre otvaranja: zbir mora biti bar
   * openingPoints i sve se spušta odjednom (to je otvaranje).
   */
  meld(p: number, groups: CardId[][]): Meld[] {
    this.expect(p, 'PLAY');
    const s = this.state;
    if (!Array.isArray(groups) || groups.length === 0) throw new RemiError('Nema kombinacija');
    const hand = s.hands[p];
    const used = new Set<CardId>();
    const built = groups.map(ids => {
      if (!Array.isArray(ids)) throw new RemiError('Neispravna kombinacija');
      const cards = ids.map(id => {
        if (used.has(id)) throw new RemiError('Ista karta u dve kombinacije');
        used.add(id);
        const c = hand.find(x => x.id === id);
        if (!c) throw new RemiError('Te karte nema u ruci');
        return c;
      });
      const m = buildMeld(cards);
      if (!m) throw new RemiError('To nije ispravna kombinacija (niz ili komplet, najviše jedan džoker)');
      return m;
    });
    if (hand.length - used.size < 1) throw new RemiError('Mora vam ostati karta za odbacivanje');
    if (!s.opened[p]) {
      const total = built.reduce((sum, m) => sum + meldPoints(m), 0);
      if (total < this.openingPoints) throw new RemiError(`Za otvaranje treba ${this.openingPoints} poena (imate ${total})`);
      if (s.tookDiscard && !used.has(s.tookDiscard)) throw new RemiError('Karta uzeta sa gomile mora ući u otvaranje');
    }
    s.hands[p] = hand.filter(c => !used.has(c.id));
    const melds = built.map(m => ({ id: s.nextMeldId++, owner: p, kind: m.kind, cards: m.cards }));
    s.melds.push(...melds);
    if (!s.opened[p]) {
      s.opened[p] = true;
      s.tookDiscard = null;
    }
    s.lastAction = `meld:${p}`;
    return structuredClone(melds);
  }

  /** Dopiši karte na bilo koju kombinaciju na stolu (samo otvoren igrač). */
  layoff(p: number, meldId: number, cardIds: CardId[]): void {
    this.expect(p, 'PLAY');
    const s = this.state;
    if (!s.opened[p]) throw new RemiError('Dopisivati možete tek kad se otvorite');
    const meld = s.melds.find(m => m.id === meldId);
    if (!meld) throw new RemiError('Nema te kombinacije');
    if (!Array.isArray(cardIds) || cardIds.length === 0 || new Set(cardIds).size !== cardIds.length) throw new RemiError('Izaberite karte');
    const hand = s.hands[p];
    const cards = cardIds.map(id => {
      const c = hand.find(x => x.id === id);
      if (!c) throw new RemiError('Te karte nema u ruci');
      return c;
    });
    if (hand.length - cards.length < 1) throw new RemiError('Mora vam ostati karta za odbacivanje');
    const ext = extendMeld(meld, cards);
    if (!ext) throw new RemiError('Te karte ne idu na tu kombinaciju');
    meld.cards = ext.cards;
    s.hands[p] = hand.filter(c => !cardIds.includes(c.id));
    s.lastAction = `layoff:${p}:${meldId}`;
  }

  /** Zameni džokera sa stola pravom kartom; džoker ide u ruku. */
  swapJoker(p: number, meldId: number, cardId: CardId): Card {
    this.expect(p, 'PLAY');
    const s = this.state;
    if (!s.opened[p]) throw new RemiError('Džokera možete uzeti tek kad se otvorite');
    const meld = s.melds.find(m => m.id === meldId);
    if (!meld) throw new RemiError('Nema te kombinacije');
    const card = s.hands[p].find(c => c.id === cardId);
    if (!card) throw new RemiError('Te karte nema u ruci');
    const res = swapJoker(meld, card);
    if (!res) throw new RemiError('Ta karta ne menja džokera u toj kombinaciji');
    meld.cards = res.cards;
    s.hands[p] = s.hands[p].filter(c => c.id !== cardId);
    s.hands[p].push(res.joker);
    s.lastAction = `swap:${p}:${meldId}`;
    return structuredClone(res.joker);
  }

  // ---------------------------------------------------------------- odbacivanje

  discard(p: number, cardId: CardId): void {
    this.expect(p, 'PLAY');
    const s = this.state;
    if (s.tookDiscard && !s.opened[p]) {
      throw new RemiError('Kartu sa gomile ste uzeli za otvaranje — otvorite se ili je vratite');
    }
    const i = s.hands[p].findIndex(c => c.id === cardId);
    if (i < 0) throw new RemiError('Te karte nema u ruci');
    const card = s.hands[p][i];
    if (!legalDiscards(s.hands[p], s.takenCard).some(c => c.id === card.id)) {
      throw new RemiError(card.joker ? 'Džoker se ne odbacuje' : 'Karta uzeta sa gomile ne može odmah nazad');
    }
    s.hands[p].splice(i, 1);
    s.discard.push(card);
    s.discardsBy[p].push(card.id);
    s.lastAction = `discard:${p}:${card.id}`;
    if (s.hands[p].length === 0) {
      this.endDeal(p, !s.openedAtTurnStart);
      return;
    }
    this.nextTurn();
  }

  nextDeal(): void {
    if (this.state.phase !== 'DEAL_END') throw new RemiError('Partija još nije završena');
    this.startDeal(false);
  }

  // ---------------------------------------------------------------- interno

  private expect(p: number, phase: 'DRAW' | 'PLAY'): void {
    const s = this.state;
    if (s.phase === 'DEAL_END' || s.phase === 'MATCH_END') throw new RemiError('Partija nije u toku');
    if (s.turn !== p) throw new RemiError('Nije vaš red');
    if (s.phase !== phase) throw new RemiError(phase === 'DRAW' ? 'Već ste vukli kartu' : 'Prvo vucite kartu');
  }

  private startDeal(first: boolean): void {
    const s = this.state;
    const n = s.playerCount;
    s.dealNo++;
    if (!first) s.dealer = (s.dealer + 1) % n;
    else s.dealer = n - 1;
    const deck = shuffle(createDeck(), this.rng);
    const starter = (s.dealer + 1) % n;
    s.hands = Array.from({ length: n }, (_, p) => sortBySuit(deck.splice(0, p === starter ? HAND_SIZE + 1 : HAND_SIZE)));
    s.stock = deck;
    s.discard = [];
    s.melds = [];
    s.nextMeldId = 1;
    s.opened = Array(n).fill(false);
    s.tookDiscard = null;
    s.takenCard = null;
    s.pickups = Array.from({ length: n }, () => []);
    s.discardsBy = Array.from({ length: n }, () => []);
    s.turn = starter;
    s.openedAtTurnStart = false;
    // igrač sa 15 karata počinje odbacivanjem
    s.phase = 'PLAY';
    s.lastAction = null;
  }

  private nextTurn(): void {
    const s = this.state;
    s.turn = (s.turn + 1) % s.playerCount;
    s.tookDiscard = null;
    s.takenCard = null;
    s.openedAtTurnStart = s.opened[s.turn];
    s.phase = 'DRAW';
  }

  /** Špil prazan: gomila (bez gornje karte) se promeša u novi špil. */
  private reshuffle(): void {
    const s = this.state;
    if (s.discard.length <= 1) return;
    const top = s.discard.pop()!;
    s.stock = shuffle(s.discard, this.rng);
    s.discard = [top];
  }

  private endDeal(winner: number | null, handRemi: boolean): void {
    const s = this.state;
    const mult = handRemi ? 2 : 1;
    const points = s.hands.map((hand, p) => {
      if (p === winner) return handRemi ? HAND_REMI_POINTS : WIN_POINTS;
      if (!s.opened[p]) return UNOPENED_POINTS * mult;
      return hand.reduce((sum, c) => sum + penaltyPoints(c), 0) * mult;
    });
    points.forEach((pt, p) => { s.scores[p] += pt; });
    const result: DealResult = { dealNo: s.dealNo, winner, handRemi, points };
    s.history.push(result);
    s.tookDiscard = null;
    if (Math.max(...s.scores) >= this.targetScore) {
      const min = Math.min(...s.scores);
      s.winners = s.scores.map((sc, p) => (sc === min ? p : -1)).filter(p => p >= 0);
      s.phase = 'MATCH_END';
    } else {
      s.phase = 'DEAL_END';
    }
  }
}
