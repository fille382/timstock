/* sw.js - cachar appens filer sa den fungerar utan tackning ute pa faltet. */
var CACHE = 'timstock-v8';

var ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './css/styles.css',
  './js/store.js',
  './js/ui.js',
  './js/view-time.js',
  './js/view-clients.js',
  './js/view-invoices.js',
  './js/view-settings.js',
  './js/app.js'
];

self.addEventListener('install', function (ev) {
  ev.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          return k === CACHE ? null : caches.delete(k);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

/* Natet forst, cache som reserv - da far du senaste versionen nar du har tackning. */
self.addEventListener('fetch', function (ev) {
  if (ev.request.method !== 'GET') return;

  ev.respondWith(
    fetch(ev.request)
      .then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(ev.request, copy); });
        return res;
      })
      .catch(function () {
        return caches.match(ev.request).then(function (hit) {
          return hit || caches.match('./index.html');
        });
      })
  );
});
