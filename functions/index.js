// ============================================================
//  NovelInk — Firebase Cloud Functions
//  Par DAVIESLAY studio
//  Déploiement : firebase deploy --only functions
// ============================================================

const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();
const db = getFirestore();
const messaging = getMessaging();

// ── Utilitaires ──────────────────────────────────────────────

// Récupère le token FCM d'un utilisateur
async function getUserToken(uid) {
  const snap = await db.collection('ni_users').doc(uid).get();
  return snap.exists ? snap.data()?.fcmToken || null : null;
}

// Envoie une notification push à un utilisateur
async function sendPush(uid, { title, body, icon, url, type }) {
  const token = await getUserToken(uid);
  if (!token) return;
  try {
    await messaging.send({
      token,
      notification: { title, body },
      webpush: {
        notification: {
          title, body,
          icon: icon || 'https://marcelaagbassi-create.github.io/NOVELINK-/icons/novelink-icon-A-192.png',
          badge: 'https://marcelaagbassi-create.github.io/NOVELINK-/icons/novelink-icon-A-192.png',
          requireInteraction: false,
          vibrate: [200, 100, 200]
        },
        fcmOptions: { link: url || 'https://marcelaagbassi-create.github.io/NOVELINK-/' }
      },
      data: { url: url || '', type: type || 'general' }
    });
    console.log(`✅ Push envoyé à ${uid}`);
  } catch(e) {
    // Token expiré → le supprimer
    if (e.code === 'messaging/registration-token-not-registered') {
      await db.collection('ni_users').doc(uid).update({ fcmToken: FieldValue.delete() });
    }
    console.warn(`Push échoué pour ${uid}:`, e.message);
  }
}

// Envoie une push à tous les followers d'un utilisateur
async function pushToFollowers(authorUid, notification) {
  const snap = await db.collection('ni_users')
    .where('following', 'array-contains', authorUid)
    .get();
  const promises = snap.docs.map(doc => sendPush(doc.id, notification));
  await Promise.allSettled(promises);
  console.log(`📢 Push envoyé à ${snap.size} followers de ${authorUid}`);
}

// Sauvegarde une notification dans Firestore (centre de notifs in-app)
async function saveNotification(uid, { type, title, body, fromUid, fromName, link }) {
  await db.collection('ni_users').doc(uid)
    .collection('notifications').add({
      type, title, body, fromUid, fromName, link,
      read: false,
      createdAt: FieldValue.serverTimestamp()
    });
}

// ════════════════════════════════════════════════════════════
//  1. NOUVEAU POST → Notifier les followers
// ════════════════════════════════════════════════════════════
exports.onNewPost = onDocumentCreated('ni_posts/{postId}', async (event) => {
  const post = event.data.data();
  if (!post || !post.uid) return;

  const isChapter = post.isChapterPost;
  const authorName = post.userName || 'Un auteur';
  const bookTitle = post.bookTitle || '';
  const chapTitle = post.chapTitle || '';

  const notification = isChapter ? {
    title: `📖 ${authorName} a publié un nouveau chapitre`,
    body: bookTitle ? `${bookTitle} — ${chapTitle}` : chapTitle,
    url: `https://marcelaagbassi-create.github.io/NOVELINK-/#books`,
    type: 'chapter',
    icon: post.userAvatar || ''
  } : {
    title: `✍️ ${authorName} a publié`,
    body: (post.text || '').substring(0, 100),
    url: `https://marcelaagbassi-create.github.io/NOVELINK-/`,
    type: 'post',
    icon: post.userAvatar || ''
  };

  await pushToFollowers(post.uid, notification);
});

