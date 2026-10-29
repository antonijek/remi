// Čuvanje partije u pregledaču. Igra radi i kad čuvanje ne uspe, ali igrač to mora da zna.

import { RemiGame } from '../engine/dist/index.js';

const SAVE_KEY = 'remi.save.v1';
let warned = false;

export function saveGame(game, players, onError) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ players, state: game.getState() }));
  } catch (e) {
    if (!warned) onError(`Igra se ne čuva na ovom uređaju (${e.message}).`);
    warned = true;
  }
}

/** Vrati { game, players } ili null (nema sačuvane igre ili je neispravna). */
export function loadGame(onError) {
  let raw;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch (e) {
    onError(`Sačuvana igra ne može da se pročita (${e.message}).`);
    return null;
  }
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    return { players: d.players ?? 4, game: RemiGame.fromState(d.state) };
  } catch (e) {
    onError(`Sačuvana igra nije mogla da se učita (${e.message}), počinje nova.`);
    return null;
  }
}
