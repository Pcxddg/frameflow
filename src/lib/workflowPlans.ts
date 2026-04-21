import type { WorkflowConfig, CardData, Board } from '../types';

// ─── Types ───

export type Difficulty = 'beginner' | 'intermediate' | 'advanced';

export interface TaskStep {
  task: string;
  detail: string;
  tip?: string;
  substeps?: string[];
  difficulty?: Difficulty; // Used to filter assistant tasks by experience level
}

export interface DayPlan {
  focus: string;
  focusDetail: string;
  creador: TaskStep[];
  editor: TaskStep[];
  asistente: TaskStep[];
  endOfDay: string;
  pipelines?: { label: string; phase: string }[]; // "Video A: Edicion", "Video B: Guion"
}

// ─── Default config (backwards compatible) ───

export const DEFAULT_WORKFLOW: WorkflowConfig = {
  cadence: 1,
  shortsPerWeek: 2,
  roles: ['creador', 'editor'],
  editorLevel: 'full',
  assistantLevel: 'beginner',
  activeVideoIds: [],
};

export function mergeWorkflowConfig(config?: Partial<WorkflowConfig> | null): WorkflowConfig {
  return {
    ...DEFAULT_WORKFLOW,
    ...config,
    roles: config?.roles?.length ? [...config.roles] : [...DEFAULT_WORKFLOW.roles],
    assistantLevel: config?.assistantLevel || DEFAULT_WORKFLOW.assistantLevel,
    activeVideoIds: [...(config?.activeVideoIds || DEFAULT_WORKFLOW.activeVideoIds || [])],
  };
}

// ─── Phase definitions ───
// Each phase represents one stage of the video production pipeline.
// Phases are assigned to days based on the pipeline offset.

type Phase = 'idea' | 'guion' | 'grabacion' | 'edicion' | 'review' | 'publicacion' | 'metricas';

const PHASE_LABELS: Record<Phase, string> = {
  idea: 'Idea + Investigacion',
  guion: 'Guion + Gancho',
  grabacion: 'Grabacion',
  edicion: 'Edicion + Miniatura',
  review: 'Review + Cambios',
  publicacion: 'Publicacion',
  metricas: 'Metricas + Descanso',
};

// ─── Task pools by phase and role ───
// These are the building blocks. The generator picks from here based on config.

interface TaskPool {
  creador: TaskStep[];
  editor: TaskStep[];
  // Tasks that move to asistente when that role is active:
  asistenteTakesFromCreador: TaskStep[];
  asistenteTakesFromEditor: TaskStep[];
  asistente: TaskStep[]; // Extra tasks only for asistente
  editorBasic: TaskStep[]; // Editor tasks when level=basic (replaces editor)
}

