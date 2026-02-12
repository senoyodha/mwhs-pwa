// =============================
// MWHS PWA SERVICE WORKER
// Full offline support + Push
// =============================

const CACHE_VERSION = "mwhs-v3"; // bump when you change assets/logic
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

  // (Optional) Poster / favicon, if present
  "/icons/poster.png",
  "/favicon.ico",

  // Audio (if you want them available offline)
  "/audio/adhan_1.m4a",
  "/audio/adhan_2.m4a",
];

// --------------------------------------------------
// Helpers
// --------------------------------------------------
function isHttpLikeRequest(req) {
  // NOTE: Some requests come from extensions: chrome-extension:, moz-extension:, etc.
  try {
    const u = new URL(req.url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    // Non-standard scheme or opaque; treat as not-http(s)
    return false;
  }
}

async function safePut(cache, req, res) {
  try {
    if (!isHttpLikeRequest(req)) return;           // avoid chrome-extension://
    if (!res || !res.ok) return;                   // only cache successful responses
    await cache.put(req, res.clone());
  } catch (e) {
    // Never let caching crash the SW
    // console.warn("[SW] cache.put failed", e);
  }
}

// --------------------------------------------------
// INSTALL: Pre-cache essential files (fail-safe)
// --------------------------------------------------
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        // Precache, but don't let an error block install
        await cache.addAll(PRECACHE_URLS);
      } catch (e) {
        // Do not block activation if one of the URLs fails
        // console.warn("[SW] Precache skipped some assets:", e);
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
// - Skip non-http(s) completely
// - HTML: network-first (fallback to cache/index.html)
// - Others: cache-first (fallback to network)
// --------------------------------------------------
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only handle GET
  if (req.method !== "GET") return;

  // Ignore any non-http(s) scheme (e.g., chrome-extension://)
  if (!isHttpLikeRequest(req)) return;

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
          await safePut(cache, req, res);
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
        await safePut(cache, req, res);
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
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});