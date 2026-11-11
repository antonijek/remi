// Admin panel: obaveštenja na telefonu (Web Push). Service worker push-sw.js služi SAMO za
// obaveštenja: scope /push/ — ne kontroliše stranice igre.

const $ = id => document.getElementById(id);
const PUSH_OK = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const b64ToBytes = s => Uint8Array.from(
  atob((s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const register = () => navigator.serviceWorker.register('./push-sw.js', { scope: './push/' });

const IDLE = 'Stiže ti poruka kad igrač pošalje poruku, kad dođe nov igrač ili kad je neko online sam.';

/** api(path, opts): poziv admin servera; showError(msg): prikaz greške na vrhu stranice. */
export function initPush({ api, showError }) {
  const post = (path, body) => api(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}),
  });

  async function refresh() {
    if (!PUSH_OK) {
      $('pushStatus').textContent = 'Ovaj pregledač ne podržava obaveštenja. Otvori admin panel u Chrome-u na telefonu.';
      $('pushOn').hidden = true;
      return;
    }
    const sub = await (await register()).pushManager.getSubscription();
    const on = Boolean(sub) && Notification.permission === 'granted';
    $('pushOn').hidden = on;
    $('pushTest').hidden = !on;
    $('pushOff').hidden = !on;
    if (on) $('pushStatus').textContent = `Uključeno na ovom uređaju. ${IDLE}`;
    else if (Notification.permission === 'denied') {
      $('pushStatus').textContent = 'Obaveštenja su blokirana u pregledaču. Dozvoli ih u podešavanjima sajta (katanac pored adrese), pa probaj ponovo.';
    } else $('pushStatus').textContent = IDLE;
  }

  const guarded = (fn, { keepStatus = false } = {}) => async () => {
    try { await fn(); } catch (e) { showError(e.message); }
    if (!keepStatus) await refresh().catch(e => showError(e.message));
  };

  $('pushOn').addEventListener('click', guarded(async () => {
    if (await Notification.requestPermission() !== 'granted') return;
    const { publicKey } = await api('/push');
    const sub = await (await register()).pushManager.subscribe({
      userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey),
    });
    await post('/push/subscribe', { subscription: sub.toJSON() });
    await post('/push/test');
  }));
  $('pushTest').addEventListener('click', guarded(async () => {
    const { sent } = await post('/push/test');
    $('pushStatus').textContent = sent ? 'Poslato — za par sekundi stiže na telefon.'
      : 'Nijedan uređaj nije primio poruku. Isključi pa ponovo uključi obaveštenja.';
  }, { keepStatus: true }));
  $('pushOff').addEventListener('click', guarded(async () => {
    const sub = await (await register()).pushManager.getSubscription();
    if (!sub) return;
    await post('/push/unsubscribe', { endpoint: sub.endpoint });
    await sub.unsubscribe();
  }));

  refresh().catch(e => showError(e.message));
}
