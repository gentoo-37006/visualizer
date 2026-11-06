const CACHE_NAME = "online-visualizer-__BUILD_VERSION__";
const APP_ROUTES = ["/", "/visualizer"];
const APP_ASSETS = [
  "/favicon.ico", "/robot.png", "/manifest.webmanifest",
  "/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon-maskable-512.png", "/icons/apple-touch-icon.png",
  "/fields/biobuzz.webp", "/fields/decode.webp", "/fields/intothedeep.webp", "/fields/centerstage.webp",
];

function isAppAsset(url) {
  if (url.pathname.startsWith("/_next/static/chunks/app/onboard-preview/")) return false;
  return url.pathname.startsWith("/_next/static/") || APP_ASSETS.includes(url.pathname);
}

async function fetchForCache(cache, url) {
  const response = await fetch(url, { cache: "reload" });
  if (!response.ok) throw new Error(`Could not cache ${url}`);
  await cache.put(url, response.clone());
  return response;
}

async function precache() {
  const cache = await caches.open(CACHE_NAME);
  try {
    const urls = new Set(APP_ASSETS);
    for (const route of APP_ROUTES) {
      const html = await (await fetchForCache(cache, route)).text();
      for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
        const url = new URL(match[1], self.location.origin);
        if (url.origin === self.location.origin && isAppAsset(url)) urls.add(url.pathname + url.search);
      }
    }
    // Announce an update only after its pages, styles, scripts, and images are ready.
    await Promise.all([...urls].map(url => fetchForCache(cache, url)));
  } catch (error) {
    await caches.delete(CACHE_NAME);
    throw error;
  }
}

self.addEventListener("install", event => {
  event.waitUntil(precache());
});

self.addEventListener("message", event => {
  if (event.data?.type === "ACTIVATE_UPDATE") event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = (await caches.keys()).filter(name => name.startsWith("online-visualizer-") || name.startsWith("auton-visualizer-"));
    // Keep the preceding build's hashed chunks available to other open tabs.
    const state = await caches.open("visualizer-cache-state");
    const previous = await (await state.match("/active-version"))?.text() ?? names.filter(name => name !== CACHE_NAME).at(-1);
    await state.put("/active-version", new Response(CACHE_NAME));
    await Promise.all(names.map(async name => {
      const cache = await caches.open(name);
      await cache.delete("/onboard-preview");
      await cache.delete("/onboard-preview/");
      for (const request of await cache.keys()) {
        if (new URL(request.url).pathname.startsWith("/_next/static/chunks/app/onboard-preview/")) await cache.delete(request);
      }
    }));
    await Promise.all(names.filter(name => name !== CACHE_NAME && name !== previous).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function cacheFirst(event, key) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(key);
  if (cached) return cached;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/_next/static/")) {
    const previous = await caches.match(key);
    if (previous) return previous;
  }
  try {
    const response = await fetch(event.request);
    if (response.ok) event.waitUntil(cache.put(key, response.clone()));
    return response;
  } catch {
    return Response.error();
  }
}

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  const route = url.pathname === "/" ? "/" : url.pathname.replace(/\/$/, "");
  if (request.mode === "navigate" && APP_ROUTES.includes(route)) {
    event.respondWith(cacheFirst(event, route));
  } else if (isAppAsset(url)) {
    event.respondWith(cacheFirst(event, request));
  }
  // Hub feeds, recordings, RSC payloads, and other endpoints must never be cached.
});
