// Koji zvuk ide uz koju promenu na stolu: poredi prethodno i novo stanje.

import { playSound } from './sound.js';
import { ME } from './seats.js';

const meldCards = v => v.melds.reduce((n, m) => n + m.cards.length, 0);

const snapshot = v => ({
  dealNo: v.dealNo,
  phase: v.phase,
  turn: v.turn,
  discard: v.discard.length,
  stock: v.stockCount,
  melds: meldCards(v),
});

let prev = null;

/** Posle skoka stanja (nova igra, ulazak u online sobu) ne svira ništa za prvu promenu. */
export function resetSounds() {
  prev = null;
}

/** Zove se posle svakog crtanja; svira samo ono što se od prošlog puta stvarno promenilo. */
export function soundsFor(v, { online }) {
  const now = snapshot(v);
  const p = prev;
  prev = now;
  if (!p) return;
  if (now.dealNo !== p.dealNo) {
    playSound('deal');
  } else if (now.melds > p.melds) {
    playSound('meld');
  } else if (now.discard > p.discard) {
    playSound('card');
  } else if (now.stock < p.stock) {
    playSound('draw');
  }
  if (now.phase === 'MATCH_END' && p.phase !== 'MATCH_END') {
    setTimeout(() => playSound(v.winners.includes(ME) ? 'win' : 'end'), 600);
  }
  if (online && now.turn === ME && p.turn !== ME && now.phase !== 'MATCH_END') {
    setTimeout(() => playSound('turn'), 300);
  }
}
