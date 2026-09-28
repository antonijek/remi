// UI za Remi — tanak sloj nad engine-om (engine/dist). Igra protiv računara.

import {
  RemiGame, RemiError, chooseAction, bestMelds, buildMeld, meldPoints, swapJoker, extendMeld,
  sortBySuit, sortByRank, penaltyPoints, legalDiscards,
} from './engine/dist/index.js';

const FAST = new URLSearchParams(location.search).has('fast');
const DELAY = FAST ? 0 : 650;
const SAVE_KEY = 'remi.save.v1';
const NAMES = ['Vi', 'Milan', 'Jelena', 'Bora'];
const COLORS = ['#2f7dd1', '#c0392b', '#8e44ad', '#d68910'];
const ME = 0;

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

let game;
let level = 'medium';
let players = 4;
let selected = new Set();
let staged = [];            // kombinacije pripremljene za otvaranje (id-jevi)
let sortMode = 'suit';
let timer = null;
let toastTimer = null;
let freshId = null;         // upravo vučena karta (označena u ruci)

// ---------- čuvanje ----------

function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ level, players, state: game.getState() })); } catch {}
}

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    level = d.level ?? 'medium';
    players = d.players ?? 4;
    game = RemiGame.fromState(d.state);
    return true;
  } catch {
    return false;
  }
}

function newGame() {
  clearTimeout(timer);
  game = new RemiGame({ players });
  resetTurnUi();
  save();
  render();
  step();
}

function resetTurnUi() {
  selected = new Set();
  staged = [];
  freshId = null;
}

// ---------- karte ----------

function cardName(c) {
  return c.joker ? 'džoker' : `${c.rank}${c.suit}`;
}

function cardEl(c, cls = '') {
  const el = document.createElement('div');
  el.className = `card ${cls}`;
  if (c.joker) {
    el.classList.add('joker');
    el.innerHTML = '<span class="corner">★<small>J</small></span><span class="pip">🃏</span>';
  } else {
    if (c.suit === '♥' || c.suit === '♦') el.classList.add('red');
    el.innerHTML = `<span class="corner">${c.rank}<small>${c.suit}</small></span><span class="pip">${c.suit}</span>`;
  }
  el.dataset.id = c.id;
  el.setAttribute('aria-label', cardName(c));
  return el;
}

function backEl(cls = '') {
  const el = document.createElement('div');
  el.className = `card back ${cls}`;
  return el;
}

// ---------- pozicije ----------

function slotOf(p, n) {
  if (p === ME) return 'me';
  const rel = (p - ME + n) % n;
  if (n === 2) return 'top';
  if (n === 3) return rel === 1 ? 'right' : 'left';
  return ['me', 'right', 'top', 'left'][rel];
}

// ---------- render ----------

function view() {
  return game.getPlayerView(ME);
}

function render() {
  const v = view();
  const n = v.playerCount;
  $('dealInfo').innerHTML = `Partija ${v.dealNo} · Delio: <strong>${esc(NAMES[v.dealer])}</strong> · igra se do ${game.targetScore}`;

  // mesta
  for (const slot of ['top', 'left', 'right', 'me']) document.querySelector(`.seat[data-seat="${slot}"]`).replaceChildren();
  for (let p = 0; p < n; p++) renderSeat(v, p, slotOf(p, n));

  renderPiles(v);
  renderMelds(v);
  renderStaged(v);
  renderHand(v);
  renderActions(v);
}

function renderSeat(v, p, slot) {
  const el = document.querySelector(`.seat[data-seat="${slot}"]`);
  const active = (v.phase === 'DRAW' || v.phase === 'PLAY') && v.turn === p;
  const plate = document.createElement('div');
  plate.className = 'plate' + (active ? ' active' : '');
  plate.innerHTML =
    `<div class="avatar" style="background:${COLORS[p]}">${esc(NAMES[p][0])}</div>` +
    `<div><div class="name">${esc(NAMES[p])} ${v.opened[p] ? '<span class="badge-open">otvoren</span>' : ''}</div>` +
    `<div class="sub">poena <b>${v.scores[p]}</b>${p !== ME ? ` · karata <b>${v.handCounts[p]}</b>` : ''}</div></div>` +
    (v.dealer === p ? '<span class="dealer-chip" title="Delio">D</span>' : '');
  const parts = [plate];
  if (p !== ME) {
    const backs = document.createElement('div');
    backs.className = 'backs';
    for (let i = 0; i < Math.min(v.handCounts[p], 15); i++) {
      const img = document.createElement('img');
      img.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 70"><rect x="1" y="1" width="48" height="68" rx="5" fill="#b1262e" stroke="#fff" stroke-width="3"/></svg>');
      img.alt = '';
      backs.appendChild(img);
    }
    parts.push(backs);
  }
  el.replaceChildren(...parts);
}

