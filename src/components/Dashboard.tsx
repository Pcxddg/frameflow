import { useState, useEffect, useCallback, type CSSProperties, type ReactNode } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Clock3,
  DollarSign,
  ExternalLink,
  Eye,
  Filter,
  Flame,
  Gauge,
  Handshake,
  Link2,
  Play,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { useBoard } from '../store';
import { AuditEvent, Card } from '../types';
import { InterlinkingGraph } from './InterlinkingGraph';
import { CardModal } from './card-modal/CardModal';
import { fetchYouTubeChannelData, YouTubeChannelStats, YouTubeRecentVideo } from '../lib/youtube';
import { DataQuality, getBoardDataQuality, normalizeCardForPersistence } from '../lib/audit';
import { useIsMobile } from '../hooks/useIsMobile';
import { getAuditRoleLabel, getProductionFlowSummary } from '../lib/optimizedVideoFlow';
import { subscribeAuditEvents } from '../lib/supabase/frameflow';

type DateRange = 'today' | '7d' | '30d' | 'all';
type SeverityFilter = 'all' | 'critical' | 'warning' | 'info';
type FocusArea = 'all' | 'risks' | 'business';
type EventSeverity = 'critical' | 'warning' | 'info' | 'positive';
type MobileSectionKey = 'operational' | 'exceptions' | 'pipeline' | 'flow' | 'activity' | 'editorial' | 'business' | 'youtube';

interface DashboardFilterState {
  dateRange: DateRange;
  assignee: 'all' | 'unassigned' | string;
  contentType: 'all' | 'long' | 'short' | 'undefined';
  phase: 'all' | string;
  severity: SeverityFilter;
}

interface DrawerState {
  title: string;
  subtitle: string;
  formula: string;
  window: string;
  quality: DataQuality;
  includedCount: number;
  excludedCount: number;
  cards: Card[];
  note?: string;
}

interface CardAuditState {
  isPublished: boolean;
  publishedAt?: string | null;
  currentColumnDays: number;
  overdue: boolean;
  stale: boolean;
  blocked: boolean;
  missingAssignee: boolean;
  missingChecklist: boolean;
  missingSeo: boolean;
  missingCtr: boolean;
  monetizationGap: boolean;
  missingInterlinking: boolean;
  followUpGap: boolean;
  severity: SeverityFilter;
}

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const STALE_THRESHOLD_DAYS = 5;

function fmt(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

function money(value: number) {
  return `$${Math.round(value).toLocaleString()}`;
}

function pct(value: number, digits = 1) {
  return `${value.toFixed(digits)}%`;
}

function hoursToReadable(hours: number) {
  if (!Number.isFinite(hours) || hours <= 0) return '0h';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}min`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  const days = Math.floor(hours / 24);
  const remainder = Math.round(hours % 24);
  return remainder > 0 ? `${days}d ${remainder}h` : `${days}d`;
}

function formatShortDate(value?: string | null) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short' }).format(date);
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function relativeTime(value?: string | null) {
  if (!value) return 'Sin registro';
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return 'Sin registro';
  const diffMs = Date.now() - timestamp;
  if (diffMs < 60_000) return 'Hace un momento';
  if (diffMs < HOUR_MS) return `Hace ${Math.max(1, Math.round(diffMs / 60_000))} min`;
  if (diffMs < DAY_MS) return `Hace ${Math.max(1, Math.round(diffMs / HOUR_MS))} h`;
  return `Hace ${Math.max(1, Math.round(diffMs / DAY_MS))} d`;
}

function getPublishedAt(card: Card, publishedListId?: string) {
  if (card.postPublication?.publishedAt) return card.postPublication.publishedAt;
  if (!publishedListId || !card.columnHistory?.length) return null;
  return card.columnHistory.find((entry) => entry.listId === publishedListId)?.enteredAt || null;
}

function getLastMovementAt(card: Card) {
  const history = card.columnHistory || [];
  const latestHistory = history.length > 0 ? history[history.length - 1]?.enteredAt : null;
  return card.updatedAt || latestHistory || card.createdAt || null;
}

function isWithinDateRange(value: string | null | undefined, range: DateRange) {
  if (!value || range === 'all') return true;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return false;
  const now = Date.now();
  if (range === 'today') {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return timestamp >= start.getTime() && timestamp <= now;
  }
  const limitMs = range === '7d' ? 7 * DAY_MS : 30 * DAY_MS;
  return timestamp >= now - limitMs && timestamp <= now;
}

function assigneeLabel(value: string | null | undefined) {
  if (!value) return 'Sin asignar';
  if (value === 'T\u00c3\u00ba' || value === 'T\u00fa') return 'Creador';
  return value;
}

function contentTypeLabel(value: Card['contentType'] | 'undefined') {
  if (value === 'long') return 'Largo';
  if (value === 'short') return 'Short';
  return 'Sin tipo';
}

function dashboardToneStyle(tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'brand'): CSSProperties {
  if (tone === 'success') {
    return { background: 'var(--ff-success-bg)', color: 'var(--ff-success-text)', borderColor: 'var(--ff-success-border)' };
  }
  if (tone === 'warning') {
    return { background: 'var(--ff-warning-bg)', color: 'var(--ff-warning-text)', borderColor: 'var(--ff-warning-border)' };
  }
  if (tone === 'danger') {
    return { background: 'var(--ff-danger-bg)', color: 'var(--ff-danger-text)', borderColor: 'var(--ff-danger-border)' };
  }
  if (tone === 'brand') {
    return {
      background: 'color-mix(in srgb, var(--ff-primary) 14%, var(--ff-surface-solid))',
      color: 'var(--ff-primary)',
      borderColor: 'color-mix(in srgb, var(--ff-primary) 28%, var(--ff-border))',
    };
  }
  if (tone === 'neutral') {
    return { background: 'var(--ff-surface-raised)', color: 'var(--ff-text-secondary)', borderColor: 'var(--ff-border)' };
  }
  return { background: 'var(--ff-info-bg)', color: 'var(--ff-info-text)', borderColor: 'var(--ff-info-border)' };
}

function dataQualityMeta(quality: DataQuality) {
  if (quality === 'complete') {
    return { label: 'Completo', description: 'Timestamps e historial disponibles.', style: dashboardToneStyle('success') };
  }
  if (quality === 'partial') {
    return { label: 'Parcial', description: 'Hay evidencia util, pero no cubre todo el historial.', style: dashboardToneStyle('warning') };
  }
  return { label: 'Faltan datos', description: 'El presente es legible, pero el pasado es incompleto.', style: dashboardToneStyle('danger') };
}

function severityMeta(severity: EventSeverity | SeverityFilter) {
  if (severity === 'critical') return { badge: 'Critico', style: dashboardToneStyle('danger') };
  if (severity === 'warning') return { badge: 'Atencion', style: dashboardToneStyle('warning') };
  if (severity === 'positive') return { badge: 'Bien', style: dashboardToneStyle('success') };
  return { badge: 'Info', style: dashboardToneStyle('neutral') };
}

function getEventSeverity(event: AuditEvent): EventSeverity {
  if (event.type === 'ctr_updated') {
    const nextCtr = Number(event.payload?.nextCTR || 0);
    return nextCtr > 0 && nextCtr < 4 ? 'critical' : 'info';
  }
  if (event.type === 'stage_completed') return 'positive';
  if (event.type === 'video_ai_seeded') return 'info';
  if (event.type === 'stage_ai_regenerated') return 'info';
  if (event.type === 'flow_column_mismatch_detected') return 'warning';
  if (event.type === 'card_published') return 'positive';
  if (event.type === 'checklist_progress_changed') return event.payload?.isCompleted ? 'positive' : 'warning';
  return 'info';
}

function describeAuditEvent(event: AuditEvent, card?: Card | null) {
  const cardTitle = String(event.payload?.cardTitle || card?.title || 'Tarjeta');
  const actor = event.actorEmail || 'Equipo';
  if (event.type === 'card_created') return { title: 'Tarjeta creada', body: `${actor} creo "${cardTitle}" en ${String(event.payload?.listTitle || 'una columna')}.` };
  if (event.type === 'card_moved') return { title: 'Movimiento de pipeline', body: `${actor} movio "${cardTitle}" de ${String(event.payload?.fromListTitle || 'origen')} a ${String(event.payload?.toListTitle || 'destino')}.` };
  if (event.type === 'assignee_changed') return { title: 'Responsable actualizado', body: `${actor} reasigno "${cardTitle}" a ${assigneeLabel(String(event.payload?.nextAssignee || ''))}.` };
  if (event.type === 'checklist_progress_changed') return { title: 'Checklist actualizado', body: `${actor} marco "${String(event.payload?.itemText || 'un item')}" en ${String(event.payload?.checklistTitle || 'checklist')}.` };
  if (event.type === 'ctr_updated') return { title: 'CTR actualizado', body: `${actor} dejo "${cardTitle}" en ${String(event.payload?.nextCTR || 0)}% a las 2h.` };
  if (event.type === 'monetization_updated') return { title: 'Monetizacion actualizada', body: `${actor} actualizo monetizacion o deals en "${cardTitle}".` };
  if (event.type === 'video_flow_created') return { title: 'Flujo guiado creado', body: `${actor} preparo "${cardTitle}" con un flujo optimizado hasta publicar.` };
  if (event.type === 'video_ai_seeded') return { title: 'Paquete IA sembrado', body: `${actor} dejo sembrado un paquete base de IA en "${cardTitle}" para validacion humana.` };
  if (event.type === 'stage_started') return { title: 'Etapa activada', body: `${actor} activo la etapa "${String(event.payload?.stageLabel || 'sin nombre')}" en "${cardTitle}".` };
  if (event.type === 'stage_completed') return { title: 'Etapa completada', body: `${actor} marco como hecha la etapa "${String(event.payload?.stageLabel || 'sin nombre')}" en "${cardTitle}".` };
  if (event.type === 'stage_reopened') return { title: 'Etapa reabierta', body: `${actor} reabrio la etapa "${String(event.payload?.stageLabel || 'sin nombre')}" en "${cardTitle}".` };
  if (event.type === 'stage_due_changed') return { title: 'Fecha de etapa ajustada', body: `${actor} movio la fecha objetivo de "${String(event.payload?.stageLabel || 'sin nombre')}" en "${cardTitle}".` };
  if (event.type === 'stage_ai_regenerated') return { title: 'Seccion IA regenerada', body: `${actor} regenero con IA la seccion "${String(event.payload?.section || 'sin nombre')}" en "${cardTitle}".` };
  if (event.type === 'flow_column_mismatch_detected') return { title: 'Flujo desalineado', body: `${actor} movio "${cardTitle}" a una columna distinta de la etapa esperada por el flujo.` };
  return { title: 'Publicacion registrada', body: `${actor} marco "${cardTitle}" como publicado.` };
}

function Panel({ children, highlighted }: { children: ReactNode; highlighted?: boolean }) {
  return (
    <section
      className="overflow-hidden rounded-[2rem] border"
      style={{
        background: 'var(--ff-surface-solid)',
        borderColor: highlighted ? 'color-mix(in srgb, var(--ff-primary) 28%, var(--ff-border))' : 'var(--ff-border)',
        boxShadow: highlighted ? '0 18px 52px -36px color-mix(in srgb, var(--ff-primary) 32%, transparent)' : undefined,
      }}
    >
      {children}
    </section>
  );
}

function Section({
  mobile,
  title,
  summary,
  isOpen,
  onToggle,
  highlighted,
  children,
}: {
  mobile: boolean;
  title: string;
  summary?: string;
  isOpen: boolean;
  onToggle: () => void;
  highlighted?: boolean;
  children: ReactNode;
}) {
  return (
    <Panel highlighted={highlighted}>
      <button
        onClick={() => mobile && onToggle()}
        className={`flex w-full items-center justify-between gap-4 px-5 py-4 text-left ${mobile ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--ff-text-tertiary)' }}>Dashboard</p>
          <h3 className="mt-1 text-lg font-black" style={{ color: 'var(--ff-text-primary)' }}>{title}</h3>
          {summary && <p className="mt-1 text-sm" style={{ color: 'var(--ff-text-secondary)' }}>{summary}</p>}
        </div>
        {mobile && (isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />)}
      </button>
      {(!mobile || isOpen) && <div className="px-5 pb-5">{children}</div>}
    </Panel>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--ff-text-tertiary)' }}>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full rounded-2xl px-4 py-3 text-sm font-medium outline-none"
        style={{ background: 'var(--ff-input-bg)', color: 'var(--ff-text-primary)', border: '1px solid var(--ff-input-border)' }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function StatBlock({
  icon,
  title,
  value,
  caption,
  compact,
}: {
  icon: ReactNode;
  title: string;
  value: ReactNode;
  caption: string;
  compact?: boolean;
}) {
  return (
    <div className={`rounded-[1.35rem] border ${compact ? 'p-3' : 'p-4'}`} style={{ background: 'var(--ff-surface-solid)', borderColor: 'var(--ff-border)' }}>
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--ff-text-tertiary)' }}>{title}</p>
      </div>
      <p className={`${compact ? 'mt-2 text-lg' : 'mt-3 text-2xl'} font-black`} style={{ color: 'var(--ff-text-primary)' }}>{value}</p>
      <p className="mt-1 text-xs leading-5" style={{ color: 'var(--ff-text-secondary)' }}>{caption}</p>
    </div>
  );
}

