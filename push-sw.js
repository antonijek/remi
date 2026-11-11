// Service worker SAMO za obaveštenja vlasniku (admin panel → "Uključi obaveštenja").
// Registruje se sa scope-om /push/ — ne kontroliše nijednu stranicu igre i ništa ne kešira.

self.addEventListener('push', e => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch (err) {
    console.error('Obaveštenje se ne može pročitati:', err);
  }
  e.waitUntil(self.registration.showNotification(d.title || 'Remi', {
    body: d.body || '',
    icon: '/icons/icon-192.png',
    data: { url: d.url || '/' },
    tag: 'remi-obavestenje',
    renotify: true,
  }));
});

// dodir na obaveštenje otvara novu karticu (stranice igre ovaj worker ne kontroliše)
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.openWindow(new URL(e.notification.data?.url || '/', self.location.origin).href));
});