function myDrawTurn(v) {
  return v.turn === ME && v.phase === 'DRAW';
}

function renderPiles(v) {
  const stock = $('stock');
  stock.replaceChildren(v.stockCount ? backEl('pile') : Object.assign(document.createElement('div'), { className: 'pile-empty' }));
  stock.classList.toggle('clickable', myDrawTurn(v));
  stock.onclick = myDrawTurn(v) ? () => humanDraw() : null;
  stock.title = myDrawTurn(v) ? 'Vuci kartu sa špila' : '';
  $('stockCount').textContent = `špil: ${v.stockCount}`;

  const pile = $('discardPile');
  const top = v.discard.at(-1);
  pile.replaceChildren(top ? cardEl(top, 'pile') : Object.assign(document.createElement('div'), { className: 'pile-empty' }));
  const canTake = myDrawTurn(v) && !!top;
  pile.classList.toggle('clickable', canTake);
  pile.onclick = canTake ? () => humanTake() : null;
  pile.title = canTake ? `Uzmi ${cardName(top)} sa gomile` : '';
}

function renderMelds(v) {
  const box = $('melds');
  if (!v.melds.length) {
    box.innerHTML = '<span class="empty">Još nema spuštenih kombinacija.</span>';
    return;
  }
  const canTarget = v.turn === ME && v.phase === 'PLAY' && v.opened[ME] && selected.size > 0;
  box.replaceChildren(...v.melds.map(m => {
    const el = document.createElement('div');
    el.className = 'meld' + (canTarget ? ' target' : '');
    el.innerHTML = `<span class="owner" style="background:${COLORS[m.owner]}" title="${esc(NAMES[m.owner])}"></span>`;
    for (const mc of m.cards) el.appendChild(cardEl(mc.card, 'small'));
    if (canTarget) {
      el.title = 'Dopiši izabrane karte ovde';
      el.addEventListener('click', () => humanLayoff(m.id));
    }
    return el;
  }));
}

function stagedCards(v) {
  return staged.map(ids => ids.map(id => v.hand.find(c => c.id === id)).filter(Boolean));
}

const pointsOf = cards => { const m = buildMeld(cards); return m ? meldPoints(m) : 0; };

function stagedPoints(v) {
  return stagedCards(v).reduce((s, cards) => s + pointsOf(cards), 0);
}

function renderStaged(v) {
  const box = $('staged');
  if (!staged.length) { box.replaceChildren(); return; }
  box.replaceChildren(...stagedCards(v).map((cards, i) => {
    const el = document.createElement('div');
    el.className = 'meld target';
    el.title = 'Vrati u ruku';
    for (const c of cards) el.appendChild(cardEl(c, 'small'));
    const pts = document.createElement('span');
    pts.className = 'pts';
    pts.textContent = pointsOf(cards);
    el.appendChild(pts);
    el.addEventListener('click', () => { staged.splice(i, 1); render(); });
    return el;
  }));
}

