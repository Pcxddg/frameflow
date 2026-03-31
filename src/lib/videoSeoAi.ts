import type { BoardSeoConfig, ProductionBrief } from '../types';
import { GEMINI_FLASH_MODEL, generateContentWithRetry } from './gemini';

export type SeoSourceUsed = 'seoSourceText' | 'guion' | 'brief';

export interface VideoSeoGenerationInput {
  title: string;
  productionBrief?: Partial<ProductionBrief> | null;
  hook?: string;
  script?: string;
  seededTitles?: string[];
  seoSourceText?: string;
  channelSeoConfig?: Partial<BoardSeoConfig> | null;
}

export interface VideoSeoDraft {
  descriptionBody: string;
  keywords: string[];
  hashtags: string[];
  sourceUsed: SeoSourceUsed;
}

function stripMarkdownCodeFence(raw: string) {
  return raw
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
}

function normalizeString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeStringArray(value: unknown, limit = 10) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, limit);
}

function pickSeoSource(input: VideoSeoGenerationInput) {
  const seoSourceText = input.seoSourceText?.trim();
  if (seoSourceText) {
    return { sourceUsed: 'seoSourceText' as const, sourceText: seoSourceText };
  }

  const script = input.script?.trim();
  if (script) {
    return { sourceUsed: 'guion' as const, sourceText: script };
  }

  const brief = input.productionBrief;
  const sourceText = [
    brief?.idea ? `Idea: ${brief.idea}` : '',
    brief?.audience ? `Audiencia: ${brief.audience}` : '',
    brief?.question ? `Pregunta: ${brief.question}` : '',
    brief?.promise ? `Promesa: ${brief.promise}` : '',
    brief?.tone ? `Tono: ${brief.tone}` : '',
    brief?.creatorNotes ? `Notas del creador: ${brief.creatorNotes}` : '',
    brief?.researchSummary ? `Research: ${brief.researchSummary}` : '',
    brief?.openQuestions?.length ? `Preguntas abiertas: ${brief.openQuestions.join(' | ')}` : '',
  ].filter(Boolean).join('\n');

  return { sourceUsed: 'brief' as const, sourceText };
}

function buildPrompt(input: VideoSeoGenerationInput, sourceUsed: SeoSourceUsed, sourceText: string) {
  const brief = input.productionBrief;
  const seededTitles = (input.seededTitles || []).filter(Boolean).join(' | ') || 'Sin titulos sembrados';

  return `
Eres un estratega senior de SEO para YouTube. Tu tarea es preparar un borrador SEO de alta calidad para un video, usando primero la fuente real del contenido.

Prioridad de fuente ya resuelta por la app: ${sourceUsed}

Contexto del video:
Titulo actual: ${input.title.trim()}
Idea: ${brief?.idea?.trim() || 'Sin especificar'}
Audiencia: ${brief?.audience?.trim() || 'Sin especificar'}
Pregunta exacta: ${brief?.question?.trim() || 'Sin especificar'}
Promesa: ${brief?.promise?.trim() || 'Sin especificar'}
Tono: ${brief?.tone?.trim() || 'Sin especificar'}
Notas del creador: ${brief?.creatorNotes?.trim() || 'Sin especificar'}
Gancho sembrado: ${input.hook?.trim() || 'Sin especificar'}
Titulos sembrados: ${seededTitles}

Datos fijos del canal:
Link del producto: ${input.channelSeoConfig?.productUrl?.trim() || 'No configurado'}
Instagram: ${input.channelSeoConfig?.instagramUrl?.trim() || 'No configurado'}
TikTok: ${input.channelSeoConfig?.tiktokUrl?.trim() || 'No configurado'}
Correo de colaboraciones: ${input.channelSeoConfig?.collabEmail?.trim() || 'No configurado'}

Fuente principal del contenido:
"""
${sourceText || 'Sin fuente detallada. Trabaja con el brief.'}
"""

Responde SOLO JSON valido, sin markdown ni texto adicional:
{
  "descriptionBody": "string",
  "keywords": ["string"],
  "hashtags": ["string"]
}

Reglas:
- descriptionBody debe ser una descripcion SEO util para YouTube, clara, natural y lista para incrustarse en una plantilla fija.
- No repitas literalmente el titulo demasiadas veces.
- keywords debe traer entre 6 y 10 keywords long-tail limpias, sin numeracion.
- hashtags debe traer exactamente 3 hashtags relevantes.
- No metas interlinking.
- No metas secciones de redes, producto o colaboraciones dentro de descriptionBody porque la app las inserta aparte.
`.trim();
}

function parseDraftResponse(text?: string | null) {
  const cleaned = stripMarkdownCodeFence(text || '');
  const parsed = JSON.parse(cleaned || '{}') as Record<string, unknown>;

  return {
    descriptionBody: normalizeString(parsed.descriptionBody),
    keywords: normalizeStringArray(parsed.keywords),
    hashtags: normalizeStringArray(parsed.hashtags, 3).slice(0, 3),
  };
}

export async function generateVideoSeoDraft(input: VideoSeoGenerationInput): Promise<VideoSeoDraft> {
  const { sourceUsed, sourceText } = pickSeoSource(input);

  const response = await generateContentWithRetry({
    model: GEMINI_FLASH_MODEL,
    contents: buildPrompt(input, sourceUsed, sourceText),
  });

  const parsed = parseDraftResponse(response.text);

  return {
    ...parsed,
    sourceUsed,
  };
}
