// Sto: špil i gomila, spuštene kombinacije i kombinacije pripremljene za otvaranje.

import { buildMeld, meldPoints } from '../engine/dist/index.js';
import { backEl, cardEl, cardName } from './cards.js';
import { ME, playerName } from './seats.js';

const $ = id => document.getElementById(id);
const emptySlot = () => Object.assign(document.createElement('div'), { className: 'pile-empty' });

export const myDrawTurn = v => v.turn === ME && v.phase === 'DRAW';
export const pointsOf = cards => { const m = buildMeld(cards); return m ? meldPoints(m) : 0; };
export const stagedCards = (v, staged) => staged.map(ids => ids.map(id => v.hand.find(c => c.id === id)).filter(Boolean));
export const stagedPoints = (v, staged) => stagedCards(v, staged).reduce((s, cards) => s + pointsOf(cards), 0);

export function renderPiles(v, ui, on) {
  const canDraw = myDrawTurn(v) && !ui.locked;
  const stock = $('stock');
  stock.replaceChildren(v.stockCount ? backEl('pile') : emptySlot());
  stock.classList.toggle('clickable', canDraw);
  stock.onclick = canDraw ? on.draw : null;
  stock.title = canDraw ? 'Vuci kartu sa špila' : '';
  $('stockCount').textContent = `špil: ${v.stockCount}`;

  const top = v.discard.at(-1);
  const pile = $('discardPile');
  pile.replaceChildren(top ? cardEl(top, 'pile') : emptySlot());
  const canTake = canDraw && Boolean(top);
  pile.classList.toggle('clickable', canTake);
  pile.onclick = canTake ? on.take : null;
  pile.title = canTake ? `Uzmi ${cardName(top)} sa gomile` : '';
}

export function renderMelds(v, ui, on) {
  const box = $('melds');
  if (!v.melds.length) {
    const empty = Object.assign(document.createElement('span'), { className: 'empty', textContent: 'Još nema spuštenih kombinacija.' });
    box.replaceChildren(empty);
    return;
  }
  const canTarget = v.turn === ME && v.phase === 'PLAY' && v.opened[ME] && ui.selected.size > 0 && !ui.locked;
  box.replaceChildren(...v.melds.map(m => {
    const el = document.createElement('div');
    el.className = `meld${canTarget ? ' target' : ''}`;
    el.dataset.meld = m.id;
    const owner = Object.assign(document.createElement('span'), { className: `owner p${m.owner}`, title: playerName(m.owner) });
    el.append(owner, ...m.cards.map(mc => cardEl(mc.card, 'small')));
    if (canTarget) {
      el.title = 'Dopiši izabrane karte ovde';
      el.addEventListener('click', () => on.layoff(m.id));
    }
    return el;
  }));
}

export function renderStaged(v, ui, on) {
  $('staged').replaceChildren(...stagedCards(v, ui.staged).map((cards, i) => {
    const el = document.createElement('div');
    el.className = 'meld target';
    el.title = 'Vrati u ruku';
    const pts = Object.assign(document.createElement('span'), { className: 'pts', textContent: pointsOf(cards) });
    el.append(...cards.map(c => cardEl(c, 'small')), pts);
    el.addEventListener('click', () => on.unstage(i));
    return el;
  }));
}
