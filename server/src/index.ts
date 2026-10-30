import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import compression from 'compression';
import { Server as SocketIOServer } from 'socket.io';
import { initDb, flushPersist, topPlayers, recordVisit } from './db.js';
import { adminRouter } from './admin.js';
import { authRouter } from './auth.js';
import { registerSocketHandlers } from './socket.js';
import { allRooms, loadPersistedRooms, removeAbandonedRooms, status } from './rooms.js';
import { broadcast, setIo } from './driver.js';
import { listOnlineUsers } from './presence.js';

// server/dist/index.js → server → koren projekta (remi.html, app.js, engine/dist, icons)
const PROJECT_ROOT = path.resolve(import.meta.dirname, '../..');

// Javno je SAMO ono što treba pregledaču — nikad server/ (baza, .env), docs/, alati, izvorni kod.
const PUBLIC = new RegExp('^/(?:' + [
  String.raw`remi\.html`, String.raw`pravila\.html`, String.raw`app\.js`, String.raw`online\.js`, String.raw`remi\.css`,
  String.raw`sw\.js`, String.raw`admin\.html`, String.raw`admin\.js`, String.raw`manifest\.json`, String.raw`robots\.txt`, String.raw`sitemap\.xml`,
  String.raw`ui/[a-z-]+\.js`, String.raw`engine/dist/[a-z]+\.js`,
  String.raw`icons/(?:icon\.svg|icon-[a-z0-9-]+\.png|og-image\.jpg)`, String.raw`icons/cards/[0-9A-Za-z-]+\.webp`,
].join('|') + ')?$');

async function main(): Promise<void> {
  await initDb();
  const restored = loadPersistedRooms();
  if (restored.length) console.log(`[STARTUP] Vraćeno soba: ${restored.length}`);

  const app = express();
  app.set('trust proxy', 1); // nginx → prava IP adresa za ograničenje pokušaja
  app.use(express.json());
  app.use(compression());
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io/') || PUBLIC.test(req.path)) return next();
    res.status(404).end();
  });
  app.use(express.static(PROJECT_ROOT, {
    index: 'remi.html',
    // karte i ikonice se ne menjaju — čuvaju se nedelju dana; HTML/JS/CSS se uvek proveravaju
    setHeaders: (res, filePath) => res.setHeader('Cache-Control',
      /[\\/]icons[\\/]/.test(filePath) ? 'public, max-age=604800' : 'no-cache'),
  }));

  app.get('/api/health', (_req, res) => res.json({ ok: true, rooms: allRooms().length }));
  // Ko je sada povezan — samo sa samog servera (provera pre slanja nove verzije).
  app.get('/api/internal/online', (req, res) => {
    if (req.ip !== '127.0.0.1' && req.ip !== '::1' && req.ip !== '::ffff:127.0.0.1') return void res.status(404).end();
    res.json({ users: listOnlineUsers().map(u => ({ id: u.userId, name: u.name })) });
  });
  app.use('/api', authRouter);
  app.get('/api/leaderboard', (_req, res) => res.json({ players: topPlayers(20) }));
  // Brojač posetilaca (i onih bez naloga, protiv računara) — nasumičan id iz pregledača, bez ličnih podataka.
  app.post('/api/visit', (req, res) => {
    const v = req.body?.v;
    if (typeof v === 'string' && /^[a-z0-9]{8,32}$/.test(v)) recordVisit(v);
    res.status(204).end();
  });
  app.use('/api/admin', adminRouter);

  const httpServer = http.createServer(app);
  const io = new SocketIOServer(httpServer, { cors: { origin: true } });
  setIo(io);
  registerSocketHandlers(io);

  // Vraćene sobe: pokreni tajmere (računar igra za AI mesta; ljudima teče rok kao da im je pala veza).
  for (const room of restored) if (status(room) === 'PLAYING') broadcast(room);

  const port = Number(process.env.PORT) || 3005;
  httpServer.listen(port, () => console.log(`Remi server listening on port ${port}`));

  const shutdown = (signal: string) => {
    console.log(`[SHUTDOWN] ${signal}, upis baze`);
    flushPersist();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  const fatal = (kind: string) => (err: unknown) => {
    console.error(`[FATAL] ${kind}:`, err);
    try {
      flushPersist();
    } catch (e) {
      console.error('[FATAL] upis baze nije uspeo:', e);
    }
    process.exit(1);
  };
  process.on('uncaughtException', fatal('uncaughtException'));
  process.on('unhandledRejection', fatal('unhandledRejection'));

  setInterval(() => {
    const removed = removeAbandonedRooms();
    if (removed) console.log(`[CLEANUP] Obrisano soba: ${removed}`);
  }, Number(process.env.CLEANUP_MS ?? 5 * 60 * 1000));
}

main().catch(err => {
  console.error('Server nije pokrenut:', err);
  process.exit(1);
});
