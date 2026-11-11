// Lige (server/src/leagues.ts): moje lige, pravljenje, ulazak kodom, tabela, upravljanje (osnivač).

const $ = id => document.getElementById(id);
const SCORING = { places: 'bodovi po mestu', result: 'zbir rezultata' };
const RANK = { total: 'po zbiru', avg: 'po proseku' };

function el(tag, props = {}, ...kids) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
}

const btn = (label, onClick, cls = '') => el('button', { className: `btn ${cls}`, type: 'button', textContent: label, onclick: onClick });

export function initLeagues({ token, toast }) {
  async function api(method, path, body) {
    const res = await fetch(`/api/leagues${path}`, {
      method,
      headers: { Authorization: `Bearer ${token()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Greška ${res.status}`);
    return data;
  }

  const fail = e => { console.error('Liga:', e); $('leagueError').textContent = e.message; };
  const run = async fn => { $('leagueError').textContent = ''; try { await fn(); } catch (e) { fail(e); } };

  async function showList() {
    const { leagues } = await api('GET', '');
    $('leagueTitle').textContent = 'Lige';
    const items = leagues.map(l => el('li', {},
      el('span', { textContent: `${l.name} · ${l.members} članova` }),
      btn('Tabela', () => run(() => showLeague(l.id)))));
    $('leagueBody').replaceChildren(
      el('ul', { className: 'list' }, ...(items.length ? items : [el('li', { textContent: 'Niste ni u jednoj ligi.' })])),
      el('h3', { textContent: 'Uđi u ligu' }),
      el('div', { className: 'row' },
        el('input', { id: 'leagueCode', maxLength: 6, placeholder: 'Kod lige', autocapitalize: 'characters' }),
        btn('Uđi', () => run(async () => {
          const { id } = await api('POST', '/join', { code: $('leagueCode').value });
          await showLeague(id);
        }))),
      el('h3', { textContent: 'Nova liga' }),
      el('div', { className: 'row' },
        el('input', { id: 'leagueName', maxLength: 30, placeholder: 'Naziv lige' }),
        el('input', { id: 'leagueNorma', type: 'number', min: 0, max: 100, value: 5, title: 'Norma (broj partija)' })),
      el('div', { className: 'row' },
        el('select', { id: 'leagueScoring' }, ...Object.entries(SCORING).map(([v, t]) => el('option', { value: v, textContent: t }))),
        el('select', { id: 'leagueRank' }, ...Object.entries(RANK).map(([v, t]) => el('option', { value: v, textContent: t }))),
        btn('Napravi', () => run(async () => {
          const { id } = await api('POST', '', {
            name: $('leagueName').value, norma: Number($('leagueNorma').value),
            scoring: $('leagueScoring').value, rankBy: $('leagueRank').value,
          });
          await showLeague(id);
        }))),
      el('p', { className: 'note', textContent: 'Norma = najmanje partija da se ulazi u poredak (ispod norme ste na dnu). Računa se samo kad za stolom sede samo članovi lige.' }));
  }

  async function showLeague(id) {
    const { league: l, standings } = await api('GET', `/${id}`);
    $('leagueTitle').textContent = l.name;
    const rows = standings.map((r, i) => el('li', {},
      el('span', { textContent: `${i + 1}. ${r.name}${r.meetsNorma ? '' : ' (ispod norme)'} — ${r.points} (${r.matches} partija, ${r.wins} pobeda)` }),
      ...(l.mine && r.userId !== l.ownerId ? [btn('Izbaci', () => run(async () => {
        if (!confirm(`Izbaciti ${r.name} iz lige?`)) return;
        await api('POST', `/${id}/kick`, { userId: r.userId });
        await showLeague(id);
      }), 'ghost')] : [])));
    const info = `${SCORING[l.scoring]}, poredak ${RANK[l.rankBy]}, norma ${l.norma}`;
    const actions = l.mine
      ? [btn('Obriši ligu', () => run(async () => {
        if (!confirm('Obrisati ligu zauvek?')) return;
        await api('DELETE', `/${id}`);
        await showList();
      }), 'ghost')]
      : [btn('Napusti ligu', () => run(async () => { await api('POST', `/${id}/leave`); await showList(); }), 'ghost')];
    $('leagueBody').replaceChildren(
      el('p', { className: 'note', textContent: info }),
      ...(l.code ? [el('p', {}, 'Kod za ulazak: ', el('b', { textContent: l.code }), ' ',
        btn('📋 Kopiraj', () => navigator.clipboard.writeText(l.code).then(() => toast('Kod je kopiran.'), e => fail(e))))] : []),
      el('ol', { className: 'list' }, ...rows),
      el('div', { className: 'dialog-buttons' }, btn('← Sve lige', () => run(showList), 'ghost'), ...actions));
  }

  $('leagueBtn').addEventListener('click', () => {
    $('leagueDlg').showModal();
    run(showList);
  });
  $('leagueClose').addEventListener('click', () => $('leagueDlg').close());
}
