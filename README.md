# Remi 51

Web aplikacija za Remi 51 (vi + 1–3 računara). Isti principi kao `D:\lora` i `D:\preferans`:
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
- ⏳ Online (na zajedničkom jezgru sa lorom), jači AI (Monte Carlo kao u lori)

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
