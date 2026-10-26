import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import {
  DOMAIN_CLUSTERS,
  TAXONOMY_VERSION,
  TOPICS,
  TOPIC_BY_ID,
  clusterName,
  clusterOf,
  isJunkTerm,
  matchTopics,
  primaryTopic,
} from '../lib/domain-taxonomy.mjs';
import { analyzeCorpus } from '../lib/corpus-engine.mjs';

describe('kamus topik domain dua bahasa', () => {
  test('setiap topik punya nama Inggris, nama Indonesia, dan klaster yang terdaftar', () => {
    assert.equal(TAXONOMY_VERSION, 'domain-topic-v1');
    assert.ok(TOPICS.length >= 20, 'kamus harus menutup domain fintech/merchant, bukan beberapa kata saja');
    const ids = new Set();
    for (const topic of TOPICS) {
      assert.ok(!ids.has(topic.id), `id topik ganda: ${topic.id}`);
      ids.add(topic.id);
      assert.match(topic.label, /^\[[^\d\]]{3,}\]$/, `${topic.id}: nama tampilannya kurung siku tanpa angka`);
      assert.match(topic.labelId, /^\[[^\d\]]{3,}\]$/, `${topic.id}: nama Indonesia juga kurung siku`);
      assert.ok(DOMAIN_CLUSTERS[topic.cluster], `${topic.id}: klaster harus ada`);
      assert.equal(isJunkTerm(topic.label), false, `${topic.id}: nama tidak boleh kata tugas`);
      assert.equal(isJunkTerm(topic.labelId), false, `${topic.id}: nama Indonesia tidak boleh kata tugas`);
      assert.ok(topic.terms.length >= 2, `${topic.id}: butuh lebih dari satu istilah`);
      assert.equal(TOPIC_BY_ID.get(topic.id), topic);
      assert.equal(clusterOf(topic.id), topic.cluster);
    }
    for (const cluster of Object.values(DOMAIN_CLUSTERS)) {
      assert.ok(cluster.en && cluster.id, 'tiap klaster punya dua nama');
    }
    assert.equal(clusterName('authentication', 'id'), DOMAIN_CLUSTERS.authentication.id);
    assert.equal(clusterName('authentication', 'en'), DOMAIN_CLUSTERS.authentication.en);
    assert.equal(clusterName('tidak-ada', 'en'), null);
  });

  test('topik yang sama dikenali dari bahasa Indonesia dan bahasa Inggris', () => {
    const id = matchTopics('blum ada sidik jari, harus pake pasword terus');
    assert.ok(id.some(entry => entry.topic.id === 'biometric_login'), 'sidik jari dikenali');
    assert.ok(id.some(entry => entry.topic.id === 'password_pin'), 'pasword dikenali');
    const en = matchTopics('the fingerprint login does not work and it asks for a password every time');
    assert.ok(en.some(entry => entry.topic.id === 'biometric_login'), 'fingerprint dikenali');
    assert.ok(en.some(entry => entry.topic.id === 'login_access'), 'login dikenali');
    assert.ok(primaryTopic(en).topic.id === 'biometric_login', 'yang paling spesifik jadi label utama');
    assert.deepEqual(matchTopics(''), []);
    assert.deepEqual(matchTopics('   '), []);
  });

  test('istilah yang lebih panjang tidak dihitung ganda sebagai potongan pendeknya', () => {
    const matches = matchTopics('verifikasi wajah saya gagal, sidik jari juga hilang');
    const ids = matches.map(entry => entry.topic.id);
    assert.ok(ids.includes('face_verification'));
    assert.ok(ids.includes('biometric_login'));
    assert.equal(ids.includes('kyc_verification'), false, 'verifikasi data adalah istilah lain, bukan potongan');
  });

  test('kata tugas dan nama berangka selalu ditolak', () => {
    for (const junk of ['harus', 'pake', 'tdk', 'dan', 'yang', 'the', 'my', 'untuk', 'banget', 'sekali', 'transaksinya', 'apun', '12 ulasan', 'login 2x', '']) {
      assert.equal(isJunkTerm(junk), true, `"${junk}" harus ditolak sebagai nama kategori`);
    }
    for (const real of ['QRIS Payments', 'mutasi rekening', 'Login & Session Access', 'saldo tidak muncul']) {
      assert.equal(isJunkTerm(real), false, `"${real}" adalah istilah fitur`);
    }
  });

  test('ulasan yang hanya berisi kata tugas tidak mendapat label apa pun', () => {
    const { model } = analyzeCorpus([
      { id: 'a', platform: 'play', rating: 1, text: 'dan yang harus pake tdk untuk dengan', publishedAt: '2026-05-01T00:00:00.000Z' },
      { id: 'b', platform: 'play', rating: 5, text: 'the of and but for very too', publishedAt: '2026-05-02T00:00:00.000Z' },
    ]);
    assert.deepEqual(model.topics, [], 'tidak ada istilah domain yang boleh dipaksa dari kata tugas');
    assert.equal(model.taxonomy.unmatchedReviews, 2);
    assert.equal(model.topics.some(topic => isJunkTerm(topic.name)), false);
  });

  test('label per ulasan menempel pada baris dan namanya selalu milik kamus', () => {
    const { rows, model } = analyzeCorpus([
      { id: 'a', platform: 'play', rating: 1, text: 'gak bisa login pakai sidik jari setelah update', publishedAt: '2026-05-01T00:00:00.000Z' },
      { id: 'b', platform: 'appstore', rating: 2, text: 'laporan mutasi tidak bisa diunduh dan saldo tidak tampil', publishedAt: '2026-05-02T00:00:00.000Z' },
      { id: 'c', platform: 'play', rating: 5, text: 'pembayaran qris cepat sekali', publishedAt: '2026-05-03T00:00:00.000Z' },
    ], { listing: 'Aplikasi Tes mempercepat transaksi QRIS dan laporan mutasi.' });
    const [a, b, c] = rows;
    assert.deepEqual(a.analysis.topics, ['biometric_login', 'login_access', 'update_regression']);
    assert.equal(a.analysis.primaryTopic, 'biometric_login');
    assert.equal(a.analysis.topicNames[0], '[Biometric Login]');
    assert.deepEqual(a.analysis.topicClusters, ['authentication', 'reliability']);
    assert.deepEqual(a.analysis.topicTriggers.biometric_login, ['sidik jari']);
    assert.ok(b.analysis.topics.includes('statement_report'), 'laporan dikenali');
    assert.ok(b.analysis.topics.includes('balance_display'), 'saldo dikenali');
    assert.ok(c.analysis.topics.includes('qris_payment'), 'QRIS dikenali di ulasan pujian juga');
    for (const row of rows) {
      for (const id of row.analysis.topics) {
        assert.ok(TOPIC_BY_ID.get(id), `baris tidak boleh membawa id di luar kamus: ${id}`);
        assert.ok(model.topics.some(topic => topic.id === id), 'setiap label baris ada di daftar model');
      }
      // Bukti halaman toko dipisah dari label yang tampil.
      assert.ok(Array.isArray(row.analysis.listingTerms));
    }
  });
});
