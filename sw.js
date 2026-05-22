// ============================================================
//  NovelInk — Service Worker v15 + Widget Support
//  Par DAVIESLAY studio
// ============================================================

const APP_NAME   = 'NovelInk';
const CACHE_NAME = 'novelink-v15';
const BASE_URL   = '/NOVELINK-/';

const PRECACHE = [
  '/NOVELINK-/',
  '/NOVELINK-/index.html',
  '/NOVELINK-/manifest.json',
  '/NOVELINK-/widget-data.json',
  '/NOVELINK-/icons/novelink-icon-A-192.png',
  '/NOVELINK-/icons/novelink-icon-A-512.png',
  '/NOVELINK-/icons/novelink-icon-B-192.png',
  '/NOVELINK-/icons/novelink-icon-B-512.png',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400&family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=Montserrat:wght@400;600;700&display=swap'
];

const BYPASS_HOSTS = [
  'firestore.googleapis.com',
  'firebase.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'res.cloudinary.com',
  'api.cloudinary.com',
  'youtube.com','www.youtube.com','img.youtube.com'
];

// ── INSTALL ──────────────────────────────────────────────────
self.addEventListener('install', e => {
  console.log(`[${APP_NAME} SW] Install v15`);
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll(PRECACHE).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ─────────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── FETCH ────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (BYPASS_HOSTS.some(h => url.hostname.includes(h))) return;
  if (url.protocol === 'chrome-extension:') return;

  // Polices : Cache First
  if (url.hostname.includes('fonts.gstatic.com') || url.hostname.includes('fonts.googleapis.com')) {
    e.respondWith(cacheFirst(req)); return;
  }
  // Navigation : Network First
  if (req.mode === 'navigate') {
    e.respondWith(networkFirst(req)); return;
  }
  // Icônes & manifest & widget-data : Cache First
  if (url.pathname.includes('/icons/') || url.pathname.endsWith('manifest.json') ||
      url.pathname.endsWith('widget-data.json') || url.pathname.endsWith('.png')) {
    e.respondWith(cacheFirst(req)); return;
  }
  // Reste : Stale While Revalidate
  e.respondWith(staleWhileRevalidate(req));
});

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) { const c = await caches.open(CACHE_NAME); c.put(req, res.clone()).catch(() => {}); }
    return res;
  } catch { return new Response('', { status: 503 }); }
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res.ok) { const c = await caches.open(CACHE_NAME); c.put(req, res.clone()).catch(() => {}); }
    return res;
  } catch {
    const cached = await caches.match(req);
    return cached || new Response(offlinePage(), { status: 200, headers: {'Content-Type':'text/html;charset=utf-8'} });
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req).then(res => {
    if (res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  }).catch(() => cached);
  return cached || fetchPromise;
}

// ── WIDGETS ──────────────────────────────────────────────────
// Gestion des widgets PWA (spec W3C Widgets)

self.addEventListener('widgetinstall', e => {
  console.log(`[${APP_NAME}] Widget installé:`, e.widget?.tag);
  e.waitUntil(updateWidget(e.widget));
});

self.addEventListener('widgetuninstall', e => {
  console.log(`[${APP_NAME}] Widget désinstallé:`, e.widget?.tag);
});

self.addEventListener('widgetresume', e => {
  e.waitUntil(updateWidget(e.widget));
});

// Mise à jour périodique du widget
self.addEventListener('periodicsync', e => {
  if (e.tag === 'novelink-widget-sync') {
    e.waitUntil(updateAllWidgets());
  }
});

async function updateWidget(widget) {
  if (!widget) return;
  try {
    const data = await fetchWidgetData();
    const payload = buildWidgetPayload(widget.tag, data);
    if (self.widgets && self.widgets.updateByTag) {
      await self.widgets.updateByTag(widget.tag, payload);
    }
  } catch(e) { console.warn('Widget update error:', e); }
}