function renderHand(v) {
  const hand = $('myHand');
  const inStaged = new Set(staged.flat());
  const sorted = (sortMode === 'suit' ? sortBySuit : sortByRank)(v.hand).filter(c => !inStaged.has(c.id));
  const canSelect = v.turn === ME && v.phase === 'PLAY';
  hand.classList.toggle('locked', !canSelect);
  // preklapanje prema broju karata: ruka mora da stane u raspoloživu širinu
  const w = cardWidth();
  // na širokom ekranu levo je savet, desno dugmad — ruka dobija sredinu
  const avail = Math.min(window.innerWidth - 24, 1100) - (window.innerWidth > 760 ? 420 : 0);
  const count = sorted.length;
  const step = count > 1 ? Math.min(w * 0.62, (avail - w) / (count - 1)) : w;
  hand.style.setProperty('--ml', `${Math.min(0, step - w).toFixed(1)}px`);
  hand.replaceChildren(...sorted.map(c => {
    const el = cardEl(c);
    if (selected.has(c.id)) el.classList.add('sel');
    if (c.id === freshId) el.classList.add('fresh');
    el.addEventListener('click', () => {
      if (!canSelect) return;
      if (selected.has(c.id)) selected.delete(c.id); else selected.add(c.id);
      render();
    });
    return el;
  }));
}

/** Stvarna širina karte u ruci (zavisi od veličine ekrana preko --card-w). */
function cardWidth() {
  const el = cardEl({ id: 'probe', rank: 'A', suit: '♠', joker: false });
  el.style.cssText = 'position:absolute;visibility:hidden';
  document.body.appendChild(el);
  const w = el.getBoundingClientRect().width;
  el.remove();
  return w;
}

function button(label, onClick, { primary = false, disabled = false, title = '' } = {}) {
  const b = document.createElement('button');
  b.className = 'btn' + (primary ? ' primary' : '');
  b.textContent = label;
  b.disabled = disabled;
  if (title) b.title = title;
  b.addEventListener('click', onClick);
  return b;
}

function renderActions(v) {
  const actions = $('actions');
  const hint = $('hint');
  const btns = [];
  const myTurn = v.turn === ME;
  const sel = v.hand.filter(c => selected.has(c.id));
  const selMeld = sel.length >= 3 ? buildMeld(sel) : null;

  if (!myTurn || v.phase === 'DEAL_END' || v.phase === 'MATCH_END') {
    hint.textContent = v.phase === 'DRAW' || v.phase === 'PLAY' ? `Igra ${NAMES[v.turn]}…` : '';
  } else if (v.phase === 'DRAW') {
    hint.innerHTML = '<b>Vucite kartu:</b> kliknite špil ili gomilu.';
  } else if (!v.opened[ME]) {
    const pts = stagedPoints(v);
    hint.innerHTML = v.tookDiscard
      ? `Uzeli ste kartu sa gomile — morate se otvoriti sa njom (${pts}/${v.openingPoints}) ili je vratiti.`
      : staged.length
        ? `Priprema otvaranja: <b>${pts}</b>/${v.openingPoints} poena.`
        : 'Izaberite karte za kombinaciju, ili jednu kartu za odbacivanje.';
    btns.push(button('Dodaj kombinaciju', () => { staged.push(sel.map(c => c.id)); selected.clear(); render(); },
      { disabled: !selMeld, title: 'Niz ili komplet od izabranih karata' }));
    const includesTaken = !v.tookDiscard || staged.flat().includes(v.tookDiscard);
    btns.push(button(`Otvori (${pts})`, humanOpen, { primary: true, disabled: pts < v.openingPoints || !includesTaken || !staged.length }));
    if (staged.length) btns.push(button('Poništi pripremu', () => { staged = []; render(); }));
    if (v.tookDiscard) btns.push(button('Vrati kartu na gomilu', humanReturn));
  } else {
    hint.innerHTML = 'Spuštajte kombinacije, dopišite (izaberite kartu pa kliknite kombinaciju na stolu), pa odbacite jednu kartu.';
    btns.push(button('Spusti kombinaciju', () => humanMeld(sel.map(c => c.id)), { primary: !!selMeld, disabled: !selMeld }));
  }

  if (myTurn && v.phase === 'PLAY') {
    const one = sel.length === 1 ? sel[0] : null;
    const canDiscard = one && legalDiscards(v.hand, v.takenCard).some(c => c.id === one.id) && !(v.tookDiscard && !v.opened[ME]) && !staged.flat().includes(one.id);
    btns.push(button(one ? `Odbaci ${cardName(one)}` : 'Odbaci', () => humanDiscard(one.id), { disabled: !canDiscard, primary: !!canDiscard && !selMeld }));
    btns.push(button('Predlog', suggest));
  }
  btns.push(button(sortMode === 'suit' ? 'Sortiraj po broju' : 'Sortiraj po boji', () => { sortMode = sortMode === 'suit' ? 'rank' : 'suit'; render(); }));
  actions.replaceChildren(...btns);
}

