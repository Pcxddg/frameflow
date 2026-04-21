import { useEffect, useRef, useState } from 'react';
import { Clipboard, Pencil, Sparkles } from 'lucide-react';
import type { CardData, ThumbnailPlanStatus } from '../../../types';
import { buildThumbnailGenerationPrompt } from '../../../lib/thumbnailPrompt';
import type { CardActions, CardAiState } from '../types';
import { PanelShell } from '../shared/PanelShell';
import { CollapsedPreview } from '../shared/CollapsedPreview';
import { TextField } from '../shared/TextField';
import { DriveLinkField } from '../shared/DriveLinkField';
import { AiButton } from '../shared/AiButton';
import { PANEL_CONFIG } from '../constants';
import { flowPrimaryActionStyle, raisedPanelStyle, subtleButtonStyle } from '../hooks/useFlowStyles';

const STATUS_LABELS: Record<ThumbnailPlanStatus, string> = {
  pending: 'Pendiente',
  draft: 'Borrador',
  ready: 'Lista',
  approved: 'Aprobada',
};

const STATUS_OPTIONS: ThumbnailPlanStatus[] = ['pending', 'draft', 'ready', 'approved'];

interface ThumbnailPanelProps {
  card: CardData;
  expanded: boolean;
  onToggle: () => void;
  actions: CardActions;
  ai: CardAiState;
  readOnly: boolean;
  setPanelRef: (el: HTMLDivElement | null) => void;
}

function CopyPromptButton({ value, compact = false }: { value: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);

  if (!value.trim()) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`inline-flex items-center gap-2 rounded-full border font-semibold ${
        compact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'
      }`}
      style={subtleButtonStyle}
    >
      <Clipboard size={compact ? 13 : 15} />
      {copied ? 'Copiado' : 'Copiar prompt'}
    </button>
  );
}

