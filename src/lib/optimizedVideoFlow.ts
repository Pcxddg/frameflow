import {
  AuditRole,
  Board,
  Card,
  Checklist,
  CreateVideoFromFlowInput,
  ProductionBrief,
  ProductionFlow,
  ProductionScheduleStatus,
  ProductionStage,
  ProductionStageId,
  ProductionStageStatus,
  ProductionWorkMode,
  WorkflowConfig,
} from '../types';

type MacroColumnKey =
  | 'ideas'
  | 'titles'
  | 'script'
  | 'recording'
  | 'editing'
  | 'publishing'
  | 'followup';

interface StageDefinition {
  id: ProductionStageId;
  label: string;
  checklistTitle: string;
  deliverable: string;
  macroColumnKey: MacroColumnKey;
  primaryOwnerRole: AuditRole;
  offsetMs: number;
  checklistItems: (input: CreateVideoFromFlowInput) => string[];
}

export interface BuiltOptimizedVideoFlow {
  productionBrief: ProductionBrief;
  productionFlow: ProductionFlow;
  checklists: Checklist[];
  suggestedListId: string;
  derivedAssignee: string;
  dueDate: string;
  contentType: 'long' | 'short';
  seededTitles: string;
}

export interface ProductionFlowSummary {
  currentStage: ProductionStage | null;
  nextStage: ProductionStage | null;
  completedCount: number;
  totalCount: number;
  overdueStages: ProductionStage[];
  blockedStages: ProductionStage[];
  aiSeededOpenStages: ProductionStage[];
  isComplete: boolean;
  isColumnMismatch: boolean;
  expectedColumnId: string | null;
  expectedColumnTitle: string | null;
  isTightSchedule: boolean;
  scheduleStatus: ProductionScheduleStatus;
  workingDaysElapsed: number;
  workingDaysBudget: number;
  isExtraActive: boolean;
  isAtRisk: boolean;
  isOverdueByBudget: boolean;
  isKickoffPending: boolean;
  isStageObjectiveLate: boolean;
}

export interface GuideChecklistProgress {
  checklist: Checklist | null;
  completedCount: number;
  totalCount: number;
  pendingItems: string[];
  percentage: number;
}

export type VideoExecutionReadinessStatus = 'ready' | 'pending' | 'warning';

export interface VideoExecutionReadinessItem {
  id: 'title' | 'thumbnail' | 'description' | 'script' | 'production' | 'publish';
  label: string;
  status: VideoExecutionReadinessStatus;
  detail: string;
}

export interface VideoExecutionNotice {
  id: string;
  tone: 'danger' | 'warning' | 'info';
  title: string;
  body: string;
}

export interface VideoExecutionSnapshot {
  currentStage: ProductionStage | null;
  nextStage: ProductionStage | null;
  checklistProgress: GuideChecklistProgress;
  pendingChecklistPreview: string[];
  currentColumnTitle: string;
  expectedColumnTitle: string | null;
  currentStageLabel: string;
  currentStageStatusLabel: string;
  nextActionLabel: string;
  nextActionDetail: string;
  responsibleLabel: string;
  sourceUsed: 'seoSourceText' | 'guion' | 'brief';
  hasSeededPackage: boolean;
  notices: VideoExecutionNotice[];
  readiness: VideoExecutionReadinessItem[];
}

export type GuideAlertSeverity = 'critical' | 'warning' | 'info';

export interface GuideFocusCard {
  card: Card;
  summary: ProductionFlowSummary;
  currentStage: ProductionStage;
  nextStage: ProductionStage | null;
  checklistProgress: GuideChecklistProgress;
  execution: VideoExecutionSnapshot;
  currentColumnTitle: string;
  priorityRank: number;
  priorityScore: number;
  dueAt: string;
  publishAt: string;
  hasDraftPending: boolean;
}

export interface GuideTask {
  id: string;
  cardId: string;
  cardTitle: string;
  role: AuditRole;
  stageId: ProductionStageId;
  stageLabel: string;
  deliverable: string;
  dueAt: string;
  publishAt: string;
  status: ProductionStageStatus;
  checklistTitle: string;
  checklistProgress: GuideChecklistProgress;
  hasDraftPending: boolean;
  isBlocked: boolean;
  isOverdue: boolean;
  isAtRisk: boolean;
  isKickoffPending: boolean;
  isColumnMismatch: boolean;
  scheduleStatus: ProductionScheduleStatus;
  workingDaysElapsed: number;
  workingDaysBudget: number;
  workMode: ProductionWorkMode;
  expectedColumnId: string | null;
  expectedColumnTitle: string | null;
  currentColumnId: string;
  currentColumnTitle: string;
}

export interface GuideAlert {
  id: string;
  severity: GuideAlertSeverity;
  cardId: string;
  cardTitle: string;
  role: AuditRole;
  stageId: ProductionStageId;
  stageLabel: string;
  title: string;
  description: string;
  dueAt: string;
}

export interface GuideSyncSnapshot {
  focusCards: GuideFocusCard[];
  extraFocusCards: GuideFocusCard[];
  tasksByRole: Record<AuditRole, GuideTask[]>;
  extraTasksByRole: Record<AuditRole, GuideTask[]>;
  alerts: GuideAlert[];
  alertCounts: Record<GuideAlertSeverity, number>;
  selectedCardIds: string[];
  autoSelectedCardIds: string[];
  hasManualOverride: boolean;
  availableCards: Card[];
  blockedCount: number;
  overdueCount: number;
  publishReadyCount: number;
  aiValidationCount: number;
}

export const OPTIMIZED_VIDEO_TEMPLATE_ID = 'optimized_publish_v1';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const DEFAULT_WORKING_DAYS_BUDGET = 5;

export const OPTIMIZED_STAGE_ORDER: ProductionStageId[] = [
  'idea',
  'research',
  'title_hook',
  'script',
  'preproduction',
  'recording',
  'editing_v1',
  'review_feedback',
  'thumbnail_seo',
  'upload_schedule',
  'publish_followup',
  'recycle_shorts',
];

const MACRO_COLUMN_MATCHERS: Record<MacroColumnKey, { fallbackIndex: number; patterns: string[] }> = {
  ideas: { fallbackIndex: 0, patterns: ['idea', 'oceano'] },
  titles: { fallbackIndex: 1, patterns: ['titulo', 'linden'] },
  script: { fallbackIndex: 2, patterns: ['guion', 'gancho'] },
  recording: { fallbackIndex: 3, patterns: ['miniatura', 'ctr'] },
  editing: { fallbackIndex: 4, patterns: ['edicion', 'retencion'] },
  publishing: { fallbackIndex: 5, patterns: ['publicacion', 'interlinking'] },
  followup: { fallbackIndex: 6, patterns: ['ataque', 'corazon'] },
};

