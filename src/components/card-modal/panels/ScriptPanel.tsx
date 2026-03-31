import { useRef, useState, useEffect } from 'react';
import { FileText, Pencil, Play } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { Card as CardType } from '../../../types';
import type { CardActions, CardAiState } from '../types';
import { PanelShell } from '../shared/PanelShell';
import { CollapsedPreview } from '../shared/CollapsedPreview';
import { TextField } from '../shared/TextField';
import { AiButton } from '../shared/AiButton';
import { DriveLinkField } from '../shared/DriveLinkField';
import { PANEL_CONFIG, GUION_PRESETS } from '../constants';
import { subtleButtonStyle, flowPrimaryActionStyle } from '../hooks/useFlowStyles';
import TeleprompterOverlay from '../../TeleprompterOverlay';
import { trackProductEvent } from '../../../lib/analytics';

interface ScriptPanelProps {
  card: CardType;
  expanded: boolean;
  onToggle: () => void;
  actions: CardActions;
  ai: CardAiState;
  readOnly: boolean;
  setPanelRef: (el: HTMLDivElement | null) => void;
}

export function ScriptPanel({ card, expanded, onToggle, actions, ai, readOnly, setPanelRef }: ScriptPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [showTeleprompter, setShowTeleprompter] = useState(false);
  const [draft, setDraft] = useState({
    guion: card.guion || '',
    queria: card.storytelling?.queria || '',
    pero: card.storytelling?.pero || '',
    porLoTanto: card.storytelling?.porLoTanto || '',
  });
  const [driveLinkDraft, setDriveLinkDraft] = useState(card.driveLinks?.script || '');

  useEffect(() => {
    if (!editing) {
      setDraft({
        guion: card.guion || '',
        queria: card.storytelling?.queria || '',
        pero: card.storytelling?.pero || '',
        porLoTanto: card.storytelling?.porLoTanto || '',
      });
      setDriveLinkDraft(card.driveLinks?.script || '');
    }
  }, [editing, card.guion, card.storytelling, card.driveLinks?.script]);

  useEffect(() => {
    setPanelRef(ref.current);
  }, [setPanelRef]);

  const save = () => {
    const updates: Partial<CardType> = {
      guion: draft.guion,
      storytelling: {
        queria: draft.queria,
        pero: draft.pero,
        porLoTanto: draft.porLoTanto,
      },
    };
    if (driveLinkDraft !== (card.driveLinks?.script || '')) {
      updates.driveLinks = { ...card.driveLinks, script: driveLinkDraft };
    }
    actions.updateCard(updates);
    setEditing(false);
  };

  const loadPreset = (name: string) => {
    setDraft((previous) => ({ ...previous, guion: GUION_PRESETS[name] || '' }));
  };

  const handleGenerateScript = async () => {
    const suggestionResult = await ai.generateScript();
    const suggestion = suggestionResult?.draft;
    if (!suggestion) return;
    setDraft((previous) => ({
      ...previous,
      guion: suggestion.scriptBase || previous.guion,
    }));
  };

  const readingScript = card.guion || '';
  const teleprompterScript = editing ? (draft.guion.trim() || readingScript) : readingScript;
  const teleprompterSourceLabel = editing && draft.guion.trim() ? 'Borrador actual' : 'Guion guardado';
  const wordCount = readingScript.split(/\s+/).filter(Boolean).length;
  const config = PANEL_CONFIG.script;
  const scriptGenerationMeta = ai.lastScriptGeneration;
  const teleprompterButtonStyle = teleprompterScript.trim()
    ? {
        background: 'linear-gradient(135deg, color-mix(in srgb, var(--ff-primary) 90%, #0f172a), color-mix(in srgb, var(--ff-accent) 78%, #0f172a))',
        color: '#ffffff',
        border: '1px solid color-mix(in srgb, var(--ff-primary) 38%, rgba(255,255,255,0.22))',
        boxShadow: '0 10px 26px rgba(37, 99, 235, 0.24)',
      }
    : subtleButtonStyle;

  const preview = (
    <CollapsedPreview
      primary={wordCount > 0 ? `Guion: ${wordCount} palabras` : 'Guion pendiente'}
      secondary={card.storytelling?.queria ? 'Storytelling definido' : 'Escribe o genera el guion del video.'}
      chips={[
        wordCount > 0 ? 'Guion listo' : '',
        card.storytelling?.queria ? 'Storytelling' : '',
      ].filter(Boolean)}
    />
  );

  const action = (
    <div className="flex flex-wrap items-center gap-2">
      {teleprompterScript.trim() && (
        <button
          type="button"
          onClick={() => {
            setShowTeleprompter(true);
            trackProductEvent('teleprompter_started', {
              card_id: card.id,
              content_type: card.contentType || 'undefined',
              source_label: teleprompterSourceLabel,
              word_count: teleprompterScript.split(/\s+/).filter(Boolean).length,
            });
          }}
          className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold"
          style={teleprompterButtonStyle}
        >
          <Play size={14} />
          Teleprompter
        </button>
      )}
      {!readOnly && (
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
      )}
    </div>
  );

  return (
    <>
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
                      Herramientas del guion
                    </p>
                    <p className="mt-1 text-sm leading-6" style={{ color: 'var(--ff-text-secondary)' }}>
                      Genera una base con IA, analiza el borrador o leelo en teleprompter antes de guardar.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <AiButton
                      onClick={handleGenerateScript}
                      loading={ai.isGeneratingScript}
                      label={draft.guion.trim() ? 'Regenerar guion con IA' : 'Generar guion con IA'}
                    />
                    <AiButton
                      onClick={() => ai.analyzeScript(draft.guion)}
                      loading={ai.isAnalyzingScript}
                      label="Analizar guion con IA"
                      disabled={!draft.guion.trim()}
                    />
                  </div>
                </div>
                {scriptGenerationMeta && (
                  <p className="mt-3 text-xs leading-5" style={{ color: 'var(--ff-text-tertiary)' }}>
                    Ultimo guion: {scriptGenerationMeta.promptVersion}
                    {scriptGenerationMeta.warnings.length
                      ? ` · revisar ${scriptGenerationMeta.warnings.length} alerta(s)`
                      : ' · escaleta estructurada lista para pulir'}
                  </p>
                )}
              </div>
            )}

            <TextField
              label="Guion / Escaleta"
              value={draft.guion}
              onChange={(value) => setDraft((previous) => ({ ...previous, guion: value }))}
              placeholder="Escribe la estructura de tu guion..."
              multiline
              rows={12}
            />

            <div className="flex flex-wrap gap-1.5">
              {Object.keys(GUION_PRESETS).map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => loadPreset(name)}
                  className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium"
                  style={subtleButtonStyle}
                >
                  <FileText size={12} /> {name}
                </button>
              ))}
            </div>

            {ai.scriptAnalysis && (
              <div
                className="rounded-[1.1rem] border p-4"
                style={{
                  borderColor: 'color-mix(in srgb, var(--ff-primary) 22%, var(--ff-border))',
                  background: 'color-mix(in srgb, var(--ff-primary) 8%, var(--ff-surface-solid))',
                }}
              >
                <p className="text-sm font-bold" style={{ color: 'var(--ff-text-primary)' }}>
                  Analisis del guion
                </p>
                <div className="prose prose-sm mt-3 max-w-none" style={{ color: 'var(--ff-text-primary)' }}>
                  <ReactMarkdown>{ai.scriptAnalysis}</ReactMarkdown>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <p
                className="text-[11px] font-bold uppercase tracking-wider"
                style={{ color: 'var(--ff-text-tertiary)' }}
              >
                Storytelling
              </p>
              <TextField
                label="Queria..."
                value={draft.queria}
                onChange={(value) => setDraft((previous) => ({ ...previous, queria: value }))}
                placeholder="Que queria lograr?"
              />
              <TextField
                label="PERO..."
                value={draft.pero}
                onChange={(value) => setDraft((previous) => ({ ...previous, pero: value }))}
                placeholder="Que obstaculo encontro?"
              />
              <TextField
                label="POR LO TANTO..."
                value={draft.porLoTanto}
                onChange={(value) => setDraft((previous) => ({ ...previous, porLoTanto: value }))}
                placeholder="Que hizo al respecto?"
              />
            </div>

            <DriveLinkField
              label="Documento de guion"
              value={driveLinkDraft}
              onChange={setDriveLinkDraft}
              placeholder="https://drive.google.com/... (doc de guion o escaleta)"
              editing
            />

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={save}
                className="rounded-full px-5 py-2.5 text-sm font-semibold"
                style={flowPrimaryActionStyle}
              >
                Guardar guion
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
            {readingScript ? (
              <div
                className="rounded-[1.1rem] border p-4"
                style={{ borderColor: 'var(--ff-border)', background: 'var(--ff-surface-raised)' }}
              >
                <div className="prose prose-sm max-w-none" style={{ color: 'var(--ff-text-primary)' }}>
                  <ReactMarkdown>{readingScript}</ReactMarkdown>
                </div>
              </div>
            ) : (
              <p className="text-sm" style={{ color: 'var(--ff-text-secondary)' }}>
                Abre edicion para escribir el guion manualmente o generarlo con IA.
              </p>
            )}

            <DriveLinkField label="Guion en Drive" value={card.driveLinks?.script || ''} editing={false} />

            {card.storytelling?.queria && (
              <div
                className="rounded-[1.1rem] border p-3"
                style={{ borderColor: 'var(--ff-border)', background: 'var(--ff-surface-raised)' }}
              >
                <p
                  className="text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: 'var(--ff-text-tertiary)' }}
                >
                  Storytelling
                </p>
                <p className="mt-1 text-sm" style={{ color: 'var(--ff-text-primary)' }}>
                  Queria {card.storytelling.queria}, PERO {card.storytelling.pero}, POR LO TANTO {card.storytelling.porLoTanto}
                </p>
              </div>
            )}
          </div>
        )}
      </PanelShell>
      {showTeleprompter && teleprompterScript && (
        <TeleprompterOverlay
          script={teleprompterScript}
          sourceLabel={teleprompterSourceLabel}
          onClose={() => setShowTeleprompter(false)}
        />
      )}
    </>
  );
}
