import { useRef, useState, useEffect } from 'react';
import { Pencil, Trash2, ArrowRightLeft } from 'lucide-react';
import type { Card as CardType } from '../../../types';
import type { CardActions, CardDerived } from '../types';
import { PanelShell } from '../shared/PanelShell';
import { CollapsedPreview } from '../shared/CollapsedPreview';
import { TextField } from '../shared/TextField';
import { PANEL_CONFIG } from '../constants';
import { subtleButtonStyle, flowPrimaryActionStyle, dangerButtonStyle, raisedPanelStyle } from '../hooks/useFlowStyles';

interface PostPubPanelProps {
  card: CardType;
  expanded: boolean;
  onToggle: () => void;
  actions: CardActions;
  derived: CardDerived;
  readOnly: boolean;
  onClose: () => void;
  setPanelRef: (el: HTMLDivElement | null) => void;
}

type ActionTakenOption = 'none' | 'thumbnail' | 'title' | 'both';

const ACTION_TAKEN_LABELS: Record<ActionTakenOption, string> = {
  none: 'Ninguna',
  thumbnail: 'Cambio de miniatura',
  title: 'Cambio de titulo',
  both: 'Miniatura + titulo',
};

export function PostPubPanel({ card, expanded, onToggle, actions, derived, readOnly, onClose, setPanelRef }: PostPubPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pp = card.postPublication || {};
  const [draft, setDraft] = useState({
    ctr2Hours: card.ctr2Hours || '',
    commentsResponded: pp.commentsResponded || false,
    actionTaken: (pp.actionTaken || 'none') as ActionTakenOption,
    actionLog: pp.actionLog || '',
  });

  useEffect(() => {
    if (!editing) setDraft({
      ctr2Hours: card.ctr2Hours || '',
      commentsResponded: card.postPublication?.commentsResponded || false,
      actionTaken: (card.postPublication?.actionTaken || 'none') as ActionTakenOption,
      actionLog: card.postPublication?.actionLog || '',
    });
  }, [editing, card.ctr2Hours, card.postPublication]);

  useEffect(() => { setPanelRef(ref.current); }, [setPanelRef]);

  const save = () => {
    actions.updateCard({
      ctr2Hours: draft.ctr2Hours,
      postPublication: {
        ...card.postPublication,
        commentsResponded: draft.commentsResponded,
        actionTaken: draft.actionTaken,
        actionLog: draft.actionLog,
      },
    });
    setEditing(false);
  };

  const config = PANEL_CONFIG.postpub;

  const preview = (
    <CollapsedPreview
      primary={card.ctr2Hours ? `CTR 2h: ${card.ctr2Hours}` : 'Monitoreo pendiente'}
      secondary={pp.actionTaken && pp.actionTaken !== 'none' ? ACTION_TAKEN_LABELS[pp.actionTaken] : 'Monitorea CTR y responde comentarios tras publicar.'}
      chips={[pp.commentsResponded ? 'Comentarios respondidos' : '', pp.actionTaken && pp.actionTaken !== 'none' ? 'Accion tomada' : ''].filter(Boolean)}
    />
  );

  const action = !readOnly && !editing ? (
    <button type="button" onClick={() => setEditing(true)} className="inline-flex h-11 w-11 items-center justify-center rounded-full border" style={subtleButtonStyle}>
      <Pencil size={16} />
    </button>
  ) : undefined;

  return (
    <PanelShell panelRef={ref} kicker={config.kicker} title={config.title} description={config.description} preview={preview} expanded={expanded} onToggle={onToggle} action={action}>
      {editing ? (
        <div className="space-y-4">
          <TextField label="CTR a las 2 horas" value={draft.ctr2Hours} onChange={v => setDraft(p => ({ ...p, ctr2Hours: v }))} placeholder="Ej: 8.5%" />
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={draft.commentsResponded} onChange={e => setDraft(p => ({ ...p, commentsResponded: e.target.checked }))} className="rounded" />
            <span className="text-sm" style={{ color: 'var(--ff-text-primary)' }}>Comentarios respondidos (&lt;30 min)</span>
          </label>
          <div>
            <p className="mb-1 text-xs font-semibold" style={{ color: 'var(--ff-text-secondary)' }}>Accion tomada</p>
            <select
              value={draft.actionTaken}
              onChange={e => setDraft(p => ({ ...p, actionTaken: e.target.value as ActionTakenOption }))}
              className="w-full rounded-xl border px-3 py-2 text-sm"
              style={{ background: 'var(--ff-surface-solid)', borderColor: 'var(--ff-border)', color: 'var(--ff-text-primary)' }}
            >
              {(Object.keys(ACTION_TAKEN_LABELS) as ActionTakenOption[]).map(k => (
                <option key={k} value={k}>{ACTION_TAKEN_LABELS[k]}</option>
              ))}
            </select>
          </div>
          <TextField label="Log de acciones" value={draft.actionLog} onChange={v => setDraft(p => ({ ...p, actionLog: v }))} placeholder="Historial de cambios post-publicacion..." multiline rows={3} />
          <div className="flex items-center gap-2">
            <button type="button" onClick={save} className="rounded-full px-5 py-2.5 text-sm font-semibold" style={flowPrimaryActionStyle}>Guardar</button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-full px-4 py-2.5 text-sm font-semibold" style={subtleButtonStyle}>Cancelar</button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-[1.1rem] border p-3" style={raisedPanelStyle}>
              <p className="text-[10px] font-bold uppercase" style={{ color: 'var(--ff-text-tertiary)' }}>CTR 2h</p>
              <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--ff-text-primary)' }}>{card.ctr2Hours || 'Sin datos'}</p>
            </div>
            <div className="rounded-[1.1rem] border p-3" style={raisedPanelStyle}>
              <p className="text-[10px] font-bold uppercase" style={{ color: 'var(--ff-text-tertiary)' }}>Comentarios</p>
              <p className="mt-1 text-sm font-semibold" style={{ color: pp.commentsResponded ? 'var(--ff-success-text)' : 'var(--ff-text-secondary)' }}>
                {pp.commentsResponded ? '✓ Respondidos' : 'Pendientes'}
              </p>
            </div>
          </div>
          {pp.actionTaken && pp.actionTaken !== 'none' && (
            <div className="rounded-[1.1rem] border p-3" style={raisedPanelStyle}>
              <p className="text-[10px] font-bold uppercase" style={{ color: 'var(--ff-text-tertiary)' }}>Accion tomada</p>
              <p className="mt-1 text-sm" style={{ color: 'var(--ff-text-primary)' }}>{ACTION_TAKEN_LABELS[pp.actionTaken]}</p>
            </div>
          )}
        </div>
      )}

      {/* Actions: move + delete */}
      <div className="mt-6 flex flex-wrap items-center gap-2 border-t pt-4" style={{ borderColor: 'var(--ff-border)' }}>
        {derived.suggestedColumnTitle && !readOnly && (
          <button type="button" onClick={actions.moveToSuggested} className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold" style={flowPrimaryActionStyle}>
            <ArrowRightLeft size={14} /> Mover a {derived.suggestedColumnTitle}
          </button>
        )}
        {!readOnly && (
          confirmDelete ? (
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => { actions.deleteCard(); onClose(); }} className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold" style={dangerButtonStyle}>
                <Trash2 size={14} /> Confirmar eliminar
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-full px-3 py-2 text-sm font-semibold" style={subtleButtonStyle}>Cancelar</button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold" style={subtleButtonStyle}>
              <Trash2 size={14} /> Eliminar tarjeta
            </button>
          )
        )}
      </div>
    </PanelShell>
  );
}
