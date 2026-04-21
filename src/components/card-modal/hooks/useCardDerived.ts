import { useMemo } from 'react';
import { useBoard } from '../../../store';
import type { CardData, ProductionBrief } from '../../../types';
import {
  buildVideoExecutionSnapshot,
  getProductionFlowCurrentStage,
  getProductionFlowSummary,
  getScheduleStatusLabel,
  getSuggestedFlowColumn,
  type VideoExecutionSnapshot,
} from '../../../lib/optimizedVideoFlow';
import { getAuditRoleLabel } from '../../../lib/optimizedVideoFlow';
import { PHASES } from '../constants';
import type { CardDerived, PhaseConfig } from '../types';

const EMPTY_PRODUCTION_BRIEF: ProductionBrief = {
  idea: '',
  audience: '',
  question: '',
  promise: '',
  tone: '',
  creatorNotes: '',
  researchSummary: '',
  openQuestions: [],
};

function buildFallbackExecution(card: CardData): VideoExecutionSnapshot {
  const stage = getProductionFlowCurrentStage(card.productionFlow) || null;
  return {
    currentStage: stage,
    nextStage: null,
    checklistProgress: { checklist: null, completedCount: 0, totalCount: 0, pendingItems: [], percentage: 0 },
    pendingChecklistPreview: [],
    currentColumnTitle: 'Sin columna',
    expectedColumnTitle: null,
    currentStageLabel: stage?.label || 'Sin etapa activa',
    currentStageStatusLabel: stage ? 'Pendiente de iniciar' : 'Sin etapa activa',
    nextActionLabel: stage ? 'Abrir produccion' : 'Definir siguiente paso',
    nextActionDetail: stage?.deliverable || 'Todavia no hay un siguiente paso operativo derivado.',
    responsibleLabel: stage ? getAuditRoleLabel(stage.ownerRole) : card.assignee || 'Sin asignar',
    sourceUsed: card.seoSourceText?.trim() ? 'seoSourceText' : card.guion?.trim() ? 'guion' : 'brief',
    hasSeededPackage: !!(card.gancho8s?.trim() || card.titulosLinden?.trim() || card.guion?.trim() || card.productionBrief?.idea?.trim()),
    notices: [],
    readiness: [],
  };
}

export function useCardDerived(card: CardData, readOnly: boolean): CardDerived {
  const { board } = useBoard();

  const listIndex = board?.lists.findIndex(l => l.id === card.listId) ?? 0;
  const phase: PhaseConfig = PHASES[Math.min(listIndex, PHASES.length - 1)];

  const flowSummary = useMemo(
    () => (board ? getProductionFlowSummary(card, board) : null),
    [board, card],
  );

  const execution = useMemo(
    () => (board ? buildVideoExecutionSnapshot(card, board) : buildFallbackExecution(card)),
    [board, card],
  );

  const currentFlowStage = getProductionFlowCurrentStage(card.productionFlow);
  const stages = card.productionFlow?.stages || [];
  const currentStage = execution.currentStage || currentFlowStage || stages[0] || null;
  const nextStage = execution.nextStage || flowSummary?.nextStage || null;
  const suggestedColumn = board ? getSuggestedFlowColumn(card, board) : null;

  const completedChecklists = card.checklists.reduce((acc, cl) => acc + cl.items.filter(i => i.isCompleted).length, 0);
  const totalChecklists = card.checklists.reduce((acc, cl) => acc + cl.items.length, 0);
  const completionPercent = totalChecklists > 0 ? Math.round((completedChecklists / totalChecklists) * 100) : 0;

  const flowScheduleLabel = flowSummary ? getScheduleStatusLabel(flowSummary.scheduleStatus) : null;
  const flowWorkingDaysLabel = flowSummary
    ? flowSummary.isKickoffPending
      ? 'Aun no arranca el reloj'
      : `Dia ${flowSummary.workingDaysElapsed}/${flowSummary.workingDaysBudget}`
    : null;

  const productionBrief = card.productionBrief || EMPTY_PRODUCTION_BRIEF;
  const seededTitles = useMemo(
    () => (card.titulosLinden || '').split('\n').map(l => l.trim()).filter(Boolean),
    [card.titulosLinden],
  );

  return {
    phase,
    listIndex,
    flowSummary,
    execution,
    currentStage,
    nextStage,
    stages,
    suggestedColumnTitle: suggestedColumn?.listTitle ?? null,
    completedChecklists,
    totalChecklists,
    completionPercent,
    flowScheduleLabel,
    flowWorkingDaysLabel,
    seededTitles,
    readOnly,
  };
}

export { EMPTY_PRODUCTION_BRIEF };
