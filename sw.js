/* ============================================================
   ARES GYM — service worker (network-first)
   Страницы тянутся по сети вперёд (кэш — офлайн-фолбэк):
   любые правки index.html подхватываются сами. VER поднимать
   нужно только при изменении логики самого sw.js.
   ============================================================ */
const VER = 'ares-v19';

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
      const netP = fetch(req).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          return caches.open(VER).then(c => { c.put(req, copy); return res; });
        }
        return res;
      });
      e.waitUntil(netP.catch(() => {})); /* держит событие живым, пока кэш обновляется */
      return hit || netP.catch(() => hit || caches.match('./'));
    })
  );
});
