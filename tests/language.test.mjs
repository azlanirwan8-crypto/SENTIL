import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { LANGUAGE_VERSION, detectLanguage, summarizeLanguages } from '../lib/language.mjs';
import { analyzeCorpus } from '../lib/corpus-engine.mjs';

describe('deteksi bahasa dua arah', () => {
  test('versi dan bentuk hasil', () => {
    assert.equal(LANGUAGE_VERSION, 'lang-profile-v1');
    const result = detectLanguage('aplikasi ini lama banget, tidak bisa dipakai');
    assert.equal(result.language, 'id');
    assert.ok(result.id > 0 && result.tokens > 0);
  });

  test('ulasan Indonesia informal dikenali', () => {
    for (const text of [
      'gak bisa login, udah update juga tetep aja lemot',
      'tdk ada notifikasi sama sekali, parah banget',
      'saya sudah daftar dari 3 hari lalu tapi belum ada kabar',
    ]) {
      assert.equal(detectLanguage(text).language, 'id', text);
    }
  });

  test('ulasan Inggris dikenali tanpa memaksa teks Indonesia ke sana', () => {
    assert.equal(detectLanguage('the app keeps crashing every time I try to log in').language, 'en');
    assert.equal(detectLanguage('Very slow and it does not show my balance at all').language, 'en');
    assert.equal(detectLanguage('Terbaik! Saya suka aplikasinya dan sangat membantu sekali').language, 'id');
  });

  test('campuran, bahasa lain, dan teks kosong ditandai apa adanya', () => {
    const mixed = detectLanguage('the verification is very slow, tapi daftar rekeningnya tidak selesai sama sekali');
    assert.equal(mixed.language, 'mixed', 'dua profil kata tugas sama-sama kuat tidak dipaksa satu bahasa');
    assert.equal(detectLanguage(' '.repeat(20)).language, 'unknown');
    assert.equal(detectLanguage('').language, 'unknown');
    assert.equal(detectLanguage('！＄＾＆').language, 'unknown');
  });

  test('kata serapan tidak dihitung sebagai bahasa Inggris', () => {
    const result = detectLanguage('update aplikasi bikin login makin lama, notifikasi juga delay');
    assert.equal(result.language, 'id', 'update/login/notifikasi/dipakai kedua bahasa, tidak boleh memiringkan hasil');
    assert.equal(result.en, 0);
  });

  test('mesin menyimpan bahasa tiap ulasan dan melaporkan distribusinya', () => {
    const { rows, model } = analyzeCorpus([
      { id: 'a', platform: 'play', rating: 1, text: 'gak bisa login lama banget', publishedAt: '2026-05-01T00:00:00.000Z' },
      { id: 'b', platform: 'appstore', rating: 2, text: 'the app is very slow to open', publishedAt: '2026-05-02T00:00:00.000Z' },
      { id: 'c', platform: 'play', rating: 5, text: 'mantap cepat dan aman', publishedAt: '2026-05-03T00:00:00.000Z' },
    ]);
    assert.deepEqual(rows.map(row => row.analysis.language), ['id', 'en', 'id']);
    assert.equal(model.languages.counts.id, 2);
    assert.equal(model.languages.counts.en, 1);
    assert.equal(model.languages.total, rows.length);
    assert.equal(model.languages.counts.id + model.languages.counts.en + model.languages.counts.mixed + model.languages.counts.other + model.languages.counts.unknown, rows.length);
    assert.ok(model.languages.share.id > 60 && model.languages.share.id <= 100);
    assert.equal(model.taxonomy.languages.join(','), 'id,en');
  });

  test('ringkasan bahasa menutup seluruh baris termasuk baris kosong', () => {
    const rows = [
      { language: 'id' },
      { language: 'en' },
      { language: 'mixed' },
      { language: 'other' },
      { language: 'unknown' },
      { language: 'unknown' },
    ];
    const summary = summarizeLanguages(rows);
    assert.equal(summary.total, rows.length);
    assert.equal(Object.values(summary.counts).reduce((sum, value) => sum + value, 0), rows.length);
    assert.equal(summary.counts.unknown, 2);
    assert.equal(summary.share.unknown, 33.33);
  });
});
