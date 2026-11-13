import path from 'node:path';
import { Router } from 'express';

// Android aplikacija (android/, isto kao Lora). Mora pre provere javnih putanja (publicPaths.ts),
// jer ni tačka-folder ni .apk nisu na tom spisku.
export function androidAppRouter(root: string): Router {
  const router = Router();

  // Chrome po ovom fajlu zna da je aplikacija naša, pa je otvara preko celog ekrana, bez trake sa adresom.
  router.get('/.well-known/assetlinks.json', (_req, res) => {
    res.type('json').sendFile(path.join(root, 'android/assetlinks.json'));
  });

  // APK nije u git-u: na server ga šalje tools/apk-upload.sh u downloads/, pa ga deploy ne briše.
  router.get('/remi.apk', (_req, res) => {
    res.type('application/vnd.android.package-archive');
    res.sendFile(
      path.join(root, 'downloads/remi.apk'),
      { headers: { 'Content-Disposition': 'attachment; filename="Remi.apk"', 'Cache-Control': 'no-cache' } },
      (err) => {
        if (!err) return;
        console.error('[apk]', err.message);
        if (!res.headersSent) res.status(404).end();
      },
    );
  });

  return router;
}
