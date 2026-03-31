import { initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { getFirestore } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onValueWritten } from 'firebase-functions/v2/database';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'gen-lang-client-0321385325';
const FIRESTORE_DATABASE_ID = 'ai-studio-13a50fd4-0e71-4b2b-a091-760417dd0ad1';
const DEFAULT_DATABASE_INSTANCE = `${PROJECT_ID}-default-rtdb`;
const DEFAULT_DATABASE_URL = `https://${DEFAULT_DATABASE_INSTANCE}.firebaseio.com`;

const app = initializeApp({ databaseURL: DEFAULT_DATABASE_URL });
setGlobalOptions({ maxInstances: 10 });

const db = getFirestore(app, FIRESTORE_DATABASE_ID);
const youtubeApiKey = defineSecret('YOUTUBE_API_KEY');
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return emailRegex.test(email);
}

function assertAuthenticated(request) {
  if (!request.auth?.uid || !request.auth.token.email) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesion para usar esta funcion.');
  }

  return {
    uid: request.auth.uid,
    email: normalizeEmail(request.auth.token.email),
  };
}

function parseChannelUrl(url) {
  try {
    const parsedUrl = new URL(url.startsWith('http') ? url : `https://${url}`);
    const path = parsedUrl.pathname;

    const channelMatch = path.match(/\/channel\/(UC[\w-]+)/);
    if (channelMatch) {
      return { type: 'id', value: channelMatch[1] };
    }

    const handleMatch = path.match(/\/@([\w.-]+)/);
    if (handleMatch) {
      return { type: 'handle', value: handleMatch[1] };
    }

    const customMatch = path.match(/\/(c|user)\/([\w.-]+)/);
    if (customMatch) {
      return { type: 'username', value: customMatch[2] };
    }

    const simpleMatch = path.match(/^\/([\w.-]+)\/?$/);
    if (simpleMatch && simpleMatch[1] !== 'watch' && simpleMatch[1] !== 'feed') {
      return { type: 'handle', value: simpleMatch[1] };
    }

    return null;
  } catch {
    return null;
  }
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`YouTube API error: ${response.status}`);
  }
  return response.json();
}

async function resolveChannelId(channelUrl, apiKey) {
  const parsed = parseChannelUrl(channelUrl);
  if (!parsed) {
    return null;
  }

  if (parsed.type === 'id') {
    return parsed.value;
  }

  const lookupParam = parsed.type === 'handle'
    ? `forHandle=${encodeURIComponent(parsed.value)}`
    : `forUsername=${encodeURIComponent(parsed.value)}`;
  const lookupData = await fetchJson(
    `https://www.googleapis.com/youtube/v3/channels?part=id&${lookupParam}&key=${apiKey}`
  );

  if (!lookupData.items?.length) {
    return null;
  }

  return lookupData.items[0].id;
}

async function fetchChannelStats(channelUrl, apiKey) {
  const channelId = await resolveChannelId(channelUrl, apiKey);
  if (!channelId) {
    return null;
  }

  const data = await fetchJson(
    `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelId}&key=${apiKey}`
  );

  if (!data.items?.length) {
    return null;
  }

  const channel = data.items[0];
  return {
    title: channel.snippet.title,
    description: channel.snippet.description,
    customUrl: channel.snippet.customUrl || '',
    thumbnailUrl: channel.snippet.thumbnails?.medium?.url || channel.snippet.thumbnails?.default?.url || '',
    subscriberCount: parseInt(channel.statistics.subscriberCount || '0', 10),
    viewCount: parseInt(channel.statistics.viewCount || '0', 10),
    videoCount: parseInt(channel.statistics.videoCount || '0', 10),
    publishedAt: channel.snippet.publishedAt || '',
  };
}