// ---------- potezi čoveka ----------

function attempt(fn) {
  try {
    fn();
    return true;
  } catch (e) {
    if (e instanceof RemiError) { toast(e.message); return false; }
    throw e;
  }
}

function humanDraw() {
  let card;
  if (!attempt(() => { card = game.drawStock(ME); })) return;
  freshId = card?.id ?? null;
  after();
}

function humanTake() {
  let card;
  if (!attempt(() => { card = game.takeDiscard(ME); })) return;
  freshId = card.id;
  after();
}

function humanReturn() {
  if (!attempt(() => game.returnDiscard(ME))) return;
  staged = staged.filter(g => !g.includes(freshId));
  freshId = null;
  after();
}

function humanOpen() {
  if (!attempt(() => game.meld(ME, staged))) return;
  toast('Otvorili ste se!');
  staged = [];
  selected.clear();
  after();
}

function humanMeld(ids) {
  if (!attempt(() => game.meld(ME, [ids]))) return;
  selected.clear();
  after();
}

function humanLayoff(meldId) {
  const v = view();
  const ids = [...selected];
  const meld = v.melds.find(m => m.id === meldId);
  // jedna karta koja menja džokera → zamena
  if (ids.length === 1) {
    const c = v.hand.find(x => x.id === ids[0]);
    if (c && swapJoker(meld, c) && !extendMeld(meld, [c])) {
      if (!attempt(() => game.swapJoker(ME, meldId, c.id))) return;
      toast('Uzeli ste džokera!');
      selected.clear();
      after();
      return;
    }
  }
  if (!attempt(() => game.layoff(ME, meldId, ids))) return;
  selected.clear();
  after();
}

function humanDiscard(id) {
  if (!attempt(() => game.discard(ME, id))) return;
  selected.clear();
  staged = [];
  freshId = null;
  after();
}

function suggest() {
  const v = view();
  if (!v.opened[ME]) {
    const plan = bestMelds(v.hand, { mustInclude: v.tookDiscard });
    if (plan.points >= v.openingPoints) {
      staged = plan.groups;
      selected.clear();
      toast(`Možete da se otvorite sa ${plan.points} poena.`);
    } else {
      toast(plan.points ? `Najviše ${plan.points} poena — još nije dovoljno za otvaranje.` : 'Nema kombinacija u ruci.');
      const a = chooseAction(v, 'medium');
      if (a.type === 'discard') selected = new Set([a.cardId]);
    }
  } else {
    const a = chooseAction(v, 'medium');
    selected = new Set(a.type === 'meld' ? a.groups[0] : a.type === 'layoff' ? a.cardIds : a.type === 'swap' || a.type === 'discard' ? [a.cardId] : []);
    const msg = { meld: 'Predlog: spustite ovu kombinaciju.', layoff: 'Predlog: dopišite ovu kartu na sto.', swap: 'Predlog: ovom kartom uzmite džokera sa stola.', discard: 'Predlog: odbacite ovu kartu.' }[a.type];
    if (msg) toast(msg);
  }
  render();
}

// ---------- tok igre ----------

function after() {
  save();
  render();
  step();
}

