const CACHE = 'zipzip-v6-tempo-routes';
const scope = self.registration.scope;
const shell = [scope, new URL('manifest.webmanifest', scope).href, new URL('zipzip-icon.svg', scope).href];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(shell)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
          return response;
        })
        .catch(() => cached || caches.match(scope));
      return cached || network;
    }),
  );
});
