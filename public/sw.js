const STATIC_CACHE = "onlydevs-static-v1";
const OFFLINE_CACHE = "onlydevs-pages-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(["/", "/offline.html", "/manifest.webmanifest"]))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => ![STATIC_CACHE, OFFLINE_CACHE].includes(key))
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigation must fall back to the cached app shell rather than the browser dinosaur page.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(OFFLINE_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const cachedPage = await caches.match(request);
          const offlinePage = await caches.match("/offline.html");
          return cachedPage || offlinePage || caches.match("/") || new Response(
            "OnlyDevs is offline. Open a cached story from the timeline.",
            { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
          );
        })
    );
    return;
  }

  // Next client transitions request route/RSC data rather than a navigation.
  // When offline, send reader deep links to the IndexedDB-backed fallback document.
  if (!navigator.onLine && url.pathname.startsWith("/read/")) {
    const articleId = url.pathname.split("/").filter(Boolean).pop();
    event.respondWith(Response.redirect(`/offline.html?article=${encodeURIComponent(articleId || "")}`, 302));
    return;
  }

  // Cache static framework assets after first load.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          return response;
        });
      })
    );
  }
});
