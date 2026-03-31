export type LegacyCardModalSectionId =
  | 'summary'
  | 'assignee'
  | 'seo'
  | 'production'
  | 'monetization'
  | 'post'
  | 'checklists';

export type CardModalSectionId = LegacyCardModalSectionId;
export type GuidedCardSectionId = 'today' | 'brief' | 'package' | 'production' | 'publish';
export type GuidedCardFocusId = 'next_action' | 'checklist' | 'notes' | 'script' | 'thumbnail' | 'description' | 'final_review';
export type GuideCardOpenMode = 'summary' | 'task';

export interface CardModalLocation {
  section: GuidedCardSectionId;
  focus?: GuidedCardFocusId;
}

export interface OpenCardModalDetail {
  cardId: string;
  section?: LegacyCardModalSectionId;
  location?: CardModalLocation;
}

export const OPEN_CARD_MODAL_EVENT = 'ff-open-card-modal';

export function dispatchOpenCardModal(detail: OpenCardModalDetail) {
  window.dispatchEvent(new CustomEvent<OpenCardModalDetail>(OPEN_CARD_MODAL_EVENT, { detail }));
}

export function resolveLegacyCardModalLocation(section: LegacyCardModalSectionId = 'summary'): CardModalLocation {
  if (section === 'assignee') return { section: 'production', focus: 'notes' };
  if (section === 'seo') return { section: 'publish', focus: 'description' };
  if (section === 'checklists') return { section: 'production', focus: 'checklist' };
  if (section === 'production') return { section: 'production', focus: 'checklist' };
  if (section === 'post') return { section: 'publish', focus: 'final_review' };
  if (section === 'monetization') return { section: 'publish', focus: 'final_review' };
  return { section: 'today', focus: 'next_action' };
}

export function resolveLegacySectionFromLocation(location?: CardModalLocation): LegacyCardModalSectionId {
  if (!location) return 'summary';
  if (location.section === 'production') {
    return location.focus === 'checklist' ? 'checklists' : location.focus === 'notes' ? 'assignee' : 'production';
  }
  if (location.section === 'publish') return location.focus === 'description' ? 'seo' : 'post';
  return 'summary';
}

export function resolveGuideStageToCardLocation(stageId?: string | null, mode: GuideCardOpenMode = 'task'): CardModalLocation {
  if (stageId === 'upload_schedule' || stageId === 'publish_followup' || stageId === 'recycle_shorts') {
    return { section: 'publish', focus: stageId === 'upload_schedule' ? 'description' : 'final_review' };
  }
  if (stageId === 'idea' || stageId === 'research') return { section: 'brief' };
  if (stageId === 'title_hook') return { section: 'package', focus: 'next_action' };
  if (stageId === 'thumbnail_seo') return { section: 'package', focus: 'thumbnail' };
  if (stageId === 'script') return { section: 'production', focus: 'script' };
  return { section: mode === 'summary' ? 'today' : 'production', focus: mode === 'summary' ? 'next_action' : 'checklist' };
}
