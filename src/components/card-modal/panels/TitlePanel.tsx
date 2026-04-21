import { useRef, useState, useEffect } from 'react';
import { Pencil } from 'lucide-react';
import type { CardData } from '../../../types';
import type { CardActions, CardAiState } from '../types';
import { PanelShell } from '../shared/PanelShell';
import { CollapsedPreview } from '../shared/CollapsedPreview';
import { TextField } from '../shared/TextField';
import { AiButton } from '../shared/AiButton';
import { PANEL_CONFIG } from '../constants';
import { subtleButtonStyle, flowPrimaryActionStyle } from '../hooks/useFlowStyles';

type TitleOrientation = 'SEO' | 'CLICK' | 'GAP' | 'OTHER';

interface TitleEntry {
  label: TitleOrientation;
  text: string;
}

function parseTitleEntries(text: string): TitleEntry[] {
  return text
    .split('\n')
    .map((rawLine) => {
      const line = rawLine.trim();
      if (!line) return null;
      const cleaned = line.replace(/^\s*\d+[\)\].:-]?\s*/, '').trim();
      if (!cleaned) return null;

      const tagMatch = cleaned.match(/^\[(SEO|CLICK|GAP)\]\s*(.+)$/i);
      if (tagMatch) {
        return {
          label: tagMatch[1].toUpperCase() as TitleOrientation,
          text: tagMatch[2].trim(),
        };
      }

      if (/^[A-Z\s/]+:?$/.test(cleaned) && cleaned.length < 40) return null;
      return { label: 'OTHER' as const, text: cleaned };
    })
    .filter((entry): entry is TitleEntry => !!entry && !!entry.text);
}

function dedupeEntries(entries: TitleEntry[]) {
  const unique: TitleEntry[] = [];
  for (const entry of entries) {
    if (!unique.some((item) => item.text.toLowerCase() === entry.text.toLowerCase())) {
      unique.push(entry);
    }
  }
  return unique;
}

function formatTitleLines(entries: TitleEntry[]) {
  return entries
    .map((entry, index) => {
      const tag = entry.label === 'OTHER' ? '' : `[${entry.label}] `;
      return `${index + 1}. ${tag}${entry.text}`;
    })
    .join('\n');
}

function groupEntries(entries: TitleEntry[]) {
  return {
    seo: entries.filter((entry) => entry.label === 'SEO'),
    click: entries.filter((entry) => entry.label === 'CLICK'),
    gap: entries.filter((entry) => entry.label === 'GAP'),
    other: entries.filter((entry) => entry.label === 'OTHER'),
  };
}

interface TitlePanelProps {
  card: CardData;
  expanded: boolean;
  onToggle: () => void;
  actions: CardActions;
  ai: CardAiState;
  readOnly: boolean;
  setPanelRef: (el: HTMLDivElement | null) => void;
}

