import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import {
  ANALYSE_STAGES,
  PHASE_WEIGHTS,
  analyseFraction,
  createProgressStore,
  percentOf,
} from '../lib/pull-progress.mjs';

describe('persentase progres penarikan', () => {
  test('fase tarik tidak punya persen — tidak ada penyebut yang jujur', () => {
    const record = { phase: 'fetch', rows: 12480, channels: [], stages: [], chunks: { done: 0, total: 0 } };
    assert.deepEqual(percentOf(record), { phasePercent: null, overallPercent: null });
  });

  test('persen analisis hanya menghitung tahap yang sudah selesai', () => {
    assert.equal(analyseFraction([]), 0);
    const one = analyseFraction(['tokenize']);
    assert.ok(one > 0 && one < 0.1, `tokenize hanya sebagian kecil dari 8,3 detik yang terukur: ${one}`);
    const untilPhrases = analyseFraction(['tokenize', 'stopwords', 'weights', 'topics', 'phrases']);
    assert.ok(untilPhrases > 0.9 && untilPhrases < 1, `setelah tahap frasa hampir selesai tapi belum penuh: ${untilPhrases}`);
    assert.equal(analyseFraction(ANALYSE_STAGES.map(entry => entry.stage)), 1);
    const percent = percentOf({ phase: 'analyse', stages: ['tokenize', 'stopwords'] }).phasePercent;
    assert.ok(percent > 5 && percent < 20, `persen fase harus ikut tahap yang selesai: ${percent}`);
  });

  test('persen tulis dihitung dari potongan yang sudah diterima database', () => {
    const early = percentOf({ phase: 'write', chunks: { done: 1, total: 4 } });
    assert.equal(early.phasePercent, 25);
    assert.equal(early.overallPercent, Math.round((PHASE_WEIGHTS.fetch + PHASE_WEIGHTS.analyse + PHASE_WEIGHTS.write * 0.25) * 1000) / 10);
    const unknown = percentOf({ phase: 'write', chunks: { done: 0, total: 0 } });
    assert.equal(unknown.phasePercent, null, 'tanpa jumlah potongan tidak ada persen, bukan 0%');
    const done = percentOf({ phase: 'write', chunks: { done: 4, total: 4 } });
    assert.equal(done.phasePercent, 100);
    assert.equal(done.overallPercent, 100);
  });

  test('pekerjaan selesai selalu 100 dan yang tidak dikenal tidak mengklaim angka', () => {
    assert.deepEqual(percentOf({ phase: 'done' }), { phasePercent: 100, overallPercent: 100 });
    assert.deepEqual(percentOf({ phase: 'misteri' }), { phasePercent: null, overallPercent: null });
    assert.deepEqual(percentOf(null), { phasePercent: null, overallPercent: null });
  });

  test('bobot fase diambil dari laju yang terukur, bukan dibagi rata', () => {
    const total = PHASE_WEIGHTS.fetch + PHASE_WEIGHTS.analyse + PHASE_WEIGHTS.write;
    assert.equal(Math.round(total * 1000) / 1000, 1);
    assert.ok(PHASE_WEIGHTS.fetch > PHASE_WEIGHTS.write, 'tarik adalah fase termahal per baris (1,11 vs 0,83 ms)');
    assert.ok(PHASE_WEIGHTS.analyse < PHASE_WEIGHTS.write, 'analisis lebih murah daripada tulis (0,30 vs 0,83 ms per baris)');
  });
});

describe('gudang progres per project', () => {
  test('kanal menumpuk barisnya dan total rows adalah jumlah kanal', () => {
    const store = createProgressStore();
    store.begin('ws-1', { workspaceId: 'ws-1', entity: 'aud' });
    store.channel('ws-1', { id: 'play', status: 'partial', fetched: 51532, pages: 52 });
    store.channel('ws-1', { id: 'news', status: 'success', fetched: 7 });
    const record = store.get('ws-1');
    assert.deepEqual(record.channels, [
      { id: 'play', status: 'partial', rows: 51532, pages: 52 },
      { id: 'news', status: 'success', rows: 7, pages: 0 },
    ]);
    assert.equal(record.rows, 51539);
    assert.equal(record.pages, 52);
    assert.equal(record.phase, 'fetch');
    assert.equal(record.overallPercent, null, 'fase tarik tetap tanpa persen walau barisnya banyak');
  });

  test('kanal yang sama diperbarui di tempat, bukan ditambahkan dua kali', () => {
    const store = createProgressStore();
    store.begin('ws-2');
    store.channel('ws-2', { id: 'play', status: 'running', fetched: 1000 });
    store.channel('ws-2', { id: 'play', status: 'success', fetched: 2000 });
    const record = store.get('ws-2');
    assert.equal(record.channels.length, 1);
    assert.equal(record.rows, 2000);
  });

  test('tahap analisis menambah persen secara monoton', () => {
    const store = createProgressStore();
    store.begin('ws-3');
    store.update('ws-3', { phase: 'analyse', rows: 100 });
    const before = store.get('ws-3').overallPercent;
    store.update('ws-3', { stages: ['tokenize'] });
    const after = store.get('ws-3').overallPercent;
    assert.ok(after > before, `${before} -> ${after}`);
  });

  test('proyek tanpa catatan tidak menghasilkan apa pun dan tidak melempar', () => {
    const store = createProgressStore();
    assert.equal(store.get('tidak-ada'), null);
    assert.equal(store.update('tidak-ada', { phase: 'write' }), null);
    assert.equal(store.channel('tidak-ada', { id: 'play', fetched: 1 }), null);
    assert.equal(store.finish('tidak-ada'), null);
  });

  test('catatan kedaluwarsa dibersihkan, tidak menumpuk selamanya', () => {
    let value = 1_000;
    const now = () => value;
    const store = createProgressStore({ ttlMs: 1000, now });
    store.begin('ws-4');
    assert.equal(store.size(), 1);
    value += 5_000;
    assert.equal(store.size(), 0, 'progres lama tidak boleh hidup lebih dari ttl-nya');
  });

  test('finish menutup kanal yang masih berjalan menandai selesai', () => {
    const store = createProgressStore();
    store.begin('ws-5');
    store.channel('ws-5', { id: 'play', status: 'running', fetched: 10 });
    store.finish('ws-5', 'done');
    const record = store.get('ws-5');
    assert.equal(record.phase, 'done');
    assert.equal(record.channels[0].status, 'done');
    assert.equal(record.overallPercent, 100);
  });
});
