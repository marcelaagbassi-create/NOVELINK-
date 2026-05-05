// ============================================================
//  NovelInk — Firebase Messaging Service Worker
//  Obligatoire pour les notifications push en arrière-plan
// ============================================================

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// Configuration Firebase — identique à celle de l'app
firebase.initializeApp({
  apiKey: "AIzaSyCPUTLlH8CMqORrOWk0Pd8yVgzstU0Gbqs",
  authDomain: "novelink-b0958.firebaseapp.com",
  projectId: "novelink-b0958",
  storageBucket: "novelink-b0958.firebasestorage.app",
  messagingSenderId: "284559257594",
  appId: "1:284559257594:web:666336b99dc812efb8fe43"
});

const messaging = firebase.messaging();

// ===== NOTIFICATIONS EN ARRIÈRE-PLAN =====
// Quand l'app est fermée ou en arrière-plan, ce SW reçoit les notifications
messaging.onBackgroundMessage(payload => {
  console.log('[NovelInk SW] Notification reçue en arrière-plan:', payload);

  const { title, body, image } = payload.notification || {};
  const data = payload.data || {};

  const options = {
    body: body || 'Nouveau contenu sur NovelInk !',
    icon: image || 'https://marcelaagbassi-create.github.io/NOVELINK-/icons/novelink-icon-A-192.png',
    badge: 'https://marcelaagbassi-create.github.io/NOVELINK-/icons/novelink-icon-A-192.png',
    image: image || undefined,
    tag: 'novelink-' + (data.type || 'general'),
    renotify: true,
    vibrate: [200, 100, 200, 100, 200],
    requireInteraction: false,
    data: {
      url: data.url || 'https://marcelaagbassi-create.github.io/NOVELINK-/',
      type: data.type || 'general'
    },
    actions: [
      { action: 'open', title: '📖 Ouvrir NovelInk' },
      { action: 'dismiss', title: 'Ignorer' }
    ]
  };

  return self.registration.showNotification(
    title || 'NovelInk 📖',
    options
  );
});

// ===== CLIC SUR LA NOTIFICATION =====
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url ||
              'https://marcelaagbassi-create.github.io/NOVELINK-/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        // Si l'app est déjà ouverte, la mettre en avant
        for (const client of windowClients) {
          if (client.url.includes('NOVELINK') && 'focus' in client) {
            return client.focus();
          }
        }
        // Sinon ouvrir l'app
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

console.log('[NovelInk] Firebase Messaging SW chargé ✅');
