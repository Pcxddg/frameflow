import type { BriefSuggestionDraft, VideoSeedDraft } from './videoFlowAi';
import type { VideoSeoDraft as GeneratedVideoSeoDraft, SeoSourceUsed } from './videoSeoAi';

export type GenerationSource = 'gemini_flash';
export type TitleOrientation = 'SEO' | 'CLICK' | 'GAP' | 'OTHER';
export type ThumbnailVariantAngle = 'result' | 'ease' | 'speed';

export interface GenerationResult<T> {
  draft: T;
  source: GenerationSource;
  promptVersion: string;
  warnings: string[];
}

export interface TitleCandidate {
  id: string;
  text: string;
  orientation: TitleOrientation;
}

export interface TitleBatch {
  recommendedTitle: string;
  alternatives: TitleCandidate[];
  hook: string;
  researchSummary: string;
  openQuestions: string[];
  scriptBase: string;
}

export interface ScriptDraft {
  title: string;
  hook: string;
  scriptBase: string;
  researchSummary: string;
  openQuestions: string[];
}

export interface SeoDraft {
  descriptionBody: string;
  keywords: string[];
  hashtags: string[];
  sourceUsed: SeoSourceUsed;
}

export interface ThumbnailPromptVariant {
  angle: ThumbnailVariantAngle;
  label: string;
  prompt: string;
}

export const AI_PROMPT_VERSIONS = {
  brief: 'brief_v2',
  title: 'title_v2',
  script: 'script_v2',
  seo: 'seo_v2',
  thumbnail: 'thumbnail_v2',
} as const;

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  const next: string[] = [];

  values.forEach((value) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;

    seen.add(key);
    next.push(trimmed);
  });

  return next;
}

function buildCandidatesFromBucket(items: string[], orientation: Exclude<TitleOrientation, 'OTHER'>) {
  return items.map((text, index) => ({
    id: `${orientation.toLowerCase()}-${index + 1}`,
    text,
    orientation,
  }));
}

export function buildGenerationResult<T>(
  draft: T,
  promptVersion: string,
  warnings: string[] = [],
): GenerationResult<T> {
  return {
    draft,
    source: 'gemini_flash',
    promptVersion,
    warnings: uniqueStrings(warnings),
  };
}

export function buildBriefWarnings(draft: BriefSuggestionDraft) {
  const warnings: string[] = [];

  if (!draft.audience) warnings.push('La IA no devolvio una audiencia clara.');
  if (!draft.question) warnings.push('La IA no devolvio una pregunta central clara.');
  if (!draft.promise) warnings.push('La IA no devolvio una promesa concreta.');

  return warnings;
}

export function buildTitleBatch(seed: VideoSeedDraft): TitleBatch {
  const bucketCandidates = [
    ...buildCandidatesFromBucket(seed.titleBuckets?.seo || [], 'SEO'),
    ...buildCandidatesFromBucket(seed.titleBuckets?.click || [], 'CLICK'),
    ...buildCandidatesFromBucket(seed.titleBuckets?.gap || [], 'GAP'),
  ];

  const used = new Set(bucketCandidates.map((candidate) => candidate.text.toLowerCase()));
  const fallbackCandidates = seed.titleAlternatives
    .filter((text) => !used.has(text.toLowerCase()))
    .map((text, index) => ({
      id: `other-${index + 1}`,
      text,
      orientation: 'OTHER' as const,
    }));

  return {
    recommendedTitle: seed.title,
    alternatives: [...bucketCandidates, ...fallbackCandidates].slice(0, 10),
    hook: seed.hook,
    researchSummary: seed.researchSummary,
    openQuestions: seed.openQuestions,
    scriptBase: seed.scriptBase,
  };
}

export function buildTitleWarnings(batch: TitleBatch) {
  const warnings: string[] = [];

  if (batch.alternatives.length < 10) warnings.push('La IA devolvio menos de 10 titulos unicos.');
  if (!batch.hook) warnings.push('La IA no devolvio un hook util para validar.');
  if (!batch.recommendedTitle) warnings.push('No hay un titulo recomendado marcado por la IA.');

  return warnings;
}

export function buildScriptDraft(seed: VideoSeedDraft): ScriptDraft {
  return {
    title: seed.title,
    hook: seed.hook,
    scriptBase: seed.scriptBase,
    researchSummary: seed.researchSummary,
    openQuestions: seed.openQuestions,
  };
}

export function buildScriptWarnings(draft: ScriptDraft) {
  const warnings: string[] = [];

  if (!draft.scriptBase) warnings.push('La IA no devolvio una escaleta util.');
  if (!draft.hook) warnings.push('El guion se genero sin hook sugerido.');
  if (!draft.researchSummary) warnings.push('El guion no vino acompanado de research resumido.');

  return warnings;
}

export function buildSeoDraft(draft: GeneratedVideoSeoDraft): SeoDraft {
  return {
    descriptionBody: draft.descriptionBody,
    keywords: uniqueStrings(draft.keywords),
    hashtags: uniqueStrings(draft.hashtags).slice(0, 3),
    sourceUsed: draft.sourceUsed,
  };
}

export function buildSeoWarnings(draft: SeoDraft) {
  const warnings: string[] = [];

  if (!draft.descriptionBody) warnings.push('La descripcion SEO llego vacia.');
  if (draft.keywords.length < 6) warnings.push('La IA devolvio menos keywords de las esperadas.');
  if (draft.hashtags.length < 3) warnings.push('La IA devolvio menos de 3 hashtags.');

  return warnings;
}

export function buildThumbnailPromptVariants(variants: string[]): ThumbnailPromptVariant[] {
  const labels: Array<{ angle: ThumbnailVariantAngle; label: string }> = [
    { angle: 'result', label: 'Resultado' },
    { angle: 'ease', label: 'Facilidad' },
    { angle: 'speed', label: 'Rapidez' },
  ];

  return labels.map((meta, index) => ({
    ...meta,
    prompt: variants[index]?.trim() || '',
  })).filter((variant) => variant.prompt);
}

export function buildThumbnailWarnings(variants: ThumbnailPromptVariant[]) {
  const warnings: string[] = [];

  if (variants.length < 3) warnings.push('La IA devolvio menos de 3 variantes de miniatura.');

  return warnings;
}
