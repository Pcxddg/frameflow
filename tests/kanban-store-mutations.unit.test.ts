import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function sliceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end);
  assert.notEqual(startIndex, -1, `Missing section start: ${start}`);
  assert.notEqual(endIndex, -1, `Missing section end: ${end}`);
  return source.slice(startIndex, endIndex);
}

test('interactive kanban actions use atomic mutations instead of full board snapshots', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/store.tsx'), 'utf8');

  assert.doesNotMatch(source, /const persistBoardSnapshot\s*=/);

  const addCardSection = sliceBetween(source, 'const addCard =', 'const createVideoFromFlow =');
  assert.match(addCardSection, /persistBoardMutation\(/);
  assert.match(addCardSection, /createCardMutation\(nextBoard, newCard/);
  assert.doesNotMatch(addCardSection, /saveBoardSnapshot\(/);

  const createVideoSection = sliceBetween(source, 'const createVideoFromFlow =', 'const updateCard =');
  assert.match(createVideoSection, /persistBoardMutation\(/);
  assert.match(createVideoSection, /createCardMutation\(nextBoard, newCard/);
  assert.doesNotMatch(createVideoSection, /saveBoardSnapshot\(/);

  const updateCardSection = sliceBetween(source, 'const updateCard =', 'const setProductionStageStatus =');
  assert.match(updateCardSection, /updateCardContentMutation\(nextBoard, nextCard, auditEvents\)/);
  assert.doesNotMatch(updateCardSection, /saveBoardSnapshot\(/);

  const setStageStatusSection = sliceBetween(source, 'const setProductionStageStatus =', 'const updateProductionStage =');
  assert.match(setStageStatusSection, /updateCardContentMutation\(nextBoard, nextCard/);
  assert.doesNotMatch(setStageStatusSection, /saveBoardSnapshot\(/);

  const updateStageSection = sliceBetween(source, 'const updateProductionStage =', 'const deleteCard =');
  assert.match(updateStageSection, /updateCardContentMutation\(nextBoard, nextCard, auditEvents\)/);
  assert.doesNotMatch(updateStageSection, /saveBoardSnapshot\(/);

  const deleteCardSection = sliceBetween(source, 'const deleteCard =', 'const moveCard =');
  assert.match(deleteCardSection, /deleteCardMutation\(activeBoard\.id, cardId, listId\)/);
  assert.doesNotMatch(deleteCardSection, /saveBoardSnapshot\(/);

  const moveCardSection = sliceBetween(source, 'const moveCard =', 'const addChecklist =');
  assert.match(moveCardSection, /moveCardMutation\(nextBoard, movedCardWithFlow, sourceListId, destListId, destIndex, auditEvents\)/);
  assert.doesNotMatch(moveCardSection, /saveBoardSnapshot\(/);
});
