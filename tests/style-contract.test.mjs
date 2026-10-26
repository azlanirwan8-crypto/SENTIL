import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test, { describe } from 'node:test';

// Kontrak rasa produk. Semua aturan di bawah bisa diukur dari berkas sumber, jadi ia dijaga
// oleh pengujian dan bukan oleh ingatan: yang berubah hanyalah kode, dan setiap penurunan
// kualitas terlihat di CI alih-alih di layar seseorang yang sedang membaca laporan.
const CSS = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const COMPONENTS = readdirSync(new URL('../src/components', import.meta.url)).filter(name => name.endsWith('.jsx'));
const sources = [
  readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8'),
  readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8'),
  ...COMPONENTS.map(name => readFileSync(new URL(`../src/components/${name}`, import.meta.url), 'utf8')),
  HTML,
].join('\n');

const customClasses = () => [...CSS.matchAll(/^\s{2,}\.([a-z][a-z0-9-]*)\s*(?:::[a-z-]+)?\s*\{/gm)].map(match => match[1]);

describe('kontras teks pada permukaan gelap', () => {
  // Kartu memakai bg-slate-900 (#0f172a, luminansi 0,0089). slate-400 (#94a3b8) mencapai
  // 6,9:1 dan lolos AA untuk teks 10–12px; slate-500 hanya 3,7:1 dan slate-600 2,4:1 —
  // di densitas laporan ini keduanya adalah teks yang tidak bisa dibaca orang.
  test('tidak ada kelas teks yang jatuh di bawah AA pada permukaan kartu', () => {
    for (const banned of ['text-slate-500', 'text-slate-600', 'text-slate-700']) {
      assert.equal(sources.includes(banned), false, `${banned} tidak lolos 4,5:1 di atas bg-slate-900`);
    }
  });

  test('teks gelap hanya dipakai di atas permukaan terang', () => {
    // Teks 900/950 sah — bahkan perlu — di atas chip cyan/violet dan tombol primer, dan di
    // sanalah kontrasnya terbalik. Yang tidak boleh adalah teks gelap di atas kartu gelap.
    const offenders = sources.split(/\r?\n/).filter(line => /text-slate-(900|950)/.test(line) && !/\bbg-(slate-100|white|accent|play|appstore|pos|neu|neg)\b/.test(line));
    assert.deepEqual(offenders, [], `${offenders.length} baris menulis teks gelap tanpa latar terang`);
  });
});

describe('kebersihan CSS dan aset', () => {
  test('setiap kelas yang didefinisikan di index.css benar-benar dipakai', () => {
    const names = [...new Set(customClasses())];
    assert.ok(names.length >= 20, `daftar kelas terlalu pendek: ${names.join(',')}`);
    for (const name of names) {
      assert.match(sources, new RegExp(`\\b${name.replace(/-/g, '\\-')}\\b`), `.${name} tidak dipakai di mana pun`);
    }
  });

  test('tidak ada nama kelas lama yang masih tersisa di stylesheet', () => {
    for (const dead of ['card-flush', 'grid-lines-y', 'chart-node']) {
      assert.equal(CSS.includes(dead), false, `${dead} adalah kelas mati`);
    }
  });

  test('setiap berkas font yang dikirim punya pemakai di stylesheet atau halaman', () => {
    const fonts = readdirSync(new URL('../assets/fonts', import.meta.url)).filter(name => name.endsWith('.woff2'));
    assert.ok(fonts.length >= 1);
    const declared = [...CSS.matchAll(/url\('\/assets\/fonts\/([^']+)'\)/g)].map(match => match[1]);
    const preloaded = [...HTML.matchAll(/\/assets\/fonts\/([^"']+\.woff2)/g)].map(match => match[1]);
    for (const file of fonts) {
      assert.equal(declared.includes(file), true, `${file} diunduh tetapi tidak pernah dideklarasikan @font-face`);
      assert.equal(preloaded.includes(file), true, `${file} dipakai tetapi tidak di-preload, jadi teks menggambar ulang`);
    }
    assert.equal(fonts.length, 1, 'satu wajah font cukup; setiap wajah tambahan adalah byte yang dibayar pembaca');
  });

  test('stack font hanya menyebut wajah yang benar-benar dimuat', () => {
    const config = readFileSync(new URL('../tailwind.config.js', import.meta.url), 'utf8');
    const sans = /sans: \[([^\]]+)\]/.exec(config)?.[1] || '';
    const generic = ['system-ui', 'sans-serif', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas'];
    for (const raw of sans.split(',')) {
      const name = raw.trim().replace(/^['"]|['"]$/g, '');
      if (generic.includes(name)) continue;
      assert.match(CSS, new RegExp(`font-family: '${name}'`), `${name} dijanjikan di stack tetapi tidak pernah dimuat`);
    }
  });
});

describe('gerakan dan tabel', () => {
  test('prefers-reduced-motion menutup animasi yang berulang tanpa membuat Hilang', () => {
    const block = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(CSS.split('@layer utilities')[0])?.[1] || '';
    assert.match(CSS, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(CSS, /\.progress-indeterminate::after\s*\{[^}]*animation: none/, 'bilah tak-tentu harus tetap terlihat, bukan diam');
    assert.match(CSS, /\.skeleton::after\s*\{[^}]*animation: none/);
    assert.ok(block.length > 0 || CSS.includes('animation-duration: 0.001ms'), 'aturan global peredaman gerakan masih ada');
  });

  test('setiap tabel punya caption sehingga pembaca layar tahu apa yang dibaca', () => {
    for (const name of COMPONENTS) {
      const source = readFileSync(new URL(`../src/components/${name}`, import.meta.url), 'utf8');
      const tables = source.match(/<table\b/g)?.length || 0;
      if (!tables) continue;
      const captions = source.match(/<caption\b/g)?.length || 0;
      const labelled = source.match(/<table[^>]*aria-label/g)?.length || 0;
      assert.ok(captions + labelled >= tables, `${name}: ${tables} tabel tetapi hanya ${captions + labelled} yang punya judul`);
    }
  });

  test('bilah progres adalah primitif ber-ARIA, bukan div telanjang yang disalin', () => {
    const progress = readFileSync(new URL('../src/components/Progress.jsx', import.meta.url), 'utf8');
    assert.match(progress, /role="progressbar"/);
    assert.match(progress, /aria-busy="true"/);
    assert.match(progress, /aria-label/, 'progressbar tanpa nama tidak announce apa pun');
    // Yang dilarang adalah atributnya, bukan komentar yang menjelaskan mengapa atribut
    // itu tidak ada.
    assert.equal(/aria-valuenow=/.test(progress), false, 'progresnya tidak diketahui; angka palsu lebih buruk daripada tanpa angka');
    const inline = COMPONENTS.filter(name => !name.startsWith('Progress')).filter(name => {
      const source = readFileSync(new URL(`../src/components/${name}`, import.meta.url), 'utf8');
      return source.includes('progress-indeterminate');
    });
    assert.deepEqual(inline, [], 'bilah progres tidak boleh ditulis ulang per komponen');
  });
});
