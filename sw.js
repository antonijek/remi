// Service worker: igra radi i bez interneta. Stranice i kod se uvek prvo traže sa mreže
// (da se nova verzija vidi odmah), a keš se koristi samo kad mreže nema. Karte se ne
// menjaju, pa se one uzimaju iz keša. Posle promene karata ili spiska fajlova podići CACHE.

const CACHE = 'remi-v2';
const SUITS = ['S', 'H', 'D', 'C'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const ENGINE = ['index', 'types', 'cards', 'melds', 'game', 'ai', 'actions'];
const UI = ['cards', 'seats', 'table', 'hand', 'actions', 'deal-end', 'storage', 'toast', 'rotate', 'online-lobby', 'visit'];

const CORE = [
  './', './remi.html', './pravila.html', './remi.css', './app.js', './online.js', './manifest.json', './icons/icon.svg',
  ...ENGINE.map(f => `./engine/dist/${f}.js`),
  ...UI.map(f => `./ui/${f}.js`),
  ...SUITS.flatMap(s => RANKS.map(r => `./icons/cards/${r}${s}.webp`)),
  './icons/cards/back-red.webp', './icons/cards/joker-red.webp', './icons/cards/joker-black.webp',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  // veza sa serverom (online igra, prijava) nikad iz keša
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/socket.io/') || url.pathname.startsWith('/api/')) return;
  e.respondWith(req.url.includes('/icons/cards/') ? cacheFirst(req) : networkFirst(req));
});