const TASK_POOLS: Record<Phase, TaskPool> = {
  idea: {
    creador: [
      {
        task: 'Elegir el tema del video',
        detail: 'Usa la tecnica del Oceano Azul: cruza tu nicho con otro para encontrar angulos unicos.',
        tip: '¿Alguien tiene EXACTAMENTE este video? Si la respuesta es si, busca otro angulo.',
        substeps: [
          'Revisa tendencias en YouTube (Trending, autocompletado)',
          'Busca en "Otros buscaron" debajo de videos del nicho',
          'Cruza tu nicho con otro (ej: cocina + ciencia)',
          'Valida que el tema te emocione',
        ],
      },
      {
        task: 'Escribir 10-20 variaciones de titulo',
        detail: 'Metodo Linden: no te quedes con el primer titulo. Escribe muchos y elige el mas curioso.',
        tip: 'Buen titulo = numero + emocion + resultado. Ej: "5 errores que arruinan tu cafe"',
        substeps: [
          'Escribe al menos 10 titulos sin filtrar',
          'Marca los 3 mejores (para A/B testing)',
          'Guarda los backups para emergencias de CTR',
        ],
      },
      {
        task: 'Crear tarjeta en FrameFlow',
        detail: 'Documenta todo desde el inicio para mantener al equipo sincronizado.',
        substeps: [
          'Crea la tarjeta con el titulo ganador',
          'Añade keywords, tipo de contenido',
          'Pon fecha limite para cada fase',
          'Mueve a la columna "Titulos"',
        ],
      },
    ],
    editor: [
      {
        task: 'Revisar Shorts pendientes',
        detail: 'Si quedaron Shorts sin editar de la semana pasada, es prioridad terminarlos.',
        substeps: ['Revisar tarjetas de Shorts en el board', 'Editar y exportar los que esten listos'],
      },
      {
        task: 'Organizar archivos en Drive',
        detail: 'Mueve archivos de la semana pasada a sus carpetas y limpia el espacio.',
        substeps: ['Archivar proyecto en 07_Publicados', 'Limpiar 02_Brutos', 'Verificar respaldo del proyecto'],
      },
    ],
    asistenteTakesFromCreador: [
      {
        task: 'Investigar keywords long-tail',
        detail: 'Keywords de 4+ palabras con poca competencia. Esto hara que YouTube recomiende el video.',
        tip: 'Escribe el tema en YouTube sin dar Enter. Las sugerencias = keywords reales.',
        difficulty: 'intermediate',
        substeps: [
          'Usa autocompletado de YouTube (3-5 variaciones)',
          'Revisa Google Trends para validar interes',
          'Documenta keywords en la tarjeta de FrameFlow',
        ],
      },
    ],
    asistenteTakesFromEditor: [
      {
        task: 'Organizar archivos en Drive',
        detail: 'Mueve archivos de la semana pasada a sus carpetas y limpia el espacio.',
        difficulty: 'beginner',
        substeps: ['Archivar proyecto en 07_Publicados', 'Limpiar 02_Brutos', 'Verificar respaldo del proyecto'],
      },
    ],
    asistente: [
      {
        task: 'Investigar tendencias del nicho',
        detail: 'Busca que esta funcionando en canales similares y documenta ideas.',
        difficulty: 'advanced',
        substeps: ['Revisar 5 canales competidores', 'Anotar temas con alto engagement', 'Compartir hallazgos con el Creador'],
      },
    ],
    editorBasic: [
      {
        task: 'Revisar Shorts pendientes',
        detail: 'Si hay Shorts sin editar, terminalos antes de que pierdan relevancia.',
        substeps: ['Revisar tarjetas de Shorts', 'Editar y exportar'],
      },
    ],
  },

  guion: {
    creador: [
      {
        task: 'Definir el gancho de los primeros 8 segundos',
        detail: 'Los primeros 8 segundos determinan si el espectador se queda o se va.',
        tip: '"Start with the end" — muestra el resultado final primero.',
        substeps: [
          'Escribe 3 opciones de gancho diferentes',
          'Elige el que genere mas curiosidad o emocion',
          'Asegurate de que sea visual, no solo hablado',
        ],
      },
      {
        task: 'Escribir el guion completo',
        detail: 'Un guion estructurado ahorra horas de grabacion y edicion.',
        tip: 'Estructura: Gancho → Problema → Desarrollo → Climax → CTA.',
        substeps: [
          'Usa storytelling: Queria / PERO / POR LO TANTO',
          'Marca momentos de estimulo visual cada 10 seg',
          'Incluye 2-3 open loops para retencion',
          'Escribe el CTA final',
        ],
      },
      {
        task: 'Documentar storytelling en FrameFlow',
        detail: 'Llena los campos de narrativa para que el editor entienda la vision.',
        substeps: ['Campos Queria / PERO / POR LO TANTO', 'Subir guion a Drive (01_Guiones)', 'Mover tarjeta a "Guion"'],
      },
    ],
    editor: [
      {
        task: 'Preparar el proyecto de edicion',
        detail: 'Crea el timeline para el video largo. Asi cuando lleguen los brutos, esta todo listo.',
        substeps: ['Crear proyecto con resolucion y fps correctos', 'Importar musica/assets recurrentes', 'Leer el guion para entender estructura'],
      },
      {
        task: 'Editar Shorts pendientes',
        detail: 'Si hay Shorts listos, priorizalos. Son rapidos y mantienen consistencia.',
        substeps: ['Edicion vertical (9:16), subtitulos grandes', 'Gancho en los primeros 1-3 segundos', 'Exportar a Drive (06_Recortes_Shorts)'],
      },
    ],
    asistenteTakesFromCreador: [],
    asistenteTakesFromEditor: [],
    asistente: [
      {
        task: 'Revisar guion y preparar referencias visuales',
        detail: 'Busca imagenes, clips o graficos que el editor pueda usar.',
        difficulty: 'intermediate',
        substeps: ['Leer guion completo', 'Buscar B-roll/referencias visuales', 'Organizar en carpeta compartida'],
      },
    ],
    editorBasic: [
      {
        task: 'Preparar el proyecto de edicion',
        detail: 'Crea el timeline basico con la resolucion y fps correctos.',
        substeps: ['Crear proyecto', 'Importar assets basicos'],
      },
    ],
  },

  grabacion: {
    creador: [
      {
        task: 'Preparar setup de grabacion',
        detail: 'Verifica que todo funcione antes de grabar.',
        substeps: ['Verificar camara, audio y luces', 'Prueba de 30 segundos', 'Tener guion a mano'],
      },
      {
        task: 'Grabar todo el material del video largo',
        detail: 'Sigue el guion pero permite momentos espontaneos.',
        tip: 'Graba el gancho al FINAL cuando ya tienes mas energia.',
        substeps: [
          'Seguir estructura del guion',
          'Grabar B-roll adicional para cubrir cortes',
          'Repetir tomas donde no te convenza la energia',
        ],
      },
      {
        task: 'Subir brutos a Drive y hacer handoff',
        detail: 'El editor no puede empezar hasta tener los brutos. Handoff critico.',
        substeps: [
          'Subir a Drive → 02_Brutos (YYYY-MM-DD_TituloCorto)',
          'Mover tarjeta a "Edicion" en FrameFlow',
          'Asignar la tarjeta al Editor',
          'Notificar al editor: "Brutos listos en Drive"',
        ],
      },
    ],
    editor: [
      {
        task: 'Esperar brutos o avanzar Shorts',
        detail: 'Si los brutos no han llegado, usa el tiempo para Shorts o mejoras.',
        substeps: ['Revisar Shorts pendientes', 'Preparar efectos/transiciones'],
      },
      {
        task: 'Revisar guion antes de editar',
        detail: 'Entender la vision ANTES de tocar los brutos ahorra rondas de cambios.',
        substeps: ['Leer guion completo', 'Anotar momentos clave', 'Identificar donde van B-rolls'],
      },
    ],
    asistenteTakesFromCreador: [],
    asistenteTakesFromEditor: [],
    asistente: [
      {
        task: 'Grabar clips para Shorts',
        detail: 'Aprovecha el setup del creador o graba clips independientes.',
        difficulty: 'beginner',
        substeps: ['Grabar vertical (9:16) o marcar clips del largo', 'Subir a Drive → 06_Recortes_Shorts'],
      },
      {
        task: 'Preparar metadata mientras se graba',
        detail: 'Adelanta la descripcion y tags de YouTube.',
        difficulty: 'intermediate',
        substeps: ['Escribir borrador de descripcion', 'Investigar tags relevantes', 'Guardar en tarjeta de FrameFlow'],
      },
    ],
    editorBasic: [
      {
        task: 'Esperar brutos',
        detail: 'Prepara tu proyecto y revisa el guion mientras llegan.',
        substeps: ['Revisar guion', 'Tener proyecto listo'],
      },
    ],
  },

  edicion: {
    creador: [
      {
        task: 'Diseñar miniatura principal + 2 backups',
        detail: 'La miniatura es el 50% del exito. Necesitas minimo 3 versiones.',
        tip: 'Regla de 3 elementos: Rostro + Texto corto (3-4 palabras) + Objeto visual.',
        substeps: [
          'Diseñar miniatura principal',
          'Diseñar 2 alternativas con diferente emocion',
          'Verificar que se ve bien en tamaño celular',
          'Subir a Drive → 04_Miniaturas',
        ],
      },
      {
        task: 'Preparar SEO completo',
        detail: 'Descripcion, tags y pantalla final AHORA, no a ultimo momento.',
        substeps: [
          'Descripcion (keywords en las 2 primeras lineas)',
          'Definir 15-20 tags (mix amplios + long-tail)',
          'Planificar pantalla final',
          'Escribir comentario fijado',
          'Guardar en tarjeta de FrameFlow',
        ],
      },
    ],
    editor: [
      {
        task: 'Editar primer corte del video largo',
        detail: 'Entregable principal. Enfocate en ritmo y narrativa.',
        tip: 'Estimulo visual cada 10 segundos. Si pasan 10 seg sin cambio, el espectador se aburre.',
        substeps: [
          'Montar estructura base siguiendo guion',
          'Estimulo visual cada 10 seg (corte, zoom, grafico, B-roll)',
          'Ajustar audio (niveles, musica, efectos)',
          'Verificar que el gancho es impactante',
          'Export preview para review',
        ],
      },
      {
        task: 'Subir primer corte y notificar',
        detail: 'El creador necesita ver el primer corte para dar feedback.',
        substeps: ['Subir a Drive → 03_Proyecto_Editor', 'Notificar: "Primer corte listo"'],
      },
    ],
    asistenteTakesFromCreador: [
      {
        task: 'Diseñar miniatura principal + 2 backups',
        detail: 'Sigue el briefing del creador. Necesitas minimo 3 versiones.',
        tip: 'Regla de 3 elementos: Rostro + Texto corto (3-4 palabras) + Objeto visual.',
        difficulty: 'advanced',
        substeps: [
          'Diseñar miniatura principal segun briefing',
          'Diseñar 2 alternativas con diferente emocion',
          'Verificar que se ve bien en tamaño celular',
          'Subir a Drive → 04_Miniaturas',
          'Enviar al creador para aprobacion',
        ],
      },
      {
        task: 'Preparar metadata de YouTube',
        detail: 'Descripcion, tags y pantalla final.',
        difficulty: 'intermediate',
        substeps: [
          'Escribir descripcion (keywords en las 2 primeras lineas)',
          'Definir 15-20 tags',
          'Guardar todo en la tarjeta de FrameFlow',
        ],
      },
    ],
    asistenteTakesFromEditor: [],
    asistente: [],
    editorBasic: [
      {
        task: 'Editar primer corte del video',
        detail: 'Monta el video siguiendo el guion. Enfocate en cortar y montar.',
        substeps: [
          'Montar estructura base',
          'Cortar tiempos muertos',
          'Ajustar audio basico',
          'Export preview para review',
        ],
      },
      {
        task: 'Subir primer corte',
        detail: 'Sube a Drive y notifica al creador.',
        substeps: ['Subir a Drive → 03_Proyecto_Editor', 'Notificar al creador'],
      },
    ],
  },

  review: {
    creador: [
      {
        task: 'Revisar primer corte del editor',
        detail: 'Ve el video 2 veces: primero como espectador, luego con ojo critico.',
        tip: 'Feedback con TIMECODES: "En 2:30 cortar la pausa" es util. "Mejorar ritmo" NO.',
        substeps: [
          '1ra vista: ¿Te enganchaste? ¿Te aburriste?',
          '2da vista: Anotar timecodes de cambios',
          'Verificar que el gancho funcione',
          'Revisar audio, musica, transiciones',
        ],
      },
      {
        task: 'Dar feedback y aprobar',
        detail: 'Feedback claro y accionable. Max 2 rondas de cambios.',
        substeps: [
          'Enviar lista de cambios con timecodes',
          'Priorizar: criticos vs nice-to-have',
          'Si son pocos cambios, aprobar directamente',
        ],
      },
      {
        task: 'Preparar metadata final',
        detail: 'Mientras el editor aplica cambios, prepara todo para subir.',
        substeps: [
          'Revisar titulo final',
          'Revisar descripcion y tags',
          'Tener miniatura lista',
          'Usar "Exportar a YouTube" en FrameFlow',
        ],
      },
    ],
    editor: [
      {
        task: 'Aplicar feedback y cambios',
        detail: 'Aplica cambios solicitados. Si algo no esta claro, pregunta ANTES.',
        substeps: ['Revisar cada timecode', 'Aplicar cambios criticos primero', 'Export final en alta calidad'],
      },
      {
        task: 'Entregar export final',
        detail: 'Sube el export y notifica. Este es tu entregable de la semana.',
        substeps: ['Export a Drive → 05_Exports', 'Notificar: "Export final listo"', 'Mover tarjeta a "Publicacion"'],
      },
      {
        task: 'Editar Shorts de la semana',
        detail: 'Los Shorts deben estar listos para el fin de semana.',
        substeps: ['Editar Shorts pendientes', 'Subtitulos, gancho 1-3 seg', 'Export a Drive → 06_Recortes_Shorts'],
      },
    ],
    asistenteTakesFromCreador: [],
    asistenteTakesFromEditor: [],
    asistente: [
      {
        task: 'Verificar metadata y SEO',
        detail: 'Revisa que la descripcion, tags y miniatura esten listos.',
        difficulty: 'beginner',
        substeps: ['Verificar descripcion completa', 'Tags relevantes', 'Miniaturas subidas a Drive'],
      },
      {
        task: 'Programar publicacion en redes',
        detail: 'Prepara los posts para redes sociales cuando se publique el video.',
        difficulty: 'intermediate',
        substeps: ['Crear copys para redes', 'Preparar clips teaser', 'Tener todo listo para publicar junto al video'],
      },
    ],
    editorBasic: [
      {
        task: 'Aplicar cambios solicitados',
        detail: 'Revisa el feedback y aplica los cambios.',
        substeps: ['Aplicar cambios por timecode', 'Export final', 'Subir a Drive → 05_Exports'],
      },
    ],
  },

  publicacion: {
    creador: [
      {
        task: 'Subir video a YouTube',
        detail: 'Sube el video y configura toda la metadata antes de publicar.',
        substeps: [
          'Subir video desde 05_Exports',
          'Pegar titulo, descripcion y tags',
          'Subir miniatura principal',
          'Configurar pantalla final',
        ],
      },
      {
        task: 'Configurar interlinking',
        detail: 'Conecta tus videos. Esto aumenta tiempo de sesion.',
        substeps: [
          'Fijar comentario con link a video relacionado',
          'Pantalla final con mejor video del mismo tema',
          'Links en descripcion',
        ],
      },
      {
        task: 'Publicar y monitorear',
        detail: 'Las primeras 2 horas son CRITICAS. El algoritmo decide aqui.',
        tip: 'CTR < 4% a las 2h → cambia miniatura. Si no mejora en 1h → cambia titulo. NUNCA ambos a la vez.',
        substeps: [
          'Publicar el video',
          'Registrar hora de publicacion en FrameFlow',
          '0-1h: Responder TODOS los comentarios',
          '2h: Revisar CTR en YouTube Studio',
          'Si CTR < 4% → cambiar miniatura por backup',
          'Registrar acciones en la tarjeta',
        ],
      },
    ],
    editor: [
      {
        task: 'Dia libre o adelantar contenido',
        detail: 'Tu trabajo esta entregado. Descansa o adelanta.',
        substeps: ['Opcional: organizar archivos', 'Opcional: investigar tecnicas nuevas'],
      },
    ],
    asistenteTakesFromCreador: [
      {
        task: 'Responder comentarios (primeras 2h)',
        detail: 'Los comentarios son engagement gratis. Responde TODO.',
        difficulty: 'beginner',
        substeps: [
          'Responder cada comentario nuevo',
          'Fijar el mejor comentario de la comunidad',
          'Dar corazones a comentarios positivos',
        ],
      },
    ],
    asistenteTakesFromEditor: [],
    asistente: [
      {
        task: 'Publicar en redes sociales',
        detail: 'Comparte el video en todas las plataformas inmediatamente.',
        difficulty: 'beginner',
        substeps: ['Publicar en redes con copy preparado', 'Subir Shorts programados', 'Monitorear reacciones'],
      },
    ],
    editorBasic: [
      {
        task: 'Dia libre',
        detail: 'Tu trabajo de la semana esta entregado.',
        substeps: [],
      },
    ],
  },

  metricas: {
    creador: [
      {
        task: 'Revisar metricas del video publicado',
        detail: 'Analiza rendimiento para aprender y mejorar.',
        substeps: [
          'Revisar CTR actual',
          'Revisar retencion (¿donde se van?)',
          'Anotar aprendizajes en la tarjeta',
        ],
      },
      {
        task: 'Pre-planificar tema de la proxima semana',
        detail: 'Tener 2-3 ideas te da ventaja el lunes.',
        substeps: ['Anotar 2-3 posibles temas', 'Revisar tendencias', 'Descansar'],
      },
    ],
    editor: [
      {
        task: 'Dia libre',
        detail: 'Descansa y recarga para la proxima semana.',
        substeps: [],
      },
    ],
    asistenteTakesFromCreador: [
      {
        task: 'Responder comentarios nuevos',
        detail: 'Mantener el engagement activo.',
        difficulty: 'beginner',
        substeps: ['Responder todos los comentarios', 'Fijar mejor comentario', 'Corazones a positivos'],
      },
    ],
    asistenteTakesFromEditor: [],
    asistente: [
      {
        task: 'Publicar Shorts restantes',
        detail: 'Si quedan Shorts de la semana, publicalos hoy.',
        difficulty: 'beginner',
        substeps: ['Publicar 1-2 Shorts pendientes', 'Añadir hashtags relevantes'],
      },
      {
        task: 'Reporte semanal de metricas',
        detail: 'Prepara un resumen de como fue la semana.',
        difficulty: 'advanced',
        substeps: ['CTR promedio, vistas, subs ganados', 'Que funciono y que no', 'Compartir con el equipo'],
      },
    ],
    editorBasic: [
      { task: 'Dia libre', detail: 'Descansa.', substeps: [] },
    ],
  },
};