function step() {
  clearTimeout(timer);
  const s = game.getState();
  if (s.phase === 'DEAL_END' || s.phase === 'MATCH_END') { showDealEnd(); return; }
  if (s.turn === ME) return;
  const p = s.turn;
  timer = setTimeout(() => {
    const v = game.getPlayerView(p);
    const a = chooseAction(v, level);
    const name = NAMES[p];
    try {
      switch (a.type) {
        case 'draw': game.drawStock(p); break;
        case 'take': { const c = game.takeDiscard(p); toast(`${name} uzima ${cardName(c)} sa gomile`); break; }
        case 'return': game.returnDiscard(p); break;
        case 'meld': {
          const opening = !v.opened[p];
          game.meld(p, a.groups);
          if (opening) toast(`${name} se otvorio!`);
          break;
        }
        case 'layoff': game.layoff(p, a.meldId, a.cardIds); break;
        case 'swap': game.swapJoker(p, a.meldId, a.cardId); toast(`${name} uzima džokera sa stola`); break;
        case 'discard': game.discard(p, a.cardId); break;
      }
    } catch (e) {
      // AI ne bi smeo da pogreši — ako ipak, odbaci bilo šta da igra ne stane
      console.error('AI potez odbijen', a, e);
      const hand = game.getState().hands[p];
      const fallback = hand.find(c => !c.joker) ?? hand[0];
      if (game.getState().phase === 'DRAW') game.drawStock(p);
      else if (fallback) attempt(() => game.discard(p, fallback.id));
    }
    save();
    render();
    step();
  }, a_delay());
}

function a_delay() {
  const s = game.getState();
  return s.phase === 'DRAW' ? DELAY : Math.round(DELAY * 0.8);
}

// ---------- kraj partije ----------

function showDealEnd() {
  const s = game.getState();
  const last = s.history.at(-1);
  if (!last) return;
  const finished = s.phase === 'MATCH_END';
  const n = s.playerCount;
  $('dealEndTitle').textContent = finished
    ? (s.winners.includes(ME) ? 'Pobeda u meču! 🎉' : `Meč je dobio: ${s.winners.map(p => NAMES[p]).join(', ')}`)
    : last.winner === null ? 'Nestalo je karata — partija bez pobednika'
    : last.handRemi ? `${NAMES[last.winner]}: REMI IZ RUKE!` : `${NAMES[last.winner]} je završio`;
  const min = Math.min(...s.scores);
  $('dealEndBody').innerHTML = Array.from({ length: n }, (_, p) =>
    `<tr><td>${esc(NAMES[p])}</td><td>${fmt(last.points[p])}</td><td class="${s.scores[p] === min ? 'best' : ''}">${s.scores[p]}</td></tr>`).join('');
  $('dealEndNote').textContent = 'Pobednik −40 (remi iz ruke −80, tada ostali duplo). Otvoreni plaćaju karte iz ruke (džoker 20), neotvoreni 100. Manje je bolje.';
  $('nextDealBtn').textContent = finished ? 'Nova igra' : 'Sledeća partija';
  if (!$('dealEnd').open) $('dealEnd').showModal();
}

const fmt = x => (x > 0 ? `+${x}` : String(x));

function renderSheet() {
  const s = game.getState();
  const n = s.playerCount;
  let html = `<thead><tr><th>#</th>${NAMES.slice(0, n).map(x => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>`;
  for (const h of s.history) html += `<tr><td>${h.dealNo}${h.handRemi ? ' ★' : ''}</td>${h.points.map(x => `<td>${fmt(x)}</td>`).join('')}</tr>`;
  html += `<tr class="total"><td>Ukupno</td>${s.scores.map(x => `<td>${x}</td>`).join('')}</tr></tbody>`;
  $('sheetTable').innerHTML = html;
  $('sheet').showModal();
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
}

// ---------- dugmad ----------

$('nextDealBtn').addEventListener('click', () => {
  $('dealEnd').close();
  if (game.getState().phase === 'MATCH_END') { newGame(); return; }
  game.nextDeal();
  resetTurnUi();
  after();
});
$('dealEnd').addEventListener('cancel', e => e.preventDefault());
$('sheetBtn').addEventListener('click', renderSheet);
$('closeSheetBtn').addEventListener('click', () => $('sheet').close());
$('menuBtn').addEventListener('click', () => {
  $('levelSel').value = level;
  $('playersSel').value = String(players);
  $('menu').showModal();
});
$('closeMenuBtn').addEventListener('click', () => $('menu').close());
$('levelSel').addEventListener('change', e => { level = e.target.value; save(); });
$('playersSel').addEventListener('change', e => { players = Number(e.target.value); });
$('newGameBtn').addEventListener('click', () => { $('menu').close(); newGame(); });
window.addEventListener('resize', () => render());

// ---------- start ----------

if (load()) { render(); step(); }
else newGame();

window.__remi = { get game() { return game; }, ME, penaltyPoints };
