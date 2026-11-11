// Kraj deljenja u online igri: tekst, rejting posle meča i dugme „Dalje“ / „Nazad u lobi“.

import { fillDealEnd } from './deal-end.js';

const $ = id => document.getElementById(id);

export function showOnlineDealEnd(v, room) {
  fillDealEnd(v);
  $('shareBtn').hidden = true;
  const btn = $('nextDealBtn');
  btn.disabled = false;
  if (v.phase === 'MATCH_END') {
    const r = room.rating;
    const d = r?.deltas[room.mySeat] ?? 0;
    $('dealEndNote').textContent += r?.rated ? ` Rejting: ${d >= 0 ? '+' : ''}${d} → ${r.newRatings[room.mySeat]}.`
      : ' Meč nije rangiran (rangirano je kad za stolom sede bar dva čoveka).';
    btn.textContent = 'Nazad u lobi';
  } else {
    btn.textContent = 'Dalje';
  }
  if (!$('dealEnd').open) $('dealEnd').showModal();
}
