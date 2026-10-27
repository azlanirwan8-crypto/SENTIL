import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ANALYST_VERSION,
  analyseComparison,
  analyseCorpus,
  analystConfiguration,
  analystRequest,
  applyCompare,
  applyNames,
  applyReading,
  compareFactSheet,
  compareRequest,
  factSheet,
} from '../lib/ai-analyst.mjs';

// Id gerombol ADALAH teks frasa, jadi fixture ini sengaja memuat id dengan digit: itulah kasus
// yang membuat "kirim id asli" salah — model harus mengulang teks digit persis, dan setiap digit
// yang ia kembalikan tidak bisa dibedakan dari angka hasil ukur.
const labels = [
  {
    id: '1hk udah lbh 1hk',
    name: '1hk',
    evidence: '1hk udah lbh 1hk',
    phraseCount: 2,
    reviewCount: 4,
    share: 0.0556,
    praiseCount: 0,
    momentum: 2.5,
    phrases: [{ text: '1hk udah lbh 1hk' }, { text: 'info 1hk udah' }],
    category: { id: 'payout_timing', name: 'Payout Timing', inside: 4, source: 'density' },
  },
  {
    id: 'hari kerja',
    name: 'hari',
    evidence: 'nunggu hari kerja',
    phraseCount: 2,
    reviewCount: 3,
    share: 0.1667,
    praiseCount: 1,
    momentum: 1,
    phrases: [{ text: 'hari kerja sekarang udah' }, { text: 'nunggu hari kerja' }],
    category: null,
  },
];

const model = {
  labels: { positive: 5, neutral: 2, negative: 40, unclassified: 3 },
  nss: -0.42,
  coverage: { reviews: 50, withText: 48, withoutText: 2, analyzed: 47, unclassified: 3 },
  languages: { counts: { id: 44, en: 4 } },
  platforms: [
    { id: 'appstore', total: 10, positive: 7, negative: 2, neutral: 1, unclassified: 0 },
    { id: 'play', total: 30, positive: 3, negative: 25, neutral: 1, unclassified: 1 },
  ],
  topics: [
    { id: 'payout_timing', name: 'Payout Timing', low: 9 },
    { id: 'login_access', name: 'Login & Session Access', low: 21 },
  ],
  painPoints: { labels, pools: { negative: 40 } },
  signals: { items: [{ kind: 'theme', subject: '1hk udah lbh 1hk' }, { kind: 'rise', subject: 'saldo tidak masuk' }] },
  daily: [{ date: '2026-10-01', total: 20 }, { date: '2026-10-02', total: 30 }],
};

const goodBody = () => ({
  names: [
    { ref: 'c1', category: { en: 'Payout timing', id: 'Waktu pencairan' }, subLabel: { en: 'Business days', id: 'Hari kerja' } },
    { ref: 'c2', category: { en: 'Service hours', id: 'Jam layanan' }, subLabel: { en: 'Waiting', id: 'Menunggu' } },
  ],
  reading: {
    narrative: {
      en: 'Reviewers are mostly describing money that has not arrived rather than an app that fails to open.',
      id: 'Sebagian besar ulasan menggambarkan uang yang belum sampai, bukan aplikasi yang gagal dibuka.',
    },
    reviews: {
      en: 'The wording is short and operational, repeating the same promise about timing.',
      id: 'Kalimatnya pendek dan operasional, mengulang janji yang sama soal waktu.',
    },
    method: {
      en: 'Some reviews carry a rating but no words, so the reading covers only what was written.',
      id: 'Sebagian ulasan hanya berisi bintang tanpa kalimat, jadi bacaan ini hanya mencakup yang tertulis.',
    },
    labels: [
      { ref: 'c1', cause: { en: 'The promised payout window is not explained before the transfer starts.', id: 'Janji waktu pencairan tidak dijelaskan sebelum transfer dimulai.' }, action: { en: 'State the expected arrival time on the confirmation screen.', id: 'Tulis waktu tiba yang diharapkan di layar konfirmasi.' } },
      { ref: 'c2', cause: { en: 'Support answers arrive only during working days while reviewers expect same-day help.', id: 'Balikan dukungan hanya datang pada hari kerja padahal reviewer mengharapkan bantuan hari yang sama.' }, action: { en: 'Publish the response window and route urgent cases outside office hours.', id: 'Publikasikan batas waktu balasan dan alihkan kasus mendesak di luar jam kantor.' } },
    ],
    platforms: [
      { ref: 'p1', note: { en: 'Store reviewers here write to warn other users about money in transit.', id: 'Reviewer di toko ini menulis untuk memperingatkan pengguna lain soal uang dalam perjalanan.' } },
      { ref: 'p2', note: { en: 'This channel is where the payout complaints concentrate.', id: 'Kanal ini tempat keluhan pencairan paling berkumpul.' } },
    ],
  },
});

