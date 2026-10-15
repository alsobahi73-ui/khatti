/* Service Worker لمنصة خطّي — دعم العمل دون اتصال (Offline PWA) */
const CACHE_NAME = "khatti-pwa-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./register.html",
  "./support.html",
  "./manifest.json",
  "./assets/style.css",
  "./assets/data.js",
  "./assets/core.js",
  "./assets/demo.js",
  "./assets/app.js",
  "./assets/locations.js",
  "./assets/icon.png",
  "./driver/board.html",
  "./passenger/live-tracking.html"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).catch(() => caches.match("./index.html")))
  );
});
