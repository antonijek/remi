// Mesta za stolom i pločice igrača (avatar, ime, otvoren, poeni, broj karata, delilac).

import { backImg } from './cards.js';

export const ME = 0;
const DEFAULT_NAMES = ['Vi', 'Milan', 'Jelena', 'Bora'];
let roomNames = null; // online: imena iz sobe, po mestima na ekranu

export function setNames(names) {
  roomNames = names;
}

export function playerName(p) {
  return roomNames?.[p] ?? DEFAULT_NAMES[p];
}

export function slotOf(p, n) {
  if (p === ME) return 'me';
  const rel = (p - ME + n) % n;
  if (n === 2) return 'top';
  if (n === 3) return rel === 1 ? 'right' : 'left';
  return ['me', 'right', 'top', 'left'][rel];
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function plate(v, p) {
  const active = (v.phase === 'DRAW' || v.phase === 'PLAY') && v.turn === p;
  const box = el('div', `plate${active ? ' active' : ''}`);
  const name = playerName(p);
  const info = el('div');
  const title = el('div', 'name', `${name} `);
  if (v.opened[p]) title.append(el('span', 'badge-open', 'otvoren'));
  const sub = el('div', 'sub');
  sub.append('poena ', el('b', '', v.scores[p]));
  if (p !== ME) sub.append(' · karata ', el('b', '', v.handCounts[p]));
  info.append(title, sub);
  box.append(el('div', `avatar p${p}`, name[0]), info);
  if (v.dealer === p) {
    const chip = el('span', 'dealer-chip', 'D');
    chip.title = 'Delio';
    box.append(chip);
  }
  return box;
}

export function renderSeats(v) {
  for (const slot of ['top', 'left', 'right', 'me']) document.querySelector(`.seat[data-seat="${slot}"]`).replaceChildren();
  for (let p = 0; p < v.playerCount; p++) {
    const seat = document.querySelector(`.seat[data-seat="${slotOf(p, v.playerCount)}"]`);
    const parts = [plate(v, p)];
    if (p !== ME) {
      const backs = el('div', 'backs');
      for (let i = 0; i < Math.min(v.handCounts[p], 15); i++) backs.append(backImg());
      parts.push(backs);
    }
    seat.replaceChildren(...parts);
  }
}
