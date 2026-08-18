const CACHE_NAME = "auton-visualizer-v6";
const APP_SHELL_URLS = [
  "/favicon.ico",
  "/robot.png",
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
      assetUrl === "/robot.png" ||
      assetUrl === "/favicon.ico"
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

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;

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