// ─── Pipeline scheduling ───
// Maps cadence to pipeline offsets (which day each video starts its phase cycle)

// Phase order: idea(0) → guion(1) → grabacion(2) → edicion(3) → review(4) → publicacion(5) → metricas(6)
const PHASE_ORDER: Phase[] = ['idea', 'guion', 'grabacion', 'edicion', 'review', 'publicacion', 'metricas'];

// For cadence=1: Video A starts Monday (day 1)
// For cadence=2: Video A starts Monday, Video B starts Thursday
// For cadence=3: Video A Mon, Video B Wed, Video C Fri
const PIPELINE_OFFSETS: Record<number, number[]> = {
  1: [1],       // Video A starts Monday
  2: [1, 4],    // Video A Monday, Video B Thursday
  3: [1, 3, 5], // Video A Monday, Video B Wednesday, Video C Friday
};

const VIDEO_LABELS_DEFAULT = ['Video A', 'Video B', 'Video C'];

// ─── Generator ───

// Difficulty filtering: beginner sees only beginner, intermediate sees beginner+intermediate, advanced sees all
const DIFFICULTY_LEVELS: Record<string, number> = { beginner: 1, intermediate: 2, advanced: 3 };

function filterByDifficulty(tasks: TaskStep[], maxLevel: string): TaskStep[] {
  const max = DIFFICULTY_LEVELS[maxLevel] || 3;
  return tasks.filter(t => {
    const taskLevel = DIFFICULTY_LEVELS[t.difficulty || 'beginner'] || 1;
    return taskLevel <= max;
  });
}

