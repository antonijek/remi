// Headless test: odigraj CEO meč Remija kroz UI (klikovi na špil, Predlog, Otvori,
// Spusti, Odbaci), bez JS grešaka; sto ne sme da menja veličinu.
// Pokretanje: npm run test:ui

import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 8125;
const server = spawn(process.execPath, ['tools/serve.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
await new Promise(r => server.stdout.once('data', r));

const errors = [];
const browser = await chromium.launch();
try {
  for (const viewport of [{ width: 1920, height: 880 }, { width: 390, height: 844 }, { width: 1280, height: 720 }]) {
    const page = await browser.newPage({ viewport });
    page.on('pageerror', e => errors.push(`[${viewport.width}] ${e}`));
    page.on('console', m => { if (m.type() === 'error') errors.push(`[${viewport.width}] console: ${m.text()}`); });
    await page.goto(`http://localhost:${PORT}/?fast`);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector('#myHand .card');
    const tableBox = () => page.evaluate(() => JSON.stringify(document.querySelector('.table').getBoundingClientRect().toJSON()));
    const sizes = new Set([await tableBox()]);
    let moves = 0, opened = false, shot = false;
    const t0 = Date.now();
    const click = async sel => { try { await page.click(sel, { timeout: 1500 }); return true; } catch { return false; } };
    const btn = name => page.locator('#actions button', { hasText: name });

    while (Date.now() - t0 < 300_000) {
      if (await page.locator('#dealEnd[open]').count()) {
        const txt = await page.textContent('#nextDealBtn');
        if (txt.includes('Nova')) { console.log(`[${viewport.width}px] ${await page.textContent('#dealEndTitle')} — ${moves} poteza`); break; }
        await click('#nextDealBtn');
        continue;
      }
      const st = await page.evaluate(() => { const s = window.__remi.game.getState(); return { turn: s.turn, phase: s.phase, opened: s.opened[0], melds: s.melds.length }; });
      if (st.turn !== 0 || (st.phase !== 'DRAW' && st.phase !== 'PLAY')) { await page.waitForTimeout(20); continue; }
      if (st.phase === 'DRAW') { await click('#stock.clickable'); moves++; continue; }
      // PLAY: Predlog → Otvori / Spusti / dopiši / odbaci
      await btn('Predlog').click({ timeout: 1500 }).catch(() => {});
      if (!st.opened && await btn('Otvori').isEnabled().catch(() => false)) { await btn('Otvori').click(); opened = true; continue; }
      if (st.opened && await btn('Spusti').isEnabled().catch(() => false)) { await btn('Spusti').click(); continue; }
      if (st.opened && await page.locator('.meld.target').count() && (await page.locator('#myHand .card.sel').count()) &&
          !(await btn('Odbaci').isEnabled().catch(() => false))) {
        // predlog je dopisivanje — nađi kombinaciju na koju ide
        const done = await page.evaluate(async () => {
          const g = window.__remi.game; const s = g.getState(); return s.melds.map(m => m.id);
        });
        let ok = false;
        for (let i = 0; i < done.length && !ok; i++) {
          const before = await page.evaluate(() => window.__remi.game.getState().hands[0].length);
          await page.locator('#melds .meld').nth(i).click({ timeout: 1000 }).catch(() => {});
          ok = (await page.evaluate(() => window.__remi.game.getState().hands[0].length)) < before;
        }
        if (ok) continue;
      }
      if (await btn('Odbaci').isEnabled().catch(() => false)) {
        if (!shot && st.melds > 0) { await page.screenshot({ path: `tools/screenshot-${viewport.width}.png` }); shot = true; }
        await btn('Odbaci').click();
        moves++;
        sizes.add(await tableBox());
        continue;
      }
      // rezerva: izaberi prvu kartu koja sme da se odbaci
      await page.evaluate(() => {
        const v = window.__remi.game.getPlayerView(0);
        const c = v.hand.find(x => !x.joker && x.id !== v.takenCard);
        document.querySelectorAll('#myHand .card.sel').forEach(e => e.click());
        document.querySelector(`#myHand .card[data-id="${c.id}"]`)?.click();
      });
      if (await btn('Vrati').count()) await btn('Vrati').click().catch(() => {});
      else if (await btn('Odbaci').isEnabled().catch(() => false)) { await btn('Odbaci').click(); moves++; }
    }
    const phase = await page.evaluate(() => window.__remi.game.getState().phase);
    if (phase !== 'MATCH_END') errors.push(`[${viewport.width}px] meč nije završen (${phase}, ${moves} poteza)`);
    if (!opened) errors.push(`[${viewport.width}px] nijednom se nije otvorio kroz UI`);
    if (sizes.size > 1) errors.push(`[${viewport.width}px] sto menja veličinu: ${[...sizes].join(' | ')}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    if (overflow) errors.push(`[${viewport.width}px] horizontalni scroll`);
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}
if (errors.length) {
  console.error('GREŠKE:\n' + [...new Set(errors)].join('\n'));
  process.exit(1);
}
console.log('OK — UI smoke test prošao');
