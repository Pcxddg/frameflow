import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Info, X, Clock, MessageCircle, CheckSquare, MessageSquare as MessageSquareIcon, Sparkles, DollarSign, Zap, Search, AlertTriangle, Users, Calendar, ArrowRight, Film, Target, ChevronRight, ChevronDown, Circle, CheckCircle2, Lightbulb, UserPlus, Clapperboard, Plus, ArrowRightLeft, Flame, Hand, Settings2 } from 'lucide-react';
import { useBoard } from '../store';
import { generateWeeklyPlan, mergeWorkflowConfig, getWorkflowDescription, type TaskStep, type DayPlan, diagnoseVideoState, getScheduledPhase, getEndOfDayItems, PHASE_MATRIX, UX_COPY, type VideoStatus, type EndOfDayItem } from '../lib/workflowPlans';
import { buildGuideSyncSnapshot, getAuditRoleLabel, getScheduleStatusLabel } from '../lib/optimizedVideoFlow';
import type { CardModalLocation } from '../lib/cardModalEvents';
import { resolveGuideStageToCardLocation } from '../lib/cardModalEvents';

// â”€â”€â”€ Custom tasks & reassignments (persisted per day in localStorage) â”€â”€â”€

type RoleKey = 'creador' | 'editor' | 'asistente';

interface CustomTask {
  id: string;
  task: string;
  detail: string;
  role: RoleKey;
}

interface Reassignment {
  taskId: string; // e.g. "c-2" or "custom-abc123"
  fromRole: RoleKey;
  toRole: RoleKey;
}

