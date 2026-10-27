import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

// Rasa berat saat membuat dan menghapus project hampir seluruhnya urutan permintaan, bukan
// besarnya data: layar membeku menunggu cascade server, sempat menampilkan "belum ada snapshot"
// di tengah permintaan yang sedang jalan, dan membaca korpus project berikutnya baru setelah
// penghapusan dikonfirmasi. Semua itu diukur dari berkas sumber, jadi ia dijaga oleh pengujian
// dan bukan oleh ingatan.
const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const OVERVIEW = readFileSync(new URL('../src/components/Overview.jsx', import.meta.url), 'utf8');
const KPI = readFileSync(new URL('../src/components/KpiRow.jsx', import.meta.url), 'utf8');

// Isi satu fungsi async di tingkat atas berkas: dari namanya sampai kurung tutup yang seimbang.
function body(name) {
  const start = APP.indexOf(`async function ${name}(`);
  assert.ok(start >= 0, `${name} tidak ditemukan di src/App.jsx`);
  const open = APP.indexOf('{', start);
  let depth = 0;
  for (const [index, char] of [...APP].entries()) {
    if (index < open) continue;
    if (char === '{') depth += 1;
    else if (char === '}' && (depth -= 1) === 0) return APP.slice(open, index + 1);
  }
  throw new Error(`kurung tidak seimbang di ${name}`);
}

const firstAwait = text => text.indexOf('await ');

describe('alur project terasa ringan', () => {
  test('hapus: layar pindah seketika, permintaan hapus berjalan di latar', () => {
    const text = body('handleDelete');
    const wait = firstAwait(text);
    assert.ok(wait > 0, 'hapus tidak punya permintaan yang bisa ditunggu');
    const request = text.indexOf('deleteWorkspace(target)');
    assert.ok(request >= 0 && request < wait, 'permintaan hapus baru berangkat sesudah ada yang menunggu');
    assert.ok(text.indexOf('applyWorkspaces(kept)') < wait, 'daftar project berubah setelah jawaban server, bukan seketika');
    assert.ok(text.indexOf('setConfirmOpen(false)') < wait, 'dialog konfirmasi tetap terbuka menunggu cascade');
  });

  test('hapus: bacaan project berikutnya berangkat bersamaan, kerangkanya dilepas saat tiba', () => {
    const text = body('handleDelete');
    const read = text.indexOf('loadDataset(nextActive)');
    assert.ok(read > text.indexOf('deleteWorkspace(target)'), 'bacaan berikutnya menyusul setelah hapus berangkat');
    assert.ok(read < firstAwait(text), 'pembacaan korpus baru dimulai setelah ada yang ditunggu');
    assert.match(text, /nextLoad\.then\(/, 'hasil bacaan tidak dipakai sebelum dikonfirmasi');
    assert.ok(
      text.indexOf('setLoadingDataset(false)') < firstAwait(text),
      'kerangka loading dilepas setelah jawaban hapus, jadi layar skeleton menahan orang walau datanya sudah ada',
    );
  });

  test('hapus: yang gagal dikembalikan apa adanya', () => {
    const text = body('handleDelete');
    assert.match(text, /if \(!target \|\| deletingRef\.current\) return/, 'klik kedua mengirim permintaan hapus yang sama dua kali');
    const failed = text.slice(text.indexOf('if (result.deleted)'));
    assert.match(failed, /applyWorkspaces\(previous\)/, 'hapus yang gagal membiarkan project hilang dari daftar');
    assert.match(failed, /Delete not confirmed/, 'hapus yang gagal tidak dilaporkan ke layar');
    assert.match(failed, /switchWorkspace\(target\)/, 'project terakhir yang gagal dihapus tidak bisa dibuka lagi');
  });

  test('buat: layar progres langsung dipasang sebelum baris project ditulis', () => {
    const text = body('handleCreate');
    assert.ok(
      text.indexOf('setStartingId(workspace.id)') < firstAwait(text),
      'selama baris project ditulis, yang muncul adalah layar "belum ada snapshot" yang bukan kebenaran',
    );
    assert.match(APP, /startingId === activeWorkspace\.id/, 'penanda project yang sedang disiapkan tidak dibaca di tempat menampilkan');
    assert.ok(
      text.indexOf('runSync(workspace') < text.indexOf('setStartingId(null)'),
      'penanda dilepas sebelum penarikan dimulai, jadi layarnya bisa berkedip',
    );
  });

  test('daftar project tidak ditimpa polling di tengah mutasi', () => {
    // Polling state yang mendarat antara "project baru sudah di layar" dan "barisnya diterima
    // database" menghilangkan project baru itu sesaat — dan yang sedang dihapus bisa muncul lagi.
    assert.match(APP, /syncingRef\.current \|\| deletingRef\.current \|\| startingIdRef\.current/,
      'polling daftar project tidak ditahan selama create atau delete berjalan');
  });

  test('pindah project: kerangka loading dilepas walau hasilnya sudah basi', () => {
    const text = body('switchWorkspace');
    assert.ok(
      text.indexOf('setLoadingDataset(false)') < text.indexOf('if (activeIdRef.current !== id) return;'),
      'pindah project cepat meninggalkan layar loading kalau hasilnya dibuang sebelum kerangkanya dilepas',
    );
  });
});

describe('dasbor punya gerak masuk', () => {
  test('panel berpindah menu diperkenalkan dengan fade', () => {
    assert.match(APP, /key=\{view\}[\s\S]{0,160}animate-fade-in/, 'panel tidak dipaksa mounts ulang saat menu berganti, jadi tidak ada gerak');
  });

  test('kartu indikator dan grid chart muncul beriringan', () => {
    assert.match(KPI, /className="card reveal-group/);
    assert.match(OVERVIEW, /reveal-group grid gap-3/);
    assert.match(CSS, /\.reveal-group > \*\s*\{[^}]*animation:\s*reveal-in/, 'iringan tidak didefinisikan di index.css');
    assert.match(CSS, /@keyframes reveal-in/, 'keyframe reveal-in tidak ada');
  });

  test('iringan dibatasi supaya tidak jadi atraksi', () => {
    // Enam langkah, puncak 225ms: cukup untuk membaca urutan, terlalu pendek untuk menunggu.
    const delays = [...CSS.matchAll(/animation-delay:\s*(\d+)ms/g)].map(match => Number(match[1]));
    assert.deepEqual(delays, [45, 90, 135, 180, 225], 'iringan blok berubah dari yang diukur');
    assert.ok(Math.max(...delays) <= 250, 'iringan terakhir sudah terlalu lama untuk laporan data');
    const duration = /\.reveal-group > \*\s*\{[^}]*animation:\s*reveal-in\s+([\d.]+)s/.exec(CSS);
    assert.ok(duration && Number(duration[1]) <= 0.35, `lama reveal ${duration?.[1]}s terlalu panjang`);
  });

  test('gerak hormat pada prefers-reduced-motion', () => {
    // Aturan global meredam durasi animasi apa pun; reveal tidak boleh jadi pengecualian.
    assert.match(CSS, /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,160}animation-duration:\s*0\.001ms !important/);
    assert.equal(/\.reveal-group[^\n]*\{[^}]*animation-iteration-count/.test(CSS), false);
  });
});
