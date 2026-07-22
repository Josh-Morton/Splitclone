/*
 * Tally service worker — minimal shell caching so the PWA is installable and
 * survives brief offline moments.
 *
 * Icons + manifest are network-first (with a cache fallback) so brand/asset
 * changes propagate immediately instead of being pinned by an old cache.
 * Content-hashed Next assets are cache-first (they're immutable). Bump CACHE
 * to purge everything on the next visit.
 *
 * Phase 2 replaces this with full offline-first (precached shell + outbox).
 */

const CACHE = "tally-shell-v2";
const BRAND_ASSETS = /\/(icons\/|favicon\.ico|manifest\.webmanifest)/;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/"])));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  // Network-first for navigations and brand assets (icons/manifest/favicon),
  // so the latest is always served, falling back to cache offline.
  if (request.mode === "navigate" || BRAND_ASSETS.test(request.url)) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() =>
          caches.match(request).then((hit) => hit ?? (request.mode === "navigate" ? caches.match("/") : undefined))
        )
    );
    return;
  }

  // Cache-first for content-hashed static assets (immutable).
  if (request.url.includes("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
            return res;
          })
      )
    );
  }
});
