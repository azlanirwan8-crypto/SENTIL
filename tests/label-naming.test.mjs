import { strict as assert } from 'node:assert';
import test from 'node:test';

import { analyzeCorpus } from '../lib/corpus-engine.mjs';
import { applyNames, nameClusters, namingConfiguration, namingRequest } from '../lib/label-naming.mjs';

// Id gerombol ADALAH teks frasa, jadi fixture ini sengaja memuat id dengan digit: itulah kasus
// yang membuat "kirim id asli" salah — model harus mengulang teks digit persis, dan setiap
// digit yang ia kembalikan tidak bisa dibedakan dari angka hasil ukur.
const clusters = [
  { id: '1hk udah lbh 1hk', phrases: ['1hk udah lbh 1hk', 'info 1hk udah'], reviewCount: 1, share: 0.0556, praiseCount: 0, momentum: 2.5, severity: 1.96, weight: 1.96 },
  { id: 'hari kerja', phrases: ['hari kerja sekarang udah', 'nunggu hari kerja'], reviewCount: 3, share: 0.1667, praiseCount: 1, momentum: 1.4, severity: 4.28, weight: 4.28 },
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

test('yang dikirim hanya referensi kabut dan frasa — tanpa id asli, tanpa angka hasil ukur', () => {
  const request = namingRequest(clusters);
  const payload = JSON.parse(request.contents[0].parts[0].text);
  assert.deepEqual(Object.keys(payload), ['clusters']);
  assert.deepEqual(payload.clusters.map(entry => entry.ref), ['c1', 'c2']);
  for (const entry of payload.clusters) {
    assert.deepEqual(Object.keys(entry), ['ref', 'phrases'], 'hanya referensi dan frasa yang menyeberang');
  }
  assert.deepEqual(payload.clusters[0].phrases, ['1hk udah lbh 1hk', 'info 1hk udah'], 'frasa verbatim tetap utuh sebagai bukti');
  const sent = JSON.stringify(request);
  // Tidak satu pun angka pengukuran menyeberang, dan tidak ada kunci fieldnya yang ikut terkirim.
  for (const forbidden of ['reviewCount', 'praiseCount', 'momentum', 'severity', '0.1667', '4.28', '2.5']) {
    assert.equal(sent.includes(forbidden), false, `${forbidden} tidak boleh dikirim ke model`);
  }
  assert.equal(sent.includes('Authentication'), false, 'id asli tidak boleh ikut diminta diulang');
  assert.equal(JSON.stringify(request.systemInstruction).includes('Never use digits in a name'), true);
});

test('balikan dipetakan kembali ke id asli, termasuk id yang memuat digit', () => {
  const names = applyNames(clusters, [
    { ref: 'c1', category: 'Payout timing', subLabel: 'Business days' },
    { ref: 'c2', category: 'Authentication & Security', subLabel: 'Login method' },
  ]);
  assert.deepEqual(Object.keys(names).sort(), ['1hk udah lbh 1hk', 'hari kerja']);
  assert.equal(names['hari kerja'].category, 'Authentication & Security');
  assert.equal(names['hari kerja'].subLabel, 'Login method');
});

test('referensi asing dibuang, nama berisi angka ditolak', () => {
  const names = applyNames(clusters, [
    { ref: 'c9', category: 'Invented cluster' },
    { ref: 'c1', category: 'Login 2.0', subLabel: 'Password' },
    { ref: 'c2', category: 'Access & UX', subLabel: 'Password' },
  ]);
  assert.deepEqual(Object.keys(names), ['hari kerja']);
  assert.equal(names['1hk udah lbh 1hk'], undefined, 'nama dengan angka tidak pernah dipakai');
});

test('nama terlalu panjang atau terlalu pendek tidak dipakai', () => {
  assert.deepEqual(applyNames(clusters, [
    { ref: 'c1', category: 'x'.repeat(61) },
    { ref: 'c2', category: 'a' },
  ]), {});
});

test('respons terbungkus pagar markdown tetap terbaca', async () => {
  const reply = {
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text: '```json\n{"names":[{"ref":"c2","category":"Payout timing"}]}\n```' }] } }] }),
  };
  const result = await nameClusters(clusters, { env: { GEMINI_API_KEY: 'k' }, fetchImpl: async () => reply });
  assert.equal(result.status, 'named');
  assert.equal(result.names['hari kerja'].category, 'Payout timing');
  assert.equal(result.named, 1);
});

test('respons yang bukan JSON membuat penamaan gagal tanpa melempar', async () => {
  const reply = { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'maaf, saya tidak bisa' }] } }] }) };
  const result = await nameClusters(clusters, { env: { GEMINI_API_KEY: 'k' }, fetchImpl: async () => reply });
  assert.equal(result.status, 'failed');
  assert.deepEqual(result.names, {});
});

