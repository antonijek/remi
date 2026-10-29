# Remi 51

Web aplikacija za Remi 51: protiv računara (vi + 1–3 računara) ili online sa ljudima. Isti principi kao `D:\lora` i `D:\preferans`:
čist TypeScript engine, AI odvojen od engine-a i tanak Vanilla JS UI.

## Status
- ✅ Engine: 2 špila + 4 džokera, 15/14 karata, vučenje sa špila ili gomile (pre otvaranja
  uzeta karta mora ući u otvaranje ili se vraća), otvaranje ≥ 51, nizovi (kec nisko/visoko,
  bez K-A-2) i kompleti, najviše jedan džoker po kombinaciji, dopisivanje, zamena džokera,
  „remi iz ruke“, bodovanje, meč do 501. Testovi: `npm test`
- ✅ AI (`medium`): nalazi najbolje kombinacije u ruci, uzima sa gomile samo kad se isplati,
  otvara se čim može, uzima džokere sa stola, dopisuje i odbacuje kartu koja najmanje obećava.
  U 30 mečeva sa 4 igrača je pobedio početnike (`easy`) u 100% mečeva (`npm run sim` u `engine/`).
- ✅ UI: sto za 2–4 igrača, klik na špil/gomilu, priprema otvaranja sa zbirom poena,
  dopisivanje klikom na kombinaciju, dugme „Predlog“, sortiranje po boji/broju, čuvanje partije
- ✅ Pravila ponovo proverena 2026-10-30 (7 izvora, docs/PRAVILA_IZVORI.md): kad nestane špila gomila se okreće
  bez mešanja; na niz posle otvaranja sme još džokera (otvaranje i komplet: najviše jedan)
- ✅ Prave karte (CC0 set kao Preferans/Lora/Tablić + džokeri iz istog seta, WebP), app.js podeljen na ui/ module,
  potez kao podatak (engine/src/actions.ts: parseAction, applyAction) — isti put za računar, klijent i server
- ✅ Online sa ljudima (server/ kopiran iz Tablića, razlikuje se samo server/src/game.ts): prijava istim nalogom kao
  Preferans i Lora, lobi, sobe za 2–4, link za poziv ?soba=KOD, računar na praznim mestima i za igrača bez veze,
  rejting (manje poena = bolje), chat, sobe prežive restart. Testovi: cd server && npm test, npm run test:online
- ✅ PWA (manifest, sw.js, ikonice), SEO (canonical, OG, JSON-LD, robots, sitemap)
- ⏳ Objava na remi.igrajmo.online: čeka DNS zapis (A, remi, 213.199.32.240), pa sh tools/deploy.sh --setup
- ⏳ Jači AI (Monte Carlo kao u Lori)

## Pravila
Vidi [pravila.html](pravila.html). Izvori: forestrummy.com (uputstvo), igre.games (Remi 51).
Najviše jedan džoker po kombinaciji i „džoker se ne odbacuje“ važe uvek. Da igra nikad ne stane,
ako u ruci ostanu samo uzeta karta i džoker, uzeta karta sme nazad (`legalDiscards` u engine-u).

## Pokretanje
```bash
cd engine && npm install && npm run build && cd ..
npm install
node tools/serve.js      # http://localhost:8003/
npm run test:ui          # ceo meč kroz UI na 3 veličine ekrana
```
