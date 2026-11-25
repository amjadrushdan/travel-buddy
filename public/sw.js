// Travel Buddy service worker: makes a trip readable offline after one online visit.
//
// - Pages (HTML navigations): network first, saved to the cache on success, served from the
//   cache when the network fails. Keyed by path, so ?day=… shares one saved copy.
// - Build assets (/_next/static, fonts): cache first; their file names change on every build.
// - Next.js data requests (RSC) and server actions pass straight through. When those fail
//   offline, Next falls back to a full page load, which this worker then serves from the cache.
// - Food scanner: the barcode/label readers (/scan-v*/) are cache first (versioned folder);
//   Japan product shards (/food/jp/*.json) are served from the cache and refreshed in the
//   background. The full offline list lives in the "tb-food" cache, which the page manages.
// - The page can ask the worker to "warm" a list of same-origin paths (the trip's other tabs)
//   so they are saved too, and to "clear" saved pages (e.g. after leaving a trip).

const VERSION = "v5";
const PAGES = `tb-pages-${VERSION}`;
const ASSETS = `tb-assets-${VERSION}`;
const OFFLINE_URL = "/offline";
const NETWORK_TIMEOUT_MS = 6000;
const MAX_WARM = 12;
const FOOD = "tb-food"; // offline Japan product list, saved on request by the Food page

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((c) => c.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("tb-") && k !== PAGES && k !== ASSETS && k !== FOOD).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

const pageKey = (url) => {
  const u = new URL(url);
  return u.origin + u.pathname;
};

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

// Only keep real pages: same-origin, 200, not a redirect (e.g. to /welcome when signed out).
const cacheable = (res) => res && res.ok && res.type === "basic" && !res.redirected;

// A saved page is useless offline without its scripts and styles, and a page that was only
// "warmed" never loaded them. So read the HTML and save every /_next/static file it uses.
async function saveAssetsOf(htmlResponse) {
  try {
    const html = await htmlResponse.text();
    const urls = new Set([
      ...(html.match(/\/_next\/static\/[^"'\s)\\]+/g) || []),
      ...(html.match(/\/airline-logo\/[A-Z0-9]{2}/g) || []), // airline logos on flight cards
    ]);
    const cache = await caches.open(ASSETS);
    await Promise.all(
      [...urls].map(async (path) => {
        const req = new Request(new URL(path, self.location.origin));
        if (await cache.match(req)) return;
        const res = await fetch(req).catch(() => null);
        if (res && res.ok) await cache.put(req, res);
      }),
    );
    // The trip's cover photo, so Home looks the same offline.
    for (const path of new Set(html.match(COVER_RE) || [])) {
      await cover(new Request(new URL(path, self.location.origin))).catch(() => null);
    }
  } catch {
    /* best effort */
  }
}

async function savePage(key, res) {
  const cache = await caches.open(PAGES);
  await cache.put(key, res.clone());
  await saveAssetsOf(res);
}

async function page(request) {
  const cache = await caches.open(PAGES);
  try {
    const res = await withTimeout(fetch(request), NETWORK_TIMEOUT_MS);
    if (cacheable(res)) savePage(pageKey(request.url), res.clone());
    return res;
  } catch {
    return (await cache.match(pageKey(request.url))) || (await cache.match(OFFLINE_URL)) || Response.error();
  }
}

async function asset(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

// Cover photos: /trips/<id>/cover?v=<version>. Each version is a new URL, so cache-first is
// safe; when a new version is saved, older versions of that trip's cover are dropped.
const COVER_RE = /\/trips\/[0-9a-f-]{36}\/cover\?v=\d+/g;
const isCover = (url) => /^\/trips\/[0-9a-f-]{36}\/cover$/.test(url.pathname) && url.searchParams.has("v");

async function cover(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && res.type === "basic") {
    const path = new URL(request.url).pathname;
    for (const old of await cache.keys()) {
      if (new URL(old.url).pathname === path) await cache.delete(old);
    }
    await cache.put(request, res.clone());
  }
  return res;
}

// Serve the saved copy at once and refresh it in the background.
async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  const fresh = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  return hit || (await fresh) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(page(request));
    return;
  }
  // Trip documents never change under the same id: keep any opened document for offline.
  const isDoc = /^\/trips\/[0-9a-f-]{36}\/docs\/[0-9a-f-]{36}$/.test(url.pathname);
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/airline-logo/") || isDoc) {
    event.respondWith(asset(request));
    return;
  }
  if (url.pathname.startsWith("/scan-v")) {
    event.respondWith(asset(request));
    return;
  }
  if (/^/food/jp/d{4}.json$/.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
  if (isCover(url)) {
    event.respondWith(cover(request));
  }
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "warm" && Array.isArray(data.urls)) {
    event.waitUntil(
      (async () => {
        for (const raw of data.urls.slice(0, MAX_WARM)) {
          try {
            const url = new URL(raw, self.location.origin);
            if (url.origin !== self.location.origin) continue;
            const res = await fetch(url, { credentials: "same-origin", headers: { accept: "text/html" } });
            if (cacheable(res)) await savePage(pageKey(url.href), res);
          } catch {
            /* offline or failed: keep the old copy */
          }
        }
      })(),
    );
  }
  if (data.type === "clear") {
    event.waitUntil(caches.delete(PAGES));
  }
});