const STAGE_DEFINITIONS: StageDefinition[] = [
  {
    id: 'idea',
    label: 'Idea aprobada',
    checklistTitle: 'Etapa 1 · Idea aprobada',
    deliverable: 'Idea, audiencia, pregunta y promesa definidas.',
    macroColumnKey: 'ideas',
    primaryOwnerRole: 'creador',
    offsetMs: -10 * DAY_MS,
    checklistItems: (input) => [
      `Escribir la idea principal del video: ${input.idea}`,
      `Definir la pregunta exacta que respondera el video${input.question ? `: ${input.question}` : '.'}`,
      `Definir la audiencia objetivo${input.audience ? `: ${input.audience}` : '.'}`,
      `Definir la promesa del video${input.promise ? `: ${input.promise}` : '.'}`,
      `Elegir el tono${input.tone ? `: ${input.tone}` : '.'}`,
    ],
  },
  {
    id: 'research',
    label: 'Investigacion lista',
    checklistTitle: 'Etapa 2 · Investigacion',
    deliverable: 'Fuentes, comparativas y recursos listos para guion.',
    macroColumnKey: 'ideas',
    primaryOwnerRole: 'editor',
    offsetMs: -8 * DAY_MS,
    checklistItems: () => [
      'Definir que datos sostienen la idea.',
      'Preparar comparativas, referencias y ejemplos.',
      'Ordenar enlaces, capturas y fuentes con nombres claros.',
      'Redactar un resumen breve de investigacion.',
    ],
  },
  {
    id: 'title_hook',
    label: 'Titulo y hook aprobados',
    checklistTitle: 'Etapa 3 · Titulo y hook',
    deliverable: 'Top titulos + hook inicial aprobados.',
    macroColumnKey: 'titles',
    primaryOwnerRole: 'creador',
    offsetMs: -7 * DAY_MS,
    checklistItems: () => [
      'Escribir entre 10 y 20 titulos.',
      'Elegir las 3 mejores opciones.',
      'Escribir un hook de 5 a 10 segundos.',
      'Definir la primera frase exacta del video.',
    ],
  },
  {
    id: 'script',
    label: 'Guion listo',
    checklistTitle: 'Etapa 4 · Guion',
    deliverable: 'Escaleta o guion completo con bloques claros.',
    macroColumnKey: 'script',
    primaryOwnerRole: 'creador',
    offsetMs: -6 * DAY_MS,
    checklistItems: () => [
      'Definir introduccion, contexto, comparacion, giro y cierre.',
      'Escribir el guion completo o escaleta detallada.',
      'Marcar pruebas visuales, imagenes y ejemplos.',
      'Revisar si sostiene curiosidad cada 20-30 segundos.',
    ],
  },
  {
    id: 'preproduction',
    label: 'Preproduccion lista',
    checklistTitle: 'Etapa 5 · Preproduccion',
    deliverable: 'Proyecto, assets y setup listos para grabar.',
    macroColumnKey: 'script',
    primaryOwnerRole: 'asistente',
    offsetMs: -4 * DAY_MS,
    checklistItems: () => [
      'Confirmar equipo, encuadre, fondo y audio.',
      'Preparar carpetas A-roll, B-roll, musica, SFX e imagenes.',
      'Verificar nombres de archivos y estructura del proyecto.',
      'Dejar descripcion base y publicacion preparadas.',
    ],
  },
  {
    id: 'recording',
    label: 'Grabacion hecha',
    checklistTitle: 'Etapa 6 · Grabacion',
    deliverable: 'Brutos grabados y respaldados.',
    macroColumnKey: 'recording',
    primaryOwnerRole: 'creador',
    offsetMs: -3 * DAY_MS,
    checklistItems: () => [
      'Grabar intro, cuerpo principal y variantes del hook.',
      'Repetir partes debiles durante la sesion.',
      'Confirmar que el audio quedo limpio.',
      'Respaldar archivos y marcar material listo para edicion.',
    ],
  },
  {
    id: 'editing_v1',
    label: 'Edicion V1 lista',
    checklistTitle: 'Etapa 7 · Edicion V1',
    deliverable: 'Version 1 exportada y lista para feedback.',
    macroColumnKey: 'editing',
    primaryOwnerRole: 'editor',
    offsetMs: -2 * DAY_MS,
    checklistItems: () => [
      'Importar material y hacer primer corte limpio.',
      'Eliminar silencios, muletillas y partes flojas.',
      'Mantener ritmo fuerte desde los primeros 30 segundos.',
      'Agregar B-roll, textos y apoyos visuales base.',
    ],
  },
  {
    id: 'review_feedback',
    label: 'Revision final hecha',
    checklistTitle: 'Etapa 8 · Revision y feedback',
    deliverable: 'Feedback accionable aplicado o aprobacion final.',
    macroColumnKey: 'editing',
    primaryOwnerRole: 'creador',
    offsetMs: -1 * DAY_MS,
    checklistItems: () => [
      'Ver el video completo sin editar mentalmente.',
      'Anotar solo cambios importantes de ritmo, claridad y errores.',
      'Separar cambios obligatorios y opcionales.',
      'Preparar V2 o version final.',
    ],
  },
  {
    id: 'thumbnail_seo',
    label: 'Miniatura y SEO listos',
    checklistTitle: 'Etapa 9 · Miniatura y SEO',
    deliverable: 'Miniatura final, descripcion y capitulos listos.',
    macroColumnKey: 'publishing',
    primaryOwnerRole: 'asistente',
    offsetMs: -18 * HOUR_MS,
    checklistItems: () => [
      'Crear 2 o 3 versiones de miniatura y elegir una.',
      'Asegurar contraste, lectura rapida y coherencia con el titulo.',
      'Redactar descripcion base, capitulos y tags.',
      'Verificar que el SEO coincide con el titulo final.',
    ],
  },
  {
    id: 'upload_schedule',
    label: 'Video subido o programado',
    checklistTitle: 'Etapa 10 · Subida y programacion',
    deliverable: 'Video cargado con metadata, playlist y visibilidad correctas.',
    macroColumnKey: 'publishing',
    primaryOwnerRole: 'asistente',
    offsetMs: -6 * HOUR_MS,
    checklistItems: () => [
      'Subir video a YouTube.',
      'Agregar miniatura, pantallas finales y tarjetas.',
      'Revisar visibilidad, categoria, idioma y playlist.',
      'Confirmar hora de publicacion o programacion.',
    ],
  },
  {
    id: 'publish_followup',
    label: 'Publicado y monitoreado',
    checklistTitle: 'Etapa 11 · Publicacion',
    deliverable: 'Publicacion hecha y metricas tempranas registradas.',
    macroColumnKey: 'followup',
    primaryOwnerRole: 'creador',
    offsetMs: 0,
    checklistItems: () => [
      'Publicar o programar el video.',
      'Verificar que todo salio correcto.',
      'Registrar CTR, retencion y views iniciales.',
      'Definir si hace falta reaccion temprana.',
    ],
  },
  {
    id: 'recycle_shorts',
    label: 'Reciclaje a shorts',
    checklistTitle: 'Etapa 12 · Reciclaje',
    deliverable: 'Shorts derivados creados o planificados.',
    macroColumnKey: 'followup',
    primaryOwnerRole: 'editor',
    offsetMs: 1 * DAY_MS,
    checklistItems: () => [
      'Cortar entre 1 y 3 clips o shorts del video.',
      'Preparar versiones para redes o anotar su plan.',
      'Crear tarea derivada de reciclaje del contenido.',
      'Registrar que el reciclaje quedo resuelto.',
    ],
  },
];

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function createChecklistId(stageId: ProductionStageId) {
  return `flow-stage-${stageId}`;
}

export function getAuditRoleLabel(role: AuditRole) {
  if (role === 'creador') return 'Creador';
  if (role === 'editor') return 'Editor';
  return 'Asistente';
}

export function getDerivedAssigneeLabel(role: AuditRole) {
  return getAuditRoleLabel(role);
}

export function resolveProductionStageOwner(role: AuditRole, workflowRoles: AuditRole[]) {
  if (workflowRoles.includes(role)) return role;
  if (role === 'editor') return 'creador';
  if (role === 'asistente') return workflowRoles.includes('editor') ? 'editor' : 'creador';
  return 'creador';
}

export function resolveProductionStageFallback(role: AuditRole, workflowRoles: AuditRole[]) {
  if (role === 'editor') return 'creador';
  if (role === 'asistente') return workflowRoles.includes('editor') ? 'editor' : 'creador';
  return 'creador';
}

function resolveMacroColumnId(board: Board, macroColumnKey: MacroColumnKey) {
  const matcher = MACRO_COLUMN_MATCHERS[macroColumnKey];
  const match = board.lists.find((list) => {
    const normalizedTitle = normalizeText(list.title);
    return matcher.patterns.some((pattern) => normalizedTitle.includes(pattern));
  });

  return match?.id || board.lists[matcher.fallbackIndex]?.id || board.lists[0]?.id || '';
}

