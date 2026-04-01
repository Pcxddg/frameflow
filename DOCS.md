# FrameFlow - Documentacion Tecnica

## Tabla de Contenidos

1. [Descripcion General](#descripcion-general)
2. [Arquitectura del Sistema](#arquitectura-del-sistema)
3. [Stack Tecnologico](#stack-tecnologico)
4. [Estructura del Proyecto](#estructura-del-proyecto)
5. [Modelo de Datos (PostgreSQL)](#modelo-de-datos-postgresql)
6. [Componentes](#componentes)
7. [Gestion de Estado](#gestion-de-estado)
8. [Integracion con IA (Gemini)](#integracion-con-ia-gemini)
9. [Autenticacion y Seguridad](#autenticacion-y-seguridad)
10. [Edge Functions (Backend)](#edge-functions-backend)
11. [Sistema de Presencia](#sistema-de-presencia)
12. [Flujo de Trabajo YouTube (Formula 10X)](#flujo-de-trabajo-youtube-formula-10x)
13. [Configuracion y Despliegue](#configuracion-y-despliegue)
14. [Variables de Entorno](#variables-de-entorno)

---

## Descripcion General

**FrameFlow** es una aplicacion de gestion de proyectos tipo Kanban disenada para creadores de contenido en YouTube y sus equipos. Combina la gestion visual de tareas con inteligencia artificial (Google Gemini) para optimizar el pipeline de produccion de videos.

### Caracteristicas principales

- **Tablero Kanban colaborativo** en tiempo real con drag & drop
- **Chatbot IA** (Gemini) que actua como estratega de crecimiento de YouTube y puede manipular el tablero directamente via function calling
- **Pipeline de produccion** de 12 fases basado en la "Formula 10X"
- **Wizard "Idea first + IA asistida"** para crear videos desde brief hasta guion con IA
- **SEO automatizado**: generacion de keywords, descripciones y hashtags con IA
- **Grabacion y transcripcion de audio** integrada con Gemini
- **Mejora de titulos con IA** para optimizar CTR
- **Colaboracion en equipo** con roles (Creador / Editor / Viewer) y RBAC via RLS
- **Sistema de presencia** en tiempo real (quien esta online, en que vista)
- **Invitaciones por email** con soporte para usuarios sin cuenta (pending invitations)

---

## Arquitectura del Sistema

```
┌──────────────────────────────────────────────────────────────┐
│                     Cliente (React SPA)                       │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  ┌─────────┐  │
│  │ Channel  │  │ Board &  │  │ VideoWizard  │  │ Chatbot │  │
│  │ Home     │  │ CardModal│  │ (GenAI / IA) │  │ / Audio │  │
│  └────┬─────┘  └────┬─────┘  └──────┬───────┘  └────┬────┘  │
│       │              │               │               │       │
│       └──────────────┴───────┬───────┴───────────────┘       │
│                              │                               │
│                    ┌─────────┴─────────┐                     │
│                    │  BoardContext     │                     │
│                    │  (store.tsx)      │                     │
│                    └─────────┬─────────┘                     │
│                              │                               │
└──────────────────────────────┼───────────────────────────────┘
                               │
                ┌──────────────┼────────────────┐
                │              │                │
       ┌────────┴───┐  ┌──────┴────────┐  ┌────┴──────────┐
       │  Supabase  │  │  Supabase     │  │  Gemini REST  │
       │  Auth      │  │  PostgreSQL   │  │  API (via     │
       │  (Google   │  │  + Realtime   │  │  Edge Fn)     │
       │  OAuth)    │  │  + RLS        │  │               │
       └────────────┘  └───────────────┘  └───────────────┘
```

### Flujo de datos

1. El usuario se autentica con Google OAuth via Supabase Auth (flujo PKCE)
2. El perfil se crea automaticamente en `profiles` via trigger `handle_new_profile`
3. La interfaz `ChannelHome` muestra todos los canales (boards) donde el usuario es miembro
4. Los tableros se sincronizan en tiempo real via `subscribeBoardSnapshot()` (Supabase Realtime)
5. La presencia se rastrea con heartbeats cada 30s en `presence_sessions`
6. Las acciones del usuario (CRUD de tarjetas, drag & drop) se persisten con actualizaciones optimistas
7. Las llamadas a Gemini pasan por la edge function `ai-assist` como proxy seguro

---

## Stack Tecnologico

| Categoria | Tecnologia | Version |
|-----------|------------|---------|
| Framework | React | 19.0.0 |
| Lenguaje | TypeScript | 5.8.2 |
| Bundler | Vite | 6.2.0 |
| Estilos | Tailwind CSS | 4.1.14 |
| Base de datos | Supabase (PostgreSQL 17) | — |
| Autenticacion | Supabase Auth (Google OAuth, PKCE) | — |
| Tiempo real | Supabase Realtime (postgres_changes) | — |
| Backend | Supabase Edge Functions (Deno) | — |
| IA | Google Gemini | 2.5-flash / 2.0-flash-lite / 2.5-pro |
| Hosting | Cloudflare Workers | — |
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
│   │   ├── card-modal/
│   │   │   ├── panels/           # Paneles por fase: Idea, Title, Script, Thumbnail, etc.
│   │   │   ├── hooks/            # useCardAi, useCardActions, usePhaseNavigation, etc.
│   │   │   ├── CardModal.tsx     # Modal wrapper
│   │   │   ├── CardModalHeader.tsx
│   │   │   ├── CardModalPhaseNav.tsx
│   │   │   ├── constants.ts
│   │   │   └── types.ts
│   │   ├── AppHeader.tsx         # Header con selector de canales, avatar, presencia
│   │   ├── AudioRecorder.tsx     # Grabacion de audio + transcripcion via Gemini
│   │   ├── Board.tsx             # Contenedor principal del tablero con drag & drop
│   │   ├── BoardSettings.tsx     # Modal de configuracion del canal
│   │   ├── Card.tsx              # Tarjeta visual con badges SEO, progreso, storytelling
│   │   ├── ChannelHome.tsx       # Vista de canales con stats y delete
│   │   ├── Chatbot.tsx           # Chatbot IA con function calling de Gemini
│   │   ├── CustomScrollbar.tsx   # Scrollbar personalizado
│   │   ├── Dashboard.tsx         # Panel de metricas, pipeline y analiticas
│   │   ├── FilterBar.tsx         # Filtros de tipo de contenido y responsable
│   │   ├── GuidedCardWorkspace.tsx # Workspace guiado por fases del production flow
│   │   ├── InterlinkingGraph.tsx # Grafo de conexiones entre videos
│   │   ├── List.tsx              # Columna del tablero Kanban
│   │   ├── NewVideoWizard.tsx    # Wizard de 4 pasos para crear videos con IA
│   │   ├── TeamGuide.tsx         # Panel lateral con guia operativa
│   │   └── TeleprompterOverlay.tsx # Overlay de teleprompter para grabacion
│   ├── hooks/
│   │   └── useIsMobile.ts        # Deteccion de dispositivo movil
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts         # Inicializacion del cliente Supabase
│   │   │   └── frameflow.ts      # Operaciones de datos: auth, CRUD, presencia, invitaciones
│   │   ├── aiContracts.ts        # Contratos de request/response para IA
│   │   ├── analytics.ts          # Tracking de eventos
│   │   ├── audit.ts              # Normalizacion y audit trail
│   │   ├── cardModalEvents.ts    # Sistema de eventos para el modal
│   │   ├── gemini.ts             # Orquestacion de IA: retry, fallback, error handling
│   │   ├── optimizedVideoFlow.ts # Motor de workflow de produccion
│   │   ├── presence.ts           # Controller de presencia (heartbeat, sessions)
│   │   ├── thumbnailPrompt.ts    # Prompts para generacion de thumbnails
│   │   ├── utils.ts              # Utilidad cn() para Tailwind CSS
│   │   ├── videoFlowAi.ts        # Generacion de briefs y seeds con IA
│   │   ├── videoSeoAi.ts         # SEO automatizado con IA
│   │   ├── videoSeoConfig.ts     # Configuracion de SEO por canal
│   │   ├── workflowPlans.ts      # Templates de workflow de produccion
│   │   └── youtube.ts            # Integracion con YouTube API
│   ├── App.tsx                   # Layout principal: header, vistas, presencia, rail panels
│   ├── main.tsx                  # Entry point de React
│   ├── store.tsx                 # Estado global con Context API + listeners Supabase
│   ├── types.ts                  # Interfaces TypeScript completas
│   ├── useTheme.tsx              # Provider de tema (dark/light/soft)
│   └── index.css                 # Design tokens, animaciones y estilos base
├── supabase/
│   ├── config.toml               # Configuracion local de Supabase
│   ├── migrations/
│   │   └── 20260331_000001_frameflow_init.sql  # Schema completo: tablas, views, RLS, funciones
│   └── functions/
│       ├── _shared/
│       │   ├── auth.ts           # requireUser(), createAdminClient()
│       │   └── cors.ts           # corsHeaders, jsonResponse()
│       ├── ai-assist/            # Proxy seguro para Gemini REST API
│       ├── youtube-channel-data/ # Fetch de stats de canal YouTube
│       ├── accept-invitation/    # Aceptar invitaciones a boards
│       └── remove-board-member/  # Remover miembros de boards
├── package.json
├── tsconfig.json
├── vite.config.ts
├── .env.example
└── index.html
```

---

## Modelo de Datos (PostgreSQL)

El schema completo esta en `supabase/migrations/20260331_000001_frameflow_init.sql`.

### Tablas principales

```
profiles                     # Perfiles de usuario (auto-creados via trigger)
├── id (uuid, PK)            → auth.users(id)
├── email, email_lowercase
├── display_name, photo_url
└── created_at, updated_at

boards                       # Canales / tableros Kanban
├── id (text, PK)
├── title, owner_id          → profiles(id)
├── niche_name, default_content_type
├── youtube_channel_url
├── workflow_config (jsonb)   # Cadencia, roles, editor level
├── seo_config (jsonb)        # Templates SEO, redes sociales
├── description_presets (jsonb)
└── created_at, updated_at

board_members                # Membresía con roles
├── board_id + user_id (PK)
├── email_lowercase
├── role                     # 'owner' | 'editor' | 'viewer'
└── created_at, updated_at

lists                        # Columnas del Kanban
├── id (text, PK)
├── board_id, title, position
└── created_at, updated_at

cards                        # Tarjetas de video (40+ campos)
├── id (text, PK)
├── board_id, list_id, position, title, description
├── due_date, assignee, content_type ('long'|'short')
├── titulos_linden, gancho_8s, narrativa, guion
├── keywords, seo_source_text
├── miniatura_checklist (jsonb), thumbnail_plan (jsonb)
├── ctr_2_hours, interlinking, link_drive, drive_links (jsonb)
├── storytelling (jsonb)      # queria/pero/porLoTanto
├── post_publication (jsonb)
├── monetization (jsonb)      # affiliate, sponsor, revenue
├── interlinking_targets (jsonb)
├── shorts_hook, shorts_loop, shorts_funnel
├── column_history (jsonb)    # Historial de fases
├── production_brief (jsonb)  # Brief del video (idea, audience, etc.)
└── created_at, updated_at

labels                       # Etiquetas por board
├── board_id + id (PK)
├── name, color
└── created_at, updated_at

card_labels                  # Relacion card ↔ label
├── card_id + label_id (PK)
└── board_id

checklists                   # Checklists por tarjeta
├── id (text, PK)
├── card_id, title, position
└── created_at, updated_at

checklist_items              # Items individuales
├── id (text, PK)
├── checklist_id, text, is_completed, position
└── created_at, updated_at

production_flows             # Workflow guiado por tarjeta
├── card_id (text, PK)       → cards(id)
├── template_id, publish_at, current_stage_id
├── schedule_mode, work_mode, schedule_status
├── is_tight_schedule, working_days_budget
├── kickoff_at, raw (jsonb)
└── created_at, updated_at

production_stages            # Etapas individuales del workflow
├── card_id + stage_id (PK)  → production_flows(card_id)
├── label, macro_column_id, owner_role, fallback_owner_role
├── deliverable, status, due_at, completed_at
├── notes, checklist_title, has_ai_draft, position
└── created_at, updated_at

invitations                  # Invitaciones a boards
├── id (uuid, PK)
├── board_id, board_title_snapshot
├── invitee_email_lowercase, inviter_user_id
├── role ('editor'|'viewer'), status ('pending'|'accepted'|'declined'|'revoked')
└── created_at, updated_at, responded_at

audit_events                 # Log de eventos de auditoria
├── id (text, PK)
├── board_id, card_id, actor_email, type
├── at, from_list_id, to_list_id, payload (jsonb)
└── created_at

presence_sessions            # Sesiones de presencia activa
├── id (uuid, PK)
├── board_id, user_id, email_lowercase
├── display_name, photo_url, active_surface
├── is_online, last_heartbeat_at, entered_at, left_at
└── created_at, updated_at

presence_events              # Log de eventos de presencia
├── id (uuid, PK)
├── board_id, user_id, email_lowercase
├── display_name, photo_url, type, surface, at
└── created_at
```

### Views

| Vista | Proposito |
|-------|-----------|
| `board_online_members` | Miembros activos con heartbeat < 75s, deduplicados por `(board_id, user_id)` |
| `board_health` | Metricas por board: total cards, guided cards, risky cards, online count |
| `board_flow_summary` | Resumen del production flow por stage y status |

### Funciones SQL

| Funcion | Tipo | Proposito |
|---------|------|-----------|
| `current_user_email()` | SQL | Extrae email del JWT del usuario actual |
| `is_board_member(board_id)` | SQL, security definer | Verifica si el usuario es miembro del board |
| `board_role(board_id)` | SQL, security definer | Retorna el rol del usuario en el board |
| `can_edit_board(board_id)` | SQL | Retorna true si el rol es 'owner' o 'editor' |
| `lookup_profile_by_email(email)` | SQL, security definer | Busca perfil por email (bypasea RLS) |
| `handle_new_profile()` | Trigger | Auto-crea perfil al registrarse un usuario |
| `seed_board_defaults()` | Trigger | Inicializa etiquetas por defecto al crear board |
| `touch_updated_at()` | Trigger | Auto-actualiza `updated_at` en modificaciones |

### Etiquetas predefinidas

| Color | Nombre | Uso |
|-------|--------|-----|
| Rojo | Urgente | Tareas prioritarias |
| Amarillo | Esperando feedback | Pendiente de revision |
| Azul | En manos del editor | Delegado al editor |
| Verde | Listo para publicar | Aprobado para publicacion |
| Morado | Short | Contenido tipo Short |
| Naranja | Monetizado | Tarjeta con monetizacion activa |

---

## Componentes

### `App.tsx`
Componente raiz. Envuelve la aplicacion en `BoardProvider` para proveer el estado global. Contiene:
- Pantalla de carga mientras se inicializa la autenticacion
- Pantalla de login con Google si no hay usuario autenticado
- **AppHeader** con selector de canales, avatar, presencia online y menu de usuario
- **Area principal**: Renderiza `ChannelHome` (vista de canales), `Board` (con filtros) o `Dashboard`
- **Rail lateral** (desktop): panels de settings, chatbot, share, guide
- **Sheets** (mobile): menu, share, chatbot, boards
- **Presence controller**: heartbeats cada 30s, tracking de vista activa

### `AppHeader.tsx`
Header responsive con dos variantes (desktop/mobile):
- Selector de canal con dropdown
- Indicador de presencia online (avatares + counter)
- Menu de usuario con opciones contextuales
- Badge de estado de guardado (saving/saved/error)

### `ChannelHome.tsx`
Pantalla de inicio ("Tus Canales"):
- Creacion de nuevos canales
- Resumen estadistico por canal
- Eliminacion de canales (solo owner, con confirmacion)
- Navegacion rapida entre Board y Dashboard

### `Board.tsx`
Contenedor principal del tablero Kanban:
- Contexto de `@hello-pangea/dnd` para drag & drop
- Filtros de tipo de contenido y responsable
- Renderiza columnas (`List`) con tarjetas filtradas
- Maneja `onDragEnd` para reordenar/mover tarjetas

### `Card.tsx`
Tarjeta visual individual en el tablero:
- Etiquetas de color, titulo
- Badge SEO (cuando hay keywords)
- Anillo de progreso SVG (% checklist completado)
- Dots de storytelling (narrativa completa)
- Borde rojo pulsante (CTR < 4% en ultima columna)
- Indicadores de fecha, asignado, tipo de contenido
- Draggable via `@hello-pangea/dnd`

### `card-modal/` (subdirectorio)
Modal completo de edicion de tarjetas, organizado en sub-componentes:

**Panels** (uno por fase del pipeline):
- `IdeaPanel.tsx` — Brainstorming, brief, research
- `TitlePanel.tsx` — Titulos, hook, CTR
- `ScriptPanel.tsx` — Guion, storytelling
- `ThumbnailPanel.tsx` — Thumbnail plan, generacion IA
- `EditingPanel.tsx` — Post-produccion
- `PublishPanel.tsx` — SEO, descripcion, scheduling
- `PostPubPanel.tsx` — Analisis post-publicacion

**Hooks**:
- `useCardAi.ts` — Generacion de contenido IA (titulos, thumbnails, scripts)
- `useCardActions.ts` — Acciones de manipulacion de tarjeta
- `useCardDerived.ts` — Propiedades computadas
- `usePhaseNavigation.ts` — Navegacion entre fases
- `useImageUpload.ts` — Upload de imagenes
- `useFlowStyles.ts` — Estilos por fase

### `NewVideoWizard.tsx`
Wizard de 4 pasos ("Idea first + IA asistida"):
1. **Idea base**: Tesis general del video
2. **Preguntas clave**: Brief operativo (audiencia, tono, promesa) con sugerencias IA
3. **Generar con IA**: Seeds via Gemini (titulo + 10 alternativas, hook, research, guion)
4. **Revision Final**: Editar y validar antes de crear la tarjeta

### `GuidedCardWorkspace.tsx`
Workspace que reemplaza el interior del CardModal cuando el video fue creado desde el Wizard:
- Vista paso a paso segun `ProductionStageId`
- Brief siempre visible como contexto
- Acciones integradas para marcar stages como `in_progress` o `done`

### `Chatbot.tsx`
Chatbot con Gemini y function calling (6 funciones):
- `addCard`, `moveCard`, `updateCard`, `suggestKeywords`, `updateMonetization`, `setContentType`
- Personalidad: "Estratega de Crecimiento de YouTube nivel experto"
- Contexto completo del tablero enviado en cada mensaje
- Historial con renderizado Markdown

### `Dashboard.tsx`
Panel de metricas:
- Pipeline visual por fase con barras de progreso
- Mix de contenido (Largos vs Shorts)
- CTR Watch (tarjetas con peor CTR)
- Resumen de monetizacion
- Checklist health
- Grafo de interlinking

### Otros componentes

| Componente | Proposito |
|------------|-----------|
| `AudioRecorder.tsx` | Grabacion de audio + transcripcion via Gemini |
| `BoardSettings.tsx` | Configuracion del canal, miembros, roles |
| `FilterBar.tsx` | Filtros de tipo (Largo/Short) y responsable |
| `InterlinkingGraph.tsx` | Visualizacion de conexiones entre videos |
| `List.tsx` | Columna individual del Kanban |
| `TeamGuide.tsx` | Guia operativa (Workflow, Roles, Estrategia) |
| `TeleprompterOverlay.tsx` | Overlay de teleprompter para grabacion |
| `CustomScrollbar.tsx` | Scrollbar personalizado |

---

## Gestion de Estado

El estado se gestiona con React Context API en `src/store.tsx`.

### `BoardContext`

```typescript
interface BoardContextType {
  // Estado
  user: AppUser | null;
  boards: Board[];
  board: Board | null;
  currentBoardId: string | null;
  isAuthReady: boolean;
  saveState: 'idle' | 'saving' | 'saved' | 'error';

  // Roles y Permisos (RBAC via RLS)
  currentUserRole: MemberRole | null;  // 'owner' | 'editor' | 'viewer'
  isBoardOwner: boolean;
  canEditBoard: boolean;
  canInviteMembers: boolean;

  // Presencia Colaborativa
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
  createVideoFromFlow: (input: CreateVideoFromFlowInput) => void;
  updateCard: (cardId: string, updates: Partial<Card>) => void;
  deleteCard: (cardId: string, listId: string) => void;
  moveCard: (...) => void;

  // Acciones - Production Flow
  setProductionStageStatus: (cardId, stageId, status) => void;
  updateProductionStage: (cardId, stageId, updates) => void;

  // Auth
  signIn: () => void;
  signOut: () => void;
}
```

### Listeners en tiempo real

| Listener | Funcion | Fuente |
|----------|---------|--------|
| Auth | `subscribeToAuthState()` | Supabase Auth `onAuthStateChange` |
| Boards list | `subscribeBoardsForUser()` | Supabase Realtime (tabla `board_members`) |
| Board snapshot | `subscribeBoardSnapshot()` | Supabase Realtime (multiples tablas) |
| Presence | `subscribePresence()` | Supabase Realtime (tablas `presence_sessions` + `presence_events`) |
| Audit events | `subscribeAuditEvents()` | Supabase Realtime (tabla `audit_events`) |

### Patron de actualizacion

Todas las operaciones usan **actualizaciones optimistas**:
1. Se actualiza el estado local (`setBoard`)
2. `saveState` cambia a `'saving'`
3. Se persiste en PostgreSQL via `saveBoardSnapshot()` (upserts por tabla)
4. `saveState` cambia a `'saved'`
5. Si falla, se revierte al estado anterior y `saveState` = `'error'`

La funcion `saveBoardSnapshot()` normaliza el board completo y escribe:
- Board metadata → `boards` table
- Lists → `lists` table (con dedup)
- Cards → `cards` table (con dedup)
- Labels, checklists, checklist items → tablas respectivas
- Production flows y stages → tablas respectivas (con dedup de keys compuestas)

---

## Integracion con IA (Gemini)

### Modelos utilizados

| Modelo | Alias | Uso |
|--------|-------|-----|
| `gemini-2.5-flash` | Primary | Chatbot, titulos, briefs, SEO, scripts |
| `gemini-2.0-flash-lite` | Lite | Fallback rapido |
| `gemini-2.5-pro` | Pro | Tareas complejas (con fallback a flash) |

### Modos de invocacion

**1. Via Edge Function (produccion)**:
```
Cliente → supabase.functions.invoke('ai-assist') → Edge Fn → Gemini REST API
```
La edge function `ai-assist` actua como proxy seguro: valida el JWT del usuario, normaliza el request body y llama a `generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`.

**2. Directo (desarrollo)**:
Cuando `VITE_GEMINI_API_KEY` esta configurada y `VITE_ENABLE_DIRECT_GEMINI=true`, el cliente llama directamente a la API de Gemini usando el SDK `@google/genai`.

### Retry y fallback

```
gemini-2.5-pro → gemini-2.5-flash → gemini-2.0-flash → gemini-2.0-flash-lite
```

- 3 reintentos con backoff exponencial (1.5s, 6s, 13.5s)
- Si un modelo falla por rate limit/unavailable, intenta el siguiente
- Errores transitorios (429, 500, 503) se reintentan
- Errores permanentes (401, 403) se lanzan inmediatamente

### Funcionalidades de IA

| Funcion | Archivo | Proposito |
|---------|---------|-----------|
| `generateVideoSeedDraft()` | `videoFlowAi.ts` | Genera titulo + 10 alternativas, hook, research, guion |
| `generateBriefSuggestions()` | `videoFlowAi.ts` | Sugiere brief operativo (audiencia, tono, promesa) |
| `generateVideoSeoDraft()` | `videoSeoAi.ts` | Keywords, descripcion, hashtags |
| Title improvement | `useCardAi.ts` | Mejora de titulo individual |
| Script analysis | `useCardAi.ts` | Analisis de guion (retencion, hook, storytelling) |
| Thumbnail prompts | `useCardAi.ts` | Genera variantes de prompt para thumbnail |
| Audio transcription | `AudioRecorder.tsx` | Transcripcion de audio grabado |
| Chatbot | `Chatbot.tsx` | Conversacion + function calling sobre el tablero |

---

## Autenticacion y Seguridad

### Autenticacion

- **Proveedor**: Google OAuth via Supabase Auth
- **Flujo**: PKCE (Proof Key for Code Exchange)
- **Redirect**: `window.location.origin + /auth/callback`
- **Flujo completo**:
  1. `signInWithGoogle()` → `supabase.auth.signInWithOAuth({ provider: 'google' })`
  2. Redirect a Google → usuario autoriza → redirect de vuelta con code
  3. Supabase intercambia code por JWT
  4. `onAuthStateChange` detecta el login
  5. `ensureProfile()` crea/actualiza el perfil en `profiles`
  6. `acceptPendingInvitations()` acepta invitaciones pendientes para ese email
  7. Se cargan los boards del usuario

### Row Level Security (RLS)

Todas las tablas tienen RLS habilitado. Las policies usan las funciones helper:

- `is_board_member(board_id)` — verifica membresia (security definer)
- `can_edit_board(board_id)` — verifica que sea owner o editor
- `board_role(board_id)` — retorna el rol (security definer)

**Patron comun de policies:**
- `SELECT`: requiere `is_board_member(board_id)`
- `INSERT/UPDATE/DELETE`: requiere `can_edit_board(board_id)`
- `profiles`: solo el propio usuario puede leer/escribir su perfil

### Invitaciones

El sistema soporta invitar usuarios que aun no tienen cuenta:
1. Owner invita por email → se busca perfil via `lookup_profile_by_email()` (security definer)
2. Si existe: se agrega directamente a `board_members`
3. Si no existe: se crea registro en `invitations` con status `'pending'`
4. Cuando el invitado se registra, `acceptPendingInvitations()` encuentra y acepta sus invitaciones

---

## Edge Functions (Backend)

Las edge functions corren en Deno (Supabase Edge Runtime). Se despliegan con `npx supabase functions deploy`.

### `ai-assist`

Proxy seguro para la API de Gemini. Desplegado con `--no-verify-jwt` para permitir OPTIONS preflight.

- Valida bearer token manualmente via `requireUser()`
- Normaliza contents, systemInstruction y config del request
- Llama a `generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
- Mapea legacy model aliases a modelos actuales
- Retorna texto, functionCalls y candidates

### `youtube-channel-data`

Obtiene KPIs y videos recientes de un canal YouTube usando la YouTube Data API v3.

### `accept-invitation`

Acepta una invitacion pendiente: crea el `board_member` y marca la invitacion como `'accepted'`.

### `remove-board-member`

Remueve un miembro de un board. Solo el owner puede ejecutar esta accion.

### Utilidades compartidas (`_shared/`)

- **`cors.ts`**: Headers CORS (`Access-Control-Allow-Origin: *`) y helper `jsonResponse()`
- **`auth.ts`**: `requireUser()` (valida bearer token) y `createAdminClient()` (service role)

---

## Sistema de Presencia

### Arquitectura

```
Presence Controller (src/lib/presence.ts)
  → createPresenceController(user, context)
  → Heartbeat cada 30 segundos
  → Eventos: came_online, entered_board, left_board, went_offline

Base de datos:
  → presence_sessions (sesion activa por tab)
  → presence_events (log de eventos)

Vista:
  → board_online_members (DISTINCT ON user_id, filtro heartbeat < 75s)
```

### Ciclo de vida

1. **Inicio**: Al autenticarse, se crea un `PresenceController` con `sessionId` unico
2. **Cleanup**: Se eliminan sesiones stale del mismo usuario (`cleanupStaleSessions`)
3. **Heartbeat**: Cada 30s, se hace `upsertPresenceSession` con timestamp actual
4. **Cambio de vista**: `updateContext()` actualiza `activeSurface` y `boardId`
5. **Cierre**: `stop()` envia eventos `left_board` + `went_offline` y elimina la sesion
6. **Tab visibility**: Al volver a la tab, se sincroniza inmediatamente

### Deduplicacion

La vista `board_online_members` usa `DISTINCT ON (board_id, user_id)` para mostrar solo la sesion mas reciente por usuario, evitando que recargas de pagina o tabs multiples inflen el conteo.

---

## Flujo de Trabajo YouTube (Formula 10X)

### Production Stages (12 fases)

| Stage ID | Fase | Owner |
|----------|------|-------|
| `idea` | Idea y concepto | Creador |
| `research` | Investigacion | Creador |
| `title_hook` | Titulo y hook | Creador |
| `script` | Guion | Creador |
| `preproduction` | Pre-produccion | Creador |
| `recording` | Grabacion | Creador |
| `editing_v1` | Edicion v1 | Editor |
| `review_feedback` | Review y feedback | Creador |
| `thumbnail_seo` | Thumbnail y SEO | Creador |
| `upload_schedule` | Upload y programacion | Creador |
| `publish_followup` | Publicacion y seguimiento | Creador |
| `recycle_shorts` | Reciclar a Shorts | Editor |

### Status por stage

- `pending` — No iniciado
- `in_progress` — En progreso
- `blocked` — Bloqueado (requiere accion)
- `done` — Completado

### Schedule Status

- `idea` — Solo idea, sin timeline
- `active` — En progreso normal
- `extra_active` — Video extra (no planificado)
- `at_risk` — Atrasado, puede recuperarse
- `overdue` — Fuera de plazo
- `blocked` — Bloqueado por dependencia
- `completed` — Publicado

### Plantillas de Checklists

**Formula 10X (Video Largo):**
1. Nicho / Angulo unico definido
2. Investigacion SEO + 50 Titulos listos
3. Gancho perfecto de 8s
4. Storytelling estructural ("Queria X, PERO paso Y...")
5. Grabacion completada
6. Edicion: Cambio visual cada 10s
7. Miniatura disenada (Rostro, Texto, Contexto)
8. SEO, Etiquetas y Links de afiliados
9. Comentario fijado para Interlinking
10. Video Programado y Publicado
11. Monitorizacion CTR 2H

**Sistema de Shorts:**
1. Visualmente atractivo (1-3s Gancho)
2. Formato repetible disenado
3. Loopabilidad infinita asegurada
4. Llamado a la accion rapido
5. Publicado (Top of Funnel)

---

## Configuracion y Despliegue

### Desarrollo local

```bash
npm install
cp .env.example .env
# Configurar VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, etc.
npm run dev
# → http://localhost:3000
```

### Scripts disponibles

| Script | Comando | Descripcion |
|--------|---------|-------------|
| `dev` | `vite --port=3000 --host=0.0.0.0` | Servidor de desarrollo con HMR |
| `build` | `vite build` | Compilar para produccion (output en `dist/`) |
| `preview` | `vite preview` | Previsualizar build de produccion |
| `clean` | `rm -rf dist` | Limpiar directorio de build |
| `lint` | `tsc --noEmit` | Verificacion de tipos TypeScript |

### Despliegue a produccion

**Frontend** (Cloudflare Workers via GitHub):
```bash
# Push a main → Cloudflare auto-rebuild
git push origin main
```
Las variables `VITE_*` se configuran en Cloudflare Dashboard > Build settings > Environment variables.

**Edge Functions** (Supabase):
```bash
SUPABASE_ACCESS_TOKEN=<token> npx supabase functions deploy ai-assist \
  --project-ref alcgeficxobsegeycrtu --no-verify-jwt
```

**Secretos** (Supabase):
```bash
SUPABASE_ACCESS_TOKEN=<token> npx supabase secrets set \
  GEMINI_API_KEY=<key> \
  --project-ref alcgeficxobsegeycrtu
```

**Migraciones SQL remotas** (via Management API):
```bash
curl -X POST "https://api.supabase.com/v1/projects/alcgeficxobsegeycrtu/database/query" \
  -H "Authorization: Bearer <access-token>" \
  -H "Content-Type: application/json" \
  -d '{"query": "..."}'
```

---

## Variables de Entorno

### Frontend (build-time, prefijo `VITE_`)

| Variable | Requerida | Descripcion |
|----------|-----------|-------------|
| `VITE_SUPABASE_URL` | Si | URL del proyecto Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Si | Anon/publishable key de Supabase |
| `VITE_SUPABASE_GOOGLE_ENABLED` | No | Habilitar Google OAuth (`true`/`false`, default: `true`) |
| `VITE_SUPABASE_AUTH_REDIRECT_PATH` | No | Path de callback OAuth (default: `/auth/callback`) |
| `VITE_SUPABASE_AUTH_REDIRECT_URL` | No | URL completa de callback (override) |
| `VITE_GEMINI_API_KEY` | No | API key de Gemini para fallback directo (solo dev) |
| `VITE_ENABLE_DIRECT_GEMINI` | No | Habilitar Gemini directo en produccion (`true`/`false`) |

### Edge Functions (secretos en Supabase)

| Variable | Descripcion |
|----------|-------------|
| `GEMINI_API_KEY` | API key de Google Gemini para `ai-assist` |
| `SUPABASE_URL` | Auto-configurada por Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-configurada por Supabase |
| `SUPABASE_ANON_KEY` | Auto-configurada por Supabase |

### Configuracion de Cloudflare

Las variables `VITE_*` deben configurarse en **Cloudflare Dashboard > Workers & Pages > Settings > Build settings > Environment variables** para que se inyecten durante el build.

---

## Sistema de Diseno

### Design Tokens (`index.css`)

```css
:root {
  --ff-primary: #2563eb;
  --ff-primary-dark: #1d4ed8;
  --ff-accent: #6366f1;
  --ff-surface: rgba(255,255,255,0.65);
  --ff-surface-solid: #ffffff;
  --ff-bg: #f1f5f9;
  --ff-bg-subtle: #f8fafc;
  --ff-border: rgba(0,0,0,0.06);
  --ff-shadow-sm/md/lg/xl
  --ff-radius: 0.75rem;
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
| `.ff-float` | Flotacion vertical sutil | Elementos decorativos |

### Estilos globales

- **Tipografia**: Inter (Google Fonts) con font-smoothing antialiased
- **Scrollbar personalizado**: 6px delgado con thumb semi-transparente
- **Glass effect** (`.ff-glass`): backdrop-blur + borde semi-transparente
- **Card shadow** (`.ff-card-shadow`): sombra que se intensifica en hover
- **Temas**: dark, light, soft (gestionados via `useTheme.tsx`)
