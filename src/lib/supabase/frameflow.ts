import { v4 as uuidv4 } from 'uuid';
import type {
  AuditEvent,
  Board,
  BoardPresenceEvent,
  BoardPresenceMember,
  Card,
  Checklist,
  Label,
  MemberRole,
  User as AppUser,
} from '../../types';
import { normalizeCardForPersistence } from '../audit';
import { mergeWorkflowConfig } from '../workflowPlans';
import { resolveBoardSeoConfig } from '../videoSeoConfig';
import { supabase } from './client';

type RealtimeUnsubscribe = () => void;
const googleAuthEnabled = String(import.meta.env.VITE_SUPABASE_GOOGLE_ENABLED ?? 'true').toLowerCase() !== 'false';
const authRedirectPath = (import.meta.env.VITE_SUPABASE_AUTH_REDIRECT_PATH ?? '/auth/callback').trim();
const authRedirectUrlOverride = import.meta.env.VITE_SUPABASE_AUTH_REDIRECT_URL?.trim();
const productionAuthRedirectUrl = 'https://jesus-frameflow.web.app/auth/callback';

const DEFAULT_LABELS: Label[] = [
  { id: 'label-red', name: 'Urgente', color: 'red' },
  { id: 'label-yellow', name: 'Esperando feedback', color: 'yellow' },
  { id: 'label-blue', name: 'En manos del editor', color: 'blue' },
  { id: 'label-green', name: 'Listo para publicar', color: 'green' },
  { id: 'label-purple', name: 'Short', color: 'purple' },
  { id: 'label-orange', name: 'Monetizado', color: 'orange' },
];

/** Keep last occurrence for each unique key value */
function dedup(rows: any[], key: string): any[] {
  const map = new Map<string, any>();
  for (const row of rows) map.set(row[key], row);
  return [...map.values()];
}

function dedupComposite(rows: any[], keys: string[]): any[] {
  const map = new Map<string, any>();
  for (const row of rows) map.set(keys.map((k) => row[k]).join('\0'), row);
  return [...map.values()];
}

function toIsoString(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function fromIsoString(value?: string | null) {
  return value || undefined;
}

function chunk<T>(items: T[], size = 100) {
  const next: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    next.push(items.slice(index, index + size));
  }
  return next;
}

function sortByPosition<T extends { position?: number | null }>(items: T[]) {
  return [...items].sort((left, right) => (left.position || 0) - (right.position || 0));
}

function parseJsonObject(value: unknown, fallback: Record<string, unknown> = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return fallback;
}

function parseJsonArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function isLocalHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

function buildSupabaseAuthRedirectUrl() {
  if (authRedirectUrlOverride) return authRedirectUrlOverride;
  if (typeof window === 'undefined') return undefined;

  try {
    const normalizedPath = authRedirectPath.startsWith('/') ? authRedirectPath : `/${authRedirectPath}`;
    return new URL(normalizedPath, window.location.origin).toString();
  } catch {
    return window.location.origin;
  }
}

