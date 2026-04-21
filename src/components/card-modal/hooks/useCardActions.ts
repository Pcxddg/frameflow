import { useCallback } from 'react';
import { useBoard, CHECKLIST_TEMPLATES } from '../../../store';
import type { CardData, ProductionBrief, ProductionStageId, ProductionStageStatus } from '../../../types';
import { EMPTY_PRODUCTION_BRIEF } from './useCardDerived';
import { getSuggestedFlowColumn } from '../../../lib/optimizedVideoFlow';
import type { CardActions } from '../types';

export function useCardActions(card: CardData, readOnly: boolean): CardActions {
  const { board, updateCard, deleteCard, moveCard, addChecklist, toggleChecklistItem, toggleLabel, setProductionStageStatus, updateProductionStage } = useBoard();

  const updateCardSafe = useCallback((updates: Partial<CardData>) => {
    if (readOnly) return;
    updateCard(card.id, updates);
  }, [card.id, readOnly, updateCard]);

  const updateBrief = useCallback((updates: Partial<ProductionBrief>) => {
    if (readOnly) return;
    const current = card.productionBrief || EMPTY_PRODUCTION_BRIEF;
    updateCard(card.id, {
      productionBrief: { ...EMPTY_PRODUCTION_BRIEF, ...current, ...updates },
    });
  }, [card.id, card.productionBrief, readOnly, updateCard]);

  const deleteCardSafe = useCallback(() => {
    if (readOnly) return;
    deleteCard(card.id, card.listId);
  }, [card.id, card.listId, deleteCard, readOnly]);

  const moveToSuggested = useCallback(() => {
    if (readOnly || !board) return;
    const suggested = getSuggestedFlowColumn(card, board);
    if (!suggested) return;
    const destList = board.lists.find(l => l.id === suggested.listId);
    if (!destList) return;
    moveCard(card.listId, destList.id, 0, destList.cardIds.length, card.id);
  }, [board, card, moveCard, readOnly]);

  const toggleLabelSafe = useCallback((label: { color: string; text: string }) => {
    if (readOnly) return;
    toggleLabel(card.id, label as any);
  }, [card.id, readOnly, toggleLabel]);

  const toggleChecklistItemSafe = useCallback((checklistId: string, itemId: string) => {
    if (readOnly) return;
    toggleChecklistItem(card.id, checklistId, itemId);
  }, [card.id, readOnly, toggleChecklistItem]);

  const addChecklistSafe = useCallback((templateName: string) => {
    if (readOnly) return;
    addChecklist(card.id, templateName as keyof typeof CHECKLIST_TEMPLATES);
  }, [addChecklist, card.id, readOnly]);

  const setStageStatus = useCallback((stageId: ProductionStageId, status: ProductionStageStatus) => {
    if (readOnly) return;
    setProductionStageStatus(card.id, stageId, status);
  }, [card.id, readOnly, setProductionStageStatus]);

  const setStageDueAt = useCallback((stageId: ProductionStageId, value: string) => {
    if (readOnly || !value) return;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return;
    updateProductionStage(card.id, stageId, { dueAt: parsed.toISOString() });
  }, [card.id, readOnly, updateProductionStage]);

  const setStageNotes = useCallback((stageId: ProductionStageId, value: string) => {
    if (readOnly) return;
    updateProductionStage(card.id, stageId, { notes: value });
  }, [card.id, readOnly, updateProductionStage]);

  return {
    updateCard: updateCardSafe,
    updateBrief,
    deleteCard: deleteCardSafe,
    moveToSuggested,
    toggleLabel: toggleLabelSafe,
    toggleChecklistItem: toggleChecklistItemSafe,
    addChecklist: addChecklistSafe,
    setStageStatus,
    setStageDueAt,
    setStageNotes,
  };
}