async function fetchRecentVideos(channelUrl, apiKey, maxResults = 8) {
  const channelId = await resolveChannelId(channelUrl, apiKey);
  if (!channelId) {
    return [];
  }

  const searchData = await fetchJson(
    `https://www.googleapis.com/youtube/v3/search?part=id&channelId=${channelId}&order=date&type=video&maxResults=${maxResults}&key=${apiKey}`
  );

  if (!searchData.items?.length) {
    return [];
  }

  const videoIds = searchData.items
    .map((item) => item.id?.videoId)
    .filter(Boolean)
    .join(',');

  if (!videoIds) {
    return [];
  }

  const videoData = await fetchJson(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds}&key=${apiKey}`
  );

  return (videoData.items || []).map((video) => ({
    id: video.id,
    title: video.snippet.title,
    publishedAt: video.snippet.publishedAt,
    thumbnailUrl: video.snippet.thumbnails?.medium?.url || video.snippet.thumbnails?.default?.url || '',
    viewCount: parseInt(video.statistics.viewCount || '0', 10),
    likeCount: parseInt(video.statistics.likeCount || '0', 10),
    commentCount: parseInt(video.statistics.commentCount || '0', 10),
  }));
}

async function getBoardAccess(boardId, requester) {
  const boardRef = db.collection('boards').doc(boardId);
  const boardSnapshot = await boardRef.get();

  if (!boardSnapshot.exists) {
    throw new HttpsError('not-found', 'No se encontro el tablero.');
  }

  const boardData = boardSnapshot.data();
  const members = [...new Set((boardData.members || []).map(normalizeEmail).filter(Boolean))];
  const isOwner = boardData.ownerId === requester.uid;
  const isMember = members.includes(requester.email);

  if (!isOwner && !isMember) {
    throw new HttpsError('permission-denied', 'No tienes acceso a este tablero.');
  }

  return {
    boardRef,
    members,
    isOwner,
  };
}

function getRealtimeDatabaseForEvent(event) {
  const host = event?.firebaseDatabaseHost;
  return getDatabase(app, host ? `https://${host}` : DEFAULT_DATABASE_URL);
}

function normalizePresenceSession(session) {
  if (!session || typeof session !== 'object') return null;

  const emailLowercase = normalizeEmail(session.emailLowercase);
  if (!emailLowercase) return null;

  return {
    uid: String(session.uid || ''),
    emailLowercase,
    displayName: String(session.displayName || ''),
    photoURL: String(session.photoURL || ''),
    activeBoardId: session.activeBoardId ? String(session.activeBoardId) : null,
    activeSurface: session.activeSurface ? String(session.activeSurface) : null,
    connectedAt: String(session.connectedAt || ''),
    lastHeartbeatAt: String(session.lastHeartbeatAt || session.connectedAt || ''),
  };
}

function getPresenceAggregate(sessions) {
  const normalizedSessions = sessions.map(normalizePresenceSession).filter(Boolean);
  const latestSession = normalizedSessions
    .slice()
    .sort((left, right) => {
      const leftTime = new Date(left.lastHeartbeatAt || left.connectedAt || 0).getTime();
      const rightTime = new Date(right.lastHeartbeatAt || right.connectedAt || 0).getTime();
      return rightTime - leftTime;
    })[0] || null;

  return {
    isOnline: normalizedSessions.length > 0,
    sessionCount: normalizedSessions.length,
    emailLowercase: latestSession?.emailLowercase || '',
    displayName: latestSession?.displayName || '',
    photoURL: latestSession?.photoURL || '',
    activeBoardId: latestSession?.activeBoardId || null,
    activeSurface: latestSession?.activeSurface || null,
  };
}

function buildPresenceSummary(previousSummary, aggregate, boardId, nowIso) {
  const nextIsActiveInThisBoard = aggregate.isOnline && aggregate.activeBoardId === boardId;

  return {
    emailLowercase: aggregate.emailLowercase,
    displayName: aggregate.displayName,
    photoURL: aggregate.photoURL,
    state: aggregate.isOnline ? 'online' : 'offline',
    isOnline: aggregate.isOnline,
    isActiveInThisBoard: nextIsActiveInThisBoard,
    activeSurface: aggregate.isOnline ? aggregate.activeSurface || null : null,
    lastSeenAt: aggregate.isOnline ? previousSummary?.lastSeenAt || null : nowIso,
    enteredAt: nextIsActiveInThisBoard
      ? (previousSummary?.isActiveInThisBoard ? previousSummary.enteredAt || nowIso : nowIso)
      : previousSummary?.enteredAt || null,
    sessionCount: aggregate.sessionCount,
    updatedAt: nowIso,
  };
}

