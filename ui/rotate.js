// Online: server šalje prikaz za moje mesto (mySeat), a ekran uvek crta mene na mestu 0 (dole).
// Ovde se „okrenu“ sva mesta: red, delilac, broj karata, otvoreni, poeni, vlasnici kombinacija,
// istorija i pobednici. Igra ide istim smerom, pa se redosled igrača ne menja.

export function rotateView(v, mySeat) {
  const n = v.playerCount;
  const pos = p => (p - mySeat + n) % n;
  const arr = a => Array.from({ length: n }, (_, l) => a[(l + mySeat) % n]);
  return {
    ...v,
    me: 0,
    turn: pos(v.turn),
    dealer: pos(v.dealer),
    handCounts: arr(v.handCounts),
    opened: arr(v.opened),
    scores: arr(v.scores),
    pickups: arr(v.pickups),
    discardsBy: arr(v.discardsBy),
    melds: v.melds.map(m => ({ ...m, owner: pos(m.owner) })),
    history: v.history.map(h => ({ ...h, winner: h.winner === null ? null : pos(h.winner), points: arr(h.points) })),
    winners: v.winners.map(pos),
  };
}
