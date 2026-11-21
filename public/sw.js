// Service worker do app de campo (§6.1, RN-23).
// - Arquivos estáticos do Next: cache primeiro (têm hash no nome).
// - Telas do campo (/campo...): rede primeiro, com cópia para abrir sem sinal.
// - Os apontamentos em si ficam no IndexedDB (Dexie) e são sincronizados pela própria tela.
const VERSAO = 'cafe-v2';
const OFFLINE = '/offline.html';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.add(OFFLINE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/_next/static/')) {
    e.respondWith(
      caches.match(req).then((c) => c || fetch(req).then((r) => {
        if (r.ok) caches.open(VERSAO).then((cache) => cache.put(req, r.clone()));
        return r;
      })),
    );
    return;
  }

  if (req.mode === 'navigate') {
    const doCampo = url.pathname === '/campo' || url.pathname.startsWith('/campo/');
    e.respondWith(
      fetch(req)
        .then((r) => {
          if (doCampo && r.ok) caches.open(VERSAO).then((cache) => cache.put(req, r.clone()));
          return r;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match(OFFLINE))),
    );
  }
});
