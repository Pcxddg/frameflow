import test from 'node:test';
import assert from 'node:assert/strict';

import { canUseDirectGemini } from '../src/lib/aiRuntime';

test('canUseDirectGemini only allows direct Gemini in development', () => {
  assert.equal(
    canUseDirectGemini({
      apiKey: 'test-key',
      isDevelopment: true,
    }),
    true
  );

  assert.equal(
    canUseDirectGemini({
      apiKey: 'test-key',
      isDevelopment: false,
    }),
    false
  );
});

test('canUseDirectGemini requires an API key', () => {
  assert.equal(
    canUseDirectGemini({
      apiKey: '',
      isDevelopment: true,
    }),
    false
  );
});