export function generateWeeklyPlan(config: WorkflowConfig, videoLabels?: string[]): Record<number, DayPlan> {
  const hasEditor = config.roles.includes('editor');
  const hasAsistente = config.roles.includes('asistente');
  const isBasicEditor = config.editorLevel === 'basic';
  const assistantLevel = config.assistantLevel || 'advanced';
  const offsets = PIPELINE_OFFSETS[config.cadence] || PIPELINE_OFFSETS[1];

  const plan: Record<number, DayPlan> = {};

  // Initialize all 7 days
  for (let d = 0; d < 7; d++) {
    plan[d] = {
      focus: '',
      focusDetail: '',
      creador: [],
      editor: [],
      asistente: [],
      endOfDay: '',
      pipelines: [],
    };
  }

  const labels = videoLabels && videoLabels.length >= config.cadence
    ? videoLabels
    : VIDEO_LABELS_DEFAULT;

  // For each pipeline (video), assign phases to days
  offsets.forEach((startDay, pipelineIdx) => {
    const label = labels[pipelineIdx];

    PHASE_ORDER.forEach((phase, phaseIdx) => {
      const day = (startDay + phaseIdx) % 7;
      const pool = TASK_POOLS[phase];

      // Add pipeline indicator
      plan[day].pipelines!.push({ label, phase: PHASE_LABELS[phase] });

      // Build creador tasks (remove tasks that asistente takes over, respecting difficulty)
      let creadorTasks = [...pool.creador];
      if (hasAsistente) {
        // Only remove tasks that the assistant can actually handle at their level
        const takenTasks = filterByDifficulty(pool.asistenteTakesFromCreador, assistantLevel);
        const takenTaskNames = new Set(takenTasks.map(t => t.task));
        creadorTasks = creadorTasks.filter(t => !takenTaskNames.has(t.task));
      }

      // Prefix tasks with video label if multi-pipeline
      const prefix = config.cadence > 1 ? `[${label}] ` : '';
      creadorTasks.forEach(t => {
        plan[day].creador.push({ ...t, task: `${prefix}${t.task}` });
      });

      // Build editor tasks
      if (hasEditor) {
        let editorTasks = isBasicEditor ? [...pool.editorBasic] : [...pool.editor];
        if (hasAsistente) {
          const takenTasks = filterByDifficulty(pool.asistenteTakesFromEditor, assistantLevel);
          const takenTaskNames = new Set(takenTasks.map(t => t.task));
          editorTasks = editorTasks.filter(t => !takenTaskNames.has(t.task));
        }
        editorTasks.forEach(t => {
          plan[day].editor.push({ ...t, task: `${prefix}${t.task}` });
        });
      }

      // Build asistente tasks (filtered by experience level)
      if (hasAsistente) {
        const asistenteTasks = filterByDifficulty([
          ...pool.asistenteTakesFromCreador,
          ...pool.asistenteTakesFromEditor,
          ...pool.asistente,
        ], assistantLevel);
        asistenteTasks.forEach(t => {
          plan[day].asistente.push({ ...t, task: `${prefix}${t.task}` });
        });

      }
    });
  });

  // Add shorts tasks distributed across the week
  if (config.shortsPerWeek > 0) {
    const shortsDays = config.shortsPerWeek <= 2 ? [3, 5] : config.shortsPerWeek <= 3 ? [2, 4, 6] : [1, 2, 3, 4, 5];
    const shortsPerDay = Math.ceil(config.shortsPerWeek / shortsDays.length);

    shortsDays.forEach(day => {
      const shortsTask: TaskStep = {
        task: `Publicar ${shortsPerDay} Short${shortsPerDay > 1 ? 's' : ''}`,
        detail: 'Mantener la cadencia de Shorts para alimentar el top-of-funnel.',
        substeps: ['Verificar que el Short esta editado', 'Subir con titulo llamativo y hashtags', 'Revisar rendimiento despues de 1h'],
      };

      if (hasAsistente) {
        plan[day].asistente.push(shortsTask);
      } else {
        plan[day].creador.push(shortsTask);
      }
    });
  }

  // Generate focus and endOfDay for each day
  for (let d = 0; d < 7; d++) {
    const pipelines = plan[d].pipelines || [];

    if (pipelines.length === 0) {
      plan[d].focus = 'Descanso';
      plan[d].focusDetail = 'Dia sin tareas de produccion programadas. Descansa y recarga.';
      plan[d].endOfDay = 'Dia libre.';
    } else if (pipelines.length === 1) {
      plan[d].focus = pipelines[0].phase;
      plan[d].focusDetail = getFocusDetail(pipelines[0].phase, config);
      plan[d].endOfDay = getEndOfDay(pipelines.map(p => p.phase), config);
    } else {
      const phases = pipelines.map(p => `${p.label}: ${p.phase}`);
      plan[d].focus = pipelines.map(p => p.phase).join(' + ');
      plan[d].focusDetail = `Dia intenso con ${pipelines.length} videos en paralelo: ${phases.join(', ')}.`;
      plan[d].endOfDay = getEndOfDay(pipelines.map(p => p.phase), config);
    }

    // Deduplicate "Dia libre" editor tasks
    if (plan[d].editor.length > 1) {
      const nonFree = plan[d].editor.filter(t => !t.task.includes('Dia libre'));
      if (nonFree.length > 0) plan[d].editor = nonFree;
    }
    if (plan[d].asistente.length > 1) {
      const nonFree = plan[d].asistente.filter(t => !t.task.includes('Dia libre'));
      if (nonFree.length > 0) plan[d].asistente = nonFree;
    }

    // Editor fills in assistant tasks when they have light workload
    // This applies whether or not there's an Asistente — when the editor
    // has downtime they can help with research, thumbnails, metadata, etc.
    if (hasEditor) {
      const editorIsLight = plan[d].editor.length === 0
        || plan[d].editor.every(t =>
          t.task.includes('Dia libre') || t.task.includes('Esperar brutos') || t.task.includes('adelantar')
        );

      if (editorIsLight) {
        const bonusTasks: TaskStep[] = [];

        // Collect assistant-type tasks the editor can do
        const pipelines = plan[d].pipelines || [];
        pipelines.forEach(p => {
          const phaseKey = Object.entries(PHASE_LABELS).find(([, v]) => v === p.phase)?.[0] as Phase | undefined;
          if (!phaseKey) return;
          const pool = TASK_POOLS[phaseKey];

          // Tasks that normally go to asistente — editor can do these
          const assistantTasks = [
            ...pool.asistenteTakesFromCreador,
            ...pool.asistenteTakesFromEditor,
            ...pool.asistente,
          ];

          // If there's already an asistente, don't duplicate — just pick the extras
          const tasksToAdd = hasAsistente ? pool.asistente : assistantTasks;

          tasksToAdd.forEach(t => {
            // Avoid duplicating tasks already in editor list
            if (!plan[d].editor.some(e => e.task.includes(t.task))) {
              const prefix = config.cadence > 1 ? `[${p.label}] ` : '';
              bonusTasks.push({
                ...t,
                task: `${prefix}${t.task}`,
                detail: `(Apoyo) ${t.detail}`,
              });
            }
          });
        });

        if (bonusTasks.length > 0) {
          // Remove "Dia libre" placeholders since editor now has work
          plan[d].editor = plan[d].editor.filter(t => !t.task.includes('Dia libre'));
          plan[d].editor.push(...bonusTasks);
        }
      }
    }
  }

  return plan;
}

