/* ============================================================
   ARES GYM — service worker v13
   Начиная с этой версии файл sw.js больше НЕ нужно редактировать:
   страницы тянутся по сети вперёд (кэш — только офлайн-фолбэк),
   поэтому любое обновление index.html подхватывается само.
   ============================================================ */
const VER = 'ares-v18';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VER)
      .then(c => c.add(new Request('./', { cache: 'reload' })).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VER).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; /* внешние ссылки не трогаем */

  const accept = req.headers.get('accept') || '';
  const isNav = req.mode === 'navigate' || accept.includes('text/html');

  /* Страницы (само приложение): сеть вперёд, кэш — офлайн-фолбэк */
  if (isNav) {
    e.respondWith(
      fetch(req, { cache: 'reload' })
        .then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            e.waitUntil(caches.open(VER).then(c => c.put('./', copy)).catch(() => {}));
          }
          return res;
        })
        .catch(() => caches.match('./').then(hit => hit || Response.error()))
    );
    return;
  }

  /* Статика (фото Atlas/, иконки, manifest): кэш вперёд + тихое фоновое обновление */
  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          e.waitUntil(caches.open(VER).then(c => c.put(req, copy)).catch(() => {}));
        }
        return res;
      }).catch(() => hit || caches.match('./'));
      return hit || net;
    })
  );
});
