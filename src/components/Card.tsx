import { Draggable } from '@hello-pangea/dnd';
import { CheckSquare, User, Trash2, Pencil, ArrowRightLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Card as CardType, BoardDensity, CardMetaMode } from '../types';
import { CardModal } from './CardModal';
import { useBoard } from '../store';
import { getProductionFlowSummary, getScheduleStatusLabel } from '../lib/optimizedVideoFlow';
import { getPhaseCompletionStatus } from '../lib/workflowPlans';
import { CardModalLocation, CardModalSectionId, OPEN_CARD_MODAL_EVENT, OpenCardModalDetail, resolveLegacyCardModalLocation, resolveLegacySectionFromLocation } from '../lib/cardModalEvents';

interface CardProps {
  card: CardType;
  index: number;
  draggable?: boolean;
  mobileMode?: boolean;
  canEdit?: boolean;
  onMoveRequest?: (card: CardType) => void;
  density?: BoardDensity;
  cardMetaMode?: CardMetaMode;
}

type CardModalSection = CardModalSectionId;

export function Card({
  card,
  index,
  draggable = true,
  mobileMode = false,
  canEdit = true,
  onMoveRequest,
  density = 'comfortable',
  cardMetaMode = 'full',
}: CardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalSection, setModalSection] = useState<CardModalSection>('summary');
  const [modalLocation, setModalLocation] = useState<CardModalLocation>(() => resolveLegacyCardModalLocation('summary'));
  const { deleteCard } = useBoard();
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const completedChecklists = card.checklists.reduce(
    (acc, checklist) => acc + checklist.items.filter((i) => i.isCompleted).length,
    0
  );
  const totalChecklists = card.checklists.reduce(
    (acc, checklist) => acc + checklist.items.length,
    0
  );

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canEdit) return;
    if (isConfirmingDelete) {
      deleteCard(card.id, card.listId);
    } else {
      setIsConfirmingDelete(true);
      setTimeout(() => setIsConfirmingDelete(false), 3000);
    }
  };

  const openModal = (section: CardModalSection = 'summary') => {
    setModalSection(section);
    setModalLocation(resolveLegacyCardModalLocation(section));
    setIsModalOpen(true);
  };

  const openModalAtLocation = (location: CardModalLocation) => {
    setModalLocation(location);
    setModalSection(resolveLegacySectionFromLocation(location));
    setIsModalOpen(true);
  };

  useEffect(() => {
    const handleOpenModal = (event: Event) => {
      const customEvent = event as CustomEvent<OpenCardModalDetail>;
      if (customEvent.detail?.cardId !== card.id) return;
      if (customEvent.detail.location) {
        openModalAtLocation(customEvent.detail.location);
        return;
      }
      openModal(customEvent.detail.section || 'summary');
    };

    window.addEventListener(OPEN_CARD_MODAL_EVENT, handleOpenModal as EventListener);
    return () => window.removeEventListener(OPEN_CARD_MODAL_EVENT, handleOpenModal as EventListener);
  }, [card.id]);

  const handleQuickAction = (event: React.MouseEvent, section: CardModalSection) => {
    event.stopPropagation();
    openModal(section);
  };

  const handleMoveAction = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!canEdit) return;
    onMoveRequest?.(card);
  };

  const { board } = useBoard();
  const isInLastColumn = board?.lists[board.lists.length - 1]?.cardIds.includes(card.id);
  const hasLowCTR = card.ctr2Hours && parseFloat(card.ctr2Hours) > 0 && parseFloat(card.ctr2Hours) < 4;
  const isPulsing = isInLastColumn && hasLowCTR;
  const activeVideoIds = board?.workflowConfig?.activeVideoIds || [];
  const pipelineSlot = activeVideoIds.indexOf(card.id);
  const isInPipeline = pipelineSlot !== -1;
  const checklistPct = totalChecklists > 0 ? Math.round((completedChecklists / totalChecklists) * 100) : -1;
  const flowSummary = board ? getProductionFlowSummary(card, board) : null;
  const phaseStatus = board ? getPhaseCompletionStatus(card, board) : null;
  const compactMode = !mobileMode && density === 'compact';
  const focusMode = !mobileMode && density === 'focus';
  const essentialMeta = cardMetaMode === 'essential';
  const flowOwnerLabel = flowSummary?.currentStage
    ? flowSummary.currentStage.ownerRole === 'creador'
      ? 'Creador'
      : flowSummary.currentStage.ownerRole === 'asistente'
      ? 'Asistente'
      : 'Editor'
    : null;
  const hasAIDraft = !!flowSummary?.aiSeededOpenStages.length;
  const scheduleStatus = flowSummary?.scheduleStatus || null;
  const titleClassName = mobileMode ? 'text-sm font-semibold mb-2 pr-6 leading-5' : focusMode ? 'text-[13px] font-semibold mb-2.5 pr-6 leading-5' : compactMode ? 'text-[13px] font-semibold mb-2.5 pr-6 leading-5' : 'text-sm font-semibold mb-2.5 pr-6 leading-5';
  const bodyPaddingClassName = mobileMode ? 'p-3.5' : focusMode ? 'p-3' : compactMode ? 'p-3' : 'p-4';
  const metaRowClassName = compactMode || focusMode ? 'flex items-center text-[11px] gap-2 flex-wrap gap-y-1.5' : 'flex items-center text-xs gap-2 flex-wrap gap-y-1.5';
  const progressPct = flowSummary && flowSummary.totalCount > 0
    ? Math.round((flowSummary.completedCount / flowSummary.totalCount) * 100)
    : checklistPct;
  const progressColor = scheduleStatus === 'blocked'
    ? '#ef4444'
    : scheduleStatus === 'overdue'
    ? '#f97316'
    : scheduleStatus === 'at_risk'
    ? '#f59e0b'
    : progressPct === 100
    ? '#22c55e'
    : scheduleStatus === 'extra_active'
    ? '#0f766e'
    : 'var(--ff-primary)';
  const scheduleChipClassName = scheduleStatus === 'blocked'
    ? 'bg-rose-100 text-rose-700'
    : scheduleStatus === 'overdue'
    ? 'bg-orange-100 text-orange-700'
    : scheduleStatus === 'at_risk'
    ? 'bg-amber-100 text-amber-700'
    : scheduleStatus === 'extra_active'
    ? 'bg-sky-100 text-sky-700'
    : scheduleStatus === 'completed'
    ? 'bg-emerald-100 text-emerald-700'
    : scheduleStatus === 'idea'
    ? 'bg-slate-100 text-slate-700'
    : 'bg-emerald-100 text-emerald-700';
  const workingDaysLabel = flowSummary
    ? flowSummary.isKickoffPending
      ? 'Sin arranque'
      : `Dia ${flowSummary.workingDaysElapsed}/${flowSummary.workingDaysBudget}`
    : null;
  const fallbackDueDateLabel = !flowSummary && card.dueDate ? new Date(card.dueDate).toLocaleDateString() : null;
  const scheduleLabel = scheduleStatus ? getScheduleStatusLabel(scheduleStatus) : null;
  const compactPrimaryChip = flowSummary?.currentStage
    ? {
        label: flowSummary.currentStage.label,
        className: 'bg-violet-100 text-violet-700',
        title: `Flujo optimizado: ${flowSummary.currentStage.label}`,
      }
    : scheduleLabel
    ? {
        label: scheduleLabel,
        className: scheduleChipClassName,
        title: `Estado operativo: ${scheduleLabel}`,
      }
    : null;
  const compactAlertChip = scheduleLabel && flowSummary?.currentStage && (scheduleStatus === 'blocked' || scheduleStatus === 'overdue' || scheduleStatus === 'at_risk')
    ? {
        label: scheduleLabel,
        className: scheduleChipClassName,
        title: `Estado operativo: ${scheduleLabel}`,
      }
    : flowSummary?.isColumnMismatch
    ? {
        label: 'Desalineado',
        className: 'bg-amber-100 text-amber-700',
        title: 'La columna actual no coincide con la etapa activa del flujo',
      }
    : phaseStatus && !phaseStatus.isDone && phaseStatus.missingFields.length > 0
    ? {
        label: `Falta ${phaseStatus.missingFields.length}`,
        className: 'bg-amber-50 text-amber-600',
        title: `Falta: ${phaseStatus.missingFields.map((field) => field.label).join(', ')}`,
      }
    : hasAIDraft
    ? {
        label: 'IA pendiente',
        className: 'bg-indigo-100 text-indigo-700',
        title: 'Hay borradores sembrados por IA pendientes de validacion',
      }
    : null;

  const cardBody = (
    <div
      onClick={() => openModal()}
      style={{
        background: `var(--ff-card-bg)`,
        border: isPulsing ? undefined : isInPipeline ? '1px solid rgb(99 102 241 / 0.4)' : `1px solid var(--ff-border)`,
        color: `var(--ff-text-primary)`
      }}
      className={`group relative ${bodyPaddingClassName} rounded-xl cursor-pointer transition-all duration-200 ff-card-shadow ${
        mobileMode ? 'hover:translate-y-0' : 'hover:-translate-y-0.5'
      } ${isPulsing ? 'animate-pulse' : ''} ${isInPipeline && !isPulsing ? 'ring-1 ring-indigo-400/30' : ''}`}
    >
      {canEdit && (
        <button
          onClick={handleDelete}
          className={`absolute top-2 right-2 p-1.5 rounded-lg transition-all duration-200 z-10 ${
            isConfirmingDelete
              ? 'bg-red-500 text-white opacity-100 shadow-md shadow-red-500/20'
              : mobileMode
              ? 'opacity-100 text-gray-400 hover:text-red-500 hover:bg-red-500/10'
              : 'opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-500/10'
          }`}
          title={isConfirmingDelete ? 'Haz clic de nuevo para confirmar' : 'Eliminar tarjeta'}
        >
          <Trash2 size={14} />
        </button>
      )}

      <div className={`flex flex-wrap items-center gap-1 pr-6 ${compactMode ? 'mb-2' : 'mb-2.5'}`}>
        {!compactMode && isInPipeline && (
          <span
            className="h-5 px-1.5 rounded text-[10px] font-bold bg-indigo-500 text-white flex items-center gap-0.5 shadow-sm"
            title={`Pipeline ${pipelineSlot + 1} - Video activo esta semana`}
          >
            P{pipelineSlot + 1}
          </span>
        )}
        {compactMode ? (
          <>
            {compactPrimaryChip && (
              <span className={`h-5 px-1.5 rounded text-[10px] font-bold ${compactPrimaryChip.className}`} title={compactPrimaryChip.title}>
                {compactPrimaryChip.label}
              </span>
            )}
            {compactAlertChip && (
              <span className={`h-5 px-1.5 rounded text-[10px] font-bold ${compactAlertChip.className}`} title={compactAlertChip.title}>
                {compactAlertChip.label}
              </span>
            )}
          </>
        ) : (
          <>
            {flowSummary?.currentStage && (
              <span className="h-5 px-1.5 rounded text-[10px] font-bold bg-violet-100 text-violet-700" title={`Flujo optimizado: ${flowSummary.currentStage.label}`}>
                {flowSummary.currentStage.label}
              </span>
            )}
            {scheduleLabel && (
              <span className={`h-5 px-1.5 rounded text-[10px] font-bold ${scheduleChipClassName}`} title={`Estado operativo: ${scheduleLabel}`}>
                {scheduleLabel}
              </span>
            )}
            {hasAIDraft && (
              <span className="h-5 px-1.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700" title="Hay borradores sembrados por IA pendientes de validacion">
                IA pendiente
              </span>
            )}
            {flowSummary?.isColumnMismatch && (
              <span className="h-5 px-1.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700" title="La columna actual no coincide con la etapa activa del flujo">
                Desalineado
              </span>
            )}
            {phaseStatus && (
              phaseStatus.isDone ? (
                <span className="h-5 px-1.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700" title={`Fase lista: ${phaseStatus.doneCondition}`}>
                  Fase lista
                </span>
              ) : phaseStatus.missingFields.length > 0 ? (
                <span className="h-5 px-1.5 rounded text-[10px] font-bold bg-amber-50 text-amber-600" title={`Falta: ${phaseStatus.missingFields.map(f => f.label).join(', ')}`}>
                  Falta: {phaseStatus.missingFields.length}
                </span>
              ) : null
            )}
          </>
        )}
      </div>

      <h3 className={titleClassName} style={{ color: `var(--ff-text-primary)` }}>{card.title}</h3>

      {!mobileMode && flowSummary?.currentStage && density === 'comfortable' && (
        <p className="mb-3 text-xs leading-5" style={{ color: `var(--ff-text-secondary)` }}>
          {flowSummary.currentStage.deliverable}
        </p>
      )}

      {progressPct >= 0 && (
        <div className={compactMode ? 'mb-2.5' : 'mb-3'}>
          <div className={`flex items-center justify-between gap-2 font-medium ${compactMode ? 'mb-1 text-[10px]' : 'mb-1.5 text-[11px]'}`} style={{ color: `var(--ff-text-secondary)` }}>
            <span>{flowSummary ? `${flowSummary.completedCount}/${flowSummary.totalCount} etapas` : `${completedChecklists}/${totalChecklists} checklist`}</span>
            <span>{progressPct}%</span>
          </div>
          <div className={`${compactMode ? 'h-1.25' : 'h-1.5'} overflow-hidden rounded-full`} style={{ background: `var(--ff-border-medium)` }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${progressPct}%`, background: progressColor }} />
          </div>
        </div>
      )}

      <div className={metaRowClassName} style={{ color: `var(--ff-text-tertiary)` }}>
        {!flowOwnerLabel && (
          <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded" style={{ background: `var(--ff-border-medium)` }} title="Responsable">
            <User size={12} />
            <span className="font-medium">{card.assignee || 'Sin asignar'}</span>
          </div>
        )}
        {flowOwnerLabel && (
          <div className="flex items-center space-x-1 rounded px-1.5 py-0.5" style={{ background: `color-mix(in srgb, var(--ff-primary) 12%, var(--ff-surface-solid))` }} title="Responsable operativo segun la etapa actual">
            <User size={12} />
            <span className="font-medium">{flowOwnerLabel}</span>
          </div>
        )}
        {!compactMode && workingDaysLabel && (
          <div className="rounded px-1.5 py-0.5 text-[11px] font-medium" style={{ background: `var(--ff-border-medium)` }} title="Ciclo real de trabajo">
            {workingDaysLabel}
          </div>
        )}
        {!compactMode && !workingDaysLabel && fallbackDueDateLabel && (
          <div className="rounded px-1.5 py-0.5 text-[11px] font-medium" style={{ background: `var(--ff-border-medium)` }} title="Fecha editorial">
            {fallbackDueDateLabel}
          </div>
        )}
        {flowSummary && !compactMode && !focusMode && !essentialMeta && (
          <div className="rounded px-1.5 py-0.5 text-[11px] font-medium" style={{ background: `var(--ff-border-medium)` }} title="Resumen del flujo">
            {flowSummary.completedCount}/{flowSummary.totalCount} etapas
          </div>
        )}
      </div>

      {mobileMode && canEdit && (
        <div className="mt-3 pt-3 border-t flex flex-wrap gap-2" style={{ borderColor: `var(--ff-border)` }}>
          <button
            onClick={(event) => handleQuickAction(event, 'summary')}
            className="min-h-11 px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5"
            style={{ background: `var(--ff-bg-subtle)`, color: `var(--ff-text-primary)` }}
          >
            <Pencil size={13} />
            Editar
          </button>
          <button
            onClick={handleMoveAction}
            className="min-h-11 px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5"
            style={{ background: `color-mix(in srgb, var(--ff-primary) 10%, transparent)`, color: `var(--ff-primary)` }}
          >
            <ArrowRightLeft size={13} />
            Mover
          </button>
          <button
            onClick={(event) => handleQuickAction(event, 'checklists')}
            className="min-h-11 px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5"
            style={{ background: `var(--ff-bg-subtle)`, color: `var(--ff-text-primary)` }}
          >
            <CheckSquare size={13} />
            Checklist
          </button>
          <button
            onClick={(event) => handleQuickAction(event, 'assignee')}
            className="min-h-11 px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5"
            style={{ background: `var(--ff-bg-subtle)`, color: `var(--ff-text-primary)` }}
          >
            <User size={13} />
            Asignar
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      {draggable ? (
        <Draggable draggableId={card.id} index={index}>
          {(provided, snapshot) => (
            <div
              ref={provided.innerRef}
              {...provided.draggableProps}
              {...provided.dragHandleProps}
              style={{
                ...provided.draggableProps.style,
                ...(snapshot.isDragging ? { zIndex: 9999 } : {}),
              }}
              className={snapshot.isDragging ? 'shadow-lg ring-2 ring-indigo-500/40 scale-[1.02] rounded-xl' : undefined}
            >
              {cardBody}
            </div>
          )}
        </Draggable>
      ) : (
        cardBody
      )}

      {isModalOpen && (
        <CardModal
          card={card}
          initialSection={modalSection}
          initialLocation={modalLocation}
          readOnly={!canEdit}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </>
  );
}
