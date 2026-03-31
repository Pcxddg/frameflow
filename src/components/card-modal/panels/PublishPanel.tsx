import { useRef, useState, useEffect } from 'react';
import { Pencil } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { Card as CardType } from '../../../types';
import type { CardActions, CardAiState, CardDerived } from '../types';
import { PanelShell } from '../shared/PanelShell';
import { CollapsedPreview } from '../shared/CollapsedPreview';
import { TextField } from '../shared/TextField';
import { AiButton } from '../shared/AiButton';
import { CopyButton } from '../shared/CopyButton';
import { DriveLinkField } from '../shared/DriveLinkField';
import { PANEL_CONFIG } from '../constants';
import { subtleButtonStyle, flowPrimaryActionStyle, raisedPanelStyle } from '../hooks/useFlowStyles';
import { isExecutionPublishReady, trackProductEvent } from '../../../lib/analytics';

interface PublishPanelProps {
  card: CardType;
  expanded: boolean;
  onToggle: () => void;
  actions: CardActions;
  ai: CardAiState;
  derived: CardDerived;
  readOnly: boolean;
  setPanelRef: (el: HTMLDivElement | null) => void;
}

function getReadinessStyle(status: 'ready' | 'pending' | 'warning') {
  if (status === 'ready') {
    return { background: 'var(--ff-success-bg)', border: '1px solid var(--ff-success-border)', color: 'var(--ff-success-text)' };
  }
  if (status === 'warning') {
    return { background: 'var(--ff-warning-bg)', border: '1px solid var(--ff-warning-border)', color: 'var(--ff-warning-text)' };
  }
  return { background: 'var(--ff-surface-raised)', border: '1px solid var(--ff-border)', color: 'var(--ff-text-secondary)' };
}

