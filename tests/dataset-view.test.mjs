import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { projectDataset } from '../lib/dataset-view.mjs';

const FULL_ROW = {
  id: 'play-1',
  platform: 'play',
  author: 'Rina',
  title: 'Lemot',
  text: 'terus gagal verifikasi sidik jari',
  rating: 2,
  date: '2026-10-01',
  publishedAt: '2026-10-01T00:00:00.000Z',
  sourceUrl: 'https://play.google.com/store/apps/details?id=com.tes',
  store: 'Google Play',
  language: 'id',
  meta: { appVersion: '3.1.0', via: 'play-page', helpfulCount: 7 },
  analysis: {
    sentiment: 'negative',
    score: -0.6123,
    language: 'id',
    topics: ['biometric_login', 'reliability'],
    topicNames: ['Biometric login', 'Reliability'],
    topicClusters: ['authentication', 'reliability'],
    primaryTopic: 'biometric_login',
    topicTriggers: { biometric_login: ['sidik jari'] },
    listingTerms: ['verifikasi'],
    matchedTerms: [
      { term: 'gagal', weight: -1.4 },
      { term: 'lemot', weight: -1.1 },
      { term: 'verifikasi', weight: -0.9 },
      { term: 'sidik', weight: -0.7 },
      { term: 'jari', weight: -0.6 },
      { term: 'terus', weight: -0.5 },
    ],
  },
};

function datasetWith(reviews) {
  return {
    entity: 'aud',
    fetchedAt: '2026-10-02T00:00:00.000Z',
    engine: { version: 'corpus-rating-v3' },
    model: { version: 'corpus-rating-v3', nss: -12, topics: [{ id: 'biometric_login', name: 'Biometric login' }] },
    summary: { reviews: reviews.length, analyzed: reviews.length, unclassified: 0 },
    channels: [{ id: 'play', status: 'success', fetched: reviews.length }],
    reviews,
  };
}

describe('proyeksi baca dataset', () => {
  test('membawa setiap bidang yang dibaca layar', () => {
    const row = projectDataset(datasetWith([FULL_ROW])).reviews[0];
    assert.equal(row.id, 'play-1');
    assert.equal(row.platform, 'play');
    assert.equal(row.author, 'Rina');
    assert.equal(row.rating, 2);
    assert.equal(row.date, '2026-10-01');
    assert.equal(row.publishedAt, '2026-10-01T00:00:00.000Z');
    assert.equal(row.text, 'terus gagal verifikasi sidik jari');
    assert.equal(row.meta.appVersion, '3.1.0');
    assert.equal(row.analysis.sentiment, 'negative');
    assert.equal(row.analysis.score, -0.6123);
    assert.equal(row.analysis.language, 'id');
    assert.deepEqual(row.analysis.topics, ['biometric_login', 'reliability']);
    assert.deepEqual(row.analysis.topicNames, ['Biometric login', 'Reliability']);
  });

  test('membuang kolom yang tidak pernah dibaca layar', () => {
    const row = projectDataset(datasetWith([FULL_ROW])).reviews[0];
    assert.equal('sourceUrl' in row, false, 'url promosi ke peta per kanal');
    assert.equal(row.store, undefined);
    assert.equal(row.language, undefined);
    assert.equal(row.meta.via, undefined);
    assert.equal(row.meta.helpfulCount, undefined);
    assert.equal(row.analysis.topicClusters, undefined);
    assert.equal(row.analysis.primaryTopic, undefined);
    assert.equal(row.analysis.topicTriggers, undefined);
    assert.equal(row.analysis.listingTerms, undefined);
  });

  test('matchedTerms dipangkas sampai yang ditampilkan kartu', () => {
    const row = projectDataset(datasetWith([FULL_ROW])).reviews[0];
    assert.equal(row.analysis.matchedTerms.length, 5);
    assert.deepEqual(row.analysis.matchedTerms.map(entry => entry.term), ['gagal', 'lemot', 'verifikasi', 'sidik', 'jari']);
  });

  test('baris tanpa analisis dan tanpa meta tetap utuh dan tidak melempar', () => {
    const row = projectDataset(datasetWith([{ id: 'x', platform: 'news', text: 'berita' }])).reviews[0];
    assert.equal(row.analysis, null);
    assert.equal(row.meta, null);
    assert.equal(row.text, 'berita');
    assert.equal(row.title, null, 'bidang yang hilang menjadi null, bukan hilang, supaya kunci baris seragam');
  });

  test('satu url per kanal, bukan per baris', () => {
    const projected = projectDataset(datasetWith([
      { ...FULL_ROW, id: 'play-1' },
      { ...FULL_ROW, id: 'play-2' },
      { ...FULL_ROW, id: 'app-1', platform: 'appstore', sourceUrl: 'https://apps.apple.com/id/app/id12345' },
      { ...FULL_ROW, id: 'r-1', platform: 'reddit', sourceUrl: null },
    ]));
    assert.deepEqual(projected.sourceUrls, {
      play: 'https://play.google.com/store/apps/details?id=com.tes',
      appstore: 'https://apps.apple.com/id/app/id12345',
    });
  });

  test('bidang di luar reviews dikirim apa adanya', () => {
    const source = datasetWith([FULL_ROW]);
    const projected = projectDataset(source);
    assert.equal(projected.model, source.model);
    assert.equal(projected.summary, source.summary);
    assert.equal(projected.channels, source.channels);
    assert.equal(projected.entity, 'aud');
    assert.equal(projected.fetchedAt, source.fetchedAt);
  });

  test('tidak mengubah dataset aslinya — penyimpanan tetap menyimpan penuh', () => {
    const source = datasetWith([FULL_ROW]);
    projectDataset(source);
    assert.equal(source.reviews[0].sourceUrl, FULL_ROW.sourceUrl);
    assert.equal(source.reviews[0].store, 'Google Play');
    assert.equal(source.reviews[0].analysis.primaryTopic, 'biometric_login');
    assert.equal(source.reviews[0].analysis.matchedTerms.length, 6);
  });

  test('dataset kosong atau tanpa reviews diteruskan apa adanya', () => {
    assert.equal(projectDataset(null), null);
    const headOnly = { entity: 'aud', summary: { reviews: 0 } };
    assert.equal(projectDataset(headOnly), headOnly);
  });
});
