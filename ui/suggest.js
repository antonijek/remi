// Pomoć čoveku: predlog poteza („Predlog“) i odluka da li karta dopisuje ili menja džokera.

import { bestMelds, chooseAction, swapJoker, extendMeld } from '../engine/dist/index.js';

/** Jedna karta koja menja džokera (a ne može da se dopiše) → zamena; inače dopisivanje. */
export function layoffAction(v, selectedIds, meldId) {
  const meld = v.melds.find(m => m.id === meldId);
  if (selectedIds.length === 1) {
    const c = v.hand.find(x => x.id === selectedIds[0]);
    if (c && swapJoker(meld, c) && !extendMeld(meld, [c])) return { type: 'swap', meldId, cardId: c.id };
  }
  return { type: 'layoff', meldId, cardIds: selectedIds };
}

/** Postavi predlog u ui (odabrane/spremne karte) i javi poruku. */
export function suggestMove(v, ui, me, toast) {
  if (!v.opened[me]) {
    const plan = bestMelds(v.hand, { mustInclude: v.tookDiscard });
    if (plan.points >= v.openingPoints) {
      ui.staged = plan.groups;
      ui.selected.clear();
      toast(`Možete da se otvorite sa ${plan.points} poena.`);
    } else {
      toast(plan.points ? `Najviše ${plan.points} poena — još nije dovoljno za otvaranje.` : 'Nema kombinacija u ruci.');
      const a = chooseAction(v, 'hard');
      if (a.type === 'discard') ui.selected = new Set([a.cardId]);
    }
    return;
  }
  const a = chooseAction(v, 'hard');
  ui.selected = new Set(a.type === 'meld' ? a.groups[0] : a.type === 'layoff' ? a.cardIds
    : a.type === 'swap' || a.type === 'discard' ? [a.cardId] : []);
  const msg = { meld: 'Predlog: spustite ovu kombinaciju.', layoff: 'Predlog: dopišite ovu kartu na sto.',
    swap: 'Predlog: ovom kartom uzmite džokera sa stola.', discard: 'Predlog: odbacite ovu kartu.' }[a.type];
  if (msg) toast(msg);
}
