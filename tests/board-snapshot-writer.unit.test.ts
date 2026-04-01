import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('saveBoardSnapshot writes existing boards with update instead of upsert', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/lib/supabase/frameflow.ts'),
    'utf8'
  );

  const saveBoardSnapshotSection = source.slice(
    source.indexOf('export async function saveBoardSnapshot'),
    source.indexOf('export async function inviteBoardMember')
  );

  assert.match(
    saveBoardSnapshotSection,
    /from\('boards'\)\s*\n\s*\.update\(boardToDb\(normalizedBoard\)\)\s*\n\s*\.eq\('id', normalizedBoard\.id\)/
  );

  assert.doesNotMatch(
    saveBoardSnapshotSection,
    /from\('boards'\)\.upsert\(boardToDb\(normalizedBoard\)\)/
  );
});
