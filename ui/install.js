// Predlog instalacije na telefonu (meni i lobi): Chrome daje pravo dugme „Instaliraj“
// (beforeinstallprompt), a gde ga nema (iPhone, pregledač u Viberu/Facebook-u) piše kako se instalira.

const KEY = 'remi.install_off'; // '1' = igrač je zatvorio predlog
let installPrompt = null;

const ua = navigator.userAgent;
const IOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1); // iPadOS se predstavlja kao Mac
const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|Viber|WhatsApp|Line\/|; wv\)/i.test(ua); // pregledač unutar aplikacije ne instalira
const PHONE = /Android/.test(ua) || IOS;

function hint() {
  if (installPrompt) return 'Brže se otvara i radi kao prava aplikacija.';
  if (IOS && IN_APP) return 'Otvorite ovu stranicu u Safariju, pa dodirnite Deli (kvadratić sa strelicom nagore) → „Dodaj na početni ekran“.';
  if (IOS) return 'Dodirnite Deli (kvadratić sa strelicom nagore) → „Dodaj na početni ekran“.';
  if (IN_APP) return 'U meniju (⋮) izaberite „Otvori u Chrome-u“, pa u Chrome-u meni ⋮ → „Instaliraj aplikaciju“.';
  return 'U meniju pregledača (⋮) izaberite „Instaliraj aplikaciju“ ili „Dodaj na početni ekran“.';
}

const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function dismissed() {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch (e) {
    console.error('Izbor o instalaciji se ne može pročitati:', e);
    return false;
  }
}

function hide() {
  for (const el of document.querySelectorAll('.install')) el.hidden = true;
}

async function install() {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice.catch(e => console.error('Instalacija nije dovršena:', e));
  installPrompt = null;
  hide();
}

function build(el) {
  const text = document.createElement('div');
  text.className = 'install-txt';
  const title = Object.assign(document.createElement('b'), { textContent: '📲 Instalirajte Remi kao aplikaciju' });
  text.append(title, Object.assign(document.createElement('span'), { textContent: hint() }));
  const close = Object.assign(document.createElement('button'), {
    className: 'install-x', type: 'button', textContent: '✕', title: 'Zatvori',
  });
  close.setAttribute('aria-label', 'Zatvori');
  close.addEventListener('click', () => {
    try {
      localStorage.setItem(KEY, '1');
    } catch (e) {
      console.error('Izbor o instalaciji se ne može sačuvati:', e);
    }
    hide();
  });
  el.replaceChildren(text, close);
  if (installPrompt) {
    const btn = Object.assign(document.createElement('button'), {
      className: 'btn primary install-btn', type: 'button', textContent: 'Instaliraj',
    });
    btn.addEventListener('click', install);
    el.append(btn);
  }
  el.hidden = false;
}

function show() {
  if (!PHONE || installed() || dismissed()) return;
  for (const el of document.querySelectorAll('.install')) build(el);
}

export function initInstall() {
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; show(); });
  addEventListener('appinstalled', () => { installPrompt = null; hide(); });
  show();
}