const reply = body => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] } }] }) });

const keysOf = (value, found = []) => {
  if (Array.isArray(value)) for (const item of value) keysOf(item, found);
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      found.push(key);
      keysOf(item, found);
    }
  }
  return found;
};

test('versi lapisan tercatat dan konfigurasi membaca kunci serta model', () => {
  assert.equal(ANALYST_VERSION, 'ai-analyst-v1');
  assert.deepEqual(analystConfiguration({ GEMINI_API_KEY: ' abc ' }), { enabled: true, key: 'abc', model: 'gemini-3.8-flash' });
  assert.equal(analystConfiguration({ GEMINI_MODEL: 'gemini-1.5-flash' }).model, 'gemini-1.5-flash');
  assert.equal(analystConfiguration({}).enabled, false);
});

test('tanpa kunci, lapisan di-skip dan tidak ada satu pun teks AI yang dibuat', async () => {
  const result = await analyseCorpus(model, { env: {}, fetchImpl: async () => { throw new Error('tidak boleh dipanggil'); } });
  assert.equal(result.status, 'skipped');
  assert.match(result.reason, /GEMINI_API_KEY/);
  assert.deepEqual(result.names, {});
  assert.deepEqual(result.reading, { narrative: null, reviews: null, method: null, labels: {}, platforms: {} });
});

// Ini inti dari "akal di atas angka": yang boleh menyeberang hanyalah kata dan urutan. Test ini
// menguji keduanya — tidak ada kunci yang menyimpan angka, dan tidak ada nilai pengukuran yang
// muncul sebagai teks — karena satu angka yang lolos ke prompt bisa kembali ke tabel sebagai
// kalimat yang tampak terukur.
test('fact sheet tidak membawa satu pun angka hasil ukur', () => {
  const sheet = factSheet(model);
  const request = analystRequest(sheet);
  const sent = request.contents[0].parts[0].text;
  for (const forbidden of ['40', '30', '-0.42', '0.0556', '0.1667', '2.5', '1.4', '21', '47', '48', '50', '44']) {
    assert.equal(sent.includes(forbidden), false, `${forbidden} adalah hasil ukur dan tidak boleh dikirim`);
  }
  const keys = keysOf(JSON.parse(sent));
  for (const forbidden of ['reviewCount', 'praiseCount', 'momentum', 'share', 'inside', 'total', 'low', 'nss', 'positive', 'negative', 'unclassified']) {
    assert.equal(keys.includes(forbidden), false, `field ${forbidden} tidak boleh ikut terkirim`);
  }
  assert.equal(sent.includes('1hk udah lbh 1hk'), true, 'frasa verbatim reviewers memang dikirim sebagai bukti');
  assert.match(JSON.stringify(request.systemInstruction), /Never write a digit/);
  assert.match(JSON.stringify(request.systemInstruction), /BOTH languages/);
});

test('id asli tidak ikut menyeberang; hanya referensi kabut yang jadi pegangan', () => {
  const sent = JSON.stringify(analystRequest(factSheet(model)));
  assert.equal(sent.includes('"id"'), false, 'field id tidak dikirim: id gerombol adalah teks ulasan yang berdigit');
  assert.equal(sent.includes('payout_timing'), false, 'id topik kamus juga tidak dikirim');
  const sheet = factSheet(model);
  assert.deepEqual(sheet.complaints.map(entry => entry.ref), ['c1', 'c2']);
  assert.deepEqual(sheet.channels.map(entry => entry.ref), ['p1', 'p2']);
  assert.deepEqual(sheet.findings.map(entry => entry.ref), ['s1', 's2']);
});

