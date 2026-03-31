# FrameFlow - Documentación Técnica

## Tabla de Contenidos

1. [Descripción General](#descripción-general)
2. [Arquitectura del Sistema](#arquitectura-del-sistema)
3. [Stack Tecnológico](#stack-tecnológico)
4. [Estructura del Proyecto](#estructura-del-proyecto)
5. [Modelo de Datos](#modelo-de-datos)
6. [Componentes](#componentes)
7. [Gestión de Estado](#gestión-de-estado)
8. [Integración con IA (Gemini)](#integración-con-ia-gemini)
9. [Autenticación y Seguridad](#autenticación-y-seguridad)
10. [Flujo de Trabajo YouTube (Fórmula 10X)](#flujo-de-trabajo-youtube-fórmula-10x)
11. [Configuración y Despliegue](#configuración-y-despliegue)
12. [Variables de Entorno](#variables-de-entorno)

---

## Descripción General

**FrameFlow** es una aplicación de gestión de proyectos tipo Kanban diseñada específicamente para creadores de contenido en YouTube y sus equipos. Combina la gestión visual de tareas con inteligencia artificial (Google Gemini) para optimizar el pipeline de producción de videos.

### Características principales

- **Tablero Kanban colaborativo** en tiempo real con drag & drop
- **Chatbot IA** (Gemini) que actúa como estratega de crecimiento de YouTube y puede manipular el tablero directamente
- **Pipeline de producción** basado en la "Fórmula 10X" para videos de YouTube
- **Grabación y transcripción de audio** integrada con Gemini
- **Mejora de títulos con IA** para optimizar CTR
- **Colaboración en equipo** con roles (Creador / Editor / Asistente) y acceso por tablero (RBAC)
- **Producción Guiada (Production Flow)** integrado para seguimiento de videos paso a paso
- **Sincronización en tiempo real** de estado y de **presencia de usuarios** vía Firestore y Realtime Database

---

## Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────┐
│                       Cliente (React SPA)                    │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  ┌─────────┐  │
│  │ Channel  │  │ Board &  │  │VideoWizard   │  │ Chatbot │  │
│  │ Home     │  │ CardModal│  │(GenAI / IA)  │  │ / Audio │  │
│  └────┬─────┘  └────┬─────┘  └──────┬───────┘  └────┬────┘  │
│       │              │              │               │       │
│       └──────────────┴──────┬───────┴───────────────┘       │
│                             │                               │
│                    ┌────────┴────────┐                      │
│                    │  BoardContext   │                      │
│                    │  (store.tsx)    │                      │
│                    └────────┬────────┘                      │
│                             │                               │
└─────────────────────────────┼───────────────────────────────┘
                              │
               ┌──────────────┼────────────────┐
               │              │                │
      ┌────────┴───┐  ┌───────┴────────┐  ┌────┴──────┐
      │  Firebase  │  │  Firebase      │  │  Gemini   │
      │  Auth      │  │  Firestore &   │  │  API      │
      │  (Google)  │  │  Realtime DB   │  │  (GenAI)  │
      └────────────┘  └────────────────┘  └───────────┘
```

### Flujo de datos

1. El usuario se autentica con Google OAuth via Firebase Auth
2. El perfil se almacena en Firestore (`/users/{uid}`)
3. La interfaz `ChannelHome` muestra todos los canales donde el usuario tiene acceso.
4. Los tableros seleccionados se sincronizan en tiempo real via `onSnapshot` de Firestore. La presencia se sincroniza usando la Realtime Database.
5. Las acciones del usuario (CRUD de tarjetas, drag & drop) se persisten con actualizaciones optimistas.
6. El creador utiliza el `NewVideoWizard` o el `Chatbot` para interactuar con Gemini y moldear la estrategia del contenido.

---

## Stack Tecnológico

| Categoría | Tecnología | Versión |
|-----------|------------|---------|
| Framework | React | 19.0.0 |
| Lenguaje | TypeScript | 5.8.2 |
| Bundler | Vite | 6.2.0 |
| Estilos | Tailwind CSS | 4.1.14 |
| Base de datos | Firebase Firestore | 12.11.0 |
| Autenticación | Firebase Auth (Google OAuth) | 12.11.0 |
| IA | Google Gemini (@google/genai) | 1.29.0 |
| Drag & Drop | @hello-pangea/dnd | 18.0.1 |
| Animaciones | Motion | 12.23.24 |
| Iconos | lucide-react | 0.546.0 |
| Markdown | react-markdown | 10.1.0 |
| Fechas | date-fns | 4.1.0 |
| IDs | uuid | 13.0.0 |

---

## Estructura del Proyecto

```
frameflow/
├── src/
│   ├── components/
│   │   ├── AudioRecorder.tsx     # Grabación de audio + transcripción via Gemini
│   │   ├── Board.tsx             # Contenedor principal del tablero con drag & drop
│   │   ├── BoardSettings.tsx     # Modal de configuración del canal (nicho, miembros, stats)
│   │   ├── Card.tsx              # Tarjeta visual con badges SEO, progreso, storytelling
│   │   ├── CardModal.tsx         # Modal completo de edición con heurísticas de Nielsen
│   │   ├── Chatbot.tsx           # Chatbot IA con function calling de Gemini (6 funciones)
│   │   ├── Dashboard.tsx         # Panel de métricas, pipeline y analíticas
│   │   ├── FilterBar.tsx         # Filtros de tipo de contenido y responsable
│   │   ├── InterlinkingGraph.tsx # Grafo de conexiones entre videos (telaraña)
│   │   ├── List.tsx              # Columna del tablero Kanban
│   │   └── TeamGuide.tsx         # Panel lateral con guía operativa (3 pestañas)
│   ├── lib/
│   │   ├── gemini.ts             # Inicialización del cliente Gemini
│   │   └── utils.ts              # Utilidad cn() para Tailwind CSS
│   ├── App.tsx                   # Layout principal: header, filtros, routing board/dashboard
│   ├── firebase.ts               # Configuración de Firebase (Auth + Firestore)
│   ├── main.tsx                  # Entry point de React
│   ├── store.tsx                 # Estado global con Context API + listeners Firestore
│   ├── types.ts                  # Interfaces TypeScript (Card con 40+ campos)
│   └── index.css                 # Design tokens, animaciones y estilos base
├── dist/                         # Build de producción
├── firebase.json                 # Configuración de Firebase Hosting
├── firebase-applet-config.json   # Credenciales de Firebase
├── firebase-blueprint.json       # Schema de Firestore
├── firestore.rules               # Reglas de seguridad de Firestore
├── .firebaserc                   # Alias del proyecto Firebase
├── package.json                  # Dependencias y scripts
├── tsconfig.json                 # Configuración de TypeScript
├── vite.config.ts                # Configuración de Vite
└── .env.example                  # Plantilla de variables de entorno
```

---

## Modelo de Datos

### Diagrama de entidades

```
User
├── uid: string
├── email: string
├── displayName: string
└── photoURL: string

Board
├── id: string
├── title: string
├── ownerId: string              → User.uid
├── members: string[]            → array de emails
├── memberRoles?: Record<string, MemberRole> → 'owner', 'editor', 'viewer'
├── lists: List[]
├── cards: Record<string, Card>  → mapa de tarjetas por ID
├── createdAt?: string
├── updatedAt?: string
├── videoCount?: number          → contador de videos publicados
├── nicheName?: string           → nombre del nicho (Océano Azul)
├── defaultContentType?: string  → 'long' | 'short' | ''
├── workflowConfig?: WorkflowConfig → Cadencia y roles por defecto
└── seoConfig?: BoardSeoConfig

List
├── id: string
├── title: string
└── cardIds: string[]            → referencias a Card.id

Card
├── id: string
├── title: string
├── description: string          → soporta Markdown
├── listId: string               → referencia a List.id
├── labels: Label[]
├── checklists: Checklist[]
├── dueDate: string | null       → formato 'yyyy-MM-dd'
├── assignee: string | null      → 'Tú' | 'Editor'
│
│  # Campos Fórmula 10X (base)
├── titulosLinden: string        → variantes de títulos (Método Linden)
├── gancho8s: string             → gancho de los primeros 8 segundos
├── narrativa: string            → estructura narrativa
├── miniaturaChecklist: {        → checklist de miniatura
│     rostro: boolean,
│     texto: boolean,
│     contexto: boolean
│   }
├── ctr2Hours: string            → porcentaje CTR a las 2 horas
├── interlinking: string         → URL del video para efecto rebufo
├── linkDrive: string            → enlace a Google Drive con brutos
│
│  # Tipo de contenido (Shorts vs Largos)
├── contentType?: 'long' | 'short'
│
│  # SEO Cola Larga
├── keywords?: string            → palabras clave separadas por coma
│
│  # Storytelling estructurado (Regla South Park)
├── storytelling?: {
│     queria: string,            → "Quería X..."
│     pero: string,              → "PERO pasó Y..."
│     porLoTanto: string         → "POR LO TANTO hice Z"
│   }
│
│  # Protocolo Post-Publicación
├── postPublication?: {
│     publishedAt?: string,
│     commentsResponded?: boolean,
│     ctrCheckTime?: string,
│     actionTaken?: 'none' | 'thumbnail' | 'title' | 'both',
│     actionLog?: string
│   }
│
│  # Monetización y Negocio (expandido)
├── monetization?: {
│     hasAffiliate?: boolean,
│     affiliateLinks?: string,
│     hasSponsor?: boolean,
│     sponsorName?: string,
│     estimatedRPM?: number,
│     revenue?: number,
│     sellsProduct?: boolean,
│     productDescription?: string
│   }
│
│  # Interlinking expandido (Telaraña)
├── interlinkingTargets?: string[] → IDs de tarjetas enlazadas
│
│  # Shorts-específico
├── shortsHook?: string          → gancho visual 1-3s
├── shortsLoop?: boolean         → loopabilidad
├── shortsFunnel?: string        → ID del video largo al que dirige
│
│  # Analítica de Proceso
├── columnHistory?: Array<{      → Historial de fases (para cuellos de botella)
│     listId: string,
│     enteredAt: string (timestamp)
│   }>
│
│  # Flujo de Producción Guiado (ProductionFlow)
├── productionBrief?: ProductionBrief
└── productionFlow?: ProductionFlow

Checklist
├── id: string
├── title: string
└── items: ChecklistItem[]

ChecklistItem
├── id: string
├── text: string
└── isCompleted: boolean

Label
├── id: string
├── name: string
└── color: LabelColor            → 'red' | 'yellow' | 'blue' | 'green' | 'purple' | 'orange'

ProductionFlow
├── templateId: string
├── publishAt: string
├── currentStageId: string
├── workMode: string
├── scheduleStatus: string
└── stages: ProductionStage[]    → Historial e hitos de producción (idea, research, guion, grabacion, etc.)

BoardPresenceMember
├── emailLowercase: string
├── displayName: string
├── state: string                → 'online' | 'offline'
├── isOnline: boolean
├── isActiveInThisBoard: boolean
├── activeSurface: string        → 'board' | 'dashboard' | 'guide' | 'channel_home'
├── lastSeenAt: string
└── sessionCount: number

BoardPresenceEvent
├── id: string
├── type: string                 → 'entered_board' | 'left_board' | 'came_online' | 'went_offline'
├── emailLowercase: string
└── at: string

WorkflowConfig
├── cadence: number              → Ej: 1, 2, 3 videos largos/semana
├── shortsPerWeek: number        → Ej: 0, 2, 3, 5
├── roles: AuditRole[]
└── editorLevel: string          → 'full' | 'basic'
```

### Etiquetas predefinidas

| Color | Nombre | Uso |
|-------|--------|-----|
| Rojo | Urgente | Tareas prioritarias |
| Amarillo | Esperando feedback | Pendiente de revisión |
| Azul | En manos del editor | Delegado al editor |
| Verde | Listo para publicar | Aprobado para publicación |
| Morado | Short | Contenido tipo Short |
| Naranja | Monetizado | Tarjeta con monetización activa |

### Plantillas de Checklists

**Fórmula 10X (Video Largo):**
1. Nicho / Ángulo único definido
2. Investigación SEO + 50 Títulos listos
3. Gancho perfecto de 8s (Start with end / Dolor)
4. Storytelling estructural ("Quería X, PERO pasó Y...")
5. Grabación completada
6. Edición: Cambio visual cada 10s
7. Miniatura diseñada (Rostro, Texto, Contexto)
8. SEO, Etiquetas y Links de afiliados en descripción
9. Comentario fijado para Interlinking (Telaraña)
10. Video Programado y Publicado
11. Monitorización CTR 2H (Ataque al corazón)

**Sistema de Shorts:**
1. Visualmente atractivo (1-3s Gancho)
2. Formato repetible diseñado
3. Loopabilidad infinita asegurada
4. Llamado a la acción rápido
5. Publicado (Top of Funnel)

---

## Componentes

### `App.tsx`
Componente raíz. Envuelve la aplicación en `BoardProvider` para proveer el estado global. Contiene:
- Pantalla de carga (spinner) mientras se inicializa la autenticación
- Pantalla de login con Google si no hay usuario autenticado
- **Header** con selector de canales, avatar y notificaciones
- **Área principal**: Renderiza `ChannelHome` (vista de canales), `Board` (con filtros) o `Dashboard` según la selección del usuario.
- **Chatbot** flotante siempre visible

### `ChannelHome.tsx`
Pantalla de inicio ("Tus Canales") que lista los canales (tableros) a los que tiene acceso el usuario:
- Creación de nuevos canales.
- Resumen estadístico por canal (videos totales, en progreso, publicados, ritmo/cadencia y configuración de equipo).
- Permite la navegación rápida entre la vista Board y Dashboard para un canal específico.

### `Board.tsx`
Contenedor principal del tablero Kanban. Implementa:
- Contexto de `@hello-pangea/dnd` para drag & drop
- Recibe `contentFilter` y `assigneeFilter` como props para filtrar tarjetas visibles
- Renderiza las columnas (`List`) con sus tarjetas filtradas
- Maneja el evento `onDragEnd` para reordenar/mover tarjetas entre columnas

### `List.tsx`
Representa una columna del tablero Kanban. Cada lista tiene:
- Título de la columna (ej. "Ideas (Océano Azul)")
- Zona droppable para recibir tarjetas
- Input para añadir nuevas tarjetas
- Renderiza los componentes `Card` de sus `cardIds`

### `Card.tsx`
Componente visual de una tarjeta individual en el tablero. Muestra:
- Etiquetas de color
- Título de la tarjeta
- **Badge SEO** (icono Search) cuando la tarjeta tiene keywords
- **Anillo de progreso** SVG mostrando % de checklist completado
- **Dots de storytelling** (3 puntos morados) cuando la narrativa está completa
- **Borde rojo pulsante** cuando la tarjeta está en la última columna y tiene CTR < 4%
- Indicadores de fecha límite, asignado y tipo de contenido
- Es draggable via `@hello-pangea/dnd`
- Al hacer clic abre el `CardModal`

### `NewVideoWizard.tsx`
Wizard guiado de 4 pasos ("Idea first + IA asistida") para la creación de nuevos videos con integración a Gemini:
- **Paso 1 (Idea base)**: El usuario define la tesis general del video.
- **Paso 2 (Preguntas clave)**: Define brief operativo (Audiencia, tono, promesa, etc.) con botón para obtener sugerencias prellenadas usando la IA.
- **Paso 3 (Generar con IA)**: Siembra borradores mediante Gemini para distintos apartados de la tarjeta: Título recomendado, alternativas de títulos, hook, resumen de investigación, guion base y preguntas abiertas.
- **Paso 4 (Revisión Final)**: Permite revisar, editar y validar el material base sugerido antes de materializar la tarjeta en el tablero real.

### `CardModal.tsx`
Modal completo para ver y editar todos los detalles de una tarjeta. Diseñado con las **10 heurísticas de Nielsen**:

**Sistema de fases**: Detecta automáticamente la fase de la tarjeta según su `listId` y muestra un badge de fase en el header con un banner de "siguiente paso" contextual. 

**Integración con Flujo Guíado**: Si la tarjeta es parte de un `ProductionFlow` estructurado, el interior del modal se renderiza íntegramente mediante el componente `GuidedCardWorkspace`, proporcionando una interfaz paso a paso (Idea, Research, Scripting, etc.).

**Disclosure progresivo** (Para la vista estándar): Las secciones se auto-expanden según la fase actual de la tarjeta.

| Sección | Funcionalidad |
|---------|---------------|
| Header | Badge de fase + título inline editable + botón "Mejorar con IA" con confirmación Accept/Reject |
| Banner | "Siguiente paso" contextual según la fase actual |
| SEO | Keywords de cola larga |
| Descripción | Editor Markdown con plantilla precargable + grabación de audio |
| Shorts | Hook visual, loopabilidad, funnel a video largo (solo si contentType = 'short') |
| Ingeniería del Clic | Método Linden (títulos), Checklist miniatura (Rostro/Texto/Contexto) |
| Retención | Gancho 8s, Storytelling estructurado (Quería/Pero/Por lo tanto) |
| Interlinking | Chips clickeables de tarjetas enlazadas + URL de efecto rebufo |
| Monetización | Afiliados, patrocinador, RPM, revenue, producto |
| Post-publicación | Fecha de publicación, respuesta a comentarios, acción CTR tomada |
| Checklists | Progreso visual con barra, items completables |
| Sidebar | Responsable, Fecha límite (calendario), Link Drive, Plantillas, Etiquetas, CTR con alerta visual |
| Zona peligro | Eliminación con confirmación |

**Atajos**: Escape para cerrar, clic en overlay para cerrar, validación CTR (0-100).

### `GuidedCardWorkspace.tsx`
Componente que toma control del espacio de trabajo interior del `CardModal` cuando el usuario ha inicializado el video utilizando el `NewVideoWizard` (Flujo de Producción Optimizada).
- Divide la información de manera más limpia y focalizada según la fase del proyecto (`ProductionStageId`).
- Minimiza la cantidad de metadatos visibles a la vez.
- Mantiene a la vista la "Tesis" o "Brief" del proyecto (Idea, Audiencia, Promesa) para no perder el contexto durante la redacción.
- Acciones integradas directas con el Global Store para marcar `stages` como "in_progress" o "done".

### `Chatbot.tsx`
Chatbot flotante con integración de Gemini. Funcionalidades:
- Ventana de chat expandible desde botón flotante
- Historial de mensajes con renderizado Markdown
- Chips de sugerencias para acciones comunes
- Envía el contexto completo del tablero a Gemini en cada mensaje
- **Function calling** (6 funciones): Gemini puede ejecutar acciones en el tablero:
  - `addCard(listId, title)` — Crear tarjetas en cualquier columna
  - `moveCard(cardId, destListId)` — Mover tarjetas entre fases
  - `updateCard(cardId, title?, description?)` — Actualizar tarjetas
  - `suggestKeywords(cardId, keywords)` — Inyectar SEO estratégico
  - `updateMonetization(cardId, updates)` — Gestionar monetización
  - `setContentType(cardId, type)` — Definir Short o Video Largo
- Personalidad: "Estratega de Crecimiento de YouTube nivel experto"

### `AudioRecorder.tsx`
Componente para grabar audio desde el micrófono y transcribirlo:
- Acceso al micrófono via `navigator.mediaDevices.getUserMedia`
- Graba audio en formato WebM
- Envía el audio a Gemini para transcripción
- El texto transcrito se inserta en la descripción de la tarjeta

### `FilterBar.tsx`
Barra de filtros horizontal entre el header y el tablero:
- **Filtro de tipo**: Todos / Largo (Film icon) / Short (Zap icon)
- **Filtro de responsable**: Todos / Tú / Editor
- Los filtros se pasan como props al `Board` para filtrar tarjetas visibles

### `TeamGuide.tsx`
Panel lateral deslizable con guía operativa completa. Estructura de 3 pestañas:
- **Workflow**: Cadencia (1 largo/semana + 2-3 shorts), Semana Tipo (Lunes-Sábado), tiempos reales (15-30h/semana), estructura de carpetas Drive
- **Roles**: Responsabilidades Creador vs Editor, protocolo de handoff (4 pasos con triggers), reglas de comunicación (FrameFlow vs WhatsApp), SLAs (brutos 24h, primer corte 48h, review 12h, cambios 24h)
- **Estrategia**: Fórmula 10X, SEO cola larga, estrategia de Shorts, monetización, protocolo de emergencia CTR

### `Dashboard.tsx`
Panel de visualización de métricas y analíticas:
- **Regla 1 de 10**: Recordatorio visual de la regla de experimentación
- **Métricas generales**: Total de tarjetas, completadas, CTR promedio, monetizadas
- **Pipeline**: Visualización de tarjetas por fase con barras de progreso
- **Mix de contenido**: Distribución Largos vs Shorts con gráfica visual
- **CTR Watch**: Tarjetas con peor CTR para intervención rápida
- **Monetización**: Resumen de revenue e ingresos potenciales
- **Checklist health**: Progreso general de checklists con anillo SVG
- **Grafo de Interlinking**: Visualización de conexiones entre videos (vía InterlinkingGraph)

### `InterlinkingGraph.tsx`
Visualización de la "telaraña" de videos:
- Construye links a partir de `interlinkingTargets` y `shortsFunnel` de cada tarjeta
- Clasifica conexiones: Short→Largo, Viral→Ventas, Viral→Evergreen, Short→Short, Otro
- Renderiza cards agrupados por tipo de enlace con bordes coloreados
- Incluye componentes `CardChip` clickeables para navegar entre tarjetas

### `BoardSettings.tsx`
Modal de configuración del canal:
- Nombre del canal (editable)
- Nicho / Océano Azul (editable)
- Tipo de contenido por defecto (toggle Largo/Short)
- Lista de miembros del equipo con asignación de roles y botón para revocar acceso
- Estadísticas: total de videos, tarjetas activas, miembros

### `CustomScrollbar.tsx`
Componente de utilidad envolvente que proporciona barras de desplazamiento diseñadas a medida para contenedores con desbordamiento (overflow), integradas fluidamente con Tailwind.

---

## Hooks y Utilidades

### `useTheme.tsx`
Gestiona el sistema de temas (dark, light, soft) persistiendo la selección del usuario en el navegador y aplicando las clases necesarias al `html`/`body` para que Tailwind se encargue de inyectar las variables o esquemas definidos.

### `useIsMobile.ts`
Hook utilitario que escucha los eventos visuales del tamaño de la ventana (Window Resize) para determinar fácilmente si el cliente actualmente está en un dispositivo de resolución móvil o menor (`max-width: 768px`). Útil para colapsar paneles o modales dinámicamente.

---

## Gestión de Estado

El estado se gestiona con React Context API en `src/store.tsx`.

### `BoardContext`

```typescript
interface BoardContextType {
  // Estado
  user: AppUser | null;          // Usuario autenticado
  boards: Board[];                // Todos los tableros del usuario
  board: Board | null;            // Tablero actualmente seleccionado
  currentBoardId: string | null;  // ID del tablero actual
  isAuthReady: boolean;           // Si la autenticación ha sido verificada
  saveState: 'idle' | 'saving' | 'saved' | 'error'; // UX optimista de guardado

  // Roles y Permisos (RBAC)
  currentUserRole: MemberRole | null;
  isBoardOwner: boolean;
  canEditBoard: boolean;
  canInviteMembers: boolean;

  // Presencia Colaborativa (Realtime)
  boardPresenceMembers: BoardPresenceMember[];
  boardPresenceEvents: BoardPresenceEvent[];
  onlineMemberCount: number;

  // Acciones - Tablero
  setCurrentBoardId: (id: string) => void;
  createBoard: (title: string) => Promise<void>;
  deleteBoard: (boardId: string) => Promise<void>;
  inviteMember: (email: string, role: string) => Promise<{ ok: boolean; error?: string }>;
  removeMember: (email: string) => Promise<void>;

  // Acciones - Tarjetas
  addCard: (listId: string, title: string) => void;
  createVideoFromFlow: (input: CreateVideoFromFlowInput) => void; // Desde wizard
  updateCard: (cardId: string, updates: Partial<Card>) => void;
  deleteCard: (cardId: string, listId: string) => void;
  moveCard: (sourceListId: string, destListId: string, sourceIndex: number, destIndex: number, cardId: string) => void;

  // Acciones - Flujo Guiado (Production Flow)
  setProductionStageStatus: (cardId: string, stageId: ProductionStageId, status: ProductionStageStatus) => void;
  updateProductionStage: (cardId: string, stageId: ProductionStageId, updates: Partial<{dueAt: string; notes: string}>) => void;

  // Acciones - Checklists y Labels
  addChecklist: (cardId: string, templateName: keyof typeof CHECKLIST_TEMPLATES) => void;
  toggleChecklistItem: (cardId: string, checklistId: string, itemId: string) => void;
  toggleLabel: (cardId: string, label: Label) => void;

  // Auth
  signIn: () => void;
  signOut: () => void;
}
```

### Listeners en tiempo real (Effects)

1. **Auth Listener** (`onAuthStateChanged`): Detecta cambios en la sesión. Al autenticar, guarda el perfil en Firestore.
2. **Boards Listener** (`onSnapshot` con query): Escucha todos los tableros donde el email del usuario está en `members[]`. Auto-selecciona el primero si no hay ninguno seleccionado. Migra datos de `localStorage` si existen.
3. **Current Board Listener** (`onSnapshot` por documento): Escucha cambios en tiempo real del tablero actualmente seleccionado.
4. **Presence Listener**: Se suscribe a `presence_members` y `presence_events` (subcolecciones del tablero instanciadas a su vez desde la RTDB gracias a Firebase Functions) para conocer a tiempo real otros miembros conectados.

### Patrón de actualización

Todas las operaciones de escritura usan **actualizaciones optimistas**: primero se actualiza el estado local (`setBoard`), la UI marca el `saveState` como envolvente `saving`, se persiste en Firestore (`updateDoc`), y finalmente el `saveState` cambia fluidamente a `saved`. Esto proporciona una UX fluida sin esperar la confirmación explícita restrictiva del servidor.

---

## Integración con IA (Gemini)

### Inicialización

```typescript
// src/lib/gemini.ts
import { GoogleGenAI } from '@google/genai';
export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
```

### Modelos utilizados

| Contexto | Modelo | Uso |
|----------|--------|-----|
| Chatbot | `gemini-3.1-pro-preview` | Conversación completa con function calling |
| Mejorar título | `gemini-3.1-flash-lite-preview` | Sugerencia de títulos optimizados |
| Confirmar título | `gemini-3.1-flash-lite-preview` | Validación del título aceptado |
| Transcripción | `gemini-3-flash-preview` | Audio a texto (AudioRecorder) |

### Function Calling (Chatbot)

El chatbot define 6 funciones que Gemini puede invocar para manipular el tablero directamente:

| Función | Parámetros | Propósito |
|---------|------------|-----------|
| `addCard` | `listId, title` | Crear una nueva tarjeta en cualquier columna |
| `moveCard` | `cardId, destListId` | Mover tarjeta entre fases del pipeline |
| `updateCard` | `cardId, title?, description?`| Actualizar título y/o descripción |
| `suggestKeywords`| `cardId, keywords` | Inyectar SEO estratégico (string separado por comas) |
| `updateMonetization`| `cardId, hasAffiliate?, affiliateLinks?, hasSponsor?, sponsorName?, estimatedRPM?, sellsProduct?` | Gestionar monetización completa |
| `setContentType`| `cardId, contentType` | Definir estrategia ('long' o 'short') |

**Flujo:**
1. Se construye el contexto del tablero (columnas + tarjetas con IDs)
2. Se envía el historial de chat + mensaje del usuario + contexto a Gemini
3. Si Gemini responde con un `functionCall`, se ejecuta la acción en el tablero
4. Se envía el resultado de la función de vuelta a Gemini como `functionResponse`
5. Gemini genera una respuesta final en lenguaje natural

### System Instruction del Chatbot

El chatbot está configurado como un "Estratega de Crecimiento de YouTube nivel experto" que:
- Se enfoca en Retención, CTR y Psicología del Clic
- Exige la estructura narrativa "Quería X, PERO pasó Y, POR LO TANTO hice Z" (Regla de South Park)
- Genera ganchos de 8 segundos
- Aplica el "Método Linden" para variantes de títulos
- Puede manipular directamente el tablero Kanban

---

## Autenticación y Seguridad

### Autenticación

- **Proveedor**: Google OAuth via `signInWithPopup` de Firebase Auth
- **Flujo**: Login → Firebase Auth → Guardar perfil en `/users/{uid}` → Cargar tableros
- **Cierre de sesión**: Limpia el estado local (user, boards, currentBoard) y cierra la sesión de Firebase

### Reglas de Firestore (`firestore.rules`)

```
/users/{userId}
  - read:   cualquier usuario autenticado
  - create: solo el propio usuario (uid coincide)
  - update: solo el propio usuario (uid coincide, no puede cambiar uid)

/boards/{boardId}
  - read:   owner, miembros por email, o admin
  - create: cualquier autenticado (con datos válidos, ownerId = auth.uid)
  - update: owner, miembros o admin (no puede cambiar ownerId)
  - delete: solo owner o admin
```

### Validaciones

- **Usuario**: requiere `uid` y `email` válidos
- **Tablero**: requiere `id`, `title` (1-100 chars), `ownerId`, `members` (<50), `lists`, `cards`
- **Admin**: `keanukeanom@gmail.com` con email verificado

---

## Funciones Backend (Firebase Functions)

El backend expone operaciones gen 2 documentadas en `functions/index.js`, manejando validación de auth de los usuarios:

| Función | Tipo | Propósito |
|---------|------|-----------|
| `getYouTubeChannelData` | `onCall` | Obtiene KPIs y videos recientes de un canal usando la API de YouTube. Protegido por autenticación y utiliza el secreto `YOUTUBE_API_KEY`. |
| `inviteBoardMember` | `onCall` | Agrega un nuevo miembro a un canal, asegurando control de acceso para que sólo los dueños o miembros administradores interactúen con la lista. |
| `removeBoardMember` | `onCall` | Revoca acceso a un miembro de un tablero específico. |
| `syncPresenceToBoards` | `onValueWritten` | Función de Realtime Database. Traduce la actividad cruda y el estado de conexión hacia agregados manejables y persistentes en Firestore (`presence_members` y `presence_events`). |

---

## Flujo de Trabajo YouTube (Fórmula 10X)

El tablero viene preconfigurado con 7 columnas que representan el pipeline de producción:

### Pipeline de columnas

```
1. Ideas (Océano Azul)         → Brainstorming de ideas con estrategia blue ocean
2. Títulos (Método Linden)     → Generación de 50+ variantes de títulos
3. Guion (Gancho 8s)           → Escritura del guion con gancho optimizado
4. Miniaturas (CTR Alto)       → Diseño de miniaturas (Rostro + Texto + Contexto)
5. Edición (Retención)         → Edición con cambio visual cada 10 segundos
6. Publicación (Interlinking)  → SEO, etiquetas, links y comentario fijado
7. Ataque al Corazón (<24h)    → Monitorización de CTR en las primeras 2 horas
```

### Campos especializados por tarjeta

Cada tarjeta de video tiene campos personalizados que guían al creador por el proceso:

| Campo | Propósito |
|-------|-----------|
| **Método Linden** | Escribir múltiples variantes de título usando brecha de curiosidad y SEO |
| **Gancho 8s** | Definir el hook de los primeros 8 segundos (Start with End / Dolor / Ruptura) |
| **Narrativa** | Estructurar el storytelling: "Quería X, PERO pasó Y, POR LO TANTO hice Z" |
| **Checklist Miniatura** | Verificar los 3 elementos: Rostro, Texto, Contexto |
| **CTR a 2H** | Registrar y monitorear el CTR en las primeras 2 horas post-publicación |
| **Interlinking** | URL del video a enlazar (efecto "telaraña" / rebufo) |
| **Link Drive** | Enlace a los brutos/recursos en Google Drive |

### Alerta de CTR

El campo CTR a 2 horas incluye feedback visual:
- **CTR < 4%** → Fondo rojo + alerta: "¡Cambia miniatura/título AHORA!"
- **CTR >= 4%** → Fondo verde + mensaje: "CTR Saludable. Mantén el impulso."

---

## Configuración y Despliegue

### Desarrollo local

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
# Crear .env.local con tu GEMINI_API_KEY

# 3. Iniciar servidor de desarrollo
npm run dev
# → http://localhost:3000
```

### Scripts disponibles

| Script | Comando | Descripción |
|--------|---------|-------------|
| `dev` | `vite --port=3000 --host=0.0.0.0` | Servidor de desarrollo con HMR |
| `build` | `vite build` | Compilar para producción (output en `dist/`) |
| `preview` | `vite preview` | Previsualizar build de producción |
| `clean` | `rm -rf dist` | Limpiar directorio de build |
| `lint` | `tsc --noEmit` | Verificación de tipos TypeScript |

### Despliegue (Firebase Hosting)

```bash
# Build de producción
npm run build

# Desplegar a Firebase Hosting
firebase deploy --only hosting
```

**Configuración de hosting** (`firebase.json`):
- Sitio: `jesus-frameflow`
- Directorio público: `dist/`
- SPA rewrite: todas las rutas redirigen a `/index.html`
- Headers de caché deshabilitados para archivos en `dist/`

---

## Variables de Entorno

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `GEMINI_API_KEY` | Sí | API key de Google Gemini para funcionalidades de IA |
| `APP_URL` | No | URL de la aplicación (inyectada en Cloud Run) |

La API key de Gemini se inyecta en tiempo de build via `vite.config.ts`:

```typescript
define: {
  'process.env.GEMINI_API_KEY': JSON.stringify(process.env.GEMINI_API_KEY),
}
```

---

## Estructura de Firestore

```
firestore/
├── users/
│   └── {uid}/
│       ├── uid: string
│       ├── email: string
│       ├── displayName: string
│       └── photoURL: string
│
└── boards/
    └── {boardId}/
        ├── id: string
        ├── title: string
        ├── ownerId: string
        ├── members: string[]
        ├── lists: List[]
        ├── cards: { [cardId]: Card }
        ├── createdAt: string (ISO)
        └── updatedAt: string (ISO)
```

> **Nota**: Todo el estado del tablero (listas, tarjetas, checklists) se almacena como un solo documento de Firestore. Esto simplifica la sincronización en tiempo real pero tiene un límite de 1MB por documento.

---

## Sistema de Diseño

### Design Tokens (`index.css`)

La aplicación define variables CSS personalizadas para mantener consistencia visual:

```css
:root {
  --ff-primary: #2563eb;        /* Azul principal */
  --ff-primary-dark: #1d4ed8;   /* Azul oscuro */
  --ff-accent: #6366f1;         /* Indigo acento */
  --ff-surface: rgba(255,255,255,0.65);  /* Superficie glass */
  --ff-surface-solid: #ffffff;
  --ff-bg: #f1f5f9;             /* Fondo general */
  --ff-bg-subtle: #f8fafc;      /* Fondo sutil */
  --ff-border: rgba(0,0,0,0.06);
  --ff-shadow-sm/md/lg/xl       /* 4 niveles de sombra */
  --ff-radius: 0.75rem;         /* Border radius estándar */
  --ff-radius-lg: 1rem;
  --ff-radius-xl: 1.25rem;
}
```

### Animaciones

| Clase | Efecto | Uso |
|-------|--------|-----|
| `.ff-slide-up` | Desliza hacia arriba con scale | Cards, modales |
| `.ff-scale-in` | Escala desde 0.95 | Login, paneles |
| `.ff-fade-in` | Fade de opacidad | Transiciones suaves |
| `.ff-float` | Flotación vertical sutil | Elementos decorativos |

### Estilos globales

- **Tipografía**: Inter (Google Fonts) con font-smoothing antialiased
- **Scrollbar personalizado**: 6px delgado con thumb semi-transparente (webkit + Firefox)
- **Glass effect** (`.ff-glass`): backdrop-blur + borde semi-transparente
- **Card shadow** (`.ff-card-shadow`): sombra que se intensifica en hover
- **Overflow protection**: `overflow-x: hidden` en html/body/#root para prevenir scroll horizontal
