import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { EN_TO_ID, ID_TO_EN } from '../src/lib/i18n-phrases.js';
import { bilingual, bilingualAlias, getLanguage, setLanguage, t, topicAlias, topicLabel } from '../src/lib/i18n.js';

const SRC = fileURLToPath(new URL('../src', import.meta.url));
const walk = dir => readdirSync(dir, { withFileTypes: true })
  .flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);

// Sumber kebenaran lapisan bahasa: setiap literal yang dipakai komponen harus ADA di tabel.
// Kalau tidak, layar menampilkan campuran dua bahasa dan tidak ada yang tahu — kegagalan
// yang justru tidak bisa dilihat dari tes manual satu bahasa saja.
const literals = file => {
  const source = readFileSync(file, 'utf8');
  const found = [];
  const re = /\bt\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|(`[^`]*`))/g;
  let match;
  while ((match = re.exec(source))) {
    // Komentar yang menyebut t('...') sebagai contoh bukan panggilan sungguhan.
    const lineStart = source.lastIndexOf('\n', match.index) + 1;
    if (source.slice(lineStart, match.index).includes('//')) continue;
    if (match[3]) throw new Error(`${file}: t() dipanggil dengan template literal — tabel mencari teks persis`);
    const raw = match[1] ?? match[2];
    found.push(raw.replace(/\\(['"\\])/g, '$1'));
  }
  return found;
};

test('setiap literal t() di antarmuka punya baris di tabel frasa', () => {
  const en = new Map(EN_TO_ID);
  const id = new Map(ID_TO_EN);
  const checked = [];
  for (const file of walk(SRC)) {
    if (!/\.[jt]sx?$/.test(file)) continue;
    if (file.endsWith(path.join('lib', 'i18n.js')) || file.endsWith(path.join('lib', 'i18n-phrases.js'))) continue;
    for (const literal of literals(file)) checked.push({ literal, file });
  }
  assert.ok(checked.length > 500, `pemindaian harus menemukan seluruh literal, dapat ${checked.length}`);
  const missing = checked.filter(({ literal }) => !en.has(literal) && !id.has(literal));
  assert.deepEqual(missing, [], `${missing.length} literal belum diterjemahkan: ${JSON.stringify(missing.slice(0, 8))}`);
});

// Nilai peta label yang dirender lewat t(variabel): tahap analisis, fase, platform, sentimen,
// jenis sinyal, badge kecocokan, status kanal. Bentuknya `key: 'x'`, `key: ['x', 'class']`, dan
// `key: { label: 'x', tone: 'class' }` — kelas Tailwind dan warna hex bukan teks tampilan.
const CSS_TOKEN = /^#(?:[0-9a-f]{3,8})$/i;
const CLASS_LIKE = /^(?:hover:|group-hover:|sm:|md:|lg:)?[a-z-]*(?:border|text|bg|rounded|px|py|font|min|h|w|gap|grid|flex|opacity|shadow|animate|tracking|leading|items|justify)-/;
const TONE_NAME = /^(?:pos|neg|neu|slate|accent|info|warning|danger)$/;
const MAP_LABEL = /(?:LABEL|LABELS|TITLES|STATUSES|NAMES|AREAS|BADGES|KINDS|OVERALL|STATES)$/;

// Peta label yang dirender lewat t(VARIABEL) tidak terlihat oleh pemindaian t('literal'), padahal
// string inilah yang muncul di layar: tahap analisis, fase, platform, sentimen, jenis sinyal,
// badge kecocokan, status kanal. Isinya ada tiga bentuk — `key: 'x'`, `key: ['x', 'class']`, dan
// `key: { label: 'x', tone: 'class' }`. Body peta diambil dengan menghitung kurung (bukan pola
// "sampai `};` berikutnya"), karena peta yang ditutup sebaris akan membuat pemotongan naif
// menelan peta setelahnya dan nama petanya jadi salah.
function mapBodies(source) {
  const found = [];
  const re = /^(?:export )?const ([A-Z0-9_]+) = \{/gm;
  let match;
  while ((match = re.exec(source))) {
    let index = re.lastIndex;
    let depth = 1;
    while (index < source.length && depth > 0) {
      const char = source[index];
      if (char === '{') depth += 1;
      else if (char === '}') depth -= 1;
      else if (char === '"' || char === "'" || char === '`') {
        index += 1;
        while (index < source.length && source[index] !== char) {
          if (source[index] === '\\') index += 1;
          index += 1;
        }
      }
      index += 1;
    }
    found.push({ name: match[1], body: source.slice(re.lastIndex, index - 1) });
    re.lastIndex = index;
  }
  return found;
}

