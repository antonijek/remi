// Admin panel: pregled, igrači, sobe uživo, mečevi. Prijava je ista kao u igri (token iz
// pregledača; server proverava admin prava u Preferansu). Imena se upisuju kao tekst (bez HTML-a).

const KEY = document.body.dataset.tokenKey;
const REFRESH_MS = 15000;
const $ = id => document.getElementById(id);
let tab = 'overview';
let timer = null;

function token() {
  try {
    return localStorage.getItem(KEY);
  } catch (e) {
    showError(`Prijava se ne može pročitati (${e.message}).`);
    return null;
  }
}

function showError(msg) {
  $('msg').textContent = msg ?? '';
  $('msg').hidden = !msg;
}

async function api(path, opts = {}) {
  const res = await fetch(`/api/admin${path}`, { ...opts, headers: { Authorization: `Bearer ${token()}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function el(tag, text, cls) {
  const e = document.createElement(tag);
  if (text !== undefined && text !== null) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

function cell(node) {
  const td = el('td');
  td.append(node);
  return td;
}

function rowsTable(headers, rows) {
  const t = el('table', null, 'result');
  const head = el('tr');
  for (const h of headers) head.append(el('th', h));
  t.append(head);
  for (const r of rows) {
    const tr = el('tr');
    for (const c of r) tr.append(c instanceof Node ? cell(c) : el('td', c));
    t.append(tr);
  }
  return t;
}

const ago = ms => {
  const m = Math.round((Date.now() - ms) / 60000);
  return m < 60 ? `pre ${m} min` : `pre ${Math.round(m / 60)} h`;
};

async function overview() {
  const d = await api('/overview');
  const box = el('div');
  box.append(el('p', `Online sada: ${d.online.length ? d.online.map(u => `${u.name} (${u.rating})`).join(', ') : 'niko'}`));
  box.append(el('p', `Sobe: ${d.rooms.waiting} čeka, ${d.rooms.playing} igra · igrača sa nalogom ukupno: ${d.totalPlayers}`));
  box.append(rowsTable(['', 'danas', '7 dana', '30 dana'], [
    ['Igrači sa nalogom (online)', d.today.players, d.week.players, d.month.players],
    ['Posetioci (i bez naloga)', d.today.visitors, d.week.visitors, d.month.visitors],
    ['Završeni online mečevi', d.today.matches, d.week.matches, d.month.matches],
  ]));
  box.append(el('h3', 'Po danima (30 dana)'));
  box.append(rowsTable(['dan', 'igrači', 'posetioci', 'mečevi'], d.days.map(x => [x.day, x.players, x.visitors, x.matches])));
  return box;
}

async function players() {
  const d = await api('/players');
  return rowsTable(['ime', 'rejting', 'mečeva', 'poslednji put'], d.players.map(p => [p.name, p.rating, p.games_played, p.last_seen]));
}

async function rooms() {
  const d = await api('/rooms');
  if (!d.rooms.length) return el('p', 'Nema soba.');
  return rowsTable(['soba', 'stanje', 'za stolom', 'partija', 'aktivnost', ''], d.rooms.map(r => {
    const close = el('button', 'Zatvori', 'btn');
    close.addEventListener('click', async () => {
      if (!confirm(`Zatvoriti sobu ${r.code}? Igrači se vraćaju u lobi.`)) return;
      try { await api(`/rooms/${r.code}/close`, { method: 'POST' }); load(); } catch (e) { showError(e.message); }
    });
    const seats = r.seats.map(s => (s.kind === 'human' ? `${s.name}${s.connected ? '' : ' (bez veze)'}` : s.kind === 'ai' ? 'računar' : 'prazno')).join(', ');
    return [r.code, `${r.status}${r.rated ? ' · rangirano' : ''}`, seats, r.deal ?? '—', ago(r.lastActivity), close];
  }));
}

async function matches() {
  const d = await api('/matches');
  if (!d.matches.length) return el('p', 'Još nema završenih online mečeva.');
  return rowsTable(['kraj', 'soba', 'igrači i poeni', 'rejting'], d.matches.map(m => {
    const seats = JSON.parse(m.seats_json);
    const scores = JSON.parse(m.scores_json);
    const deltas = JSON.parse(m.rating_deltas_json);
    const who = seats.map((s, i) => `${s.name ?? 'računar'} ${scores[i]}`).join(', ');
    return [m.ended_at, m.room_code, who, m.rated ? deltas.map(x => (x > 0 ? `+${x}` : x)).join(' / ') : 'nerangirano'];
  }));
}

const VIEWS = { overview, players, rooms, matches };

async function load() {
  clearTimeout(timer);
  if (!token()) { showError('Prijavite se u igri (🌐), pa otvorite ovu stranicu ponovo.'); return; }
  try {
    const node = await VIEWS[tab]();
    showError(null);
    $('content').replaceChildren(node);
  } catch (e) {
    showError(e.message);
  }
  timer = setTimeout(load, REFRESH_MS);
}

for (const b of document.querySelectorAll('[data-tab]')) {
  b.addEventListener('click', () => {
    tab = b.dataset.tab;
    for (const x of document.querySelectorAll('[data-tab]')) x.classList.toggle('primary', x === b);
    load();
  });
}
$('refreshBtn').addEventListener('click', load);
load();
