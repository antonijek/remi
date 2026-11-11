// UI za Remi — tanak sloj nad engine-om (engine/dist). Svaki potez čoveka je podatak
// ({ type: 'draw' | 'take' | 'meld' | ... }) i ide kroz act(): protiv računara se primeni na
// igru ovde, a u online igri (online.js) šalje serveru.

import { RemiGame, RemiError, applyAction, penaltyPoints } from './engine/dist/index.js';
import { aiMove } from './ui/ai-turn.js';
import { layoffAction, suggestMove } from './ui/suggest.js';
import { showOnlineDealEnd } from './ui/online-end.js';
import { ME, playerName, renderSeats } from './ui/seats.js';
import { renderMelds, renderPiles, renderStaged } from './ui/table.js';
import { renderHand } from './ui/hand.js';
import { renderActions } from './ui/actions.js';
import { fillDealEnd, renderSheet } from './ui/deal-end.js';
import { SAVE_KEY, loadGame, saveGame } from './ui/storage.js';
import * as daily from './ui/daily.js';
import { fillDailyEnd, showDailyDone } from './ui/daily-ui.js';
import { toast } from './ui/toast.js';
import { playSound, setSoundOn, soundOn } from './ui/sound.js';
import { resetSounds, soundsFor } from './ui/sound-events.js';
import { countVisit } from './ui/visit.js';
import { initFeedback } from './ui/feedback.js';
import { initInstall } from './ui/install.js';
import { initAvatar } from './ui/avatar.js';
import { initLeagues } from './ui/leagues.js';
import { initOnline } from './online.js';

const FAST = new URLSearchParams(location.search).has('fast');
const DELAY = FAST ? 0 : 650;
const $ = id => document.getElementById(id);

let game;
let players = 4;
let timer = null;
let slot = SAVE_KEY;  // gde se čuva partija (obična ili dnevni izazov)
let dailyKey = null;  // datum izazova, ili null u običnoj igri
let refreshAvatar = () => undefined;
let online = null; // dok je online.active, sto crta stanje sa servera
const ui = { selected: new Set(), staged: [], sortMode: 'suit', freshId: null, locked: false };

const save = () => saveGame(game, game.getState().playerCount, toast, slot);
const view = () => (online?.active ? online.view() : game.getPlayerView(ME));

function resetTurnUi() {
  ui.selected = new Set();
  ui.staged = [];
  ui.freshId = null;
}

function newGame() {
  if (online?.active) { toast('Prvo napustite online igru (☰ → Napusti online igru).'); return; }
  clearTimeout(timer);
  slot = SAVE_KEY;
  dailyKey = null;
  game = new RemiGame({ players });
  resetSounds();
  resetTurnUi();
  save();
  render();
  step();
}

/** Dnevni izazov: ista partija za sve (seed = datum), 1 na 1, jedan pokušaj dnevno. */
function startDaily() {
  if (online?.active) { toast('Prvo napustite online igru (☰ → Napusti online igru).'); return; }
  const key = daily.todayKey();
  const results = daily.loadResults(toast);
  if (results[key]) { showDailyDone(key, results, toast); return; }
  clearTimeout(timer);
  slot = daily.stateSlot(key, toast);
  dailyKey = key;
  game = loadGame(toast, slot)?.game ?? new RemiGame({ players: 2, seed: daily.seedFor(key) });
  resetSounds();
  resetTurnUi();
  save();
  render();
  step();
}

/** Posle izazova nazad na običnu partiju (sačuvanu ili novu). */
function resumeNormal() {
  clearTimeout(timer);
  slot = SAVE_KEY;
  dailyKey = null;
  const saved = loadGame(toast);
  if (!saved) { newGame(); return; }
  ({ game, players } = saved);
  resetSounds();
  resetTurnUi();
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
  const where = online?.active ? `Soba ${online.room().code} · partija ${v.dealNo}`
    : dailyKey ? `Dnevni izazov ${daily.dayLabel(dailyKey)}` : `Partija ${v.dealNo}`;
  $('dealInfo').textContent = `${where} · deli ${playerName(v.dealer)}`;
  renderSeats(v);
  renderPiles(v, ui, handlers);
  renderMelds(v, ui, handlers);
  renderStaged(v, ui, handlers);
  renderHand(v, ui, handlers);
  // u igri sa ljudima nema pomoći računara
  renderActions(v, ui, online?.active ? { ...handlers, suggest: null } : handlers);
  soundsFor(v, { online: Boolean(online?.active) });
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
  const action = layoffAction(view(), [...ui.selected], meldId);
  humanAct(action, () => {
    if (action.type === 'swap') toast('Uzeli ste džokera!');
    ui.selected.clear();
  });
}

function suggest() {
  suggestMove(view(), ui, ME, toast);
  render();
}

// ---------- tok igre protiv računara ----------

function after() {
  save();
  render();
  step();
}

function step() {
  clearTimeout(timer);
  if (online?.active) return;
  const s = game.getState();
  if (s.phase === 'DEAL_END' || s.phase === 'MATCH_END') { showDealEnd(); return; }
  if (s.turn === ME) return;
  timer = setTimeout(() => {
    aiMove(game, s.turn, toast);
    save();
    render();
    step();
  }, s.phase === 'DRAW' ? DELAY : Math.round(DELAY * 0.8));
}

function showDealEnd() {
  if (!fillDealEnd(view())) return;
  $('shareBtn').hidden = !dailyKey;
  if (dailyKey) fillDailyEnd(view(), dailyKey, toast);
  if (!$('dealEnd').open) $('dealEnd').showModal();
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
  if (dailyKey) { resumeNormal(); return; }
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
function showSoundBtn() {
  $('soundBtn').textContent = soundOn() ? '🔊 Zvuk: uključen' : '🔇 Zvuk: isključen';
}
$('soundBtn').addEventListener('click', () => {
  if (!setSoundOn(!soundOn())) toast('Izbor zvuka se ne može zapamtiti u ovom pregledaču.');
  showSoundBtn();
  playSound('card');
});
showSoundBtn();
$('closeMenuBtn').addEventListener('click', () => $('menu').close());
$('playersSel').addEventListener('change', e => { players = Number(e.target.value); });
$('dailyBtn').addEventListener('click', () => { $('menu').close(); startDaily(); });
$('closeDailyBtn').addEventListener('click', () => $('dailyDone').close());
$('newGameBtn').addEventListener('click', () => { $('menu').close(); newGame(); });
$('leaveOnlineBtn').addEventListener('click', () => { $('menu').close(); online.leave(); });
$('onlineBtn').addEventListener('click', () => online.open());
window.addEventListener('resize', () => render());

// ---------- online ----------

online = initOnline({
  render,
  onConnect: () => refreshAvatar(),
  toast,
  setNames: null,
  enter: () => { clearTimeout(timer); resetTurnUi(); resetSounds(); },
  exit: () => {
    if ($('dealEnd').open) $('dealEnd').close();
    resetTurnUi();
    resetSounds();
    render();
    step();
  },
  newTurnState: () => { ui.selected.clear(); },
  dealEnd: showOnlineDealEnd,
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

if (new URLSearchParams(location.search).has('izazov')) startDaily();

countVisit('remi');
initFeedback({ token: () => online.token() });
initInstall();
initLeagues({ token: () => online.token(), toast });
refreshAvatar = initAvatar({ token: () => online.token(), name: () => online.me()?.name, changed: render });

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(e => console.error('Rad bez interneta nije uključen:', e));
}

window.__remi = { get game() { return game; }, get online() { return online; }, ME, penaltyPoints };