function EmptyBlock({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="rounded-[1.5rem] border border-dashed p-5 text-center" style={{ borderColor: 'var(--ff-border)', background: 'var(--ff-surface-muted)' }}>
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl" style={{ background: 'var(--ff-surface-solid)', color: 'var(--ff-primary)' }}>
        {icon}
      </div>
      <p className="mt-3 text-sm font-bold" style={{ color: 'var(--ff-text-primary)' }}>{title}</p>
      <p className="mt-2 text-sm leading-6" style={{ color: 'var(--ff-text-secondary)' }}>{description}</p>
    </div>
  );
}

export function Dashboard() {
  const { board } = useBoard();
  const isMobile = useIsMobile();
  const [ytStats, setYtStats] = useState<YouTubeChannelStats | null>(null);
  const [ytVideos, setYtVideos] = useState<YouTubeRecentVideo[]>([]);
  const [ytLoading, setYtLoading] = useState(false);
  const [ytError, setYtError] = useState<string | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [focusArea, setFocusArea] = useState<FocusArea>('all');
  const [filters, setFilters] = useState<DashboardFilterState>({
    dateRange: '7d',
    assignee: 'all',
    contentType: 'all',
    phase: 'all',
    severity: 'all',
  });
  const [mobileSections, setMobileSections] = useState<Record<MobileSectionKey, boolean>>({
    operational: true,
    exceptions: true,
    pipeline: true,
    flow: true,
    activity: true,
    editorial: false,
    business: false,
    youtube: false,
  });

  useEffect(() => {
    setYtStats(null);
    setYtVideos([]);
    setYtError(null);
    setYtLoading(false);
    setAuditEvents([]);
    setDrawer(null);
    setSelectedCardId(null);
    setFocusArea('all');
    setFilters({
      dateRange: '7d',
      assignee: 'all',
      contentType: 'all',
      phase: 'all',
      severity: 'all',
    });
    setMobileSections({
      operational: true,
      exceptions: true,
      pipeline: true,
      flow: true,
      activity: true,
      editorial: false,
      business: false,
      youtube: false,
    });
  }, [board?.id]);

  const hasYT = !!board?.youtubeChannelUrl;

  const loadYouTubeData = useCallback(async () => {
    if (!board?.youtubeChannelUrl) {
      setYtStats(null);
      setYtVideos([]);
      setYtError(null);
      return;
    }

    setYtLoading(true);
    setYtError(null);

    try {
      const data = await fetchYouTubeChannelData(board.youtubeChannelUrl, board.youtubeApiKey);
      setYtStats(data.stats);
      setYtVideos(data.videos);
    } catch (error: any) {
      setYtError(error?.message || 'No se pudo cargar YouTube.');
    } finally {
      setYtLoading(false);
    }
  }, [board?.youtubeApiKey, board?.youtubeChannelUrl]);

  useEffect(() => {
    void loadYouTubeData();
  }, [loadYouTubeData]);

  useEffect(() => {
    if (!board?.id) {
      setAuditEvents([]);
      return undefined;
    }

    const unsubscribe = subscribeAuditEvents(board.id, (events) => {
      setAuditEvents(events);
    }, (error) => {
      console.error('Error loading audit events:', error);
    });

    return () => unsubscribe();
  }, [board?.id]);

  if (!board) {
    return <div className="h-full flex items-center justify-center" style={{ color: 'var(--ff-text-secondary)' }}>Selecciona un canal para ver el dashboard.</div>;
  }

  const rawCards = Object.values(board.cards);
  const cards = rawCards.map((card) => normalizeCardForPersistence(card, board));
  const cardsById = Object.fromEntries(cards.map((card) => [card.id, card])) as Record<string, Card>;
  const publishedListId = board.lists[board.lists.length - 1]?.id;
  const cadence = board.workflowConfig?.cadence || 1;
  const rawQuality = getBoardDataQuality(rawCards);
  const overallQuality: DataQuality = rawCards.length > 0 && auditEvents.length === 0 && rawQuality === 'complete' ? 'partial' : rawQuality;
  const qualityMeta = dataQualityMeta(overallQuality);

  const cardAudit = new Map<string, CardAuditState>();
  cards.forEach((card) => {
    const publishedAt = getPublishedAt(card, publishedListId);
    const lastMovementAt = getLastMovementAt(card) || card.createdAt || board.updatedAt || new Date().toISOString();
    const currentColumnDays = Math.max(0, (Date.now() - new Date(lastMovementAt).getTime()) / DAY_MS);
    const isPublished = !!publishedListId && card.listId === publishedListId;
    const flowSummary = getProductionFlowSummary(card, board);
    const hasMonetizationSignals = !!(
      card.monetization?.hasAffiliate ||
      card.monetization?.hasSponsor ||
      card.monetization?.sellsProduct ||
      card.monetization?.revenue ||
      (card.monetization?.deals || []).length > 0
    );
    const missingCtr = isPublished && !card.ctr2Hours;
    const followUpGap = isPublished && (!card.postPublication?.commentsResponded || (!card.postPublication?.actionTaken && !!card.ctr2Hours && Number(card.ctr2Hours) < 4));
    const auditState: CardAuditState = {
      isPublished,
      publishedAt,
      currentColumnDays,
      overdue: !!card.dueDate && new Date(card.dueDate).getTime() < Date.now() && !isPublished,
      stale: currentColumnDays >= STALE_THRESHOLD_DAYS && !isPublished,
      blocked: card.labels.some((label) => /feedback|esperando|bloqueado/i.test(label.name)) || !!flowSummary?.blockedStages.length || !!flowSummary?.isColumnMismatch,
      missingAssignee: !card.assignee && !isPublished,
      missingChecklist: card.checklists.length === 0 && !isPublished,
      missingSeo: card.contentType === 'long' && (!card.keywords?.trim() || !card.description?.trim()),
      missingCtr,
      monetizationGap: hasMonetizationSignals && (!card.postPublication?.publishedAt || !card.monetization?.estimatedRPM),
      missingInterlinking: isPublished && !card.interlinking?.trim() && !(card.interlinkingTargets || []).length && !card.shortsFunnel,
      followUpGap,
      severity: 'info',
    };

    if (auditState.overdue || auditState.stale || auditState.missingCtr || auditState.followUpGap) {
      auditState.severity = 'critical';
    } else if ((flowSummary?.overdueStages.length || 0) > 0) {
      auditState.severity = 'critical';
    } else if (auditState.blocked || auditState.missingAssignee || auditState.missingChecklist || auditState.missingSeo || auditState.monetizationGap || auditState.missingInterlinking) {
      auditState.severity = 'warning';
    }

    cardAudit.set(card.id, auditState);
  });

  const filteredCards = cards.filter((card) => {
    const auditState = cardAudit.get(card.id);
    const assigneeMatch = filters.assignee === 'all'
      ? true
      : filters.assignee === 'unassigned'
      ? !card.assignee
      : card.assignee === filters.assignee;
    const contentMatch = filters.contentType === 'all'
      ? true
      : filters.contentType === 'undefined'
      ? !card.contentType
      : card.contentType === filters.contentType;
    const phaseMatch = filters.phase === 'all' ? true : card.listId === filters.phase;
    const severityMatch = filters.severity === 'all' ? true : auditState?.severity === filters.severity;
    const dateMatch = isWithinDateRange(card.updatedAt || card.createdAt, filters.dateRange);

    return assigneeMatch && contentMatch && phaseMatch && severityMatch && dateMatch;
  });

  const filteredAuditEvents = auditEvents.filter((event) => {
    const relatedCard = event.cardId ? cardsById[event.cardId] : null;
    const phaseMatch = filters.phase === 'all'
      ? true
      : event.toListId === filters.phase || event.fromListId === filters.phase || relatedCard?.listId === filters.phase;
    const dateMatch = isWithinDateRange(event.at, filters.dateRange);
    const severityMatch = filters.severity === 'all' ? true : getEventSeverity(event) === filters.severity;
    const contentMatch = filters.contentType === 'all'
      ? true
      : !relatedCard
      ? filters.contentType === 'undefined'
      : filters.contentType === 'undefined'
      ? !relatedCard.contentType
      : relatedCard.contentType === filters.contentType;
    const assigneeMatch = filters.assignee === 'all'
      ? true
      : !relatedCard
      ? filters.assignee === 'unassigned'
      : filters.assignee === 'unassigned'
      ? !relatedCard.assignee
      : relatedCard.assignee === filters.assignee;

    return phaseMatch && dateMatch && severityMatch && contentMatch && assigneeMatch;
  });

  const blockedCards = filteredCards.filter((card) => cardAudit.get(card.id)?.blocked);
  const staleCards = filteredCards.filter((card) => cardAudit.get(card.id)?.stale);
  const overdueCards = filteredCards.filter((card) => cardAudit.get(card.id)?.overdue);
  const missingAssigneeCards = filteredCards.filter((card) => cardAudit.get(card.id)?.missingAssignee);
  const missingChecklistCards = filteredCards.filter((card) => cardAudit.get(card.id)?.missingChecklist);
  const missingSeoCards = filteredCards.filter((card) => cardAudit.get(card.id)?.missingSeo);
  const missingCtrCards = filteredCards.filter((card) => cardAudit.get(card.id)?.missingCtr);
  const monetizationGapCards = filteredCards.filter((card) => cardAudit.get(card.id)?.monetizationGap);
  const interlinkingGapCards = filteredCards.filter((card) => cardAudit.get(card.id)?.missingInterlinking);
  const followUpGapCards = filteredCards.filter((card) => cardAudit.get(card.id)?.followUpGap);
  const criticalCards = filteredCards.filter((card) => cardAudit.get(card.id)?.severity === 'critical');
  const flowCards = filteredCards
    .map((card) => ({
      card,
      flow: getProductionFlowSummary(card, board),
    }))
    .filter((item): item is { card: Card; flow: NonNullable<ReturnType<typeof getProductionFlowSummary>> } => !!item.flow);
  const overdueStageCards = flowCards.filter((item) => item.flow.overdueStages.length > 0);
  const blockedFlowCards = flowCards.filter((item) => item.flow.blockedStages.length > 0 || item.flow.isColumnMismatch);
  const aiSeededPendingCards = flowCards.filter((item) => item.flow.aiSeededOpenStages.length > 0);
  const readyToPublishCards = flowCards.filter((item) => item.flow.currentStage?.id === 'upload_schedule' || item.flow.currentStage?.id === 'publish_followup');
  const recycleQueueCards = flowCards.filter((item) => item.flow.currentStage?.id === 'recycle_shorts');
  const publishFollowupCards = flowCards.filter((item) => item.flow.currentStage?.id === 'publish_followup' && !item.card.ctr2Hours);
  const flowRoleBreakdown = (['creador', 'editor', 'asistente'] as const).map((role) => {
    const roleCards = flowCards.filter((item) => item.flow.currentStage?.ownerRole === role);
    return {
      role,
      total: roleCards.length,
      overdue: roleCards.filter((item) => item.flow.overdueStages.length > 0).length,
      blocked: roleCards.filter((item) => item.flow.blockedStages.length > 0).length,
      ready: roleCards.filter((item) => item.flow.currentStage?.id === 'upload_schedule' || item.flow.currentStage?.id === 'publish_followup').length,
    };
  });

  const publishedCards = filteredCards.filter((card) => cardAudit.get(card.id)?.isPublished);
  const publishedThisWeek = publishedCards.filter((card) => isWithinDateRange(cardAudit.get(card.id)?.publishedAt || null, '7d'));
  const cardsWithCtr = publishedCards.filter((card) => Number(card.ctr2Hours || 0) > 0);
  const lowCtrCards = cardsWithCtr.filter((card) => Number(card.ctr2Hours || 0) < 4);
  const ctrAverage = cardsWithCtr.length > 0
    ? cardsWithCtr.reduce((sum, card) => sum + Number(card.ctr2Hours || 0), 0) / cardsWithCtr.length
    : 0;
  const cycleCards = publishedCards.filter((card) => !!card.createdAt && !!cardAudit.get(card.id)?.publishedAt);
  const averageCycleHours = cycleCards.length > 0
    ? cycleCards.reduce((sum, card) => {
        const publishedAt = cardAudit.get(card.id)?.publishedAt || card.updatedAt;
        return sum + ((new Date(String(publishedAt)).getTime() - new Date(String(card.createdAt)).getTime()) / HOUR_MS);
      }, 0) / cycleCards.length
    : 0;

  const wipCards = filteredCards.filter((card) => !cardAudit.get(card.id)?.isPublished);
  const healthScore = Math.max(
    18,
    100
      - (blockedCards.length * 7)
      - (staleCards.length * 6)
      - (overdueCards.length * 9)
      - (missingAssigneeCards.length * 3)
      - (missingChecklistCards.length * 2)
  );
  const healthSeverity: EventSeverity = healthScore >= 80 ? 'positive' : healthScore >= 60 ? 'warning' : 'critical';
  const healthSummary =
    healthSeverity === 'positive'
      ? 'El sistema esta estable y el dashboard tiene pocas alertas activas.'
      : healthSeverity === 'warning'
      ? 'Hay friccion operativa. Conviene atacar cuellos y faltantes antes de publicar mas.'
      : 'El pipeline ya muestra riesgo operativo: estancamiento, vencidos o seguimiento incompleto.';

  const deals = filteredCards.flatMap((card) =>
    (card.monetization?.deals || []).map((deal) => ({
      ...deal,
      cardId: card.id,
      cardTitle: card.title,
    }))
  );
  const paidRevenue = deals.filter((deal) => deal.status === 'paid').reduce((sum, deal) => sum + deal.amount, 0);
  const pendingRevenue = deals.filter((deal) => deal.status !== 'paid').reduce((sum, deal) => sum + deal.amount, 0);
  const totalRevenue = filteredCards.reduce((sum, card) => sum + (card.monetization?.revenue || 0), 0);
  const topBrands = [...deals.reduce((map, deal) => {
    map.set(deal.brand, (map.get(deal.brand) || 0) + deal.amount);
    return map;
  }, new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const pipelineStats = board.lists.map((list, index) => {
    const cardsInList = filteredCards.filter((card) => card.listId === list.id);
    const phaseDurations: number[] = [];

    filteredCards.forEach((card) => {
      const history = card.columnHistory || [];
      history.forEach((entry, entryIndex) => {
        if (entry.listId !== list.id) return;
        const enteredAt = new Date(entry.enteredAt).getTime();
        const nextEntry = history[entryIndex + 1];
        const exitedAt = nextEntry
          ? new Date(nextEntry.enteredAt).getTime()
          : card.listId === list.id
          ? Date.now()
          : enteredAt;
        const duration = (exitedAt - enteredAt) / HOUR_MS;
        if (duration > 0 && duration < 24 * 90) phaseDurations.push(duration);
      });
    });

    const recentMovesIn = filteredAuditEvents.filter((event) => event.type === 'card_moved' && event.toListId === list.id).length;
    const recentMovesOut = filteredAuditEvents.filter((event) => event.type === 'card_moved' && event.fromListId === list.id).length;
    const defaultSlaDays = [7, 4, 4, 3, 4, 2, 1][index] || 3;
    const overSlaCards = cardsInList.filter((card) => (cardAudit.get(card.id)?.currentColumnDays || 0) > defaultSlaDays);

    return {
      id: list.id,
      title: list.title,
      count: cardsInList.length,
      avgHours: phaseDurations.length > 0 ? phaseDurations.reduce((sum, value) => sum + value, 0) / phaseDurations.length : 0,
      defaultSlaDays,
      overSlaCards,
      recentMovesIn,
      recentMovesOut,
    };
  });

  const bottleneck = [...pipelineStats].sort((a, b) => b.avgHours - a.avgHours)[0] || null;
  const selectedCard = selectedCardId ? board.cards[selectedCardId] : null;
  const lastUpdated = board.updatedAt || board.createdAt;
  const assigneeOptions = [...new Set(cards.map((card) => card.assignee).filter(Boolean))] as string[];

  const openCardsDrawer = (
    title: string,
    subtitle: string,
    formula: string,
    sourceCards: Card[],
    excludedCount = 0,
    note?: string
  ) => {
    setDrawer({
      title,
      subtitle,
      formula,
      window: filters.dateRange === 'today' ? 'Hoy' : filters.dateRange === '7d' ? 'Ultimos 7 dias' : filters.dateRange === '30d' ? 'Ultimos 30 dias' : 'Todo el historial visible',
      quality: overallQuality,
      includedCount: sourceCards.length,
      excludedCount,
      cards: sourceCards,
      note,
    });
  };

  const applyPreset = (preset: 'today' | 'week' | 'risks' | 'business') => {
    if (preset === 'today') {
      setFilters((previous) => ({ ...previous, dateRange: 'today', severity: 'all' }));
      setFocusArea('all');
      return;
    }
    if (preset === 'week') {
      setFilters((previous) => ({ ...previous, dateRange: '7d', severity: 'all' }));
      setFocusArea('all');
      return;
    }
    if (preset === 'risks') {
      setFilters((previous) => ({ ...previous, severity: 'critical', dateRange: '7d' }));
      setFocusArea('risks');
      setMobileSections((previous) => ({ ...previous, operational: true, exceptions: true, pipeline: true, flow: true, activity: true }));
      return;
    }

    setFilters((previous) => ({ ...previous, severity: 'all', dateRange: '30d' }));
    setFocusArea('business');
    setMobileSections((previous) => ({ ...previous, business: true, youtube: true }));
  };

  const healthCards: Array<{
    id: string;
    title: string;
    value: string | number;
    accent: EventSeverity;
    helper: string;
    onClick: () => void;
  }> = [
    {
      id: 'health',
      title: 'Salud general',
      value: `${healthScore}/100`,
      accent: healthSeverity,
      helper: healthSummary,
      onClick: () => openCardsDrawer(
        'Salud general',
        'Tarjetas que hoy empujan el score hacia abajo.',
        'Score base 100 - bloqueos - estancamiento - vencidos - faltantes de ejecucion.',
        [...criticalCards, ...blockedCards.filter((card) => !criticalCards.some((item) => item.id === card.id))],
        Math.max(filteredCards.length - criticalCards.length - blockedCards.length, 0),
        'Usa esta lista como backlog inmediato de saneamiento.'
      ),
    },
    {
      id: 'blocked',
      title: 'Bloqueadas',
      value: blockedCards.length,
      accent: blockedCards.length > 0 ? 'warning' : 'positive',
      helper: 'Esperando feedback o marcadas como bloqueo.',
      onClick: () => openCardsDrawer('Tarjetas bloqueadas', 'Cards con labels de espera o bloqueo.', 'Cuenta de tarjetas con label que indica dependencia externa.', blockedCards, filteredCards.length - blockedCards.length),
    },
    {
      id: 'stale',
      title: 'Estancadas',
      value: staleCards.length,
      accent: staleCards.length > 0 ? 'critical' : 'positive',
      helper: `Mas de ${STALE_THRESHOLD_DAYS} dias sin mover.`,
      onClick: () => openCardsDrawer('Tarjetas estancadas', `Cards que llevan ${STALE_THRESHOLD_DAYS}+ dias en la misma fase.`, 'Se mide desde el ultimo movimiento o actualizacion de la tarjeta.', staleCards, filteredCards.length - staleCards.length),
    },
    {
      id: 'overdue',
      title: 'Vencidas',
      value: overdueCards.length,
      accent: overdueCards.length > 0 ? 'critical' : 'positive',
      helper: 'Fecha limite pasada y aun no publicadas.',
      onClick: () => openCardsDrawer('Tarjetas vencidas', 'Cards con due date vencida y aun abiertas.', 'Due date menor que ahora y card fuera de la ultima columna.', overdueCards, filteredCards.length - overdueCards.length),
    },
    {
      id: 'pace',
      title: 'Ritmo semanal',
      value: `${publishedThisWeek.length}/${cadence}`,
      accent: publishedThisWeek.length >= cadence ? 'positive' : 'warning',
      helper: 'Videos publicados vs cadence semanal.',
      onClick: () => openCardsDrawer('Ritmo semanal', 'Publicados dentro de la ventana actual.', 'Cantidad de tarjetas publicadas en los ultimos 7 dias frente al cadence del workflow.', publishedThisWeek, Math.max(publishedCards.length - publishedThisWeek.length, 0), `Cadence objetivo: ${cadence} video(s) largos por semana.`),
    },
    {
      id: 'cycle',
      title: 'Ciclo promedio',
      value: cycleCards.length > 0 ? hoursToReadable(averageCycleHours) : 'Sin base',
      accent: averageCycleHours > 0 && averageCycleHours <= 120 ? 'positive' : averageCycleHours > 0 ? 'warning' : 'info',
      helper: 'Del alta de la tarjeta a la publicacion.',
      onClick: () => openCardsDrawer('Tiempo medio de ciclo', 'Tarjetas publicadas con timestamps suficientes.', 'Promedio entre createdAt y fecha de publicacion o entrada a la ultima columna.', cycleCards, publishedCards.length - cycleCards.length, cycleCards.length === 0 ? 'No hay suficientes timestamps historicos para estimar ciclo.' : undefined),
    },
  ];

  const exceptionTiles: Array<{
    id: string;
    title: string;
    severity: EventSeverity;
    count: number;
    note: string;
    cards: Card[];
    formula: string;
  }> = [
    { id: 'assignee', title: 'Sin responsable', severity: missingAssigneeCards.length > 0 ? 'warning' : 'positive', count: missingAssigneeCards.length, note: 'Cards abiertas que aun no tienen dueno.', cards: missingAssigneeCards, formula: 'Tarjetas abiertas con assignee vacio.' },
    { id: 'checklist', title: 'Sin checklist', severity: missingChecklistCards.length > 0 ? 'warning' : 'positive', count: missingChecklistCards.length, note: 'No hay una definicion de trabajo visible.', cards: missingChecklistCards, formula: 'Cards en progreso sin checklist cargada.' },
    { id: 'seo', title: 'Sin SEO base', severity: missingSeoCards.length > 0 ? 'warning' : 'positive', count: missingSeoCards.length, note: 'Faltan keywords o descripcion en largos.', cards: missingSeoCards, formula: 'Videos largos sin keywords o descripcion completa.' },
    { id: 'ctr', title: 'Publicados sin CTR', severity: missingCtrCards.length > 0 ? 'critical' : 'positive', count: missingCtrCards.length, note: 'No se puede auditar performance temprana.', cards: missingCtrCards, formula: 'Videos ya publicados que no tienen CTR a 2h.' },
    { id: 'money', title: 'Monetizacion incompleta', severity: monetizationGapCards.length > 0 ? 'warning' : 'positive', count: monetizationGapCards.length, note: 'Hay dinero o deals, pero falta cierre operativo.', cards: monetizationGapCards, formula: 'Monetizacion o deals presentes sin RPM o sin publicacion trazada.' },
    { id: 'links', title: 'Sin interlinking', severity: interlinkingGapCards.length > 0 ? 'warning' : 'positive', count: interlinkingGapCards.length, note: 'Publicados sin ruta clara hacia otros activos.', cards: interlinkingGapCards, formula: 'Videos publicados sin targets, sin embudo short ni campo interlinking.' },
  ];

  return (
    <>
      <div className="ff-scrollbar h-full overflow-y-auto p-4 sm:p-6" style={{ background: 'var(--ff-bg)' }}>
        <div className="mx-auto max-w-7xl space-y-5">
          <Panel highlighted={focusArea !== 'all'}>
            <div className="grid gap-5 p-5 lg:grid-cols-[1.7fr,1fr]">
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em]" style={dashboardToneStyle('brand')}>Panel auditable</span>
                      <span className="rounded-full border px-3 py-1 text-[11px] font-semibold" style={qualityMeta.style}>{qualityMeta.label}</span>
                    </div>
                    <h2 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl" style={{ color: 'var(--ff-text-primary)' }}>{ytStats?.title || board.title}</h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: 'var(--ff-text-secondary)' }}>{healthSummary}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {hasYT && (
                      <button onClick={() => void loadYouTubeData()} disabled={ytLoading} className="flex min-h-11 items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--ff-surface-solid)', color: 'var(--ff-text-primary)', border: '1px solid var(--ff-border)' }}>
                        <RefreshCw size={15} className={ytLoading ? 'animate-spin' : ''} />
                        {ytLoading ? 'Actualizando' : 'Actualizar'}
                      </button>
                    )}
                    {board.youtubeChannelUrl && (
                      <a href={board.youtubeChannelUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold" style={{ background: 'var(--ff-surface-solid)', color: 'var(--ff-text-primary)', border: '1px solid var(--ff-border)' }}>
                        <ExternalLink size={15} />
                        Canal
                      </a>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <StatBlock icon={<Clock3 size={16} className="text-slate-600" />} title="Ultima actualizacion" value={relativeTime(lastUpdated)} caption={formatDateTime(lastUpdated)} />
                  <StatBlock icon={<ShieldAlert size={16} className={healthSeverity === 'positive' ? 'text-emerald-600' : healthSeverity === 'warning' ? 'text-amber-600' : 'text-rose-600'} />} title="Estado del sistema" value={severityMeta(healthSeverity).badge} caption={`${criticalCards.length} tarjetas en riesgo critico`} />
                  <StatBlock icon={<Users size={16} className="text-indigo-600" />} title="Lectura actual" value={`${filteredCards.length}/${cards.length}`} caption="Cards visibles con filtros activos" />
                </div>
              </div>

              <div className="rounded-[1.5rem] border p-4" style={{ background: 'var(--ff-surface-muted)', borderColor: 'var(--ff-border)' }}>
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    { id: 'today', label: 'Hoy' },
                    { id: 'week', label: 'Semana' },
                    { id: 'risks', label: 'Riesgos' },
                    { id: 'business', label: 'Negocio' },
                  ].map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => applyPreset(preset.id as 'today' | 'week' | 'risks' | 'business')}
                      className="min-h-10 rounded-full px-3 py-2 text-xs font-bold uppercase tracking-[0.16em]"
                      style={(preset.id === 'risks' && focusArea === 'risks') || (preset.id === 'business' && focusArea === 'business') ? { background: 'var(--ff-primary)', color: 'var(--ff-text-inverse)' } : { background: 'var(--ff-bg-subtle)', color: 'var(--ff-text-secondary)' }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <SelectField label="Ventana" value={filters.dateRange} onChange={(value) => setFilters((previous) => ({ ...previous, dateRange: value as DateRange }))} options={[{ value: 'today', label: 'Hoy' }, { value: '7d', label: 'Ultimos 7 dias' }, { value: '30d', label: 'Ultimos 30 dias' }, { value: 'all', label: 'Todo' }]} />
                  <SelectField label="Severidad" value={filters.severity} onChange={(value) => setFilters((previous) => ({ ...previous, severity: value as SeverityFilter }))} options={[{ value: 'all', label: 'Todas' }, { value: 'critical', label: 'Criticas' }, { value: 'warning', label: 'Atencion' }, { value: 'info', label: 'Info' }]} />
                  <SelectField label="Responsable" value={filters.assignee} onChange={(value) => setFilters((previous) => ({ ...previous, assignee: value }))} options={[{ value: 'all', label: 'Todos' }, { value: 'unassigned', label: 'Sin asignar' }, ...assigneeOptions.map((option) => ({ value: option, label: assigneeLabel(option) }))]} />
                  <SelectField label="Tipo" value={filters.contentType} onChange={(value) => setFilters((previous) => ({ ...previous, contentType: value as DashboardFilterState['contentType'] }))} options={[{ value: 'all', label: 'Todos' }, { value: 'long', label: 'Largos' }, { value: 'short', label: 'Shorts' }, { value: 'undefined', label: 'Sin tipo' }]} />
                  <div className="sm:col-span-2">
                    <SelectField label="Fase" value={filters.phase} onChange={(value) => setFilters((previous) => ({ ...previous, phase: value }))} options={[{ value: 'all', label: 'Todas las fases' }, ...board.lists.map((list) => ({ value: list.id, label: list.title }))]} />
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2 text-xs" style={{ color: 'var(--ff-text-secondary)' }}>
                  <Filter size={14} />
                  <span>{qualityMeta.description}</span>
                </div>
              </div>
            </div>
          </Panel>

          {ytError && <div className="rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--ff-danger-border)', background: 'var(--ff-danger-bg)', color: 'var(--ff-danger-text)' }}>YouTube: {ytError}</div>}

          <Section mobile={isMobile} title="Estado general" summary={`${filteredCards.length} cards visibles | ${wipCards.length} en trabajo`} isOpen={mobileSections.operational} onToggle={() => setMobileSections((previous) => ({ ...previous, operational: !previous.operational }))} highlighted={focusArea === 'risks'}>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              {healthCards.map((item) => (
                <button key={item.id} onClick={item.onClick} className="rounded-[1.5rem] border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm" style={{ background: 'var(--ff-surface-solid)', borderColor: 'var(--ff-border)' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--ff-text-tertiary)' }}>{item.title}</p>
                      <p className="mt-3 text-2xl font-black" style={{ color: 'var(--ff-text-primary)' }}>{item.value}</p>
                    </div>
                    <span className="rounded-full border px-3 py-1 text-[10px] font-bold uppercase" style={severityMeta(item.accent).style}>{severityMeta(item.accent).badge}</span>
                  </div>
                  <p className="mt-3 text-sm leading-6" style={{ color: 'var(--ff-text-secondary)' }}>{item.helper}</p>
                </button>
              ))}
            </div>
          </Section>

          <div className="grid gap-5 xl:grid-cols-[1.2fr,0.8fr]">
            <Section mobile={isMobile} title="Mapa de excepciones" summary={`${exceptionTiles.reduce((sum, item) => sum + item.count, 0)} hallazgos visibles`} isOpen={mobileSections.exceptions} onToggle={() => setMobileSections((previous) => ({ ...previous, exceptions: !previous.exceptions }))} highlighted={focusArea === 'risks'}>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {exceptionTiles.map((tile) => (
                  <button key={tile.id} onClick={() => openCardsDrawer(tile.title, tile.note, tile.formula, tile.cards, filteredCards.length - tile.cards.length)} className="rounded-[1.5rem] border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm" style={{ background: 'var(--ff-surface-muted)', borderColor: 'var(--ff-border)' }}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-bold" style={{ color: 'var(--ff-text-primary)' }}>{tile.title}</p>
                      <span className="rounded-full border px-3 py-1 text-[10px] font-bold uppercase" style={severityMeta(tile.severity).style}>{tile.count}</span>
                    </div>
                    <p className="mt-3 text-sm leading-6" style={{ color: 'var(--ff-text-secondary)' }}>{tile.note}</p>
                  </button>
                ))}
              </div>
            </Section>

            <Section mobile={isMobile} title="Pipeline audit" summary={bottleneck ? `Cuello principal: ${bottleneck.title}` : 'Sin suficiente historial'} isOpen={mobileSections.pipeline} onToggle={() => setMobileSections((previous) => ({ ...previous, pipeline: !previous.pipeline }))}>
              <div className="space-y-3">
                {pipelineStats.map((stat) => {
                  const barWidth = bottleneck && bottleneck.avgHours > 0 ? (stat.avgHours / bottleneck.avgHours) * 100 : 0;
                  return (
                    <button key={stat.id} onClick={() => openCardsDrawer(stat.title, `Tarjetas actuales por encima del SLA de ${stat.defaultSlaDays} dias.`, 'Se compara el tiempo en columna contra el SLA definido por fase.', stat.overSlaCards, stat.count - stat.overSlaCards.length, `Entradas recientes: ${stat.recentMovesIn}. Salidas recientes: ${stat.recentMovesOut}.`)} className="w-full rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm" style={{ background: 'var(--ff-surface-solid)', borderColor: 'var(--ff-border)' }}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold" style={{ color: 'var(--ff-text-primary)' }}>{stat.title}</p>
                          <p className="mt-1 text-xs" style={{ color: 'var(--ff-text-tertiary)' }}>{stat.count} cards | {stat.overSlaCards.length} fuera de SLA</p>
                        </div>
                        <div className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: 'var(--ff-bg-subtle)', color: 'var(--ff-text-secondary)' }}>{stat.avgHours > 0 ? hoursToReadable(stat.avgHours) : 'Sin base'}</div>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full" style={{ background: 'var(--ff-bg-subtle)' }}>
                        <div className={`h-full rounded-full ${stat.overSlaCards.length > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.max(8, Math.min(barWidth || 8, 100))}%` }} />
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] font-semibold" style={{ color: 'var(--ff-text-secondary)' }}>
                        <span>Entradas: {stat.recentMovesIn}</span>
                        <span>Salidas: {stat.recentMovesOut}</span>
                        <span>SLA: {stat.defaultSlaDays}d</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </Section>
          </div>

          <Section
            mobile={isMobile}
            title="Flujo optimizado"
            summary={flowCards.length > 0 ? `${overdueStageCards.length} videos con etapas vencidas | ${readyToPublishCards.length} listos para publicar` : 'Todavia no hay videos creados con el wizard nuevo.'}
            isOpen={mobileSections.flow}
            onToggle={() => setMobileSections((previous) => ({ ...previous, flow: !previous.flow }))}
            highlighted={overdueStageCards.length > 0 || blockedFlowCards.length > 0}
          >
            {flowCards.length > 0 ? (
              <div className="grid gap-5 xl:grid-cols-[1.15fr,0.85fr]">
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    <button onClick={() => openCardsDrawer('Etapas vencidas', 'Videos del flujo optimizado con una o mas etapas vencidas.', 'Cards cuyo flujo tiene etapas no hechas con dueAt menor que ahora.', overdueStageCards.map((item) => item.card), flowCards.length - overdueStageCards.length)} className="rounded-[1.5rem] border p-4 text-left" style={{ background: 'var(--ff-surface-solid)', borderColor: 'var(--ff-border)' }}>
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--ff-text-tertiary)' }}>Etapas vencidas</p>
                      <p className="mt-3 text-2xl font-black" style={{ color: 'var(--ff-text-primary)' }}>{overdueStageCards.length}</p>
                      <p className="mt-2 text-sm leading-6" style={{ color: 'var(--ff-text-secondary)' }}>Cards donde el calendario real ya se atraso frente al publish date.</p>
                    </button>
                    <button onClick={() => openCardsDrawer('Handoffs bloqueados', 'Videos con bloqueo operativo o desalineacion entre flujo y columna.', 'Cards con stage blocked o columna distinta a la etapa activa.', blockedFlowCards.map((item) => item.card), flowCards.length - blockedFlowCards.length)} className="rounded-[1.5rem] border p-4 text-left" style={{ background: 'var(--ff-surface-solid)', borderColor: 'var(--ff-border)' }}>
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--ff-text-tertiary)' }}>Handoffs bloqueados</p>
                      <p className="mt-3 text-2xl font-black" style={{ color: 'var(--ff-text-primary)' }}>{blockedFlowCards.length}</p>
                      <p className="mt-2 text-sm leading-6" style={{ color: 'var(--ff-text-secondary)' }}>Bloqueos duros o mismatch entre la etapa activa y la columna del board.</p>
                    </button>
                    <button onClick={() => openCardsDrawer('Listos para publicar', 'Videos que ya estan en subida/programacion o seguimiento de salida.', 'Cards cuyo currentStage esta en upload_schedule o publish_followup.', readyToPublishCards.map((item) => item.card), flowCards.length - readyToPublishCards.length)} className="rounded-[1.5rem] border p-4 text-left" style={{ background: 'var(--ff-surface-solid)', borderColor: 'var(--ff-border)' }}>
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--ff-text-tertiary)' }}>Listos para publicar</p>
                      <p className="mt-3 text-2xl font-black" style={{ color: 'var(--ff-text-primary)' }}>{readyToPublishCards.length}</p>
                      <p className="mt-2 text-sm leading-6" style={{ color: 'var(--ff-text-secondary)' }}>Videos en upload, programacion o primera ventana de publicacion.</p>
                    </button>
                    <button onClick={() => openCardsDrawer('Reciclaje a shorts', 'Videos cuya etapa actual es reciclar a clips o shorts.', 'Cards cuyo currentStage esta en recycle_shorts.', recycleQueueCards.map((item) => item.card), flowCards.length - recycleQueueCards.length)} className="rounded-[1.5rem] border p-4 text-left" style={{ background: 'var(--ff-surface-solid)', borderColor: 'var(--ff-border)' }}>
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--ff-text-tertiary)' }}>Cola de reciclaje</p>
                      <p className="mt-3 text-2xl font-black" style={{ color: 'var(--ff-text-primary)' }}>{recycleQueueCards.length}</p>
                      <p className="mt-2 text-sm leading-6" style={{ color: 'var(--ff-text-secondary)' }}>Videos que ya deberian estar generando clips o derivados.</p>
                    </button>
                    <button onClick={() => openCardsDrawer('IA sembrada pendiente de validacion', 'Videos con borradores IA disponibles, pero con etapas aun abiertas.', 'Cards cuyo flujo tiene una o mas etapas abiertas con hasAIDraft.', aiSeededPendingCards.map((item) => item.card), flowCards.length - aiSeededPendingCards.length)} className="rounded-[1.5rem] border p-4 text-left" style={{ background: 'var(--ff-surface-solid)', borderColor: 'var(--ff-border)' }}>
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--ff-text-tertiary)' }}>IA sembrada</p>
                      <p className="mt-3 text-2xl font-black" style={{ color: 'var(--ff-text-primary)' }}>{aiSeededPendingCards.length}</p>
                      <p className="mt-2 text-sm leading-6" style={{ color: 'var(--ff-text-secondary)' }}>Borradores listos, todavia pendientes de validacion humana.</p>
                    </button>
                  </div>

                  <div className="space-y-3">
                    {flowCards.slice(0, 8).map(({ card, flow }) => (
                      <button key={card.id} onClick={() => setSelectedCardId(card.id)} className="w-full rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm" style={{ background: 'var(--ff-surface-solid)', borderColor: 'var(--ff-border)' }}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-bold" style={{ color: 'var(--ff-text-primary)' }}>{card.title}</p>
                            <p className="mt-1 text-xs" style={{ color: 'var(--ff-text-tertiary)' }}>
                              {flow.currentStage ? `${flow.currentStage.label} · ${getAuditRoleLabel(flow.currentStage.ownerRole)}` : 'Sin etapa activa'}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {flow.isTightSchedule && <span className="rounded-full border px-3 py-1 text-[10px] font-bold uppercase" style={dashboardToneStyle('warning')}>Cronograma apretado</span>}
                            {flow.isColumnMismatch && <span className="rounded-full border px-3 py-1 text-[10px] font-bold uppercase" style={dashboardToneStyle('danger')}>Desalineado</span>}
                            {flow.overdueStages.length > 0 && <span className="rounded-full border px-3 py-1 text-[10px] font-bold uppercase" style={dashboardToneStyle('danger')}>{flow.overdueStages.length} vencida{flow.overdueStages.length === 1 ? '' : 's'}</span>}
                            {flow.aiSeededOpenStages.length > 0 && <span className="rounded-full border px-3 py-1 text-[10px] font-bold uppercase" style={dashboardToneStyle('brand')}>IA lista</span>}
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs" style={{ color: 'var(--ff-text-secondary)' }}>
                          <span>Entregable: <strong>{flow.currentStage?.deliverable || 'Sin deliverable'}</strong></span>
                          <span>Checklist: <strong>{flow.completedCount}/{flow.totalCount}</strong></span>
                          {flow.expectedColumnTitle && <span>Columna esperada: <strong>{flow.expectedColumnTitle}</strong></span>}
                          {flow.aiSeededOpenStages.length > 0 && <span>Borrador IA: <strong>{flow.aiSeededOpenStages.map((stage) => stage.label).join(', ')}</strong></span>}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <Panel>
                    <div className="p-5">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--ff-text-tertiary)' }}>Cumplimiento por rol</p>
                      <div className="mt-4 space-y-3">
                        {flowRoleBreakdown.map((item) => (
                          <div key={item.role} className="rounded-2xl border p-4" style={{ borderColor: 'var(--ff-border)', background: 'var(--ff-surface-muted)' }}>
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-bold" style={{ color: 'var(--ff-text-primary)' }}>{getAuditRoleLabel(item.role)}</p>
                              <span className="rounded-full border px-3 py-1 text-[10px] font-bold uppercase" style={dashboardToneStyle('neutral')}>{item.total} activas</span>
                            </div>
                            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                              <div className="rounded-xl px-2 py-3" style={{ background: 'var(--ff-surface-solid)' }}>
                                <p className="text-lg font-black" style={{ color: 'var(--ff-text-primary)' }}>{item.overdue}</p>
                                <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--ff-text-tertiary)' }}>Vencidas</p>
                              </div>
                              <div className="rounded-xl px-2 py-3" style={{ background: 'var(--ff-surface-solid)' }}>
                                <p className="text-lg font-black" style={{ color: 'var(--ff-text-primary)' }}>{item.blocked}</p>
                                <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--ff-text-tertiary)' }}>Bloqueos</p>
                              </div>
                              <div className="rounded-xl px-2 py-3" style={{ background: 'var(--ff-surface-solid)' }}>
                                <p className="text-lg font-black" style={{ color: 'var(--ff-text-primary)' }}>{item.ready}</p>
                                <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--ff-text-tertiary)' }}>Publish</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Panel>

                  <Panel>
                    <div className="p-5">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--ff-text-tertiary)' }}>Seguimiento de salida</p>
                      {publishFollowupCards.length > 0 ? (
                        <div className="mt-4 space-y-3">
                          {publishFollowupCards.map(({ card, flow }) => (
                            <button key={card.id} onClick={() => setSelectedCardId(card.id)} className="w-full rounded-2xl border p-4 text-left" style={{ borderColor: 'var(--ff-border)', background: 'var(--ff-surface-solid)' }}>
                              <p className="text-sm font-bold" style={{ color: 'var(--ff-text-primary)' }}>{card.title}</p>
                              <p className="mt-1 text-xs leading-5" style={{ color: 'var(--ff-text-secondary)' }}>
                                {flow.currentStage?.deliverable || 'Pendiente de seguimiento inicial'}
                              </p>
                              <p className="mt-2 text-[11px] font-semibold" style={{ color: 'var(--ff-warning-text)' }}>
                                Sin CTR o seguimiento temprano registrado todavia.
                              </p>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <EmptyBlock icon={<Clock3 size={18} />} title="Seguimiento controlado" description="No hay videos del flujo optimizado esperando CTR o primeros controles de salida." />
                      )}
                    </div>
                  </Panel>
                </div>
              </div>
            ) : (
              <EmptyBlock icon={<Sparkles size={18} />} title="Aun no hay videos guiados" description="Crea el primer video desde el wizard Nuevo video para que el dashboard pueda auditar etapas, handoffs y publish readiness." />
            )}
          </Section>

          <Section mobile={isMobile} title="Actividad reciente" summary={filteredAuditEvents.length > 0 ? `${filteredAuditEvents.length} eventos visibles` : 'Historial parcial'} isOpen={mobileSections.activity} onToggle={() => setMobileSections((previous) => ({ ...previous, activity: !previous.activity }))}>
            {filteredAuditEvents.length > 0 ? (
              <div className="overflow-hidden rounded-[1.5rem] border" style={{ borderColor: 'var(--ff-border)' }}>
                {filteredAuditEvents.slice(0, 14).map((event, index) => {
                  const relatedCard = event.cardId ? cardsById[event.cardId] : null;
                  const description = describeAuditEvent(event, relatedCard);
                  const tone = severityMeta(getEventSeverity(event));
                  return (
                    <div key={event.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" style={{ background: index % 2 === 0 ? 'var(--ff-surface-solid)' : 'var(--ff-surface-muted)', borderTop: index === 0 ? 'none' : '1px solid var(--ff-border)' }}>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase" style={tone.style}>{tone.badge}</span>
                          <p className="text-sm font-semibold" style={{ color: 'var(--ff-text-primary)' }}>{description.title}</p>
                        </div>
                        <p className="mt-1 text-sm leading-6" style={{ color: 'var(--ff-text-secondary)' }}>{description.body}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right text-[11px] font-semibold" style={{ color: 'var(--ff-text-tertiary)' }}>
                          <p>{relativeTime(event.at)}</p>
                          <p>{formatShortDate(event.at)}</p>
                        </div>
                        {relatedCard && (
                          <button onClick={() => setSelectedCardId(relatedCard.id)} className="rounded-full px-3 py-2 text-xs font-semibold" style={{ background: 'var(--ff-bg-subtle)', color: 'var(--ff-text-primary)' }}>
                            Abrir tarjeta
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyBlock icon={<BarChart3 size={18} />} title="Historial aun parcial" description="La actividad reciente empezara a poblarse con cada movimiento, publicacion y ajuste de la operacion." />
            )}
          </Section>

          <div className="grid gap-5 xl:grid-cols-[1.1fr,0.9fr]">
            <Section mobile={isMobile} title="Rendimiento editorial" summary={`${cardsWithCtr.length} videos con CTR | ${lowCtrCards.length} bajo umbral`} isOpen={mobileSections.editorial} onToggle={() => setMobileSections((previous) => ({ ...previous, editorial: !previous.editorial }))}>
              <div className="grid gap-3 md:grid-cols-3">
                <button onClick={() => openCardsDrawer('CTR promedio', 'Videos con CTR registrado a las 2 horas.', 'Promedio simple de ctr2Hours sobre publicados con dato numerico.', cardsWithCtr, publishedCards.length - cardsWithCtr.length)} className="rounded-[1.5rem] border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm" style={{ background: 'var(--ff-surface-solid)', borderColor: 'var(--ff-border)' }}>
                  <div className="flex items-center gap-2"><TrendingUp size={16} className="text-emerald-600" /><p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--ff-text-tertiary)' }}>CTR promedio</p></div>
                  <p className="mt-3 text-2xl font-black" style={{ color: 'var(--ff-text-primary)' }}>{cardsWithCtr.length > 0 ? pct(ctrAverage) : 'Sin base'}</p>
                  <p className="mt-2 text-sm leading-6" style={{ color: 'var(--ff-text-secondary)' }}>{cardsWithCtr.length} incluidos, {publishedCards.length - cardsWithCtr.length} excluidos</p>
                </button>
                <button onClick={() => openCardsDrawer('CTR bajo', 'Videos que piden intervencion temprana.', 'Publicados con ctr2Hours menor a 4%.', lowCtrCards, cardsWithCtr.length - lowCtrCards.length)} className="rounded-[1.5rem] border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm" style={{ background: 'var(--ff-surface-solid)', borderColor: 'var(--ff-border)' }}>
                  <div className="flex items-center gap-2"><AlertTriangle size={16} className="text-rose-600" /><p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--ff-text-tertiary)' }}>CTR bajo</p></div>
                  <p className="mt-3 text-2xl font-black" style={{ color: 'var(--ff-text-primary)' }}>{lowCtrCards.length}</p>
                  <p className="mt-2 text-sm leading-6" style={{ color: 'var(--ff-text-secondary)' }}>Menor a 4% a las 2 horas</p>
                </button>
                <button onClick={() => openCardsDrawer('Seguimiento pendiente', 'Publicados con comentarios o acciones de 2h incompletas.', 'Comentarios no respondidos o acciones faltantes cuando el CTR esta bajo.', followUpGapCards, publishedCards.length - followUpGapCards.length)} className="rounded-[1.5rem] border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm" style={{ background: 'var(--ff-surface-solid)', borderColor: 'var(--ff-border)' }}>
                  <div className="flex items-center gap-2"><CheckSquare size={16} className="text-amber-600" /><p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--ff-text-tertiary)' }}>Post-publicacion</p></div>
                  <p className="mt-3 text-2xl font-black" style={{ color: 'var(--ff-text-primary)' }}>{followUpGapCards.length}</p>
                  <p className="mt-2 text-sm leading-6" style={{ color: 'var(--ff-text-secondary)' }}>Sin seguimiento completo</p>
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {publishedCards.slice(0, 6).map((card) => {
                  const auditState = cardAudit.get(card.id);
                  const tone = severityMeta(auditState?.followUpGap ? 'critical' : auditState?.missingCtr ? 'warning' : 'positive');
                  return (
                    <button key={card.id} onClick={() => setSelectedCardId(card.id)} className="flex w-full items-center justify-between gap-3 rounded-2xl border p-4 text-left" style={{ background: 'var(--ff-surface-solid)', borderColor: 'var(--ff-border)' }}>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold" style={{ color: 'var(--ff-text-primary)' }}>{card.title}</p>
                        <p className="mt-1 text-xs" style={{ color: 'var(--ff-text-secondary)' }}>CTR: {card.ctr2Hours ? `${card.ctr2Hours}%` : 'sin dato'} | Publicado: {formatShortDate(auditState?.publishedAt || null)}</p>
                      </div>
                      <span className="rounded-full border px-3 py-1 text-[10px] font-bold uppercase" style={tone.style}>{tone.badge}</span>
                    </button>
                  );
                })}
              </div>
            </Section>

            <Section mobile={isMobile} title="Negocio" summary={`${deals.length} deals | ${topBrands.length} marcas activas`} isOpen={mobileSections.business} onToggle={() => setMobileSections((previous) => ({ ...previous, business: !previous.business }))} highlighted={focusArea === 'business'}>
              <div className="grid gap-3 sm:grid-cols-3">
                <StatBlock icon={<DollarSign size={16} className="text-emerald-600" />} title="Revenue" value={money(totalRevenue)} caption={`${filteredCards.filter((card) => (card.monetization?.revenue || 0) > 0).length} cards con ingresos`} />
                <StatBlock icon={<Handshake size={16} className="text-violet-600" />} title="Deals cobrados" value={money(paidRevenue)} caption={`${deals.filter((deal) => deal.status === 'paid').length} deals pagados`} />
                <StatBlock icon={<Gauge size={16} className="text-amber-600" />} title="Pendiente" value={money(pendingRevenue)} caption={`${deals.filter((deal) => deal.status !== 'paid').length} deals abiertos`} />
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[1fr,0.95fr]">
                <div className="rounded-[1.5rem] border p-4" style={{ background: 'var(--ff-surface-solid)', borderColor: 'var(--ff-border)' }}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold" style={{ color: 'var(--ff-text-primary)' }}>Top marcas</p>
                      <p className="mt-1 text-xs" style={{ color: 'var(--ff-text-tertiary)' }}>Monto asociado visible en el tablero.</p>
                    </div>
                    <button onClick={() => openCardsDrawer('Monetizacion incompleta', 'Cards con ingresos, deals o monetizacion aun sin cierre operativo.', 'Presencia de monetizacion sin RPM o sin publicacion trazada.', monetizationGapCards, filteredCards.length - monetizationGapCards.length)} className="rounded-full px-3 py-2 text-xs font-semibold" style={{ background: 'var(--ff-bg-subtle)', color: 'var(--ff-text-primary)' }}>
                      Ver gaps
                    </button>
                  </div>
                  <div className="mt-4 space-y-3">
                    {topBrands.length > 0 ? topBrands.map(([brand, amount], index) => (
                      <div key={brand} className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-2xl text-xs font-black" style={{ background: 'color-mix(in srgb, var(--ff-primary) 12%, transparent)', color: 'var(--ff-primary)' }}>{index + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold" style={{ color: 'var(--ff-text-primary)' }}>{brand}</p>
                          <p className="text-xs" style={{ color: 'var(--ff-text-tertiary)' }}>{money(amount)}</p>
                        </div>
                      </div>
                    )) : <EmptyBlock icon={<Handshake size={18} />} title="Sin deals visibles" description="Cuando registres sponsors, afiliados o colaboraciones apareceran aqui." />}
                  </div>
                </div>

                <div className="rounded-[1.5rem] border p-4" style={{ background: 'var(--ff-surface-solid)', borderColor: 'var(--ff-border)' }}>
                  <div className="flex items-center gap-2"><Sparkles size={16} className="text-amber-500" /><p className="text-sm font-bold" style={{ color: 'var(--ff-text-primary)' }}>Auditoria comercial</p></div>
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center justify-between gap-3 rounded-2xl px-3 py-3" style={{ background: 'var(--ff-surface-muted)' }}><span className="text-sm font-medium" style={{ color: 'var(--ff-text-secondary)' }}>Sponsors</span><span className="text-sm font-black" style={{ color: 'var(--ff-text-primary)' }}>{deals.filter((deal) => deal.type === 'sponsor').length}</span></div>
                      <div className="flex items-center justify-between gap-3 rounded-2xl px-3 py-3" style={{ background: 'var(--ff-surface-muted)' }}><span className="text-sm font-medium" style={{ color: 'var(--ff-text-secondary)' }}>Afiliados</span><span className="text-sm font-black" style={{ color: 'var(--ff-text-primary)' }}>{deals.filter((deal) => deal.type === 'affiliate').length}</span></div>
                      <div className="flex items-center justify-between gap-3 rounded-2xl px-3 py-3" style={{ background: 'var(--ff-surface-muted)' }}><span className="text-sm font-medium" style={{ color: 'var(--ff-text-secondary)' }}>Colaboraciones</span><span className="text-sm font-black" style={{ color: 'var(--ff-text-primary)' }}>{deals.filter((deal) => deal.type === 'collaboration').length}</span></div>
                      <div className="flex items-center justify-between gap-3 rounded-2xl px-3 py-3" style={{ background: 'var(--ff-surface-muted)' }}><span className="text-sm font-medium" style={{ color: 'var(--ff-text-secondary)' }}>Productos</span><span className="text-sm font-black" style={{ color: 'var(--ff-text-primary)' }}>{deals.filter((deal) => deal.type === 'product').length}</span></div>
                      <div className="flex items-center justify-between gap-3 rounded-2xl px-3 py-3" style={{ background: 'var(--ff-surface-muted)' }}><span className="text-sm font-medium" style={{ color: 'var(--ff-text-secondary)' }}>Cards con revenue incompleto</span><span className="text-sm font-black" style={{ color: 'var(--ff-text-primary)' }}>{monetizationGapCards.length}</span></div>
                    </div>
                </div>
              </div>
            </Section>
          </div>

          <Section mobile={isMobile} title="YouTube y sistema externo" summary={ytStats ? `${fmt(ytStats.subscriberCount)} subs | ${ytVideos.length} videos recientes` : 'Bloque complementario'} isOpen={mobileSections.youtube} onToggle={() => setMobileSections((previous) => ({ ...previous, youtube: !previous.youtube }))} highlighted={focusArea === 'business'}>
            <div className="grid gap-5 xl:grid-cols-[0.95fr,1.05fr]">
              <div className="space-y-4">
                {ytStats ? (
                  <div className="rounded-[1.5rem] border p-4" style={{ background: 'var(--ff-surface-solid)', borderColor: 'var(--ff-border)' }}>
                    <div className="flex items-center gap-3">
                      {ytStats.thumbnailUrl && <img src={ytStats.thumbnailUrl} alt="" className="h-12 w-12 rounded-full object-cover" />}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold" style={{ color: 'var(--ff-text-primary)' }}>{ytStats.title}</p>
                        <p className="text-xs" style={{ color: 'var(--ff-text-tertiary)' }}>{ytStats.customUrl || 'Canal conectado'}</p>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-3">
                      <StatBlock icon={<Users size={15} className="text-blue-600" />} title="Subs" value={fmt(ytStats.subscriberCount)} caption="Base actual" compact />
                      <StatBlock icon={<Eye size={15} className="text-emerald-600" />} title="Views" value={fmt(ytStats.viewCount)} caption="Totales" compact />
                      <StatBlock icon={<Play size={15} className="text-rose-600" />} title="Videos" value={fmt(ytStats.videoCount)} caption="En canal" compact />
                    </div>
                  </div>
                ) : (
                  <EmptyBlock icon={<Play size={18} />} title="YouTube sin conectar" description="Este dashboard prioriza la operacion. Cuando conectes el canal, aqui veras el contexto externo." />
                )}

                <div className="rounded-[1.5rem] border p-4" style={{ background: 'var(--ff-surface-solid)', borderColor: 'var(--ff-border)' }}>
                  <div className="flex items-center gap-2"><Link2 size={16} className="text-indigo-600" /><p className="text-sm font-bold" style={{ color: 'var(--ff-text-primary)' }}>Interlinking</p></div>
                  <div className="mt-4"><InterlinkingGraph /></div>
                </div>
              </div>

              <div className="rounded-[1.5rem] border p-4" style={{ background: 'var(--ff-surface-solid)', borderColor: 'var(--ff-border)' }}>
                <div className="flex items-center gap-2"><Flame size={16} className="text-orange-500" /><p className="text-sm font-bold" style={{ color: 'var(--ff-text-primary)' }}>Rendimiento reciente del canal</p></div>
                <div className="mt-4 space-y-3">
                  {ytVideos.length > 0 ? ytVideos.slice(0, 6).map((video) => (
                    <a key={video.id} href={`https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-2xl border p-3 transition-all hover:-translate-y-0.5 hover:shadow-sm" style={{ borderColor: 'var(--ff-border)', background: 'var(--ff-surface-muted)' }}>
                      <img src={video.thumbnailUrl} alt="" className="h-16 w-24 rounded-xl object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-semibold" style={{ color: 'var(--ff-text-primary)' }}>{video.title}</p>
                        <p className="mt-1 text-xs" style={{ color: 'var(--ff-text-tertiary)' }}>{fmt(video.viewCount)} vistas | {fmt(video.likeCount)} likes | {fmt(video.commentCount)} comentarios</p>
                      </div>
                    </a>
                  )) : <EmptyBlock icon={<Play size={18} />} title="Sin videos recientes" description="Cuando YouTube responda con publicaciones recientes, apareceran aqui como bloque secundario." />}
                </div>
              </div>
            </div>
          </Section>
        </div>
      </div>

      {drawer && (
        <div className="fixed inset-0 z-40 flex justify-end" onClick={() => setDrawer(null)}>
          <div className="absolute inset-0 bg-black/35 backdrop-blur-sm" />
          <div className="ff-scrollbar relative h-full w-full max-w-xl overflow-y-auto border-l p-5 shadow-2xl" style={{ background: 'var(--ff-surface-solid)', borderColor: 'var(--ff-border)' }} onClick={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-10 -mx-5 -mt-5 flex items-start justify-between gap-3 border-b px-5 py-4 backdrop-blur-xl" style={{ background: 'color-mix(in srgb, var(--ff-surface-solid) 92%, transparent)', borderColor: 'var(--ff-border)' }}>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--ff-text-tertiary)' }}>Como se calculo</p>
                <h3 className="mt-1 text-xl font-black" style={{ color: 'var(--ff-text-primary)' }}>{drawer.title}</h3>
                <p className="mt-2 text-sm leading-6" style={{ color: 'var(--ff-text-secondary)' }}>{drawer.subtitle}</p>
              </div>
              <button onClick={() => setDrawer(null)} className="flex h-11 w-11 items-center justify-center rounded-2xl" style={{ background: 'var(--ff-bg-subtle)' }}><X size={16} /></button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <StatBlock icon={<Gauge size={15} className="text-indigo-600" />} title="Incluidos" value={drawer.includedCount} caption="Cards fuente" compact />
              <StatBlock icon={<Filter size={15} className="text-amber-600" />} title="Excluidos" value={drawer.excludedCount} caption="Sin datos o fuera de ventana" compact />
              <StatBlock icon={<Calendar size={15} className="text-slate-600" />} title="Ventana" value={drawer.window} caption={dataQualityMeta(drawer.quality).label} compact />
            </div>

            <div className="mt-4 rounded-[1.5rem] border p-4" style={{ background: 'var(--ff-surface-muted)', borderColor: 'var(--ff-border)' }}>
              <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--ff-text-tertiary)' }}>Formula</p>
              <p className="mt-2 text-sm leading-6" style={{ color: 'var(--ff-text-primary)' }}>{drawer.formula}</p>
              {drawer.note && <p className="mt-3 text-sm leading-6" style={{ color: 'var(--ff-text-secondary)' }}>{drawer.note}</p>}
            </div>

            <div className="mt-5 space-y-3">
              {drawer.cards.length > 0 ? drawer.cards.map((card) => {
                const auditState = cardAudit.get(card.id);
                const tone = severityMeta(auditState?.severity || 'info');
                return (
                  <button key={card.id} onClick={() => setSelectedCardId(card.id)} className="w-full rounded-[1.5rem] border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm" style={{ background: 'var(--ff-surface-solid)', borderColor: 'var(--ff-border)' }}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold" style={{ color: 'var(--ff-text-primary)' }}>{card.title}</p>
                        <p className="mt-1 text-xs" style={{ color: 'var(--ff-text-secondary)' }}>{board.lists.find((list) => list.id === card.listId)?.title || 'Sin columna'} | {assigneeLabel(card.assignee)} | {contentTypeLabel(card.contentType || 'undefined')}</p>
                      </div>
                      <span className="rounded-full border px-3 py-1 text-[10px] font-bold uppercase" style={tone.style}>{tone.badge}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3 text-[11px] font-semibold" style={{ color: 'var(--ff-text-tertiary)' }}>
                      <span>Actualizado: {relativeTime(card.updatedAt)}</span>
                      {auditState?.publishedAt && <span>Publicado: {formatShortDate(auditState.publishedAt)}</span>}
                      <span>En fase: {Math.round(auditState?.currentColumnDays || 0)}d</span>
                    </div>
                  </button>
                );
              }) : <EmptyBlock icon={<BarChart3 size={18} />} title="Sin cards fuente" description="No hay evidencia suficiente con los filtros actuales." />}
            </div>
          </div>
        </div>
      )}

      {selectedCard && <CardModal card={selectedCard} onClose={() => setSelectedCardId(null)} />}
    </>
  );
}
