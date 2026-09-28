// AI turnir za Remi. Pokretanje: npm run sim -- 30 4 medium easy
import { RemiGame } from '../src/game.js';
import { chooseAction, type AiLevel } from '../src/ai.js';
import { makeRng } from '../src/cards.js';

const n = Number(process.argv[2] ?? 20);
const players = Number(process.argv[3] ?? 4);
const A = (process.argv[4] ?? 'medium') as AiLevel;
const B = (process.argv[5] ?? 'easy') as AiLevel;
const wins: Record<string, number> = { [A]: 0, [B]: 0 };
let deals = 0, turns = 0, handRemi = 0, noWinner = 0;
const t0 = Date.now();
for (let seed = 1; seed <= n; seed++) {
  const levels = Array.from({ length: players }, (_, p) => ((p + seed) % 2 ? A : B));
  const g = new RemiGame({ players, seed });
  const rng = makeRng(seed);
  while (g.getState().phase !== 'MATCH_END') {
    const s = g.getState();
    if (s.phase === 'DEAL_END') { g.nextDeal(); continue; }
    const p = s.turn;
    const a = chooseAction(g.getPlayerView(p), levels[p], rng);
    if (a.type === 'draw') { g.drawStock(p); turns++; }
    else if (a.type === 'take') { g.takeDiscard(p); turns++; }
    else if (a.type === 'return') g.returnDiscard(p);
    else if (a.type === 'meld') g.meld(p, a.groups);
    else if (a.type === 'layoff') g.layoff(p, a.meldId, a.cardIds);
    else if (a.type === 'swap') g.swapJoker(p, a.meldId, a.cardId);
    else g.discard(p, a.cardId);
  }
  const s = g.getState();
  for (const w of s.winners) wins[levels[w]] += 1 / s.winners.length;
  deals += s.history.length;
  handRemi += s.history.filter(h => h.handRemi).length;
  noWinner += s.history.filter(h => h.winner === null).length;
}
console.log(`${n} mečeva × ${players} igrača: ${A} ${(100 * wins[A] / n).toFixed(0)}% pobeda, ${B} ${(100 * wins[B] / n).toFixed(0)}%`);
console.log(`partija po meču ${(deals / n).toFixed(1)}, poteza po partiji ${(turns / deals).toFixed(1)}, remi iz ruke ${handRemi}, bez pobednika ${noWinner}`);
console.log(`${Date.now() - t0} ms`);