// Nilai sebuah peta: semua string literal yang BUKAN kunci. Pemasangan kutip harus dilakukan
// berurutan, bukan lewat pola "string yang tidak diikuti titik dua": untuk baris
// `'rate-limit': 'Source rate limit'` pola itu menyerah dan memasangkan kutip penutup kunci
// dengan kutip pembuka nilai, sehingga yang tertangkap justru `": "` dan teks layar hilang
// tanpa pernah diperiksa.
function mapValues(body) {
  const out = [];
  let i = 0;
  while (i < body.length) {
    const quote = body[i];
    if (quote !== '"' && quote !== "'" && quote !== '`') { i += 1; continue; }
    let j = i + 1;
    let buf = '';
    while (j < body.length && body[j] !== quote) {
      if (body[j] === '\\') { buf += body[j] + body[j + 1]; j += 2; continue; }
      buf += body[j]; j += 1;
    }
    let k = j + 1;
    while (k < body.length && /\s/.test(body[k])) k += 1;
    i = j + 1;
    if (body[k] === ':') continue;
    out.push(buf.replace(/\\(['"`\\])/g, '$1'));
  }
  return out;
}

function labelValues(source) {
  const out = [];
  for (const map of mapBodies(source)) {
    if (!MAP_LABEL.test(map.name)) continue;
    for (const text of mapValues(map.body)) {
      if (!/[A-Za-z\u00c0-\u024f]/.test(text) || CSS_TOKEN.test(text) || CLASS_LIKE.test(text) || TONE_NAME.test(text)) continue;
      out.push({ name: map.name, text });
    }
  }
  return out;
}

test('nilai peta label yang dirender lewat t(variabel) juga ada di tabel', () => {
  const en = new Map(EN_TO_ID);
  const id = new Map(ID_TO_EN);
  const missing = [];
  let checked = 0;
  for (const file of [...walk(SRC), 'lib/limit-monitor.mjs', 'lib/channels.mjs']) {
    if (!/\.[jt]sx?$/.test(file) || file.includes('i18n')) continue;
    const source = readFileSync(file.startsWith('lib') ? path.join('.', file) : file, 'utf8');
    for (const { name, text } of labelValues(source)) {
      checked += 1;
      if (!en.has(text) && !id.has(text)) missing.push(`${name}: ${text}`);
    }
  }
  assert.ok(checked > 40, `peta label harus ikut terperiksa, dapat ${checked}`);
  assert.deepEqual(missing, [], `nilai peta label belum diterjemahkan: ${missing.join(' | ')}`);
});

test('satu kunci tidak punya dua terjemahan', () => {
  const build = rows => {
    const seen = new Map();
    const clashes = [];
    for (const [key, value] of rows) {
      if (seen.has(key) && seen.get(key) !== value) clashes.push(key);
      seen.set(key, value);
    }
    return clashes;
  };
  assert.deepEqual(build(EN_TO_ID), [], 'dua terjemahan Indonesia untuk satu kalimat Inggris yang sama');
  assert.deepEqual(build(ID_TO_EN), [], 'dua terjemahan Inggris untuk satu kalimat Indonesia yang sama');
});

test('t() membaca dua arah mengikuti bahasa aktif', () => {
  assert.equal(getLanguage(), 'en', 'tanpa peramban bahasa default Inggris, bukan gagal impor');
  // Panel Metode ditulis dalam bahasa Indonesia, jadi mode Inggris harus bisa membaliknya.
  const fromIndonesian = ID_TO_EN[0];
  assert.equal(t(fromIndonesian[0]), fromIndonesian[1], 'mode Inggris menerjemahkan literal Indonesia panel Metode');
  setLanguage('id');
  assert.equal(t('reviews'), 'ulasan');
  assert.equal(t(fromIndonesian[0]), fromIndonesian[0], 'literal Indonesia dibiarkan apa adanya di mode Indonesia');
  setLanguage('en');
  assert.equal(t('reviews'), 'reviews');
});

test('kalimat di luar tabel ditampilkan apa adanya, bukan hilang', () => {
  setLanguage('id');
  assert.equal(t('a sentence nobody registered'), 'a sentence nobody registered');
  assert.equal(t(undefined), undefined);
  setLanguage('en');
});

test('topicLabel memilih sebutan kamus sesuai bahasa, tanpa menambah apa pun', () => {
  const topic = { name: 'Balance Display', nameId: 'Tampilan Saldo' };
  setLanguage('id');
  assert.equal(topicLabel(topic), 'Tampilan Saldo');
  setLanguage('en');
  assert.equal(topicLabel(topic), 'Balance Display');
  assert.equal(topicLabel({ name: 'Only English' }), 'Only English', 'sebutan yang hilang tidak boleh jadi kosong');
  assert.equal(topicLabel(null), '');
});

// Field bahasa Indonesia milik kamus hanya boleh dibaca satu tempat. Kalau komponen boleh
// memilih sendiri, satu panel bisa diam-diam menampilkan nama Inggris di mode Indonesia.
test('sebutan kamus hanya dipilih oleh lib/i18n.js, dan panel yang menampilkannya memakainya', () => {
  const readers = [];
  for (const file of walk(SRC)) {
    if (!/\.[jt]sx?$/.test(file) || file.endsWith(path.join('lib', 'i18n.js'))) continue;
    if (readFileSync(file, 'utf8').includes('nameId')) readers.push(file);
  }
  assert.deepEqual(readers, [], `nameId dibaca langsung di ${readers.join(', ')} — gunakan topicLabel()`);
  for (const name of ['charts/TopicMap.jsx', 'ModelView.jsx', 'PainLabels.jsx', 'ReviewsView.jsx', 'Overview.jsx']) {
    const source = readFileSync(path.join(SRC, 'components', name), 'utf8');
    assert.match(source, /topicLabel\(/, `${name} harus menamai topik lewat topicLabel`);
  }
  const pairs = { name: 'Crash & Error Application', nameId: 'Crash & Error Aplikasi' };
  setLanguage('id');
  assert.equal(topicAlias(pairs), 'Crash & Error Application', 'alias adalah bahasa lain, bukan bahasa aktif');
  assert.equal(bilingual('Authentication', 'Autentikasi'), 'Autentikasi');
  assert.equal(bilingualAlias('Authentication', 'Autentikasi'), 'Authentication');
  setLanguage('en');
  assert.equal(topicAlias(pairs), 'Crash & Error Aplikasi');
  assert.equal(bilingual('Authentication', 'Autentikasi'), 'Authentication');
  assert.equal(bilingualAlias('Authentication', 'Autentikasi'), 'Autentikasi');
});

test('pemilihan bahasa bertahan walau penyimpanan peramban diblokir', () => {
  const before = getLanguage();
  setLanguage('id');
  assert.equal(getLanguage(), 'id', 'pilihan tetap berlaku untuk sesi ini walau localStorage tidak ada');
  setLanguage('polski');
  assert.equal(getLanguage(), 'id', 'nilai asing tidak mengubah bahasa');
  setLanguage(before);
});

test('pengalih bendera terpasang di bilah atas dengan nama yang bisa dibaca', () => {
  const topBar = readFileSync(new URL('../src/components/TopBar.jsx', import.meta.url), 'utf8');
  assert.match(topBar, /setLanguage\('en'\)/);
  assert.match(topBar, /setLanguage\('id'\)/);
  assert.match(topBar, /aria-label=\{t\('Switch to English'\)\}/);
  assert.match(topBar, /aria-label=\{t\('Switch to Indonesian'\)\}/);
  assert.match(topBar, /aria-pressed=\{language === 'id'\}/, 'status aktif harus terbaca oleh screen reader, bukan hanya warna border');
});
