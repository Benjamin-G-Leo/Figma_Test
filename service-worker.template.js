// Volt Runner service worker. vite.config.js fills in the two placeholders below and
// writes the result to dist/sw.js on every build (so each build gets its own cache).
const CACHE = 'voltrunner-__CACHE_VERSION__';
const PRECACHE = __PRECACHE_URLS__;

// Save every game file on install, so the game can start with no internet.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// Throw away caches from older builds.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('voltrunner-') && key !== CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  // Supabase and anything else outside this site goes straight to the network.
  if (new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // A page: network first, so players get the newest version when online.
    // Offline (or no answer in 4 seconds): that page's saved copy, else the game.
    const network = fetch(request).catch(() => null);
    const timeout = new Promise((resolve) => setTimeout(resolve, 4000, null));
    event.respondWith(
      Promise.race([network, timeout]).then(
        (response) =>
          response ||
          caches.match(request, { ignoreSearch: true }).then((saved) => saved || caches.match('/index.html'))
      )
    );
    return;
  }

  // Everything else: saved copy first. File names carry a fingerprint, so a saved
  // file is never out of date.
  event.respondWith(caches.match(request).then((hit) => hit || fetch(request)));
});
