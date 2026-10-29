// Kraj partije i meča, i tabela svih partija. Radi nad prikazom igrača (PlayerView), pa isto
// služi i igri protiv računara i online igri.

import { ME, playerName } from './seats.js';

const $ = id => document.getElementById(id);
const fmt = x => (x > 0 ? `+${x}` : String(x));

function cells(tag, values, cls = []) {
  const tr = document.createElement('tr');
  values.forEach((v, i) => {
    const td = document.createElement(tag);
    td.textContent = v;
    if (cls[i]) td.className = cls[i];
    tr.append(td);
  });
  return tr;
}

export function dealEndTitle(v) {
  const last = v.history.at(-1);
  if (v.phase === 'MATCH_END') {
    return v.winners.includes(ME) ? 'Pobeda u meču! 🎉' : `Meč je dobio: ${v.winners.map(playerName).join(', ')}`;
  }
  if (last.winner === null) return 'Nestalo je karata — partija bez pobednika';
  if (last.winner === ME) return last.handRemi ? 'REMI IZ RUKE! 🎉' : 'Završili ste partiju! 🎉';
  return last.handRemi ? `${playerName(last.winner)}: REMI IZ RUKE!` : `Partiju je završio: ${playerName(last.winner)}`;
}

/** Popuni prozor kraja partije; vraća false ako još nema završene partije. */
export function fillDealEnd(v) {
  const last = v.history.at(-1);
  if (!last) return false;
  const min = Math.min(...v.scores);
  $('dealEndTitle').textContent = dealEndTitle(v);
  $('dealEndBody').replaceChildren(...Array.from({ length: v.playerCount }, (_, p) =>
    cells('td', [playerName(p), fmt(last.points[p]), v.scores[p]], ['', '', v.scores[p] === min ? 'best' : ''])));
  $('dealEndNote').textContent = 'Pobednik −40 (remi iz ruke −140, tada ostali duplo). Otvoreni plaćaju karte iz ruke (džoker 20), neotvoreni 100. Manje je bolje.';
  $('nextDealBtn').textContent = v.phase === 'MATCH_END' ? 'Nova igra' : 'Sledeća partija';
  return true;
}

export function renderSheet(v) {
  const n = v.playerCount;
  const head = document.createElement('thead');
  head.append(cells('th', ['#', ...Array.from({ length: n }, (_, p) => playerName(p))]));
  const body = document.createElement('tbody');
  for (const h of v.history) body.append(cells('td', [`${h.dealNo}${h.handRemi ? ' ★' : ''}`, ...h.points.map(fmt)]));
  const total = cells('td', ['Ukupno', ...v.scores]);
  total.className = 'total';
  body.append(total);
  $('sheetTable').replaceChildren(head, body);
  $('sheet').showModal();
}
