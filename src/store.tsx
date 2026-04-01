import { useState, useEffect, useRef, createContext, useContext } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  AuditEvent,
  AuditEventType,
  Board,
  BoardPresenceEvent,
  BoardPresenceMember,
  Card,
  Checklist,
  CreateVideoFromFlowInput,
  Label,
  List,
  MemberRole,
  ProductionStageId,
  ProductionStageStatus,
  ProductionWorkMode,
  User as AppUser,
} from './types';
import { mergeWorkflowConfig } from './lib/workflowPlans';
import { normalizeCardForPersistence } from './lib/audit';
import { resolveBoardSeoConfig } from './lib/videoSeoConfig';
import { getCurrentUserRole, normalizeMemberEmail, stabilizeBoardMembership } from './lib/boardMembership';
import {
  bootstrapMinimalFlow,
  buildOptimizedVideoFlow,
  buildVideoExecutionSnapshot,
  getDerivedAssigneeLabel,
  getProductionFlowSummary,
  getSuggestedFlowColumn,
  syncFlowToColumn,
  updateProductionStageDetails,
  updateProductionStageStatus,
} from './lib/optimizedVideoFlow';
import { buildReadinessPayload, isExecutionPublishReady, trackProductEvent } from './lib/analytics';
import {
  buildInitialBoard,
  createBoardRecord,
  deleteBoardRecord,
  getBackendReadNotice,
  acceptPendingInvitations,
  inviteBoardMember as inviteBoardMemberRecord,
  removeBoardMember as removeBoardMemberRecord,
  saveBoardSnapshot,
  signInWithGoogle,
  signOutFromSupabase,
  subscribeBoardSnapshot,
  subscribeBoardsForUser,
  subscribePresence,
  subscribeToAuthState,
  ensureProfile,
  updateBoardMeta as updateBoardMetaRecord,
} from './lib/supabase/frameflow';

export const CHECKLIST_TEMPLATES = {
  'Formula 10X (Video Largo)': [
    'Nicho / Angulo unico definido',
    'Investigacion SEO + 50 Titulos listos',
    'Gancho perfecto de 8s (Start with end / Dolor)',
    'Storytelling estructural ("Queria X, PERO paso Y...")',
    'Grabacion completada',
    'Edicion: Cambio visual cada 10s',
    'Miniatura disenada (Rostro, Texto, Contexto)',
    'SEO, Etiquetas y Links de afiliados en descripcion',
    'Comentario fijado para Interlinking (Telarana)',
    'Video Programado y Publicado',
    'Monitorizacion CTR 2H (Ataque al corazon)'
  ],
  'Sistema de Shorts': [
    'Visualmente atractivo (1-3s Gancho)',
    'Formato repetible disenado',
    'Loopabilidad infinita asegurada',
    'Llamado a la accion rapido',
    'Publicado (Top of Funnel)'
  ]
};

export const LABELS: Label[] = [
  { id: 'label-red', name: 'Urgente', color: 'red' },
  { id: 'label-yellow', name: 'Esperando feedback', color: 'yellow' },
  { id: 'label-blue', name: 'En manos del editor', color: 'blue' },
  { id: 'label-green', name: 'Listo para publicar', color: 'green' },
  { id: 'label-purple', name: 'Short', color: 'purple' },
  { id: 'label-orange', name: 'Monetizado', color: 'orange' },
];

interface BoardContextType {
  user: AppUser | null;
  boards: Board[];
  board: Board | null;
  currentBoardId: string | null;
  readNotice: string | null;
  currentUserRole: MemberRole | null;
  isBoardOwner: boolean;
  canEditBoard: boolean;
  canInviteMembers: boolean;
  boardPresenceMembers: BoardPresenceMember[];
  boardPresenceEvents: BoardPresenceEvent[];
  onlineMemberCount: number;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  setCurrentBoardId: (id: string) => void;
  createBoard: (title: string) => Promise<void>;
  updateBoardMeta: (updates: Partial<Board>) => Promise<void>;
  addCard: (listId: string, title: string) => void;
  createVideoFromFlow: (input: CreateVideoFromFlowInput) => void;
  updateCard: (cardId: string, updates: Partial<Card>) => void;
  setProductionStageStatus: (cardId: string, stageId: ProductionStageId, status: ProductionStageStatus) => void;
  updateProductionStage: (cardId: string, stageId: ProductionStageId, updates: Partial<{ dueAt: string; notes: string }>) => void;
  deleteCard: (cardId: string, listId: string) => void;
  moveCard: (sourceListId: string, destListId: string, sourceIndex: number, destIndex: number, cardId: string) => void;
  addChecklist: (cardId: string, templateName: keyof typeof CHECKLIST_TEMPLATES) => void;
  toggleChecklistItem: (cardId: string, checklistId: string, itemId: string) => void;
  toggleLabel: (cardId: string, label: Label) => void;
  inviteMember: (email: string, role: Exclude<MemberRole, 'owner'>) => Promise<{ ok: boolean; error?: string }>;
  removeMember: (email: string) => Promise<void>;
  deleteBoard: (boardId: string) => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  isAuthReady: boolean;
}

const BoardContext = createContext<BoardContextType | undefined>(undefined);

function trackPublishReadyTransition(board: Board, previousCard: Card, nextCard: Card) {
  const previousExecution = buildVideoExecutionSnapshot(previousCard, board);
  const nextExecution = buildVideoExecutionSnapshot(nextCard, board);

  if (isExecutionPublishReady(previousExecution) || !isExecutionPublishReady(nextExecution)) return;

  trackProductEvent('publish_ready_reached', {
    board_id: board.id,
    card_id: nextCard.id,
    content_type: nextCard.contentType || 'undefined',
    ...buildReadinessPayload(nextExecution),
  });
}

function getStoredBoardKey(uid: string) {
  return `ff-current-board-id:${uid}`;
}

function getBoardsCacheKey(uid: string) {
  return `ff-boards-cache:${uid}`;
}

