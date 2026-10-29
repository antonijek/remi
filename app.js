// UI za Remi — tanak sloj nad engine-om (engine/dist). Svaki potez čoveka je podatak
// ({ type: 'draw' | 'take' | 'meld' | ... }) i ide kroz act(): protiv računara se primeni na
// igru ovde, a u online igri (online.js) šalje serveru.

import { RemiGame, RemiError, applyAction, chooseAction, bestMelds, swapJoker, extendMeld, penaltyPoints } from './engine/dist/index.js';
import { cardName } from './ui/cards.js';
import { ME, playerName, renderSeats } from './ui/seats.js';
import { renderMelds, renderPiles, renderStaged } from './ui/table.js';
import { renderHand } from './ui/hand.js';
import { renderActions } from './ui/actions.js';
import { fillDealEnd, renderSheet } from './ui/deal-end.js';
import { loadGame, saveGame } from './ui/storage.js';
import { toast } from './ui/toast.js';
import { initOnline } from './online.js';

const FAST = new URLSearchParams(location.search).has('fast');
const DELAY = FAST ? 0 : 650;
const $ = id => document.getElementById(id);

let game;
let players = 4;
let timer = null;
let online = null; // dok je online.active, sto crta stanje sa servera
const ui = { selected: new Set(), staged: [], sortMode: 'suit', freshId: null, locked: false };

const save = () => saveGame(game, players, toast);
const view = () => (online?.active ? online.view() : game.getPlayerView(ME));

function resetTurnUi() {
  ui.selected = new Set();
  ui.staged = [];
  ui.freshId = null;
}

function newGame() {
  if (online?.active) { toast('Prvo napustite online igru (☰ → Napusti online igru).'); return; }
  clearTimeout(timer);
  game = new RemiGame({ players });
  resetTurnUi();
  save();
  render();
  step();
}

// ---------- render ----------

const handlers = {
  draw: () => humanAct({ type: 'draw' }, card => { ui.freshId = card?.id ?? null; }),
  take: () => humanAct({ type: 'take' }, card => { ui.freshId = card?.id ?? null; }),
  returnCard: () => humanAct({ type: 'return' }, () => {
    ui.staged = ui.staged.filter(g => !g.includes(ui.freshId));
    ui.freshId = null;
  }),
  open: () => humanAct({ type: 'meld', groups: ui.staged }, () => { toast('Otvorili ste se!'); ui.staged = []; ui.selected.clear(); }),
  meld: ids => humanAct({ type: 'meld', groups: [ids] }, () => ui.selected.clear()),
  layoff: meldId => layoffOrSwap(meldId),
  discard: id => humanAct({ type: 'discard', cardId: id }, () => { ui.selected.clear(); ui.staged = []; ui.freshId = null; }),
  stage: () => { ui.staged.push([...ui.selected]); ui.selected.clear(); render(); },
  unstage: i => { ui.staged.splice(i, 1); render(); },
  clearStaged: () => { ui.staged = []; render(); },
  toggle: id => { if (ui.selected.has(id)) ui.selected.delete(id); else ui.selected.add(id); render(); },
  sort: () => { ui.sortMode = ui.sortMode === 'suit' ? 'rank' : 'suit'; render(); },
  suggest: () => suggest(),
};

function render() {
  const v = view();
  ui.locked = Boolean(online?.waiting);
  const where = online?.active ? `Soba ${online.room().code} · partija ${v.dealNo}` : `Partija ${v.dealNo}`;
  $('dealInfo').textContent = `${where} · deli ${playerName(v.dealer)}`;
  renderSeats(v);
  renderPiles(v, ui, handlers);
  renderMelds(v, ui, handlers);
  renderStaged(v, ui, handlers);
  renderHand(v, ui, handlers);
  // u igri sa ljudima nema pomoći računara
  renderActions(v, ui, online?.active ? { ...handlers, suggest: null } : handlers);
}

// ---------- potezi čoveka ----------

/** Pošalji potez; posle uspeha pozovi done(uzeta karta). */
function humanAct(action, done = () => undefined) {
  if (online?.active) {
    online.act(action);
    done(null);
    render();
    return;
  }
  let card;
  try {
    card = applyAction(game, ME, action);
  } catch (e) {
    if (e instanceof RemiError) { toast(e.message); return; }
    throw e;
  }
  done(card);
  after();
}

function layoffOrSwap(meldId) {
  const v = view();
  const ids = [...ui.selected];
  const meld = v.melds.find(m => m.id === meldId);
  // jedna karta koja menja džokera (a ne može da se dopiše) → zamena
  if (ids.length === 1) {
    const c = v.hand.find(x => x.id === ids[0]);
    if (c && swapJoker(meld, c) && !extendMeld(meld, [c])) {
      humanAct({ type: 'swap', meldId, cardId: c.id }, () => { toast('Uzeli ste džokera!'); ui.selected.clear(); });
      return;
    }
  }
  humanAct({ type: 'layoff', meldId, cardIds: ids }, () => ui.selected.clear());
}

