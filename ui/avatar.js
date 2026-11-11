// Slika igrača: izbor fajla, sečenje u kvadrat 256×256 u pregledaču, slanje serveru (server/src/avatars.ts).
// Adresa moje slike pamti se u pregledaču (remi.avatar) da bi se videla i u igri protiv računara.

const KEY = 'remi.avatar';
const $ = id => document.getElementById(id);

export function myAvatarUrl() {
  try {
    return localStorage.getItem(KEY);
  } catch (e) {
    console.error('Slika se ne može pročitati:', e);
    return null;
  }
}

/** Odjava: slika prethodnog igrača ne sme da ostane u pregledaču. */
export function forgetAvatar() {
  rememberAvatar(null);
}

function rememberAvatar(url) {
  try {
    if (url) localStorage.setItem(KEY, url);
    else localStorage.removeItem(KEY);
  } catch (e) {
    console.error('Slika se ne može zapamtiti:', e);
  }
}

/** Slika ili, ako je nema, veliko slovo imena. cls: boja igrača (p0..p3). */
export function avatarEl(url, name, cls) {
  const box = document.createElement('div');
  box.className = `avatar ${cls}`;
  if (url) {
    const img = Object.assign(document.createElement('img'), { src: url, alt: '' });
    box.append(img);
  } else {
    box.textContent = name[0] ?? '?';
  }
  return box;
}

/** Iseci na sredini u kvadrat 256×256 i smanji (WebP, a gde ga pregledač ne pravi — JPEG). */
async function squareImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Ta slika ne može da se otvori.'));
      i.src = url;
    });
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    c.getContext('2d').drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, 256, 256);
    let data = c.toDataURL('image/webp', 0.85);
    if (!data.startsWith('data:image/webp')) data = c.toDataURL('image/jpeg', 0.85);
    if (data.length > 100_000) data = c.toDataURL('image/jpeg', 0.7);
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * hooks: token() → token prijavljenog igrača; name() → njegovo ime; changed() → pozvati posle promene slike.
 * Vraća refresh(): povuče adresu moje slike sa servera (posle prijave).
 */
export function initAvatar({ token, name, changed }) {
  const preview = () => $('avatarPreview').replaceChildren(avatarEl(myAvatarUrl(), name() ?? '?', 'p0'));
  const authHeader = () => ({ Authorization: `Bearer ${token()}` });

  async function call(method, body) {
    const res = await fetch('/api/avatar', {
      method,
      headers: { ...authHeader(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Greška ${res.status}`);
    return data;
  }

  $('avatarBtn').addEventListener('click', () => {
    $('avatarError').textContent = '';
    $('avatarRemove').hidden = !myAvatarUrl();
    preview();
    $('avatarDlg').showModal();
  });
  $('avatarClose').addEventListener('click', () => $('avatarDlg').close());
  $('avatarFile').addEventListener('change', async () => {
    const file = $('avatarFile').files?.[0];
    $('avatarFile').value = '';
    if (!file) return;
    $('avatarError').textContent = 'Šaljem sliku…';
    try {
      const res = await call('POST', { image: await squareImage(file) });
      rememberAvatar(res.url);
      preview();
      $('avatarRemove').hidden = false;
      $('avatarError').textContent = '';
      changed();
    } catch (e) {
      console.error('Slika nije poslata:', e);
      $('avatarError').textContent = e.message || 'Slika nije poslata. Pokušajte ponovo.';
    }
  });
  $('avatarRemove').addEventListener('click', async () => {
    try {
      await call('DELETE');
      rememberAvatar(null);
      preview();
      $('avatarRemove').hidden = true;
      changed();
    } catch (e) {
      $('avatarError').textContent = e.message;
    }
  });

  return async function refresh() {
    try {
      const res = await fetch('/api/avatar/mine', { headers: authHeader() });
      if (!res.ok) return;
      rememberAvatar((await res.json()).url);
      changed();
    } catch (e) {
      console.warn('Slika nije učitana:', e);
    }
  };
}
