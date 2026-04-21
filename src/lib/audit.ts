import { Board, CardData } from '../types';
import { normalizeProductionFlow } from './optimizedVideoFlow';

export type DataQuality = 'complete' | 'partial' | 'missing';

function findFirstHistoryEntry(card: CardData) {
  const history = [...(card.columnHistory || [])].sort(
    (a, b) => new Date(a.enteredAt).getTime() - new Date(b.enteredAt).getTime()
  );
  return history[0];
}

function findLastHistoryEntry(card: CardData) {
  const history = [...(card.columnHistory || [])].sort(
    (a, b) => new Date(b.enteredAt).getTime() - new Date(a.enteredAt).getTime()
  );
  return history[0];
}

export function inferCardCreatedAt(card: CardData, board?: Pick<Board, 'createdAt' | 'updatedAt'> | null) {
  return card.createdAt
    || findFirstHistoryEntry(card)?.enteredAt
    || board?.createdAt
    || board?.updatedAt
    || new Date().toISOString();
}

export function inferCardUpdatedAt(card: CardData, board?: Pick<Board, 'createdAt' | 'updatedAt'> | null) {
  return card.updatedAt
    || card.postPublication?.publishedAt
    || findLastHistoryEntry(card)?.enteredAt
    || inferCardCreatedAt(card, board)
    || board?.updatedAt
    || new Date().toISOString();
}

export function normalizeCardForPersistence(card: CardData, board?: Pick<Board, 'createdAt' | 'updatedAt'> | null): CardData {
  return {
    ...card,
    thumbnailPlan: card.thumbnailPlan
      ? {
          status: card.thumbnailPlan.status || 'pending',
          concept: card.thumbnailPlan.concept || '',
          overlayText: card.thumbnailPlan.overlayText || '',
          assetUrl: card.thumbnailPlan.assetUrl || '',
          generationPrompt: card.thumbnailPlan.generationPrompt || '',
          useRealPerson: !!card.thumbnailPlan.useRealPerson,
        }
      : undefined,
    productionBrief: card.productionBrief
      ? {
          idea: card.productionBrief.idea || '',
          audience: card.productionBrief.audience || '',
          question: card.productionBrief.question || '',
          promise: card.productionBrief.promise || '',
          tone: card.productionBrief.tone || '',
          creatorNotes: card.productionBrief.creatorNotes || '',
          researchSummary: card.productionBrief.researchSummary || '',
          openQuestions: card.productionBrief.openQuestions || [],
        }
      : undefined,
    productionFlow: normalizeProductionFlow(card.productionFlow),
    columnHistory: card.columnHistory && card.columnHistory.length > 0
      ? card.columnHistory
      : [{ listId: card.listId, enteredAt: inferCardCreatedAt(card, board) }],
    createdAt: inferCardCreatedAt(card, board),
    updatedAt: inferCardUpdatedAt(card, board),
  };
}

export function getCardDataQuality(card: CardData): DataQuality {
  const hasTimestamps = !!card.createdAt && !!card.updatedAt;
  const hasHistory = !!card.columnHistory && card.columnHistory.length > 0;

  if (hasTimestamps && hasHistory) return 'complete';
  if (hasTimestamps || hasHistory) return 'partial';
  return 'missing';
}

export function getBoardDataQuality(cards: CardData[]): DataQuality {
  if (cards.length === 0) return 'missing';

  const completeCards = cards.filter((card) => getCardDataQuality(card) === 'complete').length;
  if (completeCards === cards.length) return 'complete';
  if (completeCards > 0 || cards.some((card) => getCardDataQuality(card) === 'partial')) return 'partial';
  return 'missing';
}
