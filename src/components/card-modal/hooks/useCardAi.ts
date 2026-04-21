import { useState, useCallback } from 'react';
import type { CardData, ProductionBrief } from '../../../types';
import type {
  CardActions,
  CardAiState,
  CardAiSeedOverrides,
  CardAiSeoOverrides,
  ThumbnailPromptAiInput,
} from '../types';
import {
  GEMINI_FLASH_MODEL,
  generateContentWithRetry,
  getAiErrorMessage,
} from '../../../lib/gemini';
import {
  generateBriefSuggestions,
  type BriefSuggestionDraft,
  generateVideoSeedDraft,
  type VideoSeedGenerationInput,
} from '../../../lib/videoFlowAi';
import { generateVideoSeoDraft } from '../../../lib/videoSeoAi';
import {
  AI_PROMPT_VERSIONS,
  buildBriefWarnings,
  buildGenerationResult,
  buildScriptDraft,
  buildScriptWarnings,
  buildSeoDraft,
  buildSeoWarnings,
  buildThumbnailPromptVariants,
  buildThumbnailWarnings,
  buildTitleBatch,
  buildTitleWarnings,
  type GenerationResult,
  type ScriptDraft,
  type SeoDraft,
  type ThumbnailPromptVariant,
  type TitleBatch,
} from '../../../lib/aiContracts';
import { trackProductEvent } from '../../../lib/analytics';
import { stripMarkdownCodeFence } from '../../../lib/aiParsing';
import { useBoard } from '../../../store';

function trimOptional(value?: string) {
  return value?.trim() || '';
}

function parseTitleLines(text?: string) {
  return (text || '')
    .split('\n')
    .map((line) => line.replace(/^\s*\d+[\)\].:-]?\s*/, '').replace(/^\[(SEO|CLICK|GAP)\]\s*/i, '').trim())
    .filter(Boolean);
}

function parseThumbnailPromptVariants(text?: string | null) {
  const cleaned = stripMarkdownCodeFence(text || '');
  const parsed = JSON.parse(cleaned || '{}') as { variants?: unknown };
  if (!Array.isArray(parsed.variants)) return [];
  return parsed.variants
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, 3);
}

function mergeProductionBrief(
  base?: Partial<ProductionBrief> | null,
  override?: Partial<ProductionBrief> | null
): Partial<ProductionBrief> | null {
  if (!base && !override) return null;
  return {
    ...(base || {}),
    ...(override || {}),
  };
}

