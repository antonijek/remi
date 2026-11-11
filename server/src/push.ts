// Obaveštenja vlasniku na telefon (Web Push, Chrome na Androidu): poruka igrača („Pohvale i
// primedbe“), nov igrač ili igrač koji je sam online. Pretplaćuje se samo admin, iz admin panela.
// VAPID ključevi se prave sami pri prvom pokretanju i čuvaju u remi.db (nikad u git ni .env).

import webpush from 'web-push';
import type { PushSubscription } from 'web-push';
import { all, one, run } from './db.js';

/** Testovi: ništa se ne šalje, obaveštenja se samo pamte (GET /api/admin/push/sent). */
const DRY_RUN = !!process.env.PUSH_DRY_RUN;
export const dryRunLog: { title: string; body: string }[] = [];

let publicKey = '';

export function initPush(): void {
  const row = one<{ v: string }>("SELECT v FROM settings WHERE k = 'vapid'");
  const keys = row ? JSON.parse(row.v) as { publicKey: string; privateKey: string } : webpush.generateVAPIDKeys();
  if (!row) run("INSERT INTO settings (k, v) VALUES ('vapid', ?)", [JSON.stringify(keys)]);
  webpush.setVapidDetails('https://remi.igrajmo.online', keys.publicKey, keys.privateKey);
  publicKey = keys.publicKey;
}

export const pushPublicKey = () => publicKey;

export function pushCount(userId: number): number {
  return one<{ c: number }>('SELECT COUNT(*) AS c FROM push_subs WHERE user_id = ?', [userId])?.c ?? 0;
}

/** Sačuvaj pretplatu pregledača. Neispravna (bez https adrese i ključeva) → false. */
export function savePushSub(userId: number, sub: unknown): boolean {
  const s = sub as PushSubscription | null;
  if (!s || typeof s.endpoint !== 'string' || !/^https:\/\//.test(s.endpoint) || s.endpoint.length > 1000
    || typeof s.keys?.p256dh !== 'string' || typeof s.keys?.auth !== 'string') return false;
  const clean = { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh.slice(0, 200), auth: s.keys.auth.slice(0, 100) } };
  run(`INSERT INTO push_subs (endpoint, user_id, sub_json) VALUES (?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, sub_json = excluded.sub_json`,
  [clean.endpoint, userId, JSON.stringify(clean)]);
  // najviše 5 uređaja po nalogu — najstariji ispada
  run(`DELETE FROM push_subs WHERE user_id = ? AND endpoint NOT IN
       (SELECT endpoint FROM push_subs WHERE user_id = ? ORDER BY created_at DESC LIMIT 5)`, [userId, userId]);
  return true;
}

export function removePushSub(userId: number, endpoint: unknown): void {
  if (typeof endpoint === 'string') run('DELETE FROM push_subs WHERE endpoint = ? AND user_id = ?', [endpoint, userId]);
}

/** Pošalji svim pretplaćenim uređajima. Vraća koliko je poslato; ugašene pretplate (404/410) briše. */
export async function notifyOwner(title: string, body: string, url = '/'): Promise<number> {
  if (DRY_RUN) { dryRunLog.push({ title, body }); return 1; }
  const subs = all<{ endpoint: string; sub_json: string }>('SELECT endpoint, sub_json FROM push_subs');
  const payload = JSON.stringify({ title, body, url });
  let sent = 0;
  await Promise.all(subs.map(async s => {
    try {
      await webpush.sendNotification(JSON.parse(s.sub_json), payload, { TTL: 600, urgency: 'high' });
      sent++;
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) run('DELETE FROM push_subs WHERE endpoint = ?', [s.endpoint]);
      else console.error('[PUSH] slanje nije uspelo:', code ?? err);
    }
  }));
  return sent;
}
