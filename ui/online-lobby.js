// Lobi online igre: prikaz panela (prijava, lobi, čekaonica) i spiskova. Bez logike igre i
// bez veze sa serverom — online.js odlučuje šta se prikazuje i šta se šalje.

const $ = id => document.getElementById(id);
const PANELS = ['loginPanel', 'lobbyPanel', 'waitPanel'];
const PLAYERS_LABEL = { 2: '2 igrača', 3: '3 igrača', 4: '4 igrača' };

export function showPanel(panel) {
  $('lobby').hidden = false;
  for (const p of PANELS) $(p).hidden = p !== panel;
}

export function hideLobby() {
  $('lobby').hidden = true;
}

export function lobbyMessage(text) {
  $('lobbyMsg').textContent = text ?? '';
  $('lobbyMsg').hidden = !text;
}

export function setLoginMode(registering) {
  $('loginNameRow').hidden = !registering;
  $('loginName').required = registering;
  $('loginSubmit').textContent = registering ? 'Napravi nalog' : 'Prijavi se';
  $('loginToggle').textContent = registering ? 'Već imate nalog? Prijavite se' : 'Nemate nalog? Registrujte se';
  $('loginPassword').autocomplete = registering ? 'new-password' : 'current-password';
}

function item(text, actions = []) {
  const li = document.createElement('li');
  const span = document.createElement('span');
  span.textContent = text;
  li.append(span);
  for (const [label, onClick, cls] of actions) {
    const b = document.createElement('button');
    b.className = `btn ${cls ?? ''}`;
    b.textContent = label;
    b.addEventListener('click', onClick);
    li.append(b);
  }
  return li;
}

function fill(listId, items, emptyText) {
  $(listId).replaceChildren(...(items.length ? items : [item(emptyText)]));
}

export function renderRooms(rooms, onJoin) {
  fill('roomList', rooms.map(r => item(
    `${r.host ?? '?'} · ${PLAYERS_LABEL[r.players]} · ${r.seated}/${r.players}`,
    [['Uđi', () => onJoin(r.code)]],
  )), 'Nema otvorenih soba — napravite svoju ili kliknite „Brza igra“.');
}

export function renderTop(players) {
  fill('topList', players.slice(0, 10).map(p => item(`${p.name} — ${p.rating}`)), 'Još niko nije odigrao rangiran meč.');
}

export function renderMe(me, rating) {
  $('meName').textContent = me.name;
  $('meRating').textContent = rating;
}

/** Čekaonica: mesta, ko je domaćin, šta domaćin može. */
export function renderWaiting(s, { onAddAi, onRemoveAi }) {
  const isHost = s.hostSeat === s.mySeat;
  $('waitCode').textContent = s.code;
  $('waitPlayers').value = String(s.players);
  $('waitPlayersRow').hidden = !isHost;
  $('startBtn').hidden = !isHost;
  const pair = () => ''; // u Remiju svako igra za sebe
  fill('seatList', s.seats.map((seat, i) => {
    if (seat.kind === 'human') {
      const tags = [i === s.mySeat ? 'vi' : null, i === s.hostSeat ? 'domaćin' : null, seat.connected ? null : 'nije povezan']
        .filter(Boolean).join(', ');
      return item(`${seat.name} (${seat.rating})${tags ? ` — ${tags}` : ''}${pair(i)}`);
    }
    if (seat.kind === 'ai') return item(`Računar${pair(i)}`, isHost ? [['Ukloni', () => onRemoveAi(i), 'ghost']] : []);
    return item(`Prazno mesto${pair(i)}`, isHost ? [['+ Računar', () => onAddAi(i)]] : []);
  }), '');
  $('waitNote').textContent = isHost
    ? 'Pošaljite poziv prijateljima. Prazna mesta popunjava računar kad kliknete „Počni“. Rangirano je kad za stolom sede bar dva čoveka.'
    : 'Čeka se da domaćin pokrene igru.';
}

export function renderOnlineUsers(users, myId, onInvite) {
  fill('onlineList', users.filter(u => u.userId !== myId).map(u => item(
    `${u.name} (${u.rating})`,
    onInvite ? [['Pozovi', () => onInvite(u.userId)]] : [],
  )), 'Trenutno niko drugi nije online.');
}

export function addChatLine(msg) {
  const li = document.createElement('li');
  const b = document.createElement('b');
  b.textContent = `${msg.name}: `;
  li.append(b, msg.text);
  $('chatList').append(li);
  li.scrollIntoView({ block: 'end' });
}
