import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('kanban mutation migration defines the required RPCs and board-level locking', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20260401_000004_kanban_card_mutations.sql'),
    'utf8',
  );

  for (const fnName of [
    'ff_insert_card',
    'ff_move_card',
    'ff_delete_card',
    'ff_update_card_core',
    'ff_repair_list_positions',
  ]) {
    assert.match(source, new RegExp(`create or replace function public\\.${fnName}\\(`));
  }

  assert.match(source, /pg_advisory_xact_lock\(hashtext\('ff_board:' \|\| p_board_id\)\)/);
  assert.match(source, /if not \(select public\.can_edit_board\(p_board_id\)\) then/);
  assert.match(source, /grant execute on function public\.ff_insert_card\(text, text, jsonb, integer\) to authenticated;/);
  assert.match(source, /grant execute on function public\.ff_move_card\(text, text, text, text, integer, jsonb\) to authenticated;/);
  assert.match(source, /grant execute on function public\.ff_delete_card\(text, text, text\) to authenticated;/);
  assert.match(source, /grant execute on function public\.ff_update_card_core\(text, text, jsonb\) to authenticated;/);
  assert.match(source, /grant execute on function public\.ff_repair_list_positions\(text, text\) to authenticated;/);

  assert.match(source, /create policy "cards_select_member" on public\.cards\s+for select using \(\(select public\.is_board_member\(board_id\)\)\);/s);
  assert.match(source, /create policy "cards_modify_editor" on public\.cards\s+for all using \(\(select public\.can_edit_board\(board_id\)\)\) with check \(\(select public\.can_edit_board\(board_id\)\)\);/s);
});