async function updateAllWidgets() {
  if (!self.widgets) return;
  try {
    const data = await fetchWidgetData();
    const widgetList = await self.widgets.getAll();
    for (const widget of widgetList) {
      const payload = buildWidgetPayload(widget.tag, data);
      await self.widgets.updateByTag(widget.tag, payload);
    }
  } catch(e) { console.warn('updateAllWidgets error:', e); }
}

async function fetchWidgetData() {
  // Données réelles depuis Firestore REST
  const FC_PROJECT = 'novelink-b0958';
  const base = `https://firestore.googleapis.com/v1/projects/${FC_PROJECT}/databases/(default)/documents`;

  let likes = 0, msgs = 0, comments = 0;

  try {
    const postsResp = await fetch(`${base}/ni_posts?pageSize=30`);
    if (postsResp.ok) {
      const d = await postsResp.json();
      (d.documents || []).forEach(doc => {
        likes += parseInt(doc.fields?.likes?.integerValue || 0);
        comments += (doc.fields?.comments?.arrayValue?.values || []).length;
      });
    }
  } catch(e) {}

  const total = likes + msgs + comments;

  return {
    app: 'NovelInk',
    tagline: "L'encre des âmes",
    url: 'https://marcelaagbassi-create.github.io/NOVELINK-/',
    likes, msgs, comments,
    total,
    lastUpdated: new Date().toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })
  };
}

function buildWidgetPayload(tag, data) {
  const { likes, msgs, comments, total, lastUpdated } = data;

  if (tag === 'novelink-studio') {
    // Widget 2×1 : accès rapide Studio
    return {
      template: `
        <div style="background:linear-gradient(145deg,#1a0f0a,#0e0906);border-radius:20px;padding:14px 16px;height:100%;display:flex;flex-direction:column;justify-content:space-between;font-family:sans-serif">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:18px;color:#c9963a;font-weight:900">NovelInk</span>
          </div>
          <div style="text-align:center">
            <div style="font-size:28px;color:#c9963a;margin-bottom:4px">✍️</div>
            <div style="font-size:11px;color:rgba(255,255,255,.5);letter-spacing:2px;text-transform:uppercase">Studio</div>
          </div>
          <div style="font-size:9px;color:rgba(255,255,255,.2);text-align:right">${lastUpdated}</div>
        </div>`,
      data: JSON.stringify(data)
    };
  }

  // Widget 2×2 : activités (défaut)
  const hasActivity = total > 0;
  return {
    template: `
      <div style="background:linear-gradient(145deg,#1a0f0a,#0e0906);border-radius:24px;padding:14px 16px;height:100%;display:flex;flex-direction:column;gap:8px;font-family:sans-serif">
        <!-- Header -->
        <div style="display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:15px;font-weight:900;color:#c9963a;letter-spacing:.04em">NovelInk</span>
          ${hasActivity ? `<div style="width:8px;height:8px;border-radius:50%;background:#e8b84b;box-shadow:0 0 8px #e8b84b"></div>` : ''}
        </div>
        <!-- Activités -->
        <div style="display:flex;flex-direction:column;gap:6px;flex:1">
          ${likes > 0 ? `
          <div style="display:flex;align-items:center;gap:8px;background:rgba(255,60,60,.08);border:1px solid rgba(255,60,60,.2);border-radius:10px;padding:8px 10px">
            <span style="font-size:14px">❤️</span>
            <div style="flex:1"><div style="font-size:11px;font-weight:700;color:rgba(255,255,255,.9)">Nouveaux likes</div><div style="font-size:9px;color:rgba(255,255,255,.4)">Sur tes romans</div></div>
            <span style="font-size:12px;font-weight:700;color:#ff7060;background:rgba(255,60,60,.2);padding:2px 8px;border-radius:20px">${likes}</span>
          </div>` : ''}
          ${msgs > 0 ? `
          <div style="display:flex;align-items:center;gap:8px;background:rgba(60,120,255,.08);border:1px solid rgba(60,120,255,.2);border-radius:10px;padding:8px 10px">
            <span style="font-size:14px">💬</span>
            <div style="flex:1"><div style="font-size:11px;font-weight:700;color:rgba(255,255,255,.9)">Messages</div><div style="font-size:9px;color:rgba(255,255,255,.4)">Non lus</div></div>
            <span style="font-size:12px;font-weight:700;color:#70a0ff;background:rgba(60,120,255,.2);padding:2px 8px;border-radius:20px">${msgs}</span>
          </div>` : ''}
          ${!hasActivity ? `
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px">
            <div style="font-size:22px">✨</div>
            <div style="font-size:11px;color:rgba(255,255,255,.3);text-align:center;font-style:italic">Tout est à jour</div>
          </div>` : ''}
        </div>
        <!-- Footer -->
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:9px;color:rgba(255,255,255,.2)">Mis à jour ${lastUpdated}</span>
          <span style="font-size:9px;color:#c9963a;font-weight:700">${hasActivity ? total + ' activité' + (total > 1 ? 's' : '') : 'Ouvrir →'}</span>
        </div>
      </div>`,
    data: JSON.stringify(data)
  };
}