function getCustomTasksKey(): string {
  const d = new Date();
  return `ff-custom-tasks-${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function getReassignKey(): string {
  const d = new Date();
  return `ff-reassign-${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function loadCustomTasks(): CustomTask[] {
  try {
    const raw = localStorage.getItem(getCustomTasksKey());
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

function saveCustomTasks(tasks: CustomTask[]) {
  localStorage.setItem(getCustomTasksKey(), JSON.stringify(tasks));
}

function loadReassignments(): Reassignment[] {
  try {
    const raw = localStorage.getItem(getReassignKey());
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

function saveReassignments(r: Reassignment[]) {
  localStorage.setItem(getReassignKey(), JSON.stringify(r));
}

type Tab = 'today' | 'workflow' | 'roles' | 'strategy';

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];

// â”€â”€â”€ LocalStorage helpers for daily checklist â”€â”€â”€

function getTodayKey(): string {
  const d = new Date();
  return `ff-checklist-${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function loadCheckedItems(): Set<string> {
  try {
    const raw = localStorage.getItem(getTodayKey());
    if (raw) return new Set(JSON.parse(raw));
  } catch { /* ignore */ }
  return new Set();
}

function saveCheckedItems(items: Set<string>) {
  localStorage.setItem(getTodayKey(), JSON.stringify([...items]));
}

function normalizeActiveVideoIds(ids: string[], cadence: number): string[] {
  return Array.from({ length: cadence }, (_, index) => ids[index] || '');
}

function areActiveVideoIdsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

// â”€â”€â”€ Role colors â”€â”€â”€

const ROLE_COLORS = {
  creador: { bg: 'bg-blue-100', bgLight: 'bg-blue-50/50', border: '#bfdbfe', text: 'text-blue-700', accent: 'bg-blue-500', check: 'text-blue-500', badge: 'bg-blue-600' },
  editor: { bg: 'bg-orange-100', bgLight: 'bg-orange-50/50', border: '#fed7aa', text: 'text-orange-700', accent: 'bg-orange-500', check: 'text-orange-500', badge: 'bg-orange-500' },
  asistente: { bg: 'bg-emerald-100', bgLight: 'bg-emerald-50/50', border: '#a7f3d0', text: 'text-emerald-700', accent: 'bg-emerald-500', check: 'text-emerald-500', badge: 'bg-emerald-500' },
};

const ROLE_LABELS: Record<string, string> = { creador: 'Creador', editor: 'Editor', asistente: 'Asistente' };

function getScheduleVisualMeta(status: string) {
  if (status === 'blocked') return { chip: 'bg-rose-100 text-rose-700', card: 'border-rose-200 bg-rose-50/80' };
  if (status === 'overdue') return { chip: 'bg-orange-100 text-orange-700', card: 'border-orange-200 bg-orange-50/80' };
  if (status === 'at_risk') return { chip: 'bg-amber-100 text-amber-700', card: 'border-amber-200 bg-amber-50/70' };
  if (status === 'extra_active') return { chip: 'bg-sky-100 text-sky-700', card: 'border-sky-200 bg-sky-50/70' };
  if (status === 'idea') return { chip: 'bg-slate-100 text-slate-700', card: 'border-slate-200 bg-slate-50/70' };
  if (status === 'completed') return { chip: 'bg-emerald-100 text-emerald-700', card: 'border-emerald-200 bg-emerald-50/70' };
  return { chip: 'bg-emerald-100 text-emerald-700', card: 'border-slate-200 bg-slate-50/70' };
}

interface TeamGuideProps {
  hideTrigger?: boolean;
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  onRequestOpenCard?: (cardId: string, location?: CardModalLocation) => void;
}

// â”€â”€â”€ Component â”€â”€â”€

export function TeamGuide({ hideTrigger = false, isOpen: controlledIsOpen, onOpenChange, onRequestOpenCard }: TeamGuideProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('today');
  const [checkedItems, setCheckedItems] = useState<Set<string>>(loadCheckedItems);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [showVideoPicker, setShowVideoPicker] = useState(false);
  const [pendingActiveVideoIds, setPendingActiveVideoIds] = useState<string[] | null>(null);
  const [isSavingActiveVideos, setIsSavingActiveVideos] = useState(false);
  const [activeVideosError, setActiveVideosError] = useState<string | null>(null);
  const [showActiveVideosSaved, setShowActiveVideosSaved] = useState(false);
  const [customTasks, setCustomTasks] = useState<CustomTask[]>(loadCustomTasks);
  const [reassignments, setReassignments] = useState<Reassignment[]>(loadReassignments);
  const [addingTaskRole, setAddingTaskRole] = useState<RoleKey | null>(null);
  const [newTaskText, setNewTaskText] = useState('');
  const [newTaskDetail, setNewTaskDetail] = useState('');
  const { board, canEditBoard, setProductionStageStatus, moveCard, updateBoardMeta } = useBoard();
  const saveActiveVideosRequestId = useRef(0);
  const isOpen = controlledIsOpen ?? internalIsOpen;
  const setIsOpen = (nextIsOpen: boolean) => {
    if (controlledIsOpen === undefined) {
      setInternalIsOpen(nextIsOpen);
    }
    onOpenChange?.(nextIsOpen);
  };

  const today = new Date();
  const dayOfWeek = today.getDay();
  const dayName = DAY_NAMES[dayOfWeek];

  // Get workflow config from board or use defaults
  const workflowConfig = useMemo(() => mergeWorkflowConfig(board?.workflowConfig), [board?.workflowConfig]);
  const remoteActiveVideoIds = workflowConfig.activeVideoIds || [];
  const manualOverrideIds = useMemo(
    () => (pendingActiveVideoIds ?? remoteActiveVideoIds).filter(Boolean),
    [pendingActiveVideoIds, remoteActiveVideoIds]
  );
  const guideSnapshot = useMemo(
    () => (board ? buildGuideSyncSnapshot(board, workflowConfig.cadence, manualOverrideIds) : null),
    [board, workflowConfig.cadence, manualOverrideIds]
  );
  const effectiveActiveVideoIds = guideSnapshot?.selectedCardIds || [];

  useEffect(() => {
    setPendingActiveVideoIds(null);
    setIsSavingActiveVideos(false);
    setActiveVideosError(null);
    setShowActiveVideosSaved(false);
    saveActiveVideosRequestId.current = 0;
  }, [board?.id]);

  useEffect(() => {
    if (!pendingActiveVideoIds) return;
    if (!areActiveVideoIdsEqual(pendingActiveVideoIds, remoteActiveVideoIds)) return;

    setPendingActiveVideoIds(null);
    setIsSavingActiveVideos(false);
    setActiveVideosError(null);
    setShowActiveVideosSaved(true);
  }, [pendingActiveVideoIds, remoteActiveVideoIds]);

  useEffect(() => {
    if (!showActiveVideosSaved) return undefined;

    const timer = window.setTimeout(() => {
      setShowActiveVideosSaved(false);
    }, 1800);

    return () => window.clearTimeout(timer);
  }, [showActiveVideosSaved]);

  // Build video labels from selected cards
  const videoLabels = useMemo(() => {
    if (!board || !effectiveActiveVideoIds.length) return undefined;
    return effectiveActiveVideoIds.map((id, i) => {
      const card = board.cards[id];
      return card ? card.title : `Video ${String.fromCharCode(65 + i)}`;
    });
  }, [board, effectiveActiveVideoIds]);

  const weeklyPlan = useMemo(() => generateWeeklyPlan(workflowConfig, videoLabels), [workflowConfig, videoLabels]);
  const todayPlan = weeklyPlan[dayOfWeek];
  const availableCards = guideSnapshot?.availableCards || [];

  const pickerCards = useMemo(() => {
    if (!board) return [];

    const cardsById = new Map<string, (typeof availableCards)[number]>();
    availableCards.forEach((card) => cardsById.set(card.id, card));

    effectiveActiveVideoIds.forEach((cardId) => {
      const selectedCard = board.cards[cardId];
      if (selectedCard) cardsById.set(selectedCard.id, selectedCard);
    });

    return [...cardsById.values()].sort((a, b) => {
      const aIdx = board.lists.findIndex((list) => list.id === a.listId);
      const bIdx = board.lists.findIndex((list) => list.id === b.listId);
      if (aIdx !== bIdx) return aIdx - bIdx;
      return a.title.localeCompare(b.title, 'es');
    });
  }, [availableCards, board, effectiveActiveVideoIds]);
  const focusEntries = guideSnapshot?.focusCards || [];
  const hasAssignedVideos = focusEntries.length > 0;
  const activeVideosFeedback = activeVideosError
    ? { text: activeVideosError, className: 'text-red-600' }
    : isSavingActiveVideos
    ? { text: 'Guardando...', className: 'text-amber-600' }
    : showActiveVideosSaved
    ? { text: 'Guardado', className: 'text-emerald-600' }
    : null;
  const topFlowPriority = focusEntries[0] || null;
  const extraFocusEntries = guideSnapshot?.extraFocusCards || [];
  const guideAlerts = guideSnapshot?.alerts || [];
  const tasksByRole = guideSnapshot?.tasksByRole || { creador: [], editor: [], asistente: [] };
  const hasManualOverride = guideSnapshot?.hasManualOverride || false;
  const guideStats = {
    total: focusEntries.length,
    critical: guideSnapshot?.alertCounts.critical || 0,
    warning: guideSnapshot?.alertCounts.warning || 0,
    publishReady: guideSnapshot?.publishReadyCount || 0,
  };
  const guideProgress = useMemo(() => {
    const tasks = [...tasksByRole.creador, ...tasksByRole.editor, ...tasksByRole.asistente];
    const total = tasks.reduce((sum, task) => sum + task.checklistProgress.totalCount, 0);
    const done = tasks.reduce((sum, task) => sum + task.checklistProgress.completedCount, 0);

    return {
      total,
      done,
      pct: total > 0 ? Math.round((done / total) * 100) : 0,
    };
  }, [tasksByRole]);
  const selectedFocusEntries = focusEntries.map((entry, slotIndex) => ({
    ...entry,
    slotIndex,
    listName: board?.lists.find((list) => list.id === entry.card.listId)?.title || 'Sin columna',
  }));
  const selectedExtraEntries = extraFocusEntries.map((entry, slotIndex) => ({
    ...entry,
    slotIndex,
    listName: board?.lists.find((list) => list.id === entry.card.listId)?.title || 'Sin columna',
  }));
  const guideEmptyState = !board || (guideSnapshot?.availableCards.length || 0) === 0;
  // Save active video selection to Firestore
  const saveActiveVideos = useCallback(async (ids: string[]) => {
    if (!board) throw new Error('No hay tablero seleccionado.');
    if (!canEditBoard) throw new Error('Tu rol actual es solo lectura.');

    await updateBoardMeta({
      workflowConfig: {
        ...mergeWorkflowConfig(board.workflowConfig),
        activeVideoIds: ids,
      },
    });
  }, [board, canEditBoard, updateBoardMeta]);

  const selectVideo = useCallback((slotIndex: number, cardId: string | null) => {
    if (!canEditBoard) return;
    const current = normalizeActiveVideoIds([...effectiveActiveVideoIds], workflowConfig.cadence);
    if (cardId) {
      // Remove this card from any other slot first
      for (let i = 0; i < current.length; i++) {
        if (current[i] === cardId) current[i] = '';
      }
      current[slotIndex] = cardId;
    } else {
      current[slotIndex] = '';
    }

    const nextActiveVideoIds = normalizeActiveVideoIds(current, workflowConfig.cadence);
    const requestId = ++saveActiveVideosRequestId.current;

    setPendingActiveVideoIds(nextActiveVideoIds);
    setIsSavingActiveVideos(true);
    setActiveVideosError(null);
    setShowActiveVideosSaved(false);

    void saveActiveVideos(nextActiveVideoIds).catch((error) => {
      console.error('Error saving active videos:', error);
      if (requestId !== saveActiveVideosRequestId.current) return;

      setPendingActiveVideoIds(null);
      setIsSavingActiveVideos(false);
      setActiveVideosError('No se pudo guardar la seleccion. Revisa tu conexion e intentalo de nuevo.');
    });
  }, [canEditBoard, effectiveActiveVideoIds, workflowConfig.cadence, saveActiveVideos]);

  const handleResetToAutomatic = useCallback(() => {
    if (!canEditBoard) return;
    const requestId = ++saveActiveVideosRequestId.current;

    setPendingActiveVideoIds([]);
    setIsSavingActiveVideos(true);
    setActiveVideosError(null);
    setShowActiveVideosSaved(false);

    void saveActiveVideos([]).catch((error) => {
      console.error('Error resetting guide selection:', error);
      if (requestId !== saveActiveVideosRequestId.current) return;

      setPendingActiveVideoIds(null);
      setIsSavingActiveVideos(false);
      setActiveVideosError('No se pudo volver al modo automatico. Intentalo otra vez.');
    });
  }, [canEditBoard, saveActiveVideos]);

  const getGuideCardLocation = useCallback((stageId?: string | null, mode: 'summary' | 'task' = 'task'): CardModalLocation => (
    resolveGuideStageToCardLocation(stageId, mode)
  ), []);

  const handleOpenCard = useCallback((cardId: string, location: CardModalLocation = { section: 'today', focus: 'next_action' }) => {
    onRequestOpenCard?.(cardId, location);
  }, [onRequestOpenCard]);

  const handleTaskStageAction = useCallback((cardId: string, stageId: Parameters<typeof setProductionStageStatus>[1], nextStatus: 'done' | 'pending') => {
    setProductionStageStatus(cardId, stageId, nextStatus);
  }, [setProductionStageStatus]);

  const handleMoveTaskCard = useCallback((task: { cardId: string; currentColumnId: string; expectedColumnId: string | null }) => {
    if (!board || !task.expectedColumnId || task.expectedColumnId === task.currentColumnId) return;

    const sourceList = board.lists.find((list) => list.id === task.currentColumnId);
    const destinationList = board.lists.find((list) => list.id === task.expectedColumnId);
    if (!sourceList || !destinationList) return;

    moveCard(task.currentColumnId, task.expectedColumnId, 0, destinationList.cardIds.length, task.cardId);
  }, [board, moveCard]);

  const formatGuideDate = useCallback((isoDate: string) => {
    const parsed = new Date(isoDate);
    if (Number.isNaN(parsed.getTime())) return 'Sin fecha';
    return parsed.toLocaleString('es-ES', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, []);

  const getAlertSeverityMeta = useCallback((severity: 'critical' | 'warning' | 'info') => {
    if (severity === 'critical') {
      return { badge: 'Critico', card: 'border-rose-200 bg-rose-50', badgeClass: 'bg-rose-100 text-rose-700' };
    }
    if (severity === 'warning') {
      return { badge: 'Atencion', card: 'border-amber-200 bg-amber-50', badgeClass: 'bg-amber-100 text-amber-700' };
    }
    return { badge: 'Info', card: 'border-slate-200 bg-slate-50', badgeClass: 'bg-slate-100 text-slate-700' };
  }, []);

  // Toggle a checklist item
  const toggleCheck = useCallback((id: string) => {
    setCheckedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveCheckedItems(next);
      return next;
    });
  }, []);

  // Toggle expand/collapse a task
  const toggleExpand = useCallback((id: string) => {
    setExpandedTasks(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Add a custom task to a role
  const addCustomTask = useCallback((role: RoleKey) => {
    if (!newTaskText.trim()) return;
    const task: CustomTask = {
      id: `custom-${Date.now()}`,
      task: newTaskText.trim(),
      detail: newTaskDetail.trim() || 'Tarea personalizada',
      role,
    };
    const updated = [...customTasks, task];
    setCustomTasks(updated);
    saveCustomTasks(updated);
    setNewTaskText('');
    setNewTaskDetail('');
    setAddingTaskRole(null);
  }, [newTaskText, newTaskDetail, customTasks]);

  // Remove a custom task
  const removeCustomTask = useCallback((id: string) => {
    const updated = customTasks.filter(t => t.id !== id);
    setCustomTasks(updated);
    saveCustomTasks(updated);
  }, [customTasks]);

  // Reassign a task from one role to another
  const reassignTask = useCallback((taskId: string, fromRole: RoleKey, toRole: RoleKey) => {
    if (fromRole === toRole) return;
    // Remove existing reassignment for this task if any
    const filtered = reassignments.filter(r => r.taskId !== taskId);
    const updated = [...filtered, { taskId, fromRole, toRole }];
    setReassignments(updated);
    saveReassignments(updated);
  }, [reassignments]);

  // Undo a reassignment
  const undoReassign = useCallback((taskId: string) => {
    const updated = reassignments.filter(r => r.taskId !== taskId);
    setReassignments(updated);
    saveReassignments(updated);
  }, [reassignments]);

  // Build effective tasks per role (original + custom + reassignments applied)
  const effectiveTasks = useMemo(() => {
    const roles: RoleKey[] = ['creador', 'editor', 'asistente'];
    const result: Record<RoleKey, { task: TaskStep; id: string; isCustom?: boolean; reassignedFrom?: RoleKey }[]> = {
      creador: [], editor: [], asistente: [],
    };

    // Add original tasks per role
    roles.forEach(role => {
      const tasks = todayPlan[role as keyof Pick<DayPlan, 'creador' | 'editor' | 'asistente'>] || [];
      tasks.forEach((t, i) => {
        const prefix = role === 'creador' ? 'c' : role === 'editor' ? 'e' : 'a';
        const id = `${prefix}-${i}`;
        result[role].push({ task: t, id });
      });
    });

    // Apply reassignments
    reassignments.forEach(r => {
      const fromList = result[r.fromRole];
      const idx = fromList.findIndex(t => t.id === r.taskId);
      if (idx !== -1) {
        const [moved] = fromList.splice(idx, 1);
        result[r.toRole].push({ ...moved, reassignedFrom: r.fromRole });
      }
    });

    // Add custom tasks
    customTasks.forEach(ct => {
      result[ct.role].push({
        task: { task: ct.task, detail: ct.detail },
        id: ct.id,
        isCustom: true,
      });
    });

    return result;
  }, [todayPlan, reassignments, customTasks]);

  // Count total and checked tasks for progress
  const progress = useMemo(() => {
    const allIds: string[] = [];
    const countTasks = (tasks: TaskStep[], prefix: string) => {
      tasks.forEach((t, i) => {
        allIds.push(`${prefix}-${i}`);
        t.substeps?.forEach((_, si) => allIds.push(`${prefix}-${i}-s-${si}`));
      });
    };
    countTasks(todayPlan.creador, 'c');
    countTasks(todayPlan.editor, 'e');
    countTasks(todayPlan.asistente, 'a');
    const total = allIds.length;
    const done = allIds.filter(id => checkedItems.has(id)).length;
    return { total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  }, [checkedItems, todayPlan]);

  // Render a single task item
  const renderTaskItem = (task: TaskStep, taskId: string, index: number, color: typeof ROLE_COLORS.creador, currentRole: RoleKey, opts?: { isCustom?: boolean; reassignedFrom?: RoleKey }) => {
    const isChecked = checkedItems.has(taskId);
    const isExpanded = expandedTasks.has(taskId);
    const substepsDone = task.substeps?.filter((_, si) => checkedItems.has(`${taskId}-s-${si}`)).length || 0;
    const substepsTotal = task.substeps?.length || 0;
    const allSubstepsDone = substepsTotal > 0 && substepsDone === substepsTotal;
    const otherRoles = activeRoles.filter(r => r !== currentRole) as RoleKey[];

    return (
      <div key={taskId} className={`rounded-xl border overflow-hidden transition-all duration-200 ${isChecked || allSubstepsDone ? 'opacity-60' : ''}`} style={{ borderColor: color.border, background: color.bgLight }}>
        {/* Task header */}
        <div className="flex items-start gap-2 p-3 cursor-pointer" onClick={() => toggleExpand(taskId)}>
          <button
            onClick={(e) => { e.stopPropagation(); toggleCheck(taskId); }}
            className="mt-0.5 shrink-0 transition-colors"
          >
            {isChecked || allSubstepsDone
              ? <CheckCircle2 size={18} className={color.check} />
              : <Circle size={18} className="text-gray-300 hover:text-gray-400" />
            }
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${color.bg} ${color.text}`}>{index + 1}</span>
              <p className={`text-sm font-semibold ${isChecked || allSubstepsDone ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                {task.task}
              </p>
              {opts?.reassignedFrom && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-600 flex items-center gap-0.5">
                  <ArrowRightLeft size={8} /> de {ROLE_LABELS[opts.reassignedFrom]}
                </span>
              )}
              {opts?.isCustom && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">Personalizada</span>
              )}
              {task.difficulty && (
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                  task.difficulty === 'beginner' ? 'bg-green-100 text-green-600' :
                  task.difficulty === 'intermediate' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-red-100 text-red-600'
                }`}>
                  {task.difficulty === 'beginner' ? 'Basico' : task.difficulty === 'intermediate' ? 'Medio' : 'Avanzado'}
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{task.detail}</p>
            {substepsTotal > 0 && (
              <div className="flex items-center gap-2 mt-1.5">
                <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-300 ${color.accent}`} style={{ width: `${(substepsDone / substepsTotal) * 100}%` }} />
                </div>
                <span className="text-[10px] text-gray-400 font-medium shrink-0">{substepsDone}/{substepsTotal}</span>
              </div>
            )}
          </div>
          <div className="shrink-0 mt-1">
            {isExpanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
          </div>
        </div>

        {/* Expanded content */}
        {isExpanded && (
          <div className="px-3 pb-3 space-y-2" style={{ borderTop: `1px solid ${color.border}` }}>
            {task.tip && (
              <div className="flex items-start gap-2 mt-2 p-2.5 bg-amber-50 rounded-lg border border-amber-200">
                <Lightbulb size={14} className="text-amber-500 mt-0.5 shrink-0" />
                <p className="text-[11px] text-amber-800 leading-snug font-medium">{task.tip}</p>
              </div>
            )}
            {task.substeps && task.substeps.length > 0 && (
              <div className="space-y-1 mt-2">
                <p className="text-[10px] font-bold uppercase text-gray-400 mb-1">Pasos</p>
                {task.substeps.map((sub, si) => {
                  const subId = `${taskId}-s-${si}`;
                  const subChecked = checkedItems.has(subId);
                  return (
                    <button
                      key={subId}
                      onClick={() => toggleCheck(subId)}
                      className="flex items-start gap-2 w-full text-left p-1.5 rounded-md hover:bg-white/50 transition-colors"
                    >
                      {subChecked
                        ? <CheckCircle2 size={14} className={`${color.check} mt-0.5 shrink-0`} />
                        : <Circle size={14} className="text-gray-300 mt-0.5 shrink-0" />
                      }
                      <span className={`text-[11px] leading-snug ${subChecked ? 'line-through text-gray-400' : 'text-gray-700'}`}>{sub}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Reassign / Delete actions */}
            <div className="flex items-center gap-2 mt-2 pt-2" style={{ borderTop: `1px dashed ${color.border}` }}>
              {opts?.reassignedFrom ? (
                <button
                  onClick={(e) => { e.stopPropagation(); undoReassign(taskId); }}
                  className="text-[10px] font-semibold text-purple-600 hover:text-purple-800 flex items-center gap-1 px-2 py-1 rounded-md hover:bg-purple-50 transition-colors"
                >
                  <ArrowRightLeft size={10} /> Devolver a {ROLE_LABELS[opts.reassignedFrom]}
                </button>
              ) : otherRoles.length > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-gray-400 font-medium">Mover a:</span>
                  {otherRoles.map(r => {
                    const rc = ROLE_COLORS[r as keyof typeof ROLE_COLORS];
                    return (
                      <button
                        key={r}
                        onClick={(e) => { e.stopPropagation(); reassignTask(taskId, currentRole, r); }}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors hover:opacity-80 ${rc.bg} ${rc.text}`}
                      >
                        {ROLE_LABELS[r]}
                      </button>
                    );
                  })}
                </div>
              )}
              {opts?.isCustom && (
                <button
                  onClick={(e) => { e.stopPropagation(); removeCustomTask(taskId); }}
                  className="text-[10px] font-semibold text-red-500 hover:text-red-700 px-2 py-1 rounded-md hover:bg-red-50 transition-colors ml-auto"
                >
                  Eliminar
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render add-task form for a role
  const renderAddTaskForm = (role: RoleKey, color: typeof ROLE_COLORS.creador) => (
    <>
      {addingTaskRole === role ? (
        <div className="rounded-xl border-2 border-dashed p-3 space-y-2" style={{ borderColor: color.border }}>
          <input
            type="text"
            placeholder="Nombre de la tarea..."
            value={newTaskText}
            onChange={e => setNewTaskText(e.target.value)}
            autoFocus
            className="w-full text-sm font-semibold px-2 py-1.5 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            style={{ background: `var(--ff-input-bg)`, borderColor: `var(--ff-input-border)`, color: `var(--ff-text-primary)` }}
            onKeyDown={e => { if (e.key === 'Enter' && newTaskText.trim()) addCustomTask(role); if (e.key === 'Escape') setAddingTaskRole(null); }}
          />
          <input
            type="text"
            placeholder="Descripcion breve (opcional)..."
            value={newTaskDetail}
            onChange={e => setNewTaskDetail(e.target.value)}
            className="w-full text-xs px-2 py-1.5 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            style={{ background: `var(--ff-input-bg)`, borderColor: `var(--ff-input-border)`, color: `var(--ff-text-primary)` }}
            onKeyDown={e => { if (e.key === 'Enter' && newTaskText.trim()) addCustomTask(role); if (e.key === 'Escape') setAddingTaskRole(null); }}
          />
          <div className="flex gap-2">
            <button
              onClick={() => addCustomTask(role)}
              disabled={!newTaskText.trim()}
              className={`text-[11px] font-bold px-3 py-1.5 rounded-lg text-white transition-colors ${newTaskText.trim() ? `${color.accent} hover:opacity-90` : 'bg-gray-300 cursor-not-allowed'}`}
            >
              Agregar
            </button>
            <button
              onClick={() => { setAddingTaskRole(null); setNewTaskText(''); setNewTaskDetail(''); }}
              className="text-[11px] font-medium px-3 py-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => { setAddingTaskRole(role); setNewTaskText(''); setNewTaskDetail(''); }}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border-2 border-dashed text-[11px] font-semibold transition-all hover:scale-[1.01]"
          style={{ borderColor: color.border, color: color.text.replace('text-', '').includes('blue') ? '#3b82f6' : color.text.includes('orange') ? '#f97316' : '#10b981' }}
        >
          <Plus size={13} />
          Agregar tarea
        </button>
      )}
    </>
  );

  // Active roles for display
  const activeRoles = workflowConfig.roles;

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  const guideDrawer = isOpen && typeof document !== 'undefined'
    ? createPortal(
        <div className="fixed inset-0 z-50 flex justify-end overflow-hidden">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm ff-fade-in"
            onClick={() => setIsOpen(false)}
          />

          <div
            className="ff-team-guide ff-slide-in-right relative h-full w-full sm:max-w-xl flex flex-col"
            style={{
              background: `var(--ff-surface-solid)`,
              boxShadow: '-12px 0 40px rgba(0,0,0,0.2), inset 1px 0 0 var(--ff-border-medium)',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4" style={{ borderBottom: `1px solid var(--ff-border)`, background: `var(--ff-bg-subtle)` }}>
          <div className="flex items-center space-x-2" style={{ color: `var(--ff-text-primary)` }}>
            <Info size={20} className="text-blue-600" />
            <div>
              <h2 className="text-lg font-semibold">Guia del Equipo</h2>
              <p className="text-[10px]" style={{ color: `var(--ff-text-tertiary)` }}>{dayName} {today.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}</p>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="hover:bg-red-500/10 transition-colors p-1.5 rounded-md"
            style={{ color: `var(--ff-text-tertiary)` }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-1 shrink-0" style={{ borderBottom: `1px solid var(--ff-border-medium)`, background: `var(--ff-surface-solid)` }}>
          {([
            { id: 'today' as const, label: 'Hoy', icon: <Target size={13} /> },
            { id: 'workflow' as const, label: 'Semana', icon: <Calendar size={13} /> },
            { id: 'roles' as const, label: 'Roles', icon: <Users size={13} /> },
            { id: 'strategy' as const, label: 'Estrategia', icon: <Sparkles size={13} /> },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-1 px-2.5 py-2.5 text-[11px] font-semibold transition-colors border-b-2"
              style={tab === t.id
                ? { color: `var(--ff-primary)`, borderColor: `var(--ff-primary)` }
                : { color: `var(--ff-text-tertiary)`, borderColor: 'transparent' }}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="ff-scrollbar flex-1 overflow-y-auto p-5 space-y-5">

          {/* === TAB: HOY === */}
          {tab === 'today' && (
            <>
              {topFlowPriority ? (
                <div className={`rounded-xl p-4 text-white ${
                  topFlowPriority.summary.scheduleStatus === 'blocked'
                    ? 'bg-gradient-to-r from-rose-600 to-red-600'
                    : topFlowPriority.summary.scheduleStatus === 'overdue'
                    ? 'bg-gradient-to-r from-orange-600 to-rose-600'
                    : topFlowPriority.summary.scheduleStatus === 'at_risk'
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500'
                    : topFlowPriority.summary.scheduleStatus === 'extra_active'
                    ? 'bg-gradient-to-r from-sky-600 to-cyan-600'
                    : topFlowPriority.summary.scheduleStatus === 'idea'
                    ? 'bg-gradient-to-r from-slate-500 to-slate-700'
                    : 'bg-gradient-to-r from-blue-500 to-indigo-600'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Flame size={16} />
                    <span className="text-[10px] uppercase font-bold tracking-wider opacity-80">Ahora mismo</span>
                    {hasManualOverride && (
                      <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full ml-auto bg-white/20">Manual</span>
                    )}
                  </div>
                  <p className="text-base font-bold mb-1 truncate">"{topFlowPriority.card.title}"</p>
                  <p className="text-[11px] leading-snug opacity-90">
                    {topFlowPriority.currentStage.label} · {topFlowPriority.currentStage.deliverable}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-semibold">
                    <span className="rounded-full bg-white/15 px-2.5 py-1">{getScheduleStatusLabel(topFlowPriority.summary.scheduleStatus)}</span>
                    <span className="rounded-full bg-white/15 px-2.5 py-1">Rol: {getAuditRoleLabel(topFlowPriority.currentStage.ownerRole)}</span>
                    <span className="rounded-full bg-white/15 px-2.5 py-1">
                      {topFlowPriority.summary.isKickoffPending
                        ? 'Sin arranque'
                        : `Dia ${topFlowPriority.summary.workingDaysElapsed}/${topFlowPriority.summary.workingDaysBudget}`}
                    </span>
                    <span className="rounded-full bg-white/15 px-2.5 py-1">Checklist: {topFlowPriority.checklistProgress.completedCount}/{topFlowPriority.checklistProgress.totalCount}</span>
                    {topFlowPriority.hasDraftPending && <span className="rounded-full bg-white/15 px-2.5 py-1">Draft IA listo</span>}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => handleOpenCard(topFlowPriority.card.id, getGuideCardLocation(topFlowPriority.currentStage.id, 'summary'))}
                      className="min-h-10 rounded-xl bg-white/15 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20 transition-colors"
                    >
                      Abrir tarjeta
                    </button>
                    {canEditBoard && topFlowPriority.summary.isColumnMismatch && topFlowPriority.summary.expectedColumnId && (
                      <button
                        onClick={() => handleMoveTaskCard({
                          cardId: topFlowPriority.card.id,
                          currentColumnId: topFlowPriority.card.listId,
                          expectedColumnId: topFlowPriority.summary.expectedColumnId,
                        })}
                        className="min-h-10 rounded-xl bg-white/15 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20 transition-colors"
                      >
                        Mover a {topFlowPriority.summary.expectedColumnTitle || 'columna esperada'}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-4 text-white">
                  <p className="text-[10px] uppercase font-bold text-blue-200 mb-1">Guia sincronizada</p>
                  <h3 className="text-lg font-bold mb-1">Todavia no hay videos guiados en foco</h3>
                  <p className="text-[11px] text-blue-100 leading-snug">
                    Crea videos con Nuevo video guiado y la Guia empezara a priorizar automaticamente lo que se debe hacer hoy.
                  </p>
                </div>
              )}

              <section>
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-xs font-bold uppercase flex items-center gap-1.5" style={{ color: `var(--ff-text-secondary)` }}>
                    <Clapperboard size={13} className="text-indigo-500" />
                    Videos en foco
                  </h3>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {activeVideosFeedback && (
                      <span className={`text-[10px] font-semibold ${activeVideosFeedback.className}`}>
                        {activeVideosFeedback.text}
                      </span>
                    )}
                    <span className={`text-[10px] font-semibold px-2 py-1 rounded-lg ${hasManualOverride ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {hasManualOverride ? 'Override manual' : 'Auto top urgentes'}
                    </span>
                    {canEditBoard ? (
                      <>
                        {hasManualOverride && (
                          <button
                            onClick={() => handleResetToAutomatic()}
                            className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 hover:text-emerald-700 px-2 py-1 rounded-lg hover:bg-emerald-50 transition-colors"
                          >
                            <Zap size={11} />
                            Volver a automatico
                          </button>
                        )}
                        <button
                          onClick={() => setShowVideoPicker(!showVideoPicker)}
                          className="flex items-center gap-1 text-[10px] font-semibold text-indigo-600 hover:text-indigo-700 px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors"
                        >
                          <Settings2 size={11} />
                          {showVideoPicker ? 'Cerrar selector' : 'Elegir videos'}
                        </button>
                      </>
                    ) : (
                      <span className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-slate-100 text-slate-700">
                        Solo lectura
                      </span>
                    )}
                  </div>
                </div>

                {hasAssignedVideos ? (
                  <div className="space-y-2">
                    {selectedFocusEntries.map((entry) => {
                      const scheduleMeta = getScheduleVisualMeta(entry.summary.scheduleStatus);
                      return (
                        <div key={entry.card.id} className={`rounded-xl border p-3 ${entry.summary.isColumnMismatch ? 'border-amber-200 bg-amber-50/60' : scheduleMeta.card}`}>
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full shrink-0 bg-indigo-100 text-indigo-700">
                                  Foco {entry.slotIndex + 1}
                                </span>
                                <p className="text-sm font-bold truncate" style={{ color: `var(--ff-text-primary)` }}>{entry.card.title}</p>
                                <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-full shrink-0 ${scheduleMeta.chip}`}>
                                  {getScheduleStatusLabel(entry.summary.scheduleStatus)}
                                </span>
                                <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full shrink-0 bg-white text-slate-700 border border-slate-200">
                                  {entry.currentStage.label}
                                </span>
                              </div>
                              <p className="text-[10px] leading-snug" style={{ color: `var(--ff-text-secondary)` }}>
                                {entry.currentStage.deliverable}
                              </p>
                              <div className="mt-2 flex items-center gap-3 text-[10px] flex-wrap" style={{ color: `var(--ff-text-tertiary)` }}>
                                <span>Rol: <strong style={{ color: `var(--ff-text-secondary)` }}>{getAuditRoleLabel(entry.currentStage.ownerRole)}</strong></span>
                                <span>Columna: <strong style={{ color: `var(--ff-text-secondary)` }}>{entry.listName}</strong></span>
                                <span>
                                  Ciclo: <strong style={{ color: `var(--ff-text-secondary)` }}>
                                    {entry.summary.isKickoffPending
                                      ? 'Sin arranque'
                                      : `Dia ${entry.summary.workingDaysElapsed}/${entry.summary.workingDaysBudget}`}
                                  </strong>
                                </span>
                                <span>Checklist: <strong style={{ color: `var(--ff-text-secondary)` }}>{entry.checklistProgress.completedCount}/{entry.checklistProgress.totalCount}</strong></span>
                              </div>
                              {entry.summary.isColumnMismatch && (
                                <p className="text-[10px] mt-1 font-semibold text-amber-700">
                                  El flujo espera {entry.summary.expectedColumnTitle || 'otra columna'} y el tablero sigue en {entry.listName}.
                                </p>
                              )}
                              {entry.hasDraftPending && (
                                <p className="text-[10px] mt-1 font-semibold text-indigo-600">
                                  Hay borrador IA listo para validar en esta etapa o la siguiente.
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl border-2 border-dashed p-4 text-center" style={{ borderColor: `var(--ff-border-medium)` }}>
                    <Clapperboard size={24} className="text-gray-300 mx-auto mb-2" />
                    <p className="text-xs font-medium" style={{ color: `var(--ff-text-tertiary)` }}>
                      {guideEmptyState
                        ? 'Todavia no hay cards con flujo guiado para sincronizar.'
                        : 'La guia no encontro videos en foco ahora mismo.'}
                    </p>
                  </div>
                )}

                {showVideoPicker && canEditBoard && (
                  <div className="mt-2 rounded-xl border p-3 space-y-2.5" style={{ background: `var(--ff-bg-subtle)`, borderColor: `var(--ff-border)` }}>
                    {Array.from({ length: workflowConfig.cadence }).map((_, slotIdx) => {
                      const selectedId = effectiveActiveVideoIds[slotIdx] || '';
                      const selectedCard = selectedId ? board?.cards[selectedId] : null;
                      const selectedListName = selectedCard ? board?.lists.find((list) => list.id === selectedCard.listId)?.title || '' : '';
                      return (
                        <div key={slotIdx}>
                          <p className="text-[10px] font-bold text-gray-500 mb-1">Foco {slotIdx + 1}</p>
                          {selectedId && (
                            <p className="text-[10px] mb-1.5" style={{ color: `var(--ff-text-secondary)` }}>
                              {selectedCard
                                ? `Asignado: ${selectedCard.title}${selectedListName ? ` (${selectedListName})` : ''}`
                                : 'Asignado: tarjeta no disponible en el tablero'}
                            </p>
                          )}
                          <select
                            value={selectedId}
                            onChange={(e) => selectVideo(slotIdx, e.target.value || null)}
                            disabled={!canEditBoard}
                            className="w-full rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                            style={{ background: `var(--ff-input-bg)`, border: `1px solid var(--ff-input-border)`, color: `var(--ff-text-primary)` }}
                          >
                            <option value="">— Seleccionar video guiado —</option>
                            {selectedId && !selectedCard && (
                              <option value={selectedId}>Tarjeta asignada no disponible</option>
                            )}
                            {pickerCards.map((card) => {
                              const listName = board?.lists.find((list) => list.id === card.listId)?.title || '';
                              const alreadyUsed = effectiveActiveVideoIds.includes(card.id) && effectiveActiveVideoIds[slotIdx] !== card.id;
                              return (
                                <option key={card.id} value={card.id} disabled={alreadyUsed}>
                                  {card.title} ({listName}){alreadyUsed ? ' [ya asignado]' : ''}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section>
                <h3 className="text-xs font-bold uppercase text-gray-500 mb-2 flex items-center gap-1.5">
                  <Hand size={13} className="text-sky-500" />
                  Trabajo extra activo
                </h3>
                {selectedExtraEntries.length > 0 ? (
                  <div className="space-y-2">
                    {selectedExtraEntries.map((entry) => (
                      <div key={entry.card.id} className="rounded-xl border border-sky-200 bg-sky-50/70 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold" style={{ color: `var(--ff-text-primary)` }}>{entry.card.title}</p>
                              <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700">
                                Trabajo extra
                              </span>
                              <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-white border border-slate-200 text-slate-700">
                                {entry.currentStage.label}
                              </span>
                            </div>
                            <p className="mt-1 text-[10px] leading-snug" style={{ color: `var(--ff-text-secondary)` }}>
                              {entry.currentStage.deliverable}
                            </p>
                            <div className="mt-2 flex items-center gap-3 text-[10px] flex-wrap" style={{ color: `var(--ff-text-tertiary)` }}>
                              <span>Rol: <strong style={{ color: `var(--ff-text-secondary)` }}>{getAuditRoleLabel(entry.currentStage.ownerRole)}</strong></span>
                              <span>Ciclo: <strong style={{ color: `var(--ff-text-secondary)` }}>
                                {entry.summary.isKickoffPending ? 'Sin arranque' : `Dia ${entry.summary.workingDaysElapsed}/${entry.summary.workingDaysBudget}`}
                              </strong></span>
                            </div>
                          </div>
                          <button
                            onClick={() => handleOpenCard(entry.card.id, getGuideCardLocation(entry.currentStage.id, 'summary'))}
                            className="min-h-9 shrink-0 rounded-xl px-3 py-2 text-[11px] font-semibold"
                            style={{ background: `var(--ff-bg-subtle)`, color: `var(--ff-text-primary)` }}
                          >
                            Abrir tarjeta
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed p-3 text-[11px]" style={{ borderColor: `#bae6fd`, color: `var(--ff-text-tertiary)` }}>
                    No hay videos extra activos fuera del foco principal ahora mismo.
                  </div>
                )}
              </section>

              <section>
                <h3 className="text-xs font-bold uppercase text-gray-500 mb-2 flex items-center gap-1.5">
                  <AlertTriangle size={13} className="text-orange-500" />
                  Pendientes clave
                </h3>
                {guideAlerts.length > 0 ? (
                  <div className="space-y-2">
                    {guideAlerts.map((alert) => {
                      const severityMeta = getAlertSeverityMeta(alert.severity);
                      return (
                        <div key={alert.id} className={`rounded-xl border p-3 ${severityMeta.card}`}>
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-full ${severityMeta.badgeClass}`}>{severityMeta.badge}</span>
                            <p className="text-sm font-bold" style={{ color: `var(--ff-text-primary)` }}>{alert.cardTitle}</p>
                          </div>
                          <p className="text-[11px] font-semibold" style={{ color: `var(--ff-text-primary)` }}>{alert.title}</p>
                          <p className="text-[10px] mt-1 leading-snug" style={{ color: `var(--ff-text-secondary)` }}>{alert.description}</p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5">
                    <p className="text-xs font-semibold text-emerald-700">Sin alertas criticas ni warnings en los videos en foco.</p>
                  </div>
                )}
              </section>

              <div className="grid grid-cols-4 gap-2">
                <QuickStat label="En foco" value={guideStats.total} color="text-blue-600" />
                <QuickStat label="Criticas" value={guideStats.critical} color={guideStats.critical > 0 ? 'text-red-600' : 'text-green-600'} />
                <QuickStat label="Warnings" value={guideStats.warning} color={guideStats.warning > 0 ? 'text-amber-600' : 'text-green-600'} />
                <QuickStat label="Listos" value={guideStats.publishReady} color="text-indigo-600" />
              </div>

              {activeRoles.map((role) => {
                const roleKey = role as RoleKey;
                const items = tasksByRole[roleKey] || [];
                const color = ROLE_COLORS[roleKey];

                return (
                  <section key={role}>
                    <h3 className={`text-xs font-bold uppercase mb-2 flex items-center gap-1.5 ${color.text}`}>
                      <Users size={13} />
                      {ROLE_LABELS[role]} — {items.length} tarea{items.length !== 1 ? 's' : ''}
                    </h3>

                    {items.length > 0 ? (
                      <div className="space-y-2">
                        {items.map((task, index) => {
                          const scheduleMeta = getScheduleVisualMeta(task.scheduleStatus);
                          return (
                            <div key={task.id} className={`rounded-xl border overflow-hidden ${task.isColumnMismatch ? 'border-amber-200 bg-amber-50/80' : scheduleMeta.card}`}>
                              <div className="p-3">
                                <div className="flex items-start gap-2">
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${color.bg} ${color.text}`}>{index + 1}</span>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className="text-sm font-semibold" style={{ color: `var(--ff-text-primary)` }}>{task.cardTitle}</p>
                                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${scheduleMeta.chip}`}>{getScheduleStatusLabel(task.scheduleStatus)}</span>
                                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white border border-slate-200 text-slate-700">{task.stageLabel}</span>
                                      {task.isColumnMismatch && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Desalineada</span>}
                                      {task.hasDraftPending && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">Draft IA listo</span>}
                                    </div>
                                    <p className="text-[11px] mt-1 leading-snug" style={{ color: `var(--ff-text-secondary)` }}>{task.deliverable}</p>
                                    <div className="flex items-center gap-3 mt-2 text-[10px] flex-wrap" style={{ color: `var(--ff-text-tertiary)` }}>
                                      <span>
                                        Ciclo: <strong style={{ color: `var(--ff-text-secondary)` }}>
                                          {task.isKickoffPending ? 'Sin arranque' : `Dia ${task.workingDaysElapsed}/${task.workingDaysBudget}`}
                                        </strong>
                                      </span>
                                      <span>Checklist: <strong style={{ color: `var(--ff-text-secondary)` }}>{task.checklistProgress.completedCount}/{task.checklistProgress.totalCount}</strong></span>
                                      <span>Columna: <strong style={{ color: `var(--ff-text-secondary)` }}>{task.currentColumnTitle}</strong></span>
                                    </div>
                                    {task.checklistProgress.pendingItems.length > 0 && (
                                      <div className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-[10px] leading-snug" style={{ color: `var(--ff-text-secondary)` }}>
                                        Pendiente: {task.checklistProgress.pendingItems.slice(0, 2).join(' · ')}
                                        {task.checklistProgress.pendingItems.length > 2 ? '…' : ''}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2" style={{ borderColor: `var(--ff-border)` }}>
                                <button
                                  onClick={() => handleOpenCard(task.cardId, getGuideCardLocation(task.stageId, 'task'))}
                                  className="min-h-9 rounded-xl px-3 py-2 text-[11px] font-semibold"
                                  style={{ background: `var(--ff-bg-subtle)`, color: `var(--ff-text-primary)` }}
                                >
                                  Abrir tarjeta
                                </button>
                                {canEditBoard && (
                                  <button
                                    onClick={() => handleTaskStageAction(task.cardId, task.stageId, task.status === 'done' ? 'pending' : 'done')}
                                    className="min-h-9 rounded-xl px-3 py-2 text-[11px] font-semibold text-white"
                                    style={{ background: task.status === 'done' ? '#64748b' : '#2563eb' }}
                                  >
                                    {task.status === 'done'
                                      ? 'Reabrir'
                                      : task.stageId === 'idea' && task.isKickoffPending
                                      ? 'Aprobar idea e iniciar'
                                      : 'Marcar etapa lista'}
                                  </button>
                                )}
                                {canEditBoard && task.isColumnMismatch && task.expectedColumnId && (
                                  <button
                                    onClick={() => handleMoveTaskCard(task)}
                                    className="min-h-9 rounded-xl px-3 py-2 text-[11px] font-semibold"
                                    style={{ background: `#fff7ed`, color: `#c2410c` }}
                                  >
                                    Mover a {task.expectedColumnTitle || 'columna esperada'}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed p-3 text-[11px]" style={{ borderColor: color.border, color: `var(--ff-text-tertiary)` }}>
                        No hay tareas en foco para {ROLE_LABELS[role]} ahora mismo.
                      </div>
                    )}
                  </section>
                );
              })}

              <div className="rounded-xl border border-gray-200 p-3" style={{ background: `var(--ff-card-bg)` }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-700">Progreso operativo del foco actual</span>
                  <span className={`text-sm font-extrabold ${guideProgress.pct === 100 ? 'text-green-600' : 'text-blue-600'}`}>{guideProgress.pct}%</span>
                </div>
                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${guideProgress.pct === 100 ? 'bg-green-500' : 'bg-gradient-to-r from-blue-500 to-indigo-500'}`}
                    style={{ width: `${guideProgress.pct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[10px] text-gray-400">{guideProgress.done} de {guideProgress.total} items de checklist completados</span>
                  {guideProgress.pct === 100 && <span className="text-[10px] font-bold text-green-600">Foco al dia</span>}
                </div>
              </div>
            </>
          )}
          {/* === TAB: SEMANA COMPLETA === */}
          {tab === 'workflow' && (
            <>
              {/* â•â•â• Pipeline Timeline Grid â•â•â• */}
              <section>
                <div className="flex items-center space-x-2 mb-3" style={{ color: `var(--ff-text-primary)` }}>
                  <Film size={18} className="text-indigo-600" />
                  <h3 className="font-semibold text-lg">Timeline de Pipelines</h3>
                </div>
                <div className="rounded-xl border overflow-hidden shadow-sm" style={{ background: `var(--ff-surface-solid)`, borderColor: `var(--ff-border)` }}>
                  {/* Day header row */}
                  <div className="grid grid-cols-8 text-center text-[9px] font-bold border-b" style={{ borderColor: `var(--ff-border)`, background: `var(--ff-bg-subtle)` }}>
                    <div className="p-2" style={{ color: `var(--ff-text-tertiary)` }} />
                    {[1, 2, 3, 4, 5, 6, 0].map(d => (
                      <div key={d} className={`p-2 ${d === dayOfWeek ? 'bg-blue-600 text-white rounded-t' : ''}`} style={d !== dayOfWeek ? { color: `var(--ff-text-secondary)` } : {}}>
                        {DAY_NAMES[d].slice(0, 3)}
                      </div>
                    ))}
                  </div>
                  {/* One row per pipeline video */}
                  {Array.from({ length: workflowConfig.cadence }).map((_, pIdx) => {
                    const cardId = effectiveActiveVideoIds[pIdx];
                    const card = cardId && board ? board.cards[cardId] : null;
                    const label = card ? card.title : `Pipeline ${pIdx + 1}`;
                    return (
                      <div key={pIdx} className="grid grid-cols-8 border-b last:border-b-0" style={{ borderColor: `var(--ff-border)` }}>
                        <div className="p-2 text-[10px] font-bold truncate flex items-center" style={{ color: `var(--ff-text-primary)` }} title={label}>
                          {label.length > 12 ? label.slice(0, 12) + 'â€¦' : label}
                        </div>
                        {[1, 2, 3, 4, 5, 6, 0].map(d => {
                          const phaseId = getScheduledPhase(d, pIdx, workflowConfig.cadence);
                          const phase = PHASE_MATRIX[phaseId];
                          if (!phase) return <div key={d} className="p-1.5" />;
                          const leaderColor = phase.leader === 'editor' ? 'bg-orange-100 text-orange-700 border-orange-200' : phase.leader === 'asistente' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-blue-100 text-blue-700 border-blue-200';
                          const isToday = d === dayOfWeek;
                          return (
                            <div key={d} className={`p-1 flex items-center justify-center ${isToday ? 'bg-blue-50' : ''}`}>
                              <span className={`text-[8px] font-bold px-1 py-0.5 rounded border leading-none ${leaderColor}`} title={`${phase.label} â€” ${ROLE_LABELS[phase.leader]}`}>
                                {phase.shortLabel}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                  {/* Legend */}
                  <div className="flex items-center gap-3 px-3 py-2" style={{ background: `var(--ff-bg-subtle)`, borderTop: `1px solid var(--ff-border)` }}>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Creador</span>
                    {activeRoles.includes('editor') && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">Editor</span>}
                    {activeRoles.includes('asistente') && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">Asistente</span>}
                    <span className="text-[9px] ml-auto" style={{ color: `var(--ff-text-tertiary)` }}>{getWorkflowDescription(workflowConfig)}</span>
                  </div>
                </div>
              </section>

              {/* â•â•â• Daily Focus Summary â•â•â• */}
              <section>
                <div className="flex items-center space-x-2 mb-3" style={{ color: `var(--ff-text-primary)` }}>
                  <Calendar size={18} className="text-blue-600" />
                  <h3 className="font-semibold text-lg">Resumen por Dia</h3>
                </div>
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5, 6, 0].map(d => {
                    const plan = weeklyPlan[d];
                    const isToday = d === dayOfWeek;
                    const pipelines = plan.pipelines || [];
                    return (
                      <div key={d} className={`rounded-lg border overflow-hidden ${isToday ? 'border-blue-400 ring-2 ring-blue-200' : ''}`} style={{ borderColor: isToday ? undefined : `var(--ff-border)`, background: `var(--ff-surface-solid)` }}>
                        <div className={`flex items-center justify-between px-3 py-2 ${isToday ? 'bg-blue-600 text-white' : ''}`} style={!isToday ? { background: `var(--ff-bg-subtle)` } : {}}>
                          <span className={`text-xs font-bold ${isToday ? 'text-white' : ''}`} style={!isToday ? { color: `var(--ff-text-primary)` } : {}}>
                            {DAY_NAMES[d]} {isToday && 'â† HOY'}
                          </span>
                          <span className={`text-[10px] font-semibold ${isToday ? 'text-blue-200' : ''}`} style={!isToday ? { color: `var(--ff-text-tertiary)` } : {}}>
                            {plan.focus || 'Descanso'}
                          </span>
                        </div>
                        {pipelines.length > 0 && (
                          <div className="px-3 py-2.5 space-y-1.5">
                            {pipelines.map((p, i) => {
                              // Find the phase to get leader and deliverable
                              const phaseId = getScheduledPhase(d, i, workflowConfig.cadence);
                              const phaseDef = PHASE_MATRIX[phaseId];
                              return (
                                <div key={i} className="flex items-start gap-2">
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 shrink-0">{p.label}</span>
                                  <div className="min-w-0">
                                    <p className="text-[11px] font-semibold" style={{ color: `var(--ff-text-primary)` }}>{p.phase}</p>
                                    {phaseDef && (
                                      <p className="text-[10px]" style={{ color: `var(--ff-text-tertiary)` }}>
                                        <span className={`font-bold ${ROLE_COLORS[phaseDef.leader as keyof typeof ROLE_COLORS]?.text || ''}`}>{ROLE_LABELS[phaseDef.leader]}</span> lidera Â· {phaseDef.deliverable}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* â•â•â• Work Distribution Matrix â•â•â• */}
              <section>
                <div className="flex items-center space-x-2 mb-3" style={{ color: `var(--ff-text-primary)` }}>
                  <Target size={18} className="text-purple-600" />
                  <h3 className="font-semibold text-lg">Distribucion por Fase</h3>
                </div>
                <div className="rounded-xl border overflow-hidden shadow-sm" style={{ background: `var(--ff-surface-solid)`, borderColor: `var(--ff-border)` }}>
                  {Object.values(PHASE_MATRIX).map((phase) => {
                    const leaderColor = ROLE_COLORS[phase.leader as keyof typeof ROLE_COLORS];
                    const supporters = phase.supporter.filter(s => activeRoles.includes(s));
                    return (
                      <div key={phase.id} className="border-b last:border-b-0 p-3" style={{ borderColor: `var(--ff-border)` }}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={`text-[10px] font-bold text-white px-2 py-0.5 rounded-full ${leaderColor.badge}`}>{ROLE_LABELS[phase.leader]}</span>
                          <span className="text-xs font-bold" style={{ color: `var(--ff-text-primary)` }}>{phase.label}</span>
                          <span className="text-[9px] font-medium ml-auto" style={{ color: `var(--ff-text-tertiary)` }}>{phase.estimatedHours}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                          <div>
                            <span style={{ color: `var(--ff-text-tertiary)` }}>Entregable: </span>
                            <span className="font-medium" style={{ color: `var(--ff-text-secondary)` }}>{phase.deliverable}</span>
                          </div>
                          <div>
                            <span style={{ color: `var(--ff-text-tertiary)` }}>Apoya: </span>
                            <span className="font-medium" style={{ color: `var(--ff-text-secondary)` }}>{supporters.length > 0 ? supporters.map(s => ROLE_LABELS[s]).join(', ') : 'â€”'}</span>
                          </div>
                          <div>
                            <span style={{ color: `var(--ff-text-tertiary)` }}>Done: </span>
                            <span className="font-medium" style={{ color: `var(--ff-text-secondary)` }}>{phase.doneCondition}</span>
                          </div>
                          <div>
                            <span className="text-orange-500">Riesgo: </span>
                            <span className="font-medium text-orange-600">{phase.typicalRisk}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* â•â•â• Referencia (colapsable) â•â•â• */}
              <section>
                <button
                  onClick={() => setExpandedTasks(prev => {
                    const next = new Set(prev);
                    if (next.has('week-ref')) next.delete('week-ref');
                    else next.add('week-ref');
                    return next;
                  })}
                  className="flex items-center gap-2 w-full text-left mb-2"
                >
                  {expandedTasks.has('week-ref') ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span className="text-xs font-bold uppercase" style={{ color: `var(--ff-text-tertiary)` }}>Referencia: Tiempos y Carpetas</span>
                </button>
                {expandedTasks.has('week-ref') && (
                  <div className="space-y-4">
                    {/* Tiempos */}
                    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="text-left p-2.5 font-semibold text-gray-600">Fase</th>
                            <th className="text-center p-2.5 font-semibold text-gray-600">Quien</th>
                            <th className="text-center p-2.5 font-semibold text-gray-600">Tiempo</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {[
                            { phase: 'Idea + Investigacion', who: activeRoles.includes('asistente') ? 'C + A' : 'Creador', time: '1-2h' },
                            { phase: 'Titulos (Metodo Linden)', who: 'Creador', time: '30-60 min' },
                            { phase: 'Guion completo', who: 'Creador', time: '2-4h' },
                            { phase: 'Grabacion', who: 'Creador', time: '2-6h' },
                            { phase: 'Edicion (primer corte)', who: activeRoles.includes('editor') ? 'Editor' : 'Creador', time: '6-12h' },
                            { phase: 'Review + cambios', who: activeRoles.includes('editor') ? 'Ambos' : 'Creador', time: '1-2h' },
                            { phase: 'Miniatura (3 versiones)', who: activeRoles.includes('asistente') ? 'Asistente' : 'Creador', time: '1-2h' },
                            { phase: 'SEO + Publicacion', who: activeRoles.includes('asistente') ? 'C + A' : 'Creador', time: '30-60 min' },
                            { phase: 'Post-pub (24h monitor)', who: activeRoles.includes('asistente') ? 'Asistente' : 'Creador', time: '1h activo' },
                          ].map((r, i) => (
                            <tr key={i}>
                              <td className="p-2.5 text-gray-700 font-medium">{r.phase}</td>
                              <td className="p-2.5 text-center">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                  r.who === 'Editor' ? 'bg-orange-100 text-orange-700' :
                                  r.who === 'Asistente' ? 'bg-emerald-100 text-emerald-700' :
                                  r.who.includes('+') || r.who === 'Ambos' ? 'bg-gray-200 text-gray-700' :
                                  'bg-blue-100 text-blue-700'
                                }`}>{r.who}</span>
                              </td>
                              <td className="p-2.5 text-center font-bold text-gray-800">{r.time}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="bg-blue-50 p-3 border-t border-blue-100">
                        <p className="text-xs text-blue-800 font-semibold">
                          Total estimado por video: 15-30h Â· {workflowConfig.cadence > 1 ? `x${workflowConfig.cadence} videos = ${15 * workflowConfig.cadence}-${30 * workflowConfig.cadence}h/semana` : 'trabajo combinado del equipo'}
                        </p>
                      </div>
                    </div>

                    {/* Carpetas Drive */}
                    <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm font-mono text-sm">
                      <div className="font-bold text-gray-800 mb-2">[NombreCanal]/</div>
                      <div className="pl-4 space-y-1 text-gray-600 border-l-2 border-gray-200 ml-2">
                        {['01_Guiones', '02_Brutos', '03_Proyecto_Editor', '04_Miniaturas', '05_Exports', '06_Recortes_Shorts', '07_Publicados'].map(f => (
                          <div key={f} className="flex items-center before:content-[''] before:w-4 before:h-px before:bg-gray-300 before:mr-2">{f}</div>
                        ))}
                      </div>
                      <div className="mt-4 pt-3 border-t border-gray-200 text-xs text-gray-500 font-sans">
                        <p>Formato: <span className="text-gray-800 font-bold font-mono">YYYY-MM-DD_TituloCorto</span></p>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </>
          )}

          {/* === TAB: ROLES === */}
          {tab === 'roles' && (
            <>
              {/* Flujo visual del video */}
              <section>
                <div className="flex items-center space-x-2 mb-3" style={{ color: `var(--ff-text-primary)` }}>
                  <Film size={18} className="text-blue-600" />
                  <h3 className="font-semibold text-lg">Ciclo de vida del video</h3>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 overflow-x-auto">
                  <div className="flex items-center gap-1 min-w-max">
                    {Object.values(PHASE_MATRIX).map((phase, i) => {
                      const leaderColor = phase.leader === 'editor' ? 'bg-orange-500' : phase.leader === 'asistente' ? 'bg-emerald-500' : 'bg-blue-500';
                      const leaderBg = phase.leader === 'editor' ? 'bg-orange-50 border-orange-200' : phase.leader === 'asistente' ? 'bg-emerald-50 border-emerald-200' : 'bg-blue-50 border-blue-200';
                      return (
                        <div key={phase.id} className="flex items-center gap-1">
                          <div className={`${leaderBg} border rounded-lg px-2 py-1.5 text-center min-w-[70px]`}>
                            <div className={`${leaderColor} text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full mx-auto w-fit mb-1`}>
                              {phase.leader === 'editor' ? 'E' : phase.leader === 'asistente' ? 'A' : 'C'}
                            </div>
                            <p className="text-[10px] font-semibold text-gray-700 leading-tight">{phase.shortLabel}</p>
                            <p className="text-[8px] text-gray-400">{phase.estimatedHours}</p>
                          </div>
                          {i < Object.values(PHASE_MATRIX).length - 1 && (
                            <ArrowRight size={10} className="text-gray-300 shrink-0" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-2 justify-center">
                  <span className="flex items-center gap-1 text-[9px] text-gray-500"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> Creador</span>
                  {activeRoles.includes('editor') && <span className="flex items-center gap-1 text-[9px] text-gray-500"><span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" /> Editor</span>}
                  {activeRoles.includes('asistente') && <span className="flex items-center gap-1 text-[9px] text-gray-500"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Asistente</span>}
                </div>
              </section>

              {/* Roles detallados */}
              <section>
                <div className="flex items-center space-x-2 mb-3" style={{ color: `var(--ff-text-primary)` }}>
                  <Users size={18} className="text-blue-600" />
                  <h3 className="font-semibold text-lg">Responsabilidades por Rol</h3>
                </div>
                <div className="grid gap-3">
                  {/* Creador */}
                  <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                    <div className="bg-blue-500 px-4 py-2 flex items-center justify-between">
                      <h4 className="font-bold text-white flex items-center gap-2"><Users size={14} /> Creador</h4>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-400/30 text-white">
                        Lidera {Object.values(PHASE_MATRIX).filter(p => p.leader === 'creador').length} de 8 fases
                      </span>
                    </div>
                    <div className="p-4">
                      <p className="text-xs text-gray-500 mb-3 font-medium">Direccion creativa, contenido y monetizacion</p>
                      <div className="space-y-2">
                        {Object.values(PHASE_MATRIX).filter(p => p.leader === 'creador').map(phase => (
                          <div key={phase.id} className="flex items-start gap-2">
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 shrink-0 mt-0.5">{phase.shortLabel}</span>
                            <div>
                              <p className="text-xs font-medium text-gray-700">{phase.deliverable}</p>
                              {phase.supporter.filter(s => activeRoles.includes(s)).length > 0 && (
                                <p className="text-[10px] text-gray-400">Apoya: {phase.supporter.filter(s => activeRoles.includes(s)).map(s => s === 'editor' ? 'Editor' : s === 'asistente' ? 'Asistente' : 'Creador').join(', ')}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Editor */}
                  {activeRoles.includes('editor') && (
                    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                      <div className="bg-orange-500 px-4 py-2 flex items-center justify-between">
                        <h4 className="font-bold text-white flex items-center gap-2"><Clapperboard size={14} /> Editor</h4>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-orange-400/30 text-white">
                          {workflowConfig.editorLevel === 'full' ? 'Completo' : 'Basico'} â€” Lidera {Object.values(PHASE_MATRIX).filter(p => p.leader === 'editor').length} fase{Object.values(PHASE_MATRIX).filter(p => p.leader === 'editor').length > 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="p-4">
                        <p className="text-xs text-gray-500 mb-3 font-medium">Post-produccion, ritmo visual, exports</p>
                        <div className="space-y-2">
                          {Object.values(PHASE_MATRIX).filter(p => p.leader === 'editor').map(phase => (
                            <div key={phase.id} className="flex items-start gap-2">
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 shrink-0 mt-0.5">{phase.shortLabel}</span>
                              <div>
                                <p className="text-xs font-medium text-gray-700">{phase.deliverable}</p>
                                <p className="text-[10px] text-gray-400">Done: {phase.doneCondition}</p>
                              </div>
                            </div>
                          ))}
                          <div className="border-t border-gray-100 pt-2 mt-2">
                            <p className="text-[10px] font-semibold text-gray-500 mb-1">Tambien apoya en:</p>
                            <div className="flex flex-wrap gap-1">
                              {Object.values(PHASE_MATRIX).filter(p => p.supporter.includes('editor')).map(phase => (
                                <span key={phase.id} className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{phase.shortLabel}</span>
                              ))}
                            </div>
                          </div>
                          {workflowConfig.editorLevel === 'full' && (
                            <div className="border-t border-gray-100 pt-2 mt-1">
                              <p className="text-[10px] font-semibold text-gray-500 mb-1">Extras (nivel completo):</p>
                              <ul className="text-[10px] text-gray-500 space-y-0.5">
                                <li>â€¢ Proponer estructura y cortes creativos</li>
                                <li>â€¢ Editar Shorts de forma independiente</li>
                                <li>â€¢ Gestionar archivos en Drive</li>
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Asistente */}
                  {activeRoles.includes('asistente') && (
                    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                      <div className="bg-emerald-500 px-4 py-2 flex items-center justify-between">
                        <h4 className="font-bold text-white flex items-center gap-2"><UserPlus size={14} /> Asistente</h4>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-400/30 text-white">
                          Apoya en {Object.values(PHASE_MATRIX).filter(p => p.supporter.includes('asistente')).length} fases
                        </span>
                      </div>
                      <div className="p-4">
                        <p className="text-xs text-gray-500 mb-3 font-medium">Investigacion, diseÃ±o, redes, metadata, monitoreo</p>
                        <div className="space-y-2">
                          {Object.values(PHASE_MATRIX).filter(p => p.supporter.includes('asistente')).map(phase => (
                            <div key={phase.id} className="flex items-start gap-2">
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 shrink-0 mt-0.5">{phase.shortLabel}</span>
                              <p className="text-xs text-gray-600">
                                {phase.id === 'idea' && 'Investigacion de keywords, tendencias y competencia'}
                                {phase.id === 'titulos' && 'Analisis de titulos en el nicho, proponer variaciones'}
                                {phase.id === 'grabacion' && 'Preparar setup, organizar brutos en Drive'}
                                {phase.id === 'edicion' && 'DiseÃ±o de 3 miniaturas (rostro + texto + contexto)'}
                                {phase.id === 'publicacion' && 'Metadata YouTube, descripcion SEO, responder comentarios'}
                                {phase.id === 'metricas' && 'Reporte semanal: CTR, AVD, suscriptores, revenue'}
                                {phase.id === 'review' && 'Coordinar feedback entre creador y editor'}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Solo mode */}
                  {!activeRoles.includes('editor') && !activeRoles.includes('asistente') && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                      <div className="flex items-start gap-2">
                        <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-semibold text-amber-800 mb-1">Modo solo â€” estas haciendo todo tu</p>
                          <p className="text-[10px] text-amber-700">Llevas las 8 fases. Tip: prioriza idea + guion + publicacion. La edicion es donde mas tiempo se ahorra con un editor.</p>
                          <p className="text-[10px] text-amber-600 mt-1 font-medium">Activa Editor o Asistente en Ajustes â†’ Workflow.</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* Handoff Protocol */}
              {activeRoles.includes('editor') && (
                <section>
                  <div className="flex items-center space-x-2 mb-3" style={{ color: `var(--ff-text-primary)` }}>
                    <ArrowRightLeft size={18} className="text-emerald-600" />
                    <h3 className="font-semibold text-lg">Protocolo de Handoff</h3>
                  </div>
                  <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                    {[
                      { step: 1, from: 'Creador', to: 'Editor', trigger: 'Mover tarjeta a "Edicion"', what: 'Brutos en Drive + link en tarjeta + guion listo + gancho definido', rule: 'Sin brutos = sin edicion. No avises sin subir.', fromColor: 'bg-blue-500', toColor: 'bg-orange-500' },
                      { step: 2, from: 'Editor', to: 'Creador', trigger: 'Primer corte listo', what: 'Video exportado en Drive + 3 miniaturas + notificacion WhatsApp', rule: 'Notificar al entregar. No esperes a que pregunte.', fromColor: 'bg-orange-500', toColor: 'bg-blue-500' },
                      { step: 3, from: 'Creador', to: 'Editor', trigger: 'Feedback con timecodes', what: '"En 2:30 cortar pausa, en 5:10 agregar B-roll" â€” NO "mejorar el ritmo"', rule: 'Feedback especifico = cambios rapidos. Vago = rondas extra.', fromColor: 'bg-blue-500', toColor: 'bg-orange-500' },
                      { step: 4, from: 'Editor', to: 'Creador', trigger: 'Export final aprobado', what: 'Video final en 05_Exports + mover tarjeta a "Publicacion"', rule: 'Maximo 2 rondas de cambios. Si no, replantear guion.', fromColor: 'bg-orange-500', toColor: 'bg-blue-500' },
                    ].map((h) => (
                      <div key={h.step} className={`p-3 flex items-start gap-3 ${h.step > 1 ? 'border-t border-gray-100' : ''}`}>
                        <span className="text-[10px] font-bold text-gray-400 mt-1 shrink-0 w-4">{h.step}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className={`text-[9px] font-bold text-white px-1.5 py-0.5 rounded-full ${h.fromColor}`}>{h.from}</span>
                            <ArrowRight size={10} className="text-gray-400" />
                            <span className={`text-[9px] font-bold text-white px-1.5 py-0.5 rounded-full ${h.toColor}`}>{h.to}</span>
                            <span className="text-[10px] font-semibold text-gray-700 ml-1">{h.trigger}</span>
                          </div>
                          <p className="text-[10px] text-gray-600">{h.what}</p>
                          <p className="text-[10px] text-red-500 font-medium mt-0.5">{h.rule}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* SLAs */}
              <section>
                <div className="flex items-center space-x-2 mb-3" style={{ color: `var(--ff-text-primary)` }}>
                  <Clock size={18} className="text-red-600" />
                  <h3 className="font-semibold text-lg">Compromisos de Tiempo (SLA)</h3>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 text-[10px] font-semibold">
                        <th className="text-left px-3 py-2">Entrega</th>
                        <th className="text-left px-3 py-2">Quien</th>
                        <th className="text-left px-3 py-2">Plazo</th>
                        <th className="text-left px-3 py-2">Si falla</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {[
                        activeRoles.includes('editor') && { what: 'Brutos a Drive', who: 'Creador', badge: 'C', color: 'text-blue-700 bg-blue-100', time: 'Max 24h post-grabacion', fail: 'Video se pospone' },
                        activeRoles.includes('editor') && { what: 'Primer corte', who: 'Editor', badge: 'E', color: 'text-orange-700 bg-orange-100', time: 'Max 48h desde brutos', fail: 'Bloquea publicacion' },
                        activeRoles.includes('editor') && { what: 'Review feedback', who: 'Creador', badge: 'C', color: 'text-blue-700 bg-blue-100', time: 'Max 12h', fail: 'Editor inactivo' },
                        activeRoles.includes('editor') && { what: 'Cambios finales', who: 'Editor', badge: 'E', color: 'text-orange-700 bg-orange-100', time: 'Max 24h', fail: 'Max 2 rondas' },
                        activeRoles.includes('asistente') && { what: 'Miniaturas', who: 'Asistente', badge: 'A', color: 'text-emerald-700 bg-emerald-100', time: 'Mismo dia del briefing', fail: '3 versiones obligatorias' },
                        activeRoles.includes('asistente') && { what: 'Comentarios', who: 'Asistente', badge: 'A', color: 'text-emerald-700 bg-emerald-100', time: 'Primeras 2h post-pub', fail: 'Algoritmo penaliza' },
                        { what: 'CTR check', who: 'Creador', badge: 'C', color: 'text-blue-700 bg-blue-100', time: '2h post-publicacion', fail: 'Cambiar mini/titulo' },
                      ].filter(Boolean).map((s, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 font-medium text-gray-700">{s!.what}</td>
                          <td className="px-3 py-2"><span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${s!.color}`}>{s!.badge}</span></td>
                          <td className="px-3 py-2 text-gray-600">{s!.time}</td>
                          <td className="px-3 py-2 text-red-500 font-medium">{s!.fail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Comunicacion */}
              <section>
                <div className="flex items-center space-x-2 mb-3" style={{ color: `var(--ff-text-primary)` }}>
                  <MessageCircle size={18} className="text-purple-600" />
                  <h3 className="font-semibold text-lg">Comunicacion</h3>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden divide-y divide-gray-100">
                  <div className="p-3 flex items-start gap-3">
                    <CheckSquare size={16} className="text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-gray-800">FrameFlow (fuente de verdad)</h4>
                      <p className="text-[10px] text-gray-500">Estado del video, feedback, fechas, links de Drive, checklists, asignaciones.</p>
                    </div>
                  </div>
                  <div className="p-3 flex items-start gap-3">
                    <MessageSquareIcon size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-gray-800">WhatsApp / Telegram (solo avisos)</h4>
                      <p className="text-[10px] text-gray-500">"Subi material", "listo para review", "aprobado". Nada mas.</p>
                      <p className="text-[10px] text-red-500 font-semibold mt-0.5">NO organizar trabajo por chat. Si no esta en FrameFlow, no existe.</p>
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}

          {/* === TAB: ESTRATEGIA === */}
          {tab === 'strategy' && (
            <>
              {/* Resumen visual de la estrategia */}
              <section>
                <div className="bg-gradient-to-br from-blue-600 to-purple-700 rounded-xl p-4 text-white shadow-lg">
                  <h3 className="font-bold text-base mb-1">Playbook del Canal</h3>
                  <p className="text-[11px] text-blue-100 mb-3">4 pilares que se aplican a CADA video. Sin excepcion.</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { num: '1', label: 'Clic', metric: 'CTR > 4%', icon: 'ðŸŽ¯' },
                      { num: '2', label: 'Retencion', metric: 'AVD > 50%', icon: 'ðŸ“ˆ' },
                      { num: '3', label: 'Telarana', metric: 'Interlinking', icon: 'ðŸ•¸' },
                      { num: '4', label: 'Post-pub', metric: '< 2h accion', icon: 'âš¡' },
                    ].map(p => (
                      <div key={p.num} className="bg-white/15 rounded-lg p-2.5 backdrop-blur-sm">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-sm">{p.icon}</span>
                          <span className="text-[11px] font-bold">{p.label}</span>
                        </div>
                        <p className="text-[10px] text-blue-100 font-medium">{p.metric}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              {/* Pilar 1: Ingenieria del Clic */}
              <section>
                <div className="flex items-center space-x-2 mb-3" style={{ color: `var(--ff-text-primary)` }}>
                  <Target size={18} className="text-blue-600" />
                  <h3 className="font-semibold text-lg">Pilar 1: Ingenieria del Clic</h3>
                </div>
                <div className="grid gap-2">
                  <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm border-l-4 border-l-blue-500">
                    <h4 className="text-xs font-bold text-gray-800 mb-2">Oceano Azul â€” Encontrar tu angulo</h4>
                    <div className="text-[10px] text-gray-600 space-y-1">
                      <p>Cruza 2 nichos para eliminar competencia. No seas "otro canal de cocina".</p>
                      <div className="bg-blue-50 rounded p-2 mt-1">
                        <p className="font-semibold text-blue-700 mb-0.5">Ejemplo:</p>
                        <p className="text-blue-600">Cocina + ciencia = "La quimica detras de la pizza perfecta"</p>
                        <p className="text-blue-600">Fitness + psicologia = "Por que tu cerebro sabotea tu dieta"</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm border-l-4 border-l-blue-500">
                    <h4 className="text-xs font-bold text-gray-800 mb-2">Metodo Linden â€” Titulos que venden</h4>
                    <div className="text-[10px] text-gray-600 space-y-1">
                      <p><strong>Regla:</strong> Escribe 10-50 variaciones ANTES de elegir. Nunca te quedes con el primero.</p>
                      <div className="grid grid-cols-2 gap-1 mt-1">
                        <div className="bg-red-50 rounded p-1.5">
                          <p className="text-[9px] font-bold text-red-600 mb-0.5">MAL</p>
                          <p className="text-red-500">"Mi rutina de gym"</p>
                        </div>
                        <div className="bg-green-50 rounded p-1.5">
                          <p className="text-[9px] font-bold text-green-600 mb-0.5">BIEN</p>
                          <p className="text-green-600">"Hice gym 365 dias seguidos. Esto paso."</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm border-l-4 border-l-blue-500">
                    <h4 className="text-xs font-bold text-gray-800 mb-2">Miniatura â€” 3 Elementos obligatorios</h4>
                    <div className="text-[10px] text-gray-600">
                      <div className="flex gap-2">
                        <div className="flex-1 bg-gray-50 rounded p-2 text-center">
                          <p className="font-bold text-gray-700">Rostro</p>
                          <p className="text-[9px] text-gray-500">Emocion clara, ojos abiertos, expresion exagerada</p>
                        </div>
                        <div className="flex-1 bg-gray-50 rounded p-2 text-center">
                          <p className="font-bold text-gray-700">Texto</p>
                          <p className="text-[9px] text-gray-500">3-5 palabras max, complementa (no repite) el titulo</p>
                        </div>
                        <div className="flex-1 bg-gray-50 rounded p-2 text-center">
                          <p className="font-bold text-gray-700">Contexto</p>
                          <p className="text-[9px] text-gray-500">Objeto o fondo que cuenta la historia</p>
                        </div>
                      </div>
                      <p className="text-red-500 font-semibold mt-1.5">Siempre prepara 3 versiones: principal + 2 backups para A/B test.</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Pilar 2: Retencion */}
              <section>
                <div className="flex items-center space-x-2 mb-3" style={{ color: `var(--ff-text-primary)` }}>
                  <Film size={18} className="text-purple-600" />
                  <h3 className="font-semibold text-lg">Pilar 2: Retencion</h3>
                </div>
                <div className="grid gap-2">
                  <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm border-l-4 border-l-purple-500">
                    <h4 className="text-xs font-bold text-gray-800 mb-2">Gancho de 8 segundos</h4>
                    <div className="text-[10px] text-gray-600 space-y-1">
                      <p><strong>Los primeros 8s determinan si el 70% se queda o se va.</strong></p>
                      <div className="bg-purple-50 rounded p-2 mt-1">
                        <p className="font-semibold text-purple-700 mb-1">Formulas que funcionan:</p>
                        <ul className="space-y-0.5 text-purple-600">
                          <li>â€¢ <strong>Resultado primero:</strong> "Perdi 20 kg en 6 meses. Asi lo hice."</li>
                          <li>â€¢ <strong>Pregunta provocadora:</strong> "Te han mentido sobre las proteinas."</li>
                          <li>â€¢ <strong>Situacion extrema:</strong> "Esto casi destruye mi canal."</li>
                          <li>â€¢ <strong>Curiosity gap:</strong> "Hay un truco que el 99% no conoce."</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm border-l-4 border-l-purple-500">
                    <h4 className="text-xs font-bold text-gray-800 mb-2">Storytelling â€” Regla South Park</h4>
                    <div className="text-[10px] text-gray-600">
                      <p className="mb-2">Cada escena se conecta con "PERO" o "POR LO TANTO", nunca con "Y DESPUES".</p>
                      <div className="bg-gray-50 rounded p-2 space-y-1.5">
                        <div className="flex items-start gap-2">
                          <span className="font-bold text-blue-600 shrink-0 w-20">QUERIA...</span>
                          <span className="text-gray-600">Setup: que quiere el personaje/tema</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="font-bold text-red-600 shrink-0 w-20">PERO...</span>
                          <span className="text-gray-600">Conflicto: que lo impide (la tension)</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="font-bold text-emerald-600 shrink-0 w-20">POR LO TANTO...</span>
                          <span className="text-gray-600">Resolucion: como se resolvio</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm border-l-4 border-l-purple-500">
                    <h4 className="text-xs font-bold text-gray-800 mb-2">Edicion â€” Estimulo cada 10 segundos</h4>
                    <div className="text-[10px] text-gray-600">
                      <p className="mb-1">El cerebro necesita cambios constantes para no irse. Cada 10s uno de estos:</p>
                      <div className="grid grid-cols-3 gap-1 mt-1">
                        {['Cambio de angulo', 'B-roll', 'Texto en pantalla', 'Efecto de sonido', 'Zoom in/out', 'Corte a recurso'].map(s => (
                          <span key={s} className="bg-purple-50 text-purple-600 text-[9px] px-1.5 py-1 rounded text-center font-medium">{s}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Pilar 3: SEO + Telarana */}
              <section>
                <div className="flex items-center space-x-2 mb-3" style={{ color: `var(--ff-text-primary)` }}>
                  <Search size={18} className="text-emerald-600" />
                  <h3 className="font-semibold text-lg">Pilar 3: Efecto Telarana</h3>
                </div>
                <div className="grid gap-2">
                  <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm border-l-4 border-l-emerald-500">
                    <h4 className="text-xs font-bold text-gray-800 mb-2">SEO Cola Larga</h4>
                    <div className="text-[10px] text-gray-600 space-y-1.5">
                      <p><strong>Regla:</strong> 4+ palabras clave. Menos volumen = CERO competencia = te posicionas rapido.</p>
                      <div className="bg-emerald-50 rounded p-2">
                        <p className="font-semibold text-emerald-700 mb-1">Donde encontrar keywords:</p>
                        <ul className="text-emerald-600 space-y-0.5">
                          <li>â€¢ Autocompletado de YouTube (escribe y mira sugerencias)</li>
                          <li>â€¢ Seccion "Otros buscaron" debajo de videos</li>
                          <li>â€¢ Google Trends (comparar terminos)</li>
                          <li>â€¢ Comentarios de videos populares del nicho</li>
                        </ul>
                      </div>
                      <div className="bg-gray-50 rounded p-2">
                        <p className="font-semibold text-gray-700 mb-1">Donde colocar:</p>
                        <table className="w-full text-[9px]">
                          <tbody>
                            <tr><td className="py-0.5 font-medium text-gray-700 w-24">Titulo</td><td className="text-gray-500">Keyword principal al inicio</td></tr>
                            <tr><td className="py-0.5 font-medium text-gray-700">Descripcion</td><td className="text-gray-500">Primeras 2 lineas (antes del "Mostrar mas")</td></tr>
                            <tr><td className="py-0.5 font-medium text-gray-700">Tags</td><td className="text-gray-500">Keyword exacta + variaciones + nicho amplio</td></tr>
                            <tr><td className="py-0.5 font-medium text-gray-700">Subtitulos</td><td className="text-gray-500">Subir SRT manual mejora indexacion</td></tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm border-l-4 border-l-emerald-500">
                    <h4 className="text-xs font-bold text-gray-800 mb-2">Interlinking â€” Tu red interna</h4>
                    <div className="text-[10px] text-gray-600 space-y-1">
                      <p>Cada video nuevo conecta con al menos 2 videos existentes. Objetivo: que el viewer nunca salga de tu canal.</p>
                      <div className="grid grid-cols-2 gap-1 mt-1">
                        <div className="bg-gray-50 rounded p-1.5">
                          <p className="font-bold text-gray-700 text-[9px] mb-0.5">Comentario fijado</p>
                          <p className="text-[9px] text-gray-500">"Si te gusto esto, mira [video relacionado]"</p>
                        </div>
                        <div className="bg-gray-50 rounded p-1.5">
                          <p className="font-bold text-gray-700 text-[9px] mb-0.5">Pantalla final</p>
                          <p className="text-[9px] text-gray-500">2 videos: "siguiente" + "mejor del canal"</p>
                        </div>
                        <div className="bg-gray-50 rounded p-1.5">
                          <p className="font-bold text-gray-700 text-[9px] mb-0.5">Tarjetas (i)</p>
                          <p className="text-[9px] text-gray-500">Cuando mencionas un tema que ya cubriste</p>
                        </div>
                        <div className="bg-gray-50 rounded p-1.5">
                          <p className="font-bold text-gray-700 text-[9px] mb-0.5">Descripcion</p>
                          <p className="text-[9px] text-gray-500">Links a videos relacionados al final</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Pilar 4: Post-Publicacion */}
              <section>
                <div className="flex items-center space-x-2 mb-3" style={{ color: `var(--ff-text-primary)` }}>
                  <Flame size={18} className="text-red-600" />
                  <h3 className="font-semibold text-lg">Pilar 4: Ataque al Corazon</h3>
                </div>
                <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm border-l-4 border-l-red-500">
                  <p className="text-[10px] text-gray-600 mb-2"><strong>Las primeras 2 horas son CRITICAS.</strong> El algoritmo decide el alcance del video en este window.</p>
                  <div className="space-y-2">
                    {[
                      { time: '0-30 min', action: 'Responder TODOS los comentarios', detail: 'Cada respuesta = 2x comentarios para el algoritmo. Haz preguntas de vuelta.', color: 'bg-red-500' },
                      { time: '30-60 min', action: 'Compartir en redes + comunidad', detail: 'WhatsApp, Instagram stories, Twitter. Pide a 5 personas que comenten.', color: 'bg-red-400' },
                      { time: '2 horas', action: 'Revisar CTR en YouTube Studio', detail: 'Si CTR < 4% â†’ protocolo de emergencia (abajo).', color: 'bg-orange-500' },
                      { time: '24 horas', action: 'Analisis inicial de metricas', detail: 'CTR, AVD, % de suscriptores nuevos. Documentar en tarjeta.', color: 'bg-yellow-500' },
                    ].map((step, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className={`text-[9px] font-bold text-white px-1.5 py-0.5 rounded ${step.color} shrink-0`}>{step.time}</span>
                        <div>
                          <p className="text-[10px] font-semibold text-gray-700">{step.action}</p>
                          <p className="text-[9px] text-gray-500">{step.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              {/* Protocolo de emergencia CTR */}
              <section>
                <div className="flex items-center space-x-2 mb-3" style={{ color: `var(--ff-text-primary)` }}>
                  <AlertTriangle size={18} className="text-red-600" />
                  <h3 className="font-semibold text-lg">Protocolo de Emergencia CTR</h3>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 shadow-sm">
                  <p className="text-xs font-bold text-red-800 mb-3">Si CTR &lt; 4% a las 2 horas de publicar:</p>
                  <div className="space-y-2.5">
                    {[
                      { step: 1, action: 'Cambiar miniatura', detail: 'Usa backup #1. NO la hagas desde cero â€” ya deberias tener 3.', timing: 'Inmediato' },
                      { step: 2, action: 'Esperar 1 hora', detail: 'Dale tiempo al algoritmo de re-evaluar con la nueva miniatura.', timing: '+1h' },
                      { step: 3, action: 'Si sigue bajo: cambiar titulo', detail: 'Usa variacion pre-escrita del Metodo Linden.', timing: '+1h' },
                      { step: 4, action: 'Registrar en tarjeta', detail: 'Documentar que se cambio y a que hora. Esto es data para el futuro.', timing: 'Siempre' },
                    ].map(s => (
                      <div key={s.step} className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0">{s.step}</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-[10px] font-bold text-red-800">{s.action}</p>
                            <span className="text-[8px] font-medium px-1.5 py-0.5 rounded-full bg-red-200 text-red-700">{s.timing}</span>
                          </div>
                          <p className="text-[10px] text-red-600">{s.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-2 border-t border-red-200">
                    <p className="text-[10px] font-bold text-red-700">NUNCA cambiar miniatura Y titulo al mismo tiempo. No sabras que funciono.</p>
                  </div>
                </div>
              </section>

              {/* Shorts */}
              <section>
                <div className="flex items-center space-x-2 mb-3" style={{ color: `var(--ff-text-primary)` }}>
                  <Zap size={18} className="text-purple-600" />
                  <h3 className="font-semibold text-lg">Estrategia de Shorts</h3>
                </div>
                <div className="grid gap-2">
                  <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm border-l-4 border-l-purple-500">
                    <h4 className="text-xs font-bold text-gray-800 mb-2">Shorts = Top of Funnel</h4>
                    <div className="text-[10px] text-gray-600">
                      <p className="mb-2">Los Shorts traen alcance masivo. Los largos monetizan. Cada Short debe canalizar a un largo.</p>
                      <div className="flex items-center gap-2 bg-purple-50 rounded p-2">
                        <div className="text-center flex-1">
                          <p className="font-bold text-purple-700">Short</p>
                          <p className="text-[9px] text-purple-500">Alcance</p>
                        </div>
                        <ArrowRight size={14} className="text-purple-400" />
                        <div className="text-center flex-1">
                          <p className="font-bold text-purple-700">Curiosidad</p>
                          <p className="text-[9px] text-purple-500">"Video completo en..."</p>
                        </div>
                        <ArrowRight size={14} className="text-purple-400" />
                        <div className="text-center flex-1">
                          <p className="font-bold text-purple-700">Largo</p>
                          <p className="text-[9px] text-purple-500">Revenue</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm border-l-4 border-l-purple-500">
                    <h4 className="text-xs font-bold text-gray-800 mb-2">3 Reglas de un buen Short</h4>
                    <div className="space-y-1.5">
                      {[
                        { rule: 'Gancho 1-3s', detail: 'Impacto visual inmediato. Si no atrapa en 1s, swipe.' },
                        { rule: 'Formato repetible', detail: 'Series reconocibles: "Dia N de...", "Lo que nadie te dice de...", "POV:"' },
                        { rule: 'Loop', detail: 'El final conecta con el inicio. El viewer lo ve 2x sin darse cuenta.' },
                      ].map((r, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="w-4 h-4 rounded-full bg-purple-500 text-white text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                          <div>
                            <p className="text-[10px] font-semibold text-gray-700">{r.rule}</p>
                            <p className="text-[9px] text-gray-500">{r.detail}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {/* Monetizacion */}
              <section>
                <div className="flex items-center space-x-2 mb-3" style={{ color: `var(--ff-text-primary)` }}>
                  <DollarSign size={18} className="text-green-600" />
                  <h3 className="font-semibold text-lg">Monetizacion â€” 4 Fuentes</h3>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                  {[
                    { source: 'AdSense', level: 'Base', desc: 'Ingresos pasivos por views. Nichos alto CPM: finanzas, tech, salud, legal.', tip: 'Optimiza AVD â€” mas tiempo = mas ads = mas revenue.', color: 'border-l-green-400', multiplier: '1x' },
                    { source: 'Afiliados', level: 'Medio', desc: 'Links en descripcion a productos que recomiendas. Amazon, software, cursos.', tip: 'Menciona el producto naturalmente en el video + pin en comentarios.', color: 'border-l-green-500', multiplier: '2-10x' },
                    { source: 'Sponsors', level: 'Alto', desc: 'Marcas te pagan por mencion. Cobra por CPM de tu canal, no tarifa fija.', tip: 'Espera a tener 10K+ subs. Usa media kit con datos reales.', color: 'border-l-green-600', multiplier: '10-50x' },
                    { source: 'Producto propio', level: 'Maximo', desc: 'Curso, ebook, consultoria, merch. Mayor margen, control total.', tip: 'Valida con un "lead magnet" gratis antes de crear producto.', color: 'border-l-green-700', multiplier: '50-100x' },
                  ].map((s, i) => (
                    <div key={i} className={`p-3 border-l-4 ${s.color} ${i > 0 ? 'border-t border-gray-100' : ''}`}>
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="text-xs font-bold text-gray-800">{s.source}</h4>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[8px] font-medium px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">{s.multiplier} vs AdSense</span>
                          <span className="text-[8px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">{s.level}</span>
                        </div>
                      </div>
                      <p className="text-[10px] text-gray-600">{s.desc}</p>
                      <p className="text-[10px] text-emerald-600 font-medium mt-0.5">Tip: {s.tip}</p>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

            </div>
          </div>
        </div>,
          document.body
        )
      : null;

  return (
    <>
      {!hideTrigger && (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center space-x-2 bg-white/15 hover:bg-white/25 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200"
        >
          <Info size={16} />
          <span className="hidden sm:inline">Guia</span>
        </button>
      )}

      {guideDrawer}
    </>
  );
}

function QuickStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border p-3 text-center shadow-sm" style={{ background: `var(--ff-surface-solid)`, borderColor: `var(--ff-border-medium)` }}>
      <p className={`text-xl font-extrabold ${color}`}>{value}</p>
      <p className="text-[10px] font-medium" style={{ color: `var(--ff-text-tertiary)` }}>{label}</p>
    </div>
  );
}