// ─── Helpers ───

function getFocusDetail(phase: string, config: WorkflowConfig): string {
  const details: Record<string, string> = {
    'Idea + Investigacion': 'Hoy se define el exito de la semana. Un buen tema + keyword = video con traccion organica.',
    'Guion + Gancho': 'El guion es el esqueleto del video. Sin un buen guion, la edicion no puede salvarlo.',
    'Grabacion': 'Dia de ejecucion. Todo lo planificado se materializa hoy. Graba mas de lo que necesitas.',
    'Edicion + Miniatura': 'El editor trabaja en el primer corte. El creador prepara el packaging (miniatura + SEO).',
    'Review + Cambios': 'Dia de pulir y aprobar. Maximo 1-2 rondas de cambios.',
    'Publicacion': `Las primeras 2 horas son CRITICAS. ${config.roles.includes('asistente') ? 'El asistente ayuda con comentarios y redes.' : 'Estate disponible para monitorear CTR.'}`,
    'Metricas + Descanso': 'Revisa metricas, responde comentarios y empieza a pensar en la proxima semana.',
  };
  return details[phase] || 'Dia de produccion activo.';
}

function getEndOfDay(phases: string[], config: WorkflowConfig): string {
  const ends: string[] = [];
  phases.forEach(phase => {
    if (phase.includes('Idea')) ends.push('tema validado y tarjeta creada');
    if (phase.includes('Guion')) ends.push('guion terminado con gancho fuerte');
    if (phase.includes('Grabacion')) ends.push('brutos en Drive y handoff al editor');
    if (phase.includes('Edicion')) ends.push('primer corte listo y miniatura diseñada');
    if (phase.includes('Review')) ends.push('video aprobado y exportado');
    if (phase.includes('Publicacion')) ends.push('video publicado y CTR monitoreado');
    if (phase.includes('Metricas')) ends.push('metricas revisadas');
  });
  if (ends.length === 0) return 'Dia completado.';
  return ends.join(', ') + '.';
}

// ─── Config description (for UI display) ───

const ASSISTANT_LEVEL_LABELS: Record<string, string> = {
  beginner: 'Principiante',
  intermediate: 'Intermedio',
  advanced: 'Avanzado',
};

