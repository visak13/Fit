/* Fit platform spike — service worker.
 *
 * Present for ONE reason: a PWA needs a registered service worker to be installable,
 * and the whole point of the spike is to test the INSTALLED standalone launch.
 *
 * Deliberately dumb. No probe depends on it. It never caches a Google API response
 * and it never touches an access token — tokens live in memory in the page only.
 */
"use strict";

var CACHE = "fit-spike-v1";
var SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      /* addAll is all-or-nothing; a single 404 would leave the app uninstallable
         with no explanation, so each entry is allowed to fail on its own. */
      return Promise.all(SHELL.map(function (url) {
        return cache.add(url).catch(function () { return null; });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (name) {
        return (name === CACHE) ? null : caches.delete(name);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") { return; }

  var url = new URL(request.url);
  /* Same-origin shell only. Google endpoints and the GIS script always go to the
     network — a cached auth or API response would be a lie, and lying about a
     remote commit is exactly what this spike exists to avoid. */
  if (url.origin !== self.location.origin) { return; }

  event.respondWith(
    caches.match(request).then(function (hit) {
      if (hit) { return hit; }
      return fetch(request).then(function (response) {
        if (response && response.ok) {
          var copy = response.clone();
          caches.open(CACHE).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      }).catch(function () {
        return caches.match("./index.html").then(function (fallback) {
          if (fallback) { return fallback; }
          return new Response("offline and nothing cached", {
            status: 503,
            headers: { "Content-Type": "text/plain" }
          });
        });
      });
    })
  );
});
