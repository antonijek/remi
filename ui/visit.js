// Brojač posetilaca za admin panel: nasumičan id iz pregledača (bez ličnih podataka),
// broje se i oni bez naloga koji igraju protiv računara.

export function countVisit(prefix) {
  try {
    let v = localStorage.getItem(`${prefix}.vid`);
    if (!v) {
      v = (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).slice(0, 16);
      localStorage.setItem(`${prefix}.vid`, v);
    }
    fetch('/api/visit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ v }) })
      .catch(e => console.warn('Poseta nije zabeležena:', e));
  } catch (e) {
    console.warn('Poseta nije zabeležena:', e);
  }
}
