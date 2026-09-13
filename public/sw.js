// Service Worker — cache limité aux ressources publiques de cette origine.
const CACHE_VERSION = "v10";
const STATIC_CACHE = `securionis-static-${CACHE_VERSION}`;
const PUBLIC_ASSETS = new Set(["/manifest.json", "/icon.svg", "/fonts/material-symbols-outlined.woff2"]);
const PRECACHE_URLS = ["/manifest.json", "/icon.svg"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(STATIC_CACHE).then(cache => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith("securionis-") && key !== STATIC_CACHE)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.headers.get("authorization") || request.headers.get("rsc") === "1") return;
  if (url.pathname.startsWith("/_next/static/") || PUBLIC_ASSETS.has(url.pathname)) {
    event.respondWith(publicAsset(request));
  } else if (request.mode === "navigate") {
    // Aucun HTML authentifié, RSC, média privé ou réponse API dans CacheStorage.
    event.respondWith(fetch(request).catch(() => new Response(
      '<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hors ligne — Securionis</title><body style="font-family:system-ui;padding:2rem"><h1>Connexion nécessaire pour ouvrir cette page</h1><p>Vos modifications enregistrées restent sur cet appareil, liées à votre compte. Une visite déjà ouverte peut être renseignée hors ligne. Reconnectez-vous au réseau pour ouvrir une autre page.</p><button onclick="location.reload()">Réessayer</button></body></html>',
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
    )));
  }
});
async function publicAsset(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok && !response.redirected && response.type !== "opaque"
      && !/private|no-store/i.test(response.headers.get("cache-control") ?? "")) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch { return new Response("Ressource indisponible hors ligne", { status: 503 }); }
}
