// SVI TIPOVI za Remi engine — ništa sem tipova.

export type Suit = '♠' | '♥' | '♦' | '♣';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

/** Dva špila: id = rank + slovo boje + broj špila ("7H1", "7H2"); džokeri "JK1".."JK4". */
export type CardId = string;

export interface Card {
  id: CardId;
  /** null za džokera */
  rank: Rank | null;
  suit: Suit | null;
  joker: boolean;
}

/** Karta u kombinaciji na stolu, sa onim što predstavlja (bitno za džokera). */
export interface MeldCard {
  card: Card;
  rank: Rank;
  suit: Suit;
}

export type MeldKind = 'set' | 'run';

export interface Meld {
  id: number;
  /** Ko je spustio kombinaciju (samo za prikaz — dopisivati može svako otvoren). */
  owner: number;
  kind: MeldKind;
  /** Niz: poređano od najniže ka najvišoj. Komplet: redom kako je spušteno. */
  cards: MeldCard[];
}

export interface RemiOptions {
  /** 2–4 igrača. */
  players?: number;
  seed?: number;
  /** Koliko poena mora da ima otvaranje. */
  openingPoints?: number;
  /** Meč se završava kad neko dostigne ovoliko (pobeđuje najmanji zbir). */
  targetScore?: number;
}

export type Phase = 'DRAW' | 'PLAY' | 'DEAL_END' | 'MATCH_END';

export interface DealResult {
  dealNo: number;
  winner: number | null;
  /** Pobednik je otvorio i završio u istom potezu ("remi iz ruke"). */
  handRemi: boolean;
  points: number[];
}

export interface RemiState {
  phase: Phase;
  playerCount: number;
  dealNo: number;
  dealer: number;
  turn: number;
  hands: Card[][];
  stock: Card[];
  /** Gomila odbačenih — poslednja je na vrhu. */
  discard: Card[];
  melds: Meld[];
  nextMeldId: number;
  opened: boolean[];
  /** Karta uzeta sa gomile u ovom potezu (pre otvaranja mora da uđe u otvaranje). */
  tookDiscard: CardId | null;
  /** Karta uzeta sa gomile u ovom potezu (ne sme odmah nazad na gomilu). */
  takenCard: CardId | null;
  /** Da li je igrač bio otvoren na početku ovog poteza (za "remi iz ruke"). */
  openedAtTurnStart: boolean;
  scores: number[];
  history: DealResult[];
  winners: number[];
  lastAction: string | null;
  /** Javno: šta je koji igrač u ovoj partiji uzeo sa gomile / odbacio. */
  pickups: CardId[][];
  discardsBy: CardId[][];
}

export interface PlayerView {
  me: number;
  phase: Phase;
  playerCount: number;
  dealNo: number;
  dealer: number;
  turn: number;
  hand: Card[];
  handCounts: number[];
  stockCount: number;
  discard: Card[];
  melds: Meld[];
  opened: boolean[];
  tookDiscard: CardId | null;
  takenCard: CardId | null;
  openedAtTurnStart: boolean;
  scores: number[];
  history: DealResult[];
  winners: number[];
  lastAction: string | null;
  openingPoints: number;
  pickups: CardId[][];
  discardsBy: CardId[][];
}
