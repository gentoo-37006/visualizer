const CACHE_NAME = "auton-visualizer-v7";
const APP_SHELL_URLS = [
  "/favicon.ico",
  "/robot.png",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/fields/decode.webp",
  "/fields/intothedeep.webp",
  "/fields/centerstage.webp",
];

function extractLocalAssetUrls(html) {
  const urls = new Set(APP_SHELL_URLS);
  const assetRegex = /\b(?:href|src)="([^"]+)"/g;
  let match;

  while ((match = assetRegex.exec(html)) !== null) {
    const assetUrl = match[1];
    if (
      assetUrl.startsWith("/_next/") ||
      assetUrl.startsWith("/fields/") ||
      assetUrl.startsWith("/icons/") ||
      assetUrl === "/robot.png" ||
      assetUrl === "/favicon.ico" ||
      assetUrl === "/manifest.webmanifest"
    ) {
      urls.add(assetUrl);
    }
  }

  return [...urls];
}

async function cacheAsset(cache, assetUrl, shouldRevalidate) {
  // Assets are content-hashed, so one already in the cache is still the right
  // one. Re-fetching them on every navigation would re-download the whole app.
  if (!shouldRevalidate && (await cache.match(assetUrl))) return;

  try {
    const response = await fetch(assetUrl, { cache: "reload" });
    if (response.ok) await cache.put(assetUrl, response);
  } catch {
    // An asset that cannot be reached now is still served from the network later.
  }
}

async function cacheAppShellAssets(cache, html, shouldRevalidate) {
  const assetUrls = extractLocalAssetUrls(html);
  await Promise.all(assetUrls.map((assetUrl) => cacheAsset(cache, assetUrl, shouldRevalidate)));
}

async function precacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  // Not cache.addAll: one missing file there rejects the whole install and
  // leaves the app with no offline support at all.
  await Promise.all(APP_SHELL_URLS.map((assetUrl) => cacheAsset(cache, assetUrl, true)));

  const response = await fetch("/", { cache: "reload" });
  if (!response.ok) return;

  await cache.put("/", response.clone());
  await cacheAppShellAssets(cache, await response.text(), true);
}

async function cacheAppShellResponse(response) {
  const cache = await caches.open(CACHE_NAME);
  await cache.put("/", response.clone());
  await cacheAppShellAssets(cache, await response.text(), false);
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

// Everything under /_next/static/ is addressed by a content hash, so a cached
// copy can never be the wrong one and a network round trip can only cost time —
// which is exactly what a venue's wifi has none of. The rest stays network-first
// because those URLs are stable across builds: a new season's field image
// replaces the old one at the same path.
function isImmutableAsset(url) {
  return url.pathname.startsWith("/_next/static/");
}

async function serveFromCacheFirst(event, request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const responseClone = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone)));
    }
    return response;
  } catch {
    return Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (isImmutableAsset(url)) {
    event.respondWith(serveFromCacheFirst(event, request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Only a good response may replace the offline shell, or a stray 500
          // becomes the page every offline visit sees.
          if (response.ok) event.waitUntil(cacheAppShellResponse(response.clone()));
          return response;
        })
        .catch(async () => (await caches.match("/")) ?? Response.error())
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const responseClone = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone)));
        }
        return response;
      })
      .catch(async () => (await caches.match(request)) ?? Response.error())
  );
});
