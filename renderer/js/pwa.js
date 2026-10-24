'use strict';
/* Registers the service worker when served over http(s). */
(function () {
  const secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!('serviceWorker' in navigator) || !secure) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err && err.message);
    });
  });
})();
