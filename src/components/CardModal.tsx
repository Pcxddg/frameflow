import { X, CheckSquare, User, Link as LinkIcon, AlignLeft, Trash2, Play, Sparkles, Loader2, ChevronDown, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Search, DollarSign, AlertTriangle, Film, Zap, Check, Save, FileText, BookOpen, Copy, Upload, Plus, Handshake, ArrowRightLeft } from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useBoard, CHECKLIST_TEMPLATES, LABELS } from '../store';
import { Card as CardType, ProductionBrief, ProductionStageId, ProductionStageStatus } from '../types';
import ReactMarkdown from 'react-markdown';
import { AudioRecorder } from './AudioRecorder';
import { GuidedCardWorkspace } from './GuidedCardWorkspace';
import type { CardModalLocation, CardModalSectionId } from '../lib/cardModalEvents';
import { resolveLegacyCardModalLocation } from '../lib/cardModalEvents';
import { GEMINI_FLASH_MODEL, generateContentWithRetry, getAiErrorMessage } from '../lib/gemini';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, isSameDay, addDays, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { useIsMobile } from '../hooks/useIsMobile';
import { findStageChecklist, getAuditRoleLabel, getProductionFlowCurrentStage, getProductionFlowSummary, getScheduleStatusLabel, getSuggestedFlowColumn } from '../lib/optimizedVideoFlow';
import { getPhaseCompletionStatus } from '../lib/workflowPlans';
import { generateVideoSeedDraft } from '../lib/videoFlowAi';
import { generateVideoSeoDraft } from '../lib/videoSeoAi';
import TeleprompterOverlay from './TeleprompterOverlay';
import { CardModalV2 } from './card-modal/CardModal';

const USE_NEW_MODAL = true;

/* ── Preset templates ─────────────────────────────────────────── */
const DESC_PRESETS: Record<string, string> = {
  'SEO Completa': `[Parrafo de apertura: resume el video en 2-3 lineas con la keyword principal]

🔗 RECURSOS MENCIONADOS
-

⏱️ TIMESTAMPS
00:00 - Intro
00:00 -

📌 SOBRE ESTE VIDEO
[Descripcion expandida con keywords secundarias. 2-3 parrafos con valor para el espectador.]

🔍 TAGS / KEYWORDS
[keyword1, keyword2, keyword3]

📲 REDES SOCIALES
- Instagram:
- Twitter/X:
- TikTok:

#hashtag1 #hashtag2 #hashtag3`,

  'Minimalista': `[Descripcion corta y directa del video]

🔗 Links:
-

📲 Sigueme:
-

#hashtag1 #hashtag2`,

  'Short': `[1-2 lineas describiendo el short]

📺 Video completo:

#shorts #hashtag1 #hashtag2`,
};

const GUION_PRESETS: Record<string, string> = {
  'Formula 10X': `## Guion y Estructura del Video

### Concepto y Titulo (El Clic)
**Titulos Magicos (Linden):**
-

### Gancho de 8 Segundos
*Start with the End, Punto de Dolor o Ruptura de Patron.*
-

### Storytelling (Retencion)
*Queria [X], PERO paso [Y], POR LO TANTO hice [Z]*
- **Queria:**
- **PERO:**
- **POR LO TANTO:**

### Cuerpo del Video
**Punto 1:**
-
**Punto 2:**
-
**Punto 3:**
-

### CTA + Interlinking
- **Video de Rebufo:**
- **Link de Afiliado/Venta:**
- **Comentario fijado:**`,

  'Tutorial / How-To': `## Tutorial

### Problema
*Que problema resuelve este video?*
-

### Requisitos previos
-

### Paso 1:
-

### Paso 2:
-

### Paso 3:
-

### Resultado final
-

### Errores comunes
-`,

  'Short / Reel': `## Short

**Gancho Visual (1-3s):**
-

**Contenido Principal (20-40s):**
-

**CTA / Loop:**
-

**Texto en pantalla:**
-`,
};

/* ── Phase config: maps column index → UX guidance ────────────── */
const PHASES = [
  { name: 'Ideas',       color: 'bg-sky-500',     action: 'Define el angulo unico y tipo de contenido.', sections: ['seo', 'desc'] },
  { name: 'Titulos',     color: 'bg-purple-500',  action: 'Escribe variaciones de titulo con el Metodo Linden.', sections: ['seo', 'clic'] },
  { name: 'Guion',       color: 'bg-indigo-500',  action: 'Escribe el gancho de 8s y estructura la narrativa.', sections: ['retention', 'guion'] },
  { name: 'Miniaturas',  color: 'bg-pink-500',    action: 'Diseña la miniatura: Rostro + Texto + Contexto.', sections: ['clic'] },
  { name: 'Edicion',     color: 'bg-orange-500',  action: 'Asigna al editor y completa el checklist.', sections: ['checklists'] },
  { name: 'Publicacion', color: 'bg-emerald-500', action: 'Configura interlinking, SEO y monetizacion.', sections: ['interlinking', 'monetization', 'seo'] },
  { name: 'Post-Pub',    color: 'bg-red-500',     action: 'Monitorea CTR a las 2h y responde comentarios.', sections: ['postpub'] },
];

/* ── Phase-aware section visibility ──────────────────────────── */
const PHASE_VISIBLE_SECTIONS: Record<string, string[]> = {
  'Ideas':       ['desc', 'seo'],
  'Titulos':     ['clic'],
  'Guion':       ['guion', 'retention'],
  'Miniaturas':  ['clic'],
  'Edicion':     ['flow', 'checklists'],
  'Publicacion': ['seo', 'desc', 'ytexport'],
  'Post-Pub':    ['postpub', 'checklists'],
};

function isSectionVisibleForPhase(sectionId: string, phaseName: string, showAll: boolean): boolean {
  if (showAll) return true;
  const visible = PHASE_VISIBLE_SECTIONS[phaseName];
  return visible ? visible.includes(sectionId) : true;
}

interface CardModalProps {
  card: CardType;
  onClose: () => void;
  initialSection?: CardModalSectionId;
  initialLocation?: CardModalLocation;
  readOnly?: boolean;
}

type CardModalWorkspace = 'base' | 'publish' | 'growth' | 'control';

const WORKSPACE_CONFIG: Record<CardModalWorkspace, {
  label: string;
  title: string;
  description: string;
  sections: CardModalProps['initialSection'][];
}> = {
  base: {
    label: 'Base',
    title: 'Produccion y guion',
    description: 'Aqui cerramos el flujo real, el guion y el material base para avanzar sin ruido.',
    sections: ['production'],
  },
  publish: {
    label: 'Publicacion',
    title: 'SEO y salida',
    description: 'Aqui preparamos metadata, descripcion y el paquete listo para publicar sin perder contexto.',
    sections: ['seo'],
  },
  growth: {
    label: 'CTR y negocio',
    title: 'Clic, retencion y monetizacion',
    description: 'Aqui trabajamos el empaque del video, el embudo y las decisiones de crecimiento.',
    sections: ['monetization'],
  },
  control: {
    label: 'Control',
    title: 'Seguimiento y cierre',
    description: 'Aqui controlamos checklists, post-publicacion y el seguimiento operativo del video.',
    sections: ['post', 'checklists'],
  },
};

const EMPTY_PRODUCTION_BRIEF: ProductionBrief = {
  idea: '',
  audience: '',
  question: '',
  promise: '',
  tone: '',
  creatorNotes: '',
  researchSummary: '',
  openQuestions: [],
};

function getWorkspaceForSection(section: CardModalProps['initialSection']): CardModalWorkspace {
  if (section === 'seo') return 'publish';
  if (section === 'monetization') return 'growth';
  if (section === 'post' || section === 'checklists') return 'control';
  return 'base';
}

function getDefaultWorkspaceForPhase(phaseName: string): CardModalWorkspace {
  if (phaseName === 'Titulos' || phaseName === 'Miniaturas') return 'growth';
  if (phaseName === 'Publicacion') return 'publish';
  if (phaseName === 'Edicion' || phaseName === 'Post-Pub') return 'control';
  return 'base';
}

