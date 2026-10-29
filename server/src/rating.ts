// ELO za Tablić: svaka strana (igrač, a u četvoro par) igra „duel“ sa svakom drugom stranom.
// Rejting strane je prosek ljudi na njoj (računar ima fiksnih 1000 i ne menja se).
// Više poena u meču je bolje; isti broj poena je pola pobede.

export const K = 32;
export const AI_RATING = 1000;

export interface SideInput {
  /** Rejting svakog mesta na toj strani (null = računar). */
  ratings: (number | null)[];
  score: number;
}

const expected = (a: number, b: number) => 1 / (1 + 10 ** ((b - a) / 400));

function sideRating(s: SideInput): number {
  const vals = s.ratings.map(r => r ?? AI_RATING);
  return vals.reduce((x, y) => x + y, 0) / vals.length;
}

/** Promena rejtinga po strani (zaokružena), isti iznos za svakog čoveka na toj strani. */
export function ratingDeltas(sides: SideInput[]): number[] {
  const r = sides.map(sideRating);
  return sides.map((s, i) => {
    let sum = 0;
    sides.forEach((o, j) => {
      if (j === i) return;
      const actual = s.score > o.score ? 1 : s.score < o.score ? 0 : 0.5;
      sum += actual - expected(r[i], r[j]);
    });
    return Math.round((K * sum) / (sides.length - 1));
  });
}
