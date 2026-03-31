import type { CSSProperties, ReactNode, RefObject } from 'react';
import type {
  BoardSeoConfig,
  Card as CardType,
  ProductionBrief,
  ProductionStage,
  ProductionStageId,
  ProductionStageStatus,
} from '../../types';
import type { ProductionFlowSummary, VideoExecutionSnapshot } from '../../lib/optimizedVideoFlow';
import type { BriefSuggestionDraft, VideoSeedGenerationInput } from '../../lib/videoFlowAi';
import type { VideoSeoGenerationInput } from '../../lib/videoSeoAi';
import type {
  GenerationResult,
  TitleBatch,
  ScriptDraft,
  SeoDraft,
  ThumbnailPromptVariant,
} from '../../lib/aiContracts';

export type PanelId = 'idea' | 'title' | 'script' | 'thumbnail' | 'editing' | 'publish' | 'postpub';

export type FlowTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral' | 'brand';

export interface PhaseConfig {
  name: string;
  color: string;
  action: string;
  panel: PanelId;
}

export interface PanelShellProps {
  id: PanelId;
  panelRef: RefObject<HTMLDivElement | null>;
  kicker: string;
  title: string;
  description: string;
  preview: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  action?: ReactNode;
  children: ReactNode;
}

export interface CardActions {
  updateCard: (updates: Partial<CardType>) => void;
  updateBrief: (updates: Partial<ProductionBrief>) => void;
  deleteCard: () => void;
  moveToSuggested: () => void;
  toggleLabel: (label: { color: string; text: string }) => void;
  toggleChecklistItem: (checklistId: string, itemId: string) => void;
  addChecklist: (templateName: string) => void;
  setStageStatus: (stageId: ProductionStageId, status: ProductionStageStatus) => void;
  setStageDueAt: (stageId: ProductionStageId, value: string) => void;
  setStageNotes: (stageId: ProductionStageId, value: string) => void;
}

export interface CardDerived {
  phase: PhaseConfig;
  listIndex: number;
  flowSummary: ProductionFlowSummary | null;
  execution: VideoExecutionSnapshot;
  currentStage: ProductionStage | null;
  nextStage: ProductionStage | null;
  stages: ProductionStage[];
  suggestedColumnTitle: string | null;
  completedChecklists: number;
  totalChecklists: number;
  completionPercent: number;
  flowScheduleLabel: string | null;
  flowWorkingDaysLabel: string | null;
  seededTitles: string[];
  readOnly: boolean;
}

export type TeleprompterLineHeightMode = 'tight' | 'balanced' | 'airy';

export interface TeleprompterPrefs {
  speed: number;
  fontScale: number;
  textWidth: number;
  lineHeightMode: TeleprompterLineHeightMode;
}

export type CardAiSeedOverrides = Partial<VideoSeedGenerationInput>;
export type CardAiSeoOverrides = Partial<VideoSeoGenerationInput> & {
  productionBrief?: Partial<ProductionBrief> | null;
  channelSeoConfig?: Partial<BoardSeoConfig> | null;
};

export interface ThumbnailPromptAiInput {
  basePrompt: string;
  title: string;
  concept?: string;
  overlayText?: string;
  hook?: string;
  useRealPerson?: boolean;
}

export interface CardAiState {
  isGeneratingTitles: boolean;
  isGeneratingScript: boolean;
  isGeneratingDesc: boolean;
  isImprovingTitle: boolean;
  isSuggestingKeywords: boolean;
  isAnalyzingScript: boolean;
  isGeneratingThumbnailPrompt: boolean;
  aiNotice: string | null;
  suggestedTitle: string | null;
  scriptAnalysis: string | null;
  lastBriefSuggestion: GenerationResult<BriefSuggestionDraft> | null;
  lastTitleGeneration: GenerationResult<TitleBatch> | null;
  lastScriptGeneration: GenerationResult<ScriptDraft> | null;
  lastSeoGeneration: GenerationResult<SeoDraft> | null;
  lastThumbnailGeneration: GenerationResult<ThumbnailPromptVariant[]> | null;
  suggestBrief: (input: VideoSeedGenerationInput) => Promise<GenerationResult<BriefSuggestionDraft> | null>;
  generateTitles: (overrides?: CardAiSeedOverrides) => Promise<GenerationResult<TitleBatch> | null>;
  generateScript: (overrides?: CardAiSeedOverrides) => Promise<GenerationResult<ScriptDraft> | null>;
  generateDescription: (overrides?: CardAiSeoOverrides) => Promise<GenerationResult<SeoDraft> | null>;
  suggestKeywords: (overrides?: CardAiSeoOverrides) => Promise<GenerationResult<SeoDraft> | null>;
  generateThumbnailPrompts: (input: ThumbnailPromptAiInput) => Promise<GenerationResult<ThumbnailPromptVariant[]> | null>;
  improveTitle: () => Promise<void>;
  analyzeScript: (text: string) => Promise<void>;
  clearAiNotice: () => void;
  clearScriptAnalysis: () => void;
  acceptSuggestedTitle: () => void;
  dismissSuggestedTitle: () => void;
}
