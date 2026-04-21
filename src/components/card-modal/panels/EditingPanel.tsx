import { useRef, useState, useEffect } from 'react';
import { Pencil, AlertTriangle } from 'lucide-react';
import type { CardData, ProductionStageId, ProductionStageStatus } from '../../../types';
import type { CardActions, CardDerived } from '../types';
import { PanelShell } from '../shared/PanelShell';
import { CollapsedPreview } from '../shared/CollapsedPreview';
import { TextField } from '../shared/TextField';
import { DriveLinkField } from '../shared/DriveLinkField';
import { PANEL_CONFIG } from '../constants';
import {
  subtleButtonStyle,
  flowPrimaryActionStyle,
  raisedPanelStyle,
  getFlowToneStyle,
  flowDangerActionStyle,
} from '../hooks/useFlowStyles';
import { getAuditRoleLabel, findStageChecklist } from '../../../lib/optimizedVideoFlow';
import { CHECKLIST_TEMPLATES } from '../../../store';

interface EditingPanelProps {
  card: CardData;
  expanded: boolean;
  onToggle: () => void;
  actions: CardActions;
  derived: CardDerived;
  readOnly: boolean;
  setPanelRef: (el: HTMLDivElement | null) => void;
}

const STAGE_STATUS_LABELS: Record<ProductionStageStatus, string> = {
  pending: 'Pendiente',
  in_progress: 'En curso',
  blocked: 'Bloqueada',
  done: 'Hecha',
};

