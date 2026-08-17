// Minimal service worker for Valley Turf Revival OS.
//
// This is a business app with live financial/customer data, not a
// content site — so this deliberately does NOT cache pages or API
// responses. Caching a stale invoice list or job schedule and serving
// it back with no indication it's stale would be actively misleading
// for the crews using this in the field. What it DOES do:
//
//   1. Registering a fetch handler at all is one of the criteria
//      Chrome/Android use to decide whether to offer the native
//      "Install app" prompt — without this, the manifest alone isn't
//      enough on Android (iOS Safari doesn't require it).
//   2. Precache the app shell (manifest + icons + the offline page
//      itself) so those always resolve instantly, on or offline.
//   3. If a full page navigation fails because there's no connection,
//      show a clear "you're offline" page instead of the browser's
//      generic dinosaur/error screen.
//
// Bump CACHE_NAME whenever APP_SHELL changes so old caches get cleaned
// up in the activate handler below.
const CACHE_NAME = "vtr-shell-v2";

const APP_SHELL = [
  "/offline.html",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png",
  "/icons/apple-touch-icon.png",
];

// Same-origin static assets safe to cache-first — nothing here ever
// contains customer/financial data, just brand/UI chrome.
const CACHEABLE_PREFIXES = ["/icons/", "/branding/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      // Activate this version immediately rather than waiting for every
      // open tab to close — crews shouldn't need to fully quit the app
      // to pick up a fixed offline page or new icon.
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only ever intercept simple same-origin GETs. Everything else
  // (POST/PUT/DELETE, cross-origin calls, Jobber webhooks, etc.) passes
  // straight through untouched.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Full page loads/navigations: always prefer the network (this app is
  // server-rendered and data changes constantly), and only fall back to
  // the offline page when there's truly no connection to reach it.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/offline.html"))
    );
    return;
  }

  // Static shell assets: cache-first, and top up the cache from the
  // network in the background so a future icon change still propagates.
  if (CACHEABLE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => cached);

        return cached ?? network;
      })
    );
    return;
  }

  // Everything else (API routes, data-bearing pages fetched via
  // fetch()/RSC, etc.) is left completely alone — no respondWith call
  // means the browser handles it exactly as if there were no service
  // worker at all.
});
