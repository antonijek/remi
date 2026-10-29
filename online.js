// Online igra sa ljudima: prijava (isti nalog kao Preferans i Lora — server Remija je
// prosleđuje Preferansu), lobi, čekaonica i igra. Server je jedini izvor istine: ovde se
// samo prikazuje ono što on pošalje i šalju se potezi.

import { rotateView } from './ui/rotate.js';
import { setNames } from './ui/seats.js';
import * as lobby from './ui/online-lobby.js';

const TOKEN_KEY = 'remi_token';
const REFRESH_MS = 5000;     // osvežavanje spiska soba i igrača dok je lobi otvoren
const $ = id => document.getElementById(id);

function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch (e) {
    console.warn('Prijava se ne može pročitati iz pregledača:', e);
    return null;
  }
}

function saveToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch (e) {
    console.warn('Prijava se ne može sačuvati u pregledaču:', e);
  }
}

function loadSocketIo() {
  return new Promise((resolve, reject) => {
    if (typeof io !== 'undefined') return resolve();
    const s = document.createElement('script');
    s.src = '/socket.io/socket.io.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Online server nije dostupan.'));
    document.head.append(s);
  });
}

const playing = v => v.phase === 'DRAW' || v.phase === 'PLAY';

export function initOnline(hooks) {
  let token = readToken();
  let socket = null;
  let me = null;
  let registering = false;
  let wanted = Boolean(new URLSearchParams(location.search).get('soba')); // korisnik je tražio online
  let pendingJoin = new URLSearchParams(location.search).get('soba');
  let room = null;       // poslednje stanje sobe sa servera
  let shown = null;      // okrenut prikaz koji je sada na ekranu
  const queue = [];
  let busy = false;
  let lastEnd = null;
  let unread = 0;
  let refreshTimer = null;
  let sent = false;      // poslat potez, čeka se odgovor servera (sto je zaključan)

  const ctl = {
    get active() { return Boolean(shown); },
    get waiting() { return sent; },
    view: () => shown,
    room: () => room,
    open() { wanted = true; token ? connect() : showLogin(); },
    act(action) { sent = true; socket?.emit('game:play', action); },
    ready() { socket?.emit('game:ready'); },
    leave() { socket?.emit('room:leave'); },
    leaveFinished() { socket?.emit('room:leaveFinished'); },
  };

  // ---------------------------------------------------------------- prijava

  function showLogin(msg) {
    stopRefresh();
    lobby.setLoginMode(registering);
    lobby.lobbyMessage(msg);
    lobby.showPanel('loginPanel');
  }

  $('loginToggle').addEventListener('click', () => { registering = !registering; lobby.setLoginMode(registering); });
  $('loginPanel').addEventListener('submit', async e => {
    e.preventDefault();
    $('loginError').textContent = '';
    $('loginSubmit').disabled = true;
    try {
      const res = await fetch(`/api/${registering ? 'register' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: $('loginEmail').value.trim(), password: $('loginPassword').value, name: $('loginName').value.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.token) { $('loginError').textContent = data.error || 'Prijava nije uspela.'; return; }
      token = data.token;
      saveToken(token);
      connect();
    } catch (err) {
      $('loginError').textContent = `Ne mogu da se povežem sa serverom (${err.message}).`;
    } finally {
      $('loginSubmit').disabled = false;
    }
  });

  function logout() {
    token = null;
    saveToken(null);
    socket?.disconnect();
    socket = null;
    showLogin('Odjavljeni ste.');
  }

  // ---------------------------------------------------------------- veza

  async function connect() {
    try {
      await loadSocketIo();
    } catch (e) {
      if (wanted) showLogin(e.message);
      return;
    }
    socket?.disconnect();
    socket = io({ auth: { token } });
    socket.on('connect', async () => {
      lobby.lobbyMessage(null);
      try {
        const res = await fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } });
        me = (await res.json()).user ?? me;
        if (!$('lobbyPanel').hidden) refreshLobby();
      } catch (e) {
        lobby.lobbyMessage(`Nalog nije učitan (${e.message}).`);
      }
    });
    socket.on('connect_error', err => {
      if (/token/i.test(err.message)) { token = null; saveToken(null); if (wanted) showLogin('Prijavite se ponovo.'); socket.disconnect(); return; }
      if (wanted) lobby.lobbyMessage(err.message === 'Auth server unavailable'
        ? 'Server za naloge trenutno ne radi. Pokušavam ponovo…' : 'Nema veze sa serverom. Pokušavam ponovo…');
    });
    socket.on('room:none', onNoRoom);
    socket.on('room:state', s => { queue.push(s); if (!busy) step(); });
    socket.on('game:error', msg => { sent = false; hooks.toast(msg); hooks.render(); });
    socket.on('chat:backlog', list => { $('chatList').replaceChildren(); list.forEach(lobby.addChatLine); });
    socket.on('chat:message', msg => {
      lobby.addChatLine(msg);
      if (!$('chatDialog').open) { unread++; updateChat(); }
    });
    socket.on('room:invited', ({ code, from }) => {
      $('joinCode').value = code;
      hooks.toast(`${from} vas poziva u sobu ${code}. Kliknite 🌐 pa „Uđi“.`);
    });
    socket.on('session:replaced', () => {
      lobby.lobbyMessage('Igra je otvorena na drugom uređaju. Kliknite 🌐 da igrate ovde.');
      leaveTable();
      lobby.showPanel('lobbyPanel');
    });
  }

  function onNoRoom() {
    leaveTable();
    if (pendingJoin) {
      const code = pendingJoin;
      pendingJoin = null;
      socket.emit('room:join', { code }, res => { if (res?.error) showLobby(res.error); });
      return;
    }
    if (wanted) showLobby();
  }

  /** Napusti prikaz stola (posle izlaska iz sobe) i vrati igru protiv računara. */
  function leaveTable() {
    room = null;
    queue.length = 0;
    busy = false;
    $('chatBtn').hidden = true;
    if (shown) {
      shown = null;
      setNames(null);
      hooks.exit();
    }
  }

  // ---------------------------------------------------------------- lobi

  function showLobby(msg) {
    lobby.lobbyMessage(msg);
    lobby.showPanel('lobbyPanel');
    refreshLobby();
    startRefresh();
  }

  function refreshLobby() {
    if (!socket) return;
    socket.emit('room:list', null, res => lobby.renderRooms(res?.rooms ?? [], join));
    socket.emit('presence:list', null, res => {
      const users = res?.users ?? [];
      const mine = users.find(u => u.userId === me?.id);
      if (me) lobby.renderMe(me, mine?.rating ?? 1000);
      const invite = room?.status === 'WAITING' ? id => socket.emit('room:invite', { userId: id }) : null;
      lobby.renderOnlineUsers(users, me?.id, invite);
    });
    fetch('/api/leaderboard').then(r => r.json()).then(d => lobby.renderTop(d.players ?? []))
      .catch(e => console.warn('Rang lista nije učitana:', e));
  }

  function startRefresh() {
    stopRefresh();
    refreshTimer = setInterval(() => { if (!$('lobby').hidden) refreshLobby(); else stopRefresh(); }, REFRESH_MS);
  }

  function stopRefresh() {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }

  const answer = res => { if (res?.error) lobby.lobbyMessage(res.error); };
  const join = code => socket.emit('room:join', { code }, answer);
  $('quickBtn').addEventListener('click', () => socket?.emit('room:quick', null, answer));
  $('createBtn').addEventListener('click', () => socket?.emit('room:create', { players: Number($('newRoomPlayers').value) }, answer));
  $('joinBtn').addEventListener('click', () => join($('joinCode').value.trim().toUpperCase()));
  $('logoutBtn').addEventListener('click', logout);
  $('lobbyCloseBtn').addEventListener('click', () => { wanted = false; lobby.hideLobby(); stopRefresh(); });
  $('waitPlayers').addEventListener('change', e => socket?.emit('room:setPlayers', { players: Number(e.target.value) }));
  $('startBtn').addEventListener('click', () => socket?.emit('room:start'));
  $('leaveBtn').addEventListener('click', () => socket?.emit('room:leave'));
  $('copyLinkBtn').addEventListener('click', async () => {
    const url = `${location.origin}/?soba=${room?.code ?? ''}`;
    try {
      if (navigator.share) await navigator.share({ text: `Hajde na Remi! Soba ${room?.code}`, url });
      else { await navigator.clipboard.writeText(url); hooks.toast('Link je kopiran — pošaljite ga prijatelju.'); }
    } catch (e) {
      if (e.name !== 'AbortError') hooks.toast(`Link: ${url}`);
    }
  });

  // ---------------------------------------------------------------- chat

  function updateChat() {
    $('chatBtn').hidden = !room;
    $('chatBadge').hidden = unread === 0;
    $('chatBadge').textContent = unread;
  }
  $('chatBtn').addEventListener('click', () => { unread = 0; updateChat(); $('chatDialog').showModal(); });
  $('closeChatBtn').addEventListener('click', () => $('chatDialog').close());
  $('chatForm').addEventListener('submit', e => {
    e.preventDefault();
    const text = $('chatInput').value.trim();
    if (text) socket?.emit('chat:send', { text });
    $('chatInput').value = '';
  });

  // ---------------------------------------------------------------- stanje sobe

  function namesFor(s) {
    const n = s.players;
    return Array.from({ length: n }, (_, l) => {
      if (l === 0) return 'Vi';
      const seat = s.seats[(l + s.mySeat) % n];
      return seat.kind === 'human' ? seat.name : 'Računar';
    });
  }

  function step() {
    const s = queue.shift();
    if (!s) { busy = false; return; }
    busy = true;
    room = s;
    sent = false;
    updateChat();
    if (s.status === 'WAITING' || !s.view) {
      if (shown) leaveTable();
      room = s;
      lobby.lobbyMessage(null);
      lobby.renderWaiting(s, {
        onAddAi: seat => socket.emit('room:addAi', { seat }),
        onRemoveAi: seat => socket.emit('room:removeAi', { seat }),
      });
      lobby.showPanel('waitPanel');
      refreshLobby();
      startRefresh();
      step();
      return;
    }
    stopRefresh();
    lobby.hideLobby();
    const v = rotateView(s.view, s.mySeat);
    setNames(namesFor(s));
    apply(v);
    step();
  }

  function apply(v) {
    const first = !shown;
    const wasEnd = shown && !playing(shown);
    shown = v;
    if (first) hooks.enter();
    hooks.render();
    if (playing(v)) {
      if (wasEnd) hooks.closeDealEnd();
      return;
    }
    const key = `${room.code}:${v.dealNo}:${v.phase}`;
    if (lastEnd !== key) {
      lastEnd = key;
      hooks.dealEnd(v, room);
    }
  }

  if (token) connect();
  else if (pendingJoin) showLogin('Prijavite se da biste ušli u sobu na koju ste pozvani.');
  return ctl;
}
