// Javi Bing-u, Yandex-u i ostalima (IndexNow) da su stranice promenjene, da ne čekaju da same dođu.
// Google IndexNow ne koristi — za njega važe sitemap.xml i Search Console.
// Pokretanje posle objave koja menja tekst stranica: npm run indexnow

const HOST = 'remi.igrajmo.online';
const KEY = 'ef7665bf0ddc2a3e838db3474f3315dd';
const urls = [`https://${HOST}/`, `https://${HOST}/pravila.html`];

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList: urls }),
});
console.log('IndexNow:', res.status, res.statusText, '(200/202 = primljeno)');
if (res.status >= 400) console.log(await res.text().catch(e => `odgovor nije pročitan: ${e.message}`));
