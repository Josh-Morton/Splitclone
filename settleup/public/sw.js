/*
 * Tally service worker — minimal shell caching so the PWA is installable and
 * survives brief offline moments.
 *
 * Icons + manifest are network-first (with a cache fallback) so brand/asset
 * changes propagate immediately instead of being pinned by an old cache.
 * Content-hashed Next assets are cache-first (they're immutable). Bump CACHE
 * to purge everything on the next visit.
 *
 * Also hosts the Web Push handlers (Phase 9, ADR-0014): `push` shows the
 * notification, `notificationclick` focuses an already-open Tally tab (or
 * opens one) at the notification's deep link.
 *
 * Phase 2 replaces this with full offline-first (precached shell + outbox).
 */

const CACHE = "tally-shell-v4";
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

/* ---------------------------------------------------------------------------
 * Web Push (Phase 9, ADR-0014)
 * ------------------------------------------------------------------------- */

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Tally-ho!", body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "Tally-ho!";
  const url = payload.url || "/";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url },
      // Collapse repeats of the same target rather than stacking duplicates.
      tag: url,
      renotify: true,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      // Reuse an open Tally tab where possible so we don't pile up windows.
      for (const w of wins) {
        if (w.url.includes(self.location.origin) && "focus" in w) {
          if ("navigate" in w) w.navigate(target).catch(() => {});
          return w.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
