// Potez kao podatak (isti oblik koji vraća AI): klijent protiv računara, online server i AI
// primenjuju poteze na isti način, a server tako proverava i sve što stigne od klijenta.

import type { Card, CardId } from './types.js';
import type { AiAction } from './ai.js';
import { RemiError } from './game.js';
import type { RemiGame } from './game.js';

export type Action = AiAction;

const isIds = (x: unknown): x is CardId[] =>
  Array.isArray(x) && x.length <= 30 && x.every(id => typeof id === 'string');

/** Proveri oblik poteza koji je stigao spolja (npr. sa mreže). */
export function parseAction(raw: unknown): Action | null {
  const a = raw as Record<string, unknown> | null;
  if (!a || typeof a.type !== 'string') return null;
  switch (a.type) {
    case 'draw': case 'take': case 'return': return { type: a.type };
    case 'meld': return Array.isArray(a.groups) && a.groups.length <= 6 && a.groups.every(isIds) ? { type: 'meld', groups: a.groups } : null;
    case 'layoff': return typeof a.meldId === 'number' && isIds(a.cardIds) ? { type: 'layoff', meldId: a.meldId, cardIds: a.cardIds } : null;
    case 'swap': return typeof a.meldId === 'number' && typeof a.cardId === 'string' ? { type: 'swap', meldId: a.meldId, cardId: a.cardId } : null;
    case 'discard': return typeof a.cardId === 'string' ? { type: 'discard', cardId: a.cardId } : null;
    default: return null;
  }
}

/** Primeni potez igrača p. Vraća uzetu kartu (vučenje, uzimanje, džoker) ili null. Baca RemiError. */
export function applyAction(game: RemiGame, p: number, a: Action): Card | null {
  switch (a.type) {
    case 'draw': return game.drawStock(p);
    case 'take': return game.takeDiscard(p);
    case 'return': game.returnDiscard(p); return null;
    case 'meld': game.meld(p, a.groups); return null;
    case 'layoff': game.layoff(p, a.meldId, a.cardIds); return null;
    case 'swap': return game.swapJoker(p, a.meldId, a.cardId);
    case 'discard': game.discard(p, a.cardId); return null;
    default: throw new RemiError('Nepoznat potez');
  }
}
