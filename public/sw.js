// Service Worker — Securionis Chantiers
// Stratégie : Network-first pour les pages, Cache-first pour les assets statiques.

const CACHE_VERSION = "v1";
const STATIC_CACHE = `securionis-static-${CACHE_VERSION}`;
const PAGES_CACHE = `securionis-pages-${CACHE_VERSION}`;

// Assets statiques à pré-cacher
const PRECACHE_URLS = ["/manifest.json", "/icon.svg"];

// Patterns d'assets statiques (cache-first)
const STATIC_PATTERNS = [
  /\/_next\/static\//,
  /\.(svg|png|jpg|jpeg|webp|ico|woff2?)$/,
];

// Pages à cacher après visite (network-first)
const CACHEABLE_PAGES = [
  /^\/dashboard/,
  /^\/chantiers/,
  /^\/login/,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
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
            .filter(
              (key) => key !== STATIC_CACHE && key !== PAGES_CACHE
            )
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorer les requêtes non-GET et les API Supabase
  if (request.method !== "GET") return;
  if (url.hostname.includes("supabase")) return;
  if (url.pathname.startsWith("/api/")) return;

  // Assets statiques : cache-first
  if (STATIC_PATTERNS.some((p) => p.test(url.pathname))) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Pages : network-first (cache si offline)
  if (
    request.headers.get("accept")?.includes("text/html") &&
    CACHEABLE_PAGES.some((p) => p.test(url.pathname))
  ) {
    event.respondWith(networkFirst(request, PAGES_CACHE));
    return;
  }

  // Next.js data/RSC requests : network-first
  if (
    url.pathname.includes("_next/data") ||
    request.headers.get("rsc") === "1"
  ) {
    event.respondWith(networkFirst(request, PAGES_CACHE));
    return;
  }
});

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("Offline", { status: 503 });
  }
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    // Page offline de fallback
    return new Response(
      `<!DOCTYPE html>
      <html lang="fr">
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Hors-ligne — Securionis</title>
      <style>
        body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f9fafb;color:#374151}
        .c{text-align:center;padding:2rem}
        h1{font-size:1.5rem;margin-bottom:0.5rem}
        p{color:#6b7280}
        button{margin-top:1rem;padding:0.75rem 1.5rem;background:#1e40af;color:#fff;border:none;border-radius:0.5rem;font-size:1rem;cursor:pointer}
      </style></head>
      <body><div class="c">
        <h1>Hors-ligne</h1>
        <p>Cette page n'est pas disponible hors-ligne.<br>Vérifiez votre connexion.</p>
        <button onclick="location.reload()">Réessayer</button>
      </div></body></html>`,
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}