export function CardModal({ card, onClose, initialSection = 'summary', initialLocation, readOnly = false }: CardModalProps) {
  if (USE_NEW_MODAL) {
    return <CardModalV2 card={card} onClose={onClose} initialSection={initialSection} initialLocation={initialLocation} readOnly={readOnly} />;
  }

  const { board, updateCard, deleteCard, addChecklist, toggleChecklistItem, toggleLabel, moveCard, setProductionStageStatus, updateProductionStage, updateBoardMeta } = useBoard();
  const isMobile = useIsMobile();
  const guidedBodyRef = useRef<HTMLDivElement>(null);
  const [headerOffset, setHeaderOffset] = useState<number>(() => (
    typeof document !== 'undefined'
      ? document.querySelector('header')?.getBoundingClientRect().height ?? 0
      : 0
  ));

  /* ── Phase detection ──────────────────────────────────────── */
  const listIndex = board?.lists.findIndex(l => l.id === card.listId) ?? 0;
  const phase = PHASES[Math.min(listIndex, PHASES.length - 1)];

  /* ── Core state ───────────────────────────────────────────── */
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [descInput, setDescInput] = useState(card.description);
  const [isEditingGuion, setIsEditingGuion] = useState(false);
  const [guionInput, setGuionInput] = useState(card.guion || '');
  const [isImprovingTitle, setIsImprovingTitle] = useState(false);
  const [suggestedTitle, setSuggestedTitle] = useState<string | null>(null);
  const [isSuggestingKeywords, setIsSuggestingKeywords] = useState(false);
  const [isAnalyzingScript, setIsAnalyzingScript] = useState(false);
  const [scriptAnalysis, setScriptAnalysis] = useState<string | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [isGeneratingTitles, setIsGeneratingTitles] = useState(false);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);
  const [savingPresetName, setSavingPresetName] = useState('');
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [showAllSections, setShowAllSections] = useState(false);
  const [showTeleprompter, setShowTeleprompter] = useState(false);
  const [isAssigneeOpen, setIsAssigneeOpen] = useState(false);
  const assigneeRef = useRef<HTMLDivElement>(null);
  const [isDateOpen, setIsDateOpen] = useState(false);
  const dateRef = useRef<HTMLDivElement>(null);
  const [currentMonth, setCurrentMonth] = useState(card.dueDate ? parseISO(card.dueDate) : new Date());
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isAddingDeal, setIsAddingDeal] = useState(false);
  const [dealForm, setDealForm] = useState({ type: 'sponsor' as 'sponsor' | 'affiliate' | 'collaboration' | 'product', brand: '', amount: '', status: 'negotiating' as 'negotiating' | 'confirmed' | 'delivered' | 'paid', notes: '' });
  const bodyRef = useRef<HTMLDivElement>(null);
  const seoRef = useRef<HTMLDivElement>(null);
  const productionRef = useRef<HTMLDivElement>(null);
  const monetizationRef = useRef<HTMLDivElement>(null);
  const postRef = useRef<HTMLDivElement>(null);
  const checklistRef = useRef<HTMLDivElement>(null);
  const isShort = card.contentType === 'short';
  const longFormCards = board ? Object.values(board.cards).filter(c => c.contentType === 'long' && c.id !== card.id) : [];
  const otherCards = board ? Object.values(board.cards).filter(c => c.id !== card.id) : [];
  const flowSummary = board ? getProductionFlowSummary(card, board) : null;
  const phaseStatus = board ? getPhaseCompletionStatus(card, board) : null;
  const currentFlowStage = flowSummary?.currentStage || getProductionFlowCurrentStage(card.productionFlow);
  const suggestedFlowColumn = board ? getSuggestedFlowColumn(card, board) : null;
  const flowScheduleLabel = flowSummary ? getScheduleStatusLabel(flowSummary.scheduleStatus) : null;
  const flowWorkingDaysLabel = flowSummary
    ? flowSummary.isKickoffPending
      ? 'Aun no arranca el reloj'
      : `Dia ${flowSummary.workingDaysElapsed}/${flowSummary.workingDaysBudget}`
    : null;
  const getFlowToneStyle = (tone: 'success' | 'danger' | 'warning' | 'info' | 'neutral' | 'brand') => (
    tone === 'success'
      ? { background: `var(--ff-success-bg)`, borderColor: `var(--ff-success-border)`, color: `var(--ff-success-text)` }
      : tone === 'danger'
      ? { background: `var(--ff-danger-bg)`, borderColor: `var(--ff-danger-border)`, color: `var(--ff-danger-text)` }
      : tone === 'warning'
      ? { background: `var(--ff-warning-bg)`, borderColor: `var(--ff-warning-border)`, color: `var(--ff-warning-text)` }
      : tone === 'info'
      ? { background: `var(--ff-info-bg)`, borderColor: `var(--ff-info-border)`, color: `var(--ff-info-text)` }
      : tone === 'brand'
      ? {
          background: `color-mix(in srgb, var(--ff-primary) 14%, var(--ff-surface-solid))`,
          borderColor: `color-mix(in srgb, var(--ff-primary) 34%, var(--ff-border))`,
          color: `var(--ff-primary)`,
        }
      : { background: `var(--ff-surface-raised)`, borderColor: `var(--ff-border)`, color: `var(--ff-text-secondary)` }
  );
  const flowScheduleChipStyle = flowSummary?.scheduleStatus === 'blocked'
    ? getFlowToneStyle('danger')
    : flowSummary?.scheduleStatus === 'overdue'
    ? getFlowToneStyle('danger')
    : flowSummary?.scheduleStatus === 'at_risk'
    ? getFlowToneStyle('warning')
    : flowSummary?.scheduleStatus === 'extra_active'
    ? getFlowToneStyle('info')
    : flowSummary?.scheduleStatus === 'idea'
    ? getFlowToneStyle('neutral')
    : getFlowToneStyle('success');
  const completedChecklists = card.checklists.reduce((acc, checklist) => acc + checklist.items.filter((item) => item.isCompleted).length, 0);
  const totalChecklists = card.checklists.reduce((acc, checklist) => acc + checklist.items.length, 0);
  const sectionShellClassName = 'rounded-[1.55rem] border px-4 py-3 shadow-[0_1px_0_rgba(15,23,42,0.03)]';
  const sectionShellStyle = { borderColor: `var(--ff-border)`, background: `var(--ff-surface-solid)` };
  const flowChipClassName = 'rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase';
  const flowPrimaryActionStyle = {
    background: `linear-gradient(135deg, #059669, #10b981)`,
    color: `#ffffff`,
    border: `1px solid rgba(16, 185, 129, 0.35)`,
  };
  const flowSoftActionStyle = {
    background: `var(--ff-surface-raised)`,
    color: `var(--ff-text-secondary)`,
    border: `1px solid var(--ff-border)`,
  };
  const flowBrandActionStyle = {
    background: `color-mix(in srgb, var(--ff-primary) 14%, var(--ff-surface-solid))`,
    color: `var(--ff-primary)`,
    border: `1px solid color-mix(in srgb, var(--ff-primary) 32%, var(--ff-border))`,
  };
  const flowDangerActionStyle = {
    background: `var(--ff-danger-bg)`,
    color: `var(--ff-danger-text)`,
    border: `1px solid var(--ff-danger-border)`,
  };
  const [activeWorkspace, setActiveWorkspace] = useState<CardModalWorkspace>(() =>
    initialSection !== 'summary' ? getWorkspaceForSection(initialSection) : getDefaultWorkspaceForPhase(phase.name)
  );
  const workspaceConfig = WORKSPACE_CONFIG[activeWorkspace];
  const visibleJumpSections = activeWorkspace === 'control'
    ? [
        { id: 'post' as const, label: 'Post-Pub' },
        { id: 'checklists' as const, label: 'Checklist' },
      ]
    : activeWorkspace === 'growth'
    ? [
        { id: 'monetization' as const, label: 'Negocio' },
      ]
    : activeWorkspace === 'publish'
    ? [
        { id: 'seo' as const, label: 'SEO' },
      ]
    : [
        { id: 'production' as const, label: 'Flujo' },
      ];

  /* ── Collapsible sections: smart defaults by phase ────────── */
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const r = phase.sections;
    return {
      flow: !!card.productionFlow,
      seo: r.includes('seo'),
      desc: r.includes('desc') || !card.description,
      guion: r.includes('guion') || !!card.guion,
      shorts: isShort,
      clic: r.includes('clic'),
      retention: r.includes('retention'),
      interlinking: r.includes('interlinking'),
      monetization: r.includes('monetization'),
      postpub: r.includes('postpub'),
      checklists: r.includes('checklists') || card.checklists.length > 0,
    };
  });
  const productionBrief = card.productionBrief || EMPTY_PRODUCTION_BRIEF;
  const useGuidedLayout = card.contentType !== 'short' && (!!card.productionFlow || !!card.productionBrief);
  const guidedInitialLocation = initialLocation || resolveLegacyCardModalLocation(initialSection);
  const seededTitles = (card.titulosLinden || '').split('\n').map((line) => line.trim()).filter(Boolean);
  const hasSeededPackage = !!(
    productionBrief.idea
    || productionBrief.audience
    || productionBrief.question
    || productionBrief.promise
    || productionBrief.tone
    || productionBrief.researchSummary
    || productionBrief.openQuestions.length
    || card.gancho8s
    || card.guion
    || seededTitles.length
  );
  const toggle = useCallback((key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const formatDateTimeInput = useCallback((value?: string | null) => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  }, []);

  const formatDateTime = useCallback((value?: string | null) => {
    if (!value) return 'Sin fecha';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'Sin fecha';
    return parsed.toLocaleString('es-ES', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, []);

  const scrollToSection = useCallback((section: CardModalProps['initialSection']) => {
    if (!bodyRef.current) return;

    const targetWorkspace = getWorkspaceForSection(section);

    if (section === 'summary') {
      setActiveWorkspace(getDefaultWorkspaceForPhase(phase.name));
      bodyRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (section === 'assignee') {
      setActiveWorkspace(getDefaultWorkspaceForPhase(phase.name));
      bodyRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      setIsAssigneeOpen(true);
      return;
    }

    setActiveWorkspace(targetWorkspace);

    const targetRef = section === 'seo'
      ? seoRef
      : section === 'production'
      ? productionRef
      : section === 'monetization'
      ? monetizationRef
      : section === 'post'
      ? postRef
      : section === 'checklists'
      ? checklistRef
      : null;

    window.setTimeout(() => {
      targetRef?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }, [phase.name]);

  /* ── H3: Escape to close ──────────────────────────────────── */
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const { body, documentElement } = document;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyPaddingRight = body.style.paddingRight;
    const previousHtmlOverflow = documentElement.style.overflow;
    const scrollbarCompensation = Math.max(0, window.innerWidth - documentElement.clientWidth);

    body.style.overflow = 'hidden';
    documentElement.style.overflow = 'hidden';

    if (scrollbarCompensation > 0) {
      body.style.paddingRight = `${scrollbarCompensation}px`;
    }

    return () => {
      body.style.overflow = previousBodyOverflow;
      body.style.paddingRight = previousBodyPaddingRight;
      documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const updateHeaderOffset = () => {
      const nextOffset = document.querySelector('header')?.getBoundingClientRect().height ?? 0;
      setHeaderOffset(nextOffset);
    };

    updateHeaderOffset();
    window.addEventListener('resize', updateHeaderOffset);

    return () => {
      window.removeEventListener('resize', updateHeaderOffset);
    };
  }, []);

  /* ── Click-outside for dropdowns ──────────────────────────── */
  useEffect(() => {
    function handler(event: MouseEvent) {
      if (assigneeRef.current && !assigneeRef.current.contains(event.target as Node)) setIsAssigneeOpen(false);
      if (dateRef.current && !dateRef.current.contains(event.target as Node)) setIsDateOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    setActiveWorkspace(initialSection !== 'summary' ? getWorkspaceForSection(initialSection) : getDefaultWorkspaceForPhase(phase.name));
  }, [initialSection, phase.name]);

  useEffect(() => {
    if (!isMobile) return;

    if (initialSection === 'checklists') {
      setOpenSections(prev => ({ ...prev, checklists: true }));
    } else if (initialSection === 'seo') {
      setOpenSections(prev => ({ ...prev, seo: true }));
    } else if (initialSection === 'monetization') {
      setOpenSections(prev => ({ ...prev, monetization: true }));
    } else if (initialSection === 'post') {
      setOpenSections(prev => ({ ...prev, postpub: true }));
    } else if (initialSection === 'production') {
      setOpenSections(prev => ({ ...prev, flow: true, guion: true, retention: true }));
    }

    const timer = window.setTimeout(() => {
      scrollToSection(initialSection);
    }, 120);

    return () => window.clearTimeout(timer);
  }, [initialSection, isMobile, scrollToSection]);

  /* ── Helpers ──────────────────────────────────────────────── */
  const assigneeOptions = [
    { value: '', label: 'Sin asignar' },
    { value: 'Tú', label: 'Tu (Creador)' },
    { value: 'Editor', label: 'Editor' },
  ];

  const updateCardSafe = useCallback((updates: Partial<CardType>) => {
    if (readOnly) return;
    updateCard(card.id, updates);
  }, [card.id, readOnly, updateCard]);

  const deleteCardSafe = useCallback(() => {
    if (readOnly) return;
    deleteCard(card.id, card.listId);
  }, [card.id, card.listId, deleteCard, readOnly]);

  const addChecklistSafe = useCallback((templateName: keyof typeof CHECKLIST_TEMPLATES) => {
    if (readOnly) return;
    addChecklist(card.id, templateName);
  }, [addChecklist, card.id, readOnly]);

  const toggleChecklistItemSafe = useCallback((checklistId: string, itemId: string) => {
    if (readOnly) return;
    toggleChecklistItem(card.id, checklistId, itemId);
  }, [card.id, readOnly, toggleChecklistItem]);

  const toggleLabelSafe = useCallback((label: typeof LABELS[number]) => {
    if (readOnly) return;
    toggleLabel(card.id, label);
  }, [card.id, readOnly, toggleLabel]);

  const handleStageStatusChange = useCallback((stageId: ProductionStageId, nextStatus: ProductionStageStatus) => {
    if (readOnly) return;
    setProductionStageStatus(card.id, stageId, nextStatus);
  }, [card.id, readOnly, setProductionStageStatus]);

  const handleStageDueAtChange = useCallback((stageId: ProductionStageId, value: string) => {
    if (readOnly || !value) return;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return;
    updateProductionStage(card.id, stageId, { dueAt: parsed.toISOString() });
  }, [card.id, readOnly, updateProductionStage]);

  const handleStageNotesChange = useCallback((stageId: ProductionStageId, value: string) => {
    if (readOnly) return;
    updateProductionStage(card.id, stageId, { notes: value });
  }, [card.id, readOnly, updateProductionStage]);

  const handleMoveToSuggestedColumn = useCallback(() => {
    if (readOnly || !board || !suggestedFlowColumn) return;
    const destinationList = board.lists.find((list) => list.id === suggestedFlowColumn.listId);
    if (!destinationList) return;
    moveCard(card.listId, destinationList.id, 0, destinationList.cardIds.length, card.id);
  }, [board, card.id, card.listId, moveCard, readOnly, suggestedFlowColumn]);

  const handleSaveDesc = () => { updateCardSafe({ description: descInput }); setIsEditingDesc(false); };
  const handleSaveGuion = () => { updateCardSafe({ guion: guionInput }); setIsEditingGuion(false); };

  const buildSeedInput = () => ({
    idea: card.title || '',
    audience: card.productionBrief?.audience || '',
    question: card.productionBrief?.question || '',
    promise: card.productionBrief?.promise || '',
    tone: card.productionBrief?.tone || '',
    creatorNotes: card.productionBrief?.creatorNotes || '',
  });

  const handleGenerateTitles = async () => {
    if (readOnly || isGeneratingTitles) return;
    setIsGeneratingTitles(true);
    setAiNotice(null);
    try {
      const draft = await generateVideoSeedDraft(buildSeedInput(), 'title');
      const allTitles = [draft.title, ...draft.titleAlternatives].filter(Boolean);
      const numbered = allTitles.map((t, i) => `${i + 1}. ${t}`).join('\n');
      updateCardSafe({ titulosLinden: numbered });
    } catch (error) {
      setAiNotice(getAiErrorMessage(error, 'No se pudieron generar titulos.'));
    } finally {
      setIsGeneratingTitles(false);
    }
  };

  const handleGenerateScript = async () => {
    if (readOnly || isGeneratingScript) return;
    setIsGeneratingScript(true);
    setAiNotice(null);
    try {
      const draft = await generateVideoSeedDraft(buildSeedInput(), 'script');
      setGuionInput(draft.scriptBase);
      updateCardSafe({ guion: draft.scriptBase, gancho8s: draft.hook || card.gancho8s || '' });
      setIsEditingGuion(false);
    } catch (error) {
      setAiNotice(getAiErrorMessage(error, 'No se pudo generar el guion.'));
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const handleGenerateDescription = async () => {
    if (readOnly || isGeneratingDesc) return;
    setIsGeneratingDesc(true);
    setAiNotice(null);
    try {
      const draft = await generateVideoSeoDraft({
        title: card.title,
        productionBrief: card.productionBrief,
        hook: card.gancho8s || '',
        script: card.guion || '',
        seededTitles: (card.titulosLinden || '').split('\n').filter(Boolean),
        channelSeoConfig: board?.seoConfig,
      });
      setDescInput(draft.descriptionBody);
      updateCardSafe({
        description: draft.descriptionBody,
        keywords: (draft.keywords || []).join(', '),
      });
      setIsEditingDesc(false);
    } catch (error) {
      setAiNotice(getAiErrorMessage(error, 'No se pudo generar la descripcion.'));
    } finally {
      setIsGeneratingDesc(false);
    }
  };

  const handleLoadGuionPreset = (name: string) => {
    if (readOnly) return;
    setGuionInput(GUION_PRESETS[name] || '');
    setIsEditingGuion(true);
  };

  const handleLoadPreset = (presetName: string) => {
    const allPresets = { ...DESC_PRESETS, ...(board?.descriptionPresets || {}) };
    const template = allPresets[presetName];
    if (template) {
      setDescInput(template);
      if (!readOnly) setIsEditingDesc(true);
    }
  };

  const handleSavePreset = () => {
    if (readOnly || !savingPresetName.trim() || !descInput.trim() || !board) return;
    const existing = board.descriptionPresets || {};
    updateCardSafe({}); // no-op to keep card unchanged
    const updatedPresets = { ...existing, [savingPresetName.trim()]: descInput };
    void updateBoardMeta({ descriptionPresets: updatedPresets });
    setShowSavePreset(false);
    setSavingPresetName('');
  };

  const handleDeletePreset = (presetName: string) => {
    if (readOnly || !board) return;
    const existing = { ...(board.descriptionPresets || {}) };
    delete existing[presetName];
    void updateBoardMeta({ descriptionPresets: existing });
  };

  const handleAnalyzeScript = async () => {
    if (!guionInput.trim() || isAnalyzingScript) return;
    setIsAnalyzingScript(true);
    setScriptAnalysis(null);
    setAiNotice(null);
    try {
      const response = await generateContentWithRetry({
        model: GEMINI_FLASH_MODEL,
        contents: `Eres un experto en YouTube Growth y storytelling. Analiza este guion/descripcion de video de YouTube y evalua su fuerza segun estos criterios de la Formula 10X:

1. **Gancho (8s)**: Tiene un inicio que atrapa? (Start with the End / Dolor / Ruptura de Patron)
2. **Storytelling**: Sigue la estructura "Queria X, PERO paso Y, POR LO TANTO hice Z"?
3. **Retencion**: Hay cambios de ritmo, open loops o pattern interrupts?
4. **CTA / Interlinking**: Tiene llamados a la accion claros?
5. **SEO**: Usa keywords naturales en el texto?

Para cada criterio da una puntuacion con emoji:
- 🟢 Bien implementado
- 🟡 Puede mejorar
- 🔴 Falta o es debil

Al final da un **puntaje general X/10** y **2-3 sugerencias concretas** para mejorar.

Responde en español, se conciso y directo.

Guion a analizar:
"""
${guionInput.substring(0, 3000)}
"""`,
      });
      if (response.text) setScriptAnalysis(response.text.trim());
    } catch (error) {
      setScriptAnalysis(getAiErrorMessage(error, 'No se pudo analizar el guion en este momento.'));
    } finally {
      setIsAnalyzingScript(false);
    }
  };

  const handleTranscription = (text: string) => {
    if (readOnly) return;
    setDescInput(prev => prev ? `${prev}\n\n${text}` : text);
    if (!isEditingDesc) setIsEditingDesc(true);
  };

  /* ── H3+H5: AI title with confirmation ────────────────────── */
  const handleImproveTitle = async () => {
    if (!card.title || isImprovingTitle) return;
    setIsImprovingTitle(true);
    setAiNotice(null);
    try {
      const response = await generateContentWithRetry({
        model: GEMINI_FLASH_MODEL,
        contents: `Mejora este titulo de YouTube para que sea mas atractivo y tenga un buen CTR (Click Through Rate). Devuelve SOLO el nuevo titulo, sin comillas ni texto adicional. Titulo actual: "${card.title}"`,
      });
      if (response.text) setSuggestedTitle(response.text.trim());
    } catch (error) {
      setAiNotice(getAiErrorMessage(error, 'No se pudo mejorar el titulo en este momento.'));
    } finally {
      setIsImprovingTitle(false);
    }
  };

  const handleSuggestKeywords = async () => {
    if (!card.title || isSuggestingKeywords) return;
    setIsSuggestingKeywords(true);
    setAiNotice(null);
    try {
      const response = await generateContentWithRetry({
        model: GEMINI_FLASH_MODEL,
        contents: `Genera 5-8 palabras clave long-tail SEO para este video de YouTube. Enfocate en keywords de cola larga con poca competencia pero trafico evergreen. Devuelve SOLO las keywords separadas por coma, sin explicaciones. Titulo: "${card.title}"${card.description ? ` Descripcion: "${card.description.substring(0, 200)}"` : ''}`,
      });
      if (response.text) updateCardSafe({ keywords: response.text.trim() });
    } catch (error) {
      setAiNotice(getAiErrorMessage(error, 'No se pudieron sugerir keywords en este momento.'));
    } finally {
      setIsSuggestingKeywords(false);
    }
  };

  /* ── H6: Section header with completion indicator ─────────── */
  const SectionHead = ({ id, icon, title, hasContent }: { id: string; icon: React.ReactNode; title: string; hasContent: boolean }) => (
    <button
      onClick={() => toggle(id)}
      className="ff-section-trigger w-full flex items-center justify-between px-1 py-2 rounded-lg transition-colors"
    >
      <span className="text-sm font-bold flex items-center gap-2" style={{ color: `var(--ff-text-primary)` }}>
        {icon}
        {title}
        <span className={`w-2 h-2 rounded-full shrink-0 ${hasContent ? 'bg-green-500' : 'bg-gray-300'}`} title={hasContent ? 'Completado' : 'Pendiente'} />
      </span>
      <ChevronDown size={14} className={`transition-transform duration-200 ${openSections[id] ? 'rotate-180' : ''}`} style={{ color: `var(--ff-text-tertiary)` }} />
    </button>
  );

  const renderCalendar = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const rows = [];
    let days = [];
    let day = startDate;
    const selectedDate = card.dueDate ? parseISO(card.dueDate) : null;

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        const d = day;
        days.push(
          <button
            key={day.toString()}
            onClick={() => { updateCardSafe({ dueDate: format(d, 'yyyy-MM-dd') }); setIsDateOpen(false); }}
            className={`w-7 h-7 flex items-center justify-center rounded-full text-xs transition-all duration-200 ${
              !isSameMonth(day, monthStart) ? 'text-gray-300 hover:text-gray-500'
                : isSameDay(day, selectedDate || new Date(0)) ? 'bg-blue-600 text-white font-semibold shadow-sm'
                : isSameDay(day, new Date()) ? 'bg-blue-50 text-blue-600 font-semibold hover:bg-blue-100'
                : 'text-gray-700 hover:bg-gray-100 font-medium'
            }`}
          >{format(day, 'd')}</button>
        );
        day = addDays(day, 1);
      }
      rows.push(<div className="flex justify-between w-full mb-0.5" key={day.toString()}>{days}</div>);
      days = [];
    }
    return rows;
  };

  const updateProductionBriefSafe = (updates: Partial<ProductionBrief>) => {
    updateCardSafe({
      productionBrief: {
        ...EMPTY_PRODUCTION_BRIEF,
        ...productionBrief,
        ...updates,
      },
    });
  };

  if (useGuidedLayout) {
    const guidedModalContent = renderGuidedCardModal();
    if (typeof document === 'undefined') return null;
    return createPortal(guidedModalContent, document.body);
  }

  /* ══════════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════════ */
  const modalContent = (
    <div className="fixed inset-x-0 bottom-0 z-40 ff-fade-in sm:px-5 sm:pb-5" style={{ top: `${headerOffset}px` }} onClick={onClose}>
      <div
        className="ff-card-modal flex h-full w-full flex-col overflow-hidden shadow-xl ff-scale-in sm:rounded-[2.1rem] sm:border"
        style={{ background: `var(--ff-surface-muted)`, borderColor: `var(--ff-border-medium)` }}
        onClick={e => e.stopPropagation()}
      >

        {/* ── Header: Title + controls (H2: minimal, scannable) ─ */}
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 shrink-0 sm:px-5" style={{ borderBottom: `1px solid var(--ff-border-medium)`, background: `var(--ff-surface-solid)` }}>
          {/* Phase badge - H1: system status */}
          <span className={`text-[11px] font-bold text-white px-2.5 py-1 rounded-full shrink-0 ${phase.color}`}>
            {phase.name}
          </span>
          {/* Content type toggle */}
          <div className="flex rounded-lg overflow-hidden shrink-0" style={{ border: `1px solid var(--ff-border-medium)` }}>
            <button
              onClick={() => updateCardSafe({ contentType: 'long' })}
              disabled={readOnly}
              className="px-2.5 py-1 text-xs font-semibold transition-colors flex items-center gap-1"
              style={card.contentType !== 'short'
                ? { background: `var(--ff-primary)`, color: `var(--ff-text-inverse)` }
                : { background: `var(--ff-surface-solid)`, color: `var(--ff-text-secondary)` }}
            >
              <Film size={12} /> Largo
            </button>
            <button
              onClick={() => updateCardSafe({ contentType: 'short' })}
              disabled={readOnly}
              className="px-2.5 py-1 text-xs font-semibold transition-colors flex items-center gap-1"
              style={card.contentType === 'short'
                ? { background: `var(--ff-accent)`, color: `#fff` }
                : { background: `var(--ff-surface-solid)`, color: `var(--ff-text-secondary)` }}
            >
              <Zap size={12} /> Short
            </button>
          </div>
          {/* Title input - H2: recognition, direct editing */}
          <input
            type="text"
            value={card.title}
            onChange={(e) => updateCardSafe({ title: e.target.value })}
            readOnly={readOnly}
            className="order-3 basis-full text-lg font-bold bg-transparent border-none outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1 min-w-0 sm:order-none sm:basis-auto sm:flex-1"
            style={{ color: `var(--ff-text-primary)` }}
          />
          <button
            onClick={handleImproveTitle}
            disabled={isImprovingTitle || readOnly}
            className="p-1.5 rounded-lg transition-colors shrink-0"
            style={{ background: `rgba(130, 146, 255, 0.16)`, color: `var(--ff-accent)` }}
            title="Mejorar titulo con IA"
          >
            {isImprovingTitle ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          </button>
          <button onClick={onClose} className="p-2 rounded-full transition-colors shrink-0 ml-1" style={{ color: `var(--ff-text-tertiary)` }} title="Cerrar (Esc)">
            <X size={20} />
          </button>
        </div>

        {/* ── H5: AI title confirmation ───────────────────────── */}
        {aiNotice && (
          <div className="flex items-center gap-2 px-5 py-2 shrink-0" style={{ background: `var(--ff-warning-bg)`, borderBottom: `1px solid var(--ff-warning-border)` }}>
            <AlertTriangle size={14} className="text-amber-600 shrink-0" />
            <span className="flex-1 text-sm" style={{ color: `var(--ff-warning-text)` }}>{aiNotice}</span>
            <button onClick={() => setAiNotice(null)} className="text-amber-500 hover:text-amber-700 p-0.5">
              <X size={14} />
            </button>
          </div>
        )}

        {suggestedTitle && (
          <div className="flex items-center gap-2 px-5 py-2 shrink-0" style={{ background: `rgba(130, 146, 255, 0.14)`, borderBottom: `1px solid rgba(130, 146, 255, 0.24)` }}>
            <Sparkles size={14} className="text-purple-500 shrink-0" />
            <span className="flex-1 text-sm truncate font-medium" style={{ color: `var(--ff-text-primary)` }}>"{suggestedTitle}"</span>
            <button
              onClick={() => { updateCardSafe({ title: suggestedTitle }); setSuggestedTitle(null); }}
              disabled={readOnly}
              className="text-xs font-semibold text-green-700 bg-green-100 hover:bg-green-200 px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors"
            >
              <Check size={12} /> Aceptar
            </button>
            <button
              onClick={() => setSuggestedTitle(null)}
              className="text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors"
            >
              <X size={12} /> Rechazar
            </button>
          </div>
        )}

        {readOnly && (
          <div className="px-5 py-2 shrink-0" style={{ background: `var(--ff-surface-raised)`, borderBottom: `1px solid var(--ff-border)` }}>
            <span className="text-xs font-medium" style={{ color: `var(--ff-text-secondary)` }}>
              Estas viendo la tarjeta en modo solo lectura. Puedes revisar contenido, pero no editarlo con tu rol actual.
            </span>
          </div>
        )}

        {/* ── Phase completion banner ────────────────────────── */}
        {phaseStatus && (
          <div className="px-4 py-2.5 shrink-0 sm:px-5" style={{ borderBottom: `1px solid var(--ff-border)`, background: phaseStatus.isDone ? `color-mix(in srgb, #22c55e 8%, var(--ff-surface-solid))` : `color-mix(in srgb, #f59e0b 6%, var(--ff-surface-solid))` }}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] font-bold uppercase tracking-wider ${phaseStatus.isDone ? 'text-emerald-600' : 'text-amber-600'}`}>
                {phaseStatus.shortLabel} — {phaseStatus.isDone ? 'Fase completa' : 'En progreso'}
              </span>
              <span className="text-[10px]" style={{ color: `var(--ff-text-tertiary)` }}>
                Lidera: {phaseStatus.leader === 'creador' ? 'Creador' : phaseStatus.leader === 'editor' ? 'Editor' : 'Asistente'}
              </span>
            </div>
            <p className="text-xs mb-1.5" style={{ color: `var(--ff-text-secondary)` }}>
              Meta: {phaseStatus.deliverable}
            </p>
            {phaseStatus.isDone ? (
              <div className="flex items-center gap-2">
                <Check size={14} className="text-emerald-500" />
                <span className="text-xs font-medium text-emerald-600">
                  {phaseStatus.doneCondition} — puedes mover a la siguiente columna
                </span>
                {!readOnly && board && listIndex < board.lists.length - 1 && (
                  <button
                    onClick={() => {
                      const nextList = board.lists[listIndex + 1];
                      if (nextList) moveCard(card.listId, nextList.id, 0, 0, card.id);
                    }}
                    className="ml-auto text-[11px] font-bold px-3 py-1 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-colors flex items-center gap-1"
                  >
                    <ArrowRightLeft size={12} /> Mover
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {phaseStatus.missingFields.map(f => (
                  <span key={f.field} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                    {f.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="grid gap-2.5 px-4 py-2.5 shrink-0 sm:px-5 md:grid-cols-2 xl:grid-cols-3" style={{ borderBottom: `1px solid var(--ff-border)`, background: `color-mix(in srgb, var(--ff-surface-solid) 82%, transparent)` }}>
          <div className="rounded-xl border px-3 py-2.5" style={{ borderColor: `var(--ff-border)`, background: `var(--ff-bg-subtle)` }}>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: `var(--ff-text-tertiary)` }}>Responsable y estado</p>
            <div className="relative mt-1.5" ref={assigneeRef}>
              <button
                onClick={() => setIsAssigneeOpen(!isAssigneeOpen)}
                disabled={readOnly}
                className="flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-all"
                style={{ background: `var(--ff-surface-solid)`, borderColor: `var(--ff-border)`, color: `var(--ff-text-primary)` }}
              >
                <span className="flex items-center gap-1.5">
                  <User size={13} style={{ color: `var(--ff-text-tertiary)` }} />
                  <span>{assigneeOptions.find(opt => opt.value === (card.assignee || ''))?.label || 'Sin asignar'}</span>
                </span>
                <ChevronDown size={12} className={`transition-transform ${isAssigneeOpen ? 'rotate-180' : ''}`} style={{ color: `var(--ff-text-tertiary)` }} />
              </button>
              {isAssigneeOpen && (
                <div className="absolute z-50 w-full mt-1 rounded-xl shadow-xl overflow-hidden py-1 ring-1 ring-black/5" style={{ background: `var(--ff-surface-solid)`, border: `1px solid var(--ff-border)` }}>
                  {assigneeOptions.map(option => (
                    <button
                      key={option.value}
                      onClick={() => { updateCardSafe({ assignee: option.value || null }); setIsAssigneeOpen(false); }}
                      className={`w-full text-left px-3 py-2 text-xs transition-all ${
                        (card.assignee || '') === option.value ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <span className={flowChipClassName} style={flowScheduleChipStyle}>
                {flowScheduleLabel || phase.name}
              </span>
              {flowWorkingDaysLabel && (
                <span className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ff-chip-soft">
                  {flowWorkingDaysLabel}
                </span>
              )}
            </div>
          </div>

          <div className="rounded-xl border px-3 py-2.5" style={{ borderColor: `var(--ff-border)`, background: `var(--ff-bg-subtle)` }}>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: `var(--ff-text-tertiary)` }}>Fecha y ritmo</p>
            <div className="relative mt-1.5" ref={dateRef}>
              <button
                onClick={() => setIsDateOpen(!isDateOpen)}
                disabled={readOnly}
                className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-all ${
                  card.dueDate && new Date(card.dueDate) < new Date()
                    ? 'bg-red-100 text-red-700 hover:bg-red-200'
                    : ''
                }`}
                style={!card.dueDate || new Date(card.dueDate) >= new Date() ? { background: `var(--ff-surface-solid)`, borderColor: `var(--ff-border)`, color: `var(--ff-text-primary)` } : {}}
              >
                <span className="flex items-center gap-1.5">
                  <CalendarIcon size={13} className={card.dueDate && new Date(card.dueDate) < new Date() ? 'text-red-500' : ''} style={card.dueDate && new Date(card.dueDate) < new Date() ? undefined : { color: `var(--ff-text-tertiary)` }} />
                  <span>{card.dueDate ? format(parseISO(card.dueDate), "d MMM yyyy", { locale: es }) : 'Fecha editorial'}</span>
                </span>
                <ChevronDown size={12} className={`transition-transform ${isDateOpen ? 'rotate-180' : ''}`} style={{ color: `var(--ff-text-tertiary)` }} />
              </button>
              {isDateOpen && (
                <div className="absolute z-50 w-60 mt-1 rounded-xl shadow-xl overflow-hidden p-2.5" style={{ background: `var(--ff-surface-solid)`, border: `1px solid var(--ff-border-medium)` }}>
                  <div className="flex items-center justify-between mb-2">
                    <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1 rounded-md transition-colors" style={{ color: `var(--ff-text-tertiary)` }}>
                      <ChevronLeft size={16} />
                    </button>
                    <span className="text-xs font-bold capitalize" style={{ color: `var(--ff-text-primary)` }}>{format(currentMonth, 'MMMM yyyy', { locale: es })}</span>
                    <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1 rounded-md transition-colors" style={{ color: `var(--ff-text-tertiary)` }}>
                      <ChevronRight size={16} />
                    </button>
                  </div>
                  <div className="flex justify-between w-full mb-1.5 px-1">
                    {['L','M','X','J','V','S','D'].map((d, i) => (
                      <div key={i} className="w-7 text-center text-[10px] font-bold" style={{ color: `var(--ff-text-tertiary)` }}>{d}</div>
                    ))}
                  </div>
                  <div className="flex flex-col px-1">{renderCalendar()}</div>
                  {card.dueDate && (
                    <div className="mt-2 pt-2 border-t border-gray-100 flex justify-center">
                      <button onClick={() => { updateCardSafe({ dueDate: null }); setIsDateOpen(false); }} className="text-[11px] font-semibold text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-md transition-colors w-full">
                        Limpiar fecha
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            <p className="mt-1.5 text-[11px] leading-5" style={{ color: `var(--ff-text-secondary)` }}>
              {flowSummary?.isKickoffPending
                ? 'El reloj real arranca cuando apruebas la idea o inicias produccion.'
                : `Estado del ciclo: ${flowScheduleLabel?.toLowerCase() || 'en curso'}.`}
            </p>
          </div>

          <div className="rounded-xl border px-3 py-2.5 md:col-span-2 xl:col-span-1" style={{ borderColor: `var(--ff-border)`, background: `var(--ff-bg-subtle)` }}>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: `var(--ff-text-tertiary)` }}>Recursos y siguiente paso</p>
            <div className="mt-1.5 flex items-center gap-1.5">
              <LinkIcon size={13} className="text-gray-400 shrink-0" />
              <input
                type="url"
                placeholder="Link Drive o carpeta del proyecto..."
                value={card.linkDrive || ''}
                onChange={(e) => updateCardSafe({ linkDrive: e.target.value })}
                readOnly={readOnly}
                className="w-full rounded-xl border px-3 py-2 text-xs outline-none transition-all"
                style={{ background: `var(--ff-surface-solid)`, borderColor: `var(--ff-border)`, color: `var(--ff-text-primary)` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] leading-5" style={{ color: `var(--ff-text-secondary)` }}>
              <span className="font-semibold" style={{ color: `var(--ff-text-primary)` }}>Siguiente paso:</span> {phase.action}
            </p>
          </div>
        </div>

        {!useGuidedLayout && (
          <div className={`shrink-0 ${isMobile ? 'px-4 py-2.5' : 'px-5 py-2.5'}`} style={{ borderBottom: `1px solid var(--ff-border)`, background: `var(--ff-surface-solid)` }}>
            <div className="flex flex-wrap items-center gap-2">
              {(Object.keys(WORKSPACE_CONFIG) as CardModalWorkspace[]).map((workspaceKey) => {
                const config = WORKSPACE_CONFIG[workspaceKey];
                const isActive = activeWorkspace === workspaceKey;
                return (
                  <button
                    key={workspaceKey}
                    onClick={() => {
                      setActiveWorkspace(workspaceKey);
                      bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className={`min-h-10 rounded-full px-3 py-2 text-xs font-semibold transition-all ${isActive ? 'shadow-sm' : ''}`}
                    style={{
                      background: isActive ? `var(--ff-primary)` : `var(--ff-bg-subtle)`,
                      color: isActive ? 'white' : `var(--ff-text-secondary)`,
                    }}
                  >
                    {config.label}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold" style={{ color: `var(--ff-text-primary)` }}>
                {workspaceConfig.title}
              </span>
              {!isMobile && (
                <span className="text-[11px]" style={{ color: `var(--ff-text-secondary)` }}>
                  {workspaceConfig.description}
                </span>
              )}
              <button
                onClick={() => setShowAllSections(prev => !prev)}
                className="ml-auto text-[11px] font-medium underline decoration-dotted underline-offset-2"
                style={{ color: `var(--ff-text-tertiary)` }}
              >
                {showAllSections ? 'Solo lo de esta fase' : 'Ver todos los campos'}
              </button>
            </div>
            {isMobile && (
              <div className="mt-2 flex flex-wrap gap-2">
                {visibleJumpSections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => scrollToSection(section.id)}
                    className="rounded-full px-3 py-1.5 text-[11px] font-semibold"
                    style={{ background: `var(--ff-bg-subtle)`, color: `var(--ff-text-secondary)` }}
                  >
                    {section.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div ref={bodyRef} className="ff-scrollbar flex-1 overflow-y-auto p-3 sm:p-4">
          {useGuidedLayout ? renderGuidedCardModal() : (
            <>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr),250px] 2xl:grid-cols-[minmax(0,1fr),270px]">
                {/* ── Left column ── */}
                {(activeWorkspace === 'base' || activeWorkspace === 'publish') && (
                <div className="flex flex-col gap-4 xl:col-start-1 xl:row-start-1">
                {/* ─── Section: SEO / Keywords ───────────────────── */}
                {activeWorkspace === 'publish' && isSectionVisibleForPhase('seo', phase.name, showAllSections) && (
                <div ref={seoRef} className={`${sectionShellClassName} order-4`} style={sectionShellStyle}>
                  <SectionHead id="seo" icon={<Search size={16} className="text-cyan-500" />} title="SEO - Palabras Clave" hasContent={!!card.keywords} />
                  {openSections.seo && (
                    <div className="pl-1 space-y-2 pb-3">
                      <div className="flex items-center justify-end">
                        <button
                          onClick={handleSuggestKeywords}
                          disabled={isSuggestingKeywords}
                          className="text-xs font-medium bg-purple-50 text-purple-600 hover:bg-purple-100 px-3 py-1 rounded-lg transition-colors flex items-center gap-1 border border-purple-200"
                        >
                          {isSuggestingKeywords ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                          Sugerir con IA
                        </button>
                      </div>
                      <input
                        type="text"
                        value={card.keywords || ''}
                        onChange={(e) => updateCardSafe({ keywords: e.target.value })}
                        placeholder="Palabras clave long-tail, separadas por coma..."
                        className="w-full p-2.5 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-blue-500 outline-none"
                      />
                      <p className="text-[10px] text-gray-400">Menos volumen, cero competencia = trafico pasivo evergreen.</p>
                    </div>
                  )}
                </div>
                )}

                {/* ─── Section: Descripcion ──────────────────────── */}
                {activeWorkspace === 'publish' && isSectionVisibleForPhase('desc', phase.name, showAllSections) && (
                <div className={`${sectionShellClassName} order-5`} style={sectionShellStyle}>
                  <SectionHead id="desc" icon={<AlignLeft size={16} className="text-gray-500" />} title="Descripcion YouTube" hasContent={!!card.description} />
                  {openSections.desc && (
                    <div className="pl-1 pb-3">
                      <div className="flex items-center justify-end mb-2 gap-2 flex-wrap">
                        {!readOnly && (
                          <button
                            onClick={handleGenerateDescription}
                            disabled={isGeneratingDesc}
                            className="flex items-center gap-1.5 text-sm font-medium border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg transition-all"
                          >
                            {isGeneratingDesc ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                            Generar descripcion SEO con IA
                          </button>
                        )}
                        {!readOnly && <AudioRecorder onTranscription={handleTranscription} />}
                        {!isEditingDesc && (
                          !readOnly && <button onClick={() => setIsEditingDesc(true)} className="text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 px-4 py-1.5 rounded-lg transition-all">
                            Editar
                          </button>
                        )}
                      </div>
                      {isEditingDesc ? (
                        <div className="space-y-3">
                          <textarea
                            value={descInput}
                            onChange={(e) => setDescInput(e.target.value)}
                            className="w-full min-h-[200px] p-4 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-mono text-sm text-gray-700 transition-all resize-y shadow-sm"
                            placeholder="Escribe tu descripcion/guion o carga un preset..."
                          />

                          {/* ── Action buttons ── */}
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <button onClick={handleSaveDesc} className="bg-blue-600 text-white px-5 py-2 rounded-lg font-medium hover:bg-blue-700 transition-all">
                                Guardar
                              </button>
                              <button onClick={() => { setDescInput(card.description); setIsEditingDesc(false); setScriptAnalysis(null); }} className="text-gray-600 bg-gray-100 hover:bg-gray-200 px-5 py-2 rounded-lg font-medium transition-all">
                                Cancelar
                              </button>
                            </div>
                            {/* Save as preset */}
                            <button
                              onClick={() => setShowSavePreset(!showSavePreset)}
                              disabled={!descInput.trim() || readOnly}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-lg font-medium transition-all text-sm border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                              title="Guardar como preset"
                            >
                              <Save size={14} />
                              <span className="text-xs">Guardar preset</span>
                            </button>
                          </div>

                          {/* ── Save preset input ── */}
                          {showSavePreset && (
                            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                              <Save size={14} className="text-amber-600 shrink-0" />
                              <input
                                type="text"
                                autoFocus
                                placeholder="Nombre del preset..."
                                value={savingPresetName}
                                onChange={(e) => setSavingPresetName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSavePreset(); }}
                                className="flex-1 bg-white border border-amber-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                              />
                              <button onClick={handleSavePreset} disabled={!savingPresetName.trim()} className="bg-amber-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50 transition-all">
                                Guardar
                              </button>
                              <button onClick={() => { setShowSavePreset(false); setSavingPresetName(''); }} className="text-gray-500 hover:text-gray-700 p-1">
                                <X size={14} />
                              </button>
                            </div>
                          )}

                          {/* ── Preset chips ── */}
                          <div className="space-y-2">
                            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Presets</p>
                            <div className="flex flex-wrap gap-1.5">
                              {Object.keys(DESC_PRESETS).map((name) => (
                                <button
                                  key={name}
                                  onClick={() => handleLoadPreset(name)}
                                  disabled={readOnly}
                                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition-all"
                                >
                                  <FileText size={12} />
                                  {name}
                                </button>
                              ))}
                              {board?.descriptionPresets && Object.keys(board.descriptionPresets).map((name) => (
                                <div key={name} className="flex items-center gap-0.5">
                                  <button
                                    onClick={() => handleLoadPreset(name)}
                                    disabled={readOnly}
                                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 transition-all"
                                  >
                                    <Save size={12} />
                                    {name}
                                  </button>
                                  <button
                                    onClick={() => handleDeletePreset(name)}
                                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                                    title="Eliminar preset"
                                  >
                                    <X size={10} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>

                        </div>
                      ) : (
                        <div className={`bg-gray-50 p-5 rounded-xl border border-gray-200 min-h-[60px] transition-all shadow-sm ${readOnly ? '' : 'cursor-pointer hover:bg-gray-100 hover:border-gray-300'}`} onClick={() => !readOnly && setIsEditingDesc(true)}>
                          {card.description ? (
                            <div className="prose prose-sm prose-blue max-w-none prose-headings:font-bold prose-h2:text-lg prose-h3:text-base prose-p:text-gray-700 prose-a:text-blue-600">
                              <ReactMarkdown>{card.description}</ReactMarkdown>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center text-gray-400 space-y-1 py-2">
                              <AlignLeft size={24} className="text-gray-300" />
                              <p className="text-sm">Haz clic para añadir descripcion...</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                )}

                {/* ─── Section: Exportar a YouTube ─────────────── */}
                {activeWorkspace === 'publish' && isSectionVisibleForPhase('ytexport', phase.name, showAllSections) && (
                <div className={`${sectionShellClassName} order-6`} style={sectionShellStyle}>
                  <SectionHead id="ytexport" icon={<Upload size={16} className="text-red-500" />} title="Exportar a YouTube" hasContent={!!(card.title && card.description)} />
                  {openSections.ytexport && (
                    <div className="pl-1 pb-3 space-y-3">
                      <p className="text-[11px] text-gray-500">Copia la metadata lista para pegar en YouTube Studio.</p>

                      {/* Preview cards */}
                      <div className="space-y-2">
                        {/* Title */}
                        <ExportField
                          label="Titulo"
                          value={card.title}
                          copiedField={copiedField}
                          onCopy={() => { navigator.clipboard.writeText(card.title); setCopiedField('title'); setTimeout(() => setCopiedField(null), 2000); }}
                          fieldKey="title"
                        />

                        {/* Description */}
                        <ExportField
                          label="Descripcion"
                          value={card.description}
                          copiedField={copiedField}
                          onCopy={() => { navigator.clipboard.writeText(card.description); setCopiedField('desc'); setTimeout(() => setCopiedField(null), 2000); }}
                          fieldKey="desc"
                          multiline
                        />

                        {/* Keywords / Tags */}
                        {card.keywords && (
                          <ExportField
                            label="Tags"
                            value={card.keywords}
                            copiedField={copiedField}
                            onCopy={() => { navigator.clipboard.writeText(card.keywords || ''); setCopiedField('tags'); setTimeout(() => setCopiedField(null), 2000); }}
                            fieldKey="tags"
                          />
                        )}
                      </div>

                      {/* Copy all button */}
                      <button
                        onClick={() => {
                          const parts = [
                            `TITULO:\n${card.title}`,
                            `\nDESCRIPCION:\n${card.description}`,
                            card.keywords ? `\nTAGS:\n${card.keywords}` : '',
                          ].filter(Boolean).join('\n');
                          navigator.clipboard.writeText(parts);
                          setCopiedField('all');
                          setTimeout(() => setCopiedField(null), 2000);
                        }}
                        className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                          copiedField === 'all'
                            ? 'bg-green-500 text-white'
                            : 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                        }`}
                      >
                        {copiedField === 'all' ? (
                          <><Check size={16} /> Copiado al portapapeles</>
                        ) : (
                          <><Copy size={16} /> Copiar todo para YouTube Studio</>
                        )}
                      </button>

                      {/* Readiness check */}
                      <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                        <p className="text-[10px] font-bold text-gray-500 uppercase mb-2">Checklist de publicacion</p>
                        <div className="space-y-1.5">
                          <ReadinessItem ok={!!card.title} label="Titulo definido" />
                          <ReadinessItem ok={!!card.description} label="Descripcion escrita" />
                          <ReadinessItem ok={!!card.keywords} label="Tags/keywords definidos" />
                          <ReadinessItem ok={!!card.gancho8s} label="Gancho de 8 segundos preparado" />
                          <ReadinessItem ok={!!(card.miniaturaChecklist?.rostro && card.miniaturaChecklist?.texto && card.miniaturaChecklist?.contexto)} label="Miniatura completa (rostro + texto + contexto)" />
                          <ReadinessItem ok={!!card.interlinking} label="Interlinking configurado" />
                          <ReadinessItem ok={!!card.dueDate} label="Fecha de publicacion asignada" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                )}

                {/* ─── Section: Flujo optimizado ────────────────── */}
                {activeWorkspace === 'base' && isSectionVisibleForPhase('flow', phase.name, showAllSections) && (
                <div ref={productionRef} className={`${sectionShellClassName} order-1`} style={sectionShellStyle}>
                  <SectionHead id="flow" icon={<Film size={16} className="text-violet-500" />} title="Flujo optimizado" hasContent={!!card.productionFlow} />
                  {openSections.flow && (
                    <div className="pl-1 pb-4 space-y-4">
                      {card.productionFlow && flowSummary && currentFlowStage ? (
                        <>
                          <div className="grid gap-3 md:grid-cols-3">
                            <div className="rounded-xl border p-4" style={{ borderColor: `var(--ff-border)`, background: `var(--ff-bg-subtle)` }}>
                              <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: `var(--ff-text-tertiary)` }}>Etapa actual</p>
                              <p className="mt-2 text-sm font-bold" style={{ color: `var(--ff-text-primary)` }}>{currentFlowStage.label}</p>
                              <p className="mt-2 text-xs leading-5" style={{ color: `var(--ff-text-secondary)` }}>{currentFlowStage.deliverable}</p>
                              {currentFlowStage.hasAIDraft && (
                                <p className="mt-2 text-[10px] font-semibold" style={{ color: `var(--ff-primary)` }}>Borrador IA listo · validar antes de cerrar</p>
                              )}
                            </div>
                            <div className="rounded-xl border p-4" style={{ borderColor: `var(--ff-border)`, background: `var(--ff-bg-subtle)` }}>
                              <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: `var(--ff-text-tertiary)` }}>Responsable actual</p>
                              <p className="mt-2 text-sm font-bold" style={{ color: `var(--ff-text-primary)` }}>{getAuditRoleLabel(currentFlowStage.ownerRole)}</p>
                              <p className="mt-2 text-xs leading-5" style={{ color: `var(--ff-text-secondary)` }}>Fallback: {getAuditRoleLabel(currentFlowStage.fallbackOwnerRole)}</p>
                            </div>
                            <div className="rounded-xl border p-4" style={{ borderColor: `var(--ff-border)`, background: `var(--ff-bg-subtle)` }}>
                              <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: `var(--ff-text-tertiary)` }}>Estado operativo</p>
                              {flowScheduleLabel && (
                                <span className={`mt-2 inline-flex ${flowChipClassName}`} style={flowScheduleChipStyle}>
                                  {flowScheduleLabel}
                                </span>
                              )}
                              <p className="mt-2 text-sm font-bold" style={{ color: `var(--ff-text-primary)` }}>{flowSummary.completedCount}/{flowSummary.totalCount} etapas</p>
                              <p className="mt-2 text-xs leading-5" style={{ color: `var(--ff-text-secondary)` }}>
                                {flowWorkingDaysLabel} · Publicacion: {formatDateTime(card.productionFlow.publishAt)}
                              </p>
                            </div>
                          </div>

                          {(flowSummary.isTightSchedule || flowSummary.isColumnMismatch) && (
                            <div className="space-y-2">
                              {flowSummary.isTightSchedule && (
                                <div className="rounded-xl border p-3 text-sm" style={{ borderColor: `var(--ff-warning-border)`, background: `var(--ff-warning-bg)`, color: `var(--ff-warning-text)` }}>
                                  El cronograma quedo comprimido. Algunas etapas fueron ajustadas a hoy para no bloquear la creacion del video.
                                </div>
                              )}
                              {flowSummary.isColumnMismatch && (
                                <div className="rounded-xl border p-3 text-sm" style={{ borderColor: `var(--ff-danger-border)`, background: `var(--ff-danger-bg)`, color: `var(--ff-danger-text)` }}>
                                  La columna actual del tablero no coincide con la etapa activa del flujo.
                                  {flowSummary.expectedColumnTitle ? ` Se esperaba "${flowSummary.expectedColumnTitle}".` : ''}
                                </div>
                              )}
                            </div>
                          )}

                          {suggestedFlowColumn && !readOnly && (
                            <button
                              onClick={handleMoveToSuggestedColumn}
                              className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all"
                              style={flowBrandActionStyle}
                            >
                              <ArrowRightLeft size={15} />
                              Mover tarjeta a {suggestedFlowColumn.listTitle}
                            </button>
                          )}

                          <div className="space-y-3">
                            {card.productionFlow.stages.map((stage) => {
                              const stageChecklist = findStageChecklist(card, stage.id);
                              const completedItems = stageChecklist?.items.filter((item) => item.isCompleted).length || 0;
                              const totalItems = stageChecklist?.items.length || 0;
                              const isActiveStage = currentFlowStage.id === stage.id;
                              const isOperationallyLate = isActiveStage && flowSummary.isOverdueByBudget;
                              const isAtRiskStage = isActiveStage && flowSummary.isAtRisk && !flowSummary.isOverdueByBudget;
                              const isObjectiveLate = isActiveStage && flowSummary.isStageObjectiveLate && !flowSummary.isOverdueByBudget;
                              const statusLabel =
                                stage.status === 'done'
                                  ? 'Hecha'
                                  : stage.status === 'blocked'
                                  ? 'Bloqueada'
                                  : stage.status === 'in_progress'
                                  ? 'En curso'
                                  : 'Pendiente';
                              const statusStyle =
                                stage.status === 'done'
                                  ? getFlowToneStyle('success')
                                  : stage.status === 'blocked'
                                  ? getFlowToneStyle('danger')
                                  : isActiveStage
                                  ? getFlowToneStyle('brand')
                                  : getFlowToneStyle('neutral');

                              return (
                                <div
                                  key={stage.id}
                                  className="rounded-2xl border p-4"
                                  style={{
                                    borderColor: isActiveStage ? `color-mix(in srgb, var(--ff-primary) 30%, var(--ff-border))` : `var(--ff-border)`,
                                    background: isActiveStage
                                      ? `linear-gradient(180deg, color-mix(in srgb, var(--ff-primary) 12%, var(--ff-surface-solid)), var(--ff-surface-raised))`
                                      : `var(--ff-surface-raised)`,
                                    boxShadow: isActiveStage ? `0 0 0 1px color-mix(in srgb, var(--ff-primary) 14%, transparent)` : `none`,
                                  }}
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-sm font-bold" style={{ color: `var(--ff-text-primary)` }}>{stage.label}</p>
                                        <span className={flowChipClassName} style={statusStyle}>{statusLabel}</span>
                                        {isOperationallyLate && <span className={flowChipClassName} style={getFlowToneStyle('danger')}>Atrasada</span>}
                                        {isAtRiskStage && <span className={flowChipClassName} style={getFlowToneStyle('warning')}>En riesgo</span>}
                                        {isObjectiveLate && <span className={flowChipClassName} style={getFlowToneStyle('neutral')}>Objetivo superado</span>}
                                        {stage.hasAIDraft && <span className={flowChipClassName} style={getFlowToneStyle('brand')}>Borrador IA</span>}
                                      </div>
                                      <p className="mt-2 text-sm leading-6" style={{ color: `var(--ff-text-secondary)` }}>{stage.deliverable}</p>
                                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs" style={{ color: `var(--ff-text-tertiary)` }}>
                                        <span>Rol: <strong style={{ color: `var(--ff-text-secondary)` }}>{getAuditRoleLabel(stage.ownerRole)}</strong></span>
                                        <span>Checklist: <strong style={{ color: `var(--ff-text-secondary)` }}>{completedItems}/{totalItems}</strong></span>
                                        <span>Entrega: <strong style={{ color: `var(--ff-text-secondary)` }}>{formatDateTime(stage.dueAt)}</strong></span>
                                        {isActiveStage && <span>Ciclo: <strong style={{ color: `var(--ff-text-secondary)` }}>{flowWorkingDaysLabel}</strong></span>}
                                      </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      {!readOnly && stage.status !== 'done' && (
                                        <button
                                          onClick={() => handleStageStatusChange(stage.id, 'done')}
                                          className="rounded-xl px-3 py-2 text-xs font-semibold transition-all"
                                          style={flowPrimaryActionStyle}
                                        >
                                          {stage.id === 'idea' && !card.productionFlow?.kickoffAt ? 'Aprobar idea e iniciar' : 'Marcar etapa como hecha'}
                                        </button>
                                      )}
                                      {!readOnly && stage.status === 'done' && (
                                        <button
                                          onClick={() => handleStageStatusChange(stage.id, 'pending')}
                                          className="rounded-xl px-3 py-2 text-xs font-semibold transition-all"
                                          style={flowSoftActionStyle}
                                        >
                                          Reabrir
                                        </button>
                                      )}
                                      {!readOnly && stage.status === 'blocked' && (
                                        <button
                                          onClick={() => handleStageStatusChange(stage.id, 'in_progress')}
                                          className="rounded-xl px-3 py-2 text-xs font-semibold transition-all"
                                          style={flowBrandActionStyle}
                                        >
                                          Volver a activar
                                        </button>
                                      )}
                                      {!readOnly && stage.status === 'pending' && (
                                        <button
                                          onClick={() => handleStageStatusChange(stage.id, 'in_progress')}
                                          className="rounded-xl px-3 py-2 text-xs font-semibold transition-all"
                                          style={flowBrandActionStyle}
                                        >
                                          {stage.id === 'idea' && !card.productionFlow?.kickoffAt ? 'Aprobar idea e iniciar' : 'Iniciar'}
                                        </button>
                                      )}
                                      {!readOnly && stage.status !== 'blocked' && stage.status !== 'done' && (
                                        <button
                                          onClick={() => handleStageStatusChange(stage.id, 'blocked')}
                                          className="rounded-xl px-3 py-2 text-xs font-semibold transition-all"
                                          style={flowDangerActionStyle}
                                        >
                                          Bloquear
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  <div className="mt-4 grid gap-3 md:grid-cols-[220px,1fr]">
                                    <label className="block">
                                      <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: `var(--ff-text-tertiary)` }}>Fecha objetivo</span>
                                      <input
                                        type="datetime-local"
                                        defaultValue={formatDateTimeInput(stage.dueAt)}
                                        onBlur={(event) => handleStageDueAtChange(stage.id, event.target.value)}
                                        disabled={readOnly}
                                        className="min-h-11 w-full rounded-xl px-3 py-2 text-sm outline-none"
                                        style={{ background: `var(--ff-input-bg)`, color: `var(--ff-text-primary)`, border: `1px solid var(--ff-input-border)` }}
                                      />
                                    </label>

                                    <label className="block">
                                      <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: `var(--ff-text-tertiary)` }}>Notas de la etapa</span>
                                      <textarea
                                        defaultValue={stage.notes || ''}
                                        onBlur={(event) => handleStageNotesChange(stage.id, event.target.value)}
                                        disabled={readOnly}
                                        rows={2}
                                        className="w-full rounded-xl px-3 py-2 text-sm outline-none resize-none"
                                        style={{ background: `var(--ff-input-bg)`, color: `var(--ff-text-primary)`, border: `1px solid var(--ff-input-border)` }}
                                        placeholder="Bloqueos, decisiones, feedback o links importantes de esta etapa..."
                                      />
                                    </label>
                                  </div>

                                  {stageChecklist && (
                                    <div className="mt-3 rounded-xl border p-3" style={{ borderColor: `var(--ff-border)`, background: `var(--ff-bg-subtle)` }}>
                                      <div className="flex items-center justify-between gap-3">
                                        <div>
                                          <p className="text-xs font-bold" style={{ color: `var(--ff-text-primary)` }}>{stageChecklist.title}</p>
                                          <p className="mt-1 text-xs" style={{ color: `var(--ff-text-secondary)` }}>
                                            {completedItems}/{totalItems} items completados
                                          </p>
                                        </div>
                                        <button
                                          onClick={() => scrollToSection('checklists')}
                                          className="rounded-xl px-3 py-2 text-xs font-semibold"
                                          style={{ background: `var(--ff-surface-solid)`, color: `var(--ff-text-primary)`, border: `1px solid var(--ff-border)` }}
                                        >
                                          Ver checklist
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </>
                      ) : (
                        <div className="rounded-xl border border-dashed p-4 text-sm leading-6" style={{ borderColor: `var(--ff-border-medium)`, color: `var(--ff-text-secondary)`, background: `var(--ff-bg-subtle)` }}>
                          Esta tarjeta no fue creada con el flujo optimizado. Puedes seguir usandola normal, o crear los nuevos videos desde el boton <strong>Nuevo video</strong> para tener etapas, fechas y auditoria detallada.
                        </div>
                      )}
                    </div>
                  )}

                  {isSectionVisibleForPhase('guion', phase.name, showAllSections) && <>
                  <SectionHead id="guion" icon={<BookOpen size={16} className="text-indigo-500" />} title="Guion del Video" hasContent={!!card.guion} />
                  {openSections.guion && (
                    <div className="pl-1 pb-3">
                      <div className="flex items-center justify-end mb-2 gap-2 flex-wrap">
                        {!readOnly && (
                          <button
                            onClick={handleGenerateScript}
                            disabled={isGeneratingScript}
                            className="flex items-center gap-1.5 text-sm font-medium border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg transition-all"
                          >
                            {isGeneratingScript ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                            Generar guion con IA
                          </button>
                        )}
                        {!isEditingGuion && !readOnly && (
                          <button onClick={() => setIsEditingGuion(true)} className="text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 px-4 py-1.5 rounded-lg transition-all">
                            Editar
                          </button>
                        )}
                        {card.guion && (
                          <button onClick={() => setShowTeleprompter(true)} className="flex items-center gap-1.5 text-sm font-medium bg-gray-900 text-white hover:bg-black px-4 py-1.5 rounded-lg transition-all">
                            <Play size={13} fill="white" /> Teleprompter
                          </button>
                        )}
                      </div>
                      {isEditingGuion ? (
                        <div className="space-y-3">
                          <textarea
                            value={guionInput}
                            onChange={(e) => setGuionInput(e.target.value)}
                            className="w-full min-h-[280px] p-4 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none font-mono text-sm text-gray-700 transition-all resize-y shadow-sm"
                            placeholder="Escribe la estructura de tu guion..."
                          />

                          {/* Action buttons */}
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <button onClick={handleSaveGuion} className="bg-indigo-600 text-white px-5 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-all">
                                Guardar
                              </button>
                              <button onClick={() => { setGuionInput(card.guion || ''); setIsEditingGuion(false); setScriptAnalysis(null); }} className="text-gray-600 bg-gray-100 hover:bg-gray-200 px-5 py-2 rounded-lg font-medium transition-all">
                                Cancelar
                              </button>
                            </div>
                            <button
                              onClick={handleAnalyzeScript}
                              disabled={isAnalyzingScript || !guionInput.trim()}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-lg font-medium transition-all text-sm border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isAnalyzingScript ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                              <span>Analizar Guion con IA</span>
                            </button>
                          </div>

                          {/* Guion presets */}
                          <div className="space-y-2">
                            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Plantillas de Guion</p>
                            <div className="flex flex-wrap gap-1.5">
                              {Object.keys(GUION_PRESETS).map((name) => (
                                <button
                                  key={name}
                                  onClick={() => handleLoadGuionPreset(name)}
                                  disabled={readOnly}
                                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-all"
                                >
                                  <FileText size={12} />
                                  {name}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* AI Script Analysis Result */}
                          {scriptAnalysis && (
                            <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl space-y-2">
                              <div className="flex items-center justify-between">
                                <h4 className="text-sm font-bold text-purple-800 flex items-center gap-1.5">
                                  <Sparkles size={14} />
                                  Analisis del Guion
                                </h4>
                                <button onClick={() => setScriptAnalysis(null)} className="text-purple-400 hover:text-purple-600 p-0.5">
                                  <X size={14} />
                                </button>
                              </div>
                              <div className="prose prose-sm prose-purple max-w-none text-purple-900">
                                <ReactMarkdown>{scriptAnalysis}</ReactMarkdown>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className={`bg-gray-50 p-5 rounded-xl border border-gray-200 min-h-[60px] transition-all shadow-sm ${readOnly ? '' : 'cursor-pointer hover:bg-gray-100 hover:border-gray-300'}`} onClick={() => !readOnly && setIsEditingGuion(true)}>
                          {card.guion ? (
                            <div className="prose prose-sm prose-indigo max-w-none prose-headings:font-bold prose-h2:text-lg prose-h3:text-base prose-p:text-gray-700">
                              <ReactMarkdown>{card.guion}</ReactMarkdown>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center text-gray-400 space-y-1 py-2">
                              <BookOpen size={24} className="text-gray-300" />
                              <p className="text-sm">Haz clic para escribir el guion...</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  </>}
                </div>
                )}

                {/* ─── Section: Shorts Config (only if short) ────── */}
                {activeWorkspace === 'base' && isShort && (
                  <div className={`${sectionShellClassName} order-3`} style={sectionShellStyle}>
                    <SectionHead id="shorts" icon={<Zap size={16} className="text-purple-500" />} title="Configuracion de Short" hasContent={!!card.shortsHook || !!card.shortsLoop} />
                    {openSections.shorts && (
                      <div className="pl-1 pb-3 space-y-3">
                        <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl space-y-3">
                          <div>
                            <label className="block text-xs font-semibold text-purple-700 mb-1">Gancho Visual (1-3s)</label>
                            <input
                              type="text"
                              value={card.shortsHook || ''}
                              onChange={(e) => updateCardSafe({ shortsHook: e.target.value })}
                              placeholder="Que ve el espectador en los primeros 1-3 segundos..."
                              className="w-full p-2.5 text-sm bg-white border border-purple-200 rounded-lg focus:border-purple-500 outline-none"
                            />
                          </div>
                          <label className="flex items-center space-x-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={card.shortsLoop || false}
                              onChange={(e) => updateCardSafe({ shortsLoop: e.target.checked })}
                              className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
                            />
                            <span className="text-sm text-purple-800 font-medium">Loopabilidad infinita asegurada</span>
                          </label>
                          <div>
                            <label className="block text-xs font-semibold text-purple-700 mb-1">Canaliza a Video Largo (Embudo)</label>
                            <select
                              value={card.shortsFunnel || ''}
                              onChange={(e) => updateCardSafe({ shortsFunnel: e.target.value })}
                              className="w-full p-2.5 text-sm bg-white border border-purple-200 rounded-lg focus:border-purple-500 outline-none"
                            >
                              <option value="">Sin enlazar</option>
                              {longFormCards.map(c => (
                                <option key={c.id} value={c.id}>{c.title}</option>
                              ))}
                            </select>
                            <p className="text-[10px] text-purple-500 mt-1">Shorts = Top of Funnel → Videos Largos = Bottom of Funnel</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

              </div>
                )}

                {/* ── Right column ── */}
                {(activeWorkspace === 'growth' || activeWorkspace === 'control') && (
                <div className="flex flex-col gap-4 xl:col-start-1 xl:row-start-2">
                {/* ─── Section: Ingenieria del Clic (long-form) ──── */}
                {activeWorkspace === 'growth' && !isShort && isSectionVisibleForPhase('clic', phase.name, showAllSections) && (
                  <div className={`${sectionShellClassName} order-1`} style={sectionShellStyle}>
                    <SectionHead
                      id="clic"
                      icon={<Sparkles size={16} className="text-purple-500" />}
                      title="Ingenieria del Clic"
                      hasContent={!!card.titulosLinden || Object.values(card.miniaturaChecklist || {}).some(Boolean)}
                    />
                    {openSections.clic && (
                      <div className="pl-1 pb-3 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Metodo Linden (Titulacion)</label>
                            <textarea
                              value={card.titulosLinden || ''}
                              onChange={(e) => updateCardSafe({ titulosLinden: e.target.value })}
                              placeholder="Escribe variaciones de titulos usando la Brecha de Curiosidad..."
                              className="w-full h-28 p-3 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-blue-500 outline-none resize-y"
                            />
                            {!readOnly && (
                              <button
                                onClick={handleGenerateTitles}
                                disabled={isGeneratingTitles}
                                className="mt-1.5 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                              >
                                {isGeneratingTitles ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                                Generar 10 titulos con IA
                              </button>
                            )}
                          </div>
                          <div className="space-y-2">
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Miniatura (Regla 3 Elementos)</label>
                            <div className="space-y-2 bg-gray-50 p-3 rounded-lg border border-gray-200">
                              {[
                                { key: 'rostro', label: '1. Rostro (Emocion visible)' },
                                { key: 'texto', label: '2. Texto (Gancho corto)' },
                                { key: 'contexto', label: '3. Objeto (Contexto de la historia)' },
                              ].map(item => (
                                <label key={item.key} className="flex items-center space-x-3 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={card.miniaturaChecklist?.[item.key as keyof typeof card.miniaturaChecklist] || false}
                                    onChange={(e) => updateCardSafe({
                                      miniaturaChecklist: {
                                        ...(card.miniaturaChecklist || { rostro: false, texto: false, contexto: false }),
                                        [item.key]: e.target.checked,
                                      },
                                    })}
                                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                  />
                                  <span className="text-sm text-gray-700">{item.label}</span>
                                </label>
                              ))}
                            </div>
                            <div className="mt-3">
                              <label className="block text-xs font-semibold text-gray-600 mb-1">URL de Interlinking</label>
                              <input
                                type="text"
                                value={card.interlinking || ''}
                                onChange={(e) => updateCardSafe({ interlinking: e.target.value })}
                                placeholder="URL del video a enlazar al final..."
                                className="w-full p-2.5 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-blue-500 outline-none"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ─── Section: Retencion / Storytelling (long-form) */}
                {activeWorkspace === 'growth' && !isShort && isSectionVisibleForPhase('retention', phase.name, showAllSections) && (
                  <div className={`${sectionShellClassName} order-2`} style={sectionShellStyle}>
                    <SectionHead
                      id="retention"
                      icon={<Play size={16} className="text-red-500" />}
                      title="Retencion (Gancho + Storytelling)"
                      hasContent={!!card.gancho8s || !!card.storytelling?.queria}
                    />
                    {openSections.retention && (
                      <div className="pl-1 pb-3 space-y-4">
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">Gancho (Primeros 8s)</label>
                          <input
                            type="text"
                            value={card.gancho8s || ''}
                            onChange={(e) => updateCardSafe({ gancho8s: e.target.value })}
                            placeholder="Start with the end / Dolor / Ruptura de patron..."
                            className="w-full p-2.5 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-blue-500 outline-none"
                          />
                          <p className="text-[10px] text-gray-400 mt-1">0-5s: Pago Inmediato | 5-10s: Punto de Dolor | 10-15s: Ruptura de Patron</p>
                        </div>
                        <div className="space-y-2">
                          <label className="block text-xs font-semibold text-gray-600 mb-1">Narrativa - Regla de South Park</label>
                          <div className="grid grid-cols-1 gap-2">
                            {[
                              { key: 'queria', label: 'Queria...', color: 'text-blue-600', placeholder: 'Que queria el protagonista' },
                              { key: 'pero', label: 'PERO...', color: 'text-red-600', placeholder: 'Que obstaculo aparecio' },
                              { key: 'porLoTanto', label: 'POR LO TANTO...', color: 'text-green-600', placeholder: 'Que hizo para resolverlo' },
                            ].map(f => (
                              <div key={f.key} className="flex items-center gap-2">
                                <span className={`text-xs font-bold ${f.color} whitespace-nowrap w-28`}>{f.label}</span>
                                <input
                                  type="text"
                                  value={(card.storytelling as any)?.[f.key] || ''}
                                  onChange={(e) => updateCardSafe({
                                    storytelling: {
                                      ...(card.storytelling || { queria: '', pero: '', porLoTanto: '' }),
                                      [f.key]: e.target.value,
                                    },
                                  })}
                                  placeholder={f.placeholder}
                                  className="flex-1 p-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-blue-500 outline-none"
                                />
                              </div>
                            ))}
                          </div>
                          {card.narrativa && !card.storytelling?.queria && !card.storytelling?.pero && !card.storytelling?.porLoTanto && (
                            <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                              <p className="text-xs text-yellow-700 font-medium mb-1">Narrativa anterior (migra al nuevo formato):</p>
                              <p className="text-xs text-yellow-600">{card.narrativa}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ─── Section: Interlinking / Telarana (H6: chips) ─ */}
                {activeWorkspace === 'growth' && !isShort && board && otherCards.length > 0 && isSectionVisibleForPhase('interlinking', phase.name, showAllSections) && (
                  <div className={`${sectionShellClassName} order-3`} style={sectionShellStyle}>
                    <SectionHead
                      id="interlinking"
                      icon={<LinkIcon size={16} className="text-blue-500" />}
                      title="Telarana - Videos Enlazados"
                      hasContent={(card.interlinkingTargets || []).length > 0}
                    />
                    {openSections.interlinking && (
                      <div className="pl-1 pb-3">
                        <p className="text-[10px] text-gray-400 mb-2">Haz clic en los videos para enlazarlos. Usa el efecto telarana para arrastrar trafico.</p>
                        <div className="flex flex-wrap gap-2">
                          {otherCards.map(c => {
                            const isLinked = (card.interlinkingTargets || []).includes(c.id);
                            return (
                              <button
                                key={c.id}
                                onClick={() => {
                                  const current = card.interlinkingTargets || [];
                                  const updated = isLinked ? current.filter(id => id !== c.id) : [...current, c.id];
                                  updateCardSafe({ interlinkingTargets: updated });
                                }}
                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                  isLinked
                                    ? 'bg-blue-100 text-blue-700 border border-blue-300 shadow-sm'
                                    : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
                                }`}
                              >
                                {c.contentType === 'short' ? <Zap size={10} /> : <Film size={10} />}
                                <span className="truncate max-w-[140px]">{c.title}</span>
                                {isLinked && <Check size={10} className="text-blue-600" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ─── Section: Monetizacion ─────────────────────── */}
                {activeWorkspace === 'growth' && isSectionVisibleForPhase('monetization', phase.name, showAllSections) && (
                <div ref={monetizationRef} className={`${sectionShellClassName} order-4`} style={sectionShellStyle}>
                  <SectionHead
                    id="monetization"
                    icon={<DollarSign size={16} className="text-green-500" />}
                    title="Monetizacion / Negocio"
                    hasContent={!!(card.monetization?.hasAffiliate || card.monetization?.hasSponsor || card.monetization?.revenue || card.monetization?.sellsProduct)}
                  />
                  {openSections.monetization && (
                    <div className="pl-1 pb-3 space-y-4">
                      <label className="flex items-center space-x-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={card.monetization?.sellsProduct || false}
                          onChange={(e) => updateCardSafe({ monetization: { ...card.monetization, sellsProduct: e.target.checked } })}
                          className="w-4 h-4 text-green-600 rounded border-gray-300"
                        />
                        <span className="text-sm text-gray-700 font-medium">Este video vende un producto/solucion?</span>
                      </label>
                      {card.monetization?.sellsProduct && (
                        <input
                          type="text"
                          value={card.monetization?.productDescription || ''}
                          onChange={(e) => updateCardSafe({ monetization: { ...card.monetization, productDescription: e.target.value } })}
                          placeholder="Describe el producto o solucion..."
                          className="w-full p-2.5 text-sm bg-white border border-gray-200 rounded-lg focus:border-green-500 outline-none"
                        />
                      )}
                      <div className="grid grid-cols-2 gap-3">
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input type="checkbox" checked={card.monetization?.hasAffiliate || false} onChange={(e) => updateCardSafe({ monetization: { ...card.monetization, hasAffiliate: e.target.checked } })} className="w-4 h-4 text-green-600 rounded border-gray-300" />
                          <span className="text-sm text-gray-700">Link afiliado</span>
                        </label>
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input type="checkbox" checked={card.monetization?.hasSponsor || false} onChange={(e) => updateCardSafe({ monetization: { ...card.monetization, hasSponsor: e.target.checked } })} className="w-4 h-4 text-green-600 rounded border-gray-300" />
                          <span className="text-sm text-gray-700">Patrocinador</span>
                        </label>
                      </div>
                      {card.monetization?.hasAffiliate && (
                        <input type="text" value={card.monetization?.affiliateLinks || ''} onChange={(e) => updateCardSafe({ monetization: { ...card.monetization, affiliateLinks: e.target.value } })} placeholder="URLs de afiliados..." className="w-full p-2.5 text-sm bg-white border border-gray-200 rounded-lg focus:border-green-500 outline-none" />
                      )}
                      {card.monetization?.hasSponsor && (
                        <input type="text" value={card.monetization?.sponsorName || ''} onChange={(e) => updateCardSafe({ monetization: { ...card.monetization, sponsorName: e.target.value } })} placeholder="Nombre del patrocinador..." className="w-full p-2.5 text-sm bg-white border border-gray-200 rounded-lg focus:border-green-500 outline-none" />
                      )}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">RPM Estimado ($)</label>
                          <input type="number" step="0.5" value={card.monetization?.estimatedRPM || ''} onChange={(e) => updateCardSafe({ monetization: { ...card.monetization, estimatedRPM: parseFloat(e.target.value) || 0 } })} placeholder="Ej: 8.5" className="w-full p-2 text-sm bg-white border border-gray-200 rounded-lg focus:border-green-500 outline-none" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">Ingresos Reales ($)</label>
                          <input type="number" step="0.01" value={card.monetization?.revenue || ''} onChange={(e) => updateCardSafe({ monetization: { ...card.monetization, revenue: parseFloat(e.target.value) || 0 } })} placeholder="Ej: 150.00" className="w-full p-2 text-sm bg-white border border-gray-200 rounded-lg focus:border-green-500 outline-none" />
                        </div>
                      </div>

                      {/* ─── Deals / Colaboraciones ─────────────────── */}
                      <div className="pt-3 mt-3" style={{ borderTop: '1px solid #e5e7eb' }}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Handshake size={14} className="text-purple-500" />
                            <span className="text-xs font-bold text-gray-700">Colaboraciones / Deals</span>
                          </div>
                          {!isAddingDeal && (
                            <button onClick={() => setIsAddingDeal(true)} className="flex items-center gap-1 text-[11px] font-semibold text-purple-600 hover:text-purple-700">
                              <Plus size={12} /> Añadir
                            </button>
                          )}
                        </div>

                        {/* Existing deals list */}
                        {(card.monetization?.deals || []).map((deal) => {
                          const statusColors: Record<string, string> = { negotiating: 'bg-yellow-100 text-yellow-700', confirmed: 'bg-blue-100 text-blue-700', delivered: 'bg-purple-100 text-purple-700', paid: 'bg-green-100 text-green-700' };
                          const statusLabels: Record<string, string> = { negotiating: 'Negociando', confirmed: 'Confirmado', delivered: 'Entregado', paid: 'Pagado' };
                          const typeLabels: Record<string, string> = { sponsor: 'Sponsor', affiliate: 'Afiliado', collaboration: 'Collab', product: 'Producto' };
                          const nextStatus: Record<string, string> = { negotiating: 'confirmed', confirmed: 'delivered', delivered: 'paid' };
                          return (
                            <div key={deal.id} className="flex items-center gap-2 p-2.5 mb-2 rounded-lg bg-gray-50 border border-gray-100 group">
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 shrink-0">{typeLabels[deal.type]}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-800 truncate">{deal.brand}</p>
                                {deal.notes && <p className="text-[10px] text-gray-500 truncate">{deal.notes}</p>}
                              </div>
                              <span className="text-sm font-bold text-green-600 shrink-0">${deal.amount}</span>
                              <button
                                onClick={() => {
                                  const next = nextStatus[deal.status];
                                  if (!next) return;
                                  const deals = (card.monetization?.deals || []).map(d => d.id === deal.id ? { ...d, status: next as any } : d);
                                  updateCardSafe({ monetization: { ...card.monetization, deals } });
                                }}
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 transition-colors ${statusColors[deal.status]} ${nextStatus[deal.status] ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                                title={nextStatus[deal.status] ? `Avanzar a: ${statusLabels[nextStatus[deal.status]]}` : 'Completado'}
                              >
                                {statusLabels[deal.status]}
                              </button>
                              <button
                                onClick={() => {
                                  const deals = (card.monetization?.deals || []).filter(d => d.id !== deal.id);
                                  updateCardSafe({ monetization: { ...card.monetization, deals } });
                                }}
                                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all shrink-0"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          );
                        })}

                        {/* Total deals */}
                        {(card.monetization?.deals || []).length > 0 && (
                          <div className="flex justify-between text-xs font-bold mt-1 mb-2 px-1" style={{ color: 'var(--ff-text-secondary)' }}>
                            <span>Total deals</span>
                            <span className="text-green-600">
                              ${(card.monetization?.deals || []).reduce((s, d) => s + d.amount, 0).toLocaleString()}
                            </span>
                          </div>
                        )}

                        {/* Add deal form */}
                        {isAddingDeal && (
                          <div className="p-3 rounded-lg bg-purple-50 border border-purple-200 space-y-2 mt-2">
                            <div className="grid grid-cols-2 gap-2">
                              <select
                                value={dealForm.type}
                                onChange={e => setDealForm({ ...dealForm, type: e.target.value as any })}
                                className="p-2 text-xs bg-white border border-gray-200 rounded-lg outline-none"
                              >
                                <option value="sponsor">Sponsor</option>
                                <option value="affiliate">Afiliado</option>
                                <option value="collaboration">Colaboracion</option>
                                <option value="product">Producto</option>
                              </select>
                              <select
                                value={dealForm.status}
                                onChange={e => setDealForm({ ...dealForm, status: e.target.value as any })}
                                className="p-2 text-xs bg-white border border-gray-200 rounded-lg outline-none"
                              >
                                <option value="negotiating">Negociando</option>
                                <option value="confirmed">Confirmado</option>
                                <option value="delivered">Entregado</option>
                                <option value="paid">Pagado</option>
                              </select>
                            </div>
                            <input
                              type="text"
                              value={dealForm.brand}
                              onChange={e => setDealForm({ ...dealForm, brand: e.target.value })}
                              placeholder="Marca o empresa..."
                              className="w-full p-2 text-sm bg-white border border-gray-200 rounded-lg outline-none"
                              autoFocus
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="number"
                                step="0.01"
                                value={dealForm.amount}
                                onChange={e => setDealForm({ ...dealForm, amount: e.target.value })}
                                placeholder="Monto ($)"
                                className="p-2 text-sm bg-white border border-gray-200 rounded-lg outline-none"
                              />
                              <input
                                type="text"
                                value={dealForm.notes}
                                onChange={e => setDealForm({ ...dealForm, notes: e.target.value })}
                                placeholder="Notas (opcional)"
                                className="p-2 text-sm bg-white border border-gray-200 rounded-lg outline-none"
                              />
                            </div>
                            <div className="flex gap-2 pt-1">
                              <button
                                onClick={() => {
                                  if (!dealForm.brand.trim() || !dealForm.amount) return;
                                  const newDeal = {
                                    id: crypto.randomUUID(),
                                    type: dealForm.type,
                                    brand: dealForm.brand.trim(),
                                    amount: parseFloat(dealForm.amount) || 0,
                                    status: dealForm.status,
                                    notes: dealForm.notes.trim() || undefined,
                                  };
                                  const deals = [...(card.monetization?.deals || []), newDeal];
                                  updateCardSafe({ monetization: { ...card.monetization, deals } });
                                  setDealForm({ type: 'sponsor', brand: '', amount: '', status: 'negotiating', notes: '' });
                                  setIsAddingDeal(false);
                                }}
                                disabled={!dealForm.brand.trim() || !dealForm.amount}
                                className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                <Check size={12} /> Guardar
                              </button>
                              <button
                                onClick={() => { setIsAddingDeal(false); setDealForm({ type: 'sponsor', brand: '', amount: '', status: 'negotiating', notes: '' }); }}
                                className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                )}

                {/* ─── Section: Post-Publicacion + CTR ───────────── */}
                {activeWorkspace === 'control' && !isShort && isSectionVisibleForPhase('postpub', phase.name, showAllSections) && (
                  <div ref={postRef} className={`${sectionShellClassName} order-5`} style={sectionShellStyle}>
                    <SectionHead
                      id="postpub"
                      icon={<AlertTriangle size={16} className="text-orange-500" />}
                      title="Ataque al Corazon (Post-Pub)"
                      hasContent={!!card.ctr2Hours || !!card.postPublication?.publishedAt}
                    />
                    {openSections.postpub && (
                      <div className="pl-1 pb-3 space-y-4">
                        {/* H5: CTR with validation */}
                        <div className={`p-4 rounded-lg border ${
                          card.ctr2Hours && parseFloat(card.ctr2Hours) < 4 ? 'bg-red-50 border-red-200' :
                          card.ctr2Hours && parseFloat(card.ctr2Hours) >= 4 ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
                        }`}>
                          <p className="text-xs text-gray-600 mb-2">% de CTR a las 2 horas de publicado:</p>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              max="100"
                              value={card.ctr2Hours || ''}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v === '' || (parseFloat(v) >= 0 && parseFloat(v) <= 100)) {
                                  updateCardSafe({ ctr2Hours: v });
                                }
                              }}
                              placeholder="Ej: 5.2"
                              className="w-24 p-2 text-lg font-bold bg-white border border-gray-300 rounded focus:border-blue-500 outline-none"
                            />
                            <span className="text-gray-600 font-bold">%</span>
                          </div>
                          {card.ctr2Hours && parseFloat(card.ctr2Hours) < 4 && (
                            <p className="mt-2 text-xs font-bold text-red-600">ALERTA: CTR bajo. Cambia miniatura/titulo AHORA!</p>
                          )}
                          {card.ctr2Hours && parseFloat(card.ctr2Hours) >= 4 && (
                            <p className="mt-2 text-xs font-bold text-green-600">CTR Saludable. Manten el impulso.</p>
                          )}
                        </div>

                        {/* Post-pub details */}
                        <div className="space-y-3 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                          <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Fecha/hora de publicacion</label>
                            <input
                              type="datetime-local"
                              value={card.postPublication?.publishedAt || ''}
                              onChange={(e) => updateCardSafe({ postPublication: { ...card.postPublication, publishedAt: e.target.value } })}
                              className="w-full p-2 text-sm bg-white border border-gray-200 rounded-lg focus:border-blue-500 outline-none"
                            />
                          </div>
                          <label className="flex items-center space-x-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={card.postPublication?.commentsResponded || false}
                              onChange={(e) => updateCardSafe({ postPublication: { ...card.postPublication, commentsResponded: e.target.checked } })}
                              className="w-4 h-4 text-blue-600 rounded border-gray-300"
                            />
                            <span className="text-sm text-gray-700">Comentarios respondidos (1a hora)</span>
                          </label>
                          <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Accion tomada</label>
                            <select
                              value={card.postPublication?.actionTaken || 'none'}
                              onChange={(e) => updateCardSafe({ postPublication: { ...card.postPublication, actionTaken: e.target.value as any } })}
                              className="w-full p-2 text-sm bg-white border border-gray-200 rounded-lg focus:border-blue-500 outline-none"
                            >
                              <option value="none">Ninguna</option>
                              <option value="thumbnail">Cambie miniatura</option>
                              <option value="title">Cambie titulo</option>
                              <option value="both">Cambie ambos</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Log de cambios</label>
                            <textarea
                              value={card.postPublication?.actionLog || ''}
                              onChange={(e) => updateCardSafe({ postPublication: { ...card.postPublication, actionLog: e.target.value } })}
                              placeholder="Que cambiaste y por que..."
                              className="w-full h-16 p-2 text-sm bg-white border border-gray-200 rounded-lg focus:border-blue-500 outline-none resize-y"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ─── Section: Checklists ───────────────────────── */}
                {activeWorkspace === 'control' && card.checklists.length > 0 && isSectionVisibleForPhase('checklists', phase.name, showAllSections) && (
                  <div ref={checklistRef} className={`${sectionShellClassName} order-6`} style={sectionShellStyle}>
                    <SectionHead
                      id="checklists"
                      icon={<CheckSquare size={16} className="text-blue-500" />}
                      title={`Checklists (${card.checklists.reduce((a, cl) => a + cl.items.filter(i => i.isCompleted).length, 0)}/${card.checklists.reduce((a, cl) => a + cl.items.length, 0)})`}
                      hasContent={card.checklists.reduce((a, cl) => a + cl.items.filter(i => i.isCompleted).length, 0) === card.checklists.reduce((a, cl) => a + cl.items.length, 0) && card.checklists.reduce((a, cl) => a + cl.items.length, 0) > 0}
                    />
                    {openSections.checklists && (
                      <div className="pl-1 pb-3 space-y-4">
                        {card.checklists.map(checklist => {
                          const done = checklist.items.filter(i => i.isCompleted).length;
                          const total = checklist.items.length;
                          const pct = Math.round((done / total) * 100) || 0;
                          return (
                            <div key={checklist.id} className="space-y-3">
                              <div className="flex items-center space-x-2 text-gray-700 font-semibold">
                                <CheckSquare size={18} />
                                <h3 className="text-sm">{checklist.title}</h3>
                              </div>
                              <div className="flex items-center space-x-3">
                                <span className="text-xs text-gray-500 w-8">{pct}%</span>
                                <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                                  <div className={`h-full transition-all duration-300 ${pct === 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                              <div className="space-y-1.5 pl-6">
                                {checklist.items.map(item => (
                                  <label key={item.id} className="flex items-start space-x-3 cursor-pointer py-1">
                                    <input
                                      type="checkbox"
                                      checked={item.isCompleted}
                                      onChange={() => toggleChecklistItemSafe(checklist.id, item.id)}
                                      className="mt-0.5 w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                    />
                                    <span className={`text-sm leading-tight ${item.isCompleted ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                                      {item.text}
                                    </span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
                )}

                {!isMobile && (
                  <aside className="space-y-2 xl:col-start-2 xl:row-span-2">
                    <div className="sticky top-2 space-y-2">
                      <div className="rounded-2xl border p-4" style={{ borderColor: `var(--ff-border)`, background: `var(--ff-surface-solid)` }}>
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: `var(--ff-text-tertiary)` }}>Formato y señales</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${phase.color} text-white`}>
                            {phase.name}
                          </span>
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${card.contentType === 'short' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                            {card.contentType === 'short' ? 'Short' : 'Largo'}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {LABELS.map(label => {
                            const isActive = card.labels.some(l => l.id === label.id);
                            return (
                              <button
                                key={label.id}
                                onClick={() => toggleLabelSafe(label)}
                                className={`h-7 px-2.5 rounded-lg text-[10px] font-bold transition-all ${
                                  isActive ? 'ring-2 ring-offset-1 ring-gray-300 scale-[1.02]' : 'opacity-60 hover:opacity-100'
                                } ${
                                  label.color === 'red' ? 'bg-red-500 text-white' :
                                  label.color === 'yellow' ? 'bg-yellow-400 text-yellow-900' :
                                  label.color === 'blue' ? 'bg-blue-500 text-white' :
                                  label.color === 'purple' ? 'bg-purple-500 text-white' :
                                  label.color === 'orange' ? 'bg-orange-500 text-white' :
                                  'bg-green-500 text-white'
                                }`}
                                title={label.name}
                              >
                                {label.name}
                              </button>
                            );
                          })}
                        </div>
                        <div className="mt-3 grid gap-2 text-xs" style={{ color: `var(--ff-text-secondary)` }}>
                          <p>Checklist: <strong style={{ color: `var(--ff-text-primary)` }}>{completedChecklists}/{totalChecklists}</strong></p>
                          <p>Responsable: <strong style={{ color: `var(--ff-text-primary)` }}>{card.assignee || 'Sin asignar'}</strong></p>
                          <p>Fecha: <strong style={{ color: `var(--ff-text-primary)` }}>{card.dueDate ? format(parseISO(card.dueDate), "d MMM yyyy", { locale: es }) : 'Sin fecha'}</strong></p>
                          {flowSummary && currentFlowStage && (
                            <p>Etapa: <strong style={{ color: `var(--ff-text-primary)` }}>{currentFlowStage.label}</strong></p>
                          )}
                        </div>
                      </div>

                      <div className="rounded-2xl border p-4" style={{ borderColor: `var(--ff-border)`, background: `var(--ff-surface-solid)` }}>
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: `var(--ff-text-tertiary)` }}>Ir a seccion</p>
                        <div className="mt-3 grid gap-2">
                          {[{ id: 'summary' as const, label: 'Resumen' }, ...visibleJumpSections].map((section) => (
                            <button
                              key={section.id}
                              onClick={() => scrollToSection(section.id)}
                              className="flex min-h-10 items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold"
                              style={{ background: `var(--ff-bg-subtle)`, color: `var(--ff-text-primary)` }}
                            >
                              <span>{section.label}</span>
                              <ChevronRight size={14} />
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </aside>
                )}

              </div>

              {/* ── Full-width bottom: Checklist templates + Delete ── */}
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Añadir checklist:</span>
                    {(Object.keys(CHECKLIST_TEMPLATES) as Array<keyof typeof CHECKLIST_TEMPLATES>).map(template => (
                      <button
                        key={template}
                        onClick={() => addChecklistSafe(template)}
                        disabled={readOnly}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-all"
                      >
                        <CheckSquare size={13} className="text-gray-500" />
                        <span>{template}</span>
                      </button>
                    ))}
                  </div>
                  {!readOnly && (
                    <button
                      onClick={() => {
                        if (isConfirmingDelete) {
                          deleteCardSafe();
                          onClose();
                        } else {
                          setIsConfirmingDelete(true);
                          setTimeout(() => setIsConfirmingDelete(false), 3000);
                        }
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                        isConfirmingDelete ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-red-50 text-red-600 hover:bg-red-100'
                      }`}
                    >
                      <Trash2 size={13} />
                      <span>{isConfirmingDelete ? 'Confirmar' : 'Eliminar'}</span>
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  function renderGuidedCardModal() {
    return (
      <div className="fixed inset-x-0 bottom-0 z-40 ff-fade-in sm:px-5 sm:pb-5" style={{ top: `${headerOffset}px` }} onClick={onClose}>
        <div
          className="ff-card-modal flex h-full w-full flex-col overflow-hidden shadow-xl ff-scale-in sm:rounded-[2.1rem] sm:border"
          style={{ background: `var(--ff-surface-muted)`, borderColor: `var(--ff-border-medium)` }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3 shrink-0 sm:px-5" style={{ borderBottom: `1px solid var(--ff-border-medium)`, background: `var(--ff-surface-solid)` }}>
            <div className="flex min-w-0 items-center gap-2.5">
              <span className={`text-[11px] font-bold text-white px-2.5 py-1 rounded-full shrink-0 ${phase.color}`}>
                {phase.name}
              </span>
              <span className="rounded-full px-2.5 py-1 text-[11px] font-bold uppercase shrink-0" style={{ background: `color-mix(in srgb, var(--ff-primary) 14%, var(--ff-surface-solid))`, color: `var(--ff-primary)` }}>
                {card.contentType === 'short' ? 'Short' : 'Largo'}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold" style={{ color: `var(--ff-text-primary)` }}>{card.title}</p>
                <p className="text-[11px]" style={{ color: `var(--ff-text-secondary)` }}>Tarjeta guiada sincronizada con la guia</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-full transition-colors shrink-0" style={{ color: `var(--ff-text-tertiary)` }} title="Cerrar (Esc)">
              <X size={20} />
            </button>
          </div>

          {aiNotice && (
            <div className="flex items-center gap-2 px-5 py-2 shrink-0" style={{ background: `var(--ff-warning-bg)`, borderBottom: `1px solid var(--ff-warning-border)` }}>
              <AlertTriangle size={14} className="shrink-0" />
              <span className="flex-1 text-sm" style={{ color: `var(--ff-warning-text)` }}>{aiNotice}</span>
              <button onClick={() => setAiNotice(null)} className="p-0.5" style={{ color: `var(--ff-warning-text)` }}>
                <X size={14} />
              </button>
            </div>
          )}

          {readOnly && (
            <div className="px-5 py-2 shrink-0" style={{ background: `var(--ff-surface-raised)`, borderBottom: `1px solid var(--ff-border)` }}>
              <span className="text-xs font-medium" style={{ color: `var(--ff-text-secondary)` }}>
                Estas viendo la tarjeta en modo solo lectura. Puedes revisar contenido, pero no editarlo con tu rol actual.
              </span>
            </div>
          )}

          <div ref={guidedBodyRef} className="ff-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
            <GuidedCardWorkspace
              card={card}
              onClose={onClose}
              initialLocation={guidedInitialLocation}
              scrollContainerRef={guidedBodyRef}
              phaseName={phase.name}
              phaseAction={phase.action}
              currentFlowStage={currentFlowStage}
              flowSummary={flowSummary}
              flowWorkingDaysLabel={flowWorkingDaysLabel}
              flowScheduleLabel={flowScheduleLabel}
              flowScheduleChipStyle={flowScheduleChipStyle}
              completedChecklists={completedChecklists}
              totalChecklists={totalChecklists}
              suggestedTitle={suggestedTitle}
              isImprovingTitle={isImprovingTitle}
              onImproveTitle={handleImproveTitle}
              onAcceptSuggestedTitle={() => {
                if (!suggestedTitle) return;
                updateCardSafe({ title: suggestedTitle });
                setSuggestedTitle(null);
              }}
              onDismissSuggestedTitle={() => setSuggestedTitle(null)}
              readOnly={readOnly}
              onUpdateCard={updateCardSafe}
              onToggleLabel={toggleLabelSafe}
              productionBrief={productionBrief}
              onUpdateProductionBrief={updateProductionBriefSafe}
              seededTitles={seededTitles}
              hasSeededPackage={hasSeededPackage}
              onStageStatusChange={handleStageStatusChange}
              onStageDueAtChange={handleStageDueAtChange}
              onStageNotesChange={handleStageNotesChange}
              suggestedFlowColumnTitle={suggestedFlowColumn?.listTitle ?? null}
              onMoveToSuggestedColumn={handleMoveToSuggestedColumn}
              onToggleChecklistItem={toggleChecklistItemSafe}
              onAddChecklist={addChecklistSafe}
              onDeleteCard={deleteCardSafe}
              getFlowToneStyle={getFlowToneStyle}
              flowPrimaryActionStyle={flowPrimaryActionStyle}
              flowBrandActionStyle={flowBrandActionStyle}
              flowDangerActionStyle={flowDangerActionStyle}
              formatDateTime={formatDateTime}
              formatDateTimeInput={formatDateTimeInput}
            />
          </div>
        </div>
      </div>
    );
  }

  if (typeof document === 'undefined') return null;

  return (
    <>
      {createPortal(modalContent, document.body)}
      {showTeleprompter && card.guion && (
        <TeleprompterOverlay script={card.guion} onClose={() => setShowTeleprompter(false)} />
      )}
    </>
  );
}

/* ── Helper components for YouTube Export ─────────────── */

function ExportField({ label, value, copiedField, onCopy, fieldKey, multiline }: {
  label: string; value: string; copiedField: string | null; onCopy: () => void; fieldKey: string; multiline?: boolean;
}) {
  if (!value) return (
    <div className="flex items-center gap-2 p-3 rounded-lg border border-dashed" style={{ background: `var(--ff-surface-muted)`, borderColor: `var(--ff-border-strong)` }}>
      <span className="text-xs" style={{ color: `var(--ff-text-tertiary)` }}>{label}: No definido</span>
    </div>
  );
  return (
    <div className="rounded-lg border overflow-hidden" style={{ background: `var(--ff-surface-muted)`, borderColor: `var(--ff-border-medium)` }}>
      <div className="flex items-center justify-between px-3 py-1.5" style={{ borderBottom: `1px solid var(--ff-border)`, background: `var(--ff-surface-raised)` }}>
        <span className="text-[10px] font-bold uppercase" style={{ color: `var(--ff-text-tertiary)` }}>{label}</span>
        <button
          onClick={onCopy}
          className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded transition-all ${
            copiedField === fieldKey ? 'bg-green-500 text-white' : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50'
          }`}
        >
          {copiedField === fieldKey ? <><Check size={10} /> Copiado</> : <><Copy size={10} /> Copiar</>}
        </button>
      </div>
      <div className="px-3 py-2">
        <p className={`text-xs ${multiline ? 'ff-scrollbar whitespace-pre-wrap max-h-32 overflow-y-auto' : 'truncate'}`} style={{ color: `var(--ff-text-secondary)` }}>{value}</p>
      </div>
    </div>
  );
}

function ReadinessItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${ok ? 'bg-green-500' : 'bg-gray-200'}`}>
        {ok && <Check size={10} className="text-white" />}
      </div>
      <span className="text-xs" style={{ color: ok ? `var(--ff-text-secondary)` : `var(--ff-text-tertiary)` }}>{label}</span>
    </div>
  );
}



