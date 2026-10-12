// Arc Kit PWA service worker. Makes the app installable and opens instantly: the app shell and its hashed bundles
// are cached; everything else (RPC, APIs, prices) always goes to the network. Never caches anything private.
const CACHE = "arckit-pwa-v1";
const SHELL = ["/pwa/", "/pwa/manifest.webmanifest", "/pwa/icon-192.png", "/pwa/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("arckit-pwa-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin || !url.pathname.startsWith("/pwa/")) return;
  // app pages: network first so a new release shows up on the next open, cached shell when offline
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put("/pwa/", copy)); return r; }).catch(() => caches.match("/pwa/")));
    return;
  }
  // hashed bundles, fonts and images never change under the same URL: cache first
  if (/\/pwa\/(_expo|assets)\//.test(url.pathname) || /\.(png|ttf|woff2?)$/.test(url.pathname)) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return r; })));
  }
});
