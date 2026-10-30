// Admin panel (admin.html): samo za naloge sa admin pravima u Preferansu — isti nalog,
// is_admin stiže iz preferans /api/me. Banovanje ostaje u Preferans adminu (važi za ceo nalog).

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { fetchMe } from './auth.js';
import { adminOverview, adminPlayers, recentMatches } from './db.js';
import { allRooms, removeRoom, seatIndexes, status } from './rooms.js';
import { listOnlineUsers } from './presence.js';
import { viewFor } from './game.js';

export const adminRouter = Router();

async function onlyAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
  try {
    const me = token ? await fetchMe(token) : null;
    if (!me) return void res.status(401).json({ error: 'Prijavite se u igri (🌐), pa otvorite admin ponovo.' });
    if (!me.is_admin) return void res.status(403).json({ error: 'Ovaj nalog nema admin prava.' });
    next();
  } catch (e) {
    console.error('[admin] provera naloga nije uspela:', e);
    res.status(503).json({ error: 'Server za naloge trenutno nije dostupan.' });
  }
}

adminRouter.use(onlyAdmin);

adminRouter.get('/overview', (_req, res) => {
  const rooms = allRooms();
  res.json({
    ...adminOverview(),
    online: listOnlineUsers(),
    rooms: { waiting: rooms.filter(r => status(r) === 'WAITING').length, playing: rooms.filter(r => status(r) === 'PLAYING').length },
  });
});

adminRouter.get('/players', (_req, res) => res.json({ players: adminPlayers() }));

adminRouter.get('/rooms', (_req, res) => {
  res.json({
    rooms: allRooms().map(r => ({
      code: r.code,
      status: status(r),
      players: r.players,
      rated: r.rated,
      createdAt: r.createdAt,
      lastActivity: r.lastActivity,
      deal: r.game ? (viewFor(r.game, 0) as { dealNo?: number }).dealNo ?? null : null,
      seats: seatIndexes(r).map(s => ({ kind: r.seats[s].kind, name: r.seats[s].name, connected: r.sockets[s] !== null })),
    })),
  });
});

/** Zatvori sobu (npr. zaglavljena): igrači dobijaju poruku i vraćaju se u lobi. */
adminRouter.post('/rooms/:code/close', (req, res) => {
  const room = allRooms().find(r => r.code === req.params.code);
  if (!room) return void res.status(404).json({ error: 'Nema te sobe.' });
  for (const s of seatIndexes(room)) {
    const sock = room.sockets[s];
    if (!sock) continue;
    sock.emit('game:error', 'Administrator je zatvorio sobu.');
    sock.emit('room:none');
    sock.leave(room.code);
  }
  removeRoom(room);
  res.json({ ok: true });
});

adminRouter.get('/matches', (_req, res) => res.json({ matches: recentMatches(50) }));