export function EditingPanel({
  card,
  expanded,
  onToggle,
  actions,
  derived,
  readOnly,
  setPanelRef,
}: EditingPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [selectedStageId, setSelectedStageId] = useState<ProductionStageId | null>(derived.currentStage?.id || null);
  const previousCurrentStageIdRef = useRef<ProductionStageId | null>(derived.currentStage?.id || null);
  const [draft, setDraft] = useState({
    assignee: card.assignee || '',
    linkDrive: card.linkDrive || '',
    footageDrive: card.driveLinks?.footage || '',
    editingDrive: card.driveLinks?.editing || '',
  });

  const { stages, currentStage, execution, flowSummary } = derived;

  useEffect(() => {
    if (!editing) {
      setDraft({
        assignee: card.assignee || '',
        linkDrive: card.linkDrive || '',
        footageDrive: card.driveLinks?.footage || '',
        editingDrive: card.driveLinks?.editing || '',
      });
    }
  }, [editing, card.assignee, card.linkDrive, card.driveLinks?.footage, card.driveLinks?.editing]);

  useEffect(() => {
    setPanelRef(ref.current);
  }, [setPanelRef]);

  useEffect(() => {
    const previousCurrentStageId = previousCurrentStageIdRef.current;
    const nextCurrentStageId = currentStage?.id || null;

    if (nextCurrentStageId && (!selectedStageId || selectedStageId === previousCurrentStageId)) {
      setSelectedStageId(nextCurrentStageId);
    }

    previousCurrentStageIdRef.current = nextCurrentStageId;
  }, [currentStage?.id, selectedStageId]);

  const save = () => {
    actions.updateCard({
      assignee: draft.assignee.trim() || null,
      linkDrive: draft.linkDrive,
      driveLinks: {
        ...card.driveLinks,
        footage: draft.footageDrive,
        editing: draft.editingDrive,
      },
    });
    setEditing(false);
  };

  const selectedStage = stages.find((stage) => stage.id === selectedStageId) || currentStage || stages[0] || null;
  const checklist = selectedStage ? findStageChecklist(card, selectedStage.id) : null;
  const checklistItems = checklist?.items || [];
  const checklistCompletedCount = checklistItems.filter((item) => item.isCompleted).length;
  const checklistTotalCount = checklistItems.length;
  const checklistPercent = checklistTotalCount > 0 ? Math.round((checklistCompletedCount / checklistTotalCount) * 100) : 0;
  const stageCompletedCount = flowSummary?.completedCount ?? stages.filter((stage) => stage.status === 'done').length;
  const stageTotalCount = flowSummary?.totalCount ?? stages.length;
  const stagePercent = stageTotalCount > 0 ? Math.round((stageCompletedCount / stageTotalCount) * 100) : 0;
  const currentResponsible = currentStage ? getAuditRoleLabel(currentStage.ownerRole) : card.assignee || 'Sin asignar';
  const selectedStageStatusLabel = selectedStage ? STAGE_STATUS_LABELS[selectedStage.status] : 'Sin etapa';
  const selectedStageTone = selectedStage?.status === 'done'
    ? 'success'
    : selectedStage?.status === 'blocked'
    ? 'danger'
    : selectedStage?.status === 'in_progress'
    ? 'brand'
    : 'neutral';
  const isCurrentStageSelected = selectedStage?.id === currentStage?.id;
  const canCompleteStage = checklistTotalCount === 0 || checklistCompletedCount === checklistTotalCount;
  const stageHasChecklistMismatch = selectedStage?.status === 'done'
    && checklistTotalCount > 0
    && checklistCompletedCount < checklistTotalCount;
  const config = PANEL_CONFIG.editing;

  const getStatusAction = (
    status: ProductionStageStatus,
  ): { next: ProductionStageStatus; label: string } => {
    if (status === 'pending') return { next: 'in_progress', label: 'Iniciar' };
    if (status === 'in_progress') return { next: 'done', label: 'Completar' };
    if (status === 'blocked') return { next: 'in_progress', label: 'Desbloquear' };
    return { next: 'pending', label: 'Reabrir' };
  };

  const preview = (
    <CollapsedPreview
      primary={execution.currentStageLabel || 'Sin etapa activa'}
      secondary={execution.nextActionDetail || derived.phase.action}
      chips={[currentResponsible, `${stageCompletedCount}/${stageTotalCount} etapas`]}
    />
  );

  const action = !readOnly && !editing ? (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="inline-flex h-11 w-11 items-center justify-center rounded-full border"
      style={subtleButtonStyle}
    >
      <Pencil size={16} />
    </button>
  ) : undefined;

  return (
    <PanelShell
      panelRef={ref}
      kicker={config.kicker}
      title={config.title}
      description={config.description}
      preview={preview}
      expanded={expanded}
      onToggle={onToggle}
      action={action}
    >
      {editing ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <span
                className="mb-2 block text-[11px] font-bold uppercase tracking-[0.16em]"
                style={{ color: 'var(--ff-text-tertiary)' }}
              >
                Responsable
              </span>
              <div className="flex gap-2">
                {['', 'Tu', 'Editor'].map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setDraft((previous) => ({ ...previous, assignee: option }))}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold border ${
                      draft.assignee === option ? 'ring-2 ring-offset-1' : ''
                    }`}
                    style={draft.assignee === option ? flowPrimaryActionStyle : subtleButtonStyle}
                  >
                    {option || 'Sin asignar'}
                  </button>
                ))}
              </div>
            </div>
            <TextField
              label="Link de Drive (general)"
              value={draft.linkDrive}
              onChange={(value) => setDraft((previous) => ({ ...previous, linkDrive: value }))}
              placeholder="https://drive.google.com/..."
            />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <DriveLinkField
              label="Carpeta de footage"
              value={draft.footageDrive}
              onChange={(value) => setDraft((previous) => ({ ...previous, footageDrive: value }))}
              placeholder="https://drive.google.com/... (grabaciones)"
              editing
            />
            <DriveLinkField
              label="Proyecto de edicion"
              value={draft.editingDrive}
              onChange={(value) => setDraft((previous) => ({ ...previous, editingDrive: value }))}
              placeholder="https://drive.google.com/... (Premiere, DaVinci)"
              editing
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              className="rounded-full px-5 py-2.5 text-sm font-semibold"
              style={flowPrimaryActionStyle}
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-full px-4 py-2.5 text-sm font-semibold"
              style={subtleButtonStyle}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-[1.1rem] border p-3" style={raisedPanelStyle}>
              <p className="text-[10px] font-bold uppercase" style={{ color: 'var(--ff-text-tertiary)' }}>
                Responsable actual
              </p>
              <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--ff-text-primary)' }}>
                {currentResponsible}
              </p>
            </div>

            <div className="rounded-[1.1rem] border p-3" style={raisedPanelStyle}>
              <p className="text-[10px] font-bold uppercase" style={{ color: 'var(--ff-text-tertiary)' }}>
                Etapas cerradas
              </p>
              <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--ff-text-primary)' }}>
                {stageCompletedCount}/{stageTotalCount} · {stagePercent}%
              </p>
            </div>

            <div className="rounded-[1.1rem] border p-3" style={raisedPanelStyle}>
              <p className="text-[10px] font-bold uppercase" style={{ color: 'var(--ff-text-tertiary)' }}>
                Checklist activa
              </p>
              <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--ff-text-primary)' }}>
                {checklistTotalCount > 0 ? `${checklistCompletedCount}/${checklistTotalCount} · ${checklistPercent}%` : 'Sin checklist'}
              </p>
            </div>

          </div>

          {(card.linkDrive || card.driveLinks?.footage || card.driveLinks?.editing) && (
            <div className="flex flex-wrap gap-2">
              <DriveLinkField label="Drive general" value={card.linkDrive || ''} editing={false} />
              <DriveLinkField label="Footage" value={card.driveLinks?.footage || ''} editing={false} />
              <DriveLinkField label="Proyecto edicion" value={card.driveLinks?.editing || ''} editing={false} />
            </div>
          )}

          {stages.length > 0 ? (
            <div>
              <p
                className="mb-2 text-[11px] font-bold uppercase tracking-wider"
                style={{ color: 'var(--ff-text-tertiary)' }}
              >
                Etapas de produccion
              </p>

              <div className="mb-3 flex flex-wrap gap-1.5">
                {stages.map((stage) => {
                  const tone = stage.status === 'done'
                    ? 'success'
                    : stage.status === 'blocked'
                    ? 'danger'
                    : stage.id === currentStage?.id
                    ? 'brand'
                    : 'neutral';

                  return (
                    <button
                      key={stage.id}
                      type="button"
                      onClick={() => setSelectedStageId(stage.id)}
                      className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase border ${
                        selectedStageId === stage.id ? 'ring-2 ring-offset-1' : ''
                      }`}
                      style={getFlowToneStyle(tone)}
                      title={`${stage.label} · ${STAGE_STATUS_LABELS[stage.status]}`}
                    >
                      {stage.label}
                    </button>
                  );
                })}
              </div>

              {selectedStage ? (
                <div className="rounded-[1.1rem] border p-4 space-y-3" style={raisedPanelStyle}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold" style={{ color: 'var(--ff-text-primary)' }}>
                          {selectedStage.label}
                        </p>
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase border"
                          style={getFlowToneStyle(selectedStageTone)}
                        >
                          {selectedStageStatusLabel}
                        </span>
                        {isCurrentStageSelected ? (
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                            style={flowPrimaryActionStyle}
                          >
                            Activa
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs" style={{ color: 'var(--ff-text-secondary)' }}>
                        {selectedStage.deliverable} · {getAuditRoleLabel(selectedStage.ownerRole)}
                      </p>
                    </div>

                    {!readOnly ? (
                      (() => {
                        const { next, label } = getStatusAction(selectedStage.status);
                        const disabled = next === 'done' && !canCompleteStage;

                        return (
                          <button
                            type="button"
                            onClick={() => {
                              if (!disabled) actions.setStageStatus(selectedStage.id, next);
                            }}
                            className="rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                            style={next === 'done' ? flowPrimaryActionStyle : next === 'in_progress' ? subtleButtonStyle : flowDangerActionStyle}
                            disabled={disabled}
                            title={disabled ? 'Completa la checklist antes de cerrar esta etapa.' : label}
                          >
                            {label}
                          </button>
                        );
                      })()
                    ) : null}
                  </div>

                  {selectedStage.status === 'in_progress' && !canCompleteStage && checklistTotalCount > 0 ? (
                    <div
                      className="flex items-start gap-2 rounded-[1rem] border px-3 py-2.5"
                      style={{ background: 'var(--ff-warning-bg)', borderColor: 'var(--ff-warning-border)' }}
                    >
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--ff-warning-text)' }} />
                      <div>
                        <p className="text-xs font-semibold" style={{ color: 'var(--ff-warning-text)' }}>
                          Checklist abierta
                        </p>
                        <p className="text-xs" style={{ color: 'var(--ff-warning-text)' }}>
                          Completa los items pendientes antes de marcar esta etapa como hecha.
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {stageHasChecklistMismatch ? (
                    <div
                      className="flex items-start gap-2 rounded-[1rem] border px-3 py-2.5"
                      style={{ background: 'var(--ff-danger-bg)', borderColor: 'var(--ff-danger-border)' }}
                    >
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--ff-danger-text)' }} />
                      <div>
                        <p className="text-xs font-semibold" style={{ color: 'var(--ff-danger-text)' }}>
                          Etapa cerrada con checklist incompleta
                        </p>
                        <p className="text-xs" style={{ color: 'var(--ff-danger-text)' }}>
                          Reabre esta etapa o termina la checklist para que el flujo no quede inconsistente.
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {checklistTotalCount > 0 ? (
                    <div className="rounded-[1rem] border p-3" style={raisedPanelStyle}>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p
                          className="text-[11px] font-bold uppercase tracking-wider"
                          style={{ color: 'var(--ff-text-tertiary)' }}
                        >
                          Checklist de etapa
                        </p>
                        <span className="text-xs font-semibold" style={{ color: 'var(--ff-text-secondary)' }}>
                          {checklistCompletedCount}/{checklistTotalCount} · {checklistPercent}%
                        </span>
                      </div>

                      <div className="mb-3 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--ff-border-medium)' }}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${checklistPercent}%`, background: 'var(--ff-primary)' }} />
                      </div>

                      <div className="space-y-1">
                        {checklistItems.map((item) => (
                          <label key={item.id} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={item.isCompleted}
                              onChange={() => checklist && actions.toggleChecklistItem(checklist.id, item.id)}
                              disabled={readOnly}
                              className="rounded"
                            />
                            <span
                              className={`text-sm ${item.isCompleted ? 'line-through opacity-60' : ''}`}
                              style={{ color: 'var(--ff-text-primary)' }}
                            >
                              {item.text}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {!readOnly && stages.length === 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {(Object.keys(CHECKLIST_TEMPLATES) as Array<keyof typeof CHECKLIST_TEMPLATES>).map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => actions.addChecklist(name)}
                  className="rounded-full px-3 py-1.5 text-xs font-semibold"
                  style={subtleButtonStyle}
                >
                  + {name}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </PanelShell>
  );
}
