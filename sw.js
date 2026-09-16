/* ============================================================
   Meal Khata - Service Worker
   অ্যাপ শেল ক্যাশ + অফলাইন সাপোর্ট (PWA installable)
   ============================================================ */

const VERSION = 'meal-khata-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const CDN_CACHE = `${VERSION}-cdn`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

/* অ্যাপ শেল — অবশ্যই অফলাইনে কাজ করতে হবে */
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/favicon-16.png'
];

/* বাইরের রিসোর্স — চেষ্টা করা হবে, কিন্তু ফেল করলেও ইনস্টল আটকাবে না */
const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4',
  'https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.5/firebase-database-compat.js',
  'https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;600;700&family=Poppins:wght@500;600;700&display=swap'
];

/* কখনো ক্যাশ করা যাবে না — রিয়েল-টাইম ডাটাবেস */
const NEVER_CACHE = [
  'firebasedatabase.app',
  'firebaseio.com',
  'firebaseinstallations.googleapis.com',
  'google-analytics.com'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      await shell.addAll(SHELL_ASSETS.map((u) => new Request(u, { cache: 'reload' })));

      const cdn = await caches.open(CDN_CACHE);
      await Promise.allSettled(CDN_ASSETS.map((u) => cdn.add(new Request(u, { mode: 'cors' }))));

      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
      );
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.disable();
        } catch (e) {
          /* ignore */
        }
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING' || event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* ---------- helpers ---------- */

const isNeverCache = (url) => NEVER_CACHE.some((host) => url.includes(host));

async function cacheFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: false });
  if (cached) return cached;
  const response = await fetch(request);
  if (response && (response.ok || response.type === 'opaque')) {
    cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(cacheName, request) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && (response.ok || response.type === 'opaque')) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);
  return cached || (await network) || Response.error();
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put('./index.html', response.clone());
    }
    return response;
  } catch (error) {
    const offline =
      (await cache.match('./index.html')) ||
      (await cache.match('./')) ||
      (await cache.match(new URL('./index.html', self.registration.scope).href));
    if (offline) return offline;
    return new Response(
      '<h1>Meal Khata</h1><p>অফলাইনে আছেন — অ্যাপটি একবার অনলাইনে খুলে তারপর আবার চেষ্টা করুন।</p>',
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

/* ---------- fetch ---------- */

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = request.url;

  /* রিয়েল-টাইম ডাটাবেস/API কখনো ক্যাশ করব না */
  if (isNeverCache(url)) return;

  /* অ্যাপের নিজের নেভিগেশন → নেটওয়ার্ক ফার্স্ট, অফলাইনে ক্যাশ */
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  /* একই origin-এর ফাইল (index.html, icons, manifest) → ক্যাশ ফার্স্ট */
  const sameOrigin = new URL(url).origin === self.location.origin;
  if (sameOrigin) {
    event.respondWith(
      cacheFirst(SHELL_CACHE, request).catch(async () => {
        const cached = await caches.match(request, { ignoreSearch: true });
        return cached || Response.error();
      })
    );
    return;
  }

  /* Google Fonts CSS / CDN স্ক্রিপ্ট → স্টেল-হোয়াইল-রিভ্যালিডেট */
  if (
    url.includes('fonts.googleapis.com') ||
    url.includes('cdn.jsdelivr.net') ||
    url.includes('cdnjs.cloudflare.com') ||
    url.includes('www.gstatic.com/firebasejs')
  ) {
    event.respondWith(staleWhileRevalidate(CDN_CACHE, request));
    return;
  }

  /* ফন্ট ফাইল → ক্যাশ ফার্স্ট */
  if (url.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirst(CDN_CACHE, request));
    return;
  }

  /* বাকি সব → আগে ক্যাশ, না থাকলে নেটওয়ার্ক এবং ক্যাশে রেখে দেওয়া */
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response && (response.ok || response.type === 'opaque')) {
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        return Response.error();
      }
    })()
  );
});
