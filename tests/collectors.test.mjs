import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { fetchAppStoreReviews, parseAppleRss } from '../lib/appstore.mjs';
import { classifyIssue } from '../lib/limit-monitor.mjs';

const ok = text => ({ ok: true, status: 200, text: async () => text, headers: { get: () => null } });

const entryWithId = {
  id: { label: '100001' },
  'im:rating': { label: '5' },
  title: { label: 'Bagus' },
  content: { label: 'pelayanan cepat' },
  author: { name: { label: 'Rina' } },
  updated: { label: '2026-10-20_01-00-00' },
};

const entryTanpaId = {
  'im:rating': { label: '1' },
  content: { label: 'item tanpa id tidak boleh hilang tanpa jejak' },
};

describe('kolektor App Store melaporkan baris yang dibuang', () => {
  test('entry tanpa id tetap dihitung sebagai dilewati', () => {
    const parsed = parseAppleRss(JSON.stringify({ feed: { entry: [entryWithId, entryTanpaId] } }), '6741567238');
    assert.equal(parsed.reviews.length, 1);
    assert.equal(parsed.skipped, 1);
  });

  test('satu entry saja tidak dianggap lengkap dan sinyalnya ikut terbaca monitor', async () => {
    const channel = await fetchAppStoreReviews('6741567238', {}, {
      budgetMs: 5000,
      fetchImpl: async url => (
        url.includes('rss/customerreviews')
          ? ok(JSON.stringify({ feed: { entry: /page=1\//.test(url) ? [entryWithId, entryTanpaId] : [] } }))
          : ok('<html>tidak ada data ulasan</html>')
      ),
    });
    assert.equal(channel.fetched, 1, 'hanya baris yang benar-benar terpakai yang dihitung');
    assert.equal(channel.coverage.skipped, 1, 'satu baris dibuang dan dilaporkan');
    assert.equal(channel.status, 'partial');
    assert.equal(channel.truncated, true);
    const signal = channel.limits.issues.find(issue => issue.source === 'parser');
    assert.match(signal.text, /1 items could not be used as reviews/);
    assert.equal(classifyIssue(signal.text).kind, 'parse-changed');
    assert.match(channel.message, /1 items could not be used as a review and were dropped/);
  });

  test('penarikan bersih tanpa baris buangan tidak memunculkan sinyal parser', async () => {
    const channel = await fetchAppStoreReviews('6741567238', {}, {
      budgetMs: 5000,
      fetchImpl: async url => (
        url.includes('rss/customerreviews')
          ? ok(JSON.stringify({ feed: { entry: /page=1\//.test(url) ? [entryWithId] : [] } }))
          : ok('<html>tidak ada data ulasan</html>')
      ),
    });
    assert.equal(channel.coverage.skipped, 0);
    assert.equal(channel.limits.issues.some(issue => issue.source === 'parser'), false);
    assert.equal(channel.status, 'partial', 'halaman rak gagal terbaca, jadi tetap partial');
  });
});