function suggest() {
  const v = view();
  if (!v.opened[ME]) {
    const plan = bestMelds(v.hand, { mustInclude: v.tookDiscard });
    if (plan.points >= v.openingPoints) {
      ui.staged = plan.groups;
      ui.selected.clear();
      toast(`Možete da se otvorite sa ${plan.points} poena.`);
    } else {
      toast(plan.points ? `Najviše ${plan.points} poena — još nije dovoljno za otvaranje.` : 'Nema kombinacija u ruci.');
      const a = chooseAction(v, 'hard');
      if (a.type === 'discard') ui.selected = new Set([a.cardId]);
    }
  } else {
    const a = chooseAction(v, 'hard');
    ui.selected = new Set(a.type === 'meld' ? a.groups[0] : a.type === 'layoff' ? a.cardIds
      : a.type === 'swap' || a.type === 'discard' ? [a.cardId] : []);
    const msg = { meld: 'Predlog: spustite ovu kombinaciju.', layoff: 'Predlog: dopišite ovu kartu na sto.',
      swap: 'Predlog: ovom kartom uzmite džokera sa stola.', discard: 'Predlog: odbacite ovu kartu.' }[a.type];
    if (msg) toast(msg);
  }
  render();
}

// ---------- tok igre protiv računara ----------

function after() {
  save();
  render();
  step();
}

function aiMove(p) {
  const v = game.getPlayerView(p);
  const a = chooseAction(v, 'hard');
  const name = playerName(p);
  try {
    const card = applyAction(game, p, a);
    if (a.type === 'take') toast(`${name} uzima ${cardName(card)} sa gomile`);
    if (a.type === 'meld' && !v.opened[p]) toast(`${name} se otvorio!`);
    if (a.type === 'swap') toast(`${name} uzima džokera sa stola`);
  } catch (e) {
    // AI ne bi smeo da pogreši — ako ipak, vuče ili odbaci bilo šta, da igra ne stane
    console.error('AI potez odbijen', a, e);
    const hand = game.getState().hands[p];
    const fallback = hand.find(c => !c.joker) ?? hand[0];
    if (game.getState().phase === 'DRAW') game.drawStock(p);
    else if (fallback) game.discard(p, fallback.id);
  }
}

function step() {
  clearTimeout(timer);
  if (online?.active) return;
  const s = game.getState();
  if (s.phase === 'DEAL_END' || s.phase === 'MATCH_END') { showDealEnd(); return; }
  if (s.turn === ME) return;
  timer = setTimeout(() => {
    aiMove(s.turn);
    save();
    render();
    step();
  }, s.phase === 'DRAW' ? DELAY : Math.round(DELAY * 0.8));
}

function showDealEnd() {
  if (fillDealEnd(view()) && !$('dealEnd').open) $('dealEnd').showModal();
}

// ---------- dugmad ----------

$('nextDealBtn').addEventListener('click', () => {
  if (online?.active) {
    if (online.room().status === 'FINISHED') { $('dealEnd').close(); online.leaveFinished(); return; }
    online.ready();
    $('nextDealBtn').disabled = true;
    $('nextDealBtn').textContent = 'Čeka se ostale…';
    return;
  }
  $('dealEnd').close();
  if (game.getState().phase === 'MATCH_END') { newGame(); return; }
  game.nextDeal();
  resetTurnUi();
  after();
});
$('dealEnd').addEventListener('cancel', e => e.preventDefault());
$('sheetBtn').addEventListener('click', () => renderSheet(view()));
$('closeSheetBtn').addEventListener('click', () => $('sheet').close());
$('menuBtn').addEventListener('click', () => {
  $('playersSel').value = String(players);
  $('leaveOnlineBtn').hidden = !online?.active;
  $('menu').showModal();
});
$('closeMenuBtn').addEventListener('click', () => $('menu').close());
$('playersSel').addEventListener('change', e => { players = Number(e.target.value); });
$('newGameBtn').addEventListener('click', () => { $('menu').close(); newGame(); });
$('leaveOnlineBtn').addEventListener('click', () => { $('menu').close(); online.leave(); });
$('onlineBtn').addEventListener('click', () => online.open());
window.addEventListener('resize', () => render());

// ---------- online ----------

online = initOnline({
  render,
  toast,
  setNames: null,
  enter: () => { clearTimeout(timer); resetTurnUi(); },
  exit: () => {
    if ($('dealEnd').open) $('dealEnd').close();
    resetTurnUi();
    render();
    step();
  },
  newTurnState: () => { ui.selected.clear(); },
  dealEnd: (v, room) => {
    fillDealEnd(v);
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
  },
  closeDealEnd: () => { if ($('dealEnd').open) $('dealEnd').close(); },
});

// ---------- start ----------

const saved = loadGame(toast);
if (saved) {
  ({ game, players } = saved);
  render();
  step();
} else {
  newGame();
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(e => console.error('Rad bez interneta nije uključen:', e));
}

window.__remi = { get game() { return game; }, get online() { return online; }, ME, penaltyPoints };
