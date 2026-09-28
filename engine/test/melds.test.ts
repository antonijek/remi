import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardFromId } from '../src/cards.js';
import { buildMeld, meldPoints, swapJoker, extendMeld } from '../src/melds.js';
import type { Meld } from '../src/types.js';

const cards = (s: string) => s.split(' ').map(cardFromId);
const ok = (s: string) => buildMeld(cards(s));
const repr = (s: string) => ok(s)!.cards.map(mc => `${mc.rank}${mc.suit}`).join(' ');

test('komplet: 3–4 istog ranga, različite boje', () => {
  assert.equal(ok('7H1 7S1 7D2')?.kind, 'set');
  assert.equal(ok('7H1 7S1 7D2 7C1')?.kind, 'set');
  assert.equal(ok('7H1 7H2 7D1'), null, 'dve iste boje (dva špila) ne mogu u komplet');
  assert.equal(ok('7H1 7S1'), null, 'premalo karata');
  assert.equal(ok('7H1 7S1 8D1'), null);
});

test('niz: iste boje, redom; kec nisko ili visoko, ne oba', () => {
  assert.equal(ok('4H1 5H1 6H2')?.kind, 'run');
  assert.equal(ok('AH1 2H1 3H1')?.kind, 'run');
  assert.equal(ok('QH1 KH1 AH2')?.kind, 'run');
  assert.equal(ok('KH1 AH1 2H1'), null, 'nema prelaska K-A-2');
  assert.equal(ok('4H1 5S1 6H1'), null, 'različite boje');
  assert.equal(ok('4H1 6H1 7H1'), null, 'rupa bez džokera');
});

test('džoker: popunjava rupu ili produžava niz; najviše jedan po kombinaciji', () => {
  assert.equal(repr('4H1 JK1 6H1'), '4♥ 5♥ 6♥');
  assert.equal(repr('4H1 5H1 JK2'), '4♥ 5♥ 6♥');
  assert.equal(repr('QH1 KH1 JK1'), 'Q♥ K♥ A♥', 'višak džokera ide naviše');
  assert.equal(repr('KH1 AH1 JK1'), 'Q♥ K♥ A♥', 'posle keca ne može naviše — ide naniže');
  assert.equal(ok('4H1 JK1 JK2'), null, 'dva džokera');
  assert.equal(ok('7H1 7S1 JK1')?.kind, 'set');
});

test('vrednost kombinacije za otvaranje', () => {
  assert.equal(meldPoints(ok('AH1 2H1 3H1')!), 1 + 2 + 3);
  assert.equal(meldPoints(ok('QH1 KH1 AH1')!), 30);
  assert.equal(meldPoints(ok('10H1 JH1 QH1')!), 30);
  assert.equal(meldPoints(ok('7H1 7S1 7D1')!), 21);
  assert.equal(meldPoints(ok('4H1 JK1 6H1')!), 15, 'džoker vredi kao karta koju menja');
});

test('dopisivanje i zamena džokera', () => {
  const m: Meld = { id: 1, owner: 0, ...ok('4H1 JK1 6H1')! };
  assert.ok(extendMeld(m, cards('7H2')));
  assert.equal(extendMeld(m, cards('7S1')), null);
  const sw = swapJoker(m, cardFromId('5H2'));
  assert.ok(sw);
  assert.equal(sw!.joker.id, 'JK1');
  assert.equal(swapJoker(m, cardFromId('5S1')), null, 'pogrešna boja');

  const set: Meld = { id: 2, owner: 0, ...ok('9H1 9S1 JK2')! };
  assert.ok(swapJoker(set, cardFromId('9D1')), 'u kompletu džoker menja bilo koju boju koja nedostaje');
  assert.ok(swapJoker(set, cardFromId('9C2')));
  assert.equal(swapJoker(set, cardFromId('9H2')), null, 'ta boja već postoji');
});