export function getWorkflowDescription(config: WorkflowConfig): string {
  const parts = [
    `${config.cadence} video${config.cadence > 1 ? 's' : ''}/semana`,
    config.shortsPerWeek > 0 ? `${config.shortsPerWeek} Shorts` : null,
    config.roles.map(r => r.charAt(0).toUpperCase() + r.slice(1)).join(' + '),
    config.roles.includes('asistente') && config.assistantLevel ? `Asist. ${ASSISTANT_LEVEL_LABELS[config.assistantLevel] || config.assistantLevel}` : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

// ═══════════════════════════════════════════════════════════════
// PHASE MATRIX — Metadata completa por fase de produccion
// ═══════════════════════════════════════════════════════════════

type RoleKey = 'creador' | 'editor' | 'asistente';

export interface PhaseDefinition {
  id: string;
  label: string;
  shortLabel: string;
  leader: RoleKey;
  supporter: RoleKey[];
  deliverable: string;
  doneCondition: string;
  doneCheck: (card: CardData) => boolean;
  typicalRisk: string;
  estimatedHours: string;
  doNotDisturb: string;
}

export const PHASE_MATRIX: Record<string, PhaseDefinition> = {
  idea: {
    id: 'idea',
    label: 'Idea + Investigacion',
    shortLabel: 'Idea',
    leader: 'creador',
    supporter: ['asistente'],
    deliverable: 'Tarjeta creada con tema, keywords y angulo definido',
    doneCondition: 'Tarjeta tiene keywords y al menos un titulo candidato',
    doneCheck: (card) => !!(card.keywords && card.titulosLinden),
    typicalRisk: 'Tema generico sin angulo diferenciador',
    estimatedHours: '1-2h',
    doNotDisturb: 'Hoy se define el tema. No pidas edicion ni grabacion todavia.',
  },
  titulos: {
    id: 'titulos',
    label: 'Titulos (Metodo Linden)',
    shortLabel: 'Titulos',
    leader: 'creador',
    supporter: ['asistente'],
    deliverable: '10+ variaciones de titulo escritas',
    doneCondition: 'Campo titulosLinden tiene al menos 10 lineas',
    doneCheck: (card) => (card.titulosLinden?.split('\n').filter(l => l.trim()).length || 0) >= 10,
    typicalRisk: 'Quedarse con el primer titulo sin explorar opciones',
    estimatedHours: '30-60min',
    doNotDisturb: 'El creador esta explorando titulos. No se necesita feedback de edicion aun.',
  },
  guion: {
    id: 'guion',
    label: 'Guion + Gancho 8s',
    shortLabel: 'Guion',
    leader: 'creador',
    supporter: [],
    deliverable: 'Guion completo con gancho, storytelling y CTA',
    doneCondition: 'Guion escrito, gancho de 8s definido, storytelling documentado',
    doneCheck: (card) => !!(card.guion && card.gancho8s),
    typicalRisk: 'Guion sin estructura clara o sin gancho definido',
    estimatedHours: '2-4h',
    doNotDisturb: 'Fase creativa. El editor puede preparar proyecto pero NO necesita el guion aun.',
  },
  grabacion: {
    id: 'grabacion',
    label: 'Grabacion',
    shortLabel: 'Grab.',
    leader: 'creador',
    supporter: ['asistente'],
    deliverable: 'Brutos en Drive (02_Brutos), link pegado en tarjeta',
    doneCondition: 'linkDrive tiene URL y tarjeta lista para handoff al editor',
    doneCheck: (card) => !!(card.linkDrive),
    typicalRisk: 'Retraso en subir brutos = bloquea toda la cadena del editor',
    estimatedHours: '2-6h',
    doNotDisturb: 'El creador esta grabando. El editor espera brutos, puede adelantar Shorts.',
  },
  edicion: {
    id: 'edicion',
    label: 'Edicion + Miniatura',
    shortLabel: 'Edicion',
    leader: 'editor',
    supporter: ['creador', 'asistente'],
    deliverable: 'Primer corte exportado, 3 opciones de miniatura',
    doneCondition: 'Primer corte en Drive, miniatura con rostro + texto verificados',
    doneCheck: (card) => !!(card.miniaturaChecklist?.rostro && card.miniaturaChecklist?.texto),
    typicalRisk: 'Editor sin brutos, creador sin briefing de miniatura',
    estimatedHours: '6-12h',
    doNotDisturb: 'El editor esta editando. NO envies cambios de guion ahora.',
  },
  review: {
    id: 'review',
    label: 'Review + Cambios',
    shortLabel: 'Review',
    leader: 'creador',
    supporter: ['editor'],
    deliverable: 'Export final aprobado en Drive (05_Exports)',
    doneCondition: 'Video aprobado, export final listo, maximo 2 rondas de cambios',
    doneCheck: (card) => card.checklists?.some(cl => cl.items.length > 0 && cl.items.filter(i => i.isCompleted).length >= cl.items.length * 0.8) || false,
    typicalRisk: 'Mas de 2 rondas de cambios = se pierde el dia',
    estimatedHours: '1-2h',
    doNotDisturb: 'Creador y editor estan en review. No interrumpas con tareas nuevas.',
  },
  publicacion: {
    id: 'publicacion',
    label: 'Publicacion',
    shortLabel: 'Pub.',
    leader: 'creador',
    supporter: ['asistente'],
    deliverable: 'Video publicado en YouTube, CTR revisado a las 2h',
    doneCondition: 'publishedAt tiene fecha, ctr2Hours tiene valor, comentarios respondidos',
    doneCheck: (card) => !!(card.postPublication?.publishedAt && card.ctr2Hours),
    typicalRisk: 'CTR < 4% sin backup de miniatura/titulo preparado',
    estimatedHours: '1-2h activo + monitoreo',
    doNotDisturb: 'Video recien publicado. Las primeras 2h son CRITICAS para el algoritmo.',
  },
  metricas: {
    id: 'metricas',
    label: 'Metricas + Aprendizaje',
    shortLabel: 'Metr.',
    leader: 'creador',
    supporter: ['asistente'],
    deliverable: 'Metricas revisadas, aprendizajes documentados',
    doneCondition: 'postPublication.actionTaken definido, notas de lo aprendido',
    doneCheck: (card) => !!(card.postPublication?.actionTaken),
    typicalRisk: 'Saltarse metricas = repetir los mismos errores la proxima semana',
    estimatedHours: '30min',
    doNotDisturb: 'Dia de reflexion. No empieces video nuevo hasta revisar el anterior.',
  },
};

// ═══════════════════════════════════════════════════════════════
// PRIORITY RULES — Logica de priorizacion para "Empieza por aqui"
// ═══════════════════════════════════════════════════════════════

export interface PriorityRule {
  id: string;
  priority: number;
  condition: string;
  check: (card: CardData, board: Board) => boolean;
  action: string;
  urgencyLabel: string;
  urgencyColor: 'red' | 'orange' | 'yellow' | 'blue' | 'green';
}

export const PRIORITY_RULES: PriorityRule[] = [
  {
    id: 'overdue',
    priority: 1,
    condition: 'Tarjeta con fecha vencida',
    check: (card) => !!(card.dueDate && card.dueDate.split('T')[0] < new Date().toISOString().split('T')[0]),
    action: 'Resolver AHORA — esta tarjeta ya debio avanzar',
    urgencyLabel: 'VENCIDA',
    urgencyColor: 'red',
  },
  {
    id: 'ctr-missing',
    priority: 2,
    condition: 'Video publicado sin revision de CTR (< 48h)',
    check: (card) => {
      if (!card.postPublication?.publishedAt || card.ctr2Hours) return false;
      const hours = (Date.now() - new Date(card.postPublication.publishedAt).getTime()) / 3_600_000;
      return hours < 48;
    },
    action: 'Revisar CTR en YouTube Studio AHORA — las primeras horas son criticas',
    urgencyLabel: 'CTR PENDIENTE',
    urgencyColor: 'red',
  },
  {
    id: 'awaiting-review',
    priority: 3,
    condition: 'Primer corte listo esperando review del creador',
    check: (card, board) => {
      const editList = board.lists.find(l => l.title.toLowerCase().includes('edici'));
      return !!(editList && card.listId === editList.id && card.linkDrive);
    },
    action: 'Dar feedback al editor con timecodes concretos — esta esperando',
    urgencyLabel: 'ESPERA REVIEW',
    urgencyColor: 'orange',
  },
  {
    id: 'editor-blocked',
    priority: 4,
    condition: 'Video en edicion pero sin brutos subidos',
    check: (card, board) => {
      const editList = board.lists.find(l => l.title.toLowerCase().includes('edici'));
      return !!(editList && card.listId === editList.id && !card.linkDrive);
    },
    action: 'Subir brutos a Drive y pegar link — el editor NO puede avanzar sin ellos',
    urgencyLabel: 'EDITOR BLOQUEADO',
    urgencyColor: 'orange',
  },
  {
    id: 'due-today',
    priority: 5,
    condition: 'Tarjeta vence hoy',
    check: (card) => !!(card.dueDate && card.dueDate.split('T')[0] === new Date().toISOString().split('T')[0]),
    action: 'Completar hoy — esta tarjeta tiene deadline',
    urgencyLabel: 'VENCE HOY',
    urgencyColor: 'yellow',
  },
  {
    id: 'ready-to-publish',
    priority: 6,
    condition: 'Video listo para publicar',
    check: (card, board) => {
      const pubList = board.lists.find(l => l.title.toLowerCase().includes('publicaci'));
      return !!(pubList && card.listId === pubList.id && !card.postPublication?.publishedAt);
    },
    action: 'Publicar cuando el horario sea optimo para tu audiencia',
    urgencyLabel: 'LISTO PARA PUBLICAR',
    urgencyColor: 'blue',
  },
  {
    id: 'on-schedule',
    priority: 7,
    condition: 'Video en fase programada',
    check: () => true,
    action: 'Seguir el plan del dia',
    urgencyLabel: 'EN PLAN',
    urgencyColor: 'green',
  },
];

// ═══════════════════════════════════════════════════════════════
// VIDEO STATUS — Diagnostico de estado real vs schedule
// ═══════════════════════════════════════════════════════════════

export interface VideoStatus {
  cardId: string;
  cardTitle: string;
  pipelineIndex: number;
  scheduledPhaseId: string;
  scheduledPhaseLabel: string;
  actualColumn: string;
  actualPhaseId: string;
  isOnTrack: boolean;
  isBehind: boolean;
  isAhead: boolean;
  phaseDelta: number;
  matchedRule: PriorityRule;
  leader: RoleKey;
  deliverable: string;
  doneCondition: string;
  doneMet: boolean;
  doNotDisturb: string;
  daysInColumn: number;
}

// Map board column titles to phase IDs
const COLUMN_TO_PHASE: [string, string][] = [
  ['ideas', 'idea'],
  ['títulos', 'titulos'],
  ['titulo', 'titulos'],
  ['guion', 'guion'],
  ['miniatura', 'grabacion'],
  ['edición', 'edicion'],
  ['edicion', 'edicion'],
  ['publicación', 'publicacion'],
  ['publicacion', 'publicacion'],
  ['ataque', 'metricas'],
];

const PHASE_INDEX: Record<string, number> = {
  idea: 0, titulos: 1, guion: 2, grabacion: 3, edicion: 4, review: 5, publicacion: 6, metricas: 7,
};

function getPhaseFromColumn(columnTitle: string): string {
  const lower = columnTitle.toLowerCase();
  for (const [key, phase] of COLUMN_TO_PHASE) {
    if (lower.includes(key)) return phase;
  }
  return 'idea';
}

export function diagnoseVideoState(
  card: CardData,
  board: Board,
  scheduledPhaseId: string,
  pipelineIndex: number,
): VideoStatus {
  const column = board.lists.find(l => l.id === card.listId);
  const actualColumn = column?.title || 'Desconocida';
  const actualPhaseId = getPhaseFromColumn(actualColumn);

  const scheduledIdx = PHASE_INDEX[scheduledPhaseId] ?? 0;
  const actualIdx = PHASE_INDEX[actualPhaseId] ?? 0;
  const phaseDelta = actualIdx - scheduledIdx;

  const phase = PHASE_MATRIX[actualPhaseId] || PHASE_MATRIX.idea;
  const scheduledPhase = PHASE_MATRIX[scheduledPhaseId] || PHASE_MATRIX.idea;

  // Find matching priority rule
  let matchedRule = PRIORITY_RULES[PRIORITY_RULES.length - 1]; // fallback: on-schedule
  for (const rule of PRIORITY_RULES) {
    if (rule.check(card, board)) {
      matchedRule = rule;
      break;
    }
  }

  // Calculate days in current column
  let daysInColumn = 0;
  if (card.columnHistory && card.columnHistory.length > 0) {
    const lastEntry = [...card.columnHistory].reverse().find(h => h.listId === card.listId);
    if (lastEntry) {
      daysInColumn = Math.floor((Date.now() - new Date(lastEntry.enteredAt).getTime()) / 86_400_000);
    }
  }

  return {
    cardId: card.id,
    cardTitle: card.title,
    pipelineIndex,
    scheduledPhaseId,
    scheduledPhaseLabel: scheduledPhase.label,
    actualColumn,
    actualPhaseId,
    isOnTrack: phaseDelta === 0 || (phaseDelta >= -1 && phaseDelta <= 1),
    isBehind: phaseDelta < -1,
    isAhead: phaseDelta > 1,
    phaseDelta,
    matchedRule,
    leader: phase.leader,
    deliverable: phase.deliverable,
    doneCondition: phase.doneCondition,
    doneMet: phase.doneCheck(card),
    doNotDisturb: phase.doNotDisturb,
    daysInColumn,
  };
}

// Get the scheduled phase for a pipeline on a given day
export function getScheduledPhase(dayOfWeek: number, pipelineIndex: number, cadence: number): string {
  const offsets = PIPELINE_OFFSETS[cadence] || PIPELINE_OFFSETS[1];
  const startDay = offsets[pipelineIndex] ?? 1;
  const phaseIdx = ((dayOfWeek - startDay) % 7 + 7) % 7;
  if (phaseIdx >= PHASE_ORDER.length) return 'metricas';
  return PHASE_ORDER[phaseIdx];
}

// ═══════════════════════════════════════════════════════════════
// END OF DAY ITEMS — Criterios verificables de cierre
// ═══════════════════════════════════════════════════════════════

export interface EndOfDayItem {
  id: string;
  videoTitle: string;
  text: string;
  phaseId: string;
}

export function getEndOfDayItems(videoStatuses: VideoStatus[]): EndOfDayItem[] {
  const items: EndOfDayItem[] = [];

  videoStatuses.forEach((vs, i) => {
    const phase = PHASE_MATRIX[vs.actualPhaseId] || PHASE_MATRIX[vs.scheduledPhaseId];
    if (!phase) return;

    // Split doneCondition into individual items
    const conditions = phase.doneCondition.split(',').map(s => s.trim()).filter(Boolean);
    conditions.forEach((cond, ci) => {
      items.push({
        id: `eod-${i}-${ci}`,
        videoTitle: vs.cardTitle,
        text: cond.charAt(0).toUpperCase() + cond.slice(1),
        phaseId: vs.actualPhaseId,
      });
    });

    // Add handoff item for phases that need it
    if (vs.actualPhaseId === 'grabacion') {
      items.push({ id: `eod-${i}-handoff`, videoTitle: vs.cardTitle, text: 'Editor notificado del handoff', phaseId: 'grabacion' });
    }
    if (vs.actualPhaseId === 'review') {
      items.push({ id: `eod-${i}-handoff`, videoTitle: vs.cardTitle, text: 'Export final subido a Drive', phaseId: 'review' });
    }
  });

  return items;
}

// ═══════════════════════════════════════════════════════════════
// UX COPY — Textos de interfaz en español
// ═══════════════════════════════════════════════════════════════

export const UX_COPY = {
  startHere: 'Empieza por aqui',
  startHereEmpty: 'Asigna videos de tu board para activar el sistema operativo.',
  pipelineStatus: 'Estado de tus videos',
  doNotTouch: 'Que NO tocar hoy',
  dayClose: 'Cierre del dia',
  dayCloseSubtitle: 'Para marcar el dia como completado:',
  blockers: 'Bloqueos activos',
  noBlockers: 'Sin bloqueos. Todo fluye.',
  roleLeads: (phase: string) => `Hoy lideras: ${phase}`,
  roleMeta: (deliverable: string) => `Meta: ${deliverable}`,
  roleDone: (condition: string) => `"Done" cuando: ${condition}`,
  statusOnTrack: 'EN PLAN',
  statusBehind: 'ATRASADO',
  statusAhead: 'ADELANTADO',
  behindDetail: (n: number) => `${n} fase${n > 1 ? 's' : ''} atrasado`,
  aheadDetail: (n: number) => `${n} fase${n > 1 ? 's' : ''} adelantado`,
  stuckWarning: (days: number, col: string) => `Lleva ${days} dia${days > 1 ? 's' : ''} en "${col}"`,
} as const;

// ---------------------------------------------------------------------------
// Phase Completion Status — surfacing doneCheck results for CardData/CardModal UI
// ---------------------------------------------------------------------------

export interface PhaseCompletionStatus {
  phaseId: string;
  phaseLabel: string;
  shortLabel: string;
  isDone: boolean;
  deliverable: string;
  doneCondition: string;
  leader: string;
  missingFields: { field: string; label: string }[];
}

/** Returns phase completion status for a card based on its current board column */
export function getPhaseCompletionStatus(card: CardData, board: Board): PhaseCompletionStatus {
  const column = board.lists.find(l => l.id === card.listId);
  const columnTitle = column?.title || '';
  const phaseId = getPhaseFromColumn(columnTitle);
  const phase = PHASE_MATRIX[phaseId] || PHASE_MATRIX.idea;

  const isDone = phase.doneCheck(card);
  const missingFields: { field: string; label: string }[] = [];

  if (!isDone) {
    // Check specific fields per phase
    switch (phaseId) {
      case 'idea':
        if (!card.keywords) missingFields.push({ field: 'keywords', label: 'Keywords / SEO' });
        if (!card.titulosLinden) missingFields.push({ field: 'titulosLinden', label: 'Titulos candidatos' });
        break;
      case 'titulos': {
        const lineCount = card.titulosLinden?.split('\n').filter(l => l.trim()).length || 0;
        if (lineCount < 10) missingFields.push({ field: 'titulosLinden', label: `Titulos (${lineCount}/10 minimo)` });
        break;
      }
      case 'guion':
        if (!card.guion) missingFields.push({ field: 'guion', label: 'Guion completo' });
        if (!card.gancho8s) missingFields.push({ field: 'gancho8s', label: 'Gancho 8 segundos' });
        break;
      case 'grabacion':
        if (!card.linkDrive) missingFields.push({ field: 'linkDrive', label: 'Link Drive (brutos)' });
        break;
      case 'edicion':
        if (!card.miniaturaChecklist?.rostro) missingFields.push({ field: 'miniaturaChecklist.rostro', label: 'Miniatura: rostro' });
        if (!card.miniaturaChecklist?.texto) missingFields.push({ field: 'miniaturaChecklist.texto', label: 'Miniatura: texto' });
        break;
      case 'review': {
        const hasCompletedChecklist = card.checklists?.some(cl => cl.items.length > 0 && cl.items.filter(i => i.isCompleted).length >= cl.items.length * 0.8);
        if (!hasCompletedChecklist) missingFields.push({ field: 'checklists', label: 'Checklist 80%+ completado' });
        break;
      }
      case 'publicacion':
        if (!card.postPublication?.publishedAt) missingFields.push({ field: 'postPublication.publishedAt', label: 'Fecha de publicacion' });
        if (!card.ctr2Hours) missingFields.push({ field: 'ctr2Hours', label: 'CTR a las 2 horas' });
        break;
      case 'metricas':
        if (!card.postPublication?.actionTaken) missingFields.push({ field: 'postPublication.actionTaken', label: 'Accion post-pub definida' });
        break;
    }
  }

  return {
    phaseId,
    phaseLabel: phase.label,
    shortLabel: phase.shortLabel,
    isDone,
    deliverable: phase.deliverable,
    doneCondition: phase.doneCondition,
    leader: phase.leader,
    missingFields,
  };
}