function ensureString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function ensureBoolean(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function parseChecklistRows(checklistRows: any[], itemRows: any[]) {
  const itemsByChecklist = new Map<string, Array<Checklist['items'][number] & { position: number }>>();

  itemRows.forEach((row) => {
    const items = itemsByChecklist.get(row.checklist_id) || [];
    items.push({
      id: row.id,
      text: row.text,
      isCompleted: row.is_completed,
      position: row.position ?? 0,
    } as any);
    itemsByChecklist.set(row.checklist_id, items);
  });

  return sortByPosition(checklistRows).map((row) => ({
    id: row.id,
    title: row.title,
    items: sortByPosition(itemsByChecklist.get(row.id) || []).map(({ position: _position, ...item }: any) => item),
  }));
}

function buildCardFromRows(
  row: any,
  board: Pick<Board, 'id'>,
  labelsByCardId: Map<string, Label[]>,
  checklistRowsByCardId: Map<string, any[]>,
  checklistItemsByCardId: Map<string, any[]>,
  flowByCardId: Map<string, any>,
  stagesByCardId: Map<string, any[]>
): Card {
  const productionFlowRow = flowByCardId.get(row.id);
  const stageRows = sortByPosition(stagesByCardId.get(row.id) || []);
  const checklists = parseChecklistRows(
    checklistRowsByCardId.get(row.id) || [],
    checklistItemsByCardId.get(row.id) || []
  );

  const thumbnailPlan = parseJsonObject(row.thumbnail_plan);

  return normalizeCardForPersistence({
    id: row.id,
    title: row.title,
    description: row.description || '',
    listId: row.list_id,
    labels: labelsByCardId.get(row.id) || [],
    checklists,
    dueDate: fromIsoString(row.due_date) || null,
    assignee: row.assignee || null,
    titulosLinden: row.titulos_linden || '',
    gancho8s: row.gancho_8s || '',
    narrativa: row.narrativa || '',
    miniaturaChecklist: {
      rostro: ensureBoolean(parseJsonObject(row.miniatura_checklist).rostro),
      texto: ensureBoolean(parseJsonObject(row.miniatura_checklist).texto),
      contexto: ensureBoolean(parseJsonObject(row.miniatura_checklist).contexto),
    },
    thumbnailPlan: {
      status: ensureString(thumbnailPlan.status, 'pending') as any,
      concept: ensureString(thumbnailPlan.concept),
      overlayText: ensureString(thumbnailPlan.overlayText),
      assetUrl: ensureString(thumbnailPlan.assetUrl),
      generationPrompt: ensureString(thumbnailPlan.generationPrompt),
      useRealPerson: ensureBoolean(thumbnailPlan.useRealPerson),
    },
    ctr2Hours: row.ctr_2_hours || '',
    interlinking: row.interlinking || '',
    linkDrive: row.link_drive || '',
    driveLinks: parseJsonObject(row.drive_links) as Card['driveLinks'],
    guion: row.guion || '',
    contentType: row.content_type || undefined,
    keywords: row.keywords || '',
    storytelling: parseJsonObject(row.storytelling) as Card['storytelling'],
    postPublication: parseJsonObject(row.post_publication) as Card['postPublication'],
    monetization: parseJsonObject(row.monetization) as Card['monetization'],
    interlinkingTargets: parseJsonArray(row.interlinking_targets) as string[],
    shortsHook: row.shorts_hook || '',
    shortsLoop: row.shorts_loop || false,
    shortsFunnel: row.shorts_funnel || '',
    columnHistory: parseJsonArray(row.column_history) as Card['columnHistory'],
    createdAt: fromIsoString(row.created_at),
    updatedAt: fromIsoString(row.updated_at),
    productionBrief: parseJsonObject(row.production_brief) as unknown as Card['productionBrief'],
    seoSourceText: row.seo_source_text || '',
    productionFlow: productionFlowRow ? {
      templateId: productionFlowRow.template_id,
      publishAt: productionFlowRow.publish_at,
      createdFromWizardAt: productionFlowRow.created_from_wizard_at,
      currentStageId: productionFlowRow.current_stage_id,
      scheduleMode: productionFlowRow.schedule_mode,
      isTightSchedule: productionFlowRow.is_tight_schedule,
      kickoffAt: productionFlowRow.kickoff_at || undefined,
      workingDaysBudget: productionFlowRow.working_days_budget,
      workMode: productionFlowRow.work_mode,
      scheduleStatus: productionFlowRow.schedule_status,
      stages: stageRows.map((stage) => ({
        id: stage.stage_id,
        label: stage.label,
        macroColumnId: stage.macro_column_id,
        ownerRole: stage.owner_role,
        fallbackOwnerRole: stage.fallback_owner_role,
        deliverable: stage.deliverable,
        status: stage.status,
        dueAt: stage.due_at,
        completedAt: stage.completed_at || undefined,
        notes: stage.notes || undefined,
        checklistTitle: stage.checklist_title,
        hasAIDraft: stage.has_ai_draft || false,
      })),
    } : undefined,
  }, board as Board);
}

function buildBoardFromSnapshot(snapshot: {
  boardRow: any;
  memberRows: any[];
  listRows: any[];
  cardRows: any[];
  labelRows: any[];
  cardLabelRows: any[];
  checklistRows: any[];
  checklistItemRows: any[];
  productionFlowRows: any[];
  productionStageRows: any[];
}): Board {
  const boardRow = snapshot.boardRow;
  const labelsById = new Map<string, Label>(
    (snapshot.labelRows || []).map((row) => [
      row.id,
      {
        id: row.id,
        name: row.name,
        color: row.color,
      },
    ])
  );

  const labelsByCardId = new Map<string, Label[]>();
  (snapshot.cardLabelRows || []).forEach((row) => {
    const labels = labelsByCardId.get(row.card_id) || [];
    const label = labelsById.get(row.label_id);
    if (label) labels.push(label);
    labelsByCardId.set(row.card_id, labels);
  });

  const checklistRowsByCardId = new Map<string, any[]>();
  const checklistItemsByChecklistId = new Map<string, any[]>();
  const checklistItemsByCardId = new Map<string, any[]>();

  (snapshot.checklistItemRows || []).forEach((row) => {
    const items = checklistItemsByChecklistId.get(row.checklist_id) || [];
    items.push(row);
    checklistItemsByChecklistId.set(row.checklist_id, items);
  });

  (snapshot.checklistRows || []).forEach((row) => {
    const checklists = checklistRowsByCardId.get(row.card_id) || [];
    checklists.push(row);
    checklistRowsByCardId.set(row.card_id, checklists);

    const items = checklistItemsByChecklistId.get(row.id) || [];
    const current = checklistItemsByCardId.get(row.card_id) || [];
    checklistItemsByCardId.set(row.card_id, [...current, ...items]);
  });

  const flowByCardId = new Map<string, any>((snapshot.productionFlowRows || []).map((row) => [row.card_id, row]));
  const stagesByCardId = new Map<string, any[]>();
  (snapshot.productionStageRows || []).forEach((row) => {
    const stages = stagesByCardId.get(row.card_id) || [];
    stages.push(row);
    stagesByCardId.set(row.card_id, stages);
  });

  const lists = sortByPosition(snapshot.listRows || []).map((row) => ({
    id: row.id,
    title: row.title,
    cardIds: [],
  }));

  const cards: Record<string, Card> = {};
  const cardsByList = new Map<string, string[]>();
  sortByPosition(snapshot.cardRows || []).forEach((row) => {
    const card = buildCardFromRows(
      row,
      { id: boardRow.id },
      labelsByCardId,
      checklistRowsByCardId,
      checklistItemsByCardId,
      flowByCardId,
      stagesByCardId
    );
    cards[card.id] = card;
    const listCardIds = cardsByList.get(card.listId) || [];
    listCardIds.push(card.id);
    cardsByList.set(card.listId, listCardIds);
  });

  const orderedMembers = [...(snapshot.memberRows || [])]
    .sort((left, right) => {
      const leftPriority = left.role === 'owner' ? 0 : left.role === 'editor' ? 1 : 2;
      const rightPriority = right.role === 'owner' ? 0 : right.role === 'editor' ? 1 : 2;
      return leftPriority - rightPriority || left.email_lowercase.localeCompare(right.email_lowercase);
    });
  const members = orderedMembers.map((row) => row.email_lowercase);
  const memberRoles = Object.fromEntries(orderedMembers.map((row) => [row.email_lowercase, row.role])) as Record<string, MemberRole>;

  return {
    id: boardRow.id,
    title: boardRow.title,
    ownerId: boardRow.owner_id,
    members,
    memberRoles,
    lists: lists.map((list) => ({
      ...list,
      cardIds: cardsByList.get(list.id) || [],
    })),
    cards,
    createdAt: boardRow.created_at,
    updatedAt: boardRow.updated_at,
    nicheName: boardRow.niche_name || '',
    defaultContentType: boardRow.default_content_type || '',
    youtubeChannelUrl: boardRow.youtube_channel_url || '',
    descriptionPresets: parseJsonObject(boardRow.description_presets) as Record<string, string>,
    workflowConfig: mergeWorkflowConfig(parseJsonObject(boardRow.workflow_config) as unknown as Board['workflowConfig']),
    seoConfig: resolveBoardSeoConfig(parseJsonObject(boardRow.seo_config) as unknown as Board['seoConfig']),
  };
}

function boardToDb(board: Board) {
  return {
    id: board.id,
    title: board.title,
    owner_id: board.ownerId,
    niche_name: board.nicheName || null,
    default_content_type: board.defaultContentType || null,
    youtube_channel_url: board.youtubeChannelUrl || null,
    description_presets: board.descriptionPresets || {},
    workflow_config: mergeWorkflowConfig(board.workflowConfig),
    seo_config: resolveBoardSeoConfig(board.seoConfig),
    created_at: toIsoString(board.createdAt) || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function cardToDb(boardId: string, card: Card, position: number) {
  return {
    id: card.id,
    board_id: boardId,
    list_id: card.listId,
    position,
    title: card.title,
    description: card.description || '',
    due_date: toIsoString(card.dueDate),
    assignee: card.assignee || null,
    content_type: card.contentType || null,
    titulos_linden: card.titulosLinden || '',
    gancho_8s: card.gancho8s || '',
    narrativa: card.narrativa || '',
    miniatura_checklist: card.miniaturaChecklist || { rostro: false, texto: false, contexto: false },
    thumbnail_plan: card.thumbnailPlan || {},
    ctr_2_hours: card.ctr2Hours || '',
    interlinking: card.interlinking || '',
    link_drive: card.linkDrive || '',
    drive_links: card.driveLinks || {},
    guion: card.guion || '',
    keywords: card.keywords || '',
    storytelling: card.storytelling || {},
    post_publication: card.postPublication || {},
    monetization: card.monetization || {},
    interlinking_targets: card.interlinkingTargets || [],
    shorts_hook: card.shortsHook || '',
    shorts_loop: card.shortsLoop || false,
    shorts_funnel: card.shortsFunnel || '',
    column_history: card.columnHistory || [],
    production_brief: card.productionBrief || {},
    seo_source_text: card.seoSourceText || '',
    created_at: toIsoString(card.createdAt) || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

async function runDeleteIfMissing(table: string, boardId: string, ids: string[]) {
  let query = supabase.from(table as any).delete().eq('board_id', boardId);
  if (ids.length > 0) {
    query = query.not('id', 'in', `(${ids.map((id) => `"${id}"`).join(',')})`);
  }
  const { error } = await query;
  if (error) throw error;
}

async function upsertChunks(table: string, rows: any[], onConflict?: string) {
  if (!rows.length) return;
  for (const batch of chunk(rows)) {
    // Strip undefined values via JSON round-trip to avoid PostgREST column/null mismatches
    const cleanBatch = JSON.parse(JSON.stringify(batch));
    const { error } = await supabase.from(table as any).upsert(cleanBatch, {
      ...(onConflict ? { onConflict } : {}),
      defaultToNull: false,
    });
    if (error) {
      console.error(`upsert ${table} failed:`, error.message, error.details, error.hint);
      throw error;
    }
  }
}

async function insertChunks(table: string, rows: any[]) {
  if (!rows.length) return;
  for (const batch of chunk(rows)) {
    const { error } = await supabase.from(table as any).insert(batch);
    if (error) throw error;
  }
}

export async function ensureProfile(user: AppUser): Promise<void> {
  const { error } = await supabase.from('profiles').upsert({
    id: user.uid,
    email: user.email,
    email_lowercase: user.emailLowercase,
    display_name: user.displayName,
    photo_url: user.photoURL || '',
  }, { onConflict: 'id' });
  if (error) {
    console.error('ensureProfile failed:', error);
  }
}

export function mapSupabaseUserToAppUser(user: any): AppUser {
  const email = ensureString(user.email);
  return {
    uid: user.id,
    email,
    emailLowercase: normalizeEmail(email),
    displayName: ensureString(user.user_metadata?.full_name || user.user_metadata?.name, 'Usuario'),
    photoURL: ensureString(user.user_metadata?.avatar_url),
  };
}

export async function getCurrentAppUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id || !data.user.email) return null;
  return mapSupabaseUserToAppUser(data.user);
}

export function subscribeToAuthState(callback: (user: AppUser | null) => void): RealtimeUnsubscribe {
  let currentUid: string | null = null;
  let hasEmitted = false;

  const emit = (user: AppUser | null) => {
    const nextUid = user?.uid ?? null;
    if (hasEmitted && nextUid === currentUid) return;
    hasEmitted = true;
    currentUid = nextUid;
    callback(user);
  };

  supabase.auth.getUser().then(({ data }) => {
    emit(data.user ? mapSupabaseUserToAppUser(data.user) : null);
  }).catch(() => emit(null));

  const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
    emit(session?.user ? mapSupabaseUserToAppUser(session.user) : null);
  });

  return () => {
    authListener.subscription.unsubscribe();
  };
}

export async function signInWithGoogle() {
  if (!googleAuthEnabled) {
    throw new Error('Google login sigue desactivado en Supabase Pos. Activalo en Auth > Providers > Google y luego cambia VITE_SUPABASE_GOOGLE_ENABLED a true.');
  }
  const redirectTo = buildSupabaseAuthRedirectUrl();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });
  if (error) {
    const message = error.message || '';
    if (/unsupported provider|provider is not enabled/i.test(message)) {
      throw new Error('Google login no esta habilitado todavia en el proyecto Supabase Pos. Hay que activarlo en Auth > Providers > Google con su client ID y client secret.');
    }
    throw error;
  }
}

