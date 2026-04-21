import { useRef, useState, useEffect } from 'react';
import { Pencil } from 'lucide-react';
import type { CardData, ProductionBrief } from '../../../types';
import type { CardActions, CardAiState } from '../types';
import { PanelShell } from '../shared/PanelShell';
import { CollapsedPreview } from '../shared/CollapsedPreview';
import { TextField } from '../shared/TextField';
import { AiButton } from '../shared/AiButton';
import { DriveLinkField } from '../shared/DriveLinkField';
import { PANEL_CONFIG } from '../constants';
import { subtleButtonStyle, flowPrimaryActionStyle } from '../hooks/useFlowStyles';

const EMPTY_BRIEF: ProductionBrief = {
  idea: '',
  audience: '',
  question: '',
  promise: '',
  tone: '',
  creatorNotes: '',
  researchSummary: '',
  openQuestions: [],
};

interface IdeaPanelProps {
  card: CardData;
  expanded: boolean;
  onToggle: () => void;
  actions: CardActions;
  ai: CardAiState;
  readOnly: boolean;
  setPanelRef: (el: HTMLDivElement | null) => void;
}

export function IdeaPanel({ card, expanded, onToggle, actions, ai, readOnly, setPanelRef }: IdeaPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const brief = card.productionBrief || EMPTY_BRIEF;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ ...brief });
  const [driveLinkDraft, setDriveLinkDraft] = useState(card.driveLinks?.research || '');
  const [isSuggestingBrief, setIsSuggestingBrief] = useState(false);

  useEffect(() => {
    if (!editing) {
      setDraft({ ...(card.productionBrief || EMPTY_BRIEF) });
      setDriveLinkDraft(card.driveLinks?.research || '');
    }
  }, [editing, card.productionBrief, card.driveLinks?.research]);

  useEffect(() => {
    setPanelRef(ref.current);
  }, [setPanelRef]);

  const save = () => {
    actions.updateBrief(draft);
    if (driveLinkDraft !== (card.driveLinks?.research || '')) {
      actions.updateCard({ driveLinks: { ...card.driveLinks, research: driveLinkDraft } });
    }
    setEditing(false);
  };

  const handleSuggestBrief = async () => {
    if (isSuggestingBrief) return;
    setIsSuggestingBrief(true);
    try {
      const suggestionResult = await ai.suggestBrief({
        idea: draft.idea || card.title,
        audience: draft.audience,
        question: draft.question,
        promise: draft.promise,
        tone: draft.tone,
        creatorNotes: draft.creatorNotes,
      });
      const suggestion = suggestionResult?.draft;
      if (!suggestion) return;
      setDraft((previous) => ({
        ...previous,
        audience: suggestion.audience || previous.audience,
        question: suggestion.question || previous.question,
        promise: suggestion.promise || previous.promise,
        tone: suggestion.tone || previous.tone,
        creatorNotes: suggestion.creatorNotes || previous.creatorNotes,
      }));
    } finally {
      setIsSuggestingBrief(false);
    }
  };

  const config = PANEL_CONFIG.idea;
  const preview = (
    <CollapsedPreview
      primary={brief.question || brief.idea || 'Brief pendiente de aterrizar'}
      secondary={brief.promise || brief.audience || 'La idea, la promesa y la audiencia viven aqui.'}
      chips={[brief.audience, brief.tone].filter(Boolean)}
    />
  );

  const hasBriefDraft = !!(
    draft.audience ||
    draft.question ||
    draft.promise ||
    draft.tone ||
    draft.creatorNotes
  );

  const action = !readOnly ? (
    editing ? (
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="rounded-full px-4 py-2 text-sm font-semibold"
        style={subtleButtonStyle}
      >
        Cancelar
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full border"
        style={subtleButtonStyle}
      >
        <Pencil size={16} />
      </button>
    )
  ) : undefined;

  const briefGenerationMeta = ai.lastBriefSuggestion;

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
          {!readOnly && (
            <div
              className="rounded-[1.15rem] border p-3.5"
              style={{ borderColor: 'var(--ff-border)', background: 'var(--ff-surface-raised)' }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p
                    className="text-[11px] font-bold uppercase tracking-[0.16em]"
                    style={{ color: 'var(--ff-text-tertiary)' }}
                  >
                    Ayuda con IA
                  </p>
                  <p className="mt-1 text-sm leading-6" style={{ color: 'var(--ff-text-secondary)' }}>
                    Completa audiencia, pregunta, promesa, tono y notas usando la idea actual.
                    La IA solo rellena este borrador; tu decides luego si lo guardas.
                  </p>
                </div>
                <AiButton
                  onClick={handleSuggestBrief}
                  loading={isSuggestingBrief}
                  label={hasBriefDraft ? 'Volver a sugerir con IA' : 'Completar brief con IA'}
                  disabled={!(draft.idea || card.title).trim()}
                />
              </div>
              {briefGenerationMeta && (
                <p className="mt-3 text-xs leading-5" style={{ color: 'var(--ff-text-tertiary)' }}>
                  Ultima sugerencia: {briefGenerationMeta.promptVersion}
                  {briefGenerationMeta.warnings.length
                    ? ` · revisar ${briefGenerationMeta.warnings.length} alerta(s)`
                    : ' · sin alertas estructurales'}
                </p>
              )}
            </div>
          )}

          <TextField
            label="Idea / Angulo"
            value={draft.idea}
            onChange={(value) => setDraft((previous) => ({ ...previous, idea: value }))}
            placeholder="De que trata este video?"
            multiline
            rows={2}
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <TextField
              label="Audiencia"
              value={draft.audience}
              onChange={(value) => setDraft((previous) => ({ ...previous, audience: value }))}
              placeholder="A quien va dirigido?"
            />
            <TextField
              label="Pregunta clave"
              value={draft.question}
              onChange={(value) => setDraft((previous) => ({ ...previous, question: value }))}
              placeholder="Que pregunta responde?"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <TextField
              label="Promesa"
              value={draft.promise}
              onChange={(value) => setDraft((previous) => ({ ...previous, promise: value }))}
              placeholder="Que se lleva el espectador?"
            />
            <TextField
              label="Tono"
              value={draft.tone}
              onChange={(value) => setDraft((previous) => ({ ...previous, tone: value }))}
              placeholder="Educativo, casual, intenso..."
            />
          </div>
          <TextField
            label="Notas del creador"
            value={draft.creatorNotes}
            onChange={(value) => setDraft((previous) => ({ ...previous, creatorNotes: value }))}
            placeholder="Notas internas..."
            multiline
            rows={3}
          />
          <DriveLinkField
            label="Carpeta de investigacion"
            value={driveLinkDraft}
            onChange={setDriveLinkDraft}
            placeholder="https://drive.google.com/... (research, referencias, docs)"
            editing
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              className="rounded-full px-5 py-2.5 text-sm font-semibold"
              style={flowPrimaryActionStyle}
            >
              Guardar brief
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
        <div className="space-y-3">
          {[
            { label: 'Idea', value: brief.idea },
            { label: 'Audiencia', value: brief.audience },
            { label: 'Pregunta', value: brief.question },
            { label: 'Promesa', value: brief.promise },
            { label: 'Tono', value: brief.tone },
            { label: 'Notas', value: brief.creatorNotes },
          ]
            .filter((field) => field.value)
            .map((field) => (
              <div
                key={field.label}
                className="rounded-[1.1rem] border p-3"
                style={{ borderColor: 'var(--ff-border)', background: 'var(--ff-surface-raised)' }}
              >
                <p
                  className="text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: 'var(--ff-text-tertiary)' }}
                >
                  {field.label}
                </p>
                <p className="mt-1 text-sm" style={{ color: 'var(--ff-text-primary)' }}>
                  {field.value}
                </p>
              </div>
            ))}
          <DriveLinkField label="Investigacion" value={card.driveLinks?.research || ''} editing={false} />
          {!brief.idea && !brief.question && (
            <p className="text-sm" style={{ color: 'var(--ff-text-secondary)' }}>
              Abre edicion para completar el brief manualmente o con IA.
            </p>
          )}
        </div>
      )}
    </PanelShell>
  );
}
