import { GEMINI_FLASH_MODEL, generateContentWithRetry } from './gemini';
import { stripMarkdownCodeFence } from './aiParsing';

export interface VideoSeedGenerationInput {
  idea: string;
  audience?: string;
  question?: string;
  promise?: string;
  tone?: string;
  creatorNotes?: string;
  existingTitles?: string[];
}

export interface VideoSeedDraft {
  title: string;
  titleAlternatives: string[];
  titleBuckets?: {
    seo: string[];
    click: string[];
    gap: string[];
  };
  hook: string;
  researchSummary: string;
  openQuestions: string[];
  scriptBase: string;
}

export interface BriefSuggestionDraft {
  audience: string;
  question: string;
  promise: string;
  tone: string;
  creatorNotes: string;
}

export type VideoSeedSection = 'title' | 'hook' | 'research' | 'script';
type GenerationFocus = 'package' | VideoSeedSection;

const DEFAULT_TITLE = 'Titulo provisional por validar';

function normalizeString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function normalizeTitleBuckets(value: unknown) {
  if (!value || typeof value !== 'object') {
    return { seo: [], click: [], gap: [] };
  }

  const bucket = value as Record<string, unknown>;
  return {
    seo: normalizeStringArray(bucket.seo),
    click: normalizeStringArray(bucket.click),
    gap: normalizeStringArray(bucket.gap),
  };
}

function parseBriefResponse(text?: string | null): BriefSuggestionDraft {
  const cleaned = stripMarkdownCodeFence(text || '');
  const parsed = JSON.parse(cleaned || '{}') as Record<string, unknown>;

  return {
    audience: normalizeString(parsed.audience),
    question: normalizeString(parsed.question),
    promise: normalizeString(parsed.promise),
    tone: normalizeString(parsed.tone),
    creatorNotes: normalizeString(parsed.creatorNotes),
  };
}

function parseDraftResponse(text?: string | null): VideoSeedDraft {
  const cleaned = stripMarkdownCodeFence(text || '');
  const parsed = JSON.parse(cleaned || '{}') as Record<string, unknown>;

  return {
    title: normalizeString(parsed.title, DEFAULT_TITLE),
    titleAlternatives: normalizeStringArray(parsed.titleAlternatives),
    titleBuckets: normalizeTitleBuckets(parsed.titleBuckets),
    hook: normalizeString(parsed.hook),
    researchSummary: normalizeString(parsed.researchSummary),
    openQuestions: normalizeStringArray(parsed.openQuestions),
    scriptBase: normalizeString(parsed.scriptBase),
  };
}

function buildPrompt(input: VideoSeedGenerationInput, focus: GenerationFocus) {
  const sharedContext = [
    `Idea: ${input.idea.trim()}`,
    `Audiencia: ${input.audience?.trim() || 'Sin especificar'}`,
    `Pregunta exacta: ${input.question?.trim() || 'Sin especificar'}`,
    `Promesa del video: ${input.promise?.trim() || 'Sin especificar'}`,
    `Tono: ${input.tone?.trim() || 'Sin especificar'}`,
    `Notas del creador: ${input.creatorNotes?.trim() || 'Sin especificar'}`,
    `Titulos ya generados: ${input.existingTitles?.length ? input.existingTitles.join(' | ') : 'Ninguno'}`,
  ].join('\n');

  const focusInstruction =
    focus === 'title'
      ? 'Devuelve exactamente 10 titulos nuevos para testear en titleAlternatives y marca en title la opcion favorita de ese lote.'
      : focus === 'hook'
      ? 'Devuelve solo un hook de 5 a 10 segundos.'
      : focus === 'research'
      ? 'Devuelve solo un resumen breve de investigacion y preguntas abiertas que falte validar.'
      : focus === 'script'
      ? 'Devuelve solo una escaleta base del guion.'
      : 'Devuelve el paquete base completo: titulo recomendado, exactamente 10 alternativas nuevas, hook, resumen de investigacion, preguntas abiertas y escaleta base.';

  const outputRules = `
Responde SOLO JSON valido, sin markdown ni texto adicional.
Usa exactamente esta forma:
{
  "title": "string",
  "titleAlternatives": ["string"],
  "titleBuckets": {
    "seo": ["string"],
    "click": ["string"],
    "gap": ["string"]
  },
  "hook": "string",
  "researchSummary": "string",
  "openQuestions": ["string"],
  "scriptBase": "string"
}

Si un campo no aplica al foco pedido, devuelve string vacio o array vacio.
El titulo debe ser claro, con potencial de CTR, pero sin clickbait hueco.
Cuando el foco sea "title" o "package":
- titleAlternatives debe tener exactamente 10 strings.
- title debe ser la opcion mas fuerte del lote, pero no debe repetirse literalmente dentro de titleAlternatives.
- titleAlternatives no debe repetir ningun titulo ya listado en "Titulos ya generados".
- titleBuckets debe separar esos mismos 10 titulos en:
  - seo: titulos buscables / cola larga
  - click: titulos de intriga / cliqueables
  - gap: titulos hibridos con brecha de curiosidad y promesa de valor
- cada bucket debe tener al menos 2 titulos.
- la suma total de titleBuckets debe cubrir exactamente los 10 titulos del lote sin repetir.
El hook debe abrir curiosidad concreta.
La investigacion debe ser breve, util y accionable.
La escaleta debe venir por bloques faciles de editar a mano.
`;

  return `
Eres un estratega senior de contenido para YouTube. Tu tarea es ayudar a sembrar un video largo desde una idea inicial.

${focusInstruction}

Contexto:
${sharedContext}

${outputRules}
`.trim();
}

export async function generateVideoSeedDraft(
  input: VideoSeedGenerationInput,
  focus: GenerationFocus = 'package'
) {
  const response = await generateContentWithRetry({
    model: GEMINI_FLASH_MODEL,
    contents: buildPrompt(input, focus),
  });

  return parseDraftResponse(response.text);
}

export async function generateBriefSuggestions(input: VideoSeedGenerationInput) {
  const response = await generateContentWithRetry({
    model: GEMINI_FLASH_MODEL,
    contents: `
Eres un estratega senior de contenido para YouTube. A partir de una idea inicial, sugiere un brief operativo corto y util.

Contexto:
Idea: ${input.idea.trim()}
Audiencia actual: ${input.audience?.trim() || 'Sin especificar'}
Pregunta actual: ${input.question?.trim() || 'Sin especificar'}
Promesa actual: ${input.promise?.trim() || 'Sin especificar'}
Tono actual: ${input.tone?.trim() || 'Sin especificar'}
Notas del creador actuales: ${input.creatorNotes?.trim() || 'Sin especificar'}

Responde SOLO JSON valido, sin markdown ni texto adicional:
{
  "audience": "string",
  "question": "string",
  "promise": "string",
  "tone": "string",
  "creatorNotes": "string"
}

Reglas:
- audience: breve y concreta.
- question: una sola pregunta clara.
- promise: una sola promesa fuerte.
- tone: 2 a 5 palabras maximo.
- creatorNotes: notas utiles para investigacion, visuales o enfoque, no muy largas.
`.trim(),
  });

  return parseBriefResponse(response.text);
}