test('urutan dan arah membawa informasi tanpa angka', () => {
  const sheet = factSheet(model);
  // Kanal terbesar duluan, dan arahnya ditulis sebagai kata yang benar-benar ada.
  assert.deepEqual(sheet.channels.map(entry => [entry.name, entry.tilt]), [
    ['Google Play', 'mostly complaints, with a real share of praise'],
    ['App Store', 'mostly praise, with a real share of complaints'],
  ]);
  // Topik disusun dari yang paling padat keluhannya.
  assert.deepEqual(sheet.topics, ['Login & Session Access', 'Payout Timing']);
  assert.deepEqual(sheet.complaints.map(entry => entry.direction), ['rising', 'steady'], 'momentum hanya boleh keluar sebagai kata arah');
  assert.equal(sheet.complaints[0].area, 'Payout Timing');
  assert.equal(sheet.complaints[1].area, null, 'gerombol tanpa kategori kamus tidak diberi area karangan');
  assert.deepEqual(sheet.verdict, { dominantSentiment: 'negative', netScore: 'below zero', language: 'mostly Indonesian' });
  assert.equal(sheet.limits.includes('some reviews carry a star rating but no words'), true, 'batas korpus ikut ditulis supaya method note bisa jujur');
});

test('korpus yang sempit melaporkan batasnya sendiri', () => {
  const sheet = factSheet({ ...model, daily: [{ date: '2026-10-01', total: 50 }], coverage: { ...model.coverage, withoutText: 0 } });
  assert.equal(sheet.limits.includes('the corpus is too short in time to read a direction'), true);
});

test('nama dua bahasa dipetakan balik ke id, termasuk id yang memuat digit', () => {
  const names = applyNames(labels, goodBody().names);
  assert.deepEqual(Object.keys(names).sort(), ['1hk udah lbh 1hk', 'hari kerja']);
  assert.deepEqual(names['hari kerja'].category, { en: 'Service hours', id: 'Jam layanan' });
  assert.deepEqual(names['1hk udah lbh 1hk'].subLabel, { en: 'Business days', id: 'Hari kerja' });
  // Balikan model lama yang hanya membawa satu string tetap diterima, dua-duanya diisi sama.
  const plain = applyNames(labels, [{ ref: 'c1', category: 'Payout timing' }]);
  assert.deepEqual(plain['1hk udah lbh 1hk'].category, { en: 'Payout timing', id: 'Payout timing' });
  assert.equal(plain['1hk udah lbh 1hk'].subLabel, null);
});

test('referensi asing dibuang, nama berisi angka ditolak', () => {
  const names = applyNames(labels, [
    { ref: 'c9', category: { en: 'Invented cluster', id: 'Gerombol karangan' } },
    { ref: 'c1', category: { en: 'Login 2.0', id: 'Login 2.0' } },
    { ref: 'c2', category: { en: 'Access & UX', id: 'Akses & UX' } },
  ]);
  assert.deepEqual(Object.keys(names), ['hari kerja']);
  assert.equal(names['1hk udah lbh 1hk'], undefined, 'nama dengan angka tidak pernah dipakai');
});

test('nama terlalu panjang atau terlalu pendek tidak dipakai', () => {
  assert.deepEqual(applyNames(labels, [
    { ref: 'c1', category: { en: 'x'.repeat(61), id: 'y'.repeat(61) } },
    { ref: 'c2', category: { en: 'a', id: 'b' } },
  ]), {});
});

test('satu kalimat bacaan yang memuat angka dibuang, kalimat bersih tetap dipakai', () => {
  const sheet = factSheet(model);
  const applied = applyReading(sheet, {
    narrative: { en: 'About 40 percent of the pool is money timing.', id: 'Sekitar 40 persen pool soal waktu uang.' },
    reviews: { en: 'Reviewers repeat the same promise about arrival time.', id: 'Reviewer mengulang janji yang sama soal waktu tiba.' },
    labels: [
      { ref: 'c1', cause: { en: 'The window is not disclosed.', id: 'Jendela waktu tidak dibuka kepada pengguna sebelum transfer.' }, action: { en: 'Show the arrival time on the confirmation screen and keep it honest.', id: 'Tampilkan waktu tiba di layar konfirmasi dan buat itu jujur.' } },
      { ref: 'c2', cause: { en: 'Only 12 percent of cases are answered late.', id: 'Hanya sebagian kecil kasus dijawab terlambat oleh petugas jaga.' }, action: null },
    ],
    platforms: [{ ref: 'p7', note: { en: 'An invented channel should never reach the table.', id: 'Kanal karangan tidak boleh sampai ke tabel.' } }],
  });
  assert.equal(applied.out.narrative, null, 'satu kalimat dengan angka dibuang seluruhnya');
  assert.ok(applied.out.reviews.en, 'kalimat tanpa angka tetap dipakai');
  assert.ok(applied.out.labels['1hk udah lbh 1hk'].cause.en);
  assert.ok(applied.out.labels['1hk udah lbh 1hk'].action.id);
  // Dua bahasa dinilai terpisah: sebab yang Inggrisnya memuat angka tetap disimpan versi
  // Indonesianya, dan penyaji jatuh ke bahasa yang lolos — bukan ke teks karangan.
  assert.equal(applied.out.labels['hari kerja'].cause.en, null);
  assert.ok(applied.out.labels['hari kerja'].cause.id, 'bahasa yang lolos validasi tetap dipakai');
  assert.deepEqual(Object.keys(applied.out.platforms), [], 'referensi kanal asing dibuang');
  assert.equal(applied.rejected, 2, `penolakan tercatat: ${applied.rejected}`);
});