// ════════════════════════════════════════════════════════════
//  2. NOUVEAU CHAPITRE → Notifier les followers
// ════════════════════════════════════════════════════════════
exports.onNewChapter = onDocumentCreated(
  'ni_books/{bookId}/chapters/{chapId}',
  async (event) => {
    const chap = event.data.data();
    const bookId = event.params.bookId;
    if (!chap) return;

    const bookSnap = await db.collection('ni_books').doc(bookId).get();
    const book = bookSnap.data();
    if (!book) return;

    const notification = {
      title: `📖 Nouveau chapitre disponible !`,
      body: `${book.title || 'Un roman'} — ${chap.title || 'Nouveau chapitre'}`,
      url: `https://marcelaagbassi-create.github.io/NOVELINK-/#books`,
      type: 'chapter',
      icon: book.coverUrl || ''
    };

    await pushToFollowers(book.uid, notification);
  }
);

// ════════════════════════════════════════════════════════════
//  3. NOUVEAU LIKE sur un post → Notifier l'auteur
// ════════════════════════════════════════════════════════════
exports.onPostLiked = onDocumentUpdated('ni_posts/{postId}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  if (!before || !after) return;

  const likesBefore = (before.likedBy || []).length;
  const likesAfter = (after.likedBy || []).length;

  // Seulement si un like a été ajouté
  if (likesAfter <= likesBefore) return;

  // Trouver qui a liké (le nouveau dans le tableau)
  const newLikerUid = (after.likedBy || []).find(uid => !(before.likedBy || []).includes(uid));
  if (!newLikerUid) return;

  // Ne pas notifier si l'auteur se like lui-même
  const authorUid = after.uid;
  if (!authorUid || newLikerUid === authorUid) return;

  // Récupérer le nom du likeur
  const likerSnap = await db.collection('ni_users').doc(newLikerUid).get();
  const likerName = likerSnap.data()?.name || 'Quelqu\'un';

  const isChapter = after.isChapterPost;
  const title = isChapter ? `❤️ ${likerName} aime votre chapitre` : `❤️ ${likerName} aime votre publication`;
  const body = (after.text || '').substring(0, 80);

  await sendPush(authorUid, { title, body, type: 'like', url: 'https://marcelaagbassi-create.github.io/NOVELINK-/' });
  await saveNotification(authorUid, {
    type: 'like', title, body,
    fromUid: newLikerUid, fromName: likerName,
    link: 'https://marcelaagbassi-create.github.io/NOVELINK-/'
  });
});

// ════════════════════════════════════════════════════════════
//  4. NOUVEAU COMMENTAIRE sur un chapitre → Notifier l'auteur
// ════════════════════════════════════════════════════════════
exports.onChapterComment = onDocumentCreated(
  'ni_books/{bookId}/chapters/{chapId}/comments/{cmtId}',
  async (event) => {
    const cmt = event.data.data();
    const { bookId, chapId } = event.params;
    if (!cmt) return;

    const bookSnap = await db.collection('ni_books').doc(bookId).get();
    const book = bookSnap.data();
    if (!book) return;

    // Ne pas notifier si l'auteur commente son propre roman
    if (cmt.authorId === book.uid) return;

    const authorName = cmt.authorName || 'Un lecteur';
    const title = `💬 ${authorName} a commenté votre chapitre`;
    const body = `"${(cmt.text || '').substring(0, 80)}"`;

    await sendPush(book.uid, {
      title, body, type: 'comment',
      icon: cmt.authorAvatar || '',
      url: 'https://marcelaagbassi-create.github.io/NOVELINK-/#books'
    });
    await saveNotification(book.uid, {
      type: 'comment', title, body,
      fromUid: cmt.authorId, fromName: authorName,
      link: 'https://marcelaagbassi-create.github.io/NOVELINK-/#books'
    });
  }
);

