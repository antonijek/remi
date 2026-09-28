import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RemiGame, RemiError } from '../src/game.js';
import { cardFromId, createDeck } from '../src/cards.js';
import { chooseAction, bestMelds } from '../src/ai.js';
import { makeRng } from '../src/cards.js';
import type { RemiState } from '../src/types.js';

const cards = (s: string) => (s ? s.split(' ').map(cardFromId) : []);

function base(): RemiState {
  const g = new RemiGame({ players: 2, seed: 1 });
  const s = g.getState();
  s.turn = 0;
  s.phase = 'PLAY';
  s.melds = [];
  s.discard = [];
  s.opened = [false, false];
  s.openedAtTurnStart = false;
  return s;
}

test('deljenje: 108 karata, prvi posle delioca 15, ostali 14, počinje odbacivanjem', () => {
  const g = new RemiGame({ players: 4, seed: 2 });
  const s = g.getState();
  assert.equal(createDeck().length, 108);
  const starter = (s.dealer + 1) % 4;
  s.hands.forEach((h, p) => assert.equal(h.length, p === starter ? 15 : 14));
  assert.equal(s.turn, starter);
  assert.equal(s.phase, 'PLAY');
  assert.equal(s.stock.length + s.hands.flat().length, 108);
});

test('otvaranje: treba 51 poen, sve odjednom', () => {
  const s = base();
  s.hands[0] = cards('10H1 JH1 QH1 7S1 7D1 7C1 2C1 5D2');
  let g = RemiGame.fromState(s);
  assert.throws(() => g.meld(0, [['10H1', 'JH1', 'QH1']]), /51/); // 30
  g.meld(0, [['10H1', 'JH1', 'QH1'], ['7S1', '7D1', '7C1']]); // 30 + 21 = 51
  assert.equal(g.getState().opened[0], true);
  assert.equal(g.getState().melds.length, 2);
});

test('mora ostati karta za odbacivanje', () => {
  const s = base();
  s.opened[0] = true;
  s.hands[0] = cards('4H1 5H1 6H1');
  const g = RemiGame.fromState(s);
  assert.throws(() => g.meld(0, [['4H1', '5H1', '6H1']]), /odbacivanje/);
});

test('karta sa gomile pre otvaranja mora ući u otvaranje; može se vratiti', () => {
  const s = base();
  s.phase = 'DRAW';
  s.hands[0] = cards('10H1 JH1 7S1 7D1 7C1 2C1 5D2 9S1');
  s.discard = cards('3D1 QH2');
  let g = RemiGame.fromState(s);
  g.takeDiscard(0); // QH2
  assert.throws(() => g.discard(0, '9S1'), /otvorite/);
  assert.throws(() => g.meld(0, [['7S1', '7D1', '7C1']]), /51/);
  g.meld(0, [['10H1', 'JH1', 'QH2'], ['7S1', '7D1', '7C1']]);
  assert.throws(() => g.discard(0, 'QH2')); // već je na stolu

  // vraćanje
  const g2 = RemiGame.fromState(s);
  g2.takeDiscard(0);
  g2.returnDiscard(0);
  assert.equal(g2.getState().phase, 'DRAW');
  assert.equal(g2.getState().discard.at(-1)!.id, 'QH2');
});

test('džoker se ne odbacuje; uzeta karta ne ide odmah nazad', () => {
  const s = base();
  s.opened[0] = true;
  s.phase = 'DRAW';
  s.hands[0] = cards('JK1 5H1 9S1');
  s.discard = cards('2C1');
  const g = RemiGame.fromState(s);
  g.takeDiscard(0);
  assert.throws(() => g.discard(0, 'JK1'), /Džoker/);
  assert.throws(() => g.discard(0, '2C1'), /gomile/);
  g.discard(0, '9S1');
});

