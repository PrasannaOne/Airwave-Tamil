/*
 * AIRWAVE TAMIL · SERVICE WORKER
 * Silent PWA updates + offline app shell and Tamil station catalogue.
 * Radio streams and third-party station artwork are never cached.
 */
"use strict";

const CACHE_VERSION = "airwave-tamil-v2";
const APP_CACHE = `${CACHE_VERSION}-app`;
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./tamil-stations.json",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./airwave-preview.jpg"
];

const scopedUrl = (path) => new URL(path, self.registration.scope).href;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);

    // Cache shell files independently so one optional missing asset cannot
    // prevent the new worker from installing.
    await Promise.all(APP_SHELL.map(async (path) => {
      const url = scopedUrl(path);
      try {
        const response = await fetch(new Request(url, { cache: "reload" }));
        if (response.ok && response.type === "basic") {
          await cache.put(url, response);
        }
      } catch (error) {
        console.warn("Airwave Tamil app-shell cache skipped:", path, error);
      }
    }));

    // Silent activation, with no forced page reload.
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith("airwave-tamil-") && key !== APP_CACHE)
        .map((key) => caches.delete(key))
    );

    // Claim clients without reloading them. Current playback keeps running.
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const requestUrl = new URL(request.url);

  // Do not intercept external artwork, radio streams, or unrelated requests.
  if (requestUrl.origin !== self.location.origin) return;
  if (request.destination === "audio" || request.destination === "video") return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        // Network-first: a fresh navigation receives the latest deployed HTML.
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(APP_CACHE);
          await cache.put(request, response.clone());
        }
        return response;
      } catch (_) {
        const cachedPage = await caches.match(request)
          || await caches.match(scopedUrl("./index.html"))
          || await caches.match(scopedUrl("./"));
        return cachedPage || Response.error();
      }
    })());
    return;
  }

  if (requestUrl.pathname.endsWith("/tamil-stations.json")) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(APP_CACHE);
          await cache.put(request, response.clone());
        }
        return response;
      } catch (_) {
        return await caches.match(request) || Response.error();
      }
    })());
    return;
  }

  // Same-origin assets use network-first so deployed updates are picked up.
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok && response.type === "basic") {
        const cache = await caches.open(APP_CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    } catch (_) {
      return await caches.match(request) || Response.error();
    }
  })());
});