function clearStoredBoardSelection(uid?: string | null) {
  if (uid) {
    localStorage.removeItem(getStoredBoardKey(uid));
    localStorage.removeItem(getBoardsCacheKey(uid));
  }
  localStorage.removeItem('ff-current-board-id');
}

function getEmailVariants(email: string) {
  const trimmedEmail = email.trim();
  return [...new Set([trimmedEmail, normalizeMemberEmail(trimmedEmail)].filter(Boolean))];
}

function isValidEmailFormat(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isPresenceFresh(lastHeartbeatAt?: string) {
  if (!lastHeartbeatAt) return false;
  const timestamp = new Date(lastHeartbeatAt).getTime();
  if (Number.isNaN(timestamp)) return false;
  return Date.now() - timestamp < 75_000;
}

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, stripUndefinedDeep(item)])
    ) as T;
  }

  return value;
}

function hydrateBoardCards(nextBoard: Board): Board {
  const { members, memberRoles } = stabilizeBoardMembership(nextBoard.members || [], nextBoard.memberRoles);
  const normalizedBoard = {
    ...nextBoard,
    members,
    memberRoles,
  };

  return {
    ...normalizedBoard,
    cards: Object.fromEntries(
      Object.entries(nextBoard.cards || {}).map(([cardId, card]) => {
        const normalizedCard = normalizeCardForPersistence(card, normalizedBoard);
        return [
          cardId,
          applyProductionFlowDerivedFields(normalizedCard, normalizedBoard),
        ];
      })
    ),
  };
}

function readCachedBoards(uid: string) {
  try {
    const raw = localStorage.getItem(getBoardsCacheKey(uid));
    if (!raw) return [] as Board[];
    const parsed = JSON.parse(raw) as Board[];
    return parsed.map((item) => hydrateBoardCards(item));
  } catch {
    return [] as Board[];
  }
}

function writeCachedBoards(uid: string, boards: Board[]) {
  try {
    localStorage.setItem(getBoardsCacheKey(uid), JSON.stringify(stripUndefinedDeep(boards)));
  } catch (error) {
    console.warn('No se pudo guardar la cache local de boards.', error);
  }
}

function upsertCachedBoard(uid: string, nextBoard: Board) {
  const cachedBoards = readCachedBoards(uid);
  const index = cachedBoards.findIndex((item) => item.id === nextBoard.id);
  if (index >= 0) {
    cachedBoards[index] = hydrateBoardCards(nextBoard);
  } else {
    cachedBoards.unshift(hydrateBoardCards(nextBoard));
  }
  writeCachedBoards(uid, cachedBoards);
}

function removeCachedBoard(uid: string, boardId: string) {
  const cachedBoards = readCachedBoards(uid).filter((item) => item.id !== boardId);
  writeCachedBoards(uid, cachedBoards);
}

function detectChecklistProgressChange(previousCard: Card, nextCard: Card) {
  for (const nextChecklist of nextCard.checklists) {
    const previousChecklist = previousCard.checklists.find((item) => item.id === nextChecklist.id);
    if (!previousChecklist) continue;

    for (const nextItem of nextChecklist.items) {
      const previousItem = previousChecklist.items.find((item) => item.id === nextItem.id);
      if (previousItem && previousItem.isCompleted !== nextItem.isCompleted) {
        const completedBefore = previousCard.checklists.reduce(
          (sum, checklist) => sum + checklist.items.filter((item) => item.isCompleted).length,
          0
        );
        const completedAfter = nextCard.checklists.reduce(
          (sum, checklist) => sum + checklist.items.filter((item) => item.isCompleted).length,
          0
        );

        return {
          checklistTitle: nextChecklist.title,
          itemText: nextItem.text,
          isCompleted: nextItem.isCompleted,
          completedBefore,
          completedAfter,
        };
      }
    }
  }

  return null;
}

function summarizeMonetization(card: Card) {
  const monetization = card.monetization || {};
  const deals = monetization.deals || [];

  return {
    revenue: monetization.revenue || 0,
    estimatedRPM: monetization.estimatedRPM || 0,
    dealsCount: deals.length,
    paidDeals: deals.filter((deal) => deal.status === 'paid').length,
    hasAffiliate: !!monetization.hasAffiliate,
    hasSponsor: !!monetization.hasSponsor,
    sellsProduct: !!monetization.sellsProduct,
  };
}

function applyProductionFlowDerivedFields(card: Card, board: Board) {
  const summary = getProductionFlowSummary(card, board);
  if (!summary?.currentStage) return card;

  return normalizeCardForPersistence({
    ...card,
    dueDate: card.productionFlow?.publishAt || card.dueDate,
    assignee: getDerivedAssigneeLabel(summary.currentStage.ownerRole),
    productionFlow: card.productionFlow
      ? {
          ...card.productionFlow,
          scheduleStatus: summary.scheduleStatus,
        }
      : card.productionFlow,
    updatedAt: new Date().toISOString(),
  }, board);
}

function resolveKickoffModeForCard(board: Board, cardId: string): ProductionWorkMode {
  const workflowConfig = mergeWorkflowConfig(board.workflowConfig);
  const manualActiveVideoIds = (workflowConfig.activeVideoIds || []).filter(Boolean);

  if (manualActiveVideoIds.includes(cardId)) return 'planned';
  if (manualActiveVideoIds.length > 0) return 'extra';

  const cadence = Math.max(1, workflowConfig.cadence || 1);
  const plannedInFlight = Object.values(board.cards).filter((candidate) => {
    if (candidate.id === cardId || !candidate.productionFlow?.kickoffAt) return false;
    if (candidate.productionFlow.workMode !== 'planned') return false;
    const summary = getProductionFlowSummary(candidate, board);
    return !!summary && !summary.isComplete;
  }).length;

  return plannedInFlight < cadence ? 'planned' : 'extra';
}

