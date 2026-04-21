export type LabelColor = 'red' | 'yellow' | 'blue' | 'green' | 'purple' | 'orange';

export interface Label {
  id: string;
  name: string;
  color: LabelColor;
}

export interface ChecklistItem {
  id: string;
  text: string;
  isCompleted: boolean;
}

export interface Checklist {
  id: string;
  title: string;
  items: ChecklistItem[];
}

export interface ProductionBrief {
  idea: string;
  audience: string;
  question: string;
  promise: string;
  tone: string;
  creatorNotes: string;
  researchSummary: string;
  openQuestions: string[];
}

export type ProductionStageId =
  | 'idea'
  | 'research'
  | 'title_hook'
  | 'script'
  | 'preproduction'
  | 'recording'
  | 'editing_v1'
  | 'review_feedback'
  | 'thumbnail_seo'
  | 'upload_schedule'
  | 'publish_followup'
  | 'recycle_shorts';

export type ProductionStageStatus = 'pending' | 'in_progress' | 'blocked' | 'done';
export type ProductionWorkMode = 'planned' | 'extra' | 'idea_only';
export type ProductionScheduleStatus = 'idea' | 'active' | 'extra_active' | 'at_risk' | 'overdue' | 'blocked' | 'completed';

export interface ProductionStage {
  id: ProductionStageId;
  label: string;
  macroColumnId: string;
  ownerRole: AuditRole;
  fallbackOwnerRole: AuditRole;
  deliverable: string;
  status: ProductionStageStatus;
  dueAt: string;
  completedAt?: string;
  notes?: string;
  checklistTitle: string;
  hasAIDraft?: boolean;
}

export interface ProductionFlow {
  templateId: 'optimized_publish_v1';
  publishAt: string;
  createdFromWizardAt: string;
  currentStageId: ProductionStageId;
  scheduleMode: 'standard';
  isTightSchedule: boolean;
  kickoffAt?: string;
  workingDaysBudget: number;
  workMode: ProductionWorkMode;
  scheduleStatus: ProductionScheduleStatus;
  stages: ProductionStage[];
}

export interface BoardSeoConfig {
  descriptionTemplate: string;
  productUrl: string;
  instagramUrl: string;
  tiktokUrl: string;
  collabEmail: string;
}

export type ThumbnailPlanStatus = 'pending' | 'draft' | 'ready' | 'approved';

export interface ThumbnailPlan {
  status: ThumbnailPlanStatus;
  concept: string;
  overlayText: string;
  assetUrl: string;
  generationPrompt: string;
  useRealPerson: boolean;
}

export type BoardDensity = 'comfortable' | 'compact' | 'focus';
export type CardMetaMode = 'full' | 'essential';
export type DesktopRailPanel = 'share' | 'guide' | 'settings' | 'chatbot' | null;

export interface DesktopBoardLayoutPrefs {
  density: BoardDensity;
  cardMetaMode: CardMetaMode;
  showBoardSummary: boolean;
  openRailPanel: DesktopRailPanel;
}

export type PresenceState = 'online' | 'offline';
export type PresenceSurface = 'channel_home' | 'board' | 'dashboard' | 'guide';
export type BoardPresenceEventType = 'entered_board' | 'left_board' | 'came_online' | 'went_offline';

export interface BoardPresenceMember {
  emailLowercase: string;
  displayName: string;
  photoURL: string;
  state: PresenceState;
  isOnline: boolean;
  isActiveInThisBoard: boolean;
  activeSurface: PresenceSurface | null;
  lastHeartbeatAt?: string;
  lastSeenAt?: string;
  enteredAt?: string;
  sessionCount: number;
  updatedAt?: string;
}

export interface BoardPresenceEvent {
  id: string;
  boardId: string;
  emailLowercase: string;
  displayName: string;
  photoURL: string;
  type: BoardPresenceEventType;
  surface: PresenceSurface | null;
  at: string;
}

export interface CardData {
  id: string;
  title: string;
  description: string;
  listId: string;
  labels: Label[];
  checklists: Checklist[];
  dueDate: string | null;
  assignee: string | null; // 'Tú' or 'Editor'
  
  // Campos personalizados para el flujo de Creadores de YouTube (Declassified Playbook)
  titulosLinden: string;
  gancho8s: string;
  narrativa: string;
  miniaturaChecklist: {
    rostro: boolean;
    texto: boolean;
    contexto: boolean;
  };
  thumbnailPlan?: ThumbnailPlan;
  ctr2Hours: string;
  interlinking: string;
  linkDrive: string;

  // Enlaces de Drive por sección (para que editores/creadores accedan directo)
  driveLinks?: {
    research?: string;    // Carpeta de investigación / brief
    script?: string;      // Documento de guión
    footage?: string;     // Carpeta de footage / grabaciones
    editing?: string;     // Proyecto de edición (Premiere, DaVinci, etc.)
    thumbnail?: string;   // Assets de miniatura
    publish?: string;     // Exports finales / archivos para subir
  };

