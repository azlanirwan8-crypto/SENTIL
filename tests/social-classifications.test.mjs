import assert from 'node:assert/strict';
import test from 'node:test';

import { loadSocialClassifications, saveSocialClassifications } from '../src/lib/social-classifications.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
}

test('Gemini classifications are validated and isolated by workspace in browser storage', () => {
  const storage = memoryStorage();
  const value = {
    label: 'negative',
    confidence: 'medium',
    reason: 'mixed_sentiment',
    model: 'gemini-test',
    at: '2026-04-01T00:00:00.000Z',
  };
  const saved = saveSocialClassifications('workspace-1', { 'x:comment-1': value, 'x:comment-2': { ...value, label: 'bad' } }, storage);
  assert.equal(saved.ok, true);
  assert.deepEqual(loadSocialClassifications('workspace-1', storage).classifications, { 'x:comment-1': value });
  assert.deepEqual(loadSocialClassifications('workspace-2', storage).classifications, {});
});

test('invalid saved Gemini data is reported instead of hidden', () => {
  const result = loadSocialClassifications('workspace-1', {
    getItem: () => '[]',
    setItem: () => assert.fail('load must not overwrite data'),
  });
  assert.deepEqual(result.classifications, {});
  assert.match(result.error, /invalid/);
});
