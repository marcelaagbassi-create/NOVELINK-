// ============================================================
//  NovelInk — Service Worker v7
//  Par DAVIESLAY
// ============================================================

const APP_NAME    = 'NovelInk';
const CACHE_NAME  = 'novelink-v7';
const BASE_URL    = '/NOVELINK-/';

// Ressources à mettre en cache immédiatement
const PRECACHE = [
  '/NOVELINK-/',
  '/NOVELINK-/index.html',
  '/NOVELINK-/manifest.json',
  '/NOVELINK-/icons/novelink-icon-A-192.png',
  '/NOVELINK-/icons/novelink-icon-A-512.png',
  '/NOVELINK-/icons/novelink-icon-B-192.png',
  '/NOVELINK-/icons/novelink-icon-B-512.png',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;0,900;1,400;1,700&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Montserrat:wght@300;400;500;600;700&display=swap',
];

// Domaines à NE PAS mettre en cache (Firebase, Cloudinary)
const BYPASS_HOSTS = [
  'firestore.googleapis.com',
  'firebase.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'res.cloudinary.com',
  'api.cloudinary.com',
  'youtube.com',
  'www.youtube.com',
  'img.youtube.com',
  'i.ytimg.com',
];

// ============================================================
//  INSTALL — Précache les ressources essentielles
// ============================================================
self.addEventListener('install', event => {
  console.log(`[${APP_NAME} SW] Installation v7`);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE).catch(err => {
        console.warn(`[${APP_NAME} SW] Précache partiel :`, err);
      }))
      .then(() => self.skipWaiting())
  );
});

// ============================================================
//  ACTIVATE — Supprime les anciens caches
// ============================================================
self.addEventListener('activate', event => {
  console.log(`[${APP_NAME} SW] Activation`);
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log(`[${APP_NAME} SW] Suppression ancien cache :`, key);
            return caches.delete(key);
          })
      ))
      .then(() => self.clients.claim())
  );
});

// ============================================================
//  FETCH — Stratégies de cache intelligentes
// ============================================================
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignorer les requêtes non-GET
  if (req.method !== 'GET') return;

  // Ignorer Firebase, Cloudinary, YouTube
  if (BYPASS_HOSTS.some(h => url.hostname.includes(h))) return;

  // Ignorer les extensions Chrome
  if (url.protocol === 'chrome-extension:') return;

  // ── Polices Google : Cache First ──
  if (url.hostname.includes('fonts.gstatic.com') ||
      url.hostname.includes('fonts.googleapis.com')) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // ── Page HTML principale : Network First ──
  if (req.mode === 'navigate' ||
      url.pathname === BASE_URL ||
      url.pathname === BASE_URL + 'index.html') {
    event.respondWith(networkFirst(req));
    return;
  }

  // ── Icônes & manifest : Cache First ──
  if (url.pathname.includes('/icons/') ||
      url.pathname.endsWith('manifest.json') ||
      url.pathname.endsWith('.png') ||
      url.pathname.endsWith('.jpg') ||
      url.pathname.endsWith('.svg') ||
      url.pathname.endsWith('.ico')) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // ── Tout le reste : Stale While Revalidate ──
  event.respondWith(staleWhileRevalidate(req));
});

// ============================================================
//  STRATÉGIES DE CACHE
// ============================================================

// Cache First : sert le cache, sinon réseau → met en cache
async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const response = await fetch(req);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, response.clone()).catch(() => {});
    }
    return response;
  } catch (err) {
    return new Response('Ressource indisponible hors ligne.', { status: 503 });
  }
}

// Network First : réseau en priorité, cache en fallback
async function networkFirst(req) {
  try {
    const response = await fetch(req);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, response.clone()).catch(() => {});
    }
    return response;
  } catch (err) {
    const cached = await caches.match(req);
    if (cached) return cached;
    // Page hors ligne de secours
    return new Response(offlinePage(), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}

// Stale While Revalidate : sert le cache ET met à jour en arrière-plan
async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req).then(response => {
    if (response.ok) {
      cache.put(req, response.clone()).catch(() => {});
    }
    return response;
  }).catch(() => cached);
  return cached || fetchPromise;
}

// ============================================================
//  PAGE HORS LIGNE
// ============================================================
function offlinePage() {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>NovelInk — Hors ligne</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#1a0f0a;color:#c9963a;font-family:'Georgia',serif;
         display:flex;flex-direction:column;align-items:center;
         justify-content:center;min-height:100vh;text-align:center;padding:24px}
    svg{margin-bottom:24px;opacity:.9}
    h1{font-size:28px;font-weight:900;margin-bottom:8px;letter-spacing:.02em}
    p{font-size:15px;color:rgba(201,150,58,.65);line-height:1.7;max-width:300px;
      font-style:italic;margin-bottom:32px}
    button{background:#c9963a;color:#1a0f0a;border:none;padding:12px 28px;
           border-radius:24px;font-size:14px;font-weight:700;letter-spacing:.08em;
           text-transform:uppercase;cursor:pointer;font-family:'Georgia',serif}
    button:active{opacity:.85}
  </style>
</head>
<body>
  <svg width="72" height="72" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M28 88Q48 58 72 14" stroke="#c9963a" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M48 58Q58 48 70 28" stroke="#c9963a" stroke-width=".9" stroke-linecap="round" opacity=".85"/>
    <path d="M48 58Q40 52 32 38" stroke="#c9963a" stroke-width=".9" stroke-linecap="round" opacity=".8"/>
    <path d="M28 88Q24 72 26 56Q28 42 36 28Q46 16 72 14Q64 26 58 36Q52 46 50 56Q46 68 40 80Q36 85 28 88Z" fill="#c9963a" opacity=".18"/>
    <path d="M28 88Q26 92 24 96" stroke="#8b5e1a" stroke-width="1.4" stroke-linecap="round" opacity=".7"/>
  </svg>
  <h1>NovelInk</h1>
  <p>Vous êtes hors ligne. Reconnectez-vous pour accéder à vos romans et au fil littéraire.</p>
  <button onclick="location.reload()">Réessayer</button>
</body>
</html>`;
}

// ============================================================
//  PUSH NOTIFICATIONS
// ============================================================
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title   = data.title  || 'NovelInk';
  const options = {
    body   : data.body  || 'Nouveau contenu littéraire disponible !',
    icon   : data.icon  || '/NOVELINK-/icons/novelink-icon-A-192.png',
    badge  : '/NOVELINK-/icons/novelink-icon-A-192.png',
    tag    : 'novelink-push',
    renotify: true,
    vibrate: [200, 100, 200],
    data   : { url: data.url || '/NOVELINK-/' },
    actions: [
      { action: 'open',    title: '📖 Ouvrir' },
      { action: 'dismiss', title: 'Ignorer'    }
    ]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const url = event.notification.data?.url || '/NOVELINK-/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(wcs => {
        const existing = wcs.find(w => w.url.includes('NOVELINK'));
        if (existing) { existing.focus(); return; }
        return clients.openWindow(url);
      })
  );
});

// ============================================================
//  MESSAGE (depuis l'app)
// ============================================================
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
  if (event.data === 'clearCache') {
    caches.delete(CACHE_NAME).then(() => {
      console.log(`[${APP_NAME} SW] Cache vidé`);
    });
  }
});

console.log(`[${APP_NAME} SW] Chargé — Cache: ${CACHE_NAME}`);
