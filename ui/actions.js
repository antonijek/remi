// Uputstvo i dugmad ispod stola: šta igrač sme i treba sledeće da uradi.

import { buildMeld, legalDiscards } from '../engine/dist/index.js';
import { cardName } from './cards.js';
import { ME, playerName } from './seats.js';
import { stagedPoints } from './table.js';

const $ = id => document.getElementById(id);

function button(label, onClick, { primary = false, disabled = false, title = '', id = '' } = {}) {
  const b = document.createElement('button');
  b.className = `btn${primary ? ' primary' : ''}`;
  b.textContent = label;
  b.disabled = disabled;
  if (title) b.title = title;
  if (id) b.id = id;
  b.addEventListener('click', onClick);
  return b;
}

export function renderActions(v, ui, on) {
  const hint = $('hint');
  const btns = [];
  const myTurn = v.turn === ME && !ui.locked;
  const sel = v.hand.filter(c => ui.selected.has(c.id));
  const selMeld = sel.length >= 3 ? buildMeld(sel) : null;

  if (!myTurn || v.phase === 'DEAL_END' || v.phase === 'MATCH_END') {
    hint.textContent = (v.phase === 'DRAW' || v.phase === 'PLAY') && v.turn !== ME ? `Igra ${playerName(v.turn)}…` : '';
  } else if (v.phase === 'DRAW') {
    hint.textContent = 'Vucite kartu: kliknite špil ili gomilu.';
  } else if (!v.opened[ME]) {
    const pts = stagedPoints(v, ui.staged);
    hint.textContent = v.tookDiscard
      ? `Uzeli ste kartu sa gomile — morate se otvoriti sa njom (${pts}/${v.openingPoints}) ili je vratiti.`
      : ui.staged.length ? `Priprema otvaranja: ${pts}/${v.openingPoints} poena.`
        : 'Izaberite karte za kombinaciju, ili jednu kartu za odbacivanje.';
    btns.push(button('Dodaj kombinaciju', on.stage, { disabled: !selMeld, title: 'Niz ili komplet od izabranih karata', id: 'stageBtn' }));
    const includesTaken = !v.tookDiscard || ui.staged.flat().includes(v.tookDiscard);
    btns.push(button(`Otvori (${pts})`, on.open, { primary: true, id: 'openBtn', disabled: pts < v.openingPoints || !includesTaken || !ui.staged.length }));
    if (ui.staged.length) btns.push(button('Poništi pripremu', on.clearStaged));
    if (v.tookDiscard) btns.push(button('Vrati kartu na gomilu', on.returnCard, { id: 'returnBtn' }));
  } else {
    hint.textContent = 'Spuštajte kombinacije, dopišite (izaberite kartu pa kliknite kombinaciju na stolu), pa odbacite jednu kartu.';
    btns.push(button('Spusti kombinaciju', () => on.meld(sel.map(c => c.id)), { primary: Boolean(selMeld), disabled: !selMeld, id: 'meldBtn' }));
  }

  if (myTurn && v.phase === 'PLAY') {
    const one = sel.length === 1 ? sel[0] : null;
    const canDiscard = one && legalDiscards(v.hand, v.takenCard).some(c => c.id === one.id)
      && !(v.tookDiscard && !v.opened[ME]) && !ui.staged.flat().includes(one.id);
    btns.push(button(one ? `Odbaci ${cardName(one)}` : 'Odbaci', () => on.discard(one.id),
      { disabled: !canDiscard, primary: Boolean(canDiscard) && !selMeld, id: 'discardBtn' }));
    if (on.suggest) btns.push(button('Predlog', on.suggest, { id: 'suggestBtn' }));
  }
  btns.push(button(ui.sortMode === 'suit' ? 'Sortiraj po broju' : 'Sortiraj po boji', on.sort, { id: 'sortBtn' }));
  $('actions').replaceChildren(...btns);
}
