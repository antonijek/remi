// Slike igrača (umesto velikog slova na pločici). Pregledač sliku sam iseče u kvadrat i smanji
// (256×256, WebP/JPEG), ovde se samo proveri da je stvarno slika i da je mala, pa se upiše u fajl
// pored baze (AVATAR_DIR) — ne u bazu, jer sql.js prepisuje celu bazu na disk posle svake promene.
// Adresa slike nosi verziju (?v=…), pa pregledač sme da je čuva zauvek.

import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { whoIs } from './auth.js';
import { one, run, upsertPlayer } from './db.js';
import { notifyOwner } from './push.js';

const AVATAR_DIR = path.resolve(
  process.env.AVATAR_DIR || path.join(path.dirname(path.resolve(process.env.DB_PATH || './remi.db')), 'avatars'));
const MAX_BYTES = 80 * 1024;
const TYPES: Record<string, { ext: string; magic: (b: Buffer) => boolean }> = {
  'image/webp': { ext: 'webp', magic: b => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
  'image/jpeg': { ext: 'jpg', magic: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { ext: 'png', magic: b => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
};
const MIME_BY_EXT: Record<string, string> = { webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png' };

function fileOf(userId: number): string | null {
  for (const ext of Object.keys(MIME_BY_EXT)) {
    const f = path.join(AVATAR_DIR, `${userId}.${ext}`);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

function removeFiles(userId: number): void {
  for (const ext of Object.keys(MIME_BY_EXT)) fs.rmSync(path.join(AVATAR_DIR, `${userId}.${ext}`), { force: true });
}

/** Adresa slike igrača (relativna, radi i na podputanji) ili null ako je nema. */
export function avatarUrl(userId: number | null): string | null {
  if (userId === null) return null;
  const v = one<{ avatar_v: number | null }>('SELECT avatar_v FROM remi_players WHERE user_id = ?', [userId])?.avatar_v;
  return v ? `api/avatar/${userId}?v=${v}` : null;
}

/** Ukloni sliku (igrač sam ili vlasnik iz admin panela). */
export function removeAvatar(userId: number): void {
  removeFiles(userId);
  run('UPDATE remi_players SET avatar_v = NULL WHERE user_id = ?', [userId]);
}

export const avatarRouter = Router();

/** Adresa moje slike (klijent je traži posle prijave). */
avatarRouter.get('/mine', async (req, res) => {
  const m = await whoIs(req);
  if (!m) return void res.status(401).json({ error: 'Niste prijavljeni.' });
  res.json({ url: avatarUrl(m.id) });
});

avatarRouter.post('/', async (req, res) => {
  const m = await whoIs(req);
  if (!m) return void res.status(401).json({ error: 'Niste prijavljeni.' });
  const match = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body?.image ?? ''));
  if (!match) return void res.status(400).json({ error: 'To nije slika.' });
  const type = TYPES[match[1]];
  const buf = Buffer.from(match[2], 'base64');
  if (buf.length > MAX_BYTES) return void res.status(400).json({ error: 'Slika je prevelika.' });
  if (!type.magic(buf)) return void res.status(400).json({ error: 'To nije slika.' });
  fs.mkdirSync(AVATAR_DIR, { recursive: true });
  removeFiles(m.id);
  fs.writeFileSync(path.join(AVATAR_DIR, `${m.id}.${type.ext}`), buf);
  const name = String(m.name || `igrač-${m.id}`).slice(0, 40);
  upsertPlayer(m.id, name);
  run('UPDATE remi_players SET avatar_v = ? WHERE user_id = ?', [Date.now(), m.id]);
  // vlasnik odmah vidi novu sliku (može je ukloniti u admin panelu → Igrači); poruka bez roda
  if (!m.is_admin) {
    notifyOwner('Remi: nova slika igrača', `${name} — pogledaj novu sliku u admin panelu (Igrači).`, '/admin.html')
      .catch(err => console.error('[PUSH]', err));
  }
  res.json({ ok: true, url: avatarUrl(m.id) });
});

avatarRouter.delete('/', async (req, res) => {
  const m = await whoIs(req);
  if (!m) return void res.status(401).json({ error: 'Niste prijavljeni.' });
  removeAvatar(m.id);
  res.json({ ok: true });
});

avatarRouter.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const f = Number.isInteger(id) && id > 0 ? fileOf(id) : null;
  if (!f) return void res.status(404).end();
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // adresa nosi verziju
  res.type(MIME_BY_EXT[path.extname(f).slice(1)]).sendFile(f);
});
