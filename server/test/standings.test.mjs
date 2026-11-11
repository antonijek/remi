import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStandings, placePoints } from '../dist/standings.js';

const members = [1, 2, 3, 4].map(userId => ({ userId, name: `P${userId}` }));
const rules = { scoring: 'places', norma: 1, rankBy: 'total' };

test('bodovi po mestu: 2, 3 i 4 igrača, izjednačeni dele', () => {
  assert.deepEqual(placePoints([-10, -50], [6, 2]), [6, 2]);
  assert.deepEqual(placePoints([-10, -5, -50], [10, 5, 1]), [5, 10, 1].map((_, i) => [5, 10, 1][i]));
  assert.deepEqual(placePoints([-5, -5, -50], [10, 5, 1]), [7.5, 7.5, 1]);
  assert.deepEqual(placePoints([0, -20, -10, -30], [12, 7, 3, 1]), [12, 3, 7, 1]);
});

test('u tabelu ulaze samo partije u kojima su svi članovi lige', () => {
  const rows = computeStandings(members, [
    { userIds: [1, 2, 3], scores: [-10, -20, -30] },
    { userIds: [1, 2, null], scores: [-10, -20, -30] }, // računar
    { userIds: [1, 2, 99], scores: [-10, -20, -30] }, // nije član
  ], rules);
  assert.equal(rows.find(r => r.userId === 1).matches, 1);
  assert.equal(rows.find(r => r.userId === 4).matches, 0);
  assert.deepEqual(rows.slice(0, 3).map(r => [r.userId, r.points]), [[1, 10], [2, 5], [3, 1]]);
});

test('ispod norme na dno; ocena po proseku; bodovanje po rezultatu', () => {
  const m = [
    { userIds: [1, 2], scores: [-10, -30] },
    { userIds: [1, 2], scores: [-10, -30] },
    { userIds: [3, 2], scores: [-10, -30] },
  ];
  const byTotal = computeStandings(members, m, { scoring: 'places', norma: 2, rankBy: 'total' });
  assert.equal(byTotal[0].userId, 1); // 2 partije, 12 bodova
  assert.equal(byTotal.find(r => r.userId === 3).meetsNorma, false);
  assert.equal(byTotal.at(-1).meetsNorma, false);
  const byResult = computeStandings(members, m, { scoring: 'result', norma: 1, rankBy: 'total' });
  assert.equal(byResult[0].points, 20); // 1: +10 +10
});
