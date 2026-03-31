import type { Card } from '../types';

function compactWhitespace(value?: string | null) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function firstNonEmpty(...values: Array<string | undefined | null>) {
  return values.map((value) => compactWhitespace(value)).find(Boolean) || '';
}

function parseSeededTitles(text?: string | null) {
  return (text || '')
    .split('\n')
    .map((line) =>
      line
        .replace(/^\s*\d+[\)\].:-]?\s*/, '')
        .replace(/^\[(SEO|CLICK|GAP)\]\s*/i, '')
        .trim()
    )
    .filter(Boolean);
}

function extractScriptSummary(script?: string | null) {
  const lines = (script || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return '';

  const summary = lines.slice(0, 3).join(' ');
  return summary.length > 320 ? `${summary.slice(0, 317).trim()}...` : summary;
}

function deriveOverlayText(card: Card, overlayText?: string) {
  const explicit = compactWhitespace(overlayText);
  if (explicit) return explicit;

  const promise = compactWhitespace(card.productionBrief?.promise);
  if (promise) {
    const clipped = promise.replace(/[.?!]+$/, '');
    return clipped.length > 42 ? `${clipped.slice(0, 39).trim()}...` : clipped;
  }

  const title = compactWhitespace(card.title);
  if (!title) return '';
  return title.length > 42 ? `${title.slice(0, 39).trim()}...` : title;
}

function deriveEmotion(searchable: string) {
  if (/(solo un clic|solo 1 clic|1 clic|1 click|un clic|un click|facil|sin tocar|sin cambiar|sin configuraciones raras)/.test(searchable)) {
    return 'facilidad inmediata';
  }

  if (/(5 minutos|5 min|en minutos|rapido|rapida|instant|segundos|speed|veloz)/.test(searchable)) {
    return 'rapidez';
  }

  if (/(160\s*(->|a)\s*18|\d+\s*(->|a)\s*\d+|fps|ping|resultado|brutal|mejora|sube|baja|benchmark|jugable)/.test(searchable)) {
    return 'resultado brutal';
  }

  if (/(vs|versus|compar|contra|mejor|peor)/.test(searchable)) {
    return 'comparacion';
  }

  return 'curiosidad con resultado';
}

function deriveSinglePromise(
  searchable: string,
  fallbackPromise: string,
  fallbackTitle: string,
  overlayText: string
) {
  if (overlayText) return overlayText;

  const numericShift = searchable.match(/(\d+)\s*(?:ms|fps|%)?\s*(?:->|a)\s*(\d+)\s*(?:ms|fps|%)?/i);
  if (numericShift) {
    return `${numericShift[1]} -> ${numericShift[2]}`;
  }

  if (/(solo un clic|solo 1 clic|1 clic|1 click|un clic|un click)/.test(searchable)) {
    return 'SOLO UN CLIC';
  }

  if (/(bajar ping|menos ping|reducir ping)/.test(searchable)) {
    return 'BAJAR PING';
  }

  if (/(fps|jugable|slideshow|lag|stutter)/.test(searchable)) {
    return 'JUGABLE O NO';
  }

  if (/(5 minutos|5 min|en minutos)/.test(searchable)) {
    return 'EN 5 MIN';
  }

  const clippedPromise = compactWhitespace(fallbackPromise).replace(/[.?!]+$/, '');
  if (clippedPromise) {
    return clippedPromise.length > 26 ? `${clippedPromise.slice(0, 23).trim()}...` : clippedPromise;
  }

  return fallbackTitle.length > 26 ? `${fallbackTitle.slice(0, 23).trim()}...` : fallbackTitle;
}

function deriveProofElement(searchable: string) {
  if (/(\d+)\s*(?:->|a)\s*(\d+)|\b160\b|\b18\b|ping|fps|ms|benchmark/.test(searchable)) {
    return 'Numeros grandes o contraste de metricas como prueba visible del resultado.';
  }

  if (/(clic|click|boton|cursor|toggle|switch)/.test(searchable)) {
    return 'Boton real, cursor o accion unica que haga visible la facilidad extrema.';
  }

  if (/(router|internet|wifi|app|programa|software|interfaz|settings|config)/.test(searchable)) {
    return 'Interfaz real, pantalla o ajuste visible que demuestre que la solucion existe de verdad.';
  }

  if (/(gpu|intel hd|monitor|pc|setup|gameplay|juego)/.test(searchable)) {
    return 'Objeto tecnico o pantalla real que haga evidente el contexto del problema.';
  }

  return 'Una prueba visual unica y concreta del resultado o del conflicto.';
}

function deriveContextElement(searchable: string) {
  if (/(gameplay|juego|fps|intel hd|gpu|grafica|monitor|steam)/.test(searchable)) {
    return 'Gameplay o pantalla del juego, pero simplificada y subordinada al elemento principal.';
  }

  if (/(app|programa|software|interfaz|dashboard|settings|config)/.test(searchable)) {
    return 'Interfaz real del programa o pantalla del sistema, oscurecida y simplificada.';
  }

  if (/(router|internet|wifi|ping)/.test(searchable)) {
    return 'Contexto tecnico real de red o PC, sin convertirlo en anuncio ni en escena de stock.';
  }

  return 'Fondo contextual muy simple, solo para reforzar de que trata el video.';
}

function deriveVisualAngle(card: Card, concept: string, promise: string, referenceTitle: string) {
  const searchable = `${referenceTitle} ${promise} ${concept} ${card.gancho8s || ''}`.toLowerCase();

  if (/(vs|versus|compar|contra|mejor|peor|o\s)/.test(searchable)) {
    return 'Comparativa visual muy clara entre dos estados o dos opciones, entendible en menos de un segundo.';
  }

  if (/(fps|lag|stutter|rendimiento|intel hd|gpu|grafica|benchmark|jugable)/.test(searchable)) {
    return 'Prueba visual extrema de rendimiento: problema evidente, tension tecnica y resultado facil de leer de un vistazo.';
  }

  if (/(dinero|rpm|cpm|negocio|adsense|afiliad|ingreso|venta)/.test(searchable)) {
    return 'Promesa economica o de negocio mostrada con una sola escena fuerte y un contraste claro entre problema y solucion.';
  }

  if (/(tutorial|como|guia|setup|configurar|solucion)/.test(searchable)) {
    return 'Resultado final claro + objeto o interfaz protagonista + sensacion de solucion inmediata.';
  }

  return 'Una sola idea visual fuerte, facil de entender, con una promesa clara y tension visual inmediata.';
}

export function buildThumbnailGenerationPrompt(
  card: Card,
  options?: {
    concept?: string;
    overlayText?: string;
    includeFace?: boolean;
    includeText?: boolean;
    includeContext?: boolean;
    useRealPerson?: boolean;
  }
) {
  const seededTitles = parseSeededTitles(card.titulosLinden);
  const referenceTitle = firstNonEmpty(seededTitles[0], card.title);
  const promise = firstNonEmpty(card.productionBrief?.promise, card.productionBrief?.question, referenceTitle);
  const audience = firstNonEmpty(card.productionBrief?.audience, 'audiencia general de YouTube');
  const tone = firstNonEmpty(card.productionBrief?.tone, 'directo y visual');
  const hook = compactWhitespace(card.gancho8s);
  const creatorNotes = compactWhitespace(card.productionBrief?.creatorNotes);
  const scriptSummary = extractScriptSummary(card.guion);
  const concept = firstNonEmpty(options?.concept, card.thumbnailPlan?.concept, promise, referenceTitle);
  const rawOverlayText = deriveOverlayText(card, options?.overlayText || card.thumbnailPlan?.overlayText);
  const searchable = `${referenceTitle} ${promise} ${concept} ${hook} ${scriptSummary} ${creatorNotes}`.toLowerCase();
  const singlePromise = deriveSinglePromise(searchable, promise, referenceTitle, rawOverlayText);
  const overlayText = rawOverlayText || singlePromise;
  const visualAngle = deriveVisualAngle(card, concept, promise, referenceTitle);
  const proofElement = deriveProofElement(searchable);
  const contextElement = deriveContextElement(searchable);
  const emotion = deriveEmotion(searchable);

  const includeFace = options?.includeFace ?? card.miniaturaChecklist?.rostro ?? true;
  const includeText = options?.includeText ?? card.miniaturaChecklist?.texto ?? true;
  const includeContext = options?.includeContext ?? card.miniaturaChecklist?.contexto ?? true;
  const useRealPerson = options?.useRealPerson ?? card.thumbnailPlan?.useRealPerson ?? includeFace;

  const requiredElements = [
    useRealPerson
      ? '- Incluir una persona real o protagonista humano fotorealista, con expresion clara y anatomia natural.'
      : includeFace
      ? '- Puede incluir un rostro o silueta, pero no dependas de una persona real; prioriza objetos, interfaz o contexto.'
      : '- No usar personas ni rostros. Resolver la promesa con objetos, contexto o interfaz realista.',
    includeText
      ? `- Texto grande, corto y ultra legible: "${overlayText || 'PROMESA CLAVE'}".`
      : '- No depender de bloques largos de texto; si hay texto, que sea minimo y muy grande.',
    includeContext
      ? '- Un objeto, fondo o contexto que explique de inmediato el conflicto o la promesa del video.'
      : '- Fondo simple, sin ruido, priorizando un solo punto focal.',
  ];

  const contextLines = [
    `Titulo de referencia: ${referenceTitle || 'Sin titulo definido'}`,
    `Promesa principal: ${promise || 'Sin promesa clara'}`,
    `Audiencia: ${audience}`,
    `Tono del video: ${tone}`,
    hook ? `Gancho de 8 segundos: ${hook}` : '',
    scriptSummary ? `Resumen del guion: ${scriptSummary}` : '',
    creatorNotes ? `Notas del creador: ${creatorNotes}` : '',
  ].filter(Boolean);

  return [
    'Crea una base visual para miniatura de YouTube en formato exacto 1280 x 720 px (16:9), pensada para alto CTR y lectura rapida en mobile.',
    '',
    'Objetivo:',
    '- NO intentes contar todo el video. Vende una sola curiosidad o promesa visual.',
    '- Debe transmitir la promesa del video en menos de un segundo.',
    '- Debe verse de alto contraste, limpia y con un punto focal muy claro.',
    '- Debe sentirse lista para YouTube, no como un banner ni como una diapositiva.',
    '- Debe sentirse real, creible y ejecutable, no como arte generico de IA.',
    '- Debe funcionar como base visual fuerte para que el texto final se agregue despues en edicion.',
    '',
    'Contexto del video:',
    ...contextLines.map((line) => `- ${line}`),
    '',
    'Calidad visual obligatoria:',
    '- Estilo fotorealista o fotografia comercial realista.',
    '- Iluminacion natural o cinematica creible.',
    '- Texturas reales, piel real, manos reales, ojos reales, ropa real y materiales reales.',
    '- Composicion pensada para miniatura de YouTube, con lectura clara incluso en tamano pequeno.',
    useRealPerson
      ? '- Si aparece una persona, debe verse humana de verdad: sin piel plastica, sin dedos extra, sin rasgos deformes, sin look CGI.'
      : '- No incluir personas reales ni personajes humanoides. Resolver la imagen con objetos, entorno, interfaz o contexto fisico realista.',
    '',
    'Concepto:',
    `- Concepto central: ${concept || 'Resolver la promesa del video con una imagen clara y tension visual.'}`,
    `- Promesa visual unica: ${singlePromise || 'Una sola promesa clara y facil de entender.'}`,
    `- Emocion dominante: ${emotion}.`,
    `- Angulo visual: ${visualAngle}`,
    '',
    'Composicion:',
    '- Formula de miniatura: texto corto + prueba visual + contexto.',
    `- Texto recomendado para overlay posterior: ${overlayText ? `"${overlayText}"` : 'sin texto fijo, priorizando impacto visual.'}`,
    `- Elemento prueba: ${proofElement}`,
    `- Contexto: ${contextElement}`,
    ...requiredElements,
    '',
    'Jerarquia visual:',
    `- Primero debe verse: ${singlePromise || 'la promesa principal del video'}.`,
    `- Segundo debe verse: ${proofElement.toLowerCase()}`,
    `- Tercero debe verse: ${contextElement.toLowerCase()}`,
    '- El sujeto principal debe ocupar aproximadamente entre 65% y 80% del encuadre total.',
    '- Usar encuadre cerrado o medio-cerrado. Evitar escenas amplias donde el objeto principal se vea pequeno.',
    '- Reservar espacio negativo limpio para agregar el texto despues, sin meterlo dentro de la imagen generada.',
    '',
    'Estilo:',
    '- Miniatura real de YouTube, no poster ni anuncio.',
    '- Alto contraste entre sujeto, texto y fondo.',
    '- Una sola idea visual fuerte, sin saturacion.',
    '- Si aparece una pantalla o monitor, el contenido debe verse grande, legible y protagonista; no al fondo ni pequeno.',
    '- Expresion, gesto o contexto que sugiera conflicto, comparacion o resultado extremo.',
    '',
    'Prohibiciones:',
    '- NO renderizar texto, numeros grandes, subtitulos, captions, titulares, FPS, labels, logos, watermarks ni stickers dentro de la imagen.',
    '- Texto pequeno o demasiadas palabras.',
    '- Escritorios completos, habitaciones vacias o composiciones donde haya demasiado espacio muerto.',
    '- Fondos recargados o muchos objetos compitiendo.',
    '- Capturas grises, oscuras o sin foco.',
    '- Elementos decorativos irrelevantes, logos innecesarios o interfaces complejas.',
    '- Estilo ilustrado, render 3D, arte digital evidente o resultados con look artificial de IA.',
  ].join('\n');
}