test('bacaan yang tidak ada tidak membuatnya jadi null paksa', () => {
  const applied = applyReading(factSheet(model), null);
  assert.deepEqual(applied.out, { narrative: null, reviews: null, method: null, labels: {}, platforms: {} });
  assert.equal(applied.kept, 0);
});

test('satu panggilan menjawab nama dan seluruh bacaan panel', async () => {
  let calls = 0;
  const result = await analyseCorpus(model, {
    env: { GEMINI_API_KEY: 'k' },
    fetchImpl: async () => {
      calls += 1;
      return reply(goodBody());
    },
  });
  assert.equal(calls, 1, 'satu penarikan satu panggilan: nama dan bacaan datang dari balasan yang sama');
  assert.equal(result.status, 'answered');
  assert.equal(result.provider, 'gemini');
  assert.equal(result.model, 'gemini-3.8-flash', 'id model dibaca dari yang menjawab, dan dilaporkan apa adanya');
  assert.equal(Object.keys(result.names).length, 2);
  assert.ok(result.reading.narrative.id, 'bacaan dasor punya versi Indonesia');
  assert.equal(Object.keys(result.reading.labels).length, 2);
  assert.equal(Object.keys(result.reading.platforms).length, 2);
  assert.deepEqual(result.metrics.names, { requested: 2, accepted: 2, rejected: 0 });
  assert.equal(result.metrics.reading.panels, 7, 'narasi + reviews + method + dua label + dua kanal');
});

test('response terbungkus pagar markdown tetap terbaca', async () => {
  const body = { names: [{ ref: 'c2', category: { en: 'Payout timing', id: 'Waktu pencairan' } }] };
  const fenced = { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '```json\n' + JSON.stringify(body) + '\n```' }] } }] }) };
  const result = await analyseCorpus(model, { env: { GEMINI_API_KEY: 'k' }, fetchImpl: async () => fenced });
  assert.equal(result.status, 'answered');
  assert.equal(result.names['hari kerja'].category.id, 'Waktu pencairan');
});

test('response yang bukan JSON membuat lapisan gagal tanpa melempar', async () => {
  const result = await analyseCorpus(model, {
    env: { GEMINI_API_KEY: 'k' },
    fetchImpl: async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'maaf, saya tidak bisa' }] } }] }) }),
  });
  assert.equal(result.status, 'failed');
  assert.match(result.reason, /no usable text/);
  assert.deepEqual(result.names, {});
});