export function PublishPanel({ card, expanded, onToggle, actions, ai, derived, readOnly, setPanelRef }: PublishPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    description: card.description || '',
    keywords: card.keywords || '',
    seoSource: card.seoSourceText || '',
    publishDrive: card.driveLinks?.publish || '',
  });

  useEffect(() => {
    if (!editing) {
      setDraft({
        description: card.description || '',
        keywords: card.keywords || '',
        seoSource: card.seoSourceText || '',
        publishDrive: card.driveLinks?.publish || '',
      });
    }
  }, [editing, card.description, card.keywords, card.seoSourceText, card.driveLinks?.publish]);

  useEffect(() => {
    setPanelRef(ref.current);
  }, [setPanelRef]);

  const save = () => {
    const didApplySeo =
      draft.description.trim() !== (card.description || '').trim()
      || draft.keywords.trim() !== (card.keywords || '').trim()
      || draft.seoSource.trim() !== (card.seoSourceText || '').trim();

    const updates: Partial<CardType> = {
      description: draft.description,
      keywords: draft.keywords,
      seoSourceText: draft.seoSource,
    };
    if (draft.publishDrive !== (card.driveLinks?.publish || '')) {
      updates.driveLinks = { ...card.driveLinks, publish: draft.publishDrive };
    }
    actions.updateCard(updates);
    if (didApplySeo) {
      trackProductEvent('seo_applied', {
        card_id: card.id,
        content_type: card.contentType || 'undefined',
        source_used: ai.lastSeoGeneration?.draft.sourceUsed || derived.execution.sourceUsed,
        keyword_count: draft.keywords.split(',').map((keyword) => keyword.trim()).filter(Boolean).length,
        has_description: !!draft.description.trim(),
      });
    }
    setEditing(false);
  };

  const handleGenerateDescription = async () => {
    const nextResult = await ai.generateDescription({
      seoSourceText: draft.seoSource,
    });
    const nextDraft = nextResult?.draft;
    if (!nextDraft) return;
    setDraft((previous) => ({
      ...previous,
      description: nextDraft.descriptionBody || previous.description,
    }));
  };

  const handleSuggestKeywords = async () => {
    const nextResult = await ai.suggestKeywords({
      seoSourceText: draft.seoSource,
      script: card.guion || '',
    });
    const nextKeywords = nextResult?.draft.keywords;
    if (!nextKeywords?.length) return;
    setDraft((previous) => ({
      ...previous,
      keywords: nextKeywords.join(', '),
    }));
  };

  const keywordCount = (card.keywords || '').split(',').map((keyword) => keyword.trim()).filter(Boolean).length;
  const config = PANEL_CONFIG.publish;
  const publishReady = isExecutionPublishReady(derived.execution);
  const seoGenerationMeta = ai.lastSeoGeneration;
  const orderedReadiness = ['title', 'thumbnail', 'description', 'script', 'production', 'publish']
    .map((id) => derived.execution.readiness.find((item) => item.id === id))
    .filter((item): item is NonNullable<typeof derived.execution.readiness[number]> => !!item);

  const preview = (
    <CollapsedPreview
      primary={publishReady ? 'Cockpit listo para publicar' : card.description?.trim() ? 'Descripcion lista' : 'Descripcion pendiente'}
      secondary={publishReady ? 'Titulo, miniatura, guion, produccion y salida editorial estan cerrados.' : keywordCount > 0 ? `${keywordCount} keywords` : 'La descripcion y las keywords se cierran aqui.'}
      chips={[
        publishReady ? 'Publish ready' : card.description ? 'Desc. lista' : 'Pendiente',
        keywordCount > 0 ? `${keywordCount} keywords` : '',
      ].filter(Boolean)}
    />
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
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-[1.1rem] border p-3" style={raisedPanelStyle}>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ff-text-tertiary)' }}>
                Siguiente accion
              </p>
              <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--ff-text-primary)' }}>
                {derived.execution.nextActionLabel}
              </p>
              <p className="mt-1 text-xs leading-5" style={{ color: 'var(--ff-text-secondary)' }}>
                {derived.execution.nextActionDetail}
              </p>
            </div>
            <div className="rounded-[1.1rem] border p-3" style={raisedPanelStyle}>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ff-text-tertiary)' }}>
                Responsable
              </p>
              <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--ff-text-primary)' }}>
                {derived.execution.responsibleLabel}
              </p>
            </div>
            <div className="rounded-[1.1rem] border p-3" style={raisedPanelStyle}>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ff-text-tertiary)' }}>
                Estado final
              </p>
              <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--ff-text-primary)' }}>
                {publishReady ? 'Listo para publicar' : 'Aun faltan cierres'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {orderedReadiness.map((item) => (
              <div key={item.id} className="rounded-[1rem] p-3" style={getReadinessStyle(item.status)}>
                <p className="text-[10px] font-bold uppercase tracking-wider">{item.label}</p>
                <p className="mt-1 text-sm font-semibold">{item.status === 'ready' ? 'Listo' : item.status === 'warning' ? 'En revision' : 'Pendiente'}</p>
                <p className="mt-1 text-xs leading-5">{item.detail}</p>
              </div>
            ))}
          </div>

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
                    Genera la descripcion SEO o unas keywords base usando primero la fuente real del video.
                    El resultado rellena este borrador y no se guarda hasta que tu lo confirmes.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <AiButton
                    onClick={handleGenerateDescription}
                    loading={ai.isGeneratingDesc}
                    label={draft.description.trim() ? 'Regenerar descripcion SEO' : 'Generar descripcion SEO'}
                  />
                  <AiButton
                    onClick={handleSuggestKeywords}
                    loading={ai.isSuggestingKeywords}
                    label="Sugerir keywords con IA"
                  />
                </div>
              </div>
              {seoGenerationMeta && (
                <p className="mt-3 text-xs leading-5" style={{ color: 'var(--ff-text-tertiary)' }}>
                  Ultimo draft SEO: {seoGenerationMeta.promptVersion} · fuente {seoGenerationMeta.draft.sourceUsed}
                  {seoGenerationMeta.warnings.length
                    ? ` · revisar ${seoGenerationMeta.warnings.length} alerta(s)`
                    : ' · estructura lista para validar'}
                </p>
              )}
            </div>
          )}

          <TextField
            label="Fuente SEO (transcripcion o resumen)"
            value={draft.seoSource}
            onChange={(value) => setDraft((previous) => ({ ...previous, seoSource: value }))}
            placeholder="Pega aqui la transcripcion o un resumen real del video. Si lo dejas vacio, la IA cae al guion y luego al brief."
            multiline
            rows={4}
          />
          <TextField
            label="Descripcion YouTube"
            value={draft.description}
            onChange={(value) => setDraft((previous) => ({ ...previous, description: value }))}
            placeholder="Escribe o genera la descripcion..."
            multiline
            rows={8}
          />
          <TextField
            label="Keywords (separadas por coma)"
            value={draft.keywords}
            onChange={(value) => setDraft((previous) => ({ ...previous, keywords: value }))}
            placeholder="keyword 1, keyword 2, keyword 3..."
            multiline
            rows={2}
          />
          <DriveLinkField
            label="Carpeta de exports finales"
            value={draft.publishDrive}
            onChange={(value) => setDraft((previous) => ({ ...previous, publishDrive: value }))}
            placeholder="https://drive.google.com/... (video final, subtitulos)"
            editing
          />
          <div className="flex items-center gap-2 flex-wrap">
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
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {orderedReadiness.map((item) => (
              <div key={item.id} className="rounded-[1rem] p-3" style={getReadinessStyle(item.status)}>
                <p className="text-[10px] font-bold uppercase tracking-wider">{item.label}</p>
                <p className="mt-1 text-sm font-semibold">{item.status === 'ready' ? 'Listo' : item.status === 'warning' ? 'En revision' : 'Pendiente'}</p>
                <p className="mt-1 text-xs leading-5">{item.detail}</p>
              </div>
            ))}
          </div>
          {card.description ? (
            <div className="rounded-[1.1rem] border p-4" style={raisedPanelStyle}>
              <div className="mb-2 flex items-center justify-between">
                <p
                  className="text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: 'var(--ff-text-tertiary)' }}
                >
                  Descripcion
                </p>
                <CopyButton value={card.description} />
              </div>
              <div className="prose prose-sm max-w-none" style={{ color: 'var(--ff-text-primary)' }}>
                <ReactMarkdown>{card.description}</ReactMarkdown>
              </div>
            </div>
          ) : (
            <p className="text-sm" style={{ color: 'var(--ff-text-secondary)' }}>
              Abre edicion para generar la descripcion SEO o escribirla manualmente.
            </p>
          )}
          {card.keywords && (
            <div className="rounded-[1.1rem] border p-3" style={raisedPanelStyle}>
              <div className="mb-1 flex items-center justify-between">
                <p
                  className="text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: 'var(--ff-text-tertiary)' }}
                >
                  Keywords ({keywordCount})
                </p>
                <CopyButton value={card.keywords} />
              </div>
              <p className="text-sm" style={{ color: 'var(--ff-text-primary)' }}>
                {card.keywords}
              </p>
            </div>
          )}
          <DriveLinkField label="Exports finales" value={card.driveLinks?.publish || ''} editing={false} />
        </div>
      )}
    </PanelShell>
  );
}
