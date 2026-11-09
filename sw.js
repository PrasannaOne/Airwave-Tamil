/*
 * AIRWAVE TAMIL · SERVICE WORKER
 * Caches the app shell and Tamil station catalogue for offline browsing.
 * Radio streams and third-party station artwork are deliberately not cached.
 * Bump CACHE_VERSION when changing this file's cache policy or shell assets.
 */
"use strict";

const CACHE_VERSION = "airwave-tamil-v1";
const APP_CACHE = `${CACHE_VERSION}-app`;
const APP_SHELL = [
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
    await Promise.all(APP_SHELL.map(async (path) => {
      const url = scopedUrl(path);
      try {
        const response = await fetch(new Request(url, { cache: "reload" }));
        if (response.ok && response.type === "basic") {
          await cache.put(url, response);
        }
      } catch (error) {
        // A single optional asset must not prevent the worker from installing.
        console.warn("Airwave precache skipped:", path, error);
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith("airwave-tamil-") && key !== APP_CACHE)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const requestUrl = new URL(request.url);
  // Never proxy or cache radio streams and station artwork from other origins.
  if (requestUrl.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(APP_CACHE);
          await cache.put(request, response.clone());
        }
        return response;
      } catch (_) {
        const cachedPage = await caches.match(request)
          || await caches.match(scopedUrl("./index.html"));
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

  // Same-origin app assets use cache-first; unknown files fall through to network.
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
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