test('HTTP error dan abort dilaporkan sebagai kegagalan, bukan crash', async () => {
  let calls = 0;
  const quota = await analyseCorpus(model, {
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

  const aborted = await analyseCorpus(model, {
    env: { GEMINI_API_KEY: 'k' },
    timeoutMs: 60_000,
    fetchImpl: async () => {
      const error = new Error('This operation was aborted');
      error.name = 'AbortError';
      throw error;
    },
  });
  assert.equal(aborted.status, 'failed');
  assert.match(aborted.reason, /no answer within \d+s/, 'alasan kegagalan menyebut jatah yang habis, bukan kata umum');
  assert.equal(aborted.tried.length, 3, 'satu model yang diam tidak menutup lapisan: tiap kandidat dapat jatahnya sendiri');
});

test('model yang tidak dikenal dicobakan ke kandidat berikutnya', async () => {
  const seen = [];
  const result = await analyseCorpus(model, {
    env: { GEMINI_API_KEY: 'k' },
    fetchImpl: async url => {
      const called = decodeURIComponent(String(url)).split('/models/')[1].split(':')[0];
      seen.push(called);
      if (called === 'gemini-3.8-flash') return { ok: false, status: 404, json: async () => ({}), text: async () => '404 FOUND: models/gemini-3.8-flash is not found' };
      return reply({ names: [{ ref: 'c1', category: { en: 'Payout timing', id: 'Waktu pencairan' } }] });
    },
  });
  assert.equal(result.status, 'answered');
  assert.equal(result.model, seen[1], 'model yang menjawab itulah yang dilaporkan');
  assert.equal(seen.length, 2);
  assert.equal(result.tried[0].status, 404);
});

test('503 dicoba sekali lagi pada model yang sama', async () => {
  const seen = [];
  const result = await analyseCorpus(model, {
    env: { GEMINI_API_KEY: 'k' },
    sleep: async () => {},
    fetchImpl: async url => {
      const called = decodeURIComponent(String(url)).split('/models/')[1].split(':')[0];
      seen.push(called);
      if (seen.length === 1) return { ok: false, status: 503, json: async () => ({}), text: async () => '503 high demand' };
      return reply({ reading: { narrative: { en: 'Complaints concentrate on money that has not arrived yet today.', id: 'Keluhan berkumpul pada uang yang belum tiba hari ini.' } } });
    },
  });
  assert.equal(result.status, 'answered');
  assert.equal(seen.length, 2);
  assert.equal(seen[0], seen[1]);
  assert.equal(result.tried[0].retry, 'once');
  assert.ok(result.reading.narrative.en);
  assert.deepEqual(result.names, {}, 'balasan tanpa nama tetap sah: bacaan panel adalah bagian yang lain');
});

test('sisa waktu di bawah reservasi membatalkan percobaan ulang', async () => {
  let calls = 0;
  let clock = 0;
  const result = await analyseCorpus(model, {
    env: { GEMINI_API_KEY: 'k' },
    timeoutMs: 20_000,
    sleep: async () => {},
    now: () => (clock += 6_500),
    fetchImpl: async () => {
      calls += 1;
      return { ok: false, status: 503, json: async () => ({}), text: async () => '503 high demand' };
    },
  });
  assert.equal(result.status, 'failed');
  assert.equal(calls, 1, '503 tanpa sisa waktu untuk menunggu hanya dibayar satu permintaan');
  assert.equal(result.tried[0].retry, undefined);
});

test('waktu yang tidak cukup untuk satu panggilan tidak dibelanjakan', async () => {
  let calls = 0;
  const result = await analyseCorpus(model, {
    env: { GEMINI_API_KEY: 'k' },
    timeoutMs: 7_000,
    fetchImpl: async () => {
      calls += 1;
      return reply(goodBody());
    },
  });
  assert.equal(calls, 0, 'fase menulis tidak boleh dipotong oleh lapisan yang selalu boleh tidak ada');
  assert.equal(result.status, 'skipped');
  assert.match(result.reason, /not enough time/);
});

test('korpus tanpa apa pun yang terbaca tidak memicu panggilan jaringan', async () => {
  let called = 0;
  const result = await analyseCorpus({ labels: {}, coverage: {}, platforms: [], painPoints: { labels: [] } }, {
    env: { GEMINI_API_KEY: 'k' },
    fetchImpl: async () => {
      called += 1;
      return reply(goodBody());
    },
  });
  assert.equal(called, 0);
  assert.equal(result.status, 'skipped');
  assert.match(result.reason, /nothing measured/);
});

test('kunci tidak pernah ditulis ke dalam hasil yang disimpan', async () => {
  const result = await analyseCorpus(model, {
    env: { GEMINI_API_KEY: 'RAHASIA-KUNCIMU' },
    fetchImpl: async () => reply(goodBody()),
  });
  assert.equal(result.status, 'answered');
  assert.equal(JSON.stringify(result).includes('RAHASIA-KUNCIMU'), false);
});

// ---- Bacaan lintas project (menu Compare) ----

const matrix = {
  generatedAt: '2026-10-27T00:00:00.000Z',
  projects: [
    { id: 'w-a', label: 'Wondr by BNI', entity: 'Wondr by BNI', hasData: true, metrics: { volume: 9000, nss: -0.6 } },
    { id: 'w-b', label: 'Velzon', entity: 'Velzon', hasData: true, metrics: { volume: 400, nss: 0.2 } },
    { id: 'w-c', label: 'Kosong', entity: null, hasData: false, metrics: {} },
  ],
  painPoints: [
    { text: '1hk udah lbh 1hk', anchor: 'Payout Timing', cells: { 'w-a': { share: 0.3 }, 'w-b': { share: 0.01 } } },
    { text: 'crash waktu buka', anchor: 'Crash & Error Application', cells: { 'w-b': { share: 0.22 } } },
  ],
};

test('sheet bandingkan mengirim urutan dan kata, bukan sel matriks', () => {
  const sheet = compareFactSheet(matrix);
  assert.deepEqual(sheet.apps.map(entry => [entry.name, entry.stance]), [['Wondr by BNI', 'net complaint'], ['Velzon', 'net praise']]);
  assert.deepEqual(sheet.apps.map(entry => entry.loudest), ['Payout Timing', 'Crash & Error Application']);
  const sent = compareRequest(sheet).contents[0].parts[0].text;
  for (const forbidden of ['9000', '400', '-0.6', '0.2', '0.3', '0.22', 'w-a']) {
    assert.equal(sent.includes(forbidden), false, `${forbidden} adalah hasil ukur atau id asli dan tidak boleh dikirim`);
  }
  assert.equal(sent.includes('"ref":"w1"'), true);
});

test('kurang dari dua project tanpa panggilan, dan project karangan dibuang', async () => {
  let calls = 0;
  const single = await analyseComparison({ ...matrix, projects: [matrix.projects[0]] }, {
    env: { GEMINI_API_KEY: 'k' },
    fetchImpl: async () => {
      calls += 1;
      return reply({ reading: { compare: { en: 'x', id: 'y' } } });
    },
  });
  assert.equal(calls, 0);
  assert.equal(single.status, 'skipped');
  assert.match(single.reason, /at least two/);

  const applied = applyCompare(compareFactSheet(matrix), {
    compare: { en: 'One app is judged on money movement, the other on whether it opens at all.', id: 'Satu aplikasi dinilai soal perpindahan uang, yang lain soal apakah ia mau terbuka.' },
    apps: [
      { ref: 'w1', note: { en: 'Its complaints are about waiting for money.', id: 'Keluhannya soal menunggu uang.' } },
      { ref: 'w9', note: { en: 'A project nobody selected should not appear.', id: 'Project yang tidak dipilih tidak boleh muncul.' } },
    ],
  });
  assert.deepEqual(Object.keys(applied.out.apps), ['w-a']);
  assert.ok(applied.out.compare.id);
  assert.equal(applied.rejected, 1);
});

test('bacaan bandingkan datang dari satu panggilan dan ditandai modelnya', async () => {
  let calls = 0;
  const result = await analyseComparison(matrix, {
    env: { GEMINI_API_KEY: 'k' },
    fetchImpl: async () => {
      calls += 1;
      return reply({ reading: {} });
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.status, 'failed', 'balasan yang tidak berisi teks terpakai dilaporkan sebagai kegagalan, bukan kosong tanpa penjelasan');
  assert.deepEqual(result.reading, { compare: null, apps: {} });

  const ok = await analyseComparison(matrix, {
    env: { GEMINI_API_KEY: 'k' },
    fetchImpl: async () => reply({
      reading: {
        compare: { en: 'These two apps are complained about for different reasons.', id: 'Dua aplikasi ini dikeluhkan karena alasan yang berbeda.' },
        apps: [{ ref: 'w2', note: { en: 'Its reviewers judge whether the app opens.', id: 'Reviewernya menilai apakah aplikasinya terbuka.' } }],
      },
    }),
  });
  assert.equal(ok.status, 'answered');
  assert.equal(ok.model, 'gemini-3.8-flash');
  assert.deepEqual(Object.keys(ok.reading.apps), ['w-b']);
  assert.equal(ok.metrics.accepted, 2);
});

// Kontrak tampilan: teks yang tidak ditulis reviewer maupun mesin harus selalu menyebut
// sumbernya. Test ini mengunci aturan itu di berkas komponen, karena panel yang menempelkan
// satu kalimat model tanpa tanda adalah cara paling senyap untuk membuat laporan tidak
// bisa diaudit lagi.
test('setiap panel yang menampilkan bacaan analis menyebut modelnya', () => {
  const panels = [
    'Signals.jsx',
    'PainLabels.jsx',
    'ReviewsView.jsx',
    'CompareView.jsx',
    'ModelView.jsx',
    'charts/PlatformBars.jsx',
  ];
  for (const name of panels) {
    const source = readFileSync(fileURLToPath(new URL(`../src/components/${name}`, import.meta.url)), 'utf8');
    assert.match(source, /from '[./]+Analyst\.jsx'|AI · /, `${name} memakai teks analis tanpa primitive bertanda sumber`);
    assert.match(source, /status === 'answered'/, `${name} harus hanya menampilkan bacaan ketika lapisan analis benar-benar menjawab`);
  }
});