export function TitlePanel({ card, expanded, onToggle, actions, ai, readOnly, setPanelRef }: TitlePanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    titleAlternatives: card.titulosLinden || '',
    hook: card.gancho8s || '',
    thumbnailConcept: card.thumbnailPlan?.concept || '',
  });

  useEffect(() => {
    if (!editing) {
      setDraft({
        titleAlternatives: card.titulosLinden || '',
        hook: card.gancho8s || '',
        thumbnailConcept: card.thumbnailPlan?.concept || '',
      });
    }
  }, [editing, card.titulosLinden, card.gancho8s, card.thumbnailPlan?.concept]);

  useEffect(() => {
    setPanelRef(ref.current);
  }, [setPanelRef]);

  const save = () => {
    actions.updateCard({
      titulosLinden: draft.titleAlternatives,
      gancho8s: draft.hook,
      thumbnailPlan: {
        ...card.thumbnailPlan,
        status: card.thumbnailPlan?.status || 'pending',
        concept: draft.thumbnailConcept,
        overlayText: card.thumbnailPlan?.overlayText || '',
        assetUrl: card.thumbnailPlan?.assetUrl || '',
        generationPrompt: card.thumbnailPlan?.generationPrompt || '',
        useRealPerson: card.thumbnailPlan?.useRealPerson || false,
      },
    });
    setEditing(false);
  };

  const handleGenerateTitles = async () => {
    const existingEntries = parseTitleEntries(draft.titleAlternatives);
    const suggestionResult = await ai.generateTitles({
      existingTitles: existingEntries.map((entry) => entry.text),
    });
    const suggestion = suggestionResult?.draft;
    if (!suggestion) return;

    const nextBatch = suggestion.alternatives.map((entry) => ({
      label: entry.orientation,
      text: entry.text,
    }));
    setDraft((previous) => ({
      ...previous,
      titleAlternatives: formatTitleLines(dedupeEntries([...existingEntries, ...nextBatch])),
      hook: suggestion.hook || previous.hook,
    }));
  };

  const titleEntries = parseTitleEntries(card.titulosLinden || '');
  const groupedTitleEntries = groupEntries(titleEntries);
  const draftEntries = parseTitleEntries(draft.titleAlternatives);
  const draftTitleCount = draftEntries.length;
  const config = PANEL_CONFIG.title;
  const titleGenerationMeta = ai.lastTitleGeneration;

  const preview = (
    <CollapsedPreview
      primary={card.title || 'Titulo pendiente'}
      secondary={card.gancho8s || 'Hook y titulos se cierran aqui.'}
      chips={[
        titleEntries.length ? `${titleEntries.length} titulos` : '',
        card.gancho8s ? 'Hook listo' : '',
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
                    Cada clic te agrega 10 titulos nuevos al borrador actual, separados por orientacion del playbook:
                    SEO, intriga cliqueable y curiosidad con promesa de valor.
                    Tu corriges el borrador aqui y luego decides si lo guardas.
                  </p>
                </div>
                <AiButton
                  onClick={handleGenerateTitles}
                  loading={ai.isGeneratingTitles}
                  label={draftTitleCount > 0 ? 'Generar 10 titulos mas' : 'Generar 10 titulos con IA'}
                />
              </div>
              {titleGenerationMeta && (
                <p className="mt-3 text-xs leading-5" style={{ color: 'var(--ff-text-tertiary)' }}>
                  Ultimo lote: {titleGenerationMeta.draft.alternatives.length} titulos · {titleGenerationMeta.promptVersion}
                  {titleGenerationMeta.warnings.length
                    ? ` · revisar ${titleGenerationMeta.warnings.length} alerta(s)`
                    : ' · lote estructurado y listo para revisar'}
                </p>
              )}
            </div>
          )}

          <TextField
            label="Variaciones de titulo (Metodo Linden)"
            value={draft.titleAlternatives}
            onChange={(value) => setDraft((previous) => ({ ...previous, titleAlternatives: value }))}
            placeholder={'1. [SEO] Como...\n2. [CLICK] ...\n3. [GAP] ...'}
            multiline
            rows={8}
          />
          <TextField
            label="Gancho de 8 segundos"
            value={draft.hook}
            onChange={(value) => setDraft((previous) => ({ ...previous, hook: value }))}
            placeholder="Start with the End, Dolor o Ruptura de Patron..."
            multiline
            rows={3}
          />
          <TextField
            label="Concepto de miniatura"
            value={draft.thumbnailConcept}
            onChange={(value) => setDraft((previous) => ({ ...previous, thumbnailConcept: value }))}
            placeholder="Que idea visual transmite la miniatura?"
            multiline
            rows={2}
          />
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
          {titleEntries.length > 0 && (
            <div
              className="rounded-[1.1rem] border p-3"
              style={{ borderColor: 'var(--ff-border)', background: 'var(--ff-surface-raised)' }}
            >
              <p
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: 'var(--ff-text-tertiary)' }}
              >
                Titulos ({titleEntries.length})
              </p>
              <div className="mt-3 space-y-3">
                {[
                  { key: 'seo', label: 'SEO / Buscables', entries: groupedTitleEntries.seo },
                  { key: 'click', label: 'Intriga / Cliqueables', entries: groupedTitleEntries.click },
                  { key: 'gap', label: 'Curiosity Gap / Hibridos', entries: groupedTitleEntries.gap },
                  { key: 'other', label: 'Sin clasificar', entries: groupedTitleEntries.other },
                ]
                  .filter((group) => group.entries.length > 0)
                  .map((group) => (
                    <div key={group.key}>
                      <p
                        className="text-[10px] font-bold uppercase tracking-wider"
                        style={{ color: 'var(--ff-text-tertiary)' }}
                      >
                        {group.label} ({group.entries.length})
                      </p>
                      <ol className="mt-2 space-y-1">
                        {group.entries.map((entry) => {
                          const absoluteIndex = titleEntries.findIndex(
                            (item) => item.text === entry.text && item.label === entry.label
                          );
                          return (
                            <li key={`${group.key}-${entry.text}`} className="text-sm" style={{ color: 'var(--ff-text-primary)' }}>
                              <span className="mr-2 text-xs font-bold" style={{ color: 'var(--ff-text-tertiary)' }}>
                                {absoluteIndex + 1}.
                              </span>
                              {entry.text}
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  ))}
              </div>
            </div>
          )}
          {card.gancho8s && (
            <div
              className="rounded-[1.1rem] border p-3"
              style={{ borderColor: 'var(--ff-border)', background: 'var(--ff-surface-raised)' }}
            >
              <p
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: 'var(--ff-text-tertiary)' }}
              >
                Gancho 8s
              </p>
              <p className="mt-1 text-sm" style={{ color: 'var(--ff-text-primary)' }}>
                {card.gancho8s}
              </p>
            </div>
          )}
          {!titleEntries.length && !card.gancho8s && (
            <p className="text-sm" style={{ color: 'var(--ff-text-secondary)' }}>
              Abre edicion para generar titulos con IA o escribirlos manualmente.
            </p>
          )}
        </div>
      )}
    </PanelShell>
  );
}
