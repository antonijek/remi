// Dnevni izazov: svi igrači istog dana dobijaju isto mešanje (isti seed) i igraju jednu partiju
// 1 na 1 protiv računara. Špil je isti, a računar ne koristi nasumičnost (nivo 'hard'), pa na iste
// poteze odgovara isto. Jedan pokušaj dnevno; rezultat može da se podeli. Manje poena je bolje.

const RESULTS_KEY = 'remi.daily.results';
export const STATE_PREFIX = 'remi.daily.state.';
export const DAILY_URL = 'https://remi.igrajmo.online/?izazov';

/** Današnji datum u Srbiji (YYYY-MM-DD) — izazov se menja u ponoć po našem vremenu. */
export function todayKey(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Belgrade' }).format(now);
}

export function seedFor(key) {
  return Number(key.replaceAll('-', ''));
}

export function dayLabel(key) {
  const [y, m, d] = key.split('-');
  return `${Number(d)}.${Number(m)}.${y}.`;
}

function shiftDay(key, days) {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Koliko dana zaredom je odigran izazov (zaključno sa danas, ili sa juče ako danas još nije). */
export function streak(results, key) {
  let day = results[key] ? key : shiftDay(key, -1);
  let n = 0;
  while (results[day]) {
    n++;
    day = shiftDay(day, -1);
  }
  return n;
}

/** Rezultat izazova iz završene partije: { me, opp, handRemi } (poeni; manje je bolje). */
export function resultOf(lastDeal) {
  return { me: lastDeal.points[0], opp: lastDeal.points[1], handRemi: lastDeal.handRemi };
}

export function verdict(r) {
  if (r.me < r.opp) return 'pobeda';
  return r.me > r.opp ? 'poraz' : 'nerešeno';
}

const fmt = x => (x > 0 ? `+${x}` : String(x));

export function summary(r) {
  return `Vi ${fmt(r.me)} : ${fmt(r.opp)} računar (${verdict(r)})${r.handRemi ? ' · remi iz ruke ★' : ''}`;
}

export function shareText(key, r, days) {
  const lines = [`🃏 Remi — dnevni izazov ${dayLabel(key)}`, summary(r)];
  if (days > 1) lines.push(`Niz: ${days} dana zaredom`);
  lines.push(DAILY_URL);
  return lines.join('\n');
}

// ---------- čuvanje (greške se prijavljuju preko onError) ----------

export function loadResults(onError) {
  try {
    return JSON.parse(localStorage.getItem(RESULTS_KEY) ?? '{}');
  } catch (e) {
    onError(`Rezultati izazova ne mogu da se pročitaju (${e.message}).`);
    return {};
  }
}

export function saveResult(key, result, onError) {
  const all = loadResults(onError);
  all[key] = result;
  try {
    localStorage.setItem(RESULTS_KEY, JSON.stringify(all));
    localStorage.removeItem(STATE_PREFIX + key);
  } catch (e) {
    onError(`Rezultat izazova nije sačuvan (${e.message}).`);
  }
  return all;
}

/** Ključ pod kojim se čuva nezavršena partija izazova (stari dani se brišu). */
export function stateSlot(key, onError) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(STATE_PREFIX) && k !== STATE_PREFIX + key) localStorage.removeItem(k);
    }
  } catch (e) {
    onError(`Stari izazovi ne mogu da se obrišu (${e.message}).`);
  }
  return STATE_PREFIX + key;
}

/** Podeli rezultat: meni telefona za deljenje, a gde ga nema — kopiranje u clipboard. */
export async function share(text) {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (e) {
      if (e.name === 'AbortError') return 'cancelled';
      console.error('Deljenje nije uspelo, kopiram:', e);
    }
  }
  await navigator.clipboard.writeText(text);
  return 'copied';
}
