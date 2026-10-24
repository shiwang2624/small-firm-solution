'use strict';
/* SmallFirm Solution — service worker. App shell cached for offline use. */

const VERSION = 'sfs-v1';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './js/icons.js',
  './js/util.js',
  './js/store.js',
  './js/views-main.js',
  './js/views-money.js',
  './js/views-reports.js',
  './js/views-settings.js',
  './js/views-editors.js',
  './js/views-pos.js',
  './js/views-utilities.js',
  './js/web-api.js',
  './js/pwa.js',
  './js/app.js',
  './vendor/qrcode.js',
  './vendor/jsbarcode.min.js',
  './vendor/zxing.min.js',
  './brand/mark.png',
  './brand/icon-192.png',
  './brand/icon-256.png',
  './brand/icon-512.png',
  './legal/terms.html',
  './legal/privacy.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network first, fall back to the cached shell (offline).
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Assets: cache first, refresh in the background.
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) {
        fetch(req).then((res) => caches.open(VERSION).then((c) => c.put(req, res))).catch(() => {});
        return hit;
      }
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      });
    })
  );
});
