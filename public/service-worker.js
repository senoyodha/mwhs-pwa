// =============================
// MWHS PWA SERVICE WORKER
// Full offline support
// =============================

const CACHE_VERSION = "mwhs-v1";
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const ASSETS = [
  "/",                    // Vite will rewrite this to index.html
  "/index.html",
  "/manifest.json",

  // Timetable JSON
  "/data/timetable.json",

  // Icons
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-192-maskable.png",
  "/icons/icon-512-maskable.png",
  "/icons/apple-icon-180.png",

  // Audio
  "/audio/adhan_1.m4a",
  "/audio/adhan_2.m4a",
];

// Pre-cache essential files
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate new SW — cleanup old caches
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== STATIC_CACHE)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch handler — offline support
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  // Only intercept GET requests
  if (request.method !== "GET") return;

  // Serve local static assets with cache-first strategy
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(request).then(cached => {
        return (
          cached ||
          fetch(request).catch(() => caches.match("/index.html"))
        );
      })
    );
    return;
  }

  // For external requests, fallback to network-first
  event.respondWith(
    fetch(request)
      .then(resp => resp)
      .catch(() => caches.match(request))
  );
});

// ---- PUSH HANDLERS ----
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    // If payload isn't JSON, fallback
    data = { title: "MWHS", body: "It's time for prayer." };
  }

  const title = data.title || "MWHS";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: data.data || {}, // keep route, prayer key, etc.
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Optional: open app when notification clicked
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = dataSafe(event, "data.url") || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

function dataSafe(evt, path) {
  try {
    const parts = path.split(".");
    let obj = evt.notification;
    for (const p of parts) obj = obj[p];
    return obj;
  } catch { return null; }
}