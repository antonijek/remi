// Karte kao slike (CC0 set kao u Preferansu, Lori i Tabliću). Id u igri ima i broj špila
// ("7H1", "7H2"), slika ne; džokeri JK1..JK4 su naizmenično crveni i crni.

const SUIT_NAME = { '♠': 'pik', '♥': 'herc', '♦': 'karo', '♣': 'tref' };

export function cardName(c) {
  return c.joker ? 'džoker' : `${c.rank}${c.suit}`;
}

export function imageFor(c) {
  if (c.joker) return Number(c.id.slice(2)) % 2 ? 'joker-red' : 'joker-black';
  return c.id.replace(/\d$/, '');
}

function img(file) {
  const i = document.createElement('img');
  i.src = `./icons/cards/${file}.webp`;
  i.alt = '';
  i.draggable = false;
  return i;
}

export function cardEl(c, cls = '') {
  const el = document.createElement('div');
  el.className = `card ${cls}`.trim();
  el.dataset.id = c.id;
  el.setAttribute('aria-label', c.joker ? 'džoker' : `${c.rank} ${SUIT_NAME[c.suit]}`);
  el.append(img(imageFor(c)));
  return el;
}

export function backEl(cls = '') {
  const el = document.createElement('div');
  el.className = `card back ${cls}`.trim();
  el.append(img('back-red'));
  return el;
}

/** Poleđina za ruke protivnika (manja, bez okvira karte). */
export function backImg() {
  return img('back-red');
}
