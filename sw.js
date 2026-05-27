const CACHE_NAME = "inventory-v24.1-static";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./style.css?v=241",
  "./data/inventory.db",
  "./js/00-config.js?v=241",
  "./js/01-core-events.js?v=241",
  "./js/02-render.js?v=241",
  "./js/03-bulk-and-api.js?v=241",
  "./js/04-editors.js?v=241",
  "./js/05-database.js?v=241",
  "./js/06-inventory-model.js?v=241",
  "./js/07-theme-utils.js?v=241",
  "./js/08-project-editor.js?v=241"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => null));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.hostname === "api.github.com") return;

  if (url.pathname.endsWith("/data/inventory.db")) {
    event.respondWith(fetch(request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      return response;
    }).catch(() => caches.match(request)));
    return;
  }

  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
    }
    return response;
  })));
});
