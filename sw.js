// Service worker de la PWA del itinerario.
// Estrategia: cache-first para el shell (funciona sin senial),
// con actualizacion en segundo plano cuando hay conexion.
const CACHE = 'kj26-614f6282';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(()=>{})));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// El cliente pide activar la version nueva sin esperar a cerrar todas las pestanias.
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const isDoc = e.request.mode === 'navigate' ||
                (e.request.destination === 'document') ||
                new URL(e.request.url).pathname.endsWith('/index.html');

  if (isDoc) {
    // El documento va NETWORK-FIRST con timeout corto: si hay senial, siempre
    // trae la ultima version publicada; si no, cae al cache y funciona offline.
    e.respondWith((async () => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 3500);
        const res = await fetch(e.request, { cache: 'no-store', signal: ctrl.signal });
        clearTimeout(t);
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
          return res;
        }
        throw new Error('bad status');
      } catch (err) {
        const hit = await caches.match(e.request) || await caches.match('./index.html');
        if (hit) return hit;
        throw err;
      }
    })());
    return;
  }

  // El resto (iconos, manifest) va cache-first: no cambia entre versiones.
  e.respondWith(
    caches.match(e.request).then(hit => {
      const net = fetch(e.request).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
