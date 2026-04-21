import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { useRef, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CheckCircle2, Hand, ArrowRightLeft, X, Sparkles, Clapperboard, SlidersHorizontal, Rows3, Focus, LayoutGrid, Crosshair } from 'lucide-react';
import { useBoard } from '../store';
import { List } from './List';
import { ContentFilter, AssigneeFilter } from './FilterBar';
import { CardData, List as ListType, BoardDensity, CardMetaMode, DesktopBoardLayoutPrefs } from '../types';
import { CustomScrollbar } from './CustomScrollbar';
import { useIsMobile } from '../hooks/useIsMobile';
import { NewVideoWizard } from './NewVideoWizard';
import { getProductionFlowSummary } from '../lib/optimizedVideoFlow';

interface BoardProps {
  contentFilter?: ContentFilter;
  assigneeFilter?: AssigneeFilter;
  onContentFilterChange?: (filter: ContentFilter) => void;
  onAssigneeFilterChange?: (filter: AssigneeFilter) => void;
}

function getMobileBoardKey(boardId: string) {
  return `ff-mobile-list-${boardId}`;
}

function getMobileOnboardingKey(boardId: string) {
  return `ff-mobile-board-onboarding-${boardId}`;
}

function getDesktopPrefsKey(boardId: string, uid?: string | null) {
  return `ff-board-desktop-ui:${uid || 'anon'}:${boardId}`;
}

function formatAssigneeChip(value: string) {
  if (value === 'T\u00c3\u00ba' || value === 'T\u00fa') return 'Creador';
  return value;
}

function matchesAssigneeFilter(cardAssignee: string | null, filter: AssigneeFilter) {
  if (filter === 'all') return true;
  const normalized = cardAssignee === 'T\u00c3\u00ba' || cardAssignee === 'T\u00fa' ? 'Creador' : cardAssignee;
  return normalized === filter;
}

function densityLabel(value: BoardDensity) {
  if (value === 'compact') return 'Compacto';
  if (value === 'focus') return 'Enfoque';
  return 'Comodo';
}

function metaLabel(value: CardMetaMode) {
  return value === 'essential' ? 'Esencial' : 'Completa';
}

