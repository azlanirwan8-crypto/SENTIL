import assert from 'node:assert/strict';
import test from 'node:test';

import { loadSentimentAnnotations, saveSentimentAnnotations } from '../src/lib/annotations.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
}

test('sentiment audit labels are scoped to a workspace and accept only known labels', () => {
  const storage = memoryStorage();
  const saved = saveSentimentAnnotations('workspace-1', {
    'play:1': 'positive',
    'x:2': 'negative',
    'reddit:3': 'not-a-label',
  }, storage);
  assert.equal(saved.ok, true);
  assert.deepEqual(loadSentimentAnnotations('workspace-1', storage), {
    annotations: { 'play:1': 'positive', 'x:2': 'negative' },
    error: null,
  });
  assert.deepEqual(loadSentimentAnnotations('workspace-2', storage).annotations, {});
});

test('invalid saved audit data is reported instead of silently overwritten', () => {
  const storage = {
    getItem: () => '{broken',
    setItem: () => assert.fail('invalid data must not be overwritten during load'),
  };
  const result = loadSentimentAnnotations('workspace-1', storage);
  assert.deepEqual(result.annotations, {});
  assert.match(result.error, /could not be read/);
});

test('CSV export includes review analysis and escapes spreadsheet formulas', async () => {
  const { reviewsCsv } = await import('../src/lib/export.js');
  const csv = reviewsCsv([{
    platform: 'x',
    author: 'reviewer',
    text: '=1+1',
    analysis: { sentiment: 'positive' },
  }]);
  assert.match(csv, /"sentiment"/);
  assert.match(csv, /"positive"/);
  assert.doesNotMatch(csv, /human_label|gemini_/);
  assert.match(csv, /"'=1\+1"/);
});