export async function signOutFromSupabase() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function fetchBoardSnapshot(boardId: string) {
  const { data: boardRow, error: boardError } = await supabase.from('boards').select('*').eq('id', boardId).maybeSingle();
  if (boardError) throw boardError;
  if (!boardRow) return null;

  const { data: memberRows, error: memberError } = await supabase.from('board_members').select('*').eq('board_id', boardId);
  if (memberError) throw memberError;
  const { data: listRows, error: listError } = await supabase.from('lists').select('*').eq('board_id', boardId).order('position');
  if (listError) throw listError;
  const { data: cardRows, error: cardError } = await supabase.from('cards').select('*').eq('board_id', boardId).order('position');
  if (cardError) throw cardError;
  const cardIds = (cardRows || []).map((row) => row.id);

  const [
    labelResult,
    cardLabelResult,
    checklistResult,
    flowResult,
    stageResult,
  ] = await Promise.all([
    supabase.from('labels').select('*').eq('board_id', boardId),
    supabase.from('card_labels').select('*').eq('board_id', boardId),
    cardIds.length
      ? supabase.from('checklists').select('*').in('card_id', cardIds).order('position')
      : Promise.resolve({ data: [], error: null }),
    cardIds.length
      ? supabase.from('production_flows').select('*').in('card_id', cardIds)
      : Promise.resolve({ data: [], error: null }),
    cardIds.length
      ? supabase.from('production_stages').select('*').in('card_id', cardIds).order('position')
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (labelResult.error) throw labelResult.error;
  if (cardLabelResult.error) throw cardLabelResult.error;
  if (checklistResult.error) throw checklistResult.error;
  if (flowResult.error) throw flowResult.error;
  if (stageResult.error) throw stageResult.error;

  const checklistIds = (checklistResult.data || []).map((row) => row.id);
  const { data: checklistItemRows, error: checklistItemError } = checklistIds.length
    ? await supabase.from('checklist_items').select('*').in('checklist_id', checklistIds).order('position')
    : { data: [], error: null };
  if (checklistItemError) throw checklistItemError;

  return buildBoardFromSnapshot({
    boardRow,
    memberRows: memberRows || [],
    listRows: listRows || [],
    cardRows: cardRows || [],
    labelRows: labelResult.data || [],
    cardLabelRows: cardLabelResult.data || [],
    checklistRows: checklistResult.data || [],
    checklistItemRows: checklistItemRows || [],
    productionFlowRows: flowResult.data || [],
    productionStageRows: stageResult.data || [],
  });
}

export async function listBoardsForUser(user: AppUser) {
  const { data, error } = await supabase
    .from('board_members')
    .select('board_id')
    .eq('user_id', user.uid);

  if (error) throw error;
  const boardIds = [...new Set((data || []).map((row) => row.board_id).filter(Boolean))];
  const boards = await Promise.all(boardIds.map((boardId) => fetchBoardSnapshot(boardId)));
  return boards.filter((board): board is Board => !!board);
}

export function subscribeBoardsForUser(user: AppUser, callback: (boards: Board[]) => void, onError?: (error: unknown) => void): RealtimeUnsubscribe {
  let disposed = false;

  const refresh = async () => {
    try {
      const boards = await listBoardsForUser(user);
      if (!disposed) callback(boards);
    } catch (error) {
      if (!disposed) onError?.(error);
    }
  };

  void refresh();

  const channel = supabase
    .channel(`ff-board-members:${user.uid}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'board_members',
      filter: `user_id=eq.${user.uid}`,
    }, () => void refresh())
    .subscribe();

  return () => {
    disposed = true;
    void supabase.removeChannel(channel);
  };
}

export function subscribeBoardSnapshot(boardId: string, callback: (board: Board | null) => void, onError?: (error: unknown) => void): RealtimeUnsubscribe {
  let disposed = false;

  const refresh = async () => {
    try {
      const board = await fetchBoardSnapshot(boardId);
      if (!disposed) callback(board);
    } catch (error) {
      if (!disposed) onError?.(error);
    }
  };

  void refresh();

  const channel = supabase.channel(`ff-board:${boardId}`);
  ['boards', 'lists', 'cards', 'board_members', 'labels', 'card_labels', 'production_flows', 'production_stages'].forEach((table) => {
    channel.on('postgres_changes', {
      event: '*',
      schema: 'public',
      table,
      filter: `board_id=eq.${boardId}`,
    }, () => void refresh());
  });
  channel.subscribe();

  return () => {
    disposed = true;
    void supabase.removeChannel(channel);
  };
}

export async function createBoardRecord(board: Board) {
  const { error } = await supabase.from('boards').insert(boardToDb(board));
  if (error) throw error;

  await upsertChunks('lists', board.lists.map((list, index) => ({
    id: list.id,
    board_id: board.id,
    title: list.title,
    position: index,
    created_at: board.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })), 'id');

  if (!board.cards || Object.keys(board.cards).length === 0) return;
  await saveBoardSnapshot(board);
}

export async function updateBoardMeta(boardId: string, updates: Partial<Board>) {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (updates.title !== undefined) payload.title = updates.title;
  if (updates.nicheName !== undefined) payload.niche_name = updates.nicheName;
  if (updates.defaultContentType !== undefined) payload.default_content_type = updates.defaultContentType || null;
  if (updates.youtubeChannelUrl !== undefined) payload.youtube_channel_url = updates.youtubeChannelUrl || null;
  if (updates.descriptionPresets !== undefined) payload.description_presets = updates.descriptionPresets || {};
  if (updates.workflowConfig !== undefined) payload.workflow_config = mergeWorkflowConfig(updates.workflowConfig);
  if (updates.seoConfig !== undefined) payload.seo_config = resolveBoardSeoConfig(updates.seoConfig);

  const { error } = await supabase.from('boards').update(payload).eq('id', boardId);
  if (error) throw error;
}

export async function saveBoardSnapshot(board: Board, auditEvents: AuditEvent[] = []) {
  const normalizedBoard = {
    ...board,
    workflowConfig: mergeWorkflowConfig(board.workflowConfig),
    seoConfig: resolveBoardSeoConfig(board.seoConfig),
  };

  const listRows = normalizedBoard.lists.map((list, index) => ({
    id: list.id,
    board_id: normalizedBoard.id,
    title: list.title,
    position: index,
    created_at: normalizedBoard.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  const cardRows: any[] = [];
  const cardLabelRows: any[] = [];
  const checklistRows: any[] = [];
  const checklistItemRows: any[] = [];
  const productionFlowRows: any[] = [];
  const productionStageRows: any[] = [];

  normalizedBoard.lists.forEach((list) => {
    list.cardIds.forEach((cardId, position) => {
      const sourceCard = normalizedBoard.cards[cardId];
      if (!sourceCard) return;

      const card = normalizeCardForPersistence({ ...sourceCard, listId: list.id }, normalizedBoard);
      cardRows.push(cardToDb(normalizedBoard.id, card, position));

      (card.labels || []).forEach((label) => {
        cardLabelRows.push({
          board_id: normalizedBoard.id,
          card_id: card.id,
          label_id: label.id,
        });
      });

      (card.checklists || []).forEach((checklist, checklistPosition) => {
        checklistRows.push({
          id: checklist.id,
          card_id: card.id,
          title: checklist.title,
          position: checklistPosition,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        checklist.items.forEach((item, itemPosition) => {
          checklistItemRows.push({
            id: item.id,
            checklist_id: checklist.id,
            text: item.text,
            is_completed: item.isCompleted,
            position: itemPosition,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        });
      });

      if (card.productionFlow) {
        const pf = card.productionFlow;
        const now = new Date().toISOString();
        productionFlowRows.push({
          card_id: card.id,
          template_id: pf.templateId || 'default',
          publish_at: pf.publishAt || now,
          created_from_wizard_at: pf.createdFromWizardAt || now,
          current_stage_id: pf.currentStageId || '',
          schedule_mode: pf.scheduleMode || 'auto',
          is_tight_schedule: pf.isTightSchedule ?? false,
          kickoff_at: toIsoString(pf.kickoffAt),
          working_days_budget: pf.workingDaysBudget ?? 0,
          work_mode: pf.workMode || 'solo',
          schedule_status: pf.scheduleStatus || 'on_track',
          raw: JSON.parse(JSON.stringify(pf)),
          created_at: now,
          updated_at: now,
        });

        card.productionFlow.stages.forEach((stage, stagePosition) => {
          productionStageRows.push({
            card_id: card.id,
            stage_id: stage.id,
            label: stage.label,
            macro_column_id: stage.macroColumnId,
            owner_role: stage.ownerRole,
            fallback_owner_role: stage.fallbackOwnerRole,
            deliverable: stage.deliverable,
            status: stage.status,
            due_at: stage.dueAt,
            completed_at: toIsoString(stage.completedAt),
            notes: stage.notes || null,
            checklist_title: stage.checklistTitle,
            has_ai_draft: stage.hasAIDraft || false,
            position: stagePosition,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        });
      }
    });
  });

  const listIds = listRows.map((row) => row.id);
  const cardIds = cardRows.map((row) => row.id);

  const { error: boardError } = await supabase.from('boards').upsert(boardToDb(normalizedBoard));
  if (boardError) throw boardError;

  if (listIds.length > 0) {
    await runDeleteIfMissing('lists', normalizedBoard.id, listIds);
  }
  if (cardIds.length > 0) {
    await runDeleteIfMissing('cards', normalizedBoard.id, cardIds);
  }

  await upsertChunks('lists', listRows, 'id');
  await upsertChunks('cards', cardRows, 'id');

  if (cardIds.length > 0) {
    const [{ error: cardLabelsError }, { error: checklistError }, { error: flowError }] = await Promise.all([
      supabase.from('card_labels').delete().eq('board_id', normalizedBoard.id).in('card_id', cardIds),
      supabase.from('checklists').delete().in('card_id', cardIds),
      supabase.from('production_flows').delete().in('card_id', cardIds),
    ]);
    if (cardLabelsError) throw cardLabelsError;
    if (checklistError) throw checklistError;
    if (flowError) throw flowError;
  }

  await insertChunks('card_labels', cardLabelRows);
  await upsertChunks('checklists', dedup(checklistRows, 'id'), 'id');
  await upsertChunks('checklist_items', dedup(checklistItemRows, 'id'), 'id');
  await upsertChunks('production_flows', dedup(productionFlowRows, 'card_id'), 'card_id');
  await upsertChunks('production_stages', dedupComposite(productionStageRows, ['card_id', 'stage_id']), 'card_id,stage_id');

  if (auditEvents.length > 0) {
    await upsertChunks('audit_events', auditEvents.map((event) => ({
      id: event.id,
      board_id: event.boardId,
      card_id: event.cardId || null,
      actor_email: event.actorEmail,
      type: event.type,
      at: event.at,
      from_list_id: event.fromListId || null,
      to_list_id: event.toListId || null,
      payload: event.payload || {},
    })), 'id');
  }
}

export async function inviteBoardMember(
  boardId: string,
  email: string,
  role: Exclude<MemberRole, 'owner'>,
  inviterUserId: string,
  boardTitle: string,
) {
  const normalizedEmail = normalizeEmail(email);
  const { data: rows, error: profileError } = await supabase
    .rpc('lookup_profile_by_email', { target_email: normalizedEmail });

  if (profileError) throw profileError;
  const profile = rows?.[0] ?? null;

  if (profile) {
    // User already has an account — add them directly
    const { error } = await supabase.from('board_members').upsert({
      board_id: boardId,
      user_id: profile.id,
      email_lowercase: normalizedEmail,
      role,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'board_id,user_id' });
    if (error) throw error;
    return { ok: true as const };
  }

  // User doesn't have an account yet — create a pending invitation
  // Check if a pending invite already exists
  const { data: existing } = await supabase.from('invitations')
    .select('id')
    .eq('board_id', boardId)
    .eq('invitee_email_lowercase', normalizedEmail)
    .eq('status', 'pending')
    .maybeSingle();

  if (existing) {
    return { ok: true as const, pending: true };
  }

  const { error: inviteError } = await supabase.from('invitations').insert({
    board_id: boardId,
    board_title_snapshot: boardTitle,
    invitee_email_lowercase: normalizedEmail,
    inviter_user_id: inviterUserId,
    role,
    status: 'pending',
  });

  if (inviteError) throw inviteError;
  return { ok: true as const, pending: true };
}

export async function acceptPendingInvitations(userId: string, email: string) {
  const normalizedEmail = normalizeEmail(email);

  const { data: pending, error: fetchError } = await supabase
    .from('invitations')
    .select('id, board_id, role')
    .eq('invitee_email_lowercase', normalizedEmail)
    .eq('status', 'pending');

  if (fetchError || !pending?.length) return;

  for (const invite of pending) {
    const { error: memberError } = await supabase.from('board_members').upsert({
      board_id: invite.board_id,
      user_id: userId,
      email_lowercase: normalizedEmail,
      role: invite.role,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'board_id,user_id' });

    if (!memberError) {
      await supabase.from('invitations').update({
        status: 'accepted',
        responded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', invite.id);
    }
  }
}

export async function removeBoardMember(boardId: string, email: string) {
  const normalizedEmail = normalizeEmail(email);
  const { error } = await supabase
    .from('board_members')
    .delete()
    .eq('board_id', boardId)
    .eq('email_lowercase', normalizedEmail);
  if (error) throw error;
}

export async function deleteBoardRecord(boardId: string) {
  const { error } = await supabase.from('boards').delete().eq('id', boardId);
  if (error) throw error;
}

export async function listPresenceMembers(boardId: string) {
  const { data, error } = await supabase
    .from('board_online_members')
    .select('*')
    .eq('board_id', boardId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => ({
    emailLowercase: row.email_lowercase,
    displayName: row.display_name,
    photoURL: row.photo_url,
    state: 'online',
    isOnline: true,
    isActiveInThisBoard: true,
    activeSurface: row.active_surface || null,
    lastHeartbeatAt: row.last_heartbeat_at,
    lastSeenAt: row.updated_at,
    enteredAt: row.entered_at,
    sessionCount: 1,
    updatedAt: row.updated_at,
  } satisfies BoardPresenceMember));
}

export async function listPresenceEvents(boardId: string) {
  const { data, error } = await supabase
    .from('presence_events')
    .select('*')
    .eq('board_id', boardId)
    .order('at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id,
    boardId: row.board_id,
    emailLowercase: row.email_lowercase,
    displayName: row.display_name,
    photoURL: row.photo_url,
    type: row.type,
    surface: row.surface || null,
    at: row.at,
  } satisfies BoardPresenceEvent));
}

export function subscribePresence(boardId: string, callback: (payload: { members: BoardPresenceMember[]; events: BoardPresenceEvent[] }) => void, onError?: (error: unknown) => void): RealtimeUnsubscribe {
  let disposed = false;

  const refresh = async () => {
    try {
      const [members, events] = await Promise.all([listPresenceMembers(boardId), listPresenceEvents(boardId)]);
      if (!disposed) callback({ members, events });
    } catch (error) {
      if (!disposed) onError?.(error);
    }
  };

  void refresh();

  const channel = supabase.channel(`ff-presence:${boardId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'presence_sessions',
      filter: `board_id=eq.${boardId}`,
    }, () => void refresh())
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'presence_events',
      filter: `board_id=eq.${boardId}`,
    }, () => void refresh())
    .subscribe();

  return () => {
    disposed = true;
    void supabase.removeChannel(channel);
  };
}