function summariesAreEqual(previousSummary, nextSummary) {
  if (!previousSummary) return false;

  return (
    previousSummary.displayName === nextSummary.displayName &&
    previousSummary.photoURL === nextSummary.photoURL &&
    previousSummary.state === nextSummary.state &&
    previousSummary.isOnline === nextSummary.isOnline &&
    previousSummary.isActiveInThisBoard === nextSummary.isActiveInThisBoard &&
    (previousSummary.activeSurface || null) === (nextSummary.activeSurface || null) &&
    (previousSummary.lastSeenAt || null) === (nextSummary.lastSeenAt || null) &&
    (previousSummary.enteredAt || null) === (nextSummary.enteredAt || null) &&
    previousSummary.sessionCount === nextSummary.sessionCount
  );
}

async function prunePresenceEvents(boardId) {
  const snapshot = await db
    .collection('boards')
    .doc(boardId)
    .collection('presence_events')
    .orderBy('at', 'desc')
    .limit(60)
    .get();

  if (snapshot.size <= 50) return;

  const overflowDocs = snapshot.docs.slice(50);
  const batch = db.batch();
  overflowDocs.forEach((item) => batch.delete(item.ref));
  await batch.commit();
}

async function appendPresenceEvents(boardId, events) {
  if (!events.length) return;

  const batch = db.batch();
  events.forEach((event) => {
    const eventRef = db.collection('boards').doc(boardId).collection('presence_events').doc();
    batch.set(eventRef, event);
  });
  await batch.commit();
  await prunePresenceEvents(boardId);
}

async function syncPresenceForUser(event, uid) {
  const rtdb = getRealtimeDatabaseForEvent(event);
  const sessionsSnapshot = await rtdb.ref(`/presence/users/${uid}/sessions`).get();
  const sessionsValue = sessionsSnapshot.val() || {};
  const aggregate = getPresenceAggregate(Object.values(sessionsValue));

  if (!aggregate.emailLowercase) {
    return;
  }

  const membershipSnapshot = await db
    .collection('boards')
    .where('members', 'array-contains', aggregate.emailLowercase)
    .get();

  const nowIso = new Date().toISOString();

  await Promise.all(membershipSnapshot.docs.map(async (boardDoc) => {
    const boardId = boardDoc.id;
    const summaryRef = db.collection('boards').doc(boardId).collection('presence_members').doc(aggregate.emailLowercase);
    const summarySnapshot = await summaryRef.get();
    const previousSummary = summarySnapshot.exists ? summarySnapshot.data() : null;
    const nextSummary = buildPresenceSummary(previousSummary, aggregate, boardId, nowIso);

    const nextEvents = [];

    if (!previousSummary && aggregate.isOnline) {
      nextEvents.push({
        boardId,
        emailLowercase: aggregate.emailLowercase,
        displayName: aggregate.displayName,
        photoURL: aggregate.photoURL,
        type: 'came_online',
        surface: aggregate.activeSurface || null,
        at: nowIso,
      });
      if (nextSummary.isActiveInThisBoard) {
        nextEvents.push({
          boardId,
          emailLowercase: aggregate.emailLowercase,
          displayName: aggregate.displayName,
          photoURL: aggregate.photoURL,
          type: 'entered_board',
          surface: aggregate.activeSurface || null,
          at: nowIso,
        });
      }
    } else if (previousSummary) {
      if (!previousSummary.isOnline && nextSummary.isOnline) {
        nextEvents.push({
          boardId,
          emailLowercase: aggregate.emailLowercase,
          displayName: aggregate.displayName,
          photoURL: aggregate.photoURL,
          type: 'came_online',
          surface: aggregate.activeSurface || null,
          at: nowIso,
        });
      }

      if (previousSummary.isOnline && !nextSummary.isOnline) {
        nextEvents.push({
          boardId,
          emailLowercase: aggregate.emailLowercase,
          displayName: aggregate.displayName,
          photoURL: aggregate.photoURL,
          type: 'went_offline',
          surface: previousSummary.activeSurface || null,
          at: nowIso,
        });
      }

      if (!previousSummary.isActiveInThisBoard && nextSummary.isActiveInThisBoard) {
        nextEvents.push({
          boardId,
          emailLowercase: aggregate.emailLowercase,
          displayName: aggregate.displayName,
          photoURL: aggregate.photoURL,
          type: 'entered_board',
          surface: aggregate.activeSurface || null,
          at: nowIso,
        });
      }

      if (previousSummary.isActiveInThisBoard && !nextSummary.isActiveInThisBoard) {
        nextEvents.push({
          boardId,
          emailLowercase: aggregate.emailLowercase,
          displayName: aggregate.displayName,
          photoURL: aggregate.photoURL,
          type: 'left_board',
          surface: previousSummary.activeSurface || null,
          at: nowIso,
        });
      }
    }

    if (!summariesAreEqual(previousSummary, nextSummary)) {
      await summaryRef.set(nextSummary, { merge: true });
    }

    if (nextEvents.length) {
      await appendPresenceEvents(boardId, nextEvents);
    }
  }));
}

