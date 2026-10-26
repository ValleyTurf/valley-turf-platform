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

// Push notifications -- see lib/webPush.ts (server-side send, triggered
// by an inbound customer text/email/portal message) and
// app/(platform)/account/NotificationsSection.tsx (client subscribe
// flow). Ryan + Brittanie, 2026-10-25: want a red dot on the home-screen
// icon the same way any other messaging app shows one.
//
// Every push both shows a visible notification AND tries to set the
// badge, unconditionally -- iOS/iPadOS requires the notification no
// matter what (a push that only touched the badge is silently dropped),
// and Android ignores setAppBadge entirely, auto-badging instead off of
// whatever's left in the notification tray. Desktop Chrome/Edge honors
// setAppBadge directly. Doing both means every platform just takes
// whichever half it actually supports.
self.addEventListener("push", (event) => {
  let payload = {
    title: "Valley Turf Revival",
    body: "You have a new update.",
    url: "/messages",
    badgeCount: 0,
  };

  try {
    if (event.data) {
      payload = { ...payload, ...event.data.json() };
    }
  } catch (error) {
    console.error("Failed to parse push payload:", error);
  }

  const notify = self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: payload.url },
  });

  const badge =
    "setAppBadge" in navigator
      ? payload.badgeCount > 0
        ? navigator.setAppBadge(payload.badgeCount)
        : navigator.clearAppBadge()
      : Promise.resolve();

  event.waitUntil(Promise.all([notify, badge]));
});

// Tapping the notification focuses an existing tab on the right page if
// one's already open, rather than piling up a new one every time.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl =
    (event.notification.data && event.notification.data.url) || "/messages";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          const clientUrl = new URL(client.url);

          if (
            clientUrl.origin === self.location.origin &&
            "focus" in client
          ) {
            if ("navigate" in client) {
              client.navigate(targetUrl);
            }
            return client.focus();
          }
        }

        return self.clients.openWindow(targetUrl);
      })
  );
});
