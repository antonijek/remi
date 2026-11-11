// Potez računara u igri protiv računara.

import { applyAction, chooseAction } from '../engine/dist/index.js';
import { cardName } from './cards.js';
import { playerName } from './seats.js';

export function aiMove(game, p, toast) {
  const v = game.getPlayerView(p);
  const a = chooseAction(v, 'hard');
  const name = playerName(p);
  try {
    const card = applyAction(game, p, a);
    if (a.type === 'take') toast(`${name} uzima ${cardName(card)} sa gomile`);
    if (a.type === 'meld' && !v.opened[p]) toast(`${name} se otvorio!`);
    if (a.type === 'swap') toast(`${name} uzima džokera sa stola`);
  } catch (e) {
    // AI ne bi smeo da pogreši — ako ipak, vuče ili odbaci bilo šta, da igra ne stane
    console.error('AI potez odbijen', a, e);
    const hand = game.getState().hands[p];
    const fallback = hand.find(c => !c.joker) ?? hand[0];
    if (game.getState().phase === 'DRAW') game.drawStock(p);
    else if (fallback) game.discard(p, fallback.id);
  }
}
