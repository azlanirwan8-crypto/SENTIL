import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { createSyncService } from '../lib/sync-core.mjs';
import { coreTerms, describeCandidates, filterCandidates, nameTokens, scoreNameMatch } from '../lib/name-match.mjs';

const PLAY = [
  { appId: 'id.bni.wfb', title: 'wondr merchant by BNI', developer: 'PT Bank Negara Indonesia (Persero) Tbk.', ratings: 77 },
  { appId: 'id.bni.wondr', title: 'wondr by BNI', developer: 'PT Bank Negara Indonesia (Persero) Tbk.', ratings: 358647 },
  { appId: 'id.co.bni.merchant', title: 'BNI Merchant', developer: 'PT Bank Negara Indonesia (Persero) Tbk.', ratings: 3200 },
  { appId: 'id.bmri.livinmerchant', title: "Livin' Merchant by Mandiri", developer: 'PT Bank Mandiri (Persero) Tbk', ratings: 41000 },
  { appId: 'com.bca.msb', title: 'Merchant BCA: QRIS & EDC', developer: 'PT Bank Central Asia Tbk.', ratings: 8558 },
  { appId: 'com.shopeepay.merchant.id', title: 'Shopee Partner - QRIS & Food', developer: 'PT. AIRPAY INTERNATIONAL INDONESIA', ratings: 90000 },
  { appId: 'com.ti.bn.nqrmerchantv3', title: 'Nagari QR Merchant', developer: 'PT Bank Nagari', ratings: 500 },
  { appId: 'com.shopeepay.id', title: 'ShopeePay – Dompet Serba Bisa', developer: 'PT. AIRPAY INTERNATIONAL INDONESIA', ratings: 3000000 },
];

const ids = kept => kept.map(candidate => candidate.appId);

describe('tokenisasi nama toko', () => {
  test('mengabaikan tanda baca, kapital, dan aksen', () => {
    assert.deepEqual(nameTokens("Livin' Merchant"), ['livin', 'merchant']);
    assert.deepEqual(nameTokens('Mércanté'), ['mercante']);
    assert.deepEqual(nameTokens('ShopeePay – Dompet Serba Bisa'), ['shopeepay', 'dompet', 'serba', 'bisa']);
  });

  test('kata struktur tidak dipakai sebagai penanda identitas', () => {
    assert.deepEqual(coreTerms('Aplikasi Tes by PT Bank Persero Tbk'), ['tes', 'bank']);
    assert.deepEqual(coreTerms('wondr merchant'), ['wondr', 'merchant']);
    assert.deepEqual(coreTerms('by pt the'), ['by', 'pt', 'the'], 'kembali ke token mentah bila semua kata struktur');
  });
});

