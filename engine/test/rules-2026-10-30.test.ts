// Pravila proverena 2026-10-30 (zoki.com, forestrummy.com, igra-razbibriga, Wikipedija):
// više džokera na nizu posle otvaranja i okretanje gomile bez mešanja kad se špil potroši.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardFromId } from '../src/cards.js';
import { buildMeld, extendMeld, swapJoker } from '../src/melds.js';
import { RemiGame } from '../src/game.js';
import type { Meld } from '../src/types.js';

const cards = (s: string) => s.split(' ').map(cardFromId);
const meldOf = (s: string, id = 1): Meld => {
  const b = buildMeld(cards(s))!;
  return { id, owner: 0, kind: b.kind, cards: b.cards };
};

test('pri otvaranju najviše jedan džoker po kombinaciji', () => {
  assert.equal(buildMeld(cards('5H1 JK1 JK2 8H1')), null);
  assert.equal(buildMeld(cards('5H1 JK1 7H1'))?.kind, 'run');
});

test('na niz se posle otvaranja sme dopisati još džokera, na komplet ne', () => {
  const run = meldOf('5H1 JK1 7H1');
  const ext = extendMeld(run, cards('JK2'));
  assert.ok(ext, 'drugi džoker na niz');
  assert.equal(ext!.cards.filter(mc => mc.card.joker).length, 2);
  const set = meldOf('9H1 9S1 JK1');
  assert.equal(extendMeld(set, cards('JK2')), null, 'komplet ostaje sa jednim džokerom');
});

test('zamena džokera u nizu sa dva džokera uzima baš onog koji predstavlja kartu', () => {
  const run = meldOf('5H1 JK1 7H1');
  const two: Meld = { ...run, cards: extendMeld(run, cards('JK2'))!.cards };
  const joker = two.cards.find(mc => mc.card.joker && mc.rank !== '6')!;
  const real = cardFromId(`${joker.rank}H2`);
  const res = swapJoker(two, real);
  assert.ok(res);
  assert.equal(res!.joker.id, joker.card.id);
  assert.equal(res!.cards.filter(mc => mc.card.joker).length, 1);
});

test('prazan špil: gomila se okrene bez mešanja, gornja karta ostaje na gomili', () => {
  const g = new RemiGame({ players: 2, seed: 3 });
  const s = g.getState();
  const order = ['2C1', '3D1', '4S1', '9H2'];
  const keep = new Set(order);
  s.hands = s.hands.map(h => h.filter(c => !keep.has(c.id)));
  s.stock = [];
  s.discard = order.map(cardFromId);
  s.phase = 'DRAW';
  s.tookDiscard = null;
  s.takenCard = null;
  const g2 = RemiGame.fromState(s);
  const drawn = g2.drawStock(s.turn);
  assert.equal(drawn?.id, '2C1', 'prva odbačena karta je sada na vrhu špila');
  const after = g2.getState();
  assert.deepEqual(after.discard.map(c => c.id), ['9H2']);
  assert.deepEqual(after.stock.map(c => c.id), ['4S1', '3D1']);
});
