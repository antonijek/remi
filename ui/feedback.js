// „Pohvale i primedbe“ (meni ☰): poruka vlasniku sajta. Neprijavljen može da ostavi mejl za odgovor.
// Server: server/src/feedback.ts (obaveštenje vlasniku na telefon, poruke u admin panelu).

const $ = id => document.getElementById(id);
const THANKS = 'Hvala! Poruka je stigla.';
const OFFLINE = 'Ne mogu da se povežem sa serverom.';

/** token(): token prijavljenog igrača ili null. */
export function initFeedback({ token }) {
  const dlg = $('feedbackDlg');
  $('feedbackMenuBtn').addEventListener('click', () => {
    $('menu').close();
    $('feedbackEmailRow').hidden = Boolean(token());
    $('feedbackMsg').textContent = '';
    $('feedbackError').textContent = '';
    $('feedbackSend').hidden = false;
    dlg.showModal();
  });
  $('feedbackClose').addEventListener('click', () => dlg.close());
  $('feedbackForm').addEventListener('submit', async e => {
    e.preventDefault();
    $('feedbackError').textContent = '';
    $('feedbackSend').disabled = true;
    const tok = token();
    try {
      const res = await fetch('api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
        body: JSON.stringify({ text: $('feedbackText').value, email: tok ? '' : $('feedbackEmail').value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        $('feedbackError').textContent = data.error || `Greška ${res.status}. Pokušajte kasnije.`;
        return;
      }
      $('feedbackText').value = '';
      $('feedbackMsg').textContent = THANKS;
      $('feedbackSend').hidden = true;
    } catch (err) {
      console.error('Slanje poruke nije uspelo:', err);
      $('feedbackError').textContent = OFFLINE;
    } finally {
      $('feedbackSend').disabled = false;
    }
  });
}
