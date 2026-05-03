const CACHE_NAME = "auton-path-planner-v3";
const APP_SHELL_URLS = [
  "/favicon.ico",
  "/fields/decode.webp",
];

async function precacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(APP_SHELL_URLS);

  const response = await fetch("/", { cache: "reload" });
  if (!response.ok) return;

  await cache.put("/", response.clone());
  const html = await response.text();
  const assetUrls = extractLocalAssetUrls(html);
  await Promise.all(
    assetUrls.map((assetUrl) =>
      fetch(assetUrl, { cache: "reload" })
        .then((assetResponse) => {
          if (assetResponse.ok) return cache.put(assetUrl, assetResponse);
        })
        .catch(() => {})
    )
  );
}

function extractLocalAssetUrls(html) {
  const urls = new Set(APP_SHELL_URLS);
  const assetRegex = /\b(?:href|src)="([^"]+)"/g;
  let match;

  while ((match = assetRegex.exec(html)) !== null) {
    const assetUrl = match[1];
    if (
      assetUrl.startsWith("/_next/") ||
      assetUrl.startsWith("/fields/") ||
      assetUrl === "/favicon.ico"
    ) {
      urls.add(assetUrl);
    }
  }

  return [...urls];
}

async function cacheAppShellResponse(response) {
  const cache = await caches.open(CACHE_NAME);
  await cache.put("/", response.clone());

  const html = await response.text();
  const assetUrls = extractLocalAssetUrls(html);
  await Promise.all(
    assetUrls.map((assetUrl) =>
      fetch(assetUrl, { cache: "reload" })
        .then((assetResponse) => {
          if (assetResponse.ok) return cache.put(assetUrl, assetResponse);
        })
        .catch(() => {})
    )
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheAppShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== CACHE_NAME)
            .map((cacheName) => caches.delete(cacheName))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          cacheAppShellResponse(response.clone());
          return response;
        })
        .catch(() => caches.match("/") || Response.error())
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        }
        return response;
      })
      .catch(() => caches.match(request) || Response.error())
  );
});
