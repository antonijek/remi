// Dnevni izazov kroz pregledač: ?izazov pokreće partiju 1 na 1, kraj ima rezultat i dugme za deljenje,
// drugi pokušaj istog dana pokazuje "već odigrano", a obična igra ostaje netaknuta.
// Pokretanje: npm run test:daily

import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 4396;
const server = spawn(process.execPath, ['tools/serve.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
await new Promise(r => server.stdout.once('data', r));
const browser = await chromium.launch();
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => errors.push(`pageerror: ${e}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  const url = `http://localhost:${PORT}/?fast`;
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${url}&izazov`);
  await page.waitForSelector('#myHand .card');
  check((await page.textContent('#dealInfo')).includes('Dnevni izazov'), 'naslov ne pokazuje dnevni izazov');
  const players = await page.evaluate(() => window.__remi.game.getState().playerCount);
  check(players === 2, `izazov nije 1 na 1 (${players})`);

  const ok = sel => page.locator(sel).isEnabled().catch(() => false);
  const t0 = Date.now();
  while (Date.now() - t0 < 120_000 && !(await page.locator('#dealEnd[open]').count())) {
    const st = await page.evaluate(() => { const s = window.__remi.game.getState(); return { turn: s.turn, phase: s.phase, opened: s.opened[0] }; });
    if (st.turn !== 0 || (st.phase !== 'DRAW' && st.phase !== 'PLAY')) { await page.waitForTimeout(20); continue; }
    if (st.phase === 'DRAW') { await page.click('#stock.clickable', { timeout: 1500 }).catch(() => {}); continue; }
    await page.click('#suggestBtn', { timeout: 1500 }).catch(() => {});
    if (!st.opened && await ok('#openBtn')) { await page.click('#openBtn'); continue; }
    if (st.opened && await ok('#meldBtn')) { await page.click('#meldBtn'); continue; }
    if (await ok('#discardBtn')) { await page.click('#discardBtn'); continue; }
    await page.evaluate(() => {
      const v = window.__remi.game.getPlayerView(0);
      const c = v.hand.find(x => !x.joker && x.id !== v.takenCard);
      document.querySelectorAll('#myHand .card.sel').forEach(e => e.click());
      document.querySelector(`#myHand .card[data-id="${c.id}"]`)?.click();
    });
    if (await page.locator('#returnBtn').count()) await page.click('#returnBtn').catch(() => {});
    else if (await ok('#discardBtn')) await page.click('#discardBtn');
  }
  check(await page.locator('#dealEnd[open]').count() === 1, 'izazov se nije završio');
  check((await page.textContent('#dealEndTitle')).startsWith('Dnevni izazov'), `naslov kraja: ${await page.textContent('#dealEndTitle')}`);
  check(await page.isVisible('#shareBtn'), 'nema dugmeta za deljenje');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('remi.daily.results') ?? '{}'));
  check(Object.keys(saved).length === 1, 'rezultat nije sačuvan');

  await page.click('#nextDealBtn');
  const normal = await page.evaluate(() => window.__remi.game.getState().playerCount);
  check(normal === 4, `posle izazova nije obična igra (${normal} igrača)`);
  check(!(await page.textContent('#dealInfo')).includes('izazov'), 'obična igra i dalje piše izazov');

  await page.goto(`${url}&izazov`);
  await page.waitForSelector('#dailyDone[open]', { timeout: 5000 }).catch(() => errors.push('nema prozora "već odigrano"'));
  check((await page.textContent('#dailyDoneText')).includes('računar'), 'prozor "već odigrano" bez rezultata');
} finally {
  await browser.close();
  server.kill();
}
if (errors.length) {
  console.error('GREŠKE:\n' + [...new Set(errors)].join('\n'));
  process.exit(1);
}
console.log('OK — dnevni izazov prošao');
