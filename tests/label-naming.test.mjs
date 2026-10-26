import { strict as assert } from 'node:assert';
import test from 'node:test';

import { applyNames, nameClusters, namingConfiguration, namingRequest } from '../lib/label-naming.mjs';

const clusters = [
  { id: 'hari kerja', phrases: ['hari kerja sekarang udah', 'nunggu hari kerja', 'berhari hari tidak ada'] },
  { id: 'harus pake pasword maunya', phrases: ['harus pake pasword maunya', 'kalo masuk ngecek harus'] },
];

const geminiReply = names => ({
  ok: true,
  json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ names }) }] } }] }),
});

test('tanpa kunci, penamaan di-skip dan tidak ada nama yang dibuat', async () => {
  const result = await nameClusters(clusters, { env: {}, fetchImpl: async () => { throw new Error('tidak boleh dipanggil'); } });
  assert.equal(result.status, 'skipped');
  assert.deepEqual(result.names, {});
  assert.match(result.reason, /GEMINI_API_KEY/);
});

test('konfigurasi membaca GEMINI_API_KEY dan model bisa diganti lewat env', () => {
  assert.deepEqual(namingConfiguration({ GEMINI_API_KEY: ' abc ' }), { enabled: true, key: 'abc', model: 'gemini-2.0-flash' });
  assert.equal(namingConfiguration({ GEMINI_MODEL: 'gemini-1.5-flash' }).model, 'gemini-1.5-flash');
  assert.equal(namingConfiguration({}).enabled, false);
});

test('prompt hanya memuat id dan frasa — tidak ada angka yang dikirim ke model', () => {
  const request = namingRequest(clusters);
  const sent = JSON.stringify(request.contents);
  assert.ok(sent.includes('hari kerja'));
  assert.ok(sent.includes('harus pake pasword maunya'));
  assert.equal(/\d/.test(sent), false, 'jumlah ulasan tidak boleh ikut terkirim');
  assert.equal(JSON.stringify(request.systemInstruction).includes('Never use digits'), true);
});

test('nama yang tidak dikenal dibuang, nama berisi angka ditolak', () => {
  const names = applyNames(clusters, [
    { id: 'hari kerja', category: 'Authentication & Security', subLabel: 'Business days' },
    { id: 'gerombol karangan model', category: ' invented', subLabel: 'nope' },
    { id: 'harus pake pasword maunya', category: 'Login 2.0', subLabel: 'Password' },
    { id: 'harus pake pasword maunya', category: 'Access & UX', subLabel: 'Password' },
  ]);
  assert.deepEqual(Object.keys(names), ['hari kerja', 'harus pake pasword maunya']);
  assert.equal(names['hari kerja'].category, 'Authentication & Security');
  assert.equal(names['harus pake pasword maunya'].category, 'Access & UX');
  assert.equal(names['hari kerja'].subLabel, 'Business days');
});

test('nama terlalu panjang atau terlalu pendek tidak dipakai', () => {
  const names = applyNames(clusters, [
    { id: 'hari kerja', category: 'x'.repeat(61) },
    { id: 'harus pake pasword maunya', category: 'a' },
  ]);
  assert.deepEqual(names, {});
});

test('respons terbungkus pagar markdown tetap terbaca', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text: '```json\n{"names":[{"id":"hari kerja","category":"Payout timing"}]}\n```' }] } }] }),
  });
  const result = await nameClusters(clusters, { env: { GEMINI_API_KEY: 'k' }, fetchImpl });
  assert.equal(result.status, 'named');
  assert.equal(result.names['hari kerja'].category, 'Payout timing');
});

test('respons yang bukan JSON membuat penamaan gagal tanpa melempar', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'maaf, saya tidak bisa' }] } }] }) });
  const result = await nameClusters(clusters, { env: { GEMINI_API_KEY: 'k' }, fetchImpl });
  assert.equal(result.status, 'failed');
  assert.deepEqual(result.names, {});
});

test('HTTP error dan abort dilaporkan sebagai kegagalan, bukan crash', async () => {
  const quota = await nameClusters(clusters, { env: { GEMINI_API_KEY: 'k' }, fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({}) }) });
  assert.equal(quota.status, 'failed');
  assert.match(quota.reason, /429/);

  const aborted = await nameClusters(clusters, {
    env: { GEMINI_API_KEY: 'k' },
    fetchImpl: async () => {
      const error = new Error('This operation was aborted');
      error.name = 'AbortError';
      throw error;
    },
  });
  assert.equal(aborted.status, 'failed');
  assert.match(aborted.reason, /timed out/);
});

test('korpus tanpa gerombol tidak memicu panggilan jaringan', async () => {
  let called = 0;
  const result = await nameClusters([], { env: { GEMINI_API_KEY: 'k' }, fetchImpl: async () => { called += 1; return geminiReply([]); } });
  assert.equal(called, 0);
  assert.equal(result.status, 'skipped');
  assert.match(result.reason, /no clusters/);
});

test('kunci tidak pernah ditulis ke dalam hasil yang disimpan', async () => {
  const result = await nameClusters(clusters, {
    env: { GEMINI_API_KEY: 'RAHASIA-KUNCIMU' },
    fetchImpl: async () => geminiReply([{ id: 'hari kerja', category: 'Payout timing', subLabel: 'Business days' }]),
  });
  assert.equal(result.status, 'named');
  assert.equal(JSON.stringify(result).includes('RAHASIA-KUNCIMU'), false);
});
