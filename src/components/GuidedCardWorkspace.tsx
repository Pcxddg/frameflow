import { type CSSProperties, type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  Loader2,
  MoreHorizontal,
  Pencil,
  Sparkles,
  Target,
  Trash2,
} from 'lucide-react';
import { CHECKLIST_TEMPLATES, LABELS, useBoard } from '../store';
import {
  buildVideoExecutionSnapshot,
  findStageChecklist,
  getAuditRoleLabel,
  type ProductionFlowSummary,
  type VideoExecutionReadinessItem,
  type VideoExecutionSnapshot,
} from '../lib/optimizedVideoFlow';
import {
  CardData,
  type LabelColor,
  type ProductionBrief,
  type ProductionStage,
  type ProductionStageId,
  type ProductionStageStatus,
  type ThumbnailPlanStatus,
} from '../types';
import { generateVideoSeoDraft, type SeoSourceUsed, type VideoSeoDraft } from '../lib/videoSeoAi';
import { getBoardSeoMissingLabels, renderSeoDescriptionTemplate, resolveBoardSeoConfig } from '../lib/videoSeoConfig';
import type { CardModalLocation, GuidedCardSectionId } from '../lib/cardModalEvents';

type FlowTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral' | 'brand';
type GuidedEditKey = 'brief' | 'package' | 'production' | 'publish' | null;

interface GuidedCardWorkspaceProps {
  card: CardData;
  onClose: () => void;
  initialLocation: CardModalLocation;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  phaseName: string;
  phaseAction: string;
  currentFlowStage: ProductionStage | null;
  flowSummary: ProductionFlowSummary | null;
  flowWorkingDaysLabel: string | null;
  flowScheduleLabel: string | null;
  flowScheduleChipStyle: CSSProperties;
  completedChecklists: number;
  totalChecklists: number;
  suggestedTitle: string | null;
  isImprovingTitle: boolean;
  onImproveTitle: () => void | Promise<void>;
  onAcceptSuggestedTitle: () => void;
  onDismissSuggestedTitle: () => void;
  readOnly: boolean;
  onUpdateCard: (updates: Partial<CardData>) => void;
  onToggleLabel: (label: (typeof LABELS)[number]) => void;
  productionBrief: ProductionBrief;
  onUpdateProductionBrief: (updates: Partial<ProductionBrief>) => void;
  seededTitles: string[];
  hasSeededPackage: boolean;
  onStageStatusChange: (stageId: ProductionStageId, nextStatus: ProductionStageStatus) => void;
  onStageDueAtChange: (stageId: ProductionStageId, value: string) => void;
  onStageNotesChange: (stageId: ProductionStageId, value: string) => void;
  suggestedFlowColumnTitle: string | null;
  onMoveToSuggestedColumn: () => void;
  onToggleChecklistItem: (checklistId: string, itemId: string) => void;
  onAddChecklist: (templateName: keyof typeof CHECKLIST_TEMPLATES) => void;
  onDeleteCard: () => void;
  getFlowToneStyle: (tone: FlowTone) => CSSProperties;
  flowPrimaryActionStyle: CSSProperties;
  flowBrandActionStyle: CSSProperties;
  flowDangerActionStyle: CSSProperties;
  formatDateTime: (value?: string | null) => string;
  formatDateTimeInput: (value?: string | null) => string;
}

const panelStyle: CSSProperties = {
  borderColor: 'var(--ff-border)',
  background: 'var(--ff-surface-solid)',
};

const raisedPanelStyle: CSSProperties = {
  borderColor: 'var(--ff-border)',
  background: 'var(--ff-surface-raised)',
};

const mutedPanelStyle: CSSProperties = {
  borderColor: 'var(--ff-border)',
  background: 'var(--ff-surface-muted)',
};

const primarySoftStyle: CSSProperties = {
  background: 'color-mix(in srgb, var(--ff-primary) 12%, var(--ff-surface-solid))',
  border: '1px solid color-mix(in srgb, var(--ff-primary) 26%, var(--ff-border))',
  color: 'var(--ff-primary)',
};

const subtleButtonStyle: CSSProperties = {
  background: 'var(--ff-surface-raised)',
  border: '1px solid var(--ff-border)',
  color: 'var(--ff-text-secondary)',
};

const dangerButtonStyle: CSSProperties = {
  background: 'var(--ff-danger-bg)',
  border: '1px solid var(--ff-danger-border)',
  color: 'var(--ff-danger-text)',
};

const thumbnailStatusLabels: Record<ThumbnailPlanStatus, string> = {
  pending: 'Pendiente',
  draft: 'Borrador',
  ready: 'Lista',
  approved: 'Aprobada',
};

const labelToneMap: Record<LabelColor, CSSProperties> = {
  red: { background: 'var(--ff-danger-bg)', border: '1px solid var(--ff-danger-border)', color: 'var(--ff-danger-text)' },
  yellow: { background: 'var(--ff-warning-bg)', border: '1px solid var(--ff-warning-border)', color: 'var(--ff-warning-text)' },
  blue: { background: 'var(--ff-info-bg)', border: '1px solid var(--ff-info-border)', color: 'var(--ff-info-text)' },
  green: { background: 'var(--ff-success-bg)', border: '1px solid var(--ff-success-border)', color: 'var(--ff-success-text)' },
  purple: { background: 'color-mix(in srgb, #7c3aed 18%, var(--ff-surface-solid))', border: '1px solid color-mix(in srgb, #7c3aed 38%, var(--ff-border))', color: '#8b5cf6' },
  orange: { background: 'color-mix(in srgb, #f97316 18%, var(--ff-surface-solid))', border: '1px solid color-mix(in srgb, #f97316 40%, var(--ff-border))', color: '#f97316' },
};

function parseLines(value: string) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function stringifyKeywords(keywords: string[]) {
  return keywords.join(', ');
}

function getSeoSourceLabel(sourceUsed: SeoSourceUsed) {
  if (sourceUsed === 'seoSourceText') return 'Transcripcion o resumen pegado';
  if (sourceUsed === 'guion') return 'Guion base';
  return 'Brief del video';
}

function toIsoOrNull(value: string) {
  if (!value.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function buildFallbackExecution(card: CardData, currentFlowStage: ProductionStage | null, flowSummary: ProductionFlowSummary | null): VideoExecutionSnapshot {
  return {
    currentStage: currentFlowStage,
    nextStage: flowSummary?.nextStage || null,
    checklistProgress: {
      checklist: null,
      completedCount: 0,
      totalCount: 0,
      pendingItems: [],
      percentage: 0,
    },
    pendingChecklistPreview: [],
    currentColumnTitle: 'Sin columna',
    expectedColumnTitle: null,
    currentStageLabel: currentFlowStage?.label || 'Sin etapa activa',
    currentStageStatusLabel: currentFlowStage ? 'Pendiente de iniciar' : 'Sin etapa activa',
    nextActionLabel: currentFlowStage ? 'Abrir produccion' : 'Definir siguiente paso',
    nextActionDetail: currentFlowStage?.deliverable || 'Todavia no hay un siguiente paso operativo derivado.',
    responsibleLabel: currentFlowStage ? getAuditRoleLabel(currentFlowStage.ownerRole) : card.assignee || 'Sin asignar',
    sourceUsed: card.seoSourceText?.trim() ? 'seoSourceText' : card.guion?.trim() ? 'guion' : 'brief',
    hasSeededPackage: !!(card.gancho8s?.trim() || card.titulosLinden?.trim() || card.guion?.trim() || card.productionBrief?.idea?.trim()),
    notices: [],
    readiness: [],
  };
}

function getReadinessStyle(item: VideoExecutionReadinessItem): CSSProperties {
  if (item.status === 'ready') {
    return { background: 'var(--ff-success-bg)', border: '1px solid var(--ff-success-border)', color: 'var(--ff-success-text)' };
  }
  if (item.status === 'warning') {
    return { background: 'var(--ff-warning-bg)', border: '1px solid var(--ff-warning-border)', color: 'var(--ff-warning-text)' };
  }
  return { background: 'var(--ff-surface-raised)', border: '1px solid var(--ff-border)', color: 'var(--ff-text-secondary)' };
}

function GuidedSection({
  sectionRef,
  kicker,
  title,
  description,
  preview,
  expanded,
  onToggle,
  action,
  children,
}: {
  sectionRef: RefObject<HTMLDivElement | null>;
  kicker: string;
  title: string;
  description: string;
  preview: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      ref={sectionRef}
      className="rounded-[1.7rem] border p-4 md:p-5"
      style={{ ...panelStyle, scrollMarginTop: '7rem' }}
    >
      <div className={`flex flex-wrap items-start justify-between gap-3 ${expanded ? 'mb-4' : ''}`}>
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--ff-text-tertiary)' }}>{kicker}</p>
          <div className="mt-2 flex items-center gap-3">
            <h2 className="min-w-0 text-lg font-bold md:text-xl" style={{ color: 'var(--ff-text-primary)' }}>{title}</h2>
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border" style={subtleButtonStyle}>
              <ChevronDown size={16} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </span>
          </div>
          <p className="mt-2 text-sm leading-6" style={{ color: 'var(--ff-text-secondary)' }}>{description}</p>
        </button>
        {expanded ? action : null}
      </div>
      {expanded ? children : <div onClick={onToggle} className="cursor-pointer">{preview}</div>}
    </section>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[1.3rem] border p-4" style={raisedPanelStyle}>
      <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--ff-text-tertiary)' }}>{label}</p>
      <p className="mt-3 text-lg font-bold" style={{ color: 'var(--ff-text-primary)' }}>{value}</p>
      <p className="mt-2 text-xs leading-5" style={{ color: 'var(--ff-text-secondary)' }}>{detail}</p>
    </div>
  );
}

