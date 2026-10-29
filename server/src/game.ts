// Sve što server zna o samoj igri (Remi). Sobe, socket-i i rejting su isti kao u Tabliću —
// razlikuje se samo ovaj fajl.

import { RemiGame, RemiError, applyAction as applyRemi, parseAction, chooseAction } from '../../engine/dist/index.js';
import type { PlayerView, RemiState } from '../../engine/dist/index.js';

export type Game = RemiGame;
export type GameState = RemiState;
export type View = PlayerView;
export type Phase = 'PLAYING' | 'DEAL_END' | 'MATCH_END';
export type PlayerCount = 2 | 3 | 4;

export const PLAYER_COUNTS: readonly PlayerCount[] = [2, 3, 4];
export const isPlayerCount = (n: unknown): n is PlayerCount => PLAYER_COUNTS.includes(n as PlayerCount);

export const newGame = (players: PlayerCount): Game => new RemiGame({ players });
export const restoreGame = (state: GameState): Game => RemiGame.fromState(state);

export function phase(g: Game): Phase {
  const p = g.getState().phase;
  return p === 'DRAW' || p === 'PLAY' ? 'PLAYING' : p;
}
export const turn = (g: Game): number => g.getState().turn;
export const viewFor = (g: Game, seat: number): View => g.getPlayerView(seat);
// u Remiju svako igra za sebe
export const sideOf = (_g: Game, seat: number): number => seat;
// manje poena je bolje — rejting očekuje „više je bolje“, pa se poeni okreću
export const sideScores = (g: Game): number[] => g.getState().scores.map(s => -s);
export const history = (g: Game): unknown => g.getState().history;
export const nextDeal = (g: Game): void => g.nextDeal();

/** Odigraj potez iz klijenta. Vraća poruku greške za igrača ili null ako je potez prošao. */
export function applyAction(g: Game, seat: number, raw: unknown): string | null {
  const action = parseAction(raw);
  if (!action) return 'Neispravan potez.';
  try {
    applyRemi(g, seat, action);
    return null;
  } catch (e) {
    if (e instanceof RemiError) return e.message;
    throw e;
  }
}

/** Ceo potez računara (vučenje, kombinacije, odbacivanje) — isti najjači AI kao protiv računara. */
export function playAi(g: Game, seat: number): void {
  for (let guard = 0; guard < 40; guard++) {
    const s = g.getState();
    if (s.turn !== seat || (s.phase !== 'DRAW' && s.phase !== 'PLAY')) return;
    const a = chooseAction(g.getPlayerView(seat), 'hard');
    try {
      applyRemi(g, seat, a);
    } catch (e) {
      // AI ne bi smeo da pogreši — ako ipak, vuče ili odbaci bilo šta, da igra ne stane
      console.error('[ai] potez odbijen', a, e);
      if (s.phase === 'DRAW') g.drawStock(seat);
      else {
        const card = s.hands[seat].find(c => !c.joker) ?? s.hands[seat][0];
        g.discard(seat, card.id);
      }
    }
  }
}
