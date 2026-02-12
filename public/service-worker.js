// =============================
// MWHS PWA SERVICE WORKER
// Full offline support + Push
// =============================

const CACHE_VERSION = "mwhs-v2"; // bump when you change assets/logic
const CACHE_NAME = `static-${CACHE_VERSION}`;

// Only include files that truly exist under /public
const PRECACHE_URLS = [
  "/",                   // SPA shell
  "/index.html",
  "/manifest.json",

  // Icons
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-192-maskable.png",
  "/icons/icon-512-maskable.png",
  "/icons/apple-icon-180.png",

  // (Optional) favicon, if present
  "/favicon.ico",

  // Audio (if you want them available offline)
  "/audio/adhan_1.m4a",
  "/audio/adhan_2.m4a",
];

// --------------------------------------------------
// INSTALL: Pre-cache essential files (fail-safe)
// --------------------------------------------------
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(PRECACHE_URLS);
      } catch (e) {
        // Do not block activation if one of the URLs fails
        console.warn("[SW] Precache skipped some assets:", e);
      }
    })()
  );
});

// --------------------------------------------------
// ACTIVATE: Clean old caches + take control
// --------------------------------------------------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // cleanup old versions with same prefix
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k.startsWith("static-"))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// --------------------------------------------------
// FETCH: Offline strategies
// - HTML: network-first (fallback to cache/index.html)
// - Others: cache-first (fallback to network)
// --------------------------------------------------
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only handle GET
  if (req.method !== "GET") return;

  // Heuristic: HTML requests
  const isHTML =
    req.mode === "navigate" ||
    (req.headers.get("accept") || "").includes("text/html");

  if (isHTML) {
    // Network-first for navigations to keep app fresh
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, res.clone());
          return res;
        } catch {
          const cache = await caches.open(CACHE_NAME);
          // Try exact match, otherwise fallback to shell
          return (await cache.match(req)) || (await cache.match("/index.html"));
        }
      })()
    );
    return;
  }

  // For non-HTML (icons, audio, etc.): cache-first for speed
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        // As a last resort, return whatever we have (may be undefined)
        return cached || new Response(null, { status: 504 });
      }
    })()
  );
});

// --------------------------------------------------
// PUSH: Show incoming notifications
// --------------------------------------------------
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || "MWHS";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: data.data || {}, // e.g., { url: "/" }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// --------------------------------------------------
// NOTIFICATION CLICK: focus existing or open new
// --------------------------------------------------
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl =
    (event.notification && event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        // Reuse an existing tab that is already on our origin
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      // Or open a new one
      return clients.openWindow(targetUrl);
    })
  );
});