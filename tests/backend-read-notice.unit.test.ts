import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('backend read notice handles position conflicts explicitly', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/lib/supabase/frameflow.ts'), 'utf8');
  const getBackendReadNoticeSection = source.slice(
    source.indexOf('export function getBackendReadNotice'),
    source.indexOf('export function buildInitialBoard'),
  );

  assert.match(getBackendReadNoticeSection, /code === '23505'/);
  assert.match(getBackendReadNoticeSection, /cards_list_id_position_key/);
  assert.match(getBackendReadNoticeSection, /resincronizando el tablero con Supabase/i);
});
