import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

// Rasa berat saat membuat dan menghapus project hampir seluruhnya urutan permintaan, bukan
// besarnya data: layar membeku tanpa keterangan, lalu sebentar menampilkan "belum ada snapshot"
// di tengah permintaan yang sedang jalan, lalu membaca korpus project berikutnya setelah
// penghapusan selesai. Semua itu diukur dari berkas sumber, jadi ia tetap terjaga tanpa perlu
// membuka peramban.
const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const CONFIRM = readFileSync(new URL('../src/components/ConfirmDialog.jsx', import.meta.url), 'utf8');

// Isi satu fungsi async di tingkat atas berkas: dari namanya sampai kurung tutup yang seimbang.
function body(name) {
  const start = APP.indexOf(`async function ${name}(`);
  assert.ok(start >= 0, `${name} tidak ditemukan di src/App.jsx`);
  const open = APP.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < APP.length; index += 1) {
    if (APP[index] === '{') depth += 1;
    else if (APP[index] === '}' && (depth -= 1) === 0) return APP.slice(open, index + 1);
  }
  throw new Error(`kurung tidak seimbang di ${name}`);
}

describe('alur project terasa ringan', () => {
  test('hapus: bacaan project berikutnya dimulai bersamaan dengan permintaan hapus', () => {
    const text = body('handleDelete');
    const read = text.indexOf('loadDataset(nextActive)');
    const del = text.indexOf('await deleteWorkspace(target)');
    assert.ok(read >= 0 && del >= 0, 'baik pembacaan awal maupun permintaan hapus harus ada');
    assert.ok(read < del, 'korpus project berikutnya dibaca setelah hapus — itulah jeda yang dilaporkan');
    assert.ok(text.indexOf('await nextLoad') > del, 'hasil bacaan hanya dipakai sesudah server mengonfirmasi');
  });

  test('hapus: kerangka loading memasang sebelum hasilnya dipakai', () => {
    const text = body('handleDelete');
    assert.match(text, /setLoadingDataset\(true\)/, 'tanpa kerangka loading layar sempat menampilkan "belum ada snapshot"');
    assert.ok(
      text.indexOf('setLoadingDataset(true)') < text.indexOf('await nextLoad'),
      'kerangka loading dipasang setelah bacaan selesai, jadi ia tidak pernah terlihat',
    );
  });

  test('hapus: konfirmasi tidak bisa dikirim dua kali dan dialog tidak menipu', () => {
    const text = body('handleDelete');
    assert.match(text, /deletingRef\.current\) return/, 'klik kedua mengirim permintaan hapus yang sama dua kali');
    assert.match(CONFIRM, /onClick=\{onConfirm\} disabled=\{busy\}/, 'tombol hapus tetap bisa dipakai selama permintaan berjalan');
    assert.match(CONFIRM, /dismissible=\{!busy\}/, 'dialog bisa ditutup dengan Esc di tengah penghapusan');
    assert.match(APP, /busy=\{deleting\}/, 'keadaan sibuk tidak diteruskan ke dialog');
    const failed = text.slice(text.indexOf('if (!result.deleted)'), text.indexOf('pushToast(t(\'This workspace'));
    assert.equal(failed.includes('setConfirmOpen(false)'), false, 'hapus yang gagal menutup dialog tanpa memberi tahu apa pun');
  });

  test('hapus: project yang berpindah di tengah permintaan tidak ikut dipindah paksa', () => {
    assert.match(body('handleDelete'), /if \(activeIdRef\.current !== target\) return;/);
  });

  test('buat: layar progres langsung dipasang sebelum baris project ditulis', () => {
    const text = body('handleCreate');
    assert.ok(
      text.indexOf('setStartingId(workspace.id)') < text.indexOf('await saveWorkspace(workspace)'),
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
    // database" menghilangkan project baru itu sesaat — dan yang sudah dihapus bisa muncul lagi.
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