export function ThumbnailPanel({
  card,
  expanded,
  onToggle,
  actions,
  ai,
  readOnly,
  setPanelRef,
}: ThumbnailPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    status: (card.thumbnailPlan?.status || 'pending') as ThumbnailPlanStatus,
    concept: card.thumbnailPlan?.concept || '',
    overlayText: card.thumbnailPlan?.overlayText || '',
    assetUrl: card.thumbnailPlan?.assetUrl || '',
    generationPrompt: card.thumbnailPlan?.generationPrompt || '',
    useRealPerson: card.thumbnailPlan?.useRealPerson ?? card.miniaturaChecklist?.rostro ?? false,
    face: card.miniaturaChecklist?.rostro || false,
    text: card.miniaturaChecklist?.texto || false,
    context: card.miniaturaChecklist?.contexto || false,
  });
  const [driveLinkDraft, setDriveLinkDraft] = useState(card.driveLinks?.thumbnail || '');

  useEffect(() => {
    if (!editing) {
      setDriveLinkDraft(card.driveLinks?.thumbnail || '');
      setDraft({
        status: (card.thumbnailPlan?.status || 'pending') as ThumbnailPlanStatus,
        concept: card.thumbnailPlan?.concept || '',
        overlayText: card.thumbnailPlan?.overlayText || '',
        assetUrl: card.thumbnailPlan?.assetUrl || '',
        generationPrompt: card.thumbnailPlan?.generationPrompt || '',
        useRealPerson: card.thumbnailPlan?.useRealPerson ?? card.miniaturaChecklist?.rostro ?? false,
        face: card.miniaturaChecklist?.rostro || false,
        text: card.miniaturaChecklist?.texto || false,
        context: card.miniaturaChecklist?.contexto || false,
      });
    }
  }, [editing, card.thumbnailPlan, card.miniaturaChecklist, card.driveLinks?.thumbnail]);

  useEffect(() => {
    setPanelRef(ref.current);
  }, [setPanelRef]);

  const save = () => {
    const updates: Partial<CardData> = {
      thumbnailPlan: {
        status: draft.status,
        concept: draft.concept,
        overlayText: draft.overlayText,
        assetUrl: draft.assetUrl,
        generationPrompt: draft.generationPrompt,
        useRealPerson: draft.useRealPerson,
      },
      miniaturaChecklist: {
        rostro: draft.face,
        texto: draft.text,
        contexto: draft.context,
      },
    };
    if (driveLinkDraft !== (card.driveLinks?.thumbnail || '')) {
      updates.driveLinks = { ...card.driveLinks, thumbnail: driveLinkDraft };
    }
    actions.updateCard(updates);
    setEditing(false);
  };

  const generatePrompt = () => {
    const nextPrompt = buildThumbnailGenerationPrompt(card, {
      concept: draft.concept,
      overlayText: draft.overlayText,
      includeFace: draft.face,
      includeText: draft.text,
      includeContext: draft.context,
      useRealPerson: draft.useRealPerson,
    });

    setDraft((previous) => ({
      ...previous,
      generationPrompt: nextPrompt,
    }));
  };

  const handleGenerateHybridPrompt = async () => {
    const basePrompt = buildThumbnailGenerationPrompt(card, {
      concept: draft.concept,
      overlayText: draft.overlayText,
      includeFace: draft.face,
      includeText: draft.text,
      includeContext: draft.context,
      useRealPerson: draft.useRealPerson,
    });

    setDraft((previous) => ({
      ...previous,
      generationPrompt: basePrompt,
    }));

    const variantResult = await ai.generateThumbnailPrompts({
      basePrompt,
      title: card.title,
      concept: draft.concept,
      overlayText: draft.overlayText,
      hook: card.gancho8s,
      useRealPerson: draft.useRealPerson,
    });
    const variants = variantResult?.draft;

    if (!variants?.length) return;

    const hybridPrompt = [
      'PROMPT BASE',
      basePrompt,
      '',
      'VARIANTE IA 1 · RESULTADO',
      variants[0]?.prompt || '',
      '',
      'VARIANTE IA 2 · FACILIDAD',
      variants[1]?.prompt || '',
      '',
      'VARIANTE IA 3 · RAPIDEZ',
      variants[2]?.prompt || '',
    ].join('\n');

    setDraft((previous) => ({
      ...previous,
      generationPrompt: hybridPrompt,
    }));
  };

  const checkCount = [
    card.miniaturaChecklist?.rostro,
    card.miniaturaChecklist?.texto,
    card.miniaturaChecklist?.contexto,
  ].filter(Boolean).length;

  const draftCheckCount = [draft.face, draft.text, draft.context].filter(Boolean).length;
  const config = PANEL_CONFIG.thumbnail;
  const thumbnailGenerationMeta = ai.lastThumbnailGeneration;
  const hasReference = !!card.thumbnailPlan?.assetUrl;
  const hasPrompt = !!card.thumbnailPlan?.generationPrompt?.trim();
  const personLabel = card.thumbnailPlan?.useRealPerson ? 'Persona real' : 'Sin persona';

  const preview = (
    <CollapsedPreview
      primary={hasPrompt ? 'Prompt visual listo' : card.thumbnailPlan?.concept || 'Miniatura pendiente'}
      secondary={`Estado: ${STATUS_LABELS[card.thumbnailPlan?.status || 'pending']} · Checklist: ${checkCount}/3`}
      chips={[
        STATUS_LABELS[card.thumbnailPlan?.status || 'pending'],
        hasPrompt ? 'Prompt listo' : 'Sin prompt',
        personLabel,
        `${checkCount}/3 elementos`,
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
                  Prompt visual del video
                </p>
                <p className="mt-1 text-sm leading-6" style={{ color: 'var(--ff-text-secondary)' }}>
                  El modo hibrido crea primero una base fuerte con reglas del sistema y luego la IA la refina en
                  variantes mas creativas para que elijas la mejor.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <AiButton
                  onClick={handleGenerateHybridPrompt}
                  loading={ai.isGeneratingThumbnailPrompt}
                  label={draft.generationPrompt.trim() ? 'Refinar con IA' : 'Crear prompt hibrido'}
                />
                <button
                  type="button"
                  onClick={generatePrompt}
                  className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
                  style={subtleButtonStyle}
                >
                  <Sparkles size={15} />
                  Solo base
                </button>
                <CopyPromptButton value={draft.generationPrompt} />
              </div>
            </div>
            {thumbnailGenerationMeta && (
              <p className="mt-3 text-xs leading-5" style={{ color: 'var(--ff-text-tertiary)' }}>
                Ultimo set: {thumbnailGenerationMeta.draft.length} variantes · {thumbnailGenerationMeta.promptVersion}
                {thumbnailGenerationMeta.warnings.length
                  ? ` · revisar ${thumbnailGenerationMeta.warnings.length} alerta(s)`
                  : ' · base y refinado listos para elegir'}
              </p>
            )}
          </div>

          <div>
            <span
              className="mb-2 block text-[11px] font-bold uppercase tracking-[0.16em]"
              style={{ color: 'var(--ff-text-tertiary)' }}
            >
              Estado
            </span>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setDraft((previous) => ({ ...previous, status }))}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold border transition-all ${
                    draft.status === status ? 'ring-2 ring-offset-1' : ''
                  }`}
                  style={draft.status === status ? flowPrimaryActionStyle : subtleButtonStyle}
                >
                  {STATUS_LABELS[status]}
                </button>
              ))}
            </div>
          </div>

          <TextField
            label="Concepto visual"
            value={draft.concept}
            onChange={(value) => setDraft((previous) => ({ ...previous, concept: value }))}
            placeholder="Que idea visual tiene que vender la miniatura?"
            multiline
            rows={2}
          />

          <TextField
            label="Texto sugerido para overlay"
            value={draft.overlayText}
            onChange={(value) => setDraft((previous) => ({ ...previous, overlayText: value }))}
            placeholder="Texto corto, fuerte y legible. Se agrega despues en edicion, no dentro de la imagen generada."
          />

          <div>
            <span
              className="mb-2 block text-[11px] font-bold uppercase tracking-[0.16em]"
              style={{ color: 'var(--ff-text-tertiary)' }}
            >
              Protagonista visual
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setDraft((previous) => ({ ...previous, useRealPerson: true }))}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold border transition-all ${
                  draft.useRealPerson ? 'ring-2 ring-offset-1' : ''
                }`}
                style={draft.useRealPerson ? flowPrimaryActionStyle : subtleButtonStyle}
              >
                Persona real
              </button>
              <button
                type="button"
                onClick={() => setDraft((previous) => ({ ...previous, useRealPerson: false }))}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold border transition-all ${
                  !draft.useRealPerson ? 'ring-2 ring-offset-1' : ''
                }`}
                style={!draft.useRealPerson ? flowPrimaryActionStyle : subtleButtonStyle}
              >
                Sin persona
              </button>
            </div>
            <p className="mt-2 text-xs" style={{ color: 'var(--ff-text-tertiary)' }}>
              Esto cambia el prompt para que la herramienta visual sepa si debe usar una persona humana real o resolver la miniatura con objetos y contexto.
            </p>
          </div>

          <TextField
            label="Prompt de miniatura"
            value={draft.generationPrompt}
            onChange={(value) => setDraft((previous) => ({ ...previous, generationPrompt: value }))}
            placeholder="Usa 'Crear prompt hibrido' para generar una base fuerte y luego refinarla con IA en varias variantes."
            multiline
            rows={14}
          />

          <TextField
            label="Referencia visual (opcional)"
            value={draft.assetUrl}
            onChange={(value) => setDraft((previous) => ({ ...previous, assetUrl: value }))}
            placeholder="https://drive.google.com/... o link de Figma"
          />

          <DriveLinkField
            label="Carpeta de assets de miniatura"
            value={driveLinkDraft}
            onChange={setDriveLinkDraft}
            placeholder="https://drive.google.com/... (fotos, PSD, recursos)"
            editing
          />

          <div>
            <span
              className="mb-2 block text-[11px] font-bold uppercase tracking-[0.16em]"
              style={{ color: 'var(--ff-text-tertiary)' }}
            >
              Regla de 3 elementos
            </span>
            <div className="space-y-2">
              {([
                ['face', 'Rostro o protagonista con expresion clara', draft.face],
                ['text', 'Texto corto, grande y legible', draft.text],
                ['context', 'Objeto o contexto que explique el conflicto', draft.context],
              ] as const).map(([key, label, checked]) => (
                <label key={key} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => setDraft((previous) => ({ ...previous, [key]: event.target.checked }))}
                    className="rounded"
                  />
                  <span className="text-sm" style={{ color: 'var(--ff-text-primary)' }}>
                    {label}
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs" style={{ color: 'var(--ff-text-tertiary)' }}>
              Activos: {draftCheckCount}/3. El playbook empuja miniaturas simples, de alto contraste y con una promesa clara.
            </p>
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
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-[1.1rem] border p-3" style={raisedPanelStyle}>
              <p
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: 'var(--ff-text-tertiary)' }}
              >
                Concepto
              </p>
              <p className="mt-1 text-sm" style={{ color: 'var(--ff-text-primary)' }}>
                {card.thumbnailPlan?.concept || 'Sin definir'}
              </p>
            </div>
            <div className="rounded-[1.1rem] border p-3" style={raisedPanelStyle}>
              <p
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: 'var(--ff-text-tertiary)' }}
              >
                Direccion visual
              </p>
              <div className="mt-1 space-y-1">
                <p className="text-sm" style={{ color: 'var(--ff-text-primary)' }}>
                  {card.thumbnailPlan?.useRealPerson ? '✓ Persona real fotorealista' : '○ Sin persona real'}
                </p>
                {[
                  ['Rostro', card.miniaturaChecklist?.rostro],
                  ['Texto', card.miniaturaChecklist?.texto],
                  ['Contexto', card.miniaturaChecklist?.contexto],
                ].map(([label, ok]) => (
                  <p
                    key={label as string}
                    className="text-sm"
                    style={{ color: ok ? 'var(--ff-success-text)' : 'var(--ff-text-secondary)' }}
                  >
                    {ok ? '✓' : '○'} {label as string}
                  </p>
                ))}
              </div>
            </div>
          </div>

          {card.thumbnailPlan?.overlayText && (
            <div className="rounded-[1.1rem] border p-3" style={raisedPanelStyle}>
              <p
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: 'var(--ff-text-tertiary)' }}
              >
                Texto sugerido para overlay
              </p>
              <p className="mt-1 text-sm" style={{ color: 'var(--ff-text-primary)' }}>
                {card.thumbnailPlan.overlayText}
              </p>
            </div>
          )}

          <div className="rounded-[1.1rem] border p-3" style={raisedPanelStyle}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p
                  className="text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: 'var(--ff-text-tertiary)' }}
                >
                  Prompt visual
                </p>
                <p className="mt-1 text-sm leading-6 whitespace-pre-wrap" style={{ color: 'var(--ff-text-primary)' }}>
                  {card.thumbnailPlan?.generationPrompt || 'Todavia no hay prompt. Entra a editar y usa "Crear prompt hibrido".'}
                </p>
              </div>
              <CopyPromptButton value={card.thumbnailPlan?.generationPrompt || ''} compact />
            </div>
          </div>

          {hasReference && (
            <div className="rounded-[1.1rem] border p-3" style={raisedPanelStyle}>
              <p
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: 'var(--ff-text-tertiary)' }}
              >
                Referencia visual
              </p>
              <a
                href={card.thumbnailPlan?.assetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex text-sm font-semibold"
                style={{ color: 'var(--ff-primary)' }}
              >
                Abrir referencia
              </a>
            </div>
          )}

          <DriveLinkField label="Assets de miniatura" value={card.driveLinks?.thumbnail || ''} editing={false} />
        </div>
      )}
    </PanelShell>
  );
}
