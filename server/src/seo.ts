// IndexNow (Bing, Yandex…): ključ je javan po pravilu IndexNow-a i mora biti dostupan na /<ključ>.txt.
// Javljanje promena: npm run indexnow (tools/notify-indexnow.mjs).

import type { Express } from 'express';

export const INDEXNOW_KEY = 'ef7665bf0ddc2a3e838db3474f3315dd';

export function registerSeo(app: Express): void {
  app.get(`/${INDEXNOW_KEY}.txt`, (_req, res) => res.type('text/plain').send(INDEXNOW_KEY));
}
