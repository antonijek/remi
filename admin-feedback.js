// Admin panel, kartica „Poruke“: „Pohvale i primedbe“ igrača (server/src/feedback.ts).
// Tekst igrača se upisuje kao tekst (textContent), nikad kao HTML.

const when = iso => new Date(`${iso.replace(' ', 'T')}Z`).toLocaleString('sr-RS');

/** Broj nepročitanih na dugmetu kartice (0 = bez oznake). */
export function showUnread(n) {
  const badge = document.getElementById('feedbackBadge');
  badge.textContent = n ? ` (${n})` : '';
}

function item(m, { el, api, reload, showError }) {
  const box = el('div', null, `fb-item${m.read ? '' : ' unread'}`);
  const who = m.name ?? (m.userId ? `Igrač #${m.userId}` : 'Neprijavljen');
  const head = el('div', null, 'fb-head');
  head.append(el('b', who));
  if (!m.read) head.append(el('span', ' novo', 'fb-new'));
  const meta = [m.email, m.device, when(m.createdAt)].filter(Boolean).join(' · ');
  head.append(el('span', ` ${meta}`, 'fb-meta'));
  const run = fn => async () => {
    try { await fn(); await reload(); } catch (e) { showError(e.message); }
  };
  const read = el('button', m.read ? 'Nepročitano' : 'Pročitano', 'btn');
  read.addEventListener('click', run(() => api(`/feedback/${m.id}/read`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ read: !m.read }),
  })));
  const del = el('button', 'Obriši', 'btn');
  del.addEventListener('click', run(async () => {
    if (confirm('Obrisati ovu poruku?')) await api(`/feedback/${m.id}`, { method: 'DELETE' });
  }));
  head.append(read, del);
  box.append(head, el('p', m.text, 'fb-text'));
  return box;
}

export async function feedbackView(ctx) {
  const { messages, unread } = await ctx.api('/feedback');
  showUnread(unread);
  const box = ctx.el('div');
  if (!messages.length) return ctx.el('p', 'Još nema poruka.');
  for (const m of messages) box.append(item(m, ctx));
  return box;
}