export function BoardProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [boards, setBoards] = useState<Board[]>([]);
  const [board, setBoard] = useState<Board | null>(null);
  const [readNotice, setReadNotice] = useState<string | null>(null);
  const [boardPresenceMembers, setBoardPresenceMembers] = useState<BoardPresenceMember[]>([]);
  const [boardPresenceEvents, setBoardPresenceEvents] = useState<BoardPresenceEvent[]>([]);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [currentBoardId, setCurrentBoardId] = useState<string | null>(null);
  const boardRef = useRef<Board | null>(null);
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve());
  const latestPersistMutationRef = useRef(0);
  const currentUserRole = getCurrentUserRole(board, user);
  const isBoardOwner = currentUserRole === 'owner';
  const canEditBoard = currentUserRole === 'owner' || currentUserRole === 'editor';
  const canInviteMembers = currentUserRole === 'owner';
  const onlineMemberCount = boardPresenceMembers.filter((member) => member.isActiveInThisBoard && isPresenceFresh(member.lastHeartbeatAt)).length;

  const createAuditEvent = (
    type: AuditEventType,
    cardId?: string,
    payload?: Record<string, unknown>,
    fromListId?: string,
    toListId?: string
  ) => {
    if (!currentBoardId || !user) return null;

    const event: AuditEvent = {
      id: `audit-${uuidv4()}`,
      boardId: currentBoardId,
      cardId,
      actorEmail: user.email,
      type,
      at: new Date().toISOString(),
      payload,
      fromListId,
      toListId,
    };

    return event;
  };

  useEffect(() => {
    if (!user?.uid) {
      setCurrentBoardId(null);
      return;
    }

    setCurrentBoardId(localStorage.getItem(getStoredBoardKey(user.uid)));
  }, [user?.uid]);

  // Save currentBoardId to localStorage
  useEffect(() => {
    if (!user?.uid) return;

    const storageKey = getStoredBoardKey(user.uid);
    if (currentBoardId) {
      localStorage.setItem(storageKey, currentBoardId);
    } else {
      localStorage.removeItem(storageKey);
    }
  }, [currentBoardId, user?.uid]);

  useEffect(() => {
    if (saveState !== 'saved' && saveState !== 'error') return undefined;

    const timer = window.setTimeout(() => {
      setSaveState('idle');
    }, saveState === 'error' ? 5000 : 1800);

    return () => window.clearTimeout(timer);
  }, [saveState]);

  useEffect(() => {
    boardRef.current = board;
  }, [board]);

  useEffect(() => {
    const unsubscribe = subscribeToAuthState((nextUser) => {
      setIsAuthReady(false);
      setBoards([]);
      setBoard(null);
      setBoardPresenceMembers([]);
      setBoardPresenceEvents([]);
      setReadNotice(null);
      setSaveState('idle');
      setCurrentBoardId(null);
      localStorage.removeItem('ff-current-board-id');
      if (nextUser) {
        ensureProfile(nextUser)
          .then(() => acceptPendingInvitations(nextUser.uid, nextUser.emailLowercase).catch(() => {}))
          .finally(() => {
            setUser(nextUser);
            setIsAuthReady(true);
          });
      } else {
        setUser(null);
        setIsAuthReady(true);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !isAuthReady) return;

    let migrationAttempted = false;
    const cachedBoards = readCachedBoards(user.uid);
    if (cachedBoards.length > 0) {
      setBoards(cachedBoards);
      setCurrentBoardId((previousId) => (
        previousId && cachedBoards.some((item) => item.id === previousId)
          ? previousId
          : cachedBoards[0]?.id || null
      ));
    }

    const hydrateAndStoreBoards = async (fetchedBoards: Board[]) => {
      setBoards(fetchedBoards);
      writeCachedBoards(user.uid, fetchedBoards);
      setReadNotice(null);

      if (fetchedBoards.length > 0) {
        if (!currentBoardId || !fetchedBoards.some((item) => item.id === currentBoardId)) {
          setCurrentBoardId(fetchedBoards[0].id);
        }
        return;
      }

      if (migrationAttempted) return;
      migrationAttempted = true;

      const saved = localStorage.getItem('trello-board');
      if (!saved) {
        setBoard(null);
        setCurrentBoardId(null);
        clearStoredBoardSelection(user.uid);
        return;
      }

      try {
        const localBoard = JSON.parse(saved);
        const newBoard = hydrateBoardCards({
          ...localBoard,
          id: `board-${uuidv4()}`,
          ownerId: user.uid,
          members: [user.emailLowercase],
          memberRoles: { [user.emailLowercase]: 'owner' },
          workflowConfig: mergeWorkflowConfig(localBoard.workflowConfig),
          seoConfig: resolveBoardSeoConfig(localBoard.seoConfig),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as Board);
        await createBoardRecord(newBoard);
        await saveBoardSnapshot(newBoard);
        setCurrentBoardId(newBoard.id);
        localStorage.removeItem('trello-board');
      } catch (error) {
        console.error('Failed to migrate local board into Supabase', error);
        setBoard(null);
        setCurrentBoardId(null);
        clearStoredBoardSelection(user.uid);
      }
    };

    const unsubscribe = subscribeBoardsForUser(
      user,
      (fetchedBoards) => {
        void hydrateAndStoreBoards(fetchedBoards.map((item) => hydrateBoardCards(item)));
      },
      (error) => {
        console.error('Error fetching boards from Supabase:', error);
        const notice = getBackendReadNotice(error);
        if (notice) setReadNotice(notice);
        const fallbackBoards = readCachedBoards(user.uid);
        if (fallbackBoards.length > 0) {
          setBoards(fallbackBoards);
          setCurrentBoardId((previousId) => (
            previousId && fallbackBoards.some((item) => item.id === previousId)
              ? previousId
              : fallbackBoards[0]?.id || null
          ));
        }
      }
    );

    return () => unsubscribe();
  }, [user, isAuthReady, currentBoardId]);

  useEffect(() => {
    if (!user || !currentBoardId || !isAuthReady) return;

    const cachedBoards = readCachedBoards(user.uid);
    const cachedBoard = cachedBoards.find((item) => item.id === currentBoardId) || null;
    setBoard((previousBoard) => (previousBoard?.id === currentBoardId ? previousBoard : cachedBoard));

    const unsubscribe = subscribeBoardSnapshot(
      currentBoardId,
      (nextBoard) => {
        if (nextBoard) {
          const hydrated = hydrateBoardCards(nextBoard);
          setBoard(hydrated);
          upsertCachedBoard(user.uid, hydrated);
          setBoards((previousBoards) => {
            const exists = previousBoards.some((item) => item.id === hydrated.id);
            if (!exists) return [hydrated, ...previousBoards];
            return previousBoards.map((item) => item.id === hydrated.id ? hydrated : item);
          });
          setReadNotice(null);
        } else {
          setBoard(null);
          setCurrentBoardId(null);
          localStorage.removeItem(getStoredBoardKey(user.uid));
          removeCachedBoard(user.uid, currentBoardId);
        }
      },
      (error) => {
        console.error('Error fetching current board from Supabase:', error);
        const notice = getBackendReadNotice(error);
        if (notice) setReadNotice(notice);
      }
    );

    return () => unsubscribe();
  }, [currentBoardId, user, isAuthReady]);

  useEffect(() => {
    if (!currentBoardId) {
      setBoardPresenceMembers([]);
      setBoardPresenceEvents([]);
      return;
    }

    const unsubscribe = subscribePresence(
      currentBoardId,
      ({ members, events }) => {
        const activeBoard = boardRef.current;
        if (!activeBoard) {
          setBoardPresenceMembers([]);
          setBoardPresenceEvents([]);
          return;
        }

        const { memberRoles } = stabilizeBoardMembership(activeBoard.members || [], activeBoard.memberRoles);
        const allowedMembers = new Set(Object.keys(memberRoles));
        setBoardPresenceMembers(
          members.filter((member) => allowedMembers.has(normalizeMemberEmail(member.emailLowercase)))
        );
        setBoardPresenceEvents(
          events.filter((event) => allowedMembers.has(normalizeMemberEmail(event.emailLowercase)))
        );
      },
      (error) => {
        console.error('Error fetching board presence from Supabase:', error);
        setBoardPresenceMembers([]);
        setBoardPresenceEvents([]);
      }
    );

    return () => unsubscribe();
  }, [currentBoardId]);

  const createBoard = async (title: string) => {
    if (!user) return;

    const newBoard = hydrateBoardCards(buildInitialBoard(user, title.trim() || 'Nuevo canal'));

    try {
      setSaveState('saving');
      await createBoardRecord(newBoard);
      upsertCachedBoard(user.uid, newBoard);
      setBoards((previousBoards) => [newBoard, ...previousBoards.filter((item) => item.id !== newBoard.id)]);
      setCurrentBoardId(newBoard.id);
      setReadNotice(null);
      setSaveState('saved');
    } catch (error) {
      console.error('Error creating board in Supabase:', error);
      const notice = getBackendReadNotice(error);
      if (notice) setReadNotice(notice);
      setSaveState('error');
    }
  };

  const persistBoardSnapshot = async (updatedBoard: Board, options?: { auditEvents?: AuditEvent[] }) => {
    const targetBoardId = updatedBoard.id || currentBoardId;
    if (!targetBoardId || !user || !canEditBoard) {
      console.warn('persistBoardSnapshot: skipped', {
        targetBoardId: !!targetBoardId,
        user: !!user,
        canEditBoard,
      });
      return;
    }

    const previousBoard = boardRef.current;
    const hydratedBoard = hydrateBoardCards(updatedBoard);
    const nextBoard = stripUndefinedDeep({
      ...hydratedBoard,
      updatedAt: new Date().toISOString(),
    });
    const mutationId = latestPersistMutationRef.current + 1;
    latestPersistMutationRef.current = mutationId;

    setSaveState('saving');
    setBoard(nextBoard);
    boardRef.current = nextBoard;
    setBoards((previousBoards) => {
      const exists = previousBoards.some((item) => item.id === targetBoardId);
      if (!exists) return [nextBoard, ...previousBoards];
      return previousBoards.map((item) => (item.id === targetBoardId ? nextBoard : item));
    });
    upsertCachedBoard(user.uid, nextBoard);

    const savePromise = persistQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        await saveBoardSnapshot(nextBoard, options?.auditEvents || []);
        if (mutationId === latestPersistMutationRef.current) {
          setReadNotice(null);
          setSaveState('saved');
        }
      });

    persistQueueRef.current = savePromise.catch(() => undefined);

    try {
      await savePromise;
    } catch (error) {
      console.error('Error updating board in Supabase:', error);

      if (mutationId === latestPersistMutationRef.current && previousBoard) {
        setBoard(previousBoard);
        boardRef.current = previousBoard;
        setBoards((previousBoards) => previousBoards.map((item) => (
          item.id === previousBoard.id ? previousBoard : item
        )));
        upsertCachedBoard(user.uid, previousBoard);
        const notice = getBackendReadNotice(error);
        if (notice) setReadNotice(notice);
        setSaveState('error');
      }
    }
  };

  const updateBoardMeta = async (updates: Partial<Board>) => {
    if (!board || !user || !canEditBoard) return;

    const previousBoard = board;
    const nextBoard = hydrateBoardCards({
      ...board,
      ...updates,
      workflowConfig: updates.workflowConfig ?? board.workflowConfig,
      seoConfig: updates.seoConfig ?? board.seoConfig,
      descriptionPresets: updates.descriptionPresets ?? board.descriptionPresets,
      updatedAt: new Date().toISOString(),
    });

    try {
      setSaveState('saving');
      setBoard(nextBoard);
      boardRef.current = nextBoard;
      setBoards((previousBoards) => previousBoards.map((item) => (item.id === nextBoard.id ? nextBoard : item)));
      upsertCachedBoard(user.uid, nextBoard);
      await updateBoardMetaRecord(board.id, updates);
      setReadNotice(null);
      setSaveState('saved');
    } catch (error) {
      console.error('Error updating board meta in Supabase:', error);
      setBoard(previousBoard);
      boardRef.current = previousBoard;
      setBoards((previousBoards) => previousBoards.map((item) => (item.id === previousBoard.id ? previousBoard : item)));
      upsertCachedBoard(user.uid, previousBoard);
      const notice = getBackendReadNotice(error);
      if (notice) setReadNotice(notice);
      setSaveState('error');
    }
  };
  const addCard = (listId: string, title: string) => {
    const activeBoard = boardRef.current || board;
    if (!activeBoard || !canEditBoard) return;
    const now = new Date().toISOString();
    const newCard: Card = {
      id: `card-${uuidv4()}`,
      title,
      description: '',
      listId,
      labels: [],
      checklists: [],
      dueDate: null,
      assignee: null,
      titulosLinden: '',
      gancho8s: '',
      narrativa: '',
      miniaturaChecklist: {
        rostro: false,
        texto: false,
        contexto: false,
      },
      thumbnailPlan: {
        status: 'pending',
        concept: '',
        overlayText: '',
        assetUrl: '',
        generationPrompt: '',
        useRealPerson: false,
      },
      ctr2Hours: '',
      interlinking: '',
      linkDrive: '',
      seoSourceText: '',
      contentType: (activeBoard.defaultContentType as 'long' | 'short' | undefined) || undefined,
      keywords: '',
      storytelling: { queria: '', pero: '', porLoTanto: '' },
      postPublication: {},
      monetization: {},
      interlinkingTargets: [],
      shortsHook: '',
      shortsLoop: false,
      shortsFunnel: '',
      columnHistory: [{ listId, enteredAt: now }],
      createdAt: now,
      updatedAt: now,
    };

    const bootstrapped = bootstrapMinimalFlow(newCard, activeBoard);
    newCard.productionFlow = bootstrapped.productionFlow;
    newCard.checklists = bootstrapped.checklists;

    const newLists = activeBoard.lists.map((list) => {
      if (list.id === listId) {
        return { ...list, cardIds: [...list.cardIds, newCard.id] };
      }
      return list;
    });

    const auditEvent = createAuditEvent('card_created', newCard.id, {
      cardTitle: newCard.title,
      listId,
      listTitle: activeBoard.lists.find((list) => list.id === listId)?.title || listId,
      contentType: newCard.contentType || 'undefined',
    });

    persistBoardSnapshot({
      ...activeBoard,
      lists: newLists,
      cards: { ...activeBoard.cards, [newCard.id]: newCard },
    }, { auditEvents: auditEvent ? [auditEvent] : [] });
  };

  const createVideoFromFlow = (input: CreateVideoFromFlowInput) => {
    const activeBoard = boardRef.current || board;
    if (!activeBoard || !canEditBoard) return;

    const now = new Date().toISOString();
    const newCardId = `card-${uuidv4()}`;
    const builtFlow = buildOptimizedVideoFlow(input, activeBoard, mergeWorkflowConfig(activeBoard.workflowConfig));
    const targetListId = builtFlow.suggestedListId || activeBoard.lists[0]?.id;
    if (!targetListId) return;

    const newCard: Card = normalizeCardForPersistence({
      id: newCardId,
      title: input.title.trim(),
      description: '',
      listId: targetListId,
      labels: builtFlow.productionFlow.isTightSchedule
        ? [LABELS.find((label) => label.id === 'label-red')].filter((label): label is Label => !!label)
        : [],
      checklists: builtFlow.checklists,
      dueDate: builtFlow.dueDate,
      assignee: builtFlow.derivedAssignee,
      titulosLinden: builtFlow.seededTitles,
      gancho8s: input.hook?.trim() || '',
      narrativa: '',
      miniaturaChecklist: {
        rostro: false,
        texto: false,
        contexto: false,
      },
      thumbnailPlan: {
        status: 'pending',
        concept: '',
        overlayText: '',
        assetUrl: '',
        generationPrompt: '',
        useRealPerson: false,
      },
      ctr2Hours: '',
      interlinking: '',
      linkDrive: '',
      guion: input.scriptBase?.trim() || '',
      seoSourceText: '',
      contentType: builtFlow.contentType,
      keywords: '',
      storytelling: { queria: '', pero: '', porLoTanto: '' },
      postPublication: {},
      monetization: {},
      interlinkingTargets: [],
      shortsHook: '',
      shortsLoop: false,
      shortsFunnel: '',
      columnHistory: [{ listId: targetListId, enteredAt: now }],
      createdAt: now,
      updatedAt: now,
      productionBrief: builtFlow.productionBrief,
      productionFlow: builtFlow.productionFlow,
    }, activeBoard);

    const newLists = activeBoard.lists.map((list) => (
      list.id === targetListId
        ? { ...list, cardIds: [...list.cardIds, newCard.id] }
        : list
    ));

    const createdEvent = createAuditEvent('card_created', newCard.id, {
      cardTitle: newCard.title,
      listId: targetListId,
      listTitle: activeBoard.lists.find((list) => list.id === targetListId)?.title || targetListId,
      contentType: newCard.contentType || 'long',
      seededByWizard: true,
    });

    const flowEvent = createAuditEvent('video_flow_created', newCard.id, {
      cardTitle: newCard.title,
      publishAt: builtFlow.productionFlow.publishAt,
      currentStageId: builtFlow.productionFlow.currentStageId,
      isTightSchedule: builtFlow.productionFlow.isTightSchedule,
      stages: builtFlow.productionFlow.stages.length,
    });

    const aiSeededEvent = input.usedAI
      ? createAuditEvent('video_ai_seeded', newCard.id, {
          cardTitle: newCard.title,
          seededSections: [
            input.title ? 'title' : null,
            input.hook?.trim() ? 'hook' : null,
            input.researchSummary?.trim() ? 'research' : null,
            input.scriptBase?.trim() ? 'script' : null,
          ].filter(Boolean),
          regeneratedSections: input.regeneratedSections || [],
          currentStageId: builtFlow.productionFlow.currentStageId,
        })
      : null;

    const regeneratedEvents = (input.regeneratedSections || [])
      .map((section) => createAuditEvent('stage_ai_regenerated', newCard.id, {
        cardTitle: newCard.title,
        section,
        stageId: section === 'research' ? 'research' : section === 'script' ? 'script' : 'title_hook',
      }))
      .filter((event): event is AuditEvent => !!event);

    const nextBoard = {
      ...activeBoard,
      lists: newLists,
      cards: {
        ...activeBoard.cards,
        [newCard.id]: newCard,
      },
    };
    const createdExecution = buildVideoExecutionSnapshot(newCard, nextBoard);

    trackProductEvent('video_created', {
      board_id: activeBoard.id,
      card_id: newCard.id,
      content_type: newCard.contentType || 'undefined',
      used_ai: !!input.usedAI,
      regenerated_sections: input.regeneratedSections || [],
      current_stage: builtFlow.productionFlow.currentStageId,
      ...buildReadinessPayload(createdExecution),
    });

    persistBoardSnapshot(nextBoard, {
      auditEvents: [createdEvent, flowEvent, aiSeededEvent, ...regeneratedEvents].filter((event): event is AuditEvent => !!event),
    });
  };

  const updateCard = (cardId: string, updates: Partial<Card>) => {
    const activeBoard = boardRef.current || board;
    if (!activeBoard || !canEditBoard) return;
    const currentCard = activeBoard.cards[cardId];
    if (!currentCard) return;
    if (Object.keys(updates).length === 0) return;

    const nextCard = normalizeCardForPersistence({
      ...currentCard,
      ...updates,
      updatedAt: new Date().toISOString(),
    }, activeBoard);

    const auditEvents: AuditEvent[] = [];

    if ('assignee' in updates && currentCard.assignee !== nextCard.assignee) {
      const event = createAuditEvent('assignee_changed', cardId, {
        cardTitle: nextCard.title,
        previousAssignee: currentCard.assignee,
        nextAssignee: nextCard.assignee,
      });
      if (event) auditEvents.push(event);
    }

    if ('checklists' in updates) {
      const checklistChange = detectChecklistProgressChange(currentCard, nextCard);
      if (checklistChange) {
        const event = createAuditEvent('checklist_progress_changed', cardId, {
          cardTitle: nextCard.title,
          ...checklistChange,
        });
        if (event) auditEvents.push(event);
      }
    }

    if ('ctr2Hours' in updates && currentCard.ctr2Hours !== nextCard.ctr2Hours) {
      const event = createAuditEvent('ctr_updated', cardId, {
        cardTitle: nextCard.title,
        previousCTR: currentCard.ctr2Hours || null,
        nextCTR: nextCard.ctr2Hours || null,
      });
      if (event) auditEvents.push(event);
    }

    if (
      updates.monetization !== undefined &&
      JSON.stringify(currentCard.monetization || {}) !== JSON.stringify(nextCard.monetization || {})
    ) {
      const event = createAuditEvent('monetization_updated', cardId, {
        cardTitle: nextCard.title,
        before: summarizeMonetization(currentCard),
        after: summarizeMonetization(nextCard),
      });
      if (event) auditEvents.push(event);
    }

    if (
      updates.postPublication !== undefined &&
      currentCard.postPublication?.publishedAt !== nextCard.postPublication?.publishedAt &&
      !!nextCard.postPublication?.publishedAt
    ) {
      const event = createAuditEvent('card_published', cardId, {
        cardTitle: nextCard.title,
        publishedAt: nextCard.postPublication.publishedAt,
      });
      if (event) auditEvents.push(event);
    }

    trackPublishReadyTransition(activeBoard, currentCard, nextCard);

    persistBoardSnapshot({
      ...activeBoard,
      cards: {
        ...activeBoard.cards,
        [cardId]: nextCard,
      },
    }, { auditEvents });
  };

  const setProductionStageStatus = (cardId: string, stageId: ProductionStageId, status: ProductionStageStatus) => {
    const activeBoard = boardRef.current || board;
    if (!activeBoard || !canEditBoard) return;
    const currentCard = activeBoard.cards[cardId];
    if (!currentCard?.productionFlow) return;
    const previousStage = currentCard.productionFlow.stages.find((item) => item.id === stageId);

    const shouldKickoff =
      !currentCard.productionFlow.kickoffAt &&
      (
        (stageId === 'idea' && status === 'done') ||
        (stageId !== 'idea' && (status === 'in_progress' || status === 'done' || status === 'blocked'))
      );
    const kickoffMode = shouldKickoff ? resolveKickoffModeForCard(activeBoard, cardId) : undefined;
    const nextFlow = updateProductionStageStatus(currentCard.productionFlow, stageId, status, new Date().toISOString(), {
      kickoffMode,
    });
    const nextCard = applyProductionFlowDerivedFields({
      ...currentCard,
      productionFlow: nextFlow,
    }, activeBoard);

    const stage = nextFlow.stages.find((item) => item.id === stageId);
    const nextExecution = buildVideoExecutionSnapshot(nextCard, activeBoard);
    const auditType: AuditEventType =
      status === 'done'
        ? 'stage_completed'
        : status === 'pending'
        ? 'stage_reopened'
        : 'stage_started';

    const auditEvent = createAuditEvent(auditType, cardId, {
      cardTitle: nextCard.title,
      stageId,
      stageLabel: stage?.label || stageId,
      nextStatus: status,
      currentStageId: nextFlow.currentStageId,
    });

    if (status === 'done' && previousStage?.status !== 'done') {
      trackProductEvent('production_stage_completed', {
        board_id: activeBoard.id,
        card_id: cardId,
        content_type: nextCard.contentType || 'undefined',
        stage_id: stageId,
        stage_label: stage?.label || stageId,
        ...buildReadinessPayload(nextExecution),
      });
    }

    trackPublishReadyTransition(activeBoard, currentCard, nextCard);

    persistBoardSnapshot({
      ...activeBoard,
      cards: {
        ...activeBoard.cards,
        [cardId]: nextCard,
      },
    }, { auditEvents: auditEvent ? [auditEvent] : [] });
  };

  const updateProductionStage = (cardId: string, stageId: ProductionStageId, updates: Partial<{ dueAt: string; notes: string }>) => {
    const activeBoard = boardRef.current || board;
    if (!activeBoard || !canEditBoard) return;
    const currentCard = activeBoard.cards[cardId];
    if (!currentCard?.productionFlow) return;

    const previousStage = currentCard.productionFlow.stages.find((stage) => stage.id === stageId);
    const nextFlow = updateProductionStageDetails(currentCard.productionFlow, stageId, updates);
    const nextCard = applyProductionFlowDerivedFields({
      ...currentCard,
      productionFlow: nextFlow,
    }, activeBoard);

    const auditEvents: AuditEvent[] = [];
    if (updates.dueAt && previousStage?.dueAt !== updates.dueAt) {
      const auditEvent = createAuditEvent('stage_due_changed', cardId, {
        cardTitle: nextCard.title,
        stageId,
        stageLabel: previousStage?.label || stageId,
        previousDueAt: previousStage?.dueAt || null,
        nextDueAt: updates.dueAt,
      });
      if (auditEvent) auditEvents.push(auditEvent);
    }

    persistBoardSnapshot({
      ...activeBoard,
      cards: {
        ...activeBoard.cards,
        [cardId]: nextCard,
      },
    }, { auditEvents });
  };

  const deleteCard = (cardId: string, listId: string) => {
    const activeBoard = boardRef.current || board;
    if (!activeBoard || !canEditBoard) return;
    const newLists = activeBoard.lists.map(list => {
      if (list.id === listId) {
        return { ...list, cardIds: list.cardIds.filter(id => id !== cardId) };
      }
      return list;
    });

    const newCards = { ...activeBoard.cards };
    delete newCards[cardId];

    persistBoardSnapshot({ ...activeBoard, lists: newLists, cards: newCards });
  };

  const moveCard = (sourceListId: string, destListId: string, _sourceIndex: number, destIndex: number, cardId: string) => {
    const activeBoard = boardRef.current || board;
    if (!activeBoard || !canEditBoard) return;
    const now = new Date().toISOString();
    const newLists = [...activeBoard.lists];
    const sourceList = newLists.find(l => l.id === sourceListId)!;
    const destList = newLists.find(l => l.id === destListId)!;

    // Always find actual source position by cardId (filter-safe)
    const actualSourceIndex = sourceList.cardIds.indexOf(cardId);
    if (actualSourceIndex === -1) return;

    if (sourceListId === destListId) {
      const newCardIds = Array.from(sourceList.cardIds);
      newCardIds.splice(actualSourceIndex, 1);
      newCardIds.splice(destIndex, 0, cardId);

      const listIndex = newLists.findIndex(l => l.id === sourceListId);
      newLists[listIndex] = { ...sourceList, cardIds: newCardIds };
    } else {
      const sourceCardIds = Array.from(sourceList.cardIds);
      sourceCardIds.splice(actualSourceIndex, 1);

      const destCardIds = Array.from(destList.cardIds);
      destCardIds.splice(destIndex, 0, cardId);

      const sourceListIndex = newLists.findIndex(l => l.id === sourceListId);
      const destListIndex = newLists.findIndex(l => l.id === destListId);

      newLists[sourceListIndex] = { ...sourceList, cardIds: sourceCardIds };
      newLists[destListIndex] = { ...destList, cardIds: destCardIds };
    }

    const card = normalizeCardForPersistence(activeBoard.cards[cardId], activeBoard);
    const columnHistory = card.columnHistory || [{ listId: sourceListId, enteredAt: card.createdAt || now }];
    const updatedHistory = sourceListId !== destListId
      ? [...columnHistory, { listId: destListId, enteredAt: now }]
      : columnHistory;

    const updatedCard = {
      ...card,
      listId: destListId,
      columnHistory: updatedHistory,
      updatedAt: now,
    };

    const auditEvents: AuditEvent[] = [];

    const movementEvent = sourceListId !== destListId
      ? createAuditEvent(
          'card_moved',
          cardId,
          {
            cardTitle: card.title,
            fromListTitle: sourceList.title,
            toListTitle: destList.title,
          },
          sourceListId,
          destListId
        )
      : null;
    if (movementEvent) auditEvents.push(movementEvent);

    // Sync productionFlow stages when moving between columns
    let cardWithSyncedFlow = updatedCard;
    if (sourceListId !== destListId) {
      if (updatedCard.productionFlow) {
        const flowUpdates = syncFlowToColumn(updatedCard, destListId, activeBoard);
        if (flowUpdates) {
          cardWithSyncedFlow = { ...updatedCard, ...flowUpdates };
        }
      } else {
        // Bootstrap flow for legacy cards that don't have one
        const bootstrapped = bootstrapMinimalFlow(updatedCard, activeBoard);
        cardWithSyncedFlow = { ...updatedCard, productionFlow: bootstrapped.productionFlow, checklists: [...updatedCard.checklists, ...bootstrapped.checklists] };
      }
    }

    const movedCardWithFlow = cardWithSyncedFlow.productionFlow
      ? applyProductionFlowDerivedFields(cardWithSyncedFlow, activeBoard)
      : cardWithSyncedFlow;

    if (sourceListId !== destListId && movedCardWithFlow.productionFlow) {
      const suggestion = getSuggestedFlowColumn(movedCardWithFlow, activeBoard);
      if (suggestion && suggestion.listId !== destListId) {
        const mismatchEvent = createAuditEvent('flow_column_mismatch_detected', cardId, {
          cardTitle: movedCardWithFlow.title,
          currentListId: destListId,
          expectedListId: suggestion.listId,
          expectedListTitle: suggestion.listTitle,
          currentStageLabel: suggestion.stageLabel,
        }, sourceListId, destListId);
        if (mismatchEvent) auditEvents.push(mismatchEvent);
      }
    }

    persistBoardSnapshot({
      ...activeBoard,
      lists: newLists,
      cards: {
        ...activeBoard.cards,
        [cardId]: movedCardWithFlow
      }
    }, { auditEvents });
  };

  const addChecklist = (cardId: string, templateName: keyof typeof CHECKLIST_TEMPLATES) => {
    const activeBoard = boardRef.current || board;
    if (!activeBoard || !canEditBoard) return;
    const card = activeBoard.cards[cardId];
    const newChecklist: Checklist = {
      id: `checklist-${uuidv4()}`,
      title: templateName,
      items: CHECKLIST_TEMPLATES[templateName].map(text => ({
        id: `item-${uuidv4()}`,
        text,
        isCompleted: false
      }))
    };

    updateCard(cardId, {
      checklists: [...card.checklists, newChecklist]
    });
  };

  const toggleChecklistItem = (cardId: string, checklistId: string, itemId: string) => {
    const activeBoard = boardRef.current || board;
    if (!activeBoard || !canEditBoard) return;
    const card = activeBoard.cards[cardId];
    const newChecklists = card.checklists.map(checklist => {
      if (checklist.id === checklistId) {
        return {
          ...checklist,
          items: checklist.items.map(item =>
            item.id === itemId ? { ...item, isCompleted: !item.isCompleted } : item
          )
        };
      }
      return checklist;
    });

    updateCard(cardId, { checklists: newChecklists });
  };

  const toggleLabel = (cardId: string, label: Label) => {
    const activeBoard = boardRef.current || board;
    if (!activeBoard || !canEditBoard) return;
    const card = activeBoard.cards[cardId];
    const hasLabel = card.labels.some(l => l.id === label.id);

    const newLabels = hasLabel
      ? card.labels.filter(l => l.id !== label.id)
      : [...card.labels, label];

    updateCard(cardId, { labels: newLabels });
  };

  const inviteMember = async (
    email: string,
    role: Exclude<MemberRole, 'owner'>
  ): Promise<{ ok: boolean; error?: string }> => {
    const activeBoard = boardRef.current || board;
    if (!activeBoard || !currentBoardId || !user || !canInviteMembers) {
      return { ok: false, error: 'No tienes permisos para invitar personas a este canal.' };
    }

    const normalizedEmail = normalizeMemberEmail(email);
    if (!normalizedEmail || !isValidEmailFormat(normalizedEmail)) {
      return { ok: false, error: 'Escribe un email valido.' };
    }

    if (activeBoard.members.some((member) => normalizeMemberEmail(member) === normalizedEmail)) {
      return { ok: false, error: 'Ese email ya tiene acceso al canal.' };
    }

    try {
      const result = await inviteBoardMemberRecord(currentBoardId, normalizedEmail, role, user.uid, activeBoard.title);
      if (!result.ok) return result;
      setReadNotice(null);
      return result;
    } catch (error) {
      console.error('Error inviting member:', error);
      const notice = getBackendReadNotice(error);
      if (notice) setReadNotice(notice);
      return { ok: false, error: 'No se pudo dar acceso al canal. Intenta otra vez.' };
    }
  };

  const removeMember = async (email: string) => {
    const activeBoard = boardRef.current || board;
    if (!activeBoard || !currentBoardId || !user || !isBoardOwner) return;

    const normalizedEmail = normalizeMemberEmail(email);
    if (!normalizedEmail || normalizedEmail === user.emailLowercase) return;

    try {
      await removeBoardMemberRecord(currentBoardId, normalizedEmail);
      setReadNotice(null);
    } catch (error) {
      console.error('Error removing member:', error);
      const notice = getBackendReadNotice(error);
      if (notice) setReadNotice(notice);
    }
  };

  const handleSignOut = async () => {
    if (user?.uid) {
      localStorage.removeItem(getStoredBoardKey(user.uid));
    }
    localStorage.removeItem('ff-current-board-id');
    await signOutFromSupabase();
  };

  const deleteBoard = async (boardId: string) => {
    if (!user) return;
    try {
      await deleteBoardRecord(boardId);
      removeCachedBoard(user.uid, boardId);
      if (currentBoardId === boardId) {
        const remaining = boards.filter(b => b.id !== boardId);
        const nextId = remaining.length > 0 ? remaining[0].id : null;
        setCurrentBoardId(nextId);
        if (!nextId && user?.uid) {
          localStorage.removeItem(getStoredBoardKey(user.uid));
        }
      }
    } catch (error) {
      console.error("Error deleting board:", error);
      const notice = getBackendReadNotice(error);
      if (notice) setReadNotice(notice);
    }
  };

  return (
    <BoardContext.Provider value={{
      user,
      boards,
      board,
      currentBoardId,
      readNotice,
      currentUserRole,
      isBoardOwner,
      canEditBoard,
      canInviteMembers,
      boardPresenceMembers,
      boardPresenceEvents,
      onlineMemberCount,
      saveState,
      setCurrentBoardId,
      createBoard,
      updateBoardMeta,
      addCard,
      createVideoFromFlow,
      updateCard,
      setProductionStageStatus,
      updateProductionStage,
      deleteCard,
      moveCard,
      addChecklist,
      toggleChecklistItem,
      toggleLabel,
      inviteMember,
      removeMember,
      deleteBoard,
      signIn: signInWithGoogle,
      signOut: handleSignOut,
      isAuthReady
    }}>
      {children}
    </BoardContext.Provider>
  );
}

export function useBoard() {
  const context = useContext(BoardContext);
  if (context === undefined) {
    throw new Error('useBoard must be used within a BoardProvider');
  }
  return context;
}