export async function upsertPresenceSession(payload: {
  id: string;
  boardId: string;
  user: AppUser;
  surface: string | null;
  enteredAt?: string;
  isOnline: boolean;
}) {
  const { error } = await supabase.from('presence_sessions').upsert({
    id: payload.id,
    board_id: payload.boardId,
    user_id: payload.user.uid,
    email_lowercase: payload.user.emailLowercase,
    display_name: payload.user.displayName || '',
    photo_url: payload.user.photoURL || '',
    active_surface: payload.surface,
    is_online: payload.isOnline,
    last_heartbeat_at: new Date().toISOString(),
    entered_at: payload.enteredAt || new Date().toISOString(),
    left_at: payload.isOnline ? null : new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  if (error) throw error;
}

export async function appendPresenceEvent(payload: {
  boardId: string;
  user: AppUser;
  type: string;
  surface: string | null;
}) {
  const { error } = await supabase.from('presence_events').insert({
    board_id: payload.boardId,
    user_id: payload.user.uid,
    email_lowercase: payload.user.emailLowercase,
    display_name: payload.user.displayName || '',
    photo_url: payload.user.photoURL || '',
    type: payload.type,
    surface: payload.surface,
    at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function deletePresenceSession(sessionId: string) {
  const { error } = await supabase.from('presence_sessions').delete().eq('id', sessionId);
  if (error) throw error;
}

/** Remove all previous sessions for this user (stale tabs, unreliable unload, etc.) */
export async function cleanupStaleSessions(userId: string, keepSessionId?: string) {
  let query = supabase.from('presence_sessions').delete().eq('user_id', userId);
  if (keepSessionId) {
    query = query.neq('id', keepSessionId);
  }
  await query;
}

export async function fetchAuditEvents(boardId: string) {
  const { data, error } = await supabase
    .from('audit_events')
    .select('*')
    .eq('board_id', boardId)
    .order('at', { ascending: false })
    .limit(40);
  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id,
    boardId: row.board_id,
    cardId: row.card_id || undefined,
    actorEmail: row.actor_email,
    type: row.type,
    at: row.at,
    fromListId: row.from_list_id || undefined,
    toListId: row.to_list_id || undefined,
    payload: parseJsonObject(row.payload),
  } satisfies AuditEvent));
}

export function subscribeAuditEvents(boardId: string, callback: (events: AuditEvent[]) => void, onError?: (error: unknown) => void): RealtimeUnsubscribe {
  let disposed = false;

  const refresh = async () => {
    try {
      const events = await fetchAuditEvents(boardId);
      if (!disposed) callback(events);
    } catch (error) {
      if (!disposed) onError?.(error);
    }
  };

  void refresh();

  const channel = supabase.channel(`ff-audit:${boardId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'audit_events',
      filter: `board_id=eq.${boardId}`,
    }, () => void refresh())
    .subscribe();

  return () => {
    disposed = true;
    void supabase.removeChannel(channel);
  };
}

export function getBackendReadNotice(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  if (/jwt|auth session missing|not authenticated/i.test(message)) {
    return 'Tu sesion en Supabase ya no es valida. Vuelve a entrar con Google para continuar.';
  }
  if (/permission|row-level|rls/i.test(message)) {
    return 'Supabase rechazo esta operacion por permisos. Revisa tu rol o vuelve a cargar el tablero.';
  }
  if (/network|fetch failed|failed to fetch|timeout/i.test(message)) {
    return 'Supabase no respondio a tiempo. FrameFlow seguira usando la ultima copia local mientras recupera la conexion.';
  }
  return null;
}

export function buildInitialBoard(user: AppUser, title: string): Board {
  const now = new Date().toISOString();
  return {
    id: `board-${uuidv4()}`,
    title,
    ownerId: user.uid,
    members: [user.emailLowercase],
    memberRoles: {
      [user.emailLowercase]: 'owner',
    },
    lists: [
      { id: 'list-1', title: 'Ideas (Oceano Azul)', cardIds: [] },
      { id: 'list-2', title: 'Titulos (Metodo Linden)', cardIds: [] },
      { id: 'list-3', title: 'Guion (Gancho 8s)', cardIds: [] },
      { id: 'list-4', title: 'Miniaturas (CTR Alto)', cardIds: [] },
      { id: 'list-5', title: 'Edicion (Retencion)', cardIds: [] },
      { id: 'list-6', title: 'Publicacion (Interlinking)', cardIds: [] },
      { id: 'list-7', title: 'Ataque al Corazon (<24h)', cardIds: [] },
    ],
    cards: {},
    workflowConfig: mergeWorkflowConfig(),
    seoConfig: resolveBoardSeoConfig(),
    descriptionPresets: {},
    createdAt: now,
    updatedAt: now,
  };
}
