// Online kroz pregledač: lažni server za naloge + pravi tablić server, dva igrača se prijave,
// jedan napravi sobu, drugi uđe preko linka za poziv, odigraju celu partiju klikovima i pređu
// na sledeću. Pokretanje: npm run test:online (posle npm run build u engine/ i server/).

import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const require = createRequire(new URL('../server/package.json', import.meta.url));
const jwt = require('jsonwebtoken');

const SECRET = 'ui-test-secret';
const AUTH_PORT = 3941;
const PORT = 3942;
const BASE = `http://localhost:${PORT}`;
const USERS = { 'pera@test': { id: 1, name: 'Pera' }, 'mika@test': { id: 2, name: 'Mika' } };
const dbPath = path.join(os.tmpdir(), `remi-ui-${process.pid}.db`);

const auth = http.createServer((req, res) => {
  let body = '';
  req.on('data', d => { body += d; });
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/login' && req.method === 'POST') {
      const user = USERS[JSON.parse(body || '{}').email];
      if (!user) { res.statusCode = 401; return res.end(JSON.stringify({ error: 'Invalid email or password' })); }
      return res.end(JSON.stringify({ token: jwt.sign({ userId: user.id }, SECRET), user }));
    }
    try {
      const { userId } = jwt.verify(String(req.headers.authorization).replace('Bearer ', ''), SECRET);
      const user = Object.values(USERS).find(u => u.id === userId);
      res.end(JSON.stringify({ user: { ...user, is_admin: false } }));
    } catch {
      res.statusCode = 401;
      res.end('{}');
    }
  });
}).listen(AUTH_PORT);

const server = spawn(process.execPath, ['server/dist/index.js'], {
  env: {
    ...process.env, PORT: String(PORT), AUTH_URL: `http://127.0.0.1:${AUTH_PORT}`, JWT_SECRET: SECRET,
    DB_PATH: dbPath, AI_DELAY_MS: '50', NEXT_DEAL_MS: '20000',
  },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise(r => server.stdout.on('data', d => { if (String(d).includes('listening')) r(); }));

const errors = [];
const browser = await chromium.launch();

async function player(tag) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`${tag} ${e}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${tag} ${m.text()}`); });
  return page;
}

async function login(page, email) {
  await page.waitForSelector('#loginPanel:not([hidden])');
  await page.fill('#loginEmail', email);
  await page.fill('#loginPassword', 'lozinka');
  await page.click('#loginSubmit');
}

/** Ako sam na potezu: vučenje klikom na špil, ostalo kao AI (preko online.act — isti put kao dugmad). */
async function playIfMyTurn(page) {
  const phase = await page.evaluate(() => {
    const o = window.__remi.online;
    const v = o.active ? o.view() : null;
    return v && v.turn === 0 && !o.waiting ? v.phase : null;
  });
  if (phase === 'DRAW' && await page.locator('#stock.clickable').count()) { await page.click('#stock.clickable'); return true; }
  if (phase !== 'PLAY') return false;
  await page.evaluate(async () => {
    const { chooseAction } = await import('/engine/dist/index.js');
    const o = window.__remi.online;
    o.act(chooseAction(o.view(), 'medium'));
  });
  return true;
}

try {
  const a = await player('[Pera]');
  await a.goto(BASE);
  await a.click('#onlineBtn');
  await login(a, 'pera@test');
  await a.waitForSelector('#lobbyPanel:not([hidden])');
  await a.selectOption('#newRoomPlayers', '2');
  await a.click('#createBtn');
  await a.waitForSelector('#waitPanel:not([hidden])');
  const code = (await a.textContent('#waitCode')).trim();
  console.log(`soba ${code}`);

  const b = await player('[Mika]');
  await b.goto(`${BASE}/?soba=${code}`);
  await login(b, 'mika@test');
  await b.waitForSelector('#waitPanel:not([hidden])');
  await a.waitForFunction(() => document.querySelectorAll('#seatList li').length === 2
    && !document.querySelector('#seatList').textContent.includes('Prazno'));

  await a.click('#startBtn');
  for (const p of [a, b]) await p.waitForSelector('#lobby[hidden]', { state: 'attached' });
  await b.waitForSelector('.seat[data-seat="top"] .plate .name');
  const opp = (await b.textContent('.seat[data-seat="top"] .plate .name')).trim();
  if (!opp.startsWith('Pera')) errors.push(`Mika vidi protivnika „${opp}“ umesto „Pera“`);

  let moves = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 240_000) {
    const ends = await Promise.all([a, b].map(p => p.locator('#dealEnd[open]').count()));
    if (ends.every(Boolean)) break;
    let played = false;
    for (const p of [a, b]) if (await playIfMyTurn(p)) { played = true; moves++; }
    if (!played) await a.waitForTimeout(100);
  }
  const title = await a.textContent('#dealEndTitle');
  console.log(`${title} posle ${moves} poteza`);
  await a.screenshot({ path: 'tools/screenshot-online-kraj.png' });

  for (const p of [a, b]) await p.click('#nextDealBtn');
  for (const p of [a, b]) await p.waitForFunction(() => /partija 2/.test(document.querySelector('#dealInfo').textContent));
  console.log('druga partija je počela kod oba igrača');
  await b.screenshot({ path: 'tools/screenshot-online-390.png' });
} finally {
  await browser.close();
  server.kill();
  auth.close();
  fs.rmSync(dbPath, { force: true });
}

if (errors.length) {
  console.error('GREŠKE:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('OK — online test kroz pregledač prošao');