function resolveMacroColumnTitle(board: Board, macroColumnId: string | null) {
  if (!macroColumnId) return null;
  return board.lists.find((list) => list.id === macroColumnId)?.title || null;
}

function buildChecklist(stageId: ProductionStageId, title: string, items: string[]): Checklist {
  return {
    id: createChecklistId(stageId),
    title,
    items: items.map((text, index) => ({
      id: `${createChecklistId(stageId)}-item-${index + 1}`,
      text,
      isCompleted: false,
    })),
  };
}

function clampStageDueAt(timestamp: number, nowMs: number) {
  if (timestamp >= nowMs) {
    return { dueAt: new Date(timestamp).toISOString(), wasClamped: false };
  }

  return { dueAt: new Date(nowMs).toISOString(), wasClamped: true };
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isBusinessDay(date: Date) {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

function parseDateSafe(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function resolveSafeIsoDate(
  value?: string | null,
  fallback?: string | null,
  nowIso = new Date().toISOString()
) {
  const parsed = parseDateSafe(value);
  if (parsed) return parsed.toISOString();

  const fallbackParsed = parseDateSafe(fallback);
  if (fallbackParsed) return fallbackParsed.toISOString();

  return nowIso;
}

export function getWorkingDaysElapsed(kickoffAt?: string | null, now = new Date()) {
  const kickoffDate = parseDateSafe(kickoffAt);
  if (!kickoffDate) return 0;

  let cursor = startOfDay(kickoffDate);
  const end = startOfDay(now);
  if (cursor.getTime() > end.getTime()) return 0;

  let count = 0;
  while (cursor.getTime() <= end.getTime()) {
    if (isBusinessDay(cursor)) {
      count += 1;
    }
    cursor = new Date(cursor.getTime() + DAY_MS);
  }

  return count;
}

function getWorkingDaysBudget(flow?: ProductionFlow | null) {
  return flow?.workingDaysBudget && flow.workingDaysBudget > 0
    ? flow.workingDaysBudget
    : DEFAULT_WORKING_DAYS_BUDGET;
}

function getInitialWorkMode(flow?: ProductionFlow | null): ProductionWorkMode {
  if (flow?.workMode === 'planned' || flow?.workMode === 'extra' || flow?.workMode === 'idea_only') {
    return flow.workMode;
  }
  return flow?.kickoffAt ? 'planned' : 'idea_only';
}

function getScheduleStatusFromFlow(
  flow: ProductionFlow,
  currentStage: ProductionStage | null,
  now = new Date()
): ProductionScheduleStatus {
  if (!currentStage) return 'idea';
  if (flow.stages.every((stage) => stage.status === 'done')) return 'completed';
  if (currentStage.status === 'blocked') return 'blocked';

  const kickoffPending = !flow.kickoffAt;
  const workMode = getInitialWorkMode(flow);
  const budget = getWorkingDaysBudget(flow);
  const workingDaysElapsed = getWorkingDaysElapsed(flow.kickoffAt, now);
  const currentStageDue = parseDateSafe(currentStage.dueAt);
  const publishAt = parseDateSafe(flow.publishAt);
  const currentStageLate = currentStage.status !== 'done' && !!currentStageDue && currentStageDue.getTime() < now.getTime();
  const hoursToPublish = publishAt ? (publishAt.getTime() - now.getTime()) / HOUR_MS : Number.POSITIVE_INFINITY;

  if (kickoffPending && currentStage.id === 'idea') return 'idea';
  if (kickoffPending) return workMode === 'extra' ? 'extra_active' : 'active';
  if (!kickoffPending && workingDaysElapsed > budget) return 'overdue';

  const isAtRisk =
    (workingDaysElapsed >= Math.max(1, budget - 1)) ||
    currentStageLate ||
    (hoursToPublish <= 24 && hoursToPublish >= 0 && currentStage.id !== 'publish_followup' && currentStage.id !== 'recycle_shorts');

  if (isAtRisk) return 'at_risk';
  if (workMode === 'extra') return 'extra_active';
  return 'active';
}

function trimNonEmptyLines(lines: string[]) {
  return lines.map((line) => line.trim()).filter(Boolean);
}

function getStageDefinition(stageId: ProductionStageId) {
  return STAGE_DEFINITIONS.find((stage) => stage.id === stageId) || null;
}

export function getProductionFlowCurrentStage(flow?: ProductionFlow | null) {
  if (!flow?.stages?.length) return null;
  return flow.stages.find((stage) => stage.id === flow.currentStageId)
    || flow.stages.find((stage) => stage.status !== 'done')
    || flow.stages[flow.stages.length - 1]
    || null;
}

export function getProductionFlowNextStage(flow?: ProductionFlow | null) {
  if (!flow?.stages?.length) return null;
  const currentStage = getProductionFlowCurrentStage(flow);
  if (!currentStage) return null;
  const currentIndex = flow.stages.findIndex((stage) => stage.id === currentStage.id);
  return flow.stages[currentIndex + 1] || null;
}

export function normalizeProductionFlow(flow?: ProductionFlow | null): ProductionFlow | undefined {
  if (!flow?.stages?.length) return undefined;

  const stageOrder = new Map(OPTIMIZED_STAGE_ORDER.map((id, index) => [id, index]));
  const publishAt = resolveSafeIsoDate(flow.publishAt, flow.createdFromWizardAt);
  const createdFromWizardAt = resolveSafeIsoDate(flow.createdFromWizardAt, publishAt);
  const stages = [...flow.stages]
    .sort((a, b) => (stageOrder.get(a.id) ?? 999) - (stageOrder.get(b.id) ?? 999))
    .map((stage) => ({
      ...stage,
      dueAt: resolveSafeIsoDate(stage.dueAt, publishAt),
      completedAt: stage.completedAt ? resolveSafeIsoDate(stage.completedAt, stage.dueAt) : undefined,
    }));

  const firstOpenIndex = stages.findIndex((stage) => stage.status !== 'done');

  if (firstOpenIndex !== -1) {
    stages.forEach((stage, index) => {
      if (stage.status === 'done') return;
      if (index === firstOpenIndex) {
        if (stage.status === 'pending') {
          stage.status = 'in_progress';
        }
        return;
      }
      if (stage.status === 'in_progress') {
        stage.status = 'pending';
      }
    });
  }

  const currentStageId = firstOpenIndex === -1 ? stages[stages.length - 1].id : stages[firstOpenIndex].id;
  const provisionalFlow: ProductionFlow = {
    ...flow,
    publishAt,
    createdFromWizardAt,
    currentStageId,
    workingDaysBudget: getWorkingDaysBudget(flow),
    workMode: getInitialWorkMode(flow),
    stages,
    scheduleStatus: flow.scheduleStatus || 'idea',
  };

  return {
    ...provisionalFlow,
    scheduleStatus: getScheduleStatusFromFlow(
      provisionalFlow,
      stages.find((stage) => stage.id === currentStageId) || null
    ),
  };
}

export function buildOptimizedVideoFlow(
  input: CreateVideoFromFlowInput,
  board: Board,
  workflowConfig?: Partial<WorkflowConfig> | null
): BuiltOptimizedVideoFlow {
  const now = new Date();
  const nowMs = now.getTime();
  const publishAtDate = new Date(input.publishAt);
  const publishAt = Number.isNaN(publishAtDate.getTime()) ? now.toISOString() : publishAtDate.toISOString();
  const publishAtMs = Number.isNaN(publishAtDate.getTime()) ? nowMs : publishAtDate.getTime();
  const workflowRoles: AuditRole[] = workflowConfig?.roles?.length
    ? [...workflowConfig.roles]
    : ['creador', 'editor'];
  const aiSeeded = !!input.usedAI;
  let isTightSchedule = false;

  const stages: ProductionStage[] = STAGE_DEFINITIONS.map((definition, index) => {
    const resolvedRole = resolveProductionStageOwner(definition.primaryOwnerRole, workflowRoles);
    const fallbackRole = resolveProductionStageFallback(definition.primaryOwnerRole, workflowRoles);
    const resolvedDue = clampStageDueAt(publishAtMs + definition.offsetMs, nowMs);

    if (resolvedDue.wasClamped) isTightSchedule = true;

    const stage: ProductionStage = {
      id: definition.id,
      label: definition.label,
      macroColumnId: resolveMacroColumnId(board, definition.macroColumnKey),
      ownerRole: resolvedRole,
      fallbackOwnerRole: fallbackRole,
      deliverable: definition.deliverable,
      status: index === 0 ? 'in_progress' : 'pending',
      dueAt: resolvedDue.dueAt,
      checklistTitle: definition.checklistTitle,
    };

    if (definition.id === 'idea') {
      stage.status = 'in_progress';
    } else if (definition.id === 'research') {
      stage.status = 'pending';
      stage.hasAIDraft = aiSeeded && !!input.researchSummary?.trim();
    } else if (definition.id === 'title_hook') {
      stage.status = 'pending';
      stage.hasAIDraft = aiSeeded && !!(
        input.hook?.trim()
        || input.title?.trim()
        || input.titleAlternatives?.trim()
      );
    } else if (definition.id === 'script') {
      stage.status = 'pending';
      stage.hasAIDraft = aiSeeded && !!input.scriptBase?.trim();
    }

    return stage;
  });

  const productionBrief: ProductionBrief = {
    idea: input.idea?.trim() || '',
    audience: input.audience?.trim() || '',
    question: input.question?.trim() || '',
    promise: input.promise?.trim() || '',
    tone: input.tone?.trim() || '',
    creatorNotes: input.creatorNotes?.trim() || '',
    researchSummary: input.researchSummary?.trim() || '',
    openQuestions: (input.openQuestions || []).map((item) => item.trim()).filter(Boolean),
  };

  const productionFlow: ProductionFlow = {
    templateId: OPTIMIZED_VIDEO_TEMPLATE_ID,
    publishAt,
    createdFromWizardAt: now.toISOString(),
    currentStageId: 'idea',
    scheduleMode: 'standard',
    isTightSchedule,
    workingDaysBudget: DEFAULT_WORKING_DAYS_BUDGET,
    workMode: 'idea_only',
    scheduleStatus: 'idea',
    stages,
  };

  const checklists = STAGE_DEFINITIONS.map((definition) =>
    buildChecklist(definition.id, definition.checklistTitle, definition.checklistItems(input))
  );
  const ideaChecklist = checklists.find((checklist) => checklist.id === createChecklistId('idea'));
  if (ideaChecklist) {
    ideaChecklist.items = ideaChecklist.items.map((item) => ({
      ...item,
      isCompleted: true,
    }));
  }

  const seededTitles = trimNonEmptyLines([
    input.title,
    ...(input.titleAlternatives
      ? input.titleAlternatives.split('\n')
      : ['Variantes pendientes:', '- Variante 2', '- Variante 3', '- Variante 4']),
  ]).join('\n');

  return {
    productionBrief,
    productionFlow: normalizeProductionFlow(productionFlow) || productionFlow,
    checklists,
    suggestedListId: stages.find((stage) => stage.id === 'idea')?.macroColumnId || stages[0].macroColumnId,
    derivedAssignee: getDerivedAssigneeLabel(stages.find((stage) => stage.id === 'idea')?.ownerRole || stages[0].ownerRole),
    dueDate: publishAt,
    contentType: input.contentType || 'long',
    seededTitles,
  };
}

export function updateProductionStageStatus(
  flow: ProductionFlow,
  stageId: ProductionStageId,
  nextStatus: ProductionStageStatus,
  nowIso = new Date().toISOString(),
  options?: { kickoffMode?: ProductionWorkMode }
) {
  const normalized = normalizeProductionFlow(flow);
  if (!normalized) return flow;

  const stages = normalized.stages.map((stage) => ({ ...stage }));
  const currentIndex = stages.findIndex((stage) => stage.id === stageId);
  if (currentIndex === -1) return normalized;

  stages[currentIndex] = {
    ...stages[currentIndex],
    status: nextStatus,
    completedAt: nextStatus === 'done' ? nowIso : undefined,
  };

  let kickoffAt = normalized.kickoffAt;
  let workMode = normalized.workMode;

  const shouldKickoff =
    !kickoffAt &&
    (
      (stageId === 'idea' && nextStatus === 'done') ||
      (stageId !== 'idea' && (nextStatus === 'in_progress' || nextStatus === 'done' || nextStatus === 'blocked'))
    );

  if (shouldKickoff) {
    kickoffAt = nowIso;
    workMode = options?.kickoffMode || (workMode === 'idea_only' ? 'planned' : workMode);
  }

  if (stageId === 'idea' && nextStatus !== 'done' && !kickoffAt) {
    workMode = 'idea_only';
  }

  if (nextStatus === 'done') {
    const nextStage = stages[currentIndex + 1];
    if (nextStage && nextStage.status === 'pending') {
      stages[currentIndex + 1] = {
        ...nextStage,
        status: 'in_progress',
      };
    }
  }

  if (nextStatus === 'in_progress' || nextStatus === 'blocked') {
    stages.forEach((stage, index) => {
      if (index !== currentIndex && stage.status === 'in_progress') {
        stages[index] = { ...stage, status: 'pending' };
      }
    });
  }

  return normalizeProductionFlow({
    ...normalized,
    kickoffAt,
    workMode,
    stages,
  }) || normalized;
}

export function updateProductionStageDetails(
  flow: ProductionFlow,
  stageId: ProductionStageId,
  updates: Partial<Pick<ProductionStage, 'dueAt' | 'notes'>>
) {
  const normalized = normalizeProductionFlow(flow);
  if (!normalized) return flow;
  const currentStage = normalized.stages.find((stage) => stage.id === stageId);
  if (!currentStage) return normalized;

  const hasDueAtUpdate = Object.prototype.hasOwnProperty.call(updates, 'dueAt');
  const hasNotesUpdate = Object.prototype.hasOwnProperty.call(updates, 'notes');
  const nextDueAt = hasDueAtUpdate
    ? resolveSafeIsoDate(updates.dueAt, currentStage.dueAt || normalized.publishAt)
    : currentStage.dueAt;
  const nextNotes = hasNotesUpdate
    ? updates.notes?.trim() || undefined
    : currentStage.notes;

  return normalizeProductionFlow({
    ...normalized,
    stages: normalized.stages.map((stage) => (
      stage.id === stageId
        ? {
            ...stage,
            ...(hasDueAtUpdate ? { dueAt: nextDueAt } : {}),
            ...(hasNotesUpdate ? { notes: nextNotes } : {}),
          }
        : stage
    )),
  }) || normalized;
}

export function getProductionFlowSummary(card: Card, board: Board): ProductionFlowSummary | null {
  const flow = normalizeProductionFlow(card.productionFlow);
  if (!flow) return null;

  const currentStage = getProductionFlowCurrentStage(flow);
  const nextStage = getProductionFlowNextStage(flow);
  const now = new Date();
  const workingDaysBudget = getWorkingDaysBudget(flow);
  const workingDaysElapsed = getWorkingDaysElapsed(flow.kickoffAt, now);
  const currentStageDueMs = currentStage ? new Date(currentStage.dueAt).getTime() : Number.NaN;
  const isStageObjectiveLate = !!currentStage && currentStage.status !== 'done' && !Number.isNaN(currentStageDueMs) && currentStageDueMs < now.getTime();
  const scheduleStatus = getScheduleStatusFromFlow(flow, currentStage, now);
  const isOverdueByBudget = scheduleStatus === 'overdue';
  const isAtRisk = scheduleStatus === 'at_risk';
  const isExtraActive = scheduleStatus === 'extra_active';
  const isKickoffPending = !flow.kickoffAt;
  const overdueStages = flow.stages.filter((stage) => {
    if (stage.status === 'done') return false;
    if (currentStage?.id === stage.id) return isOverdueByBudget;
    return false;
  });
  const blockedStages = flow.stages.filter((stage) => stage.status === 'blocked');
  const aiSeededOpenStages = flow.stages.filter((stage) => stage.status !== 'done' && !!stage.hasAIDraft);
  const isComplete = flow.stages.every((stage) => stage.status === 'done');
  const expectedColumnId = currentStage?.macroColumnId || null;
  const expectedColumnTitle = resolveMacroColumnTitle(board, expectedColumnId);

  return {
    currentStage,
    nextStage,
    completedCount: flow.stages.filter((stage) => stage.status === 'done').length,
    totalCount: flow.stages.length,
    overdueStages,
    blockedStages,
    aiSeededOpenStages,
    isComplete,
    isColumnMismatch: !isComplete && !!expectedColumnId && card.listId !== expectedColumnId,
    expectedColumnId,
    expectedColumnTitle,
    isTightSchedule: flow.isTightSchedule,
    scheduleStatus,
    workingDaysElapsed,
    workingDaysBudget,
    isExtraActive,
    isAtRisk,
    isOverdueByBudget,
    isKickoffPending,
    isStageObjectiveLate,
  };
}

export function getSuggestedFlowColumn(card: Card, board: Board) {
  const summary = getProductionFlowSummary(card, board);
  if (!summary || !summary.currentStage || summary.isComplete) return null;
  if (!summary.expectedColumnId || summary.expectedColumnId === card.listId) return null;

  return {
    listId: summary.expectedColumnId,
    listTitle: summary.expectedColumnTitle || board.lists.find((list) => list.id === summary.expectedColumnId)?.title || 'Siguiente columna',
    stageLabel: summary.currentStage.label,
  };
}

export function findStageChecklist(card: Card, stageId: ProductionStageId) {
  return card.checklists.find((checklist) => checklist.id === createChecklistId(stageId))
    || card.checklists.find((checklist) => checklist.title === getStageDefinition(stageId)?.checklistTitle)
    || null;
}

export function getGuideChecklistProgress(card: Card, stageId: ProductionStageId): GuideChecklistProgress {
  const checklist = findStageChecklist(card, stageId);
  const totalCount = checklist?.items.length || 0;
  const completedCount = checklist?.items.filter((item) => item.isCompleted).length || 0;
  const pendingItems = checklist?.items.filter((item) => !item.isCompleted).map((item) => item.text) || [];

  return {
    checklist,
    completedCount,
    totalCount,
    pendingItems,
    percentage: totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0,
  };
}

export function buildVideoExecutionSnapshot(card: Card, board: Board): VideoExecutionSnapshot {
  const summary = getProductionFlowSummary(card, board);
  const currentStage = summary?.currentStage || null;
  const nextStage = summary?.nextStage || null;
  const checklistProgress = currentStage ? getGuideChecklistProgress(card, currentStage.id) : {
    checklist: null,
    completedCount: 0,
    totalCount: 0,
    pendingItems: [],
    percentage: 0,
  };
  const currentColumnTitle = board.lists.find((list) => list.id === card.listId)?.title || 'Sin columna';
  const sourceUsed = card.seoSourceText?.trim()
    ? 'seoSourceText'
    : card.guion?.trim()
    ? 'guion'
    : 'brief';
  const hasSeededPackage = !!(
    card.gancho8s?.trim()
    || card.titulosLinden?.trim()
    || card.guion?.trim()
    || card.productionBrief?.idea?.trim()
    || card.productionBrief?.researchSummary?.trim()
    || card.productionBrief?.openQuestions?.length
  );
  const currentStageStatusLabel = currentStage?.status === 'done'
    ? 'Etapa cerrada'
    : currentStage?.status === 'blocked'
    ? 'Etapa bloqueada'
    : currentStage?.status === 'in_progress'
    ? 'Etapa en curso'
    : currentStage
    ? 'Pendiente de iniciar'
    : 'Sin etapa activa';
  const nextActionLabel = !currentStage
    ? 'Definir siguiente paso'
    : currentStage.status === 'blocked'
    ? 'Desbloquear etapa'
    : currentStage.status === 'pending'
    ? currentStage.id === 'idea' && !card.productionFlow?.kickoffAt
      ? 'Aprobar idea e iniciar'
      : 'Marcar en curso'
    : currentStage.status === 'in_progress'
    ? 'Marcar etapa lista'
    : nextStage
    ? `Abrir ${nextStage.label}`
    : 'Reabrir etapa';
  const nextActionDetail = currentStage?.deliverable
    || nextStage?.deliverable
    || 'Todavia no hay un siguiente paso operativo derivado.';
  const responsibleLabel = currentStage ? getAuditRoleLabel(currentStage.ownerRole) : card.assignee || 'Sin asignar';
  const thumbnailChecklist = card.miniaturaChecklist || { rostro: false, texto: false, contexto: false };
  const thumbnailFilled = !!(card.thumbnailPlan?.concept?.trim() || card.thumbnailPlan?.overlayText?.trim() || card.thumbnailPlan?.assetUrl?.trim());
  const thumbnailReady = thumbnailFilled || (thumbnailChecklist.rostro && thumbnailChecklist.texto && thumbnailChecklist.contexto);
  const titleReady = !!card.title?.trim();
  const descriptionReady = !!card.description?.trim();
  const scriptReady = !!card.guion?.trim();
  const checklistReady = checklistProgress.totalCount > 0 && checklistProgress.completedCount === checklistProgress.totalCount;
  const hasScheduledPublish = !!(card.productionFlow?.publishAt || card.dueDate);
  const productionReadyStages = (card.productionFlow?.stages || []).filter((stage) => stage.id !== 'upload_schedule' && stage.id !== 'publish_followup' && stage.id !== 'recycle_shorts');
  const productionCompletedCount = productionReadyStages.filter((stage) => stage.status === 'done').length;
  const productionReady = productionReadyStages.length > 0
    ? productionReadyStages.every((stage) => stage.status === 'done')
    : checklistReady;
  const publishReady = titleReady && thumbnailReady && descriptionReady && scriptReady && productionReady && hasScheduledPublish;

  const notices: VideoExecutionNotice[] = [];
  if (summary?.isColumnMismatch && summary.expectedColumnTitle) {
    notices.push({
      id: 'column',
      tone: 'warning',
      title: 'Columna desalineada',
      body: `El flujo espera este video en ${summary.expectedColumnTitle}, pero ahora mismo esta en ${currentColumnTitle}.`,
    });
  }
  if (summary?.blockedStages.length) {
    notices.push({
      id: 'blocked',
      tone: 'danger',
      title: 'Hay etapas bloqueadas',
      body: summary.blockedStages.map((stage) => stage.label).join(', '),
    });
  }
  if (summary?.isAtRisk || summary?.isOverdueByBudget) {
    notices.push({
      id: 'schedule',
      tone: summary.isOverdueByBudget ? 'danger' : 'warning',
      title: summary.isOverdueByBudget ? 'Cronograma vencido' : 'Cronograma en riesgo',
      body: summary.isOverdueByBudget
        ? `El video ya supero su presupuesto real de ${summary.workingDaysBudget} dias habiles.`
        : 'Hace falta cerrar la etapa actual pronto para no tensionar la publicacion.',
    });
  }
  if (!hasSeededPackage) {
    notices.push({
      id: 'seed',
      tone: 'info',
      title: 'Falta paquete sembrado',
      body: 'Todavia no hay suficiente contexto sembrado desde Nuevo video para resumir mejor el empaque y la produccion.',
    });
  }

  const readiness: VideoExecutionReadinessItem[] = [
    {
      id: 'title',
      label: 'Titulo',
      status: titleReady ? 'ready' : 'pending',
      detail: titleReady ? 'Hay un titulo final visible para el video.' : 'Todavia no hay un titulo definido.',
    },
    {
      id: 'thumbnail',
      label: 'Miniatura',
      status: thumbnailReady
        ? 'ready'
        : thumbnailChecklist.rostro || thumbnailChecklist.texto || thumbnailChecklist.contexto
        ? 'warning'
        : 'pending',
      detail: thumbnailFilled
        ? 'La miniatura ya tiene concepto o referencia.'
        : thumbnailChecklist.rostro || thumbnailChecklist.texto || thumbnailChecklist.contexto
        ? 'La miniatura esta empezada, pero no cerrada.'
        : 'Todavia no hay un plan claro de miniatura.',
    },
    {
      id: 'description',
      label: 'Descripcion',
      status: descriptionReady ? 'ready' : 'pending',
      detail: descriptionReady ? 'La descripcion final ya existe.' : `La descripcion seguira saliendo de ${sourceUsed === 'seoSourceText' ? 'la transcripcion/resumen pegado' : sourceUsed === 'guion' ? 'guion' : 'brief'}.`,
    },
    {
      id: 'script',
      label: 'Guion',
      status: scriptReady ? 'ready' : 'pending',
      detail: scriptReady ? 'Hay escaleta o guion base listo para ejecutar.' : 'Todavia falta sembrar o validar el guion.',
    },
    {
      id: 'production',
      label: 'Produccion',
      status: productionReady ? 'ready' : productionCompletedCount > 0 || checklistProgress.completedCount > 0 ? 'warning' : 'pending',
      detail: productionReady
        ? 'La ejecucion operativa ya quedo cerrada antes de publicar.'
        : productionReadyStages.length
        ? `${productionCompletedCount}/${productionReadyStages.length} etapas operativas cerradas antes de salida.`
        : checklistProgress.totalCount
        ? `${checklistProgress.completedCount}/${checklistProgress.totalCount} items cerrados en la etapa actual.`
        : 'Todavia no hay una base operativa suficiente para cerrar produccion.',
    },
    {
      id: 'publish',
      label: 'Publicacion',
      status: publishReady ? 'ready' : hasScheduledPublish ? 'warning' : 'pending',
      detail: publishReady
        ? 'Titulo, miniatura, guion, produccion y metadata ya estan cerrados.'
        : hasScheduledPublish
        ? 'La fecha existe, pero aun falta cerrar piezas editoriales clave.'
        : 'Todavia falta aterrizar la publicacion.',
    },
  ];

  return {
    currentStage,
    nextStage,
    checklistProgress,
    pendingChecklistPreview: checklistProgress.pendingItems.slice(0, 3),
    currentColumnTitle,
    expectedColumnTitle: summary?.expectedColumnTitle || null,
    currentStageLabel: currentStage?.label || 'Sin etapa activa',
    currentStageStatusLabel,
    nextActionLabel,
    nextActionDetail,
    responsibleLabel,
    sourceUsed,
    hasSeededPackage,
    notices,
    readiness,
  };
}

function getSchedulePriority(status: ProductionScheduleStatus) {
  if (status === 'blocked') return 0;
  if (status === 'overdue') return 1;
  if (status === 'at_risk') return 2;
  if (status === 'active') return 3;
  if (status === 'extra_active') return 4;
  if (status === 'idea') return 5;
  return 6;
}

export function getScheduleStatusLabel(status: ProductionScheduleStatus) {
  if (status === 'blocked') return 'Bloqueado';
  if (status === 'overdue') return 'Atrasado';
  if (status === 'at_risk') return 'En riesgo';
  if (status === 'extra_active') return 'Trabajo extra';
  if (status === 'active') return 'En curso';
  if (status === 'completed') return 'Completado';
  return 'Idea';
}

function getGuideFocusComparator() {
  return (left: GuideFocusCard, right: GuideFocusCard) => {
    const leftDueMs = new Date(left.dueAt).getTime();
    const rightDueMs = new Date(right.dueAt).getTime();
    const leftPublishMs = new Date(left.publishAt).getTime();
    const rightPublishMs = new Date(right.publishAt).getTime();
    const statusDelta = getSchedulePriority(left.summary.scheduleStatus) - getSchedulePriority(right.summary.scheduleStatus);
    if (statusDelta !== 0) return statusDelta;
    if (leftPublishMs !== rightPublishMs) return leftPublishMs - rightPublishMs;
    if (leftDueMs !== rightDueMs) return leftDueMs - rightDueMs;
    if (left.summary.isColumnMismatch !== right.summary.isColumnMismatch) return left.summary.isColumnMismatch ? -1 : 1;
    if (left.hasDraftPending !== right.hasDraftPending) return left.hasDraftPending ? -1 : 1;
    if (left.summary.completedCount !== right.summary.completedCount) return left.summary.completedCount - right.summary.completedCount;
    return left.card.title.localeCompare(right.card.title, 'es');
  };
}

function createGuideAlert(
  card: Card,
  focusCard: GuideFocusCard,
  severity: GuideAlertSeverity,
  title: string,
  description: string
): GuideAlert {
  return {
    id: `${card.id}:${focusCard.currentStage.id}:${severity}:${title}`,
    severity,
    cardId: card.id,
    cardTitle: card.title,
    role: focusCard.currentStage.ownerRole,
    stageId: focusCard.currentStage.id,
    stageLabel: focusCard.currentStage.label,
    title,
    description,
    dueAt: focusCard.dueAt,
  };
}

function buildGuideFocusCard(card: Card, board: Board, priorityRank: number): GuideFocusCard | null {
  const summary = getProductionFlowSummary(card, board);
  if (!summary?.currentStage || summary.isComplete) return null;

  const currentColumnTitle = board.lists.find((list) => list.id === card.listId)?.title || 'Sin columna';
  const checklistProgress = getGuideChecklistProgress(card, summary.currentStage.id);
  const execution = buildVideoExecutionSnapshot(card, board);
  const hasDraftPending = summary.aiSeededOpenStages.some((stage) => (
    stage.id === summary.currentStage?.id || stage.id === summary.nextStage?.id
  ));
  const currentStageDueMs = new Date(summary.currentStage.dueAt).getTime();
  const publishAtMs = new Date(card.productionFlow?.publishAt || card.dueDate || summary.currentStage.dueAt).getTime();
  const priorityScore =
    (summary.scheduleStatus === 'overdue' ? 10_000 : 0) +
    (summary.scheduleStatus === 'blocked' ? 8_000 : 0) +
    (summary.scheduleStatus === 'at_risk' ? 6_000 : 0) +
    (summary.scheduleStatus === 'active' ? 4_000 : 0) +
    (summary.scheduleStatus === 'extra_active' ? 2_000 : 0) +
    (summary.isColumnMismatch ? 2_000 : 0) +
    (hasDraftPending ? 1_000 : 0) +
    Math.max(0, 1_000 - summary.completedCount * 50) +
    Math.max(0, 500 - Math.max(0, publishAtMs - Date.now()) / 3_600_000);

  return {
    card,
    summary,
    currentStage: summary.currentStage,
    nextStage: summary.nextStage,
    checklistProgress,
    execution,
    currentColumnTitle,
    priorityRank,
    priorityScore,
    dueAt: summary.currentStage.dueAt,
    publishAt: card.productionFlow?.publishAt || card.dueDate || summary.currentStage.dueAt,
    hasDraftPending,
  };
}

function buildGuideAlerts(focusCards: GuideFocusCard[]): GuideAlert[] {
  const nowMs = Date.now();
  const alerts: GuideAlert[] = [];

  focusCards.forEach((focusCard) => {
    const { card, currentStage, summary, hasDraftPending } = focusCard;
    const publishMs = new Date(focusCard.publishAt).getTime();
    const hoursToPublish = (publishMs - nowMs) / 3_600_000;
    const isReadyForPublish = currentStage.id === 'upload_schedule' || currentStage.id === 'publish_followup';

    if (summary.scheduleStatus === 'overdue') {
      alerts.push(createGuideAlert(
        card,
        focusCard,
        'critical',
        'Atrasado por presupuesto',
        `${card.title} ya supero su presupuesto real de ${summary.workingDaysBudget} dias habiles. ${getAuditRoleLabel(currentStage.ownerRole)} necesita cerrar ${currentStage.label} cuanto antes.`
      ));
    }

    if (summary.scheduleStatus === 'blocked') {
      alerts.push(createGuideAlert(
        card,
        focusCard,
        'critical',
        'Bloqueado',
        `${currentStage.label} esta bloqueada y frena el avance del video.`
      ));
    }

    if (hoursToPublish <= 24 && hoursToPublish >= 0 && !isReadyForPublish) {
      alerts.push(createGuideAlert(
        card,
        focusCard,
        'critical',
        'Publicacion en menos de 24h',
        `Este video publica pronto, pero el flujo sigue en ${currentStage.label}.`
      ));
    }

    if (summary.isAtRisk) {
      alerts.push(createGuideAlert(
        card,
        focusCard,
        'warning',
        'En riesgo',
        summary.isKickoffPending
          ? 'La idea ya esta definida, pero aun no se ha aprobado el arranque real del ciclo.'
          : `${card.title} consume gran parte de su ciclo real o ya supera el objetivo editorial de esta etapa.`
      ));
    }

    if (summary.isColumnMismatch) {
      alerts.push(createGuideAlert(
        card,
        focusCard,
        'warning',
        'Tablero desalineado',
        `El flujo espera ${summary.expectedColumnTitle || 'otra columna'}, pero el tablero sigue en ${focusCard.currentColumnTitle}.`
      ));
    }

    if (hasDraftPending) {
      alerts.push(createGuideAlert(
        card,
        focusCard,
        'warning',
        'Borrador IA pendiente',
        `Hay borradores IA listos para ${currentStage.label} o la siguiente etapa, pero falta validacion humana.`
      ));
    }

    if (summary.scheduleStatus === 'idea') {
      alerts.push(createGuideAlert(
        card,
        focusCard,
        'info',
        'Idea reciente',
        'La idea ya esta cargada, pero el reloj de 5 dias habiles aun no comienza hasta aprobar el arranque.'
      ));
    }

    if (summary.scheduleStatus === 'extra_active') {
      alerts.push(createGuideAlert(
        card,
        focusCard,
        'info',
        'Trabajo extra activo',
        'Este video esta en marcha fuera del bloque principal, pero no cuenta como atrasado mientras siga dentro de su presupuesto real.'
      ));
    }

    if (currentStage.id === 'upload_schedule') {
      alerts.push(createGuideAlert(
        card,
        focusCard,
        'info',
        'Listo para publicar',
        'El flujo ya esta en la fase de subida o programacion.'
      ));
    }

    if (currentStage.id === 'recycle_shorts') {
      alerts.push(createGuideAlert(
        card,
        focusCard,
        'info',
        'Reciclaje a shorts pendiente',
        'Este video ya entro en la cola de reciclaje a shorts o clips.'
      ));
    }

    if (currentStage.id === 'publish_followup' && card.postPublication?.publishedAt && !card.ctr2Hours) {
      alerts.push(createGuideAlert(
        card,
        focusCard,
        'info',
        'Seguimiento post-publicacion pendiente',
        'El video ya se publico, pero aun falta revisar el CTR inicial.'
      ));
    }
  });

  return alerts;
}

function buildGuideTask(focusCard: GuideFocusCard): GuideTask {
  const { card, currentStage, summary, checklistProgress, currentColumnTitle } = focusCard;

  return {
    id: `${card.id}:${currentStage.id}`,
    cardId: card.id,
    cardTitle: card.title,
    role: currentStage.ownerRole,
    stageId: currentStage.id,
    stageLabel: currentStage.label,
    deliverable: currentStage.deliverable,
    dueAt: currentStage.dueAt,
    publishAt: focusCard.publishAt,
    status: currentStage.status,
    checklistTitle: currentStage.checklistTitle,
    checklistProgress,
    hasDraftPending: focusCard.hasDraftPending,
    isBlocked: currentStage.status === 'blocked',
    isOverdue: summary.isOverdueByBudget,
    isAtRisk: summary.isAtRisk,
    isKickoffPending: summary.isKickoffPending,
    isColumnMismatch: summary.isColumnMismatch,
    scheduleStatus: summary.scheduleStatus,
    workingDaysElapsed: summary.workingDaysElapsed,
    workingDaysBudget: summary.workingDaysBudget,
    workMode: card.productionFlow?.workMode || 'idea_only',
    expectedColumnId: summary.expectedColumnId,
    expectedColumnTitle: summary.expectedColumnTitle,
    currentColumnId: card.listId,
    currentColumnTitle,
  };
}

export function buildGuideSyncSnapshot(
  board: Board,
  cadence: number,
  manualOverrideIds: string[] = []
): GuideSyncSnapshot {
  // Include ALL non-complete cards — bootstrap flow on-the-fly for legacy cards
  const lastListId = board.lists[board.lists.length - 1]?.id;
  const allCards = Object.values(board.cards).filter((card) => card.listId !== lastListId);
  const openFlowCards = allCards.map((card) => {
    if (card.productionFlow) {
      const summary = getProductionFlowSummary(card, board);
      if (!summary?.currentStage || summary.isComplete) return null;
      return card;
    }
    // Bootstrap flow on-the-fly for cards without one
    const { productionFlow, checklists } = bootstrapMinimalFlow(card, board);
    return { ...card, productionFlow, checklists: [...card.checklists, ...checklists] };
  }).filter((card): card is Card => card !== null);

  const rankedCards = openFlowCards
    .map((card, index) => buildGuideFocusCard(card, board, index))
    .filter((item): item is GuideFocusCard => !!item)
    .sort(getGuideFocusComparator())
    .map((item, index) => ({ ...item, priorityRank: index + 1 }));

  const candidateMap = new Map(rankedCards.map((item) => [item.card.id, item]));
  const cleanedManualIds = manualOverrideIds.filter(Boolean);
  const hasManualOverride = cleanedManualIds.length > 0;
  const limit = Math.max(1, cadence || 1);
  const autoSelected = rankedCards.slice(0, limit);
  const manualSelected = cleanedManualIds
    .map((cardId) => candidateMap.get(cardId) || null)
    .filter((item): item is GuideFocusCard => !!item)
    .slice(0, limit);
  const focusCards = hasManualOverride ? manualSelected : autoSelected;
  const selectedIds = new Set(focusCards.map((item) => item.card.id));
  const extraFocusCards = rankedCards.filter((item) => (
    !selectedIds.has(item.card.id) && item.summary.scheduleStatus === 'extra_active'
  ));
  const alerts = buildGuideAlerts(focusCards);
  const alertCounts = alerts.reduce<Record<GuideAlertSeverity, number>>((acc, alert) => {
    acc[alert.severity] += 1;
    return acc;
  }, { critical: 0, warning: 0, info: 0 });

  const sortGuideTasks = (tasks: GuideTask[]) => tasks
    .sort((left, right) => {
      const statusDelta = getSchedulePriority(left.scheduleStatus) - getSchedulePriority(right.scheduleStatus);
      if (statusDelta !== 0) return statusDelta;
      if (left.isBlocked !== right.isBlocked) return left.isBlocked ? -1 : 1;
      return new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime();
    });
  const tasks = sortGuideTasks(focusCards.map((focusCard) => buildGuideTask(focusCard)));
  const extraTasks = sortGuideTasks(extraFocusCards.map((focusCard) => buildGuideTask(focusCard)));

  return {
    focusCards,
    extraFocusCards,
    tasksByRole: {
      creador: tasks.filter((task) => task.role === 'creador'),
      editor: tasks.filter((task) => task.role === 'editor'),
      asistente: tasks.filter((task) => task.role === 'asistente'),
    },
    extraTasksByRole: {
      creador: extraTasks.filter((task) => task.role === 'creador'),
      editor: extraTasks.filter((task) => task.role === 'editor'),
      asistente: extraTasks.filter((task) => task.role === 'asistente'),
    },
    alerts,
    alertCounts,
    selectedCardIds: focusCards.map((item) => item.card.id),
    autoSelectedCardIds: autoSelected.map((item) => item.card.id),
    hasManualOverride,
    availableCards: rankedCards.map((item) => item.card),
    blockedCount: focusCards.filter((item) => item.summary.scheduleStatus === 'blocked').length,
    overdueCount: focusCards.filter((item) => item.summary.isOverdueByBudget).length,
    publishReadyCount: focusCards.filter((item) => item.currentStage.id === 'upload_schedule' || item.currentStage.id === 'publish_followup').length,
    aiValidationCount: focusCards.filter((item) => item.hasDraftPending).length,
  };
}

// ---------------------------------------------------------------------------
// Bootstrap & Sync — make every card a guided card
// ---------------------------------------------------------------------------

/** Maps a board list to its MacroColumnKey using MACRO_COLUMN_MATCHERS */
function resolveMacroColumnKeyForList(board: Board, listId: string): MacroColumnKey {
  const list = board.lists.find((l) => l.id === listId);
  if (!list) return 'ideas';
  const normalized = normalizeText(list.title);
  for (const [key, matcher] of Object.entries(MACRO_COLUMN_MATCHERS) as [MacroColumnKey, { patterns: string[] }][]) {
    if (matcher.patterns.some((p) => normalized.includes(p))) return key;
  }
  // Fallback: use list index position
  const listIndex = board.lists.findIndex((l) => l.id === listId);
  const keys: MacroColumnKey[] = ['ideas', 'titles', 'script', 'recording', 'editing', 'publishing', 'followup'];
  return keys[Math.min(listIndex, keys.length - 1)] || 'ideas';
}

/** Ordered macro column keys matching the left→right board flow */
const MACRO_COLUMN_ORDER: MacroColumnKey[] = ['ideas', 'titles', 'script', 'recording', 'editing', 'publishing', 'followup'];

/**
 * Creates a lightweight productionFlow for cards created without the Wizard.
 * Stages before the card's current column are marked `done`.
 * The current column's first stage is `in_progress`.
 * Remaining stages are `pending`.
 */
export function bootstrapMinimalFlow(card: Card, board: Board): { productionFlow: ProductionFlow; checklists: Checklist[] } {
  const now = new Date().toISOString();
  const currentMacro = resolveMacroColumnKeyForList(board, card.listId);
  const currentMacroIndex = MACRO_COLUMN_ORDER.indexOf(currentMacro);
  const workflowRoles: AuditRole[] = ['creador', 'editor', 'asistente'];

  const stages: ProductionStage[] = [];
  const checklists: Checklist[] = [];
  let foundCurrent = false;
  let currentStageId: ProductionStageId = 'idea';

  for (const def of STAGE_DEFINITIONS) {
    const defMacroIndex = MACRO_COLUMN_ORDER.indexOf(def.macroColumnKey);
    const resolvedRole = resolveProductionStageOwner(def.primaryOwnerRole, workflowRoles);
    const fallbackRole = resolveProductionStageFallback(def.primaryOwnerRole, workflowRoles);

    let status: ProductionStageStatus;
    if (defMacroIndex < currentMacroIndex) {
      status = 'done';
    } else if (defMacroIndex === currentMacroIndex && !foundCurrent) {
      status = 'in_progress';
      foundCurrent = true;
      currentStageId = def.id;
    } else {
      status = 'pending';
    }

    const stage: ProductionStage = {
      id: def.id,
      label: def.label,
      macroColumnId: resolveMacroColumnId(board, def.macroColumnKey),
      ownerRole: resolvedRole,
      fallbackOwnerRole: fallbackRole,
      deliverable: def.deliverable,
      status,
      dueAt: '',
      completedAt: status === 'done' ? now : undefined,
      checklistTitle: def.checklistTitle,
    };
    stages.push(stage);

    // Build checklist for current + next 2 stages
    if (status === 'in_progress' || (status === 'pending' && checklists.length < 3)) {
      const dummyInput = { idea: card.title, title: card.title, publishAt: '', audience: '', question: '', promise: '', tone: '', creatorNotes: '', researchSummary: '', openQuestions: [], titleAlternatives: '', hook: '', scriptBase: '', contentType: (card.contentType || 'long') as 'long' | 'short' };
      const items = def.checklistItems(dummyInput);
      checklists.push(buildChecklist(def.id, def.checklistTitle, items));
    }
  }

  // If no stage was set to in_progress (e.g., card is in the last column), mark last non-done
  if (!foundCurrent && stages.length > 0) {
    const lastStage = stages[stages.length - 1];
    lastStage.status = 'done';
    lastStage.completedAt = now;
    currentStageId = lastStage.id;
  }

  const productionFlow: ProductionFlow = {
    templateId: 'optimized_publish_v1',
    publishAt: '',
    createdFromWizardAt: now,
    currentStageId,
    scheduleMode: 'standard',
    isTightSchedule: false,
    workingDaysBudget: DEFAULT_WORKING_DAYS_BUDGET,
    workMode: 'idea_only',
    scheduleStatus: 'idea',
    stages,
  };

  return { productionFlow, checklists };
}

/**
 * Syncs a card's productionFlow when it moves to a different column.
 * - Forward movement: marks intermediate stages as `done`
 * - Backward movement: reopens destination stage as `in_progress`
 * Returns updated card fields or null if no flow exists.
 */
export function syncFlowToColumn(
  card: Card,
  newListId: string,
  board: Board,
): Partial<Card> | null {
  const flow = normalizeProductionFlow(card.productionFlow);
  if (!flow) return null;

  const newMacro = resolveMacroColumnKeyForList(board, newListId);
  const newMacroIndex = MACRO_COLUMN_ORDER.indexOf(newMacro);
  const now = new Date().toISOString();

  let newCurrentStageId: ProductionStageId = flow.currentStageId;
  let foundNewCurrent = false;
  const updatedStages = flow.stages.map((stage) => {
    const def = STAGE_DEFINITIONS.find((d) => d.id === stage.id);
    if (!def) return { ...stage };

    const defMacroIndex = MACRO_COLUMN_ORDER.indexOf(def.macroColumnKey);

    if (defMacroIndex < newMacroIndex) {
      // Before destination — mark done if not already
      if (stage.status !== 'done') {
        return { ...stage, status: 'done' as const, completedAt: now };
      }
      return { ...stage };
    }

    if (defMacroIndex === newMacroIndex && !foundNewCurrent) {
      // First stage at destination column — make it current
      foundNewCurrent = true;
      newCurrentStageId = stage.id;
      if (stage.status === 'done') {
        // Reopening a completed stage (backward move)
        return { ...stage, status: 'in_progress' as const, completedAt: undefined };
      }
      return { ...stage, status: 'in_progress' as const };
    }

    // After destination — ensure pending (don't undo done for forward moves)
    if (stage.status === 'in_progress') {
      return { ...stage, status: 'pending' as const };
    }
    return { ...stage };
  });

  const updatedFlow: ProductionFlow = {
    ...flow,
    currentStageId: newCurrentStageId,
    stages: updatedStages,
  };

  return {
    productionFlow: updatedFlow,
  };
}
