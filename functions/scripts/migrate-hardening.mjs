import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

initializeApp({
  credential: applicationDefault(),
});

const db = getFirestore();

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function migrateUsers() {
  const snapshot = await db.collection('users').get();
  const ownerEmails = new Map();
  let updatedUsers = 0;

  for (const userDoc of snapshot.docs) {
    const data = userDoc.data();
    const normalizedEmail = normalizeEmail(data.email);
    if (!normalizedEmail) {
      continue;
    }

    ownerEmails.set(userDoc.id, normalizedEmail);

    if (data.emailLowercase !== normalizedEmail) {
      await userDoc.ref.set(
        { emailLowercase: normalizedEmail },
        { merge: true }
      );
      updatedUsers += 1;
    }
  }

  return {
    ownerEmails,
    updatedUsers,
    totalUsers: snapshot.size,
  };
}

async function migrateBoards(ownerEmails) {
  const snapshot = await db.collection('boards').get();
  let updatedBoards = 0;
  let removedYoutubeKeys = 0;

  for (const boardDoc of snapshot.docs) {
    const data = boardDoc.data();
    const nextMembers = (data.members || [])
      .map(normalizeEmail)
      .filter(Boolean);
    const ownerEmail = ownerEmails.get(data.ownerId);

    if (ownerEmail) {
      nextMembers.push(ownerEmail);
    }

    const normalizedMembers = [...new Set(nextMembers)];
    const updates = {};
    const currentMembers = Array.isArray(data.members) ? data.members : [];

    if (JSON.stringify(currentMembers) !== JSON.stringify(normalizedMembers)) {
      updates.members = normalizedMembers;
    }

    if (Object.prototype.hasOwnProperty.call(data, 'youtubeApiKey')) {
      updates.youtubeApiKey = FieldValue.delete();
      removedYoutubeKeys += 1;
    }

    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date().toISOString();
      await boardDoc.ref.set(updates, { merge: true });
      updatedBoards += 1;
    }
  }

  return {
    updatedBoards,
    removedYoutubeKeys,
    totalBoards: snapshot.size,
  };
}

async function main() {
  console.log('Starting hardening migration...');
  console.log('GOOGLE_APPLICATION_CREDENTIALS:', process.env.GOOGLE_APPLICATION_CREDENTIALS || '(not set)');

  const { ownerEmails, updatedUsers, totalUsers } = await migrateUsers();
  const { updatedBoards, removedYoutubeKeys, totalBoards } = await migrateBoards(ownerEmails);

  console.log('');
  console.log('Migration finished.');
  console.log(`Users scanned: ${totalUsers}`);
  console.log(`Users updated with emailLowercase: ${updatedUsers}`);
  console.log(`Boards scanned: ${totalBoards}`);
  console.log(`Boards updated: ${updatedBoards}`);
  console.log(`youtubeApiKey removed from boards: ${removedYoutubeKeys}`);
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exitCode = 1;
});