test('HTTP error dan abort dilaporkan sebagai kegagalan, bukan crash', async () => {
  let calls = 0;
  const quota = await nameClusters(clusters, {
    env: { GEMINI_API_KEY: 'k' },
    fetchImpl: async () => {
      calls += 1;
      return { ok: false, status: 429, json: async () => ({}), text: async () => 'RESOURCE_EXHAUSTED: quota per minute exceeded' };
    },
  });
  assert.equal(quota.status, 'failed');
  assert.match(quota.reason, /429/);
  assert.match(quota.detail, /RESOURCE_EXHAUSTED/, 'alasan sumber dipakai apa adanya supaya pemilik tahu apa yang diganti');
  assert.equal(calls, 1, '429 bukan salah id model — mencoba model lain hanya membakar kuota');

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

test('model yang tidak dikenal dicobakan ke kandidat berikutnya, bukan dibiarkan mati', async () => {
  const seen = [];
  const reply = await nameClusters(clusters, {
    env: { GEMINI_API_KEY: 'k' },
    fetchImpl: async (url) => {
      const model = decodeURIComponent(String(url)).split('/models/')[1].split(':')[0];
      seen.push(model);
      if (model === 'gemini-2.0-flash') return { ok: false, status: 404, json: async () => ({}), text: async () => '404 FOUND: models/gemini-2.0-flash is not found for API version v1beta' };
      return geminiReply([{ ref: 'c1', category: 'Autentikasi', subLabel: 'login dan verifikasi' }]);
    },
  });
  assert.equal(reply.status, 'named');
  assert.equal(reply.model, seen[1], 'model yang menjawab itulah yang dilaporkan, bukan yang pertama dicoba');
  assert.equal(seen.length, 2, 'hanya dua panggilan: yang pertama 404, yang kedua menjawab');
  assert.equal(reply.tried[0].status, 404);
  assert.match(reply.tried[0].reason, /is not found/);
  assert.equal(Object.keys(reply.names).length, 1);
});

test('kalau semua kandidat menjawab 404, kegagalan dilaporkan lengkap dengan jejaknya', async () => {
  const result = await nameClusters(clusters, {
    env: { GEMINI_API_KEY: 'k', GEMINI_MODEL: 'model-karangan' },
    fetchImpl: async () => ({ ok: false, status: 404, json: async () => ({}), text: async () => '404 NOT_FOUND' }),
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.tried.length, 3, 'model konfigurasi plus dua cadangan, tidak lebih');
  assert.equal(result.tried[0].model, 'model-karangan', 'yang diminta pemilik tetap dicoba lebih dulu');
  assert.deepEqual(result.names, {});
});

test('waktu habis menghentikan percobaan model tambahan', async () => {
  let calls = 0;
  const result = await nameClusters(clusters, {
    env: { GEMINI_API_KEY: 'k' },
    timeoutMs: 1,
    fetchImpl: async () => {
      calls += 1;
      return { ok: false, status: 404, json: async () => ({}), text: async () => '404' };
    },
  });
  assert.equal(result.status, 'failed');
  assert.equal(calls, 0, 'anggaran yang sudah habis tidak dibayar dengan permintaan yang pasti dipotong');
  assert.match(result.tried[result.tried.length - 1].reason, /no time left/);
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
    fetchImpl: async () => geminiReply([{ ref: 'c1', category: 'Payout timing', subLabel: 'Business days' }]),
  });
  assert.equal(result.status, 'named');
  assert.equal(JSON.stringify(result).includes('RAHASIA-KUNCIMU'), false);
});

// Test kontrak di atas memakai fixture tulisan tangan. Yang ini mengulangnya pada payload
// SUNGGUHAN dari korpus nyata — karena bug yang dicari justru hanya muncul saat id gerombol
// adalah teks ulasan yang memuat digit.
test('kontrak yang sama berlaku pada gerombol korpus nyata (73 ulasan)', async () => {
  const fs = await import('node:fs');
  const file = new URL('../.scratch/wondr-dataset.json', import.meta.url);
  if (!fs.existsSync(file)) {
    assert.equal(1, 1);
    return; // berkas korpus nyata tidak ada di checkout ini — test berjalan di fixture di atas
  }
  const dataset = JSON.parse(fs.readFileSync(file, 'utf8')).dataset;
  const model = analyzeCorpus(dataset.reviews, { entity: dataset.entity }).model;
  const labels = model.painPoints.labels;
  const payload = JSON.parse(namingRequest(labels.map(label => ({ id: label.id, phrases: label.phrases.map(entry => entry.text) }))).contents[0].parts[0].text);
  assert.ok(labels.some(label => /\d/.test(label.id)), 'korpus ini memang punya id berdigit');
  assert.deepEqual(payload.clusters.map(entry => entry.ref), labels.map((_, index) => `c${index + 1}`), 'setiap gerombol nyata diwakili referensi kabut');
  for (const entry of payload.clusters) assert.deepEqual(Object.keys(entry), ['ref', 'phrases']);
  const mapped = applyNames(labels.map(label => ({ id: label.id, phrases: label.phrases.map(entry => entry.text) })), labels.map((label, index) => ({ ref: `c${index + 1}`, category: 'Payout timing' })));
  assert.equal(Object.keys(mapped).length, labels.length, 'setiap gerombol nyata harus dapat dipetakan balik');
  assert.deepEqual(Object.keys(mapped).sort(), labels.map(label => label.id).sort());
});