// ════════════════════════════════════════════════════════════
//  5. NOUVEAU FOLLOWER → Notifier l'utilisateur suivi
// ════════════════════════════════════════════════════════════
exports.onNewFollower = onDocumentUpdated('ni_users/{userId}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const userId = event.params.userId;
  if (!before || !after) return;

  const followersBefore = (before.followers || []);
  const followersAfter = (after.followers || []);

  if (followersAfter.length <= followersBefore.length) return;

  const newFollowerUid = followersAfter.find(uid => !followersBefore.includes(uid));
  if (!newFollowerUid) return;

  const followerSnap = await db.collection('ni_users').doc(newFollowerUid).get();
  const followerName = followerSnap.data()?.name || 'Quelqu\'un';

  const title = `👤 ${followerName} vous suit maintenant`;
  const body = 'Découvrez son profil sur NovelInk';

  await sendPush(userId, { title, body, type: 'follow', url: 'https://marcelaagbassi-create.github.io/NOVELINK-/' });
  await saveNotification(userId, {
    type: 'follow', title, body,
    fromUid: newFollowerUid, fromName: followerName,
    link: 'https://marcelaagbassi-create.github.io/NOVELINK-/'
  });
});

// ════════════════════════════════════════════════════════════
//  6. NOUVEAU MESSAGE → Notifier le destinataire
// ════════════════════════════════════════════════════════════
exports.onNewMessage = onDocumentCreated(
  'ni_chats/{chatId}/messages/{msgId}',
  async (event) => {
    const msg = event.data.data();
    const chatId = event.params.chatId;
    if (!msg) return;

    // Le chatId est "uid1_uid2" (trié alphabétiquement)
    const uids = chatId.split('_');
    const recipientUid = uids.find(uid => uid !== msg.senderUid);
    if (!recipientUid) return;

    const senderName = msg.senderName || 'Quelqu\'un';
    const title = `💬 Message de ${senderName}`;
    const body = (msg.text || '').substring(0, 100);

    await sendPush(recipientUid, {
      title, body, type: 'message',
      icon: msg.senderAvatar || '',
      url: 'https://marcelaagbassi-create.github.io/NOVELINK-/#chat'
    });
    await saveNotification(recipientUid, {
      type: 'message', title, body,
      fromUid: msg.senderUid, fromName: senderName,
      link: 'https://marcelaagbassi-create.github.io/NOVELINK-/#chat'
    });
  }
);

// ════════════════════════════════════════════════════════════
//  7. NETTOYAGE QUOTIDIEN → Tokens expirés + queue push
// ════════════════════════════════════════════════════════════
exports.dailyCleanup = onSchedule('every 24 hours', async () => {
  console.log('🧹 Nettoyage quotidien NovelInk...');

  // Vider la queue push (ni_push_queue)
  const queueSnap = await db.collection('ni_push_queue')
    .where('createdAt', '<', new Date(Date.now() - 24 * 60 * 60 * 1000))
    .limit(100).get();

  const batch = db.batch();
  queueSnap.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();

  console.log(`✅ ${queueSnap.size} entrées de queue supprimées`);
});

// ════════════════════════════════════════════════════════════
//  8. SHORTPAGE LIKÉ → Notifier l'auteur
// ════════════════════════════════════════════════════════════
exports.onShortpageLiked = onDocumentUpdated('ni_shortpages/{spId}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  if (!before || !after) return;

  const likesBefore = (before.likedBy || []).length;
  const likesAfter = (after.likedBy || []).length;
  if (likesAfter <= likesBefore) return;

  const newLikerUid = (after.likedBy || []).find(uid => !(before.likedBy || []).includes(uid));
  if (!newLikerUid || newLikerUid === after.uid) return;

  const likerSnap = await db.collection('ni_users').doc(newLikerUid).get();
  const likerName = likerSnap.data()?.name || 'Quelqu\'un';

  const title = `❤️ ${likerName} aime votre Shortpage`;
  const body = `"${(after.title || '').substring(0, 60)}"`;

  await sendPush(after.uid, { title, body, type: 'like', url: 'https://marcelaagbassi-create.github.io/NOVELINK-/#books' });
});

console.log('🚀 NovelInk Cloud Functions chargées — DAVIESLAY studio');
