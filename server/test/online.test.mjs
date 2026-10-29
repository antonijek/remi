// Integracioni test: lažni preferans server za naloge + pravi tablić server + socket.io klijenti.
// Pokretanje: npm test (u server/).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import jwt from 'jsonwebtoken';
import { io as connect } from 'socket.io-client';
import { chooseAction } from '../../engine/dist/index.js';

const SECRET = 'test-secret';
const AUTH_PORT = 3931;
const PORT = 3932;
const URL = `http://127.0.0.1:${PORT}`;
const NAMES = { 1: 'Pera', 2: 'Mika', 3: 'Laza' };
const dbPath = path.join(os.tmpdir(), `remi-test-${process.pid}.db`);
let authServer;
let server;

before(async () => {
  authServer = http.createServer((req, res) => {
    try {
      const { userId } = jwt.verify(String(req.headers.authorization).replace('Bearer ', ''), SECRET);
      res.end(JSON.stringify({ user: { id: userId, name: NAMES[userId], is_admin: false } }));
    } catch {
      res.statusCode = 401;
      res.end('{}');
    }
  }).listen(AUTH_PORT);
  server = spawn(process.execPath, ['dist/index.js'], {
    env: {
      ...process.env, PORT: String(PORT), AUTH_URL: `http://127.0.0.1:${AUTH_PORT}`, JWT_SECRET: SECRET,
      DB_PATH: dbPath, AI_DELAY_MS: '5', OFFLINE_GRACE_MS: '300', NEXT_DEAL_MS: '50',
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise(r => server.stdout.on('data', d => { if (String(d).includes('listening')) r(); }));
});

after(() => {
  server.kill();
  authServer.close();
  fs.rmSync(dbPath, { force: true });
});

function client(userId) {
  const socket = connect(URL, { auth: { token: jwt.sign({ userId }, SECRET) }, transports: ['websocket'], forceNew: true });
  const c = { socket, state: null, errors: [] };
  clients.push(c);
  socket.on('room:state', s => { c.state = s; });
  socket.on('game:error', e => c.errors.push(e));
  return c;
}

const clients = [];
const debugState = () => clients.map(c => { const s = c.state; return s ? `[seat ${s.mySeat} ${s.status} ${s.view?.phase} deal ${s.view?.dealNo} r${s.view?.round} turn ${s.view?.turn} hand ${s.view?.hand.length} ready ${s.ready} err ${c.errors.slice(-2)}]` : '[nema]'; }).join(' ');
const emit = (c, ev, payload) => new Promise(r => c.socket.emit(ev, payload, r));
const until = async (cond, ms = 20000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('isteklo vreme: ' + debugState());
    await new Promise(r => setTimeout(r, 10));
  }
};

/** Svaki klijent igra kad je na potezu (isti AI kao računar) i klikne „Dalje“ posle partije. */
function autoplay(c) {
  const tick = () => {
    const s = c.state;
    if (!s?.view) return;
    const v = s.view;
    if ((v.phase === 'DRAW' || v.phase === 'PLAY') && v.turn === s.mySeat) {
      const key = `${v.dealNo}-${v.phase}-${v.hand.length}-${v.melds.length}-${v.stockCount}-${v.discard.length}`;
      if (c.lastKey === key) return;
      c.lastKey = key;
      c.socket.emit('game:play', chooseAction(v, 'medium'));
    } else if (v.phase === 'DEAL_END' && !s.ready.includes(s.mySeat)) {
      c.socket.emit('game:ready');
    }
  };
  c.socket.on('room:state', () => setTimeout(tick, 0));
  tick();
}

test('statika: javni fajlovi da, server i izvorni kod ne', async () => {
  for (const [p, code] of [['/', 200], ['/remi.html', 200], ['/engine/dist/game.js', 200], ['/icons/cards/10D.webp', 200],
    ['/server/dist/index.js', 404], ['/server/remi.db', 404], ['/.env', 404], ['/engine/src/game.ts', 404], ['/README.md', 404]]) {
    const res = await fetch(URL + p);
    assert.equal(res.status, code, p);
  }
});

test('bez tokena nema veze', async () => {
  const s = connect(URL, { transports: ['websocket'], forceNew: true });
  const err = await new Promise(r => s.on('connect_error', e => r(e.message)));
  assert.equal(err, 'Missing auth token');
  s.close();
});

test('dva čoveka: soba kodom, cela partija i prelaz na sledeću', async () => {
  const a = client(1);
  const b = client(2);
  const created = await emit(a, 'room:create', { players: 2 });
  assert.match(created.code, /^[A-Z2-9]{5}$/);
  const joined = await emit(b, 'room:join', { code: created.code.toLowerCase() });
  assert.equal(joined.code, created.code);
  await until(() => a.state?.seats.filter(s => s.kind === 'human').length === 2);

  b.socket.emit('room:start');
  await until(() => b.errors.length === 1);
  assert.equal(b.errors[0], 'Samo domaćin može to da uradi.');

  a.socket.emit('room:start');
  await until(() => a.state?.status === 'PLAYING' && b.state?.status === 'PLAYING');
  // svako vidi samo svoje karte
  const other = b.state.view.hand.map(c => c.id);
  assert.ok(!JSON.stringify(a.state.view).includes(`"${other[0]}"`));

  // potez van reda se odbija
  const wrong = a.state.view.turn === 0 ? b : a;
  wrong.socket.emit('game:play', { type: 'draw' });
  await until(() => wrong.errors.length > 0);
  wrong.socket.emit('game:play', { type: 'nema-takvog' });
  await until(() => wrong.errors.includes('Neispravan potez.'));

  autoplay(a);
  autoplay(b);
  await until(() => a.state.view.dealNo >= 2 && b.state.view.dealNo >= 2, 90000);
  assert.equal(a.state.view.history.length, 1);
  a.socket.close();
  b.socket.close();
});

test('jedan čovek u troje: računar popunjava mesta, povratak posle pada veze', async () => {
  const c = client(3);
  const { code } = await emit(c, 'room:create', { players: 3 });
  c.socket.emit('room:start');
  await until(() => c.state?.status === 'PLAYING');
  assert.deepEqual(c.state.seats.map(s => s.kind), ['human', 'ai', 'ai']);
  assert.equal(c.state.view.playerCount, 3);

  // veza pukne: posle roka računar igra umesto njega, a po povratku dobija isto mesto
  c.socket.close();
  await new Promise(r => setTimeout(r, 700));
  const back = client(3);
  await until(() => back.state?.code === code);
  assert.equal(back.state.mySeat, 0);
  assert.equal(back.state.seats[0].connected, true);

  autoplay(back);
  await until(() => back.state.view.history.length >= 1 || back.state.view.dealNo >= 2, 90000);
  back.socket.emit('room:leave');
  await new Promise(r => back.socket.once('room:none', r));
  back.socket.close();
});
