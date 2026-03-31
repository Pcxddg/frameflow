import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

const PROJECT_ID = 'demo-frameflow';
const RULES_PATH = resolve(process.cwd(), 'firestore.rules');
const OWNER_UID = 'owner-uid';
const EDITOR_UID = 'editor-uid';
const VIEWER_UID = 'viewer-uid';
const INVITEE_UID = 'invitee-uid';
const OWNER_EMAIL = 'owner@example.com';
const EDITOR_EMAIL = 'editor@example.com';
const VIEWER_EMAIL = 'viewer@example.com';
const INVITEE_EMAIL = 'invitee@example.com';
const BOARD_ID = 'board-sharing-test';
const NOW = '2026-03-26T16:00:00.000Z';

let testEnv: RulesTestEnvironment;

function authedDb(uid: string, email: string) {
  return testEnv.authenticatedContext(uid, { email }).firestore();
}

async function seedState(options?: {
  withEditor?: boolean;
  withViewer?: boolean;
  withMemberRoles?: boolean;
}) {
  const {
    withEditor = false,
    withViewer = false,
    withMemberRoles = true,
  } = options || {};

  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    await Promise.all([
      db.doc(`users/${OWNER_UID}`).set({
        uid: OWNER_UID,
        email: OWNER_EMAIL,
        emailLowercase: OWNER_EMAIL,
        displayName: 'Owner',
        photoURL: '',
      }),
      db.doc(`users/${EDITOR_UID}`).set({
        uid: EDITOR_UID,
        email: EDITOR_EMAIL,
        emailLowercase: EDITOR_EMAIL,
        displayName: 'Editor',
        photoURL: '',
      }),
      db.doc(`users/${VIEWER_UID}`).set({
        uid: VIEWER_UID,
        email: VIEWER_EMAIL,
        emailLowercase: VIEWER_EMAIL,
        displayName: 'Viewer',
        photoURL: '',
      }),
      db.doc(`users/${INVITEE_UID}`).set({
        uid: INVITEE_UID,
        email: INVITEE_EMAIL,
        emailLowercase: INVITEE_EMAIL,
        displayName: 'Invitee',
        photoURL: '',
      }),
    ]);

    const members = [OWNER_EMAIL];
    if (withEditor) members.push(EDITOR_EMAIL);
    if (withViewer) members.push(VIEWER_EMAIL);

    const boardData: Record<string, unknown> = {
      id: BOARD_ID,
      title: 'Board de prueba',
      ownerId: OWNER_UID,
      members,
      lists: [],
      cards: {},
      createdAt: NOW,
      updatedAt: NOW,
    };

    if (withMemberRoles) {
      const memberRoles: Record<string, string> = {
        [OWNER_EMAIL]: 'owner',
      };
      if (withEditor) memberRoles[EDITOR_EMAIL] = 'editor';
      if (withViewer) memberRoles[VIEWER_EMAIL] = 'viewer';
      boardData.memberRoles = memberRoles;
    }

    await db.doc(`boards/${BOARD_ID}`).set(boardData);
  });
}

async function readBoardUnsafe() {
  let snapshotData: Record<string, unknown> | undefined;

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const snapshot = await db.doc(`boards/${BOARD_ID}`).get();
    snapshotData = snapshot.data() as Record<string, unknown> | undefined;
  });

  return snapshotData;
}

async function grantAccessAsOwner(role: 'editor' | 'viewer', options?: { mutateTitle?: boolean; withMemberRoles?: boolean }) {
  const db = authedDb(OWNER_UID, OWNER_EMAIL);
  const boardRef = db.doc(`boards/${BOARD_ID}`);
  const memberRoles = options?.withMemberRoles === false
    ? {
        [OWNER_EMAIL]: 'owner',
        [INVITEE_EMAIL]: role,
      }
    : {
        [OWNER_EMAIL]: 'owner',
        [INVITEE_EMAIL]: role,
      };

  return boardRef.update({
    members: [OWNER_EMAIL, INVITEE_EMAIL],
    memberRoles,
    updatedAt: NOW,
    ...(options?.mutateTitle ? { title: 'Titulo alterado' } : {}),
  });
}

async function grantAccessAsEditor(role: 'editor' | 'viewer') {
  const db = authedDb(EDITOR_UID, EDITOR_EMAIL);
  const boardRef = db.doc(`boards/${BOARD_ID}`);
  return boardRef.update({
    members: [OWNER_EMAIL, EDITOR_EMAIL, INVITEE_EMAIL],
    memberRoles: {
      [OWNER_EMAIL]: 'owner',
      [EDITOR_EMAIL]: 'editor',
      [INVITEE_EMAIL]: role,
    },
    updatedAt: NOW,
  });
}

async function removeViewerAsOwner() {
  const db = authedDb(OWNER_UID, OWNER_EMAIL);
  const boardRef = db.doc(`boards/${BOARD_ID}`);
  return boardRef.update({
    members: [OWNER_EMAIL],
    memberRoles: {
      [OWNER_EMAIL]: 'owner',
    },
    updatedAt: NOW,
  });
}

async function removeViewerAsEditor() {
  const db = authedDb(EDITOR_UID, EDITOR_EMAIL);
  const boardRef = db.doc(`boards/${BOARD_ID}`);
  return boardRef.update({
    members: [OWNER_EMAIL, EDITOR_EMAIL],
    memberRoles: {
      [OWNER_EMAIL]: 'owner',
      [EDITOR_EMAIL]: 'editor',
    },
    updatedAt: NOW,
  });
}

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error);
    throw error;
  }
}

async function main() {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
    },
  });

  try {
    await runTest('owner grants viewer access directly', async () => {
      await seedState();

      await assertSucceeds(grantAccessAsOwner('viewer'));

      const board = await readBoardUnsafe();
      assert.deepEqual(board?.members, [OWNER_EMAIL, INVITEE_EMAIL]);
      assert.deepEqual(board?.memberRoles, {
        [OWNER_EMAIL]: 'owner',
        [INVITEE_EMAIL]: 'viewer',
      });
    });

    await runTest('owner grants editor access on legacy board without memberRoles', async () => {
      await seedState({ withMemberRoles: false });

      await assertSucceeds(grantAccessAsOwner('editor', { withMemberRoles: false }));

      const board = await readBoardUnsafe();
      assert.deepEqual(board?.members, [OWNER_EMAIL, INVITEE_EMAIL]);
      assert.deepEqual(board?.memberRoles, {
        [OWNER_EMAIL]: 'owner',
        [INVITEE_EMAIL]: 'editor',
      });
    });

    await runTest('editor cannot grant access directly', async () => {
      await seedState({ withEditor: true });

      await assertFails(grantAccessAsEditor('viewer'));
    });

    await runTest('owner cannot change board content while granting access', async () => {
      await seedState();

      await assertFails(grantAccessAsOwner('viewer', { mutateTitle: true }));
    });

    await runTest('owner can remove a non-owner member', async () => {
      await seedState({ withViewer: true });

      await assertSucceeds(removeViewerAsOwner());

      const board = await readBoardUnsafe();
      assert.deepEqual(board?.members, [OWNER_EMAIL]);
      assert.deepEqual(board?.memberRoles, {
        [OWNER_EMAIL]: 'owner',
      });
    });

    await runTest('editor cannot remove members', async () => {
      await seedState({ withEditor: true, withViewer: true });

      await assertFails(removeViewerAsEditor());
    });
  } finally {
    await testEnv.cleanup();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
