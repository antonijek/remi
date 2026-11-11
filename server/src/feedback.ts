// „Pohvale i primedbe“ (meni ☰): igrač piše vlasniku sajta. Može i neprijavljen — tada može da
// ostavi mejl za odgovor. Vlasnik dobija obaveštenje na telefon (push.ts) i čita poruke u admin
// panelu, kartica „Poruke“.

import { Router } from 'express';
import { all, one, run } from './db.js';
import { verifyToken } from './auth.js';
import { rateLimit } from './rateLimit.js';
import { notifyOwner } from './push.js';
import { parseAgent } from './agent.js';

export const FEEDBACK_MAX = 1000;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const PUSH_PREVIEW = 120;

/** Tekst bez viška praznih redova; mejl prazan ili ispravan. */
export function cleanFeedback(body: unknown): { text: string; email: string | null } | { error: string } {
  const b = (body ?? {}) as { text?: unknown; email?: unknown };
  const text = String(b.text ?? '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, FEEDBACK_MAX);
  if (!text) return { error: 'Poruka je prazna.' };
  const email = String(b.email ?? '').trim();
  if (email && (email.length > 254 || !EMAIL.test(email))) return { error: 'Email nije ispravan.' };
  return { text, email: email || null };
}

export const feedbackUnread = (): number =>
  one<{ c: number }>('SELECT COUNT(*) AS c FROM feedback WHERE is_read = 0')?.c ?? 0;

export const feedbackRouter = Router();

// i neispravni pokušaji se broje — dovoljno za pravu poruku, a sprečava zatrpavanje
feedbackRouter.post('/', rateLimit({
  windowMs: 60 * 60 * 1000, max: 3, keyPrefix: 'feedback',
  message: 'Poslali ste već nekoliko poruka. Pokušajte ponovo za sat vremena.',
}), (req, res) => {
  const msg = cleanFeedback(req.body);
  if ('error' in msg) return void res.status(400).json({ error: msg.error });
  let userId: number | null = null;
  try {
    ({ userId } = verifyToken(String(req.headers.authorization ?? '').replace(/^Bearer /, '')));
  } catch (e) {
    // bez prijave (ili istekla): poruka stiže kao od neprijavljenog
    console.debug('[feedback] bez važeće prijave:', (e as Error).message);
  }
  const name = userId === null ? null
    : one<{ name: string }>('SELECT name FROM remi_players WHERE user_id = ?', [userId])?.name ?? null;
  const a = parseAgent(String(req.headers['user-agent'] ?? ''));
  run('INSERT INTO feedback (user_id, name, email, text, device) VALUES (?, ?, ?, ?, ?)',
    [userId, name, msg.email, msg.text, `${a.device}, ${a.os}, ${a.browser}`]);
  const who = name ?? (userId === null ? 'Neprijavljen igrač' : `Igrač #${userId}`);
  const preview = msg.text.replace(/\s+/g, ' ').slice(0, PUSH_PREVIEW);
  notifyOwner('Remi: pohvale i primedbe', `${who}: ${preview}`, '/admin.html#poruke')
    .catch(err => console.error('[PUSH]', err));
  res.json({ ok: true });
});

interface FeedbackRow {
  id: number; user_id: number | null; name: string | null; email: string | null;
  text: string; device: string | null; is_read: number; created_at: string;
}

/** Admin (montira ga admin.ts iza onlyAdmin): spisak, pročitano, brisanje. */
export const feedbackAdminRouter = Router();

feedbackAdminRouter.get('/', (_req, res) => {
  const rows = all<FeedbackRow>('SELECT * FROM feedback ORDER BY id DESC LIMIT 200');
  res.json({
    unread: feedbackUnread(),
    messages: rows.map(r => ({
      id: r.id, userId: r.user_id, name: r.name, email: r.email, text: r.text,
      device: r.device, read: r.is_read === 1, createdAt: r.created_at,
    })),
  });
});

feedbackAdminRouter.post('/:id/read', (req, res) => {
  run('UPDATE feedback SET is_read = ? WHERE id = ?', [req.body?.read === false ? 0 : 1, Number(req.params.id)]);
  res.json({ ok: true, unread: feedbackUnread() });
});

feedbackAdminRouter.delete('/:id', (req, res) => {
  run('DELETE FROM feedback WHERE id = ?', [Number(req.params.id)]);
  res.json({ ok: true, unread: feedbackUnread() });
});
