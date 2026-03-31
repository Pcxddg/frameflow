import {
  appendPresenceEvent,
  deletePresenceSession,
  upsertPresenceSession,
} from './supabase/frameflow';
import type { BoardPresenceEventType, PresenceSurface, User as AppUser } from '../types';

interface PresenceContext {
  activeBoardId: string | null;
  activeSurface: PresenceSurface;
  memberBoardIds: string[];
}

interface PresenceController {
  updateContext: (context: PresenceContext) => void;
  stop: () => Promise<void>;
}

function createSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `presence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function safeAppendEvent(
  boardId: string | null,
  user: AppUser,
  type: BoardPresenceEventType,
  surface: PresenceSurface | null
) {
  if (!boardId) return;
  try {
    await appendPresenceEvent({ boardId, user, type, surface });
  } catch (error) {
    console.error('Error appending presence event:', error);
  }
}

export function createPresenceController(user: AppUser, initialContext: PresenceContext): PresenceController {
  const sessionId = createSessionId();
  let context = initialContext;
  let stopped = false;
  let heartbeatTimer: number | null = null;
  let currentBoardId: string | null = null;
  let enteredAt: string | undefined;
  let onlineEventSent = false;
  let syncChain = Promise.resolve();

  const syncPresence = async () => {
    if (stopped) return;

    const nextBoardId = context.activeBoardId;
    const nextSurface = context.activeSurface;

    if (!nextBoardId) {
      if (currentBoardId) {
        await safeAppendEvent(currentBoardId, user, 'left_board', nextSurface);
        await safeAppendEvent(currentBoardId, user, 'went_offline', nextSurface);
        try {
          await deletePresenceSession(sessionId);
        } catch (error) {
          console.error('Error deleting presence session:', error);
        }
      }
      currentBoardId = null;
      enteredAt = undefined;
      onlineEventSent = false;
      return;
    }

    const boardChanged = currentBoardId && currentBoardId !== nextBoardId;
    if (boardChanged) {
      await safeAppendEvent(currentBoardId, user, 'left_board', nextSurface);
      enteredAt = undefined;
    }

    if (!onlineEventSent || boardChanged) {
      if (!onlineEventSent) {
        await safeAppendEvent(nextBoardId, user, 'came_online', nextSurface);
        onlineEventSent = true;
      }
      await safeAppendEvent(nextBoardId, user, 'entered_board', nextSurface);
    }

    currentBoardId = nextBoardId;
    enteredAt = enteredAt || new Date().toISOString();

    try {
      await upsertPresenceSession({
        id: sessionId,
        boardId: nextBoardId,
        user,
        surface: nextSurface,
        enteredAt,
        isOnline: true,
      });
    } catch (error) {
      console.error('Error syncing presence session:', error);
    }
  };

  const queueSync = () => {
    syncChain = syncChain
      .catch(() => undefined)
      .then(() => syncPresence())
      .catch((error) => {
        console.error('Error syncing presence state:', error);
      });
  };

  const ensureHeartbeat = () => {
    if (heartbeatTimer) {
      window.clearInterval(heartbeatTimer);
    }
    heartbeatTimer = window.setInterval(() => {
      queueSync();
    }, 30_000);
  };

  const handleVisibilityChange = () => {
    if (!document.hidden) {
      queueSync();
    }
  };

  ensureHeartbeat();
  document.addEventListener('visibilitychange', handleVisibilityChange);
  void syncPresence();

  return {
    updateContext(nextContext) {
      context = nextContext;
      queueSync();
    },
    async stop() {
      if (stopped) return;
      stopped = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (heartbeatTimer) {
        window.clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }

      const finalBoardId = currentBoardId;
      currentBoardId = null;

      if (finalBoardId) {
        await safeAppendEvent(finalBoardId, user, 'left_board', context.activeSurface);
        await safeAppendEvent(finalBoardId, user, 'went_offline', context.activeSurface);
      }

      try {
        await deletePresenceSession(sessionId);
      } catch (error) {
        console.error('Error stopping presence session:', error);
      }

      await syncChain.catch(() => undefined);
    },
  };
}