describe('penyaringan kandidat yang tidak spesifik', () => {
  test('cari spesifik "Wondr Merchant" hanya menyisakan kandidat wondr merchant', () => {
    const filter = filterCandidates('Wondr Merchant', PLAY);
    assert.equal(filter.mode, 'matched');
    assert.deepEqual(ids(filter.kept), ['id.bni.wfb']);
    assert.equal(filter.kept[0].match.tier, 'exact');
    assert.equal(filter.dropped, PLAY.length - 1);
    for (const noise of ['id.bmri.livinmerchant', 'com.bca.msb', 'com.ti.bn.nqrmerchantv3', 'id.co.bni.merchant', 'id.bni.wondr']) {
      assert.ok(!ids(filter.kept).includes(noise), `${noise} harus tersaring`);
    }
  });

  test('kata umum "Merchant" tetap menampilkan semua aplikasi merchant', () => {
    const filter = filterCandidates('Merchant', PLAY);
    assert.deepEqual(
      ids(filter.kept).sort(),
      ['com.bca.msb', 'com.ti.bn.nqrmerchantv3', 'id.bni.wfb', 'id.co.bni.merchant', 'id.bmri.livinmerchant'].sort(),
    );
    assert.ok(!ids(filter.kept).includes('com.shopeepay.id'), 'ShopeePay dompet tidak memuat kata merchant');
  });

  test('urutan nama tidak mengubah kecocokan dan kandidat persis menang', () => {
    const filter = filterCandidates('Merchant BCA', PLAY);
    assert.deepEqual(ids(filter.kept), ['com.bca.msb']);
    assert.equal(filter.kept[0].match.tier, 'exact');
  });

  test('tanda baca dan varian ejaan tetap cocok', () => {
    const filter = filterCandidates("Livin' Merchant Mandiri", PLAY);
    assert.deepEqual(ids(filter.kept), ['id.bmri.livinmerchant']);
    assert.equal(filter.kept[0].match.missing.length, 0);
  });

  test('kata ekstra dari pengguna menggugurkan kandidat yang tidak memuatnya', () => {
    const filter = filterCandidates('wondr merchant qris', PLAY);
    assert.equal(filter.mode, 'nearest');
    assert.deepEqual(ids(filter.kept), ['id.bni.wfb'], 'hasil terdekat tetap diurutkan paling mirip');
    assert.equal(filter.kept[0].match.tier, 'nearest');
    assert.deepEqual(filter.kept[0].match.missing, ['qris']);
  });

  test('pool tanpa satu pun kecocokan tidak menampilkan hasil tak berelasi', () => {
    const filter = filterCandidates('Gojek', PLAY);
    assert.equal(filter.mode, 'nearest');
    assert.equal(filter.kept.length, 0);
    assert.match(describeCandidates(filter, 'Google Play'), /No Google Play result carries "gojek" in its name/);
  });

  test('kosong tanpa kandidat', () => {
    const filter = filterCandidates('Aplikasi Tes', []);
    assert.equal(filter.mode, 'empty');
    assert.match(describeCandidates(filter, 'App Store'), /The App Store source did not return any app/);
  });

  test('skor memprioritaskan token khas dibanding token yang ada di semua hasil', () => {
    const spread = new Map([['wondr', 2 / PLAY.length], ['merchant', 5 / PLAY.length]]);
    const exact = scoreNameMatch('Wondr Merchant', 'wondr merchant by BNI', spread);
    const partial = scoreNameMatch('Wondr Merchant', 'wondr by BNI', spread);
    assert.equal(exact.tier, 'exact');
    assert.equal(exact.coversAll, true);
    assert.equal(partial.coversAll, false);
    assert.ok(exact.score > partial.score);
    assert.ok(partial.score > 0.5, 'token khas yang cocok tetap dinilai tinggi');
  });

  test('bahasa pesan menyebut jumlah yang disaring', () => {
    const message = describeCandidates(filterCandidates('Wondr Merchant', PLAY), 'Google Play');
    assert.match(message, /1 Google Play candidate\(s\) match "wondr merchant"/);
    assert.match(message, /7 other results were filtered out/);
  });
});

describe('penemuan identitas lewat layanan sinkron', () => {
  const deps = {
    discoverGooglePlay: async () => PLAY,
    discoverAppStore: async () => [
      { appId: '6741567238', title: 'wondr merchant by BNI', developer: 'PT. BANK NEGARA INDONESIA (PERSERO) TBK.', ratings: 17 },
      { appId: '6499518320', title: 'wondr by BNI', developer: 'PT. BANK NEGARA INDONESIA (PERSERO) TBK.', ratings: 358647 },
      { appId: '551587254', title: 'BCA mobile', developer: 'PT. Bank Central Asia Tbk', ratings: 35479 },
    ],
  };

  test('kandidat tak berelasi disaring sebelum sampai ke antarmuka', async () => {
    const service = createSyncService({ deps });
    const result = await service.discover('Wondr Merchant');
    assert.deepEqual(ids(result.play.candidates), ['id.bni.wfb']);
    assert.deepEqual(ids(result.appstore.candidates), ['6741567238']);
    assert.equal(result.play.matchMode, 'matched');
    assert.equal(result.play.matched, 1);
    assert.equal(result.play.filteredOut, PLAY.length - 1);
    assert.equal(result.appstore.filteredOut, 2);
    assert.deepEqual(result.play.searched, ['wondr', 'merchant']);
    assert.equal(result.play.status, 'ok');
  });

  test('kanal yang seluruh kandidatnya tersaring dilaporkan kosong dengan alasan', async () => {
    const service = createSyncService({ deps });
    const result = await service.discover('Wondr Merchant QRIS EDC LUNAS');
    assert.equal(result.play.status, 'empty');
    assert.equal(result.play.candidates.length, 0);
    assert.equal(result.play.matchMode, 'nearest');
    assert.match(result.play.message, /No Google Play result carries/);
  });

  test('cache penemuan tetap memakai kunci nama asli', async () => {
    let calls = 0;
    const service = createSyncService({
      deps: {
        ...deps,
        discoverGooglePlay: async () => {
          calls += 1;
          return PLAY;
        },
      },
    });
    await service.discover('wondr merchant');
    await service.discover('wondr merchant');
    assert.equal(calls, 1);
    await service.discover('wondr merchant', { force: true });
    assert.equal(calls, 2);
  });
});