export function useCardAi(card: CardData, actions: CardActions, readOnly: boolean): CardAiState {
  const { board } = useBoard();

  const [isGeneratingTitles, setIsGeneratingTitles] = useState(false);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);
  const [isImprovingTitle, setIsImprovingTitle] = useState(false);
  const [isSuggestingKeywords, setIsSuggestingKeywords] = useState(false);
  const [isAnalyzingScript, setIsAnalyzingScript] = useState(false);
  const [isGeneratingThumbnailPrompt, setIsGeneratingThumbnailPrompt] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [suggestedTitle, setSuggestedTitle] = useState<string | null>(null);
  const [scriptAnalysis, setScriptAnalysis] = useState<string | null>(null);
  const [lastBriefSuggestion, setLastBriefSuggestion] = useState<GenerationResult<BriefSuggestionDraft> | null>(null);
  const [lastTitleGeneration, setLastTitleGeneration] = useState<GenerationResult<TitleBatch> | null>(null);
  const [lastScriptGeneration, setLastScriptGeneration] = useState<GenerationResult<ScriptDraft> | null>(null);
  const [lastSeoGeneration, setLastSeoGeneration] = useState<GenerationResult<SeoDraft> | null>(null);
  const [lastThumbnailGeneration, setLastThumbnailGeneration] = useState<GenerationResult<ThumbnailPromptVariant[]> | null>(null);

  const buildSeedInput = useCallback((overrides?: CardAiSeedOverrides): VideoSeedGenerationInput => ({
    idea: trimOptional(overrides?.idea) || trimOptional(card.title),
    audience: trimOptional(overrides?.audience) || trimOptional(card.productionBrief?.audience),
    question: trimOptional(overrides?.question) || trimOptional(card.productionBrief?.question),
    promise: trimOptional(overrides?.promise) || trimOptional(card.productionBrief?.promise),
    tone: trimOptional(overrides?.tone) || trimOptional(card.productionBrief?.tone),
    creatorNotes: trimOptional(overrides?.creatorNotes) || trimOptional(card.productionBrief?.creatorNotes),
    existingTitles: overrides?.existingTitles?.length ? overrides.existingTitles : parseTitleLines(card.titulosLinden),
  }), [card.title, card.productionBrief, card.titulosLinden]);

  const buildSeoInput = useCallback((overrides?: CardAiSeoOverrides) => ({
    title: trimOptional(overrides?.title) || trimOptional(card.title),
    productionBrief: mergeProductionBrief(card.productionBrief, overrides?.productionBrief),
    hook: trimOptional(overrides?.hook) || trimOptional(card.gancho8s),
    script: trimOptional(overrides?.script) || trimOptional(card.guion),
    seededTitles: overrides?.seededTitles ?? (card.titulosLinden || '').split('\n').map((line) => line.trim()).filter(Boolean),
    seoSourceText: trimOptional(overrides?.seoSourceText) || trimOptional(card.seoSourceText),
    channelSeoConfig: overrides?.channelSeoConfig ?? board?.seoConfig,
  }), [board?.seoConfig, card.gancho8s, card.guion, card.productionBrief, card.seoSourceText, card.title, card.titulosLinden]);

  const suggestBrief = useCallback(async (input: VideoSeedGenerationInput) => {
    if (readOnly) return null;
    setAiNotice(null);
    try {
      const suggestion = await generateBriefSuggestions(input);
      const nextResult = buildGenerationResult(
        suggestion,
        AI_PROMPT_VERSIONS.brief,
        buildBriefWarnings(suggestion),
      );
      setLastBriefSuggestion(nextResult);
      trackProductEvent('brief_ai_suggested', {
        board_id: board?.id || null,
        card_id: card.id,
        content_type: card.contentType || 'undefined',
        prompt_version: nextResult.promptVersion,
        warnings_count: nextResult.warnings.length,
      });
      return nextResult;
    } catch (error) {
      setAiNotice(getAiErrorMessage(error, 'No se pudo completar el brief con IA.'));
      return null;
    }
  }, [board?.id, card.contentType, card.id, readOnly]);

  const generateTitles = useCallback(async (overrides?: CardAiSeedOverrides) => {
    if (readOnly || isGeneratingTitles) return null;
    setIsGeneratingTitles(true);
    setAiNotice(null);
    try {
      const rawDraft = await generateVideoSeedDraft(buildSeedInput(overrides), 'title');
      const titleBatch = buildTitleBatch(rawDraft);
      const nextResult = buildGenerationResult(
        titleBatch,
        AI_PROMPT_VERSIONS.title,
        buildTitleWarnings(titleBatch),
      );
      setLastTitleGeneration(nextResult);
      trackProductEvent('titles_generated', {
        board_id: board?.id || null,
        card_id: card.id,
        content_type: card.contentType || 'undefined',
        prompt_version: nextResult.promptVersion,
        warnings_count: nextResult.warnings.length,
        title_count: nextResult.draft.alternatives.length,
      });
      return nextResult;
    } catch (error) {
      setAiNotice(getAiErrorMessage(error, 'No se pudieron generar titulos con IA.'));
      return null;
    } finally {
      setIsGeneratingTitles(false);
    }
  }, [board?.id, buildSeedInput, card.contentType, card.id, isGeneratingTitles, readOnly]);

  const generateScript = useCallback(async (overrides?: CardAiSeedOverrides) => {
    if (readOnly || isGeneratingScript) return null;
    setIsGeneratingScript(true);
    setAiNotice(null);
    try {
      const rawDraft = await generateVideoSeedDraft(buildSeedInput(overrides), 'script');
      const scriptDraft = buildScriptDraft(rawDraft);
      const nextResult = buildGenerationResult(
        scriptDraft,
        AI_PROMPT_VERSIONS.script,
        buildScriptWarnings(scriptDraft),
      );
      setLastScriptGeneration(nextResult);
      trackProductEvent('script_generated', {
        board_id: board?.id || null,
        card_id: card.id,
        content_type: card.contentType || 'undefined',
        prompt_version: nextResult.promptVersion,
        warnings_count: nextResult.warnings.length,
        has_hook: !!nextResult.draft.hook,
      });
      return nextResult;
    } catch (error) {
      setAiNotice(getAiErrorMessage(error, 'No se pudo generar el guion.'));
      return null;
    } finally {
      setIsGeneratingScript(false);
    }
  }, [board?.id, buildSeedInput, card.contentType, card.id, isGeneratingScript, readOnly]);

  const generateDescription = useCallback(async (overrides?: CardAiSeoOverrides) => {
    if (readOnly || isGeneratingDesc) return null;
    setIsGeneratingDesc(true);
    setAiNotice(null);
    try {
      const rawDraft = await generateVideoSeoDraft(buildSeoInput(overrides));
      const seoDraft = buildSeoDraft(rawDraft);
      const nextResult = buildGenerationResult(
        seoDraft,
        AI_PROMPT_VERSIONS.seo,
        buildSeoWarnings(seoDraft),
      );
      setLastSeoGeneration(nextResult);
      return nextResult;
    } catch (error) {
      setAiNotice(getAiErrorMessage(error, 'No se pudo generar la descripcion SEO.'));
      return null;
    } finally {
      setIsGeneratingDesc(false);
    }
  }, [readOnly, isGeneratingDesc, buildSeoInput]);

  const suggestKeywords = useCallback(async (overrides?: CardAiSeoOverrides) => {
    if (readOnly || isSuggestingKeywords) return null;
    setIsSuggestingKeywords(true);
    setAiNotice(null);
    try {
      const rawDraft = await generateVideoSeoDraft(buildSeoInput(overrides));
      const seoDraft = buildSeoDraft(rawDraft);
      const nextResult = buildGenerationResult(
        seoDraft,
        AI_PROMPT_VERSIONS.seo,
        buildSeoWarnings(seoDraft),
      );
      setLastSeoGeneration(nextResult);
      return nextResult;
    } catch (error) {
      setAiNotice(getAiErrorMessage(error, 'No se pudieron sugerir keywords.'));
      return null;
    } finally {
      setIsSuggestingKeywords(false);
    }
  }, [readOnly, isSuggestingKeywords, buildSeoInput]);

  const generateThumbnailPrompts = useCallback(async (input: ThumbnailPromptAiInput) => {
    if (readOnly || isGeneratingThumbnailPrompt || !input.basePrompt.trim()) return null;
    setIsGeneratingThumbnailPrompt(true);
    setAiNotice(null);
    try {
      const response = await generateContentWithRetry({
        model: GEMINI_FLASH_MODEL,
        contents: `
Eres un director de arte senior especializado en miniaturas de YouTube con alto CTR.

Tu trabajo es tomar un prompt base ya estructurado y devolver exactamente 3 variantes mejores, mas concretas y mas visuales para una herramienta de imagen.

Contexto rapido:
- Titulo: ${input.title}
- Concepto: ${input.concept?.trim() || 'Sin concepto adicional'}
- Texto sugerido para overlay posterior: ${input.overlayText?.trim() || 'Sin texto fijo'}
- Gancho: ${input.hook?.trim() || 'Sin gancho adicional'}
- Persona real: ${input.useRealPerson ? 'Si, usar una persona humana realista' : 'No, evitar personas y resolver con objetos o contexto'}

Prompt base obligatorio:
"""
${input.basePrompt}
"""

Reglas:
- Devuelve SOLO JSON valido.
- Usa exactamente este formato:
{
  "variants": ["string", "string", "string"]
}
- Cada variant debe ser un prompt completo, autocontenido y listo para pegar.
- Deben mantener todas las restricciones del prompt base.
- Deben sonar mas profesionales y accionables que el prompt base.
- Deben pensar como marketing de miniatura, no como ilustracion.
- Deben empujar una composicion de miniatura real de YouTube, no arte generico.
- Cada variante debe vender UNA sola promesa visual.
- Cada variante debe decidir con claridad:
  - que se ve primero
  - que se ve segundo
  - que se ve tercero
- Si hay texto, debe ser una idea de 1 a 4 palabras maximo para overlay posterior.
- NO deben pedir texto renderizado dentro de la imagen.
- Si aparece una persona, debe ser fotorealista y creible.
- Si no aparece una persona, la escena debe resolverse con objetos, interfaz, monitor o contexto realista.
- Las 3 variantes deben ser distintas entre si:
  1. Variante enfocada en RESULTADO
  2. Variante enfocada en FACILIDAD
  3. Variante enfocada en RAPIDEZ
- Evita prompts que describan posters, anuncios, escritorios completos o escenas amplias con mucho espacio muerto.
`.trim(),
      });

      const variants = buildThumbnailPromptVariants(parseThumbnailPromptVariants(response.text));
      const nextResult = buildGenerationResult(
        variants,
        AI_PROMPT_VERSIONS.thumbnail,
        buildThumbnailWarnings(variants),
      );
      setLastThumbnailGeneration(nextResult);
      trackProductEvent('thumbnail_prompt_generated', {
        board_id: board?.id || null,
        card_id: card.id,
        content_type: card.contentType || 'undefined',
        prompt_version: nextResult.promptVersion,
        warnings_count: nextResult.warnings.length,
        variant_count: nextResult.draft.length,
        uses_real_person: !!input.useRealPerson,
      });
      if (nextResult.draft.length === 3) return nextResult;
      throw new Error('La IA no devolvio 3 variantes validas para la miniatura.');
    } catch (error) {
      setAiNotice(getAiErrorMessage(error, 'No se pudieron refinar los prompts de miniatura.'));
      return null;
    } finally {
      setIsGeneratingThumbnailPrompt(false);
    }
  }, [board?.id, card.contentType, card.id, isGeneratingThumbnailPrompt, readOnly]);

  const improveTitle = useCallback(async () => {
    if (readOnly || isImprovingTitle || !card.title.trim()) return;
    setIsImprovingTitle(true);
    setAiNotice(null);
    try {
      const response = await generateContentWithRetry({
        model: GEMINI_FLASH_MODEL,
        contents: `Eres un experto en titulos de YouTube. Mejora este titulo para maximizar CTR manteniendo la esencia. Responde SOLO con el titulo mejorado, sin explicaciones.\n\nTitulo actual: "${card.title}"`,
      });
      if (response.text?.trim()) setSuggestedTitle(response.text.trim());
    } catch (error) {
      setAiNotice(getAiErrorMessage(error, 'No se pudo mejorar el titulo.'));
    } finally {
      setIsImprovingTitle(false);
    }
  }, [readOnly, isImprovingTitle, card.title]);

  const analyzeScript = useCallback(async (text: string) => {
    if (!text.trim() || isAnalyzingScript) return;
    setIsAnalyzingScript(true);
    setScriptAnalysis(null);
    setAiNotice(null);
    try {
      const response = await generateContentWithRetry({
        model: GEMINI_FLASH_MODEL,
        contents: `Eres un experto en YouTube Growth y storytelling. Analiza este guion de video y evalua:\n1. Gancho (8s)\n2. Storytelling\n3. Retencion\n4. CTA / Interlinking\n5. SEO\n\nPara cada criterio: Bien, Puede mejorar o Debil.\nDa puntaje X/10 y 2-3 sugerencias concretas. Responde en espanol.\n\nGuion:\n"""\n${text.substring(0, 3000)}\n"""`,
      });
      setScriptAnalysis(response.text?.trim() || null);
    } catch (error) {
      setScriptAnalysis(getAiErrorMessage(error, 'No se pudo analizar el guion.'));
    } finally {
      setIsAnalyzingScript(false);
    }
  }, [isAnalyzingScript]);

  return {
    isGeneratingTitles,
    isGeneratingScript,
    isGeneratingDesc,
    isImprovingTitle,
    isSuggestingKeywords,
    isAnalyzingScript,
    isGeneratingThumbnailPrompt,
    aiNotice,
    suggestedTitle,
    scriptAnalysis,
    lastBriefSuggestion,
    lastTitleGeneration,
    lastScriptGeneration,
    lastSeoGeneration,
    lastThumbnailGeneration,
    suggestBrief,
    generateTitles,
    generateScript,
    generateDescription,
    suggestKeywords,
    generateThumbnailPrompts,
    improveTitle,
    analyzeScript,
    clearAiNotice: () => setAiNotice(null),
    clearScriptAnalysis: () => setScriptAnalysis(null),
    acceptSuggestedTitle: () => {
      if (suggestedTitle) {
        actions.updateCard({ title: suggestedTitle });
        setSuggestedTitle(null);
      }
    },
    dismissSuggestedTitle: () => setSuggestedTitle(null),
  };
}