function PreviewCard({ label, value, detail, toneStyle }: { label: string; value: string; detail?: string; toneStyle?: CSSProperties }) {
  return (
    <div className="rounded-[1.15rem] border p-4" style={toneStyle ? { ...raisedPanelStyle, ...toneStyle } : raisedPanelStyle}>
      <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--ff-text-tertiary)' }}>{label}</p>
      <p className="mt-2 text-sm font-semibold leading-6" style={{ color: 'var(--ff-text-primary)' }}>{value || 'Sin definir'}</p>
      {detail ? <p className="mt-2 text-xs leading-5" style={{ color: 'var(--ff-text-secondary)' }}>{detail}</p> : null}
    </div>
  );
}

function CollapsedPreview({ primary, secondary, chips }: { primary: string; secondary: string; chips?: string[] }) {
  return (
    <div className="rounded-[1.15rem] border p-4" style={raisedPanelStyle}>
      <p className="text-sm font-semibold leading-6" style={{ color: 'var(--ff-text-primary)' }}>{primary}</p>
      <p className="mt-1 text-xs leading-5" style={{ color: 'var(--ff-text-secondary)' }}>{secondary}</p>
      {chips?.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map((chip) => (
            <span key={chip} className="rounded-full px-3 py-1 text-[11px] font-semibold" style={subtleButtonStyle}>{chip}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[1.2rem] border border-dashed px-4 py-5 text-sm leading-6" style={{ borderColor: 'var(--ff-border-strong)', background: 'var(--ff-surface-muted)', color: 'var(--ff-text-secondary)' }}>
      {children}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
  rows = 4,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
  rows?: number;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--ff-text-tertiary)' }}>{label}</span>
      {multiline ? (
        <textarea
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          rows={rows}
          placeholder={placeholder}
          className="w-full resize-none rounded-[1.1rem] px-4 py-3 text-sm outline-none disabled:opacity-70"
          style={{ background: 'var(--ff-input-bg)', color: 'var(--ff-text-primary)', border: '1px solid var(--ff-input-border)' }}
        />
      ) : (
        <input
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="min-h-12 w-full rounded-[1.1rem] px-4 py-3 text-sm outline-none disabled:opacity-70"
          style={{ background: 'var(--ff-input-bg)', color: 'var(--ff-text-primary)', border: '1px solid var(--ff-input-border)' }}
        />
      )}
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--ff-text-tertiary)' }}>{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-12 w-full rounded-[1.1rem] px-4 py-3 text-sm outline-none disabled:opacity-70"
        style={{ background: 'var(--ff-input-bg)', color: 'var(--ff-text-primary)', border: '1px solid var(--ff-input-border)' }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

export function GuidedCardWorkspace({
  card,
  initialLocation,
  scrollContainerRef,
  phaseName,
  phaseAction,
  currentFlowStage,
  flowSummary,
  flowWorkingDaysLabel,
  flowScheduleLabel,
  flowScheduleChipStyle,
  completedChecklists,
  totalChecklists,
  suggestedTitle,
  isImprovingTitle,
  onImproveTitle,
  onAcceptSuggestedTitle,
  onDismissSuggestedTitle,
  readOnly,
  onUpdateCard,
  onToggleLabel,
  productionBrief,
  onUpdateProductionBrief,
  seededTitles,
  hasSeededPackage,
  onStageStatusChange,
  onStageDueAtChange,
  onStageNotesChange,
  suggestedFlowColumnTitle,
  onMoveToSuggestedColumn,
  onToggleChecklistItem,
  onAddChecklist,
  onDeleteCard,
  getFlowToneStyle,
  flowPrimaryActionStyle,
  flowBrandActionStyle,
  flowDangerActionStyle,
  formatDateTime,
  formatDateTimeInput,
}: GuidedCardWorkspaceProps) {
  const { board } = useBoard();

  const todayRef = useRef<HTMLDivElement>(null);
  const briefRef = useRef<HTMLDivElement>(null);
  const packageRef = useRef<HTMLDivElement>(null);
  const productionRef = useRef<HTMLDivElement>(null);
  const publishRef = useRef<HTMLDivElement>(null);
  const nextActionRef = useRef<HTMLDivElement>(null);
  const checklistRef = useRef<HTMLDivElement>(null);
  const notesRef = useRef<HTMLDivElement>(null);
  const scriptRef = useRef<HTMLDivElement>(null);
  const thumbnailRef = useRef<HTMLDivElement>(null);
  const descriptionRef = useRef<HTMLDivElement>(null);
  const finalReviewRef = useRef<HTMLDivElement>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);

  const [expandedSection, setExpandedSection] = useState<GuidedCardSectionId>(initialLocation.section || 'today');
  const [activeNavSection, setActiveNavSection] = useState<GuidedCardSectionId>(initialLocation.section || 'today');
  const [editingSection, setEditingSection] = useState<GuidedEditKey>(null);
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [showPublishAdvanced, setShowPublishAdvanced] = useState(initialLocation.section === 'publish' && initialLocation.focus === 'final_review');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [selectedStageId, setSelectedStageId] = useState<ProductionStageId | null>(currentFlowStage?.id ?? card.productionFlow?.currentStageId ?? card.productionFlow?.stages[0]?.id ?? null);

  const resolvedSeoConfig = useMemo(() => resolveBoardSeoConfig(board?.seoConfig), [board?.seoConfig]);
  const missingSeoConfigLabels = useMemo(() => getBoardSeoMissingLabels(board?.seoConfig), [board?.seoConfig]);
  const execution = useMemo(() => (
    board ? buildVideoExecutionSnapshot(card, board) : buildFallbackExecution(card, currentFlowStage, flowSummary)
  ), [board, card, currentFlowStage, flowSummary]);

  const [briefDraft, setBriefDraft] = useState({
    idea: productionBrief.idea,
    audience: productionBrief.audience,
    question: productionBrief.question,
    promise: productionBrief.promise,
    tone: productionBrief.tone,
    creatorNotes: productionBrief.creatorNotes,
  });
  const [packageDraft, setPackageDraft] = useState({
    title: card.title,
    titleAlternatives: card.titulosLinden || seededTitles.join('\n'),
    hook: card.gancho8s || '',
    thumbnailStatus: card.thumbnailPlan?.status || 'pending',
    thumbnailConcept: card.thumbnailPlan?.concept || '',
    thumbnailText: card.thumbnailPlan?.overlayText || '',
    thumbnailAssetUrl: card.thumbnailPlan?.assetUrl || '',
    thumbnailFace: card.miniaturaChecklist?.rostro || false,
    thumbnailTextCheck: card.miniaturaChecklist?.texto || false,
    thumbnailContext: card.miniaturaChecklist?.contexto || false,
  });
  const [productionDraft, setProductionDraft] = useState({
    researchSummary: productionBrief.researchSummary,
    openQuestions: productionBrief.openQuestions.join('\n'),
    guion: card.guion || '',
    assignee: card.assignee || '',
    dueDate: formatDateTimeInput(card.dueDate),
    linkDrive: card.linkDrive || '',
    stageDueAt: formatDateTimeInput(currentFlowStage?.dueAt),
    stageNotes: currentFlowStage?.notes || '',
  });
  const [seoSourceDraft, setSeoSourceDraft] = useState(card.seoSourceText || '');
  const [outputDraft, setOutputDraft] = useState({
    description: card.description || '',
    keywords: card.keywords || '',
  });
  const [seoDraft, setSeoDraft] = useState<VideoSeoDraft | null>(null);
  const [isGeneratingSeo, setIsGeneratingSeo] = useState(false);
  const [seoError, setSeoError] = useState<string | null>(null);
  const [isChecklistExpanded, setIsChecklistExpanded] = useState(false);

  const stages = card.productionFlow?.stages || [];
  const currentStage = execution.currentStage || currentFlowStage || stages.find((stage) => stage.id === card.productionFlow?.currentStageId) || stages[0] || null;
  const nextStage = execution.nextStage || flowSummary?.nextStage || null;
  const selectedStage = stages.find((stage) => stage.id === selectedStageId) || currentStage || stages[0] || null;
  const selectedChecklist = selectedStage ? findStageChecklist(card, selectedStage.id) : null;
  const selectedChecklistItems = selectedChecklist?.items || [];
  const selectedChecklistDone = selectedChecklistItems.filter((item) => item.isCompleted).length;
  const selectedChecklistPending = selectedChecklistItems.filter((item) => !item.isCompleted);
  const currentChecklistPreview = execution.pendingChecklistPreview.length ? execution.pendingChecklistPreview : selectedChecklistPending.slice(0, 3).map((item) => item.text);
  const completionPercent = totalChecklists > 0 ? Math.round((completedChecklists / totalChecklists) * 100) : 0;
  const seededTitleList = useMemo(() => {
    const parsed = parseLines(card.titulosLinden || packageDraft.titleAlternatives || seededTitles.join('\n'));
    return parsed.length ? parsed : [card.title];
  }, [card.titulosLinden, card.title, packageDraft.titleAlternatives, seededTitles]);
  const persistedSourceLabel = getSeoSourceLabel(execution.sourceUsed);
  const heroFacts = [
    { label: 'Etapa actual', value: execution.currentStageLabel || phaseName, detail: execution.currentStageStatusLabel },
    { label: 'Siguiente accion', value: execution.nextActionLabel || phaseAction, detail: execution.nextActionDetail || phaseAction },
    { label: 'Responsable', value: execution.responsibleLabel, detail: currentStage ? `Owner de etapa: ${getAuditRoleLabel(currentStage.ownerRole)}` : 'Sin responsable operativo derivado.' },
    { label: 'Publicacion', value: formatDateTime(card.productionFlow?.publishAt || card.dueDate), detail: flowWorkingDaysLabel || flowScheduleLabel || 'Sin reloj activo todavia.' },
  ];
  const sections = useMemo(() => ([
    { id: 'today' as const, label: 'Hoy', ref: todayRef },
    { id: 'brief' as const, label: 'Brief', ref: briefRef },
    { id: 'package' as const, label: 'Empaque', ref: packageRef },
    { id: 'production' as const, label: 'Produccion', ref: productionRef },
    { id: 'publish' as const, label: 'Publicacion', ref: publishRef },
  ]), []);

  useEffect(() => {
    if (editingSection === 'brief') return;
    setBriefDraft({
      idea: productionBrief.idea,
      audience: productionBrief.audience,
      question: productionBrief.question,
      promise: productionBrief.promise,
      tone: productionBrief.tone,
      creatorNotes: productionBrief.creatorNotes,
    });
  }, [editingSection, productionBrief]);

  useEffect(() => {
    if (editingSection === 'package') return;
    setPackageDraft({
      title: card.title,
      titleAlternatives: card.titulosLinden || seededTitles.join('\n'),
      hook: card.gancho8s || '',
      thumbnailStatus: card.thumbnailPlan?.status || 'pending',
      thumbnailConcept: card.thumbnailPlan?.concept || '',
      thumbnailText: card.thumbnailPlan?.overlayText || '',
      thumbnailAssetUrl: card.thumbnailPlan?.assetUrl || '',
      thumbnailFace: card.miniaturaChecklist?.rostro || false,
      thumbnailTextCheck: card.miniaturaChecklist?.texto || false,
      thumbnailContext: card.miniaturaChecklist?.contexto || false,
    });
  }, [editingSection, card.title, card.titulosLinden, card.gancho8s, card.thumbnailPlan, card.miniaturaChecklist, seededTitles]);

  useEffect(() => {
    if (editingSection === 'production') return;
    setProductionDraft({
      researchSummary: productionBrief.researchSummary,
      openQuestions: productionBrief.openQuestions.join('\n'),
      guion: card.guion || '',
      assignee: card.assignee || '',
      dueDate: formatDateTimeInput(card.dueDate),
      linkDrive: card.linkDrive || '',
      stageDueAt: formatDateTimeInput(selectedStage?.dueAt),
      stageNotes: selectedStage?.notes || '',
    });
  }, [editingSection, productionBrief.researchSummary, productionBrief.openQuestions, card.guion, card.assignee, card.dueDate, card.linkDrive, selectedStage?.dueAt, selectedStage?.notes, formatDateTimeInput]);

  useEffect(() => {
    if (editingSection === 'publish') return;
    setSeoSourceDraft(card.seoSourceText || '');
    setOutputDraft({
      description: card.description || '',
      keywords: card.keywords || '',
    });
  }, [editingSection, card.seoSourceText, card.description, card.keywords]);

  useEffect(() => {
    const fallbackStage = currentStage?.id ?? stages[0]?.id ?? null;
    setSelectedStageId((previous) => {
      if (!fallbackStage) return null;
      if (!previous) return fallbackStage;
      return stages.some((stage) => stage.id === previous) ? previous : fallbackStage;
    });
  }, [currentStage?.id, stages]);

  useEffect(() => {
    setSeoDraft(null);
    setSeoError(null);
    setIsChecklistExpanded(false);
  }, [card.id]);

  useEffect(() => {
    const handleOutsideToolsMenu = (event: MouseEvent) => {
      if (!toolsMenuRef.current || toolsMenuRef.current.contains(event.target as Node)) return;
      setIsToolsMenuOpen(false);
    };

    document.addEventListener('mousedown', handleOutsideToolsMenu);
    return () => document.removeEventListener('mousedown', handleOutsideToolsMenu);
  }, []);

  const setFocusedSection = (sectionId: GuidedCardSectionId) => {
    setExpandedSection(sectionId);
    setActiveNavSection(sectionId);
    setEditingSection(null);
  };

  const scrollToSection = (sectionId: GuidedCardSectionId, behavior: ScrollBehavior = 'smooth') => {
    setFocusedSection(sectionId);
    sections.find((section) => section.id === sectionId)?.ref.current?.scrollIntoView({ behavior, block: 'start' });
  };

  const didInitialScroll = useRef(false);
  useEffect(() => {
    if (didInitialScroll.current) return;
    didInitialScroll.current = true;

    const { section, focus } = initialLocation;
    setFocusedSection(section || 'today');

    if (section === 'production' && focus === 'script') {
      const scriptStage = stages.find((stage) => stage.id === 'script');
      if (scriptStage) setSelectedStageId(scriptStage.id);
    } else if (section === 'production' && currentStage) {
      setSelectedStageId(currentStage.id);
    }

    if (section === 'publish' && focus === 'final_review') {
      setShowPublishAdvanced(true);
    }

    const timer = window.setTimeout(() => {
      scrollToSection(section || 'today', 'smooth');

      const focusTarget = section === 'today'
        ? nextActionRef.current
        : section === 'production'
        ? focus === 'checklist'
          ? checklistRef.current
          : focus === 'notes'
          ? notesRef.current
          : focus === 'script'
          ? scriptRef.current
          : null
        : section === 'package'
        ? focus === 'thumbnail'
          ? thumbnailRef.current
          : null
        : section === 'publish'
        ? focus === 'description'
          ? descriptionRef.current
          : focus === 'final_review'
          ? finalReviewRef.current
          : null
        : null;

      focusTarget?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);

    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id]);

  useEffect(() => {
    const root = scrollContainerRef.current;
    if (!root) return undefined;

    const updateSectionFromScroll = () => {
      const rootTop = root.getBoundingClientRect().top;
      const activationOffset = 140;
      let nextSection: GuidedCardSectionId = 'today';

      for (const section of sections) {
        const target = section.ref.current;
        if (!target) continue;
        const top = target.getBoundingClientRect().top - rootTop;
        if (top <= activationOffset) {
          nextSection = section.id;
        }
      }

      setActiveNavSection((current) => (current === nextSection ? current : nextSection));
    };

    updateSectionFromScroll();
    root.addEventListener('scroll', updateSectionFromScroll, { passive: true });
    window.addEventListener('resize', updateSectionFromScroll);

    return () => {
      root.removeEventListener('scroll', updateSectionFromScroll);
      window.removeEventListener('resize', updateSectionFromScroll);
    };
  }, [scrollContainerRef, sections]);

  const todayPrimaryStage = currentStage || nextStage || selectedStage;

  const getStageTone = (stage: ProductionStage): FlowTone => {
    if (stage.status === 'done') return 'success';
    if (stage.status === 'blocked') return 'danger';
    if (stage.id === currentStage?.id && flowSummary?.isOverdueByBudget) return 'danger';
    if (stage.id === currentStage?.id && flowSummary?.isAtRisk) return 'warning';
    if (stage.id === currentStage?.id) return 'brand';
    return 'neutral';
  };

  const getPrimaryStageLabel = (stage: ProductionStage | null) => {
    if (!stage) return 'Abrir brief';
    if (stage.status === 'blocked') return 'Volver a activar';
    if (stage.status === 'pending') return stage.id === 'idea' && !card.productionFlow?.kickoffAt ? 'Aprobar idea e iniciar' : 'Iniciar etapa';
    if (stage.status === 'in_progress') return 'Marcar etapa lista';
    if (stage.id === currentStage?.id && nextStage) return `Abrir ${nextStage.label}`;
    return 'Reabrir etapa';
  };

  const handleStagePrimaryAction = (stage: ProductionStage | null) => {
    if (!stage || readOnly) return;

    if (stage.status === 'blocked') {
      onStageStatusChange(stage.id, 'in_progress');
      return;
    }

    if (stage.status === 'pending') {
      onStageStatusChange(stage.id, 'in_progress');
      return;
    }

    if (stage.status === 'in_progress') {
      onStageStatusChange(stage.id, 'done');
      return;
    }

    if (stage.id === currentStage?.id && nextStage) {
      setSelectedStageId(nextStage.id);
      scrollToSection('production');
      return;
    }

    onStageStatusChange(stage.id, 'pending');
  };

  const handleTodayPrimaryAction = () => {
    if (!todayPrimaryStage) {
      scrollToSection('brief');
      return;
    }
    handleStagePrimaryAction(todayPrimaryStage);
  };

  const handleCopy = async (key: string, value: string) => {
    if (!value.trim()) return;

    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(key);
      window.setTimeout(() => setCopiedField((current) => (current === key ? null : current)), 1500);
    } catch {
      setCopiedField(null);
    }
  };

  const currentSourceLabel = getSeoSourceLabel(seoDraft?.sourceUsed || execution.sourceUsed);
  const seoDraftKeywordsText = seoDraft ? stringifyKeywords(seoDraft.keywords) : '';
  const seoDraftDescription = seoDraft
    ? renderSeoDescriptionTemplate({
        template: resolvedSeoConfig.descriptionTemplate,
        descriptionBody: seoDraft.descriptionBody,
        hashtags: seoDraft.hashtags,
        productUrl: resolvedSeoConfig.productUrl,
        instagramUrl: resolvedSeoConfig.instagramUrl,
        tiktokUrl: resolvedSeoConfig.tiktokUrl,
        collabEmail: resolvedSeoConfig.collabEmail,
      })
    : '';

  const briefPreview = {
    primary: productionBrief.question || productionBrief.idea || 'Brief pendiente de aterrizar',
    secondary: productionBrief.promise || productionBrief.audience || 'La idea, la promesa y la audiencia viven aqui sin forzarte a abrir formularios.',
    chips: [productionBrief.audience, productionBrief.tone].filter(Boolean),
  };
  const packagePreview = {
    primary: card.title || 'Titulo pendiente',
    secondary: card.gancho8s || packageDraft.thumbnailConcept || 'Titulo, hook y miniatura se cierran aqui antes de pasar a producir.',
    chips: [
      seededTitleList.length ? `${seededTitleList.length} titulos` : '',
      card.thumbnailPlan?.concept?.trim() || card.thumbnailPlan?.overlayText?.trim() ? thumbnailStatusLabels[card.thumbnailPlan?.status || 'pending'] : 'Miniatura pendiente',
    ].filter(Boolean),
  };
  const productionPreview = {
    primary: execution.currentStageLabel || phaseName,
    secondary: execution.nextActionDetail || phaseAction,
    chips: [execution.currentStageStatusLabel, execution.checklistProgress.totalCount ? `${execution.checklistProgress.completedCount}/${execution.checklistProgress.totalCount} checklist` : 'Sin checklist'],
  };
  const publishPreview = {
    primary: card.description?.trim() ? 'Descripcion lista para publicar' : 'Descripcion pendiente',
    secondary: card.description?.trim() ? 'La metadata principal ya esta guardada.' : `La descripcion saldra de ${persistedSourceLabel.toLowerCase()}.`,
    chips: [persistedSourceLabel, card.keywords?.trim() ? 'Keywords listas' : 'Keywords avanzadas'],
  };
  const todayPreview = {
    primary: execution.nextActionLabel || 'Abrir paso activo',
    secondary: execution.nextActionDetail || 'La tarjeta abre enfocada en lo que toca hoy.',
    chips: [execution.currentStageLabel, flowScheduleLabel || 'Sin reloj', `${completionPercent}% checklist`],
  };

  const saveBrief = () => {
    onUpdateProductionBrief(briefDraft);
    setEditingSection(null);
  };

  const savePackage = () => {
    onUpdateCard({
      title: packageDraft.title,
      titulosLinden: packageDraft.titleAlternatives,
      gancho8s: packageDraft.hook,
      thumbnailPlan: {
        status: packageDraft.thumbnailStatus as ThumbnailPlanStatus,
        concept: packageDraft.thumbnailConcept,
        overlayText: packageDraft.thumbnailText,
        assetUrl: packageDraft.thumbnailAssetUrl,
        generationPrompt: card.thumbnailPlan?.generationPrompt || '',
        useRealPerson: card.thumbnailPlan?.useRealPerson || false,
      },
      miniaturaChecklist: {
        rostro: packageDraft.thumbnailFace,
        texto: packageDraft.thumbnailTextCheck,
        contexto: packageDraft.thumbnailContext,
      },
    });
    setEditingSection(null);
  };

  const saveProduction = () => {
    onUpdateProductionBrief({
      researchSummary: productionDraft.researchSummary,
      openQuestions: parseLines(productionDraft.openQuestions),
    });
    onUpdateCard({
      guion: productionDraft.guion,
      assignee: productionDraft.assignee.trim() ? productionDraft.assignee.trim() : null,
      dueDate: toIsoOrNull(productionDraft.dueDate),
      linkDrive: productionDraft.linkDrive,
    });

    if (selectedStage) {
      if (productionDraft.stageDueAt.trim()) {
        onStageDueAtChange(selectedStage.id, productionDraft.stageDueAt);
      }
      onStageNotesChange(selectedStage.id, productionDraft.stageNotes);
    }

    setEditingSection(null);
  };

  const savePublish = () => {
    onUpdateCard({
      seoSourceText: seoSourceDraft,
      description: outputDraft.description,
      keywords: outputDraft.keywords,
    });
    setEditingSection(null);
  };

  const handleGenerateSeo = async () => {
    if (isGeneratingSeo) return;
    setIsGeneratingSeo(true);
    setSeoError(null);

    try {
      const nextDraft = await generateVideoSeoDraft({
        title: editingSection === 'package' ? packageDraft.title : card.title,
        productionBrief: {
          ...productionBrief,
          ...(editingSection === 'brief' ? briefDraft : null),
          ...(editingSection === 'production'
            ? {
                researchSummary: productionDraft.researchSummary,
                openQuestions: parseLines(productionDraft.openQuestions),
              }
            : null),
        },
        hook: editingSection === 'package' ? packageDraft.hook : card.gancho8s,
        script: editingSection === 'production' ? productionDraft.guion : card.guion,
        seededTitles: parseLines(editingSection === 'package' ? packageDraft.titleAlternatives : card.titulosLinden || seededTitles.join('\n')),
        seoSourceText: seoSourceDraft,
        channelSeoConfig: resolvedSeoConfig,
      });
      setSeoDraft(nextDraft);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo generar el borrador SEO en este momento.';
      setSeoError(message);
    } finally {
      setIsGeneratingSeo(false);
    }
  };

  const applySeoDraft = (mode: 'description' | 'keywords' | 'both') => {
    if (!seoDraft) return;

    const nextUpdates: Partial<CardData> = {
      seoSourceText: seoSourceDraft,
    };

    if (mode === 'description' || mode === 'both') {
      nextUpdates.description = seoDraftDescription;
      setOutputDraft((previous) => ({ ...previous, description: seoDraftDescription }));
    }

    if (mode === 'keywords' || mode === 'both') {
      nextUpdates.keywords = seoDraftKeywordsText;
      setOutputDraft((previous) => ({ ...previous, keywords: seoDraftKeywordsText }));
    }

    onUpdateCard(nextUpdates);
  };

  const toolsMenu = !readOnly ? (
    <div ref={toolsMenuRef} className="relative">
      <button type="button" onClick={() => setIsToolsMenuOpen((previous) => !previous)} className="inline-flex h-11 w-11 items-center justify-center rounded-full border" style={subtleButtonStyle}>
        <MoreHorizontal size={18} />
      </button>
      {isToolsMenuOpen ? (
        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-20 w-[320px] rounded-[1.35rem] border p-4 shadow-[0_24px_40px_-30px_rgba(15,23,42,0.55)]" style={panelStyle}>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--ff-text-tertiary)' }}>Herramientas rapidas</p>
          <p className="mt-2 text-sm leading-6" style={{ color: 'var(--ff-text-secondary)' }}>
            Las acciones menos frecuentes viven aqui para que el cockpit principal siga respirando.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {(Object.keys(CHECKLIST_TEMPLATES) as Array<keyof typeof CHECKLIST_TEMPLATES>).map((template) => (
              <button key={template} type="button" onClick={() => { onAddChecklist(template); setIsToolsMenuOpen(false); }} className="rounded-full px-3 py-2 text-xs font-semibold" style={subtleButtonStyle}>
                {template}
              </button>
            ))}
          </div>
          <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--ff-border)' }}>
            <button
              type="button"
              onClick={() => {
                if (confirmingDelete) {
                  onDeleteCard();
                  return;
                }
                setConfirmingDelete(true);
                window.setTimeout(() => setConfirmingDelete(false), 3000);
              }}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
              style={confirmingDelete ? flowDangerActionStyle : dangerButtonStyle}
            >
              <Trash2 size={15} />
              <span>{confirmingDelete ? 'Confirmar eliminacion' : 'Eliminar tarjeta'}</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  ) : null;

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col">
      <div
        className="rounded-[1.9rem] border p-5 md:p-6"
        style={{
          ...panelStyle,
          background: 'linear-gradient(180deg, color-mix(in srgb, var(--ff-primary) 8%, var(--ff-surface-solid)), var(--ff-surface-solid))',
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-4xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--ff-primary)' }}>Cockpit activo YouTube</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full px-3 py-1 text-[11px] font-bold uppercase" style={primarySoftStyle}>
                {card.contentType === 'short' ? 'Short' : 'Video largo'}
              </span>
              <span className="rounded-full px-3 py-1 text-[11px] font-bold uppercase" style={flowScheduleChipStyle}>
                {flowScheduleLabel || 'Sin reloj activo'}
              </span>
              {currentStage ? (
                <span className="rounded-full px-3 py-1 text-[11px] font-bold uppercase" style={getFlowToneStyle(getStageTone(currentStage))}>
                  {currentStage.label}
                </span>
              ) : null}
            </div>
            <h1 className="mt-4 text-2xl font-bold leading-tight md:text-[2rem]" style={{ color: 'var(--ff-text-primary)' }}>{card.title}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 md:text-[15px]" style={{ color: 'var(--ff-text-secondary)' }}>
              Lo que pesa para YouTube y para el equipo queda visible sin ruido: titulo, miniatura, descripcion, guion y checklist.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {toolsMenu}
          </div>
        </div>

        {suggestedTitle ? (
          <div className="mt-5 rounded-[1.35rem] border p-4" style={{ ...getFlowToneStyle('brand'), background: 'color-mix(in srgb, var(--ff-primary) 12%, var(--ff-surface-solid))' }}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="max-w-3xl">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em]">Sugerencia de titulo</p>
                <p className="mt-2 text-base font-semibold">{suggestedTitle}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={onAcceptSuggestedTitle} className="rounded-full px-4 py-2 text-sm font-semibold" style={flowPrimaryActionStyle}>Usar sugerencia</button>
                <button type="button" onClick={onDismissSuggestedTitle} className="rounded-full px-4 py-2 text-sm font-semibold" style={subtleButtonStyle}>Cerrar</button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          {heroFacts.map((fact) => (
            <MetricCard key={fact.label} label={fact.label} value={fact.value} detail={fact.detail} />
          ))}
        </div>

        <div className="mt-5 rounded-[1.35rem] border p-4" style={raisedPanelStyle}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--ff-text-tertiary)' }}>Salud del paquete YouTube</p>
              <p className="mt-2 text-sm" style={{ color: 'var(--ff-text-secondary)' }}>
                Semaforo rapido para decidir si el video ya tiene lo esencial para pasar a ejecucion o publicacion.
              </p>
            </div>
            <span className="rounded-full px-3 py-1 text-[11px] font-bold uppercase" style={subtleButtonStyle}>{completionPercent}% checklist global</span>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-6">
            {execution.readiness.map((item) => (
              <div key={item.id} className="rounded-[1rem] border px-3 py-3" style={getReadinessStyle(item)}>
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-current/30">
                    {item.status === 'ready' ? <Check size={11} /> : <Target size={11} />}
                  </span>
                  <p className="text-xs font-bold uppercase tracking-[0.14em]">{item.label}</p>
                </div>
                <p className="mt-2 text-xs leading-5">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>

        {execution.notices.length ? (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {execution.notices.map((notice) => (
              <div key={notice.id} className="rounded-[1.25rem] border px-4 py-3" style={getFlowToneStyle(notice.tone)}>
                <div className="flex items-start gap-2.5">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold">{notice.title}</p>
                    <p className="mt-1 text-xs leading-5">{notice.body}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="sticky top-0 z-10 mt-4 -mx-1 px-1 py-3" style={{ background: 'linear-gradient(180deg, var(--ff-surface) 78%, transparent)' }}>
        <div className="rounded-[1.3rem] border p-2" style={panelStyle}>
          <div className="flex gap-2 overflow-x-auto ff-scrollbar">
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => scrollToSection(section.id)}
                className="shrink-0 rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.14em]"
                style={activeNavSection === section.id ? primarySoftStyle : subtleButtonStyle}
              >
                {section.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4 pb-8">
        <GuidedSection
          sectionRef={todayRef}
          kicker="Hoy"
          title="Abre el video por la accion que toca ejecutar"
          description="Este bloque aterriza la siguiente accion, los pendientes clave y el estado real del flujo sin forzarte a recorrer toda la tarjeta."
          preview={<CollapsedPreview primary={todayPreview.primary} secondary={todayPreview.secondary} chips={todayPreview.chips} />}
          expanded={expandedSection === 'today'}
          onToggle={() => scrollToSection('today')}
          action={!readOnly ? (
            <button type="button" onClick={handleTodayPrimaryAction} className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold" style={flowPrimaryActionStyle}>
              <span>{getPrimaryStageLabel(todayPrimaryStage)}</span>
              <ArrowRight size={15} />
            </button>
          ) : null}
        >
          <div ref={nextActionRef} className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <div className="rounded-[1.3rem] border p-4 md:p-5" style={{ ...raisedPanelStyle, ...(todayPrimaryStage ? getFlowToneStyle(getStageTone(todayPrimaryStage)) : {}) }}>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em]">Siguiente accion</p>
              <h3 className="mt-2 text-xl font-bold">{execution.nextActionLabel || phaseAction}</h3>
              <p className="mt-2 text-sm leading-6">{execution.nextActionDetail || phaseAction}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-full px-3 py-1" style={subtleButtonStyle}>{execution.currentStageLabel || phaseName}</span>
                <span className="rounded-full px-3 py-1" style={subtleButtonStyle}>{execution.responsibleLabel}</span>
                <span className="rounded-full px-3 py-1" style={subtleButtonStyle}>{flowScheduleLabel || 'Sin reloj activo'}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => { scrollToSection('production'); if (currentStage) setSelectedStageId(currentStage.id); }} className="rounded-full px-4 py-2 text-sm font-semibold" style={subtleButtonStyle}>
                  Ir a produccion
                </button>
                <button type="button" onClick={() => { scrollToSection('publish'); setShowPublishAdvanced(false); }} className="rounded-full px-4 py-2 text-sm font-semibold" style={subtleButtonStyle}>
                  Revisar publicacion
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[1.3rem] border p-4" style={raisedPanelStyle}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--ff-text-tertiary)' }}>Pendientes clave</p>
                    <p className="mt-2 text-sm font-semibold" style={{ color: 'var(--ff-text-primary)' }}>
                      {execution.checklistProgress.totalCount
                        ? `${execution.checklistProgress.completedCount}/${execution.checklistProgress.totalCount} items cerrados en la etapa actual`
                        : 'Sin checklist ligada todavia'}
                    </p>
                  </div>
                  <span className="rounded-full px-3 py-1 text-[11px] font-bold uppercase" style={primarySoftStyle}>{completionPercent}%</span>
                </div>
                <div className="mt-4 space-y-2">
                  {currentChecklistPreview.length ? currentChecklistPreview.map((item) => (
                    <div key={item} className="rounded-[1rem] border px-3 py-3 text-sm" style={mutedPanelStyle}>
                      {item}
                    </div>
                  )) : <EmptyState>Esta etapa todavia no deja una checklist priorizada. Puedes abrir Produccion para revisar el detalle.</EmptyState>}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={() => { scrollToSection('production'); if (currentStage) setSelectedStageId(currentStage.id); checklistRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }} className="rounded-full px-4 py-2 text-sm font-semibold" style={subtleButtonStyle}>
                    Ver checklist completa
                  </button>
                  <button type="button" onClick={() => { scrollToSection('production'); if (currentStage) setSelectedStageId(currentStage.id); notesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }} className="rounded-full px-4 py-2 text-sm font-semibold" style={subtleButtonStyle}>
                    Abrir notas de etapa
                  </button>
                </div>
              </div>
            </div>
          </div>
        </GuidedSection>

        <GuidedSection
          sectionRef={briefRef}
          kicker="Brief"
          title="Idea, pregunta y promesa sin friccion"
          description="El brief queda visible como resumen operativo y solo se convierte en formulario cuando de verdad hay que corregirlo."
          preview={<CollapsedPreview primary={briefPreview.primary} secondary={briefPreview.secondary} chips={briefPreview.chips} />}
          expanded={expandedSection === 'brief'}
          onToggle={() => scrollToSection('brief')}
          action={!readOnly ? (
            <button type="button" onClick={() => setEditingSection((current) => current === 'brief' ? null : 'brief')} className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold" style={editingSection === 'brief' ? subtleButtonStyle : primarySoftStyle}>
              <Pencil size={15} />
              <span>{editingSection === 'brief' ? 'Cancelar' : 'Editar brief'}</span>
            </button>
          ) : null}
        >
          {editingSection === 'brief' ? (
            <div className="grid gap-4">
              <TextField label="Idea base" value={briefDraft.idea} onChange={(value) => setBriefDraft((previous) => ({ ...previous, idea: value }))} placeholder="Premisa madre del video" />
              <div className="grid gap-4 md:grid-cols-2">
                <TextField label="Audiencia" value={briefDraft.audience} onChange={(value) => setBriefDraft((previous) => ({ ...previous, audience: value }))} placeholder="Quien tiene que sentir el video como propio?" />
                <TextField label="Tono" value={briefDraft.tone} onChange={(value) => setBriefDraft((previous) => ({ ...previous, tone: value }))} placeholder="Comparativo, directo, tecnico, polemico..." />
              </div>
              <TextField label="Pregunta exacta" value={briefDraft.question} onChange={(value) => setBriefDraft((previous) => ({ ...previous, question: value }))} placeholder="Que pregunta exacta responde?" />
              <TextField label="Promesa" value={briefDraft.promise} onChange={(value) => setBriefDraft((previous) => ({ ...previous, promise: value }))} placeholder="Que promete resolver o demostrar?" />
              <TextField label="Notas del creador" value={briefDraft.creatorNotes} onChange={(value) => setBriefDraft((previous) => ({ ...previous, creatorNotes: value }))} placeholder="Notas, matices, referencias, dudas..." multiline rows={5} />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setEditingSection(null)} className="rounded-full px-5 py-2.5 text-sm font-semibold" style={subtleButtonStyle}>Cancelar</button>
                <button type="button" onClick={saveBrief} className="rounded-full px-5 py-2.5 text-sm font-semibold" style={flowPrimaryActionStyle}>Guardar brief</button>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              <PreviewCard label="Idea base" value={productionBrief.idea || card.title} detail="La premisa madre que dispara la produccion." />
              <PreviewCard label="Pregunta exacta" value={productionBrief.question || 'Pendiente de aterrizar'} detail="Lo que realmente tiene que contestar el video." />
              <PreviewCard label="Promesa" value={productionBrief.promise || 'Pendiente de definir'} detail="La recompensa que recibe la audiencia si se queda." />
              <PreviewCard label="Audiencia y tono" value={productionBrief.audience || 'Audiencia pendiente'} detail={productionBrief.tone || 'Tono pendiente'} />
              <div className="md:col-span-2">
                <PreviewCard label="Notas del creador" value={productionBrief.creatorNotes || 'Sin notas adicionales todavia.'} />
              </div>
            </div>
          )}
        </GuidedSection>

        <GuidedSection
          sectionRef={packageRef}
          kicker="Empaque"
          title="Titulo, hook y miniatura antes de tocar la publicacion"
          description="El empaque vive como entregable principal. Primero reconoces lo que hay, luego entras a refinarlo sin ruido."
          preview={<CollapsedPreview primary={packagePreview.primary} secondary={packagePreview.secondary} chips={packagePreview.chips} />}
          expanded={expandedSection === 'package'}
          onToggle={() => scrollToSection('package')}
          action={!readOnly ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void onImproveTitle()} className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold" style={primarySoftStyle}>
                {isImprovingTitle ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                <span>{isImprovingTitle ? 'Mejorando...' : 'Mejorar titulo'}</span>
              </button>
              <button type="button" onClick={() => setEditingSection((current) => current === 'package' ? null : 'package')} className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold" style={editingSection === 'package' ? subtleButtonStyle : primarySoftStyle}>
                <Pencil size={15} />
                <span>{editingSection === 'package' ? 'Cancelar' : 'Refinar empaque'}</span>
              </button>
            </div>
          ) : null}
        >
          {editingSection === 'package' ? (
            <div className="grid gap-4">
              <TextField label="Titulo final" value={packageDraft.title} onChange={(value) => setPackageDraft((previous) => ({ ...previous, title: value }))} placeholder="Titulo final del video" />
              <TextField label="Titulos alternativos" value={packageDraft.titleAlternatives} onChange={(value) => setPackageDraft((previous) => ({ ...previous, titleAlternatives: value }))} placeholder="Un titulo por linea" multiline rows={5} />
              <TextField label="Hook" value={packageDraft.hook} onChange={(value) => setPackageDraft((previous) => ({ ...previous, hook: value }))} placeholder="Gancho de apertura" multiline rows={4} />
              <div ref={thumbnailRef} className="grid gap-4 rounded-[1.2rem] border p-4" style={mutedPanelStyle}>
                <div className="grid gap-4 md:grid-cols-2">
                  <SelectField
                    label="Estado de miniatura"
                    value={packageDraft.thumbnailStatus}
                    onChange={(value) => setPackageDraft((previous) => ({ ...previous, thumbnailStatus: value as ThumbnailPlanStatus }))}
                    options={Object.entries(thumbnailStatusLabels).map(([value, label]) => ({ value, label }))}
                  />
                  <TextField label="Texto en miniatura" value={packageDraft.thumbnailText} onChange={(value) => setPackageDraft((previous) => ({ ...previous, thumbnailText: value }))} placeholder="Texto corto de thumbnail" />
                </div>
                <TextField label="Concepto visual" value={packageDraft.thumbnailConcept} onChange={(value) => setPackageDraft((previous) => ({ ...previous, thumbnailConcept: value }))} placeholder="Que tiene que prometer visualmente la miniatura?" multiline rows={4} />
                <TextField label="Referencia o asset URL" value={packageDraft.thumbnailAssetUrl} onChange={(value) => setPackageDraft((previous) => ({ ...previous, thumbnailAssetUrl: value }))} placeholder="Link de referencia, captura o asset" />
                <div>
                  <p className="mb-2 block text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--ff-text-tertiary)' }}>Checklist visual</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { key: 'thumbnailFace', label: 'Rostro' },
                      { key: 'thumbnailTextCheck', label: 'Texto' },
                      { key: 'thumbnailContext', label: 'Contexto' },
                    ].map((item) => {
                      const active = packageDraft[item.key as 'thumbnailFace' | 'thumbnailTextCheck' | 'thumbnailContext'];
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => setPackageDraft((previous) => ({ ...previous, [item.key]: !previous[item.key as 'thumbnailFace' | 'thumbnailTextCheck' | 'thumbnailContext'] }))}
                          className="rounded-full px-3 py-2 text-xs font-semibold"
                          style={active ? primarySoftStyle : subtleButtonStyle}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setEditingSection(null)} className="rounded-full px-5 py-2.5 text-sm font-semibold" style={subtleButtonStyle}>Cancelar</button>
                <button type="button" onClick={savePackage} className="rounded-full px-5 py-2.5 text-sm font-semibold" style={flowPrimaryActionStyle}>Guardar empaque</button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <PreviewCard label="Titulo final" value={card.title || 'Pendiente de definir'} detail="Lo que vera la audiencia antes de entrar." />
                <PreviewCard label="Promesa visual" value={productionBrief.promise || 'Sin promesa visual aterrizada todavia'} detail="La miniatura y el titulo tienen que vender esto en segundos." />
              </div>
              <div className="rounded-[1.2rem] border p-4" style={raisedPanelStyle}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--ff-text-tertiary)' }}>Hook de apertura</p>
                    <p className="mt-2 text-sm font-semibold leading-6" style={{ color: 'var(--ff-text-primary)' }}>{card.gancho8s || 'Todavia no hay hook sembrado.'}</p>
                  </div>
                  <button type="button" onClick={() => void handleCopy('hook', card.gancho8s || '')} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold" style={subtleButtonStyle}>
                    {copiedField === 'hook' ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copiedField === 'hook' ? 'Copiado' : 'Copiar'}</span>
                  </button>
                </div>
              </div>
              <div className="rounded-[1.2rem] border p-4" style={raisedPanelStyle}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--ff-text-tertiary)' }}>Alternativas de titulo</p>
                  <button type="button" onClick={() => void handleCopy('titles', seededTitleList.join('\n'))} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold" style={subtleButtonStyle}>
                    {copiedField === 'titles' ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copiedField === 'titles' ? 'Copiado' : 'Copiar'}</span>
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {seededTitleList.map((title, index) => (
                    <span key={`${title}-${index}`} className="rounded-full px-3 py-1.5 text-xs font-semibold" style={primarySoftStyle}>{title}</span>
                  ))}
                </div>
              </div>
              <div ref={thumbnailRef} className="grid gap-3 md:grid-cols-2">
                <PreviewCard
                  label="Miniatura"
                  value={card.thumbnailPlan?.concept || 'Concepto pendiente'}
                  detail={card.thumbnailPlan?.overlayText || 'Todavia no hay texto de miniatura definido.'}
                  toneStyle={card.thumbnailPlan?.concept || card.thumbnailPlan?.overlayText ? primarySoftStyle : undefined}
                />
                <PreviewCard
                  label="Estado de miniatura"
                  value={thumbnailStatusLabels[card.thumbnailPlan?.status || 'pending']}
                  detail={card.thumbnailPlan?.assetUrl || 'Sin referencia visual enlazada todavia.'}
                />
                <div className="md:col-span-2 rounded-[1.2rem] border p-4" style={raisedPanelStyle}>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--ff-text-tertiary)' }}>Checklist visual de miniatura</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[
                      { label: 'Rostro', active: !!card.miniaturaChecklist?.rostro },
                      { label: 'Texto', active: !!card.miniaturaChecklist?.texto },
                      { label: 'Contexto', active: !!card.miniaturaChecklist?.contexto },
                    ].map((item) => (
                      <span key={item.label} className="rounded-full px-3 py-1.5 text-xs font-semibold" style={item.active ? primarySoftStyle : subtleButtonStyle}>
                        {item.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              {!hasSeededPackage ? (
                <EmptyState>
                  Esta tarjeta todavia no trae suficiente contexto sembrado desde Nuevo video. Puedes completar el empaque aqui sin convertir el flujo en un formulario pesado.
                </EmptyState>
              ) : null}
            </div>
          )}
        </GuidedSection>

        <GuidedSection
          sectionRef={productionRef}
          kicker="Produccion"
          title="Guion, research y checklist en una sola estacion de trabajo"
          description="La produccion concentra el paso activo, la documentacion util y la checklist expandible sin duplicar estados por toda la tarjeta."
          preview={<CollapsedPreview primary={productionPreview.primary} secondary={productionPreview.secondary} chips={productionPreview.chips} />}
          expanded={expandedSection === 'production'}
          onToggle={() => scrollToSection('production')}
          action={!readOnly ? (
            <button type="button" onClick={() => setEditingSection((current) => current === 'production' ? null : 'production')} className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold" style={editingSection === 'production' ? subtleButtonStyle : primarySoftStyle}>
              <Pencil size={15} />
              <span>{editingSection === 'production' ? 'Cancelar' : 'Editar produccion'}</span>
            </button>
          ) : null}
        >
          {stages.length ? (
            <div className="space-y-4">
              <div className="flex gap-2 overflow-x-auto pb-2 ff-scrollbar">
                {stages.map((stage) => (
                  <button
                    key={stage.id}
                    type="button"
                    onClick={() => setSelectedStageId(stage.id)}
                    className="shrink-0 rounded-full border px-3 py-2 text-xs font-bold uppercase tracking-[0.12em]"
                    style={stage.id === selectedStage?.id ? getFlowToneStyle(getStageTone(stage)) : subtleButtonStyle}
                  >
                    {stage.label}
                  </button>
                ))}
              </div>

              {selectedStage ? (
                <>
                  <div className="rounded-[1.4rem] border p-4 md:p-5" style={{ ...raisedPanelStyle, ...getFlowToneStyle(getStageTone(selectedStage)) }}>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="max-w-3xl">
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em]">Paso activo</p>
                        <h3 className="mt-2 text-xl font-bold">{selectedStage.label}</h3>
                        <p className="mt-2 text-sm leading-6">{selectedStage.deliverable}</p>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                          <span className="rounded-full px-3 py-1" style={subtleButtonStyle}>{getAuditRoleLabel(selectedStage.ownerRole)}</span>
                          <span className="rounded-full px-3 py-1" style={subtleButtonStyle}>{formatDateTime(selectedStage.dueAt)}</span>
                          {selectedStage.hasAIDraft ? <span className="rounded-full px-3 py-1" style={primarySoftStyle}>Borrador IA listo</span> : null}
                        </div>
                      </div>
                      {!readOnly ? (
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => handleStagePrimaryAction(selectedStage)} className="rounded-full px-4 py-2 text-sm font-semibold" style={flowPrimaryActionStyle}>
                            {getPrimaryStageLabel(selectedStage)}
                          </button>
                          {selectedStage.status !== 'blocked' && selectedStage.status !== 'done' ? (
                            <button type="button" onClick={() => onStageStatusChange(selectedStage.id, 'blocked')} className="rounded-full px-4 py-2 text-sm font-semibold" style={flowDangerActionStyle}>Bloquear</button>
                          ) : null}
                          {selectedStage.status === 'done' ? (
                            <button type="button" onClick={() => onStageStatusChange(selectedStage.id, 'pending')} className="rounded-full px-4 py-2 text-sm font-semibold" style={subtleButtonStyle}>Reabrir</button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {suggestedFlowColumnTitle ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.1rem] border px-4 py-3" style={getFlowToneStyle('warning')}>
                      <div>
                        <p className="text-sm font-semibold">Mover a la columna sugerida</p>
                        <p className="mt-1 text-xs leading-5">El flujo espera esta tarjeta en {suggestedFlowColumnTitle}. Cambiarla reduce ruido operativo.</p>
                      </div>
                      {!readOnly ? <button type="button" onClick={onMoveToSuggestedColumn} className="rounded-full px-4 py-2 text-sm font-semibold" style={subtleButtonStyle}>Mover ahora</button> : null}
                    </div>
                  ) : null}

                  {editingSection === 'production' ? (
                    <div className="grid gap-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <TextField label="Responsable" value={productionDraft.assignee} onChange={(value) => setProductionDraft((previous) => ({ ...previous, assignee: value }))} placeholder="Tu, Editor o sin asignar" />
                        <label className="block">
                          <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--ff-text-tertiary)' }}>Fecha editorial</span>
                          <input
                            type="datetime-local"
                            value={productionDraft.dueDate}
                            onChange={(event) => setProductionDraft((previous) => ({ ...previous, dueDate: event.target.value }))}
                            className="min-h-12 w-full rounded-[1.1rem] px-4 py-3 text-sm outline-none"
                            style={{ background: 'var(--ff-input-bg)', color: 'var(--ff-text-primary)', border: '1px solid var(--ff-input-border)' }}
                          />
                        </label>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="block">
                          <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--ff-text-tertiary)' }}>Fecha de etapa</span>
                          <input
                            type="datetime-local"
                            value={productionDraft.stageDueAt}
                            onChange={(event) => setProductionDraft((previous) => ({ ...previous, stageDueAt: event.target.value }))}
                            className="min-h-12 w-full rounded-[1.1rem] px-4 py-3 text-sm outline-none"
                            style={{ background: 'var(--ff-input-bg)', color: 'var(--ff-text-primary)', border: '1px solid var(--ff-input-border)' }}
                          />
                        </label>
                        <TextField label="Drive o carpeta" value={productionDraft.linkDrive} onChange={(value) => setProductionDraft((previous) => ({ ...previous, linkDrive: value }))} placeholder="Link de Drive o carpeta del proyecto" />
                      </div>
                      <TextField label="Research" value={productionDraft.researchSummary} onChange={(value) => setProductionDraft((previous) => ({ ...previous, researchSummary: value }))} placeholder="Hallazgos y contexto utiles para producir" multiline rows={4} />
                      <TextField label="Preguntas abiertas" value={productionDraft.openQuestions} onChange={(value) => setProductionDraft((previous) => ({ ...previous, openQuestions: value }))} placeholder="Una pregunta por linea" multiline rows={4} />
                      <div ref={scriptRef}>
                        <TextField label="Guion o escaleta" value={productionDraft.guion} onChange={(value) => setProductionDraft((previous) => ({ ...previous, guion: value }))} placeholder="Guion base del video" multiline rows={9} />
                      </div>
                      <div ref={notesRef}>
                        <TextField label="Notas de la etapa" value={productionDraft.stageNotes} onChange={(value) => setProductionDraft((previous) => ({ ...previous, stageNotes: value }))} placeholder="Bloqueos, decisiones, feedback o links clave..." multiline rows={4} />
                      </div>
                      <div>
                        <p className="mb-2 block text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--ff-text-tertiary)' }}>Labels activas</p>
                        <div className="flex flex-wrap gap-2">
                          {LABELS.map((label) => {
                            const active = card.labels.some((current) => current.id === label.id);
                            return (
                              <button key={label.id} type="button" onClick={() => onToggleLabel(label)} className="rounded-full px-3 py-2 text-xs font-semibold" style={active ? labelToneMap[label.color] : subtleButtonStyle}>
                                {label.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setEditingSection(null)} className="rounded-full px-5 py-2.5 text-sm font-semibold" style={subtleButtonStyle}>Cancelar</button>
                        <button type="button" onClick={saveProduction} className="rounded-full px-5 py-2.5 text-sm font-semibold" style={flowPrimaryActionStyle}>Guardar produccion</button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-3">
                        <PreviewCard label="Responsable" value={card.assignee || execution.responsibleLabel || 'Sin asignar'} detail={`Owner de etapa: ${getAuditRoleLabel(selectedStage.ownerRole)}`} />
                        <PreviewCard label="Fecha editorial" value={formatDateTime(card.dueDate)} detail={flowScheduleLabel || 'Sin reloj activo'} />
                        <PreviewCard label="Drive o carpeta" value={card.linkDrive || 'Sin carpeta enlazada'} detail={selectedStage.notes?.trim() ? 'Hay notas de etapa cargadas.' : 'Sin notas de etapa todavia.'} />
                      </div>

                      <div ref={scriptRef} className="rounded-[1.2rem] border p-4" style={raisedPanelStyle}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--ff-text-tertiary)' }}>Guion o escaleta</p>
                            <p className="mt-2 text-sm font-semibold" style={{ color: 'var(--ff-text-primary)' }}>{card.guion?.trim() ? 'Guion listo para ejecutar' : 'Todavia no hay guion sembrado'}</p>
                          </div>
                          <button type="button" onClick={() => void handleCopy('script', card.guion || '')} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold" style={subtleButtonStyle}>
                            {copiedField === 'script' ? <Check size={12} /> : <Copy size={12} />}
                            <span>{copiedField === 'script' ? 'Copiado' : 'Copiar'}</span>
                          </button>
                        </div>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-6" style={{ color: 'var(--ff-text-secondary)' }}>{card.guion || 'Cuando exista un guion o escaleta, aparecera aqui como material de trabajo.'}</p>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <PreviewCard label="Research" value={productionBrief.researchSummary || 'Research pendiente'} detail="Lo que sostiene el argumento y la produccion." />
                        <PreviewCard label="Preguntas abiertas" value={productionBrief.openQuestions.length ? `${productionBrief.openQuestions.length} preguntas abiertas` : 'Sin preguntas abiertas'} detail={productionBrief.openQuestions[0] || 'Cuando existan preguntas abiertas, apareceran aqui.'} />
                      </div>

                      <div ref={notesRef} className="rounded-[1.2rem] border p-4" style={raisedPanelStyle}>
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--ff-text-tertiary)' }}>Notas de la etapa</p>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-6" style={{ color: 'var(--ff-text-secondary)' }}>{selectedStage.notes || 'Todavia no hay notas registradas para esta etapa.'}</p>
                      </div>

                      <div ref={checklistRef} className="rounded-[1.2rem] border p-4" style={raisedPanelStyle}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--ff-text-tertiary)' }}>Checklist activa</p>
                            <p className="mt-2 text-sm font-semibold" style={{ color: 'var(--ff-text-primary)' }}>{selectedChecklist?.title || 'Checklist pendiente'}</p>
                            <p className="mt-1 text-xs leading-5" style={{ color: 'var(--ff-text-secondary)' }}>
                              {selectedChecklist ? `${selectedChecklistDone}/${selectedChecklistItems.length} items completados` : 'Esta etapa todavia no tiene checklist ligada.'}
                            </p>
                          </div>
                          {selectedChecklist ? (
                            <span className="rounded-full px-3 py-1 text-[11px] font-bold uppercase" style={primarySoftStyle}>
                              {selectedChecklistPending.length ? `${selectedChecklistPending.length} pendientes` : 'Checklist cerrada'}
                            </span>
                          ) : null}
                        </div>
                        {selectedChecklist ? (
                          <div className="mt-4 space-y-3">
                            {(isChecklistExpanded ? selectedChecklistItems : (selectedChecklistPending.length ? selectedChecklistPending : selectedChecklistItems).slice(0, 3)).map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => onToggleChecklistItem(selectedChecklist.id, item.id)}
                                disabled={readOnly}
                                className="flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left text-sm disabled:opacity-70"
                                style={item.isCompleted ? getFlowToneStyle('success') : mutedPanelStyle}
                              >
                                <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border" style={item.isCompleted ? { borderColor: 'transparent', background: 'var(--ff-success-text)', color: '#fff' } : { borderColor: 'var(--ff-border)', color: 'var(--ff-text-tertiary)' }}>
                                  {item.isCompleted ? <Check size={12} /> : <span className="h-2 w-2 rounded-full" style={{ background: 'currentColor' }} />}
                                </span>
                                <span style={{ color: item.isCompleted ? 'var(--ff-success-text)' : 'var(--ff-text-secondary)' }}>{item.text}</span>
                              </button>
                            ))}
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              {selectedChecklistItems.length > 3 ? (
                                <button type="button" onClick={() => setIsChecklistExpanded((previous) => !previous)} className="rounded-full px-3 py-1.5 text-xs font-semibold" style={subtleButtonStyle}>
                                  {isChecklistExpanded ? 'Ocultar checklist completa' : 'Ver checklist completa'}
                                </button>
                              ) : <span />}
                              {!isChecklistExpanded && selectedChecklistItems.length > 3 ? (
                                <p className="text-xs leading-5" style={{ color: 'var(--ff-text-secondary)' }}>Mostrando primero los pendientes clave para que Produccion siga ligera.</p>
                              ) : null}
                            </div>
                          </div>
                        ) : (
                          <div className="mt-4">
                            <EmptyState>No encontramos una checklist ligada a esta etapa. Puedes anadir una plantilla desde el menu de herramientas.</EmptyState>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <EmptyState>Esta tarjeta no tiene productionFlow formal todavia. En cuanto exista, este bloque se convertira en la estacion de trabajo del video.</EmptyState>
              )}
            </div>
          ) : (
            <EmptyState>Este video todavia no trae un productionFlow activo. Arranca por Hoy o Brief para construir el contexto base.</EmptyState>
          )}
        </GuidedSection>

        <GuidedSection
          sectionRef={publishRef}
          kicker="Publicacion"
          title="Descripcion primero, metadata avanzada despues"
          description="La salida final de YouTube se cierra aqui. La descripcion manda, las keywords quedan como apoyo secundario y lo avanzado no ensucia el camino principal."
          preview={<CollapsedPreview primary={publishPreview.primary} secondary={publishPreview.secondary} chips={publishPreview.chips} />}
          expanded={expandedSection === 'publish'}
          onToggle={() => scrollToSection('publish')}
          action={!readOnly ? (
            <button type="button" onClick={() => setEditingSection((current) => current === 'publish' ? null : 'publish')} className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold" style={editingSection === 'publish' ? subtleButtonStyle : primarySoftStyle}>
              <Pencil size={15} />
              <span>{editingSection === 'publish' ? 'Cerrar edicion' : 'Editar salida final'}</span>
            </button>
          ) : null}
        >
          <div className="space-y-4">
            {missingSeoConfigLabels.length ? (
              <div className="rounded-[1.2rem] border px-4 py-3" style={getFlowToneStyle('warning')}>
                <p className="text-sm font-semibold">Faltan datos fijos del canal</p>
                <p className="mt-1 text-xs leading-5">La generacion no se bloquea, pero conviene completar {missingSeoConfigLabels.join(', ')} en Ajustes para cerrar mejor la plantilla SEO.</p>
              </div>
            ) : null}

            {editingSection === 'publish' ? (
              <div className="grid gap-4 rounded-[1.2rem] border p-4" style={raisedPanelStyle}>
                <TextField label="Fuente para descripcion" value={seoSourceDraft} onChange={setSeoSourceDraft} placeholder="Pega transcripcion, resumen post-grabacion o notas reales del video..." multiline rows={8} />
                <TextField label="Descripcion final" value={outputDraft.description} onChange={(value) => setOutputDraft((previous) => ({ ...previous, description: value }))} placeholder="Descripcion final lista para YouTube" multiline rows={10} />
                <TextField label="Keywords avanzadas" value={outputDraft.keywords} onChange={(value) => setOutputDraft((previous) => ({ ...previous, keywords: value }))} placeholder="Keywords separadas por coma" multiline rows={4} />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setEditingSection(null)} className="rounded-full px-5 py-2.5 text-sm font-semibold" style={subtleButtonStyle}>Cancelar</button>
                  <button type="button" onClick={savePublish} className="rounded-full px-5 py-2.5 text-sm font-semibold" style={flowPrimaryActionStyle}>Guardar publicacion</button>
                </div>
              </div>
            ) : null}

            <div ref={descriptionRef} className="rounded-[1.2rem] border p-4" style={raisedPanelStyle}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--ff-text-tertiary)' }}>Fuente para descripcion</p>
                  <p className="mt-2 text-sm font-semibold" style={{ color: 'var(--ff-text-primary)' }}>{seoSourceDraft.trim() ? 'Hay fuente real cargada para generar SEO' : 'Todavia no pegaste una transcripcion o resumen real'}</p>
                  <p className="mt-1 text-xs leading-5" style={{ color: 'var(--ff-text-secondary)' }}>Si esto queda vacio, la IA cae automaticamente al guion y luego al brief.</p>
                </div>
                <span className="rounded-full px-3 py-1 text-[11px] font-bold uppercase" style={subtleButtonStyle}>Prioridad: transcripcion &gt; guion &gt; brief</span>
              </div>
              <div className="mt-4 rounded-[1.05rem] border p-4" style={mutedPanelStyle}>
                <p className="text-sm leading-6" style={{ color: 'var(--ff-text-secondary)' }}>
                  {seoSourceDraft.trim() || `No hay fuente pegada todavia. Si generas ahora, la descripcion saldra de ${persistedSourceLabel.toLowerCase()}.`}
                </p>
              </div>
            </div>

            <div className="rounded-[1.2rem] border p-4" style={raisedPanelStyle}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--ff-text-tertiary)' }}>Borrador SEO</p>
                  <p className="mt-2 text-sm font-semibold" style={{ color: 'var(--ff-text-primary)' }}>Genera descripcion y keywords como draft local antes de decidir que guardar.</p>
                  <p className="mt-1 text-xs leading-5" style={{ color: 'var(--ff-text-secondary)' }}>La plantilla fija del canal se arma en la app para que siempre salga con la misma estructura.</p>
                </div>
                <button type="button" onClick={() => void handleGenerateSeo()} disabled={isGeneratingSeo} className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-70" style={flowPrimaryActionStyle}>
                  {isGeneratingSeo ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                  <span>{seoDraft ? 'Regenerar SEO' : 'Generar SEO'}</span>
                </button>
              </div>
              {seoError ? <p className="mt-3 text-sm" style={{ color: 'var(--ff-danger-text)' }}>{seoError}</p> : null}
              {seoDraft ? (
                <div className="mt-4 space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full px-3 py-1 text-[11px] font-bold uppercase" style={primarySoftStyle}>Fuente usada: {currentSourceLabel}</span>
                    <span className="rounded-full px-3 py-1 text-[11px] font-bold uppercase" style={subtleButtonStyle}>{seoDraft.keywords.length} keywords</span>
                    <span className="rounded-full px-3 py-1 text-[11px] font-bold uppercase" style={subtleButtonStyle}>{seoDraft.hashtags.length} hashtags</span>
                  </div>
                  <div className="rounded-[1.05rem] border p-4" style={mutedPanelStyle}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--ff-text-tertiary)' }}>Preview de descripcion</p>
                      <button type="button" onClick={() => void handleCopy('seo-draft-description', seoDraftDescription)} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold" style={subtleButtonStyle}>
                        {copiedField === 'seo-draft-description' ? <Check size={12} /> : <Copy size={12} />}
                        <span>{copiedField === 'seo-draft-description' ? 'Copiado' : 'Copiar'}</span>
                      </button>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6" style={{ color: 'var(--ff-text-secondary)' }}>{seoDraftDescription}</p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <PreviewCard label="Keywords sugeridas" value={seoDraftKeywordsText || 'Sin keywords'} detail="Las keywords quedan como apoyo secundario dentro del cockpit." />
                    <PreviewCard label="Hashtags" value={seoDraft.hashtags.join(' ') || '#tag1 #tag2 #tag3'} detail="Se incrustan dentro de la plantilla final." />
                  </div>
                  {!readOnly ? (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => applySeoDraft('description')} className="rounded-full px-4 py-2 text-sm font-semibold" style={flowPrimaryActionStyle}>Aplicar descripcion</button>
                      <button type="button" onClick={() => applySeoDraft('keywords')} className="rounded-full px-4 py-2 text-sm font-semibold" style={subtleButtonStyle}>Aplicar keywords</button>
                      <button type="button" onClick={() => applySeoDraft('both')} className="rounded-full px-4 py-2 text-sm font-semibold" style={flowBrandActionStyle}>Aplicar ambas</button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-4">
                  <EmptyState>Cuando generes SEO, aqui veras la descripcion completa con plantilla aplicada y las keywords sugeridas antes de guardarlas.</EmptyState>
                </div>
              )}
            </div>

            <div className="rounded-[1.2rem] border p-4" style={raisedPanelStyle}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--ff-text-tertiary)' }}>Salida final</p>
                  <p className="mt-2 text-sm font-semibold" style={{ color: 'var(--ff-text-primary)' }}>Lo que ya quedo persistido y esta listo para revisar o copiar.</p>
                </div>
                <button type="button" onClick={() => void handleCopy('final-description', outputDraft.description || card.description || '')} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold" style={subtleButtonStyle}>
                  {copiedField === 'final-description' ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copiedField === 'final-description' ? 'Copiado' : 'Copiar descripcion'}</span>
                </button>
              </div>
              <div className="mt-4 rounded-[1.05rem] border p-4" style={mutedPanelStyle}>
                <p className="whitespace-pre-wrap text-sm leading-6" style={{ color: 'var(--ff-text-secondary)' }}>{outputDraft.description || 'Todavia no hay descripcion final guardada.'}</p>
              </div>
            </div>

            <div ref={finalReviewRef} className="rounded-[1.2rem] border p-4" style={raisedPanelStyle}>
              <button type="button" onClick={() => setShowPublishAdvanced((previous) => !previous)} className="flex w-full items-center justify-between gap-3 text-left">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--ff-text-tertiary)' }}>Metadata avanzada y revision final</p>
                  <p className="mt-2 text-sm font-semibold" style={{ color: 'var(--ff-text-primary)' }}>Keywords, tags y extras viven aqui para no competir visualmente con titulo, miniatura o descripcion.</p>
                </div>
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border" style={subtleButtonStyle}>
                  <ChevronDown size={16} className={`transition-transform ${showPublishAdvanced ? 'rotate-180' : ''}`} />
                </span>
              </button>
              {showPublishAdvanced ? (
                <div className="mt-4 space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <PreviewCard label="Keywords y tags" value={outputDraft.keywords || card.keywords || 'Pendientes'} detail="Quedan como apoyo secundario para el video, no como pieza central del flujo." />
                    <PreviewCard label="Publicacion final" value={formatDateTime(card.productionFlow?.publishAt || card.dueDate)} detail={execution.readiness.find((item) => item.id === 'publish')?.detail || 'Revision final pendiente.'} />
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <PreviewCard label="Interlinking" value={card.interlinking?.trim() || 'Fuera del camino principal'} detail="Solo revisalo al final si de verdad aporta a la salida del video." />
                    <PreviewCard label="Monetizacion" value={card.monetization?.sellsProduct ? 'Video orientado a producto' : 'Sin capa comercial marcada'} detail={card.monetization?.productDescription || 'La monetizacion no bloquea la ejecucion principal del video.'} />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </GuidedSection>
      </div>
    </div>
  );
}
