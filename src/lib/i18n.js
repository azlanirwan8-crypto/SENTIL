import { useSyncExternalStore } from 'react';

import { EN_TO_ID, ID_TO_EN } from './i18n-phrases.js';

// Bahasa antarmuka adalah status modul, bukan status komponen: satu nilai yang dibaca
// langsung oleh t() di mana saja, sehingga tidak perlu meneruskan prop ke seluruh pohon.
// Yang disimpan di peramban hanyalah pilihan bahasa — tidak ada teks yang ikut tersimpan.
const STORAGE_KEY = 'sentil.lang';

// Tabelnya di berkas sendiri (src/lib/i18n-phrases.js) dan dibaca dua arah: antarmuka
// menulis literals Inggris, panel Metode menulis literals Indonesia, jadi kedua arah harus
// bisa dicari. Arah pencarian ditentukan dari bahasa yang sedang aktif.
const toIndonesian = new Map(EN_TO_ID);
const toEnglish = new Map(ID_TO_EN);

function readStoredLanguage() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'id' ? 'id' : 'en';
  } catch {
    // Peramban yang memblokir penyimpanan (mode privat, kebijakan situs) tidak boleh
    // membuat halaman gagal mengimpor: bahasa kembali ke default, bukan melempar.
    return 'en';
  }
}

let language = readStoredLanguage();
const listeners = new Set();

const notify = () => {
  for (const listener of listeners) listener();
};

export function getLanguage() {
  return language;
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setLanguage(next) {
  // Nilai asing diabaikan, tidak dinormalisasi diam-diam ke Inggris: panggilan yang salah
  // ketik tidak boleh memindahkan seluruh dasbor ke bahasa lain di tengah pekerjaan.
  if (next !== 'en' && next !== 'id') return;
  if (next === language) return;
  language = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Pilihan tetap berlaku untuk sesi ini walau tidak tersimpan; fitur lain tidak boleh
    // ikut mati karena satu nilai kenyamanan gagal ditulis.
  }
  notify();
}

// Kalimat yang tidak ada di tabel dikembalikan apa adanya: komponen yang kelewat membungkus
// tetap menampilkan teks aslinya, tidak pernah kosong atau undefined.
export function t(text) {
  if (typeof text !== 'string') return text;
  const table = language === 'id' ? toIndonesian : toEnglish;
  return table.get(text) ?? text;
}

export function useLanguage() {
  return useSyncExternalStore(subscribe, getLanguage);
}

// Kamus topik mengirim dua sebutan untuk satu measured id: `name` (Inggris) dan `nameId`
// (Indonesia). Yang dipilih hanyalah sebutan mana yang ditampilkan — id, jumlah, dan seluruh
// angka tetap datang dari mesin, jadi mengganti bahasa tidak mengubah satu pun hitungan.
export function topicLabel(topic) {
  if (!topic) return '';
  const other = language === 'id' ? topic.nameId : null;
  return other || topic.name || '';
}

// Dua panel (detail peta keluhan dan tabel topik di Metode) sengaja menampilkan kedua sebutan
// sekaligus, karena keduanya itulah bukti bahwa nama tidak dikarang. Yang di bawah tetap
// sebutan bahasa lain — bukan sebutan yang sedang tampil di atas.
export function topicAlias(topic) {
  if (!topic) return '';
  return language === 'id' ? (topic.name || '') : (topic.nameId || '');
}

// Klaster fitur mengirim dua sebutan sebagai sepasang field (`en` dan `id`) alih-alih sebagai
// satu objek topik. Pilihannya sama: sebutan bahasa aktif, dengan bahasa lain tetap bisa
// ditampilkan di sebelahnya. Bahasa lain juga menjadi penolong ketika hanya satu yang lolos
// validasi — baris yang hilang sebagian lebih baik terbaca satu bahasa daripada kosong.
export function bilingual(en, id) {
  return language === 'id' ? (id || en || '') : (en || id || '');
}

// Sebutan bahasa lain dari pasangan di atas, untuk baris audit yang sengaja memperlihatkan
// keduanya berdampingan.
export function bilingualAlias(en, id) {
  return language === 'id' ? (en || '') : (id || '');
}
