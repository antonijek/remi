// Moja ruka: sortirana, preklopljena da stane u širinu, sa izborom karata.

import { sortByRank, sortBySuit } from '../engine/dist/index.js';
import { cardEl } from './cards.js';
import { ME } from './seats.js';

/** Stvarna širina karte u ruci (zavisi od veličine ekrana preko --card-w). */
function cardWidth() {
  const el = cardEl({ id: 'AS1', rank: 'A', suit: '♠', joker: false });
  el.style.cssText = 'position:absolute;visibility:hidden';
  document.body.append(el);
  const w = el.getBoundingClientRect().width;
  el.remove();
  return w;
}

export function renderHand(v, ui, on) {
  const hand = document.getElementById('myHand');
  const inStaged = new Set(ui.staged.flat());
  const sorted = (ui.sortMode === 'suit' ? sortBySuit : sortByRank)(v.hand).filter(c => !inStaged.has(c.id));
  const canSelect = v.turn === ME && v.phase === 'PLAY' && !ui.locked;
  hand.classList.toggle('locked', !canSelect);
  // preklapanje prema broju karata: ruka mora da stane u raspoloživu širinu
  const w = cardWidth();
  // na širokom ekranu levo je savet, desno dugmad — ruka dobija sredinu
  const avail = Math.min(window.innerWidth - 24, 1100) - (window.innerWidth > 760 ? 420 : 0);
  const step = sorted.length > 1 ? Math.min(w * 0.62, (avail - w) / (sorted.length - 1)) : w;
  hand.style.setProperty('--ml', `${Math.min(0, step - w).toFixed(1)}px`);
  hand.replaceChildren(...sorted.map(c => {
    const el = cardEl(c);
    el.classList.toggle('sel', ui.selected.has(c.id));
    el.classList.toggle('fresh', c.id === ui.freshId);
    el.addEventListener('click', () => { if (canSelect) on.toggle(c.id); });
    return el;
  }));
}
