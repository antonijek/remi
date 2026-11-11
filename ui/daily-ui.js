// Prozori dnevnog izazova: kraj izazova (rezultat, niz dana, deljenje) i „već odigrano danas“.

import * as daily from './daily.js';

const $ = id => document.getElementById(id);

function shareResult(text, toast) {
  daily.share(text)
    .then(how => { if (how === 'copied') toast('Rezultat je kopiran — nalepite ga prijatelju.'); })
    .catch(e => toast(`Deljenje nije uspelo (${e.message}).`));
}

/** Kraj partije izazova: upiši rezultat i dopuni već popunjen prozor kraja partije. */
export function fillDailyEnd(view, key, toast) {
  const result = daily.resultOf(view.history.at(-1));
  const results = daily.saveResult(key, result, toast);
  const days = daily.streak(results, key);
  $('dealEndTitle').textContent = `Dnevni izazov ${daily.dayLabel(key)}: ${daily.verdict(result)}`;
  $('dealEndNote').textContent += days > 1 ? ` Niz: ${days} dana zaredom.` : ' Novi izazov sutra.';
  $('shareBtn').onclick = () => shareResult(daily.shareText(key, result, days), toast);
  $('nextDealBtn').textContent = 'Nazad na običnu igru';
}

export function showDailyDone(key, results, toast) {
  const r = results[key];
  const days = daily.streak(results, key);
  $('dailyDoneText').textContent = `${daily.summary(r)}.${days > 1 ? ` Niz: ${days} dana zaredom.` : ''} Novi izazov stiže u ponoć.`;
  $('dailyShareBtn').onclick = () => shareResult(daily.shareText(key, r, days), toast);
  $('dailyDone').showModal();
}
