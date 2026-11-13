// Service worker: rende l'app utilizzabile offline e sempre aggiornata.
// Pagine: prima la rete (scavalcando la cache HTTP), poi la cache. Risorse statiche: prima la cache, poi la rete.
const CACHE = 'finanze-v4';

// File JS e CSS (con nome diverso a ogni versione) a cui fa riferimento la pagina.
const assetsOf = (html) => [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)].map((m) => new URL(m[1], self.location).href);

// Salva la pagina e scarica subito i suoi file, così l'app funziona offline fin dalla prima
// apertura; poi elimina dalla cache i file delle versioni precedenti.
async function storePage(res) {
  const cache = await caches.open(CACHE);
  const html = await res.clone().text();
  const wanted = assetsOf(html);
  // una pagina senza i file dell'app non è la nostra (es. il portale di una rete Wi-Fi): non va salvata
  if (!wanted.length) return;
  await cache.put('./', res);
  await Promise.all(wanted.map(async (url) => (await cache.match(url)) || cache.add(url)));
  for (const req of await cache.keys()) {
    if (req.url.includes('/assets/') && !wanted.includes(req.url)) await cache.delete(req);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(['./manifest.webmanifest', './icon.svg', './icon-192.png'].map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => fetch('./', { cache: 'reload' }))
      .then((res) => (res.ok ? storePage(res) : undefined)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // 'no-cache' obbliga a chiedere al server la versione più recente della pagina
    event.respondWith(
      fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
        .then((res) => {
          if (res.ok) event.waitUntil(storePage(res.clone()).catch(() => {}));
          return res;
        })
        .catch(() => caches.match('./')),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});

// Tocco su un promemoria: porta in primo piano l'app (o la apre).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => 'focus' in c);
      return open ? open.focus() : self.clients.openWindow('./');
    }),
  );
});
