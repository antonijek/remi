// Lige kroz pregledač: Pera napravi ligu, Mika uđe kodom i vidi tabelu, pa je napusti.
// Pokretanje: npm run test:leagues (posle npm run build u engine/ i server/).

import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const require = createRequire(new URL('../server/package.json', import.meta.url));
const jwt = require('jsonwebtoken');

const SECRET = 'liga-test-secret';
const AUTH_PORT = 3951;
const PORT = 3952;
const BASE = `http://localhost:${PORT}`;
const USERS = { 'pera@test': { id: 1, name: 'Pera' }, 'mika@test': { id: 2, name: 'Mika' } };
const dbPath = path.join(os.tmpdir(), `remi-liga-${process.pid}.db`);

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

try {
  const a = await player('[Pera]');
  await a.goto(BASE);
  await a.click('#onlineBtn');
  await login(a, 'pera@test');
  await a.waitForSelector('#lobbyPanel:not([hidden])');
  await a.click('#leagueBtn');
  await a.waitForSelector('#leagueName');
  await a.fill('#leagueName', 'Subotnja liga');
  await a.click('#leagueDlg button:text-is("Napravi")');
  await a.waitForSelector('#leagueDlg b');
  const code = (await a.textContent('#leagueDlg b')).trim();
  console.log('liga napravljena, kod ' + code);

  const b = await player('[Mika]');
  await b.goto(BASE);
  await b.click('#onlineBtn');
  await login(b, 'mika@test');
  await b.waitForSelector('#lobbyPanel:not([hidden])');
  await b.click('#leagueBtn');
  await b.fill('#leagueCode', code);
  await b.click('#leagueDlg button:text-is("Uđi")');
  await b.waitForSelector('#leagueDlg ol li');
  const rows = await b.locator('#leagueDlg ol li').count();
  if (rows !== 2) throw new Error('tabela treba da ima 2 člana, ima ' + rows);
  if (await b.locator('#leagueDlg b').count()) throw new Error('član ne sme da vidi kod lige');
  await b.screenshot({ path: 'tools/screenshot-league-390.png' });
  await b.click('#leagueDlg button:text-is("Napusti ligu")');
  await b.waitForSelector('#leagueDlg li:text-is("Niste ni u jednoj ligi.")');
  console.log('član je napustio ligu');
} finally {
  await browser.close();
  server.kill();
  auth.close();
  fs.rmSync(dbPath, { force: true });
}

if (errors.length) {
  console.error(`GREŠKE: ${errors.join(' | ')}`);
  process.exit(1);
}
console.log('OK — lige kroz pregledač prošle');
