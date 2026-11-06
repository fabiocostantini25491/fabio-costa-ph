// Service worker di Fabio Costa Ph — rende il sito installabile e utilizzabile offline.
// Strategie:
//  - pagine, codice e contenuti (html/js/css/json del sito): prima la rete, poi la copia salvata
//  - immagini del sito, librerie e font: copia salvata, aggiornata in background
//  - tasselli delle mappe: copia salvata (le zone già viste funzionano offline), con un limite
//  - Supabase, OpenStreetMap, meteo, statistiche: sempre e solo rete (dati personali o in tempo reale)
const VERSION = "fcph-20261106a";
const CORE = `${VERSION}-core`;
const ASSETS = `${VERSION}-assets`;
const TILES = "fcph-tiles";            // non legato alla versione: le mappe salvate restano
const MAX_TILES = 1500;

const PRECACHE = ["/", "/index.html", "/manifest.webmanifest", "/img/icon-512.png", "/img/icon-192.png", "/img/logo.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CORE).then(c => c.addAll(PRECACHE)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith("fcph-") && k !== TILES && !k.startsWith(VERSION)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

const NEVER = /supabase\.co|overpass|private\.coffee|maps\.mail\.ru|open-meteo|umami|photon\.komoot|wikipedia\.org|ig\.me|huggingface|deepl/;
const TILE_HOSTS = /arcgisonline\.com|basemaps\.cartocdn\.com|tile\.openstreetmap|s3\.amazonaws\.com\/elevation-tiles|tiles\.stadiamaps|opentopomap/;
const LIB_HOSTS = /cdnjs\.cloudflare\.com|unpkg\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com/;

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (NEVER.test(url.hostname) || url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") return;

  if (TILE_HOSTS.test(url.href)) { e.respondWith(cacheFirst(req, TILES, true)); return; }
  if (LIB_HOSTS.test(url.hostname)) { e.respondWith(staleWhileRevalidate(req, ASSETS)); return; }
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") { e.respondWith(networkFirst(req, CORE, "/index.html")); return; }
  if (/\.(?:jpe?g|png|webp|gif|svg|avif|ico)$/i.test(url.pathname)) { e.respondWith(staleWhileRevalidate(req, ASSETS)); return; }
  e.respondWith(networkFirst(req, CORE));
});

async function networkFirst(req, cacheName, fallbackPath) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: false }) || await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (fallbackPath) { const fb = await cache.match(fallbackPath) || await cache.match("/"); if (fb) return fb; }
    throw err;
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const net = fetch(req).then(res => { if (res.ok || res.type === "opaque") cache.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await net) || Response.error();
}

let tileWrites = 0;
async function cacheFirst(req, cacheName, trim) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok) {            // le risposte "opache" occupano tantissimo spazio: si salvano solo quelle normali
      await cache.put(req, res.clone());
      if (trim && ++tileWrites % 100 === 0) trimCache(cacheName, MAX_TILES);
    }
    return res;
  } catch (err) { return Response.error(); }
}

async function trimCache(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}