export function Board({
  contentFilter = 'all',
  assigneeFilter = 'all',
  onContentFilterChange,
  onAssigneeFilterChange,
}: BoardProps) {
  const { board, moveCard, saveState, canEditBoard, currentUserRole, user } = useBoard();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const listAnchorRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const viewMenuRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const [mobileListId, setMobileListId] = useState<string | null>(null);
  const [moveCardTarget, setMoveCardTarget] = useState<CardData | null>(null);
  const [mobileToast, setMobileToast] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isNewVideoWizardOpen, setIsNewVideoWizardOpen] = useState(false);
  const [density, setDensity] = useState<BoardDensity>('compact');
  const [cardMetaMode, setCardMetaMode] = useState<CardMetaMode>('essential');
  const [showBoardSummary, setShowBoardSummary] = useState(false);
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [desktopActiveListId, setDesktopActiveListId] = useState<string | null>(null);

  useEffect(() => {
    if (!board || !isMobile) return;

    const storedListId = localStorage.getItem(getMobileBoardKey(board.id));
    const nextListId = storedListId && board.lists.some((list) => list.id === storedListId)
      ? storedListId
      : board.lists[0]?.id || null;

    setMobileListId(nextListId);
    setShowOnboarding(localStorage.getItem(getMobileOnboardingKey(board.id)) !== 'dismissed');
  }, [board?.id, board?.lists, isMobile]);

  useEffect(() => {
    if (!board || isMobile) return;

    try {
      const raw = localStorage.getItem(getDesktopPrefsKey(board.id, user?.uid));
      if (!raw) {
        setDensity('compact');
        setCardMetaMode('essential');
        setShowBoardSummary(false);
        return;
      }

      const parsed = JSON.parse(raw) as Partial<DesktopBoardLayoutPrefs>;
      setDensity(parsed.density === 'comfortable' || parsed.density === 'focus' ? parsed.density : 'compact');
      setCardMetaMode(parsed.cardMetaMode === 'full' ? 'full' : 'essential');
      setShowBoardSummary(parsed.showBoardSummary === true);
    } catch {
      setDensity('compact');
      setCardMetaMode('essential');
      setShowBoardSummary(false);
    }
  }, [board?.id, isMobile, user?.uid]);

  useEffect(() => {
    if (!board || isMobile) return;

    localStorage.setItem(
      getDesktopPrefsKey(board.id, user?.uid),
      JSON.stringify({ density, cardMetaMode, showBoardSummary, openRailPanel: null })
    );
  }, [board?.id, cardMetaMode, density, isMobile, showBoardSummary, user?.uid]);

  useEffect(() => {
    if (!board || isMobile) return;
    setDesktopActiveListId((previous) => (
      previous && board.lists.some((list) => list.id === previous)
        ? previous
        : board.lists[0]?.id || null
    ));
  }, [board?.id, board?.lists, isMobile]);

  useEffect(() => {
    if (!mobileToast) return undefined;

    const timer = window.setTimeout(() => {
      setMobileToast(null);
    }, 2200);

    return () => window.clearTimeout(timer);
  }, [mobileToast]);

  useEffect(() => {
    if (isMobile) return undefined;

    const openWizard = () => setIsNewVideoWizardOpen(true);
    window.addEventListener('ff-open-new-video', openWizard);

    return () => {
      window.removeEventListener('ff-open-new-video', openWizard);
    };
  }, [isMobile]);

  useEffect(() => {
    if (isMobile || !isViewMenuOpen) return undefined;

    const handlePointerDown = (event: MouseEvent) => {
      if (!viewMenuRef.current?.contains(event.target as Node)) {
        setIsViewMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [isMobile, isViewMenuOpen]);

  if (!board) {
    return (
      <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-100 to-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-200 border-t-blue-600"></div>
      </div>
    );
  }

  const filterCard = (card: CardData): boolean => {
    if (contentFilter !== 'all' && card.contentType !== contentFilter) return false;
    if (!matchesAssigneeFilter(card.assignee, assigneeFilter)) return false;
    return true;
  };

  const saveLabel = saveState === 'saving'
    ? 'Guardando'
    : saveState === 'saved'
    ? 'Guardado'
    : saveState === 'error'
    ? 'Error al guardar'
    : null;
  const saveBadgeStyle = saveState === 'error'
    ? { background: `var(--ff-danger-bg)`, color: `var(--ff-danger-text)` }
    : saveState === 'saved'
    ? { background: `var(--ff-success-bg)`, color: `var(--ff-success-text)` }
    : { background: `var(--ff-warning-bg)`, color: `var(--ff-warning-text)` };
  const readonlyBadgeStyle = {
    background: `var(--ff-surface-raised)`,
    border: `1px solid var(--ff-border)`,
    color: `var(--ff-text-secondary)`,
  };

  const activeFilterChips = [
    contentFilter !== 'all' ? `Tipo: ${contentFilter === 'long' ? 'Largos' : 'Shorts'}` : null,
    assigneeFilter !== 'all' ? `Responsable: ${formatAssigneeChip(assigneeFilter)}` : null,
  ].filter(Boolean) as string[];

  const visibleCardsCount = Object.values(board.cards).filter(filterCard).length;
  const guidedCards = Object.values(board.cards).filter((card) => !!card.productionFlow);
  const activeDesktopList = board.lists.find((list) => list.id === desktopActiveListId) || board.lists[0];
  const activeDesktopListIndex = board.lists.findIndex((list) => list.id === activeDesktopList?.id);
  const visibleInActiveDesktopList = activeDesktopList
    ? activeDesktopList.cardIds
        .map((cardId) => board.cards[cardId])
        .filter((card): card is CardData => !!card && filterCard(card)).length
    : 0;
  const blockedFlowCount = guidedCards.filter((card) => {
    const summary = getProductionFlowSummary(card, board);
    return summary?.scheduleStatus === 'blocked';
  }).length;
  const overdueFlowCount = guidedCards.filter((card) => {
    const summary = getProductionFlowSummary(card, board);
    return !!summary?.isOverdueByBudget;
  }).length;

  const onDragEnd = (result: DropResult) => {
    if (!canEditBoard) return;
    const { destination, source, draggableId } = result;

    if (!destination) return;

    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    moveCard(
      source.droppableId,
      destination.droppableId,
      source.index,
      destination.index,
      draggableId
    );
  };

  const scrollToList = (listId: string) => {
    const nextTarget = listAnchorRefs.current[listId];
    if (!nextTarget) return;
    setDesktopActiveListId(listId);
    nextTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  };

  useEffect(() => {
    if (isMobile || !board || !scrollContainerRef.current) return undefined;

    const container = scrollContainerRef.current;

    const syncActiveList = () => {
      const containerCenter = container.scrollLeft + container.clientWidth / 2;
      let bestListId = board.lists[0]?.id || null;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (const list of board.lists) {
        const node = listAnchorRefs.current[list.id];
        if (!node) continue;
        const center = node.offsetLeft + node.offsetWidth / 2;
        const distance = Math.abs(center - containerCenter);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestListId = list.id;
        }
      }

      setDesktopActiveListId(bestListId);
    };

    syncActiveList();
    container.addEventListener('scroll', syncActiveList, { passive: true });
    window.addEventListener('resize', syncActiveList);

    return () => {
      container.removeEventListener('scroll', syncActiveList);
      window.removeEventListener('resize', syncActiveList);
    };
  }, [board, isMobile]);

  if (!isMobile) {
    return (
      <>
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="relative flex h-full flex-col overflow-hidden" style={{ background: `linear-gradient(180deg, var(--ff-bg-board-from), color-mix(in srgb, var(--ff-bg-board-via) 84%, var(--ff-bg)))` }}>
            <div className="shrink-0 border-b backdrop-blur-sm" style={{ background: `color-mix(in srgb, var(--ff-surface-solid) 94%, transparent)`, borderColor: `var(--ff-border)` }}>
              <div className="px-4 py-2.5 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="inline-flex min-h-9 items-center rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ borderColor: `var(--ff-border)`, background: `var(--ff-surface-solid)`, color: `var(--ff-text-primary)` }}>
                      <Crosshair size={12} className="mr-1.5" />
                      {activeDesktopList?.title || 'Sin columna'}
                    </span>
                    <span className="inline-flex min-h-9 items-center rounded-full border px-3 py-1 text-[11px] font-semibold" style={{ borderColor: `var(--ff-border)`, background: `var(--ff-surface-solid)`, color: `var(--ff-text-secondary)` }}>
                      {visibleInActiveDesktopList} visibles
                    </span>
                    <span
                      className="inline-flex min-h-9 items-center rounded-full border px-3 py-1 text-[11px] font-semibold"
                      style={{
                        borderColor: blockedFlowCount > 0
                          ? `color-mix(in srgb, var(--ff-danger-text) 24%, var(--ff-border))`
                          : overdueFlowCount > 0
                          ? `color-mix(in srgb, var(--ff-warning-text) 32%, var(--ff-border))`
                          : `var(--ff-border)`,
                        background: blockedFlowCount > 0
                          ? `var(--ff-danger-bg)`
                          : overdueFlowCount > 0
                          ? `var(--ff-warning-bg)`
                          : `var(--ff-surface-solid)`,
                        color: blockedFlowCount > 0
                          ? `var(--ff-danger-text)`
                          : overdueFlowCount > 0
                          ? `var(--ff-warning-text)`
                          : `var(--ff-text-secondary)`,
                      }}
                    >
                      {blockedFlowCount > 0 ? `${blockedFlowCount} bloqueadas` : overdueFlowCount > 0 ? `${overdueFlowCount} atrasadas` : 'Sin riesgos'}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
                    {saveLabel && (
                      <span className="rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em]" style={saveBadgeStyle}>
                        {saveLabel}
                      </span>
                    )}
                    {!canEditBoard && (
                      <span className="rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em]" style={readonlyBadgeStyle}>
                        Solo lectura ({currentUserRole === 'viewer' ? 'viewer' : 'miembro'})
                      </span>
                    )}
                    {canEditBoard && (
                      <button
                        onClick={() => setIsNewVideoWizardOpen(true)}
                        className="flex min-h-10 shrink-0 items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold text-white"
                        style={{ background: `linear-gradient(135deg, var(--ff-primary), color-mix(in srgb, var(--ff-primary) 72%, #4338ca))` }}
                      >
                        <Sparkles size={15} />
                        Nuevo video
                      </button>
                    )}
                    <div className="relative" ref={viewMenuRef}>
                      <button
                        onClick={() => setIsViewMenuOpen((previous) => !previous)}
                        className="flex min-h-10 items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold"
                        style={{ borderColor: `var(--ff-border)`, background: `var(--ff-surface-solid)`, color: `var(--ff-text-primary)` }}
                      >
                        <Rows3 size={15} />
                        Vista
                      </button>

                      {isViewMenuOpen && (
                        <div className="absolute right-0 z-20 mt-2 w-72 rounded-[1.35rem] border p-3 shadow-2xl" style={{ borderColor: `var(--ff-border)`, background: `var(--ff-surface-solid)` }}>
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: `var(--ff-text-tertiary)` }}>Vista del tablero</p>
                              <p className="mt-1 text-xs" style={{ color: `var(--ff-text-secondary)` }}>Ajusta densidad, metadata y el resumen superior.</p>
                            </div>
                            <span className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase" style={{ background: `var(--ff-bg-subtle)`, color: `var(--ff-text-secondary)` }}>
                              {densityLabel(density)}
                            </span>
                          </div>

                          <div className="mt-3 rounded-[1rem] border p-1" style={{ borderColor: `var(--ff-border)`, background: `var(--ff-bg-subtle)` }}>
                            <div className="flex items-center gap-1">
                              {[
                                { value: 'compact' as const, label: 'Compacto', icon: <Rows3 size={14} /> },
                                { value: 'focus' as const, label: 'Enfoque', icon: <Focus size={14} /> },
                                { value: 'comfortable' as const, label: 'Comodo', icon: <LayoutGrid size={14} /> },
                              ].map((option) => (
                                <button
                                  key={option.value}
                                  onClick={() => setDensity(option.value)}
                                  className="flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-semibold transition-all"
                                  style={density === option.value
                                    ? { background: `var(--ff-surface-solid)`, color: `var(--ff-text-primary)`, boxShadow: `var(--ff-shadow-sm)` }
                                    : { color: `var(--ff-text-secondary)` }}
                                >
                                  {option.icon}
                                  {option.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          <button
                            onClick={() => setCardMetaMode((previous) => previous === 'full' ? 'essential' : 'full')}
                            className="mt-3 flex min-h-10 w-full items-center justify-between rounded-[1rem] border px-3 py-2 text-sm font-semibold"
                            style={{ borderColor: `var(--ff-border)`, background: `var(--ff-bg-subtle)`, color: `var(--ff-text-primary)` }}
                          >
                            <span>Meta de las cards</span>
                            <span className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase" style={{ background: `var(--ff-surface-solid)`, color: `var(--ff-text-secondary)` }}>
                              {metaLabel(cardMetaMode)}
                            </span>
                          </button>

                          <button
                            onClick={() => setShowBoardSummary((previous) => !previous)}
                            className="mt-2 flex min-h-10 w-full items-center justify-between rounded-[1rem] border px-3 py-2 text-sm font-semibold"
                            style={{ borderColor: `var(--ff-border)`, background: `var(--ff-bg-subtle)`, color: `var(--ff-text-primary)` }}
                          >
                            <span>Resumen superior</span>
                            <span className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase" style={{ background: `var(--ff-surface-solid)`, color: showBoardSummary ? `var(--ff-primary)` : `var(--ff-text-secondary)` }}>
                              {showBoardSummary ? 'Visible' : 'Oculto'}
                            </span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {showBoardSummary && (
                  <div className="mt-3 grid gap-3 lg:grid-cols-4">
                    {[
                      { label: 'Cards visibles', value: String(visibleCardsCount), note: activeFilterChips.length > 0 ? activeFilterChips.join(' · ') : 'sin filtros activos' },
                      { label: 'Columna activa', value: activeDesktopList?.title || 'Sin columna', note: `${activeDesktopListIndex + 1} de ${board.lists.length} · ${visibleInActiveDesktopList} visibles` },
                      { label: 'Riesgos', value: blockedFlowCount > 0 ? `${blockedFlowCount} bloqueadas` : overdueFlowCount > 0 ? `${overdueFlowCount} atrasadas` : 'Sin riesgos', note: blockedFlowCount > 0 ? 'requieren destrabe o reasignacion' : overdueFlowCount > 0 ? 'hay entregables fuera de presupuesto' : 'sin alertas operativas fuertes' },
                      { label: 'Flujos guiados', value: String(guidedCards.length), note: `${densityLabel(density)} · Meta ${metaLabel(cardMetaMode)}` },
                    ].map((item) => (
                      <div key={item.label} className="rounded-[1.2rem] border p-3.5" style={{ borderColor: `var(--ff-border)`, background: `var(--ff-surface-solid)` }}>
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: `var(--ff-text-tertiary)` }}>{item.label}</p>
                        <p className="mt-1.5 text-base font-black" style={{ color: `var(--ff-text-primary)` }}>{item.value}</p>
                        <p className="mt-1.5 text-xs leading-5" style={{ color: `var(--ff-text-secondary)` }}>{item.note}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-3 rounded-[1.4rem] border p-3" style={{ borderColor: `var(--ff-border)`, background: `var(--ff-surface-muted)` }}>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <div className="rounded-[1.1rem] border p-1" style={{ borderColor: `var(--ff-border)`, background: `var(--ff-bg-subtle)` }}>
                      <div className="flex items-center gap-1">
                        {[
                          { value: 'all' as const, label: 'Todos' },
                          { value: 'long' as const, label: 'Largos' },
                          { value: 'short' as const, label: 'Shorts' },
                        ].map((option) => (
                          <button
                            key={option.value}
                            onClick={() => onContentFilterChange?.(option.value)}
                            className="min-h-9 rounded-xl px-3 py-2 text-xs font-semibold transition-all"
                            style={contentFilter === option.value
                              ? { background: `var(--ff-surface-solid)`, color: `var(--ff-text-primary)`, boxShadow: `var(--ff-shadow-sm)` }
                              : { color: `var(--ff-text-secondary)` }}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <label className="flex min-h-11 items-center gap-2 rounded-[1.1rem] border px-3 py-2 text-xs font-semibold" style={{ borderColor: `var(--ff-border)`, background: `var(--ff-surface-solid)`, color: `var(--ff-text-secondary)` }}>
                      <SlidersHorizontal size={14} />
                      Responsable
                      <select
                        value={assigneeFilter}
                        onChange={(event) => onAssigneeFilterChange?.(event.target.value as AssigneeFilter)}
                        className="bg-transparent outline-none text-xs font-semibold"
                        style={{ color: `var(--ff-text-primary)` }}
                      >
                        <option value="all">Todos</option>
                        <option value="Creador">Creador</option>
                        <option value="Editor">Editor</option>
                        <option value="Asistente">Asistente</option>
                      </select>
                    </label>

                    <div className="flex flex-wrap items-center gap-2">
                      {activeFilterChips.length > 0 ? activeFilterChips.map((chip) => (
                        <span key={chip} className="rounded-full px-3 py-1 text-[11px] font-semibold" style={{ background: `color-mix(in srgb, var(--ff-primary) 10%, transparent)`, color: `var(--ff-primary)` }}>
                          {chip}
                        </span>
                      )) : (
                        <span className="rounded-full px-3 py-1 text-[11px] font-semibold" style={{ background: `var(--ff-surface-solid)`, color: `var(--ff-text-tertiary)` }}>
                          Sin filtros activos
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={() => activeDesktopListIndex > 0 && scrollToList(board.lists[activeDesktopListIndex - 1].id)}
                      disabled={activeDesktopListIndex <= 0}
                      className="flex h-10 w-10 items-center justify-center rounded-2xl disabled:opacity-40"
                      style={{ background: `var(--ff-surface-solid)`, border: `1px solid var(--ff-border)` }}
                    >
                      <ChevronLeft size={16} />
                    </button>

                    <div className="min-w-0 flex-1 overflow-x-auto no-scrollbar">
                      <div className="flex min-w-max gap-2">
                        {board.lists.map((list) => {
                          const visibleInList = list.cardIds
                            .map((cardId) => board.cards[cardId])
                            .filter((card): card is CardData => !!card && filterCard(card)).length;
                          const isActive = list.id === activeDesktopList?.id;

                          return (
                            <button
                              key={list.id}
                              onClick={() => scrollToList(list.id)}
                              className="flex min-h-10 items-center gap-2 rounded-[1rem] border px-3 py-2 text-left transition-all hover:-translate-y-0.5"
                              style={isActive
                                ? { borderColor: `color-mix(in srgb, var(--ff-primary) 36%, var(--ff-border))`, background: `color-mix(in srgb, var(--ff-primary) 14%, var(--ff-surface-solid))` }
                                : { borderColor: `var(--ff-border)`, background: `var(--ff-surface-solid)` }}
                            >
                              <span className="text-sm font-semibold" style={{ color: `var(--ff-text-primary)` }}>{list.title}</span>
                              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums" style={{ background: isActive ? `color-mix(in srgb, var(--ff-primary) 16%, transparent)` : `var(--ff-bg-subtle)`, color: isActive ? `var(--ff-primary)` : `var(--ff-text-secondary)` }}>
                                {visibleInList}
                              </span>
                              {isActive && (
                                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ background: `var(--ff-surface-solid)`, color: `var(--ff-primary)` }}>
                                  Activa
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <button
                      onClick={() => activeDesktopListIndex < board.lists.length - 1 && scrollToList(board.lists[activeDesktopListIndex + 1].id)}
                      disabled={activeDesktopListIndex >= board.lists.length - 1}
                      className="flex h-10 w-10 items-center justify-center rounded-2xl disabled:opacity-40"
                      style={{ background: `var(--ff-surface-solid)`, border: `1px solid var(--ff-border)` }}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-hidden px-3 pb-3 pt-2 sm:px-4 sm:pb-4">
              <div
                ref={scrollContainerRef}
                className={`no-scrollbar flex h-full overflow-x-auto overflow-y-hidden ${density === 'comfortable' ? 'space-x-3' : density === 'compact' ? 'space-x-2' : 'space-x-2.5'} px-1 py-1`}
                style={{ background: `linear-gradient(135deg, var(--ff-bg-board-from), var(--ff-bg-board-via), var(--ff-bg-board-to))` }}
              >
                {board.lists.map((list, index) => (
                  <div key={list.id} ref={(node) => { listAnchorRefs.current[list.id] = node; }} className="shrink-0">
                    <List
                      list={list}
                      listIndex={index}
                      totalLists={board.lists.length}
                      isActiveDesktop={list.id === activeDesktopList?.id}
                      filterCard={filterCard}
                      canEdit={canEditBoard}
                      density={density}
                      cardMetaMode={cardMetaMode}
                    />
                  </div>
                ))}
              </div>
              <CustomScrollbar containerRef={scrollContainerRef} />
            </div>
          </div>
        </DragDropContext>
        <NewVideoWizard isOpen={isNewVideoWizardOpen} onClose={() => setIsNewVideoWizardOpen(false)} />
      </>
    );
  }
  const activeList = board.lists.find((list) => list.id === mobileListId) || board.lists[0];
  const activeListIndex = board.lists.findIndex((list) => list.id === activeList?.id);
  const visibleCount = activeList ? activeList.cardIds.map((cardId) => board.cards[cardId]).filter((card): card is CardData => !!card && filterCard(card)).length : 0;

  const setActiveList = (list: ListType) => {
    setMobileListId(list.id);
    localStorage.setItem(getMobileBoardKey(board.id), list.id);
  };

  const moveCardOptions = useMemo(() => board.lists, [board.lists]);

  const handleMoveCard = (nextListId: string) => {
    if (!moveCardTarget || !canEditBoard) return;
    const destinationList = board.lists.find((list) => list.id === nextListId);
    if (!destinationList) return;

    moveCard(moveCardTarget.listId, nextListId, 0, destinationList.cardIds.length, moveCardTarget.id);
    setActiveList(destinationList);
    setMoveCardTarget(null);
    setMobileToast(`Movido a ${destinationList.title}`);
  };

  const dismissOnboarding = () => {
    setShowOnboarding(false);
    localStorage.setItem(getMobileOnboardingKey(board.id), 'dismissed');
  };

  return (
    <div className="relative h-full overflow-y-auto ff-scrollbar" style={{ background: `linear-gradient(180deg, var(--ff-bg-board-from), var(--ff-bg-board-via))` }}>
      <div className="sticky top-0 z-20 px-3 pt-3 pb-2 border-b backdrop-blur-sm" style={{ borderColor: `var(--ff-border)`, background: `color-mix(in srgb, var(--ff-surface-solid) 92%, transparent)` }}>
        {canEditBoard && (
          <button
            onClick={() => setIsNewVideoWizardOpen(true)}
            className="mb-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-white"
            style={{ background: `linear-gradient(135deg, var(--ff-primary), color-mix(in srgb, var(--ff-primary) 72%, #4338ca))` }}
          >
            <Clapperboard size={15} />
            Nuevo video guiado
          </button>
        )}

        {showOnboarding && (
          <div className="mb-3 rounded-2xl border p-3" style={{ background: `var(--ff-surface-solid)`, borderColor: `var(--ff-border)` }}>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: `color-mix(in srgb, var(--ff-primary) 12%, transparent)`, color: `var(--ff-primary)` }}>
                <Hand size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold" style={{ color: `var(--ff-text-primary)` }}>Modo movil listo para trabajar</p>
                <p className="text-xs mt-1" style={{ color: `var(--ff-text-secondary)` }}>Cambia de columna con las flechas, mueve tarjetas con el boton Mover y abre Guia o Mas desde la barra inferior.</p>
              </div>
              <button onClick={dismissOnboarding} className="p-1 rounded-lg" style={{ color: `var(--ff-text-tertiary)` }}>
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={() => activeListIndex > 0 && setActiveList(board.lists[activeListIndex - 1])}
            disabled={activeListIndex <= 0}
            className="w-10 h-10 rounded-2xl flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: `var(--ff-surface-solid)`, border: `1px solid var(--ff-border)` }}
          >
            <ChevronLeft size={18} />
          </button>

          <div className="flex-1 rounded-2xl px-3 py-2.5 text-center" style={{ background: `var(--ff-surface-solid)`, border: `1px solid var(--ff-border)` }}>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: `var(--ff-text-tertiary)` }}>
              Columna activa
            </p>
            <h2 className="text-base font-bold mt-1 truncate" style={{ color: `var(--ff-text-primary)` }}>{activeList?.title}</h2>
            <p className="text-[11px] mt-1" style={{ color: `var(--ff-text-secondary)` }}>
              {activeListIndex + 1} de {board.lists.length} · {visibleCount} visible{visibleCount === 1 ? '' : 's'}
            </p>
          </div>

          <button
            onClick={() => activeListIndex < board.lists.length - 1 && setActiveList(board.lists[activeListIndex + 1])}
            disabled={activeListIndex >= board.lists.length - 1}
            className="w-10 h-10 rounded-2xl flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: `var(--ff-surface-solid)`, border: `1px solid var(--ff-border)` }}
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="mt-2 flex gap-2 overflow-x-auto no-scrollbar">
          {!canEditBoard && (
            <span className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={readonlyBadgeStyle}>
              Solo lectura ({currentUserRole === 'viewer' ? 'viewer' : 'miembro'})
            </span>
          )}
          {saveLabel && (
            <span className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={saveBadgeStyle}>
              {saveLabel}
            </span>
          )}
          {activeFilterChips.length > 0 ? activeFilterChips.map((chip) => (
            <span key={chip} className="shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ background: `var(--ff-bg-subtle)`, color: `var(--ff-text-secondary)` }}>
              {chip}
            </span>
          )) : (
            <span className="shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ background: `var(--ff-bg-subtle)`, color: `var(--ff-text-tertiary)` }}>
              Sin filtros activos
            </span>
          )}
        </div>
      </div>

      <div className="p-3 pb-24">
        {activeList && (
          <List list={activeList} filterCard={filterCard} mobileMode canEdit={canEditBoard} onMoveRequest={setMoveCardTarget} />
        )}
      </div>

      {moveCardTarget && canEditBoard && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center" onClick={() => setMoveCardTarget(null)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="relative w-full rounded-t-[1.75rem] border-t p-4 ff-slide-up sm:max-w-sm sm:rounded-3xl sm:border" style={{ background: `var(--ff-surface-solid)`, borderColor: `var(--ff-border)` }} onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: `var(--ff-text-tertiary)` }}>Mover tarjeta</p>
                <h3 className="text-base font-bold mt-1" style={{ color: `var(--ff-text-primary)` }}>{moveCardTarget.title}</h3>
              </div>
              <button onClick={() => setMoveCardTarget(null)} className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: `var(--ff-bg-subtle)` }}>
                <X size={16} />
              </button>
            </div>
            <div className="space-y-2">
              {moveCardOptions.map((list) => {
                const isCurrent = list.id === moveCardTarget.listId;
                return (
                  <button
                    key={list.id}
                    onClick={() => handleMoveCard(list.id)}
                    className="w-full min-h-11 rounded-2xl px-4 py-3 text-left flex items-center justify-between"
                    style={{ background: isCurrent ? `color-mix(in srgb, var(--ff-primary) 10%, transparent)` : `var(--ff-bg-subtle)`, color: `var(--ff-text-primary)` }}
                  >
                    <span className="text-sm font-semibold">{list.title}</span>
                    {isCurrent ? <span className="text-[11px] font-bold" style={{ color: `var(--ff-primary)` }}>Actual</span> : <ArrowRightLeft size={14} className="opacity-60" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {mobileToast && (
        <div className="pointer-events-none fixed left-1/2 bottom-24 z-30 -translate-x-1/2">
          <div className="rounded-full px-4 py-2 text-sm font-semibold text-white shadow-lg flex items-center gap-2 bg-emerald-600">
            <CheckCircle2 size={15} />
            {mobileToast}
          </div>
        </div>
      )}

      <NewVideoWizard isOpen={isNewVideoWizardOpen} onClose={() => setIsNewVideoWizardOpen(false)} />
    </div>
  );
}