// ── PUSH NOTIFICATIONS ───────────────────────────────────────
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  e.waitUntil(
    self.registration.showNotification(data.title || 'NovelInk 📖', {
      body: data.body || 'Nouveau contenu littéraire !',
      icon: data.icon || '/NOVELINK-/icons/novelink-icon-A-192.png',
      badge: '/NOVELINK-/icons/novelink-icon-A-192.png',
      tag: 'novelink-push',
      renotify: true,
      vibrate: [200,100,200],
      data: { url: data.url || '/NOVELINK-/' },
      actions: [
        { action:'open', title:'📖 Ouvrir' },
        { action:'dismiss', title:'Ignorer' }
      ]
    })
  );
  // Mettre à jour le widget après une notification
  e.waitUntil(updateAllWidgets());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'dismiss') return;
  const url = e.notification.data?.url || '/NOVELINK-/';
  e.waitUntil(
    clients.matchAll({ type:'window', includeUncontrolled:true })
      .then(wcs => {
        const ex = wcs.find(w => w.url.includes('NOVELINK'));
        if (ex) { ex.focus(); return; }
        return clients.openWindow(url);
      })
  );
});

// ── MESSAGE ──────────────────────────────────────────────────
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
  if (e.data === 'updateWidget') updateAllWidgets();
  if (e.data === 'clearCache') caches.delete(CACHE_NAME);
});

// ── PAGE HORS LIGNE ──────────────────────────────────────────
function offlinePage() {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>NovelInk — Hors ligne</title><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#1a0f0a;color:#c9963a;font-family:Georgia,serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px}h1{font-size:28px;margin:16px 0 8px}p{font-size:15px;color:rgba(201,150,58,.6);max-width:280px;line-height:1.7;margin-bottom:28px}button{background:#c9963a;color:#1a0f0a;border:none;padding:12px 28px;border-radius:24px;font-size:14px;font-weight:700;cursor:pointer}</style></head><body><svg width="56" height="56" viewBox="0 0 100 100" fill="none"><path d="M28 88Q48 58 72 14" stroke="#c9963a" stroke-width="2" stroke-linecap="round"/><path d="M28 88Q24 72 26 56Q28 42 36 28Q46 16 72 14Q64 26 58 36Q52 46 50 56Q46 68 40 80Q36 85 28 88Z" fill="#c9963a" opacity=".2"/></svg><h1>NovelInk</h1><p>Vous êtes hors ligne. Reconnectez-vous pour lire vos romans.</p><button onclick="location.reload()">Réessayer</button></body></html>`;
}

console.log(`[${APP_NAME} SW] Chargé — Cache: ${CACHE_NAME}`);