  // Guion del video (separado de description que es la descripcion de YouTube)
  guion?: string;

  // Tipo de contenido (PDF p12 - Shorts vs Largos)
  contentType?: 'long' | 'short';

  // SEO Cola Larga (PDF p6)
  keywords?: string;

  // Storytelling estructurado (PDF p8 - Regla South Park)
  storytelling?: {
    queria: string;
    pero: string;
    porLoTanto: string;
  };

  // Protocolo Post-Publicación (PDF p13)
  postPublication?: {
    publishedAt?: string;
    commentsResponded?: boolean;
    ctrCheckTime?: string;
    actionTaken?: 'none' | 'thumbnail' | 'title' | 'both';
    actionLog?: string;
  };

  // Monetización / Negocio (PDF p10, p11, p14)
  monetization?: {
    hasAffiliate?: boolean;
    affiliateLinks?: string;
    hasSponsor?: boolean;
    sponsorName?: string;
    estimatedRPM?: number;
    revenue?: number;
    sellsProduct?: boolean;
    productDescription?: string;
    deals?: Array<{
      id: string;
      type: 'sponsor' | 'affiliate' | 'collaboration' | 'product';
      brand: string;
      amount: number;
      currency?: string;
      status: 'negotiating' | 'confirmed' | 'delivered' | 'paid';
      notes?: string;
    }>;
  };

  // Interlinking expandido (PDF p9 - Telaraña)
  interlinkingTargets?: string[];

  // Shorts-específico (PDF p12)
  shortsHook?: string;
  shortsLoop?: boolean;
  shortsFunnel?: string;

  // Historial de columnas (para analytics)
  columnHistory?: Array<{ listId: string; enteredAt: string }>;
  createdAt?: string;
  updatedAt?: string;
  productionBrief?: ProductionBrief;
  productionFlow?: ProductionFlow;
  seoSourceText?: string;
}

export interface List {
  id: string;
  title: string;
  cardIds: string[];
}

export interface User {
  uid: string;
  email: string;
  emailLowercase: string;
  displayName: string;
  photoURL: string;
}

export type AccessRole = 'owner' | 'editor' | 'viewer';
export type AuditRole = 'creador' | 'editor' | 'asistente';

export type MemberRole = AccessRole;

export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'revoked';

export interface Invitation {
  id: string;
  boardId: string;
  boardTitleSnapshot: string;
  inviteeEmailLowercase: string;
  inviterEmail: string;
  role: Exclude<MemberRole, 'owner'>;
  status: InvitationStatus;
  createdAt: string;
  updatedAt: string;
  respondedAt?: string;
}

export interface Board {
  id: string;
  title: string;
  ownerId: string;
  members: string[];
  memberRoles?: Record<string, MemberRole>;
  lists: List[];
  cards: Record<string, CardData>;
  createdAt?: string;
  updatedAt?: string;
  videoCount?: number;
  nicheName?: string;
  defaultContentType?: 'long' | 'short' | '';
  youtubeChannelUrl?: string;
  youtubeApiKey?: string;
  descriptionPresets?: Record<string, string>;
  workflowConfig?: WorkflowConfig;
  seoConfig?: BoardSeoConfig;
}

export interface WorkflowConfig {
  cadence: number;           // videos largos por semana: 1, 2, 3
  shortsPerWeek: number;     // shorts por semana: 0, 2, 3, 5
  roles: AuditRole[];
  editorLevel: 'full' | 'basic';
  assistantLevel?: 'beginner' | 'intermediate' | 'advanced';
  activeVideoIds?: string[]; // card IDs assigned to this week's pipelines
}

export interface CreateVideoFromFlowInput {
  idea: string;
  title: string;
  publishAt: string;
  audience?: string;
  question?: string;
  promise?: string;
  tone?: string;
  creatorNotes?: string;
  researchSummary?: string;
  openQuestions?: string[];
  titleAlternatives?: string;
  hook?: string;
  scriptBase?: string;
  usedAI?: boolean;
  regeneratedSections?: Array<'title' | 'hook' | 'research' | 'script'>;
  contentType?: 'long' | 'short';
}

export type AuditEventType =
  | 'card_created'
  | 'card_moved'
  | 'assignee_changed'
  | 'checklist_progress_changed'
  | 'ctr_updated'
  | 'monetization_updated'
  | 'card_published'
  | 'video_flow_created'
  | 'video_ai_seeded'
  | 'stage_started'
  | 'stage_completed'
  | 'stage_reopened'
  | 'stage_due_changed'
  | 'stage_ai_regenerated'
  | 'flow_column_mismatch_detected';

export interface AuditEvent {
  id: string;
  boardId: string;
  cardId?: string;
  actorEmail: string;
  type: AuditEventType;
  at: string;
  fromListId?: string;
  toListId?: string;
  payload?: Record<string, unknown>;
}