export const getYouTubeChannelData = onCall(
  { secrets: [youtubeApiKey] },
  async (request) => {
    assertAuthenticated(request);

    const channelUrl = String(request.data?.channelUrl || '').trim();
    if (!channelUrl) {
      throw new HttpsError('invalid-argument', 'Debes enviar una URL de canal.');
    }

    const apiKey = youtubeApiKey.value();
    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'El secreto YOUTUBE_API_KEY no esta configurado.');
    }

    try {
      const [stats, videos] = await Promise.all([
        fetchChannelStats(channelUrl, apiKey),
        fetchRecentVideos(channelUrl, apiKey, 8),
      ]);

      return { stats, videos };
    } catch (error) {
      console.error('Error fetching YouTube data:', error);
      throw new HttpsError('internal', 'No se pudieron obtener los datos de YouTube.');
    }
  }
);

export const inviteBoardMember = onCall(async (request) => {
  const requester = assertAuthenticated(request);
  const boardId = String(request.data?.boardId || '').trim();
  const invitedEmail = normalizeEmail(request.data?.email);

  if (!boardId || !invitedEmail || !isValidEmail(invitedEmail)) {
    throw new HttpsError('invalid-argument', 'Debes enviar un boardId y un email validos.');
  }

  const { boardRef, members } = await getBoardAccess(boardId, requester);
  if (members.includes(invitedEmail)) {
    return { ok: true, alreadyMember: true, email: invitedEmail };
  }

  const userSnapshot = await db
    .collection('users')
    .where('emailLowercase', '==', invitedEmail)
    .limit(1)
    .get();

  if (userSnapshot.empty) {
    throw new HttpsError('not-found', 'El usuario invitado aun no existe en FrameFlow.');
  }

  await boardRef.update({
    members: [...new Set([...members, requester.email, invitedEmail])],
    updatedAt: new Date().toISOString(),
  });

  return { ok: true, email: invitedEmail };
});

export const removeBoardMember = onCall(async (request) => {
  const requester = assertAuthenticated(request);
  const boardId = String(request.data?.boardId || '').trim();
  const targetEmail = normalizeEmail(request.data?.email);

  if (!boardId || !targetEmail || !isValidEmail(targetEmail)) {
    throw new HttpsError('invalid-argument', 'Debes enviar un boardId y un email validos.');
  }

  const { boardRef, members, isOwner } = await getBoardAccess(boardId, requester);
  if (!isOwner) {
    throw new HttpsError('permission-denied', 'Solo el propietario puede quitar miembros.');
  }

  if (targetEmail === requester.email) {
    throw new HttpsError('failed-precondition', 'El propietario no puede eliminarse a si mismo.');
  }

  if (!members.includes(targetEmail)) {
    return { ok: true, removed: false };
  }

  await boardRef.update({
    members: members.filter((member) => member !== targetEmail),
    updatedAt: new Date().toISOString(),
  });

  return { ok: true, removed: true };
});

export const syncPresenceToBoards = onValueWritten(
  {
    ref: '/presence/users/{uid}/sessions/{sessionId}',
    instance: DEFAULT_DATABASE_INSTANCE,
  },
  async (event) => {
    const uid = String(event.params.uid || '').trim();
    if (!uid) return;

    try {
      await syncPresenceForUser(event, uid);
    } catch (error) {
      console.error('Error syncing presence to boards:', error);
    }
  }
);
