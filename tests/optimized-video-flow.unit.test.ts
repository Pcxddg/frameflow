import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeProductionFlow, updateProductionStageDetails } from '../src/lib/optimizedVideoFlow';
import type { ProductionFlow } from '../src/types';

function buildFlow(overrides?: Partial<ProductionFlow>): ProductionFlow {
  return {
    templateId: 'optimized_publish_v1',
    publishAt: '2026-04-10T12:00:00.000Z',
    createdFromWizardAt: '2026-04-01T09:00:00.000Z',
    currentStageId: 'idea',
    scheduleMode: 'standard',
    isTightSchedule: false,
    workingDaysBudget: 5,
    workMode: 'idea_only',
    scheduleStatus: 'idea',
    stages: [
      {
        id: 'idea',
        label: 'Idea',
        macroColumnId: 'ideas',
        ownerRole: 'creador',
        fallbackOwnerRole: 'editor',
        deliverable: 'Idea validada',
        status: 'done',
        dueAt: '2026-04-02T09:00:00.000Z',
        completedAt: '2026-04-01T10:00:00.000Z',
        checklistTitle: 'Idea',
      },
      {
        id: 'research',
        label: 'Research',
        macroColumnId: 'ideas',
        ownerRole: 'editor',
        fallbackOwnerRole: 'creador',
        deliverable: 'Research listo',
        status: 'pending',
        dueAt: '2026-04-04T09:00:00.000Z',
        checklistTitle: 'Research',
      },
    ],
    ...overrides,
  };
}

test('normalizeProductionFlow repairs invalid stage dueAt values using publishAt fallback', () => {
  const normalized = normalizeProductionFlow(buildFlow({
    stages: [
      {
        id: 'idea',
        label: 'Idea',
        macroColumnId: 'ideas',
        ownerRole: 'creador',
        fallbackOwnerRole: 'editor',
        deliverable: 'Idea validada',
        status: 'done',
        dueAt: '2026-04-02T09:00:00.000Z',
        checklistTitle: 'Idea',
      },
      {
        id: 'research',
        label: 'Research',
        macroColumnId: 'ideas',
        ownerRole: 'editor',
        fallbackOwnerRole: 'creador',
        deliverable: 'Research listo',
        status: 'pending',
        dueAt: '',
        checklistTitle: 'Research',
      },
    ],
  }));

  assert.ok(normalized);
  assert.equal(normalized?.publishAt, '2026-04-10T12:00:00.000Z');
  assert.equal(normalized?.stages[1].dueAt, '2026-04-10T12:00:00.000Z');
  assert.equal(normalized?.stages[1].status, 'in_progress');
});

test('updateProductionStageDetails ignores empty dueAt updates and preserves the previous valid date', () => {
  const updated = updateProductionStageDetails(buildFlow(), 'research', {
    dueAt: '',
    notes: '  revisar fuentes  ',
  });

  const stage = updated.stages.find((item) => item.id === 'research');
  assert.ok(stage);
  assert.equal(stage?.dueAt, '2026-04-04T09:00:00.000Z');
  assert.equal(stage?.notes, 'revisar fuentes');
});