test('nema zaglavljivanja: u ruci samo uzeta karta i džoker → sme da odbaci uzetu', () => {
  const s = base();
  s.opened[0] = true;
  s.phase = 'DRAW';
  s.hands[0] = cards('JK1');
  s.discard = cards('2C1');
  const g = RemiGame.fromState(s);
  g.takeDiscard(0);
  assert.throws(() => g.discard(0, 'JK1'), /Džoker/);
  g.discard(0, '2C1');
});

test('kraj partije i bodovanje: pobednik −40, otvoren = zbir ruke, neotvoren 100', () => {
  const s = RemiGame.fromState(base()).getState();
  s.playerCount = 3;
  s.hands = [cards('5H1'), cards('KS1 JK1 3D1'), cards('2C1')];
  s.opened = [true, true, false];
  s.openedAtTurnStart = true;
  s.scores = [0, 0, 0];
  const g = RemiGame.fromState(s);
  g.discard(0, '5H1');
  const r = g.getState().history.at(-1)!;
  assert.deepEqual(r.points, [-40, 10 + 20 + 3, 100]);
  assert.equal(r.handRemi, false);
});

test('remi iz ruke: −80, ostalima duplo', () => {
  const s = base();
  s.hands = [cards('10H1 JH1 QH1 KS1 KD1 KC1 5D1'), cards('9S1 2C1')];
  s.opened = [false, false];
  s.openedAtTurnStart = false;
  const g = RemiGame.fromState(s);
  g.meld(0, [['10H1', 'JH1', 'QH1'], ['KS1', 'KD1', 'KC1']]);
  g.discard(0, '5D1');
  const r = g.getState().history.at(-1)!;
  assert.equal(r.handRemi, true);
  assert.deepEqual(r.points, [-80, 200]); // neotvoren: 100 × 2
});

test('bestMelds nalazi otvaranje sa džokerom', () => {
  const plan = bestMelds(cards('10H1 JK1 QH1 KS1 KD1 KC1 2C1 5D1'));
  assert.ok(plan.points >= 60, `poeni ${plan.points}`);
  assert.equal(plan.groups.length, 2);
});

function playMatch(seed: number, players: number) {
  const g = new RemiGame({ players, seed, targetScore: 301 });
  const rng = makeRng(seed + 99);
  let guard = 0;
  while (g.getState().phase !== 'MATCH_END') {
    const s = g.getState();
    if (s.phase === 'DEAL_END') {
      // invarijanta: nijedna karta nije nestala
      g.nextDeal();
      continue;
    }
    const total = s.stock.length + s.discard.length + s.hands.flat().length + s.melds.reduce((n, m) => n + m.cards.length, 0);
    assert.equal(total, 108, 'sve karte na broju');
    const p = s.turn;
    const a = chooseAction(g.getPlayerView(p), p % 2 ? 'medium' : 'easy', rng);
    try {
      switch (a.type) {
        case 'draw': g.drawStock(p); break;
        case 'take': g.takeDiscard(p); break;
        case 'return': g.returnDiscard(p); break;
        case 'meld': g.meld(p, a.groups); break;
        case 'layoff': g.layoff(p, a.meldId, a.cardIds); break;
        case 'swap': g.swapJoker(p, a.meldId, a.cardId); break;
        case 'discard': g.discard(p, a.cardId); break;
      }
    } catch (e) {
      if (e instanceof RemiError) throw new Error(`AI nelegalan potez ${JSON.stringify(a)}: ${e.message}`);
      throw e;
    }
    if (++guard > 60000) throw new Error('meč se zaglavio');
  }
  return g.getState();
}

test('AI vs AI: mečevi se završavaju bez nelegalnih poteza (2, 3 i 4 igrača)', () => {
  for (let seed = 1; seed <= 6; seed++) {
    for (const n of [2, 3, 4]) {
      const s = playMatch(seed, n);
      assert.ok(s.winners.length >= 1);
      assert.ok(s.history.every(h => h.winner === null || h.points[h.winner] < 0));
    }
  }
});
