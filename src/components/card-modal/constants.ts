import type { PhaseConfig, PanelId } from './types';

export const PHASES: PhaseConfig[] = [
  { name: 'Brief',       color: 'bg-sky-500',     action: 'Define el angulo, audiencia y promesa del video.', panel: 'idea' },
  { name: 'Titulos',     color: 'bg-purple-500',  action: 'Cierra titulos y gancho con una sola promesa clara.', panel: 'title' },
  { name: 'Guion',       color: 'bg-indigo-500',  action: 'Genera, corrige y valida la escaleta antes de grabar.', panel: 'script' },
  { name: 'Miniatura',   color: 'bg-pink-500',    action: 'Convierte el video en un concepto visual listo para iterar.', panel: 'thumbnail' },
  { name: 'Produccion',  color: 'bg-orange-500',  action: 'Ejecuta checklist, responsables y cierre operativo.', panel: 'editing' },
  { name: 'Publicacion', color: 'bg-emerald-500', action: 'Valida metadata final y readiness editorial antes de publicar.', panel: 'publish' },
  { name: 'Post-Pub',    color: 'bg-red-500',     action: 'Monitorea CTR a las 2h y responde comentarios.', panel: 'postpub' },
];

export const PANEL_ORDER: PanelId[] = ['idea', 'title', 'script', 'thumbnail', 'editing', 'publish', 'postpub'];

export const PANEL_CONFIG: Record<PanelId, { kicker: string; title: string; description: string }> = {
  idea:      { kicker: 'Fase 1', title: 'Brief e Idea', description: 'Define el angulo, audiencia y promesa del video.' },
  title:     { kicker: 'Fase 2', title: 'Titulos y Gancho', description: 'Genera variaciones de titulo y cierra el hook de 8s.' },
  script:    { kicker: 'Fase 3', title: 'Guion', description: 'Escribe o genera el guion completo del video.' },
  thumbnail: { kicker: 'Fase 4', title: 'Miniatura', description: 'Arma un prompt visual de miniatura usando brief, titulo, gancho y guion.' },
  editing:   { kicker: 'Fase 5', title: 'Produccion', description: 'Asigna, graba, edita y revisa.' },
  publish:   { kicker: 'Fase 6', title: 'Publicacion', description: 'Revisa descripcion, keywords, miniatura y readiness YouTube antes de salir.' },
  postpub:   { kicker: 'Fase 7', title: 'Post-Publicacion', description: 'Monitorea CTR, responde comentarios, recicla a shorts.' },
};

export const DESC_PRESETS: Record<string, string> = {
  'SEO Completa': `[Parrafo de apertura: resume el video en 2-3 lineas con la keyword principal]

🔗 RECURSOS MENCIONADOS
-

⏱️ TIMESTAMPS
00:00 - Intro
00:00 -

📌 SOBRE ESTE VIDEO
[Descripcion expandida con keywords secundarias. 2-3 parrafos con valor para el espectador.]

🔍 TAGS / KEYWORDS
[keyword1, keyword2, keyword3]

📲 REDES SOCIALES
- Instagram:
- Twitter/X:
- TikTok:

#hashtag1 #hashtag2 #hashtag3`,

  'Minimalista': `[Descripcion corta y directa del video]

🔗 Links:
-

📲 Sigueme:
-

#hashtag1 #hashtag2`,

  'Short': `[1-2 lineas describiendo el short]

📺 Video completo:

#shorts #hashtag1 #hashtag2`,
};

export const GUION_PRESETS: Record<string, string> = {
  'Formula 10X': `## Guion y Estructura del Video

### Concepto y Titulo (El Clic)
**Titulos Magicos (Linden):**
-

### Gancho de 8 Segundos
*Start with the End, Punto de Dolor o Ruptura de Patron.*
-

### Storytelling (Retencion)
*Queria [X], PERO paso [Y], POR LO TANTO hice [Z]*
- **Queria:**
- **PERO:**
- **POR LO TANTO:**

### Cuerpo del Video
**Punto 1:**
-
**Punto 2:**
-
**Punto 3:**
-

### CTA + Interlinking
- **Video de Rebufo:**
- **Link de Afiliado/Venta:**
- **Comentario fijado:**`,

  'Tutorial / How-To': `## Tutorial

### Problema
*Que problema resuelve este video?*
-

### Requisitos previos
-

### Paso 1:
-

### Paso 2:
-

### Paso 3:
-

### Resultado final
-

### Errores comunes
-`,

  'Short / Reel': `## Short

**Gancho Visual (1-3s):**
-

**Contenido Principal (20-40s):**
-

**CTA / Loop:**
-

**Texto en pantalla:**
-`,
};

