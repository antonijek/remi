// Pravi PNG ikonice (PWA) iz icons/icon.svg i sliku za deljenje linka (icons/og-image.jpg)
// kao snimak prave igre. Pokretanje (posle promene ikonice ili izgleda stola):
//   node tools/make-images.mjs

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 8135;
const svg = readFileSync('icons/icon.svg', 'utf8');
const bg = svg.match(/fill="(#[0-9a-f]{6})"/i)[1]; // boja pozadine ikonice, za maskable verziju
const browser = await chromium.launch();

async function renderIcon(size, file, padding = 0) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const inner = size - 2 * padding;
  // maskable: ikona mora da stane u sigurnu zonu (80%), a pozadina da popuni ceo kvadrat
  await page.setContent(`<body style="margin:0;background:${padding ? bg : 'transparent'}">
    <div style="padding:${padding}px"><img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}"
      width="${inner}" height="${inner}" style="display:block"></div></body>`);
  await page.screenshot({ path: file, omitBackground: !padding });
  await page.close();
}

await renderIcon(192, 'icons/icon-192.png');
await renderIcon(512, 'icons/icon-512.png');
await renderIcon(512, 'icons/icon-maskable-512.png', 52);

const server = spawn(process.execPath, ['tools/serve.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
await new Promise(r => server.stdout.once('data', r));
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.goto(`http://localhost:${PORT}/`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => {
    const s = window.__remi.game.getState();
    return (s.phase === 'DRAW' || s.phase === 'PLAY') && s.turn === 0;
  }, null, { timeout: 30000 });
  await page.screenshot({ path: 'icons/og-image.jpg', type: 'jpeg', quality: 85 });
} finally {
  server.kill();
  await browser.close();
}
console.log('Gotovo: icons/icon-192.png, icon-512.png, icon-maskable-512.png, og-image.jpg');
