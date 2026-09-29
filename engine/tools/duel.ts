// Duel dva nivoa (npr. hard protiv medium), naizmenično raspoređeni.
// Pokretanje: node --import tsx tools/duel.ts 100 4 hard medium
import { RemiGame } from '../src/game.js';
import { chooseAction, type AiLevel } from '../src/ai.js';
import { makeRng } from '../src/cards.js';

const n = Number(process.argv[2] ?? 50);
const players = Number(process.argv[3] ?? 4);
const A = (process.argv[4] ?? 'hard') as AiLevel;
const B = (process.argv[5] ?? 'medium') as AiLevel;
let wa = 0, pa = 0, pb = 0;
for (let seed = 1; seed <= n; seed++) {
  const levels = Array.from({ length: players }, (_, p) => ((p + seed) % 2 ? A : B));
  const g = new RemiGame({ players, seed: 5000 + seed });
  const rng = makeRng(seed);
  while (g.getState().phase !== 'MATCH_END') {
    const s = g.getState();
    if (s.phase === 'DEAL_END') { g.nextDeal(); continue; }
    const p = s.turn;
    const a = chooseAction(g.getPlayerView(p), levels[p], rng);
    if (a.type === 'draw') g.drawStock(p);
    else if (a.type === 'take') g.takeDiscard(p);
    else if (a.type === 'return') g.returnDiscard(p);
    else if (a.type === 'meld') g.meld(p, a.groups);
    else if (a.type === 'layoff') g.layoff(p, a.meldId, a.cardIds);
    else if (a.type === 'swap') g.swapJoker(p, a.meldId, a.cardId);
    else g.discard(p, a.cardId);
  }
  const s = g.getState();
  const cntA = levels.filter(l => l === A).length;
  s.scores.forEach((sc, p) => { if (levels[p] === A) pa += sc / cntA; else pb += sc / (players - cntA); });
  for (const w of s.winners) if (levels[w] === A) wa += 1 / s.winners.length;
}
console.log(`${n} mečeva × ${players}: ${A} pobeda ${(100 * wa / n).toFixed(0)}%, prosek ${(pa / n).toFixed(0)}  |  ${B} prosek ${(pb / n).toFixed(0)}`);
