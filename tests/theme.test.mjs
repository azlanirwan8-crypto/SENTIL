import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test, describe } from 'node:test';

// Tema hanya bersih kalau kedua sisinya bisa dibaca. Semua angka di bawah dihitung dari token
// yang benar-benar disajikan ke peramban (src/index.css), bukan dari salinan yang diketik ulang
// di berkas ini — kalau seseorang menggeser satu nilai, pengujian ini yang bergerak.
const CSS = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const SERVER = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const VERCEL = readFileSync(new URL('../vercel.json', import.meta.url), 'utf8');
const BOOTSTRAP = readFileSync(new URL('../src/theme-bootstrap.js', import.meta.url), 'utf8');
const THEME = readFileSync(new URL('../src/lib/theme.js', import.meta.url), 'utf8');
const SOURCES = [
  THEME,
  HTML,
  readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8'),
  ...readdirSync(new URL('../src/components', import.meta.url))
    .filter(name => name.endsWith('.jsx'))
    .map(name => readFileSync(new URL(`../src/components/${name}`, import.meta.url), 'utf8')),
  ...readdirSync(new URL('../src/components/charts', import.meta.url))
    .filter(name => name.endsWith('.jsx') || name.endsWith('.js'))
    .map(name => readFileSync(new URL(`../src/components/charts/${name}`, import.meta.url), 'utf8')),
].join('\n');

const block = selector => {
  const start = CSS.indexOf(selector);
  if (start < 0) throw new Error(`blok ${selector} tidak ada`);
  const open = CSS.indexOf('{', start);
  return CSS.slice(open + 1, CSS.indexOf('}', open));
};

// Hanya token warna yang ditagih dua nilai; ukuran tata letak (--topbar-height) memang sama di
// kedua tema.
const isColor = value => /^(\d+\s+\d+\s+\d+|#([0-9a-f]{6})\b)/i.test(value);
const tokens = selector => new Map([...block(selector).matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)]
  .filter(match => isColor(match[2].trim()))
  .map(match => [match[1], match[2].trim()]));

const DARK = tokens(':root');
const LIGHT = tokens("[data-theme='light']");

const rgbOf = value => {
  const triplet = /^(\d+)\s+(\d+)\s+(\d+)$/.exec(value);
  if (triplet) return [Number(triplet[1]), Number(triplet[2]), Number(triplet[3])];
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (!hex) throw new Error(`nilai warna tidak dikenali: ${value}`);
  const n = parseInt(hex[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const luminance = value => rgbOf(value)
  .map(channel => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  })
  .reduce((sum, channel, index) => sum + [0.2126, 0.7152, 0.0722][index] * channel, 0);

const contrast = (a, b) => {
  const one = luminance(a);
  const two = luminance(b);
  const [hi, lo] = one > two ? [one, two] : [two, one];
  return (hi + 0.05) / (lo + 0.05);
};

describe('token dua tema', () => {
  test('setiap token punya nilai di kedua tema', () => {
    const onlyDark = [...DARK.keys()].filter(name => !LIGHT.has(name));
    const onlyLight = [...LIGHT.keys()].filter(name => !DARK.has(name));
    assert.deepEqual(onlyDark, [], `token tanpa nilai tema terang: ${onlyDark.join(', ')}`);
    assert.deepEqual(onlyLight, [], `token tanpa nilai tema gelap: ${onlyLight.join(', ')}`);
  });

  test('setiap langkah palet yang dipakai komponen punya nilai di kedua tema', () => {
    const used = new Set();
    for (const match of SOURCES.matchAll(/\b(?:bg|text|border|ring|divide|fill|decoration|hover:bg|hover:text|hover:border)-(slate|rose)-(\d{2,3})\b/g)) {
      used.add(`${match[1]}-${match[2]}`);
    }
    for (const match of SOURCES.matchAll(/var\(--(slate-\d{2,3}|rose-\d{2,3}|pos|neg|neu|unk|accent|play|appstore|channel-default)\)/g)) {
      used.add(match[1]);
    }
    assert.ok(used.size >= 15, `pemetikan token terlalu sedikit: ${used.size}`);
    const missing = [...used].filter(name => !DARK.has(name) || !LIGHT.has(name));
    assert.deepEqual(missing, [], `dipakai tetapi tidak didefinisikan dua kali: ${missing.join(', ')}`);
  });

  // Cermin ramp adalah aturannya; slot 400 sengaja menyimpang dan penyimpangannya ditulis di CSS.
  test('ramp terang adalah cermin ramp gelap, kecuali slot teks peredam', () => {
    const steps = [50, 100, 200, 300, 500, 600, 700, 800, 900, 950];
    const mirror = { 50: 950, 100: 900, 200: 800, 300: 700, 500: 600, 600: 500, 700: 300, 800: 200, 900: 100, 950: 50 };
    for (const step of steps) {
      assert.equal(
        LIGHT.get(`slate-${step}`),
        DARK.get(`slate-${mirror[step]}`),
        `slate-${step} di tema terang bukan cermin dari slate-${mirror[step]} tema gelap`,
      );
    }
    // Slot 400 adalah satu-satunya yang tidak dicerminkan: teks peredam harus tetap teredam di
    // atas kertas terang, jadi nilainya punya rumus sendiri dan dijaga pengujian kontras.
    assert.notEqual(LIGHT.get('slate-400'), DARK.get('slate-600'), 'slot 400 sengaja bukan cermin');
    assert.notEqual(LIGHT.get('slate-400'), DARK.get('slate-500'), 'slot 400 bukan pula salinan');
  });
});

describe('kontras pada kedua tema', () => {
  // Peran yang sama, dua permukaan: kartu dan halaman. Ambang 4,5:1 dipakai untuk teks kecil
  // (rapat laporan ini 10–12px) dan 3:1 untuk garis/isi grafik.
  const textRoles = [
    ['teks peredam', 'slate-400'],
    ['teks isi', 'slate-300'],
    ['teks kuat', 'slate-200'],
    ['angka utama', 'slate-100'],
    ['judul', 'slate-50'],
    ['sinyal positif', 'pos'],
    ['sinyal negatif', 'neg'],
    ['sinyal netral', 'neu'],
    ['warna interaksi', 'accent'],
    ['teks bahaya', 'rose-300'],
  ];
  const surfaces = [['kartu', 'slate-900'], ['halaman', 'slate-950'], ['dalam', 'slate-800']];

  for (const [theme, table] of [['gelap', DARK], ['terang', LIGHT]]) {
    for (const [role, token] of textRoles) {
      for (const [surfaceName, surfaceToken] of surfaces) {
        const ratio = contrast(table.get(token), table.get(surfaceToken));
        assert.ok(ratio >= 4.5, `${theme}: ${role} di atas ${surfaceName} hanya ${ratio.toFixed(2)}:1, di bawah AA untuk teks 10–12px`);
      }
    }

    // Warna kanal adalah pengelompok dan dipakai sebagai titik/isi, bukan kalimat: ambangnya grafis.
    // Warna kanal dan 'unclassified' adalah pengelompok grafis — titik, bilah, cincin — bukan
    // kalimat, jadi ambangnya 3:1 seperti aturan grafis WCAG.
    for (const channel of ['unk', 'play', 'appstore', 'youtube', 'reddit', 'news', 'facebook', 'instagram', 'tiktok', 'x', 'channel-default']) {
      const ratio = contrast(table.get(channel), table.get('slate-900'));
      assert.ok(ratio >= 3, `${theme}: warna kanal ${channel} di atas kartu hanya ${ratio.toFixed(2)}:1`);
    }
  }

  test('teks gelap hanya dipakai di atas permukaan terang, di kedua tema', () => {
    // Kelas tidak berubah antar tema; yang berubah adalah nilainya. Karena itu aturan lama
    // "jangan tulis teks gelap di kartu gelap" tetap berlaku apa adanya.
    const offenders = SOURCES.split(/\r?\n/).filter(line => /text-slate-(900|950)/.test(line) && !/\bbg-(slate-100|white|accent|play|appstore|pos|neu|neg)\b/.test(line));
    assert.deepEqual(offenders, [], `${offenders.length} baris menulis teks gelap tanpa latar terang`);
  });
});

describe('pemuat tema', () => {
  test('dijalankan sebagai berkas terpisah sebelum gaya sempat menggambar, bukan sebagai skrip inline', () => {
    // CSP aplikasi ini `script-src 'self'`: skrip inline diblokir, jadi bootstrap harus berkas.
    assert.match(HTML, /<script src="\/theme\.js"><\/script>/);
    assert.equal(/<script>(?!\s*<\/script>)/.test(HTML), false, 'tidak boleh ada skrip inline di index.html');
    assert.match(SERVER, /script-src 'self'/);
    assert.equal(SERVER.includes("script-src 'self' 'unsafe-inline'"), false);
    assert.equal(VERCEL.includes("script-src 'self' 'unsafe-inline'"), false);
    assert.match(SERVER, /EXACT_FILES = new Set\(\[[^\]]*'\/theme\.js'/, 'server lokal harus menyajikan /theme.js, kalau tidak tema hanya hidup di produksi');
  });

  test('kunci penyimpanan sama untuk pemuat awal dan modul tema', () => {
    const bootstrapKey = /const KEY = '([^']+)'/.exec(BOOTSTRAP)?.[1];
    const moduleKey = /const STORAGE_KEY = '([^']+)'/.exec(THEME)?.[1];
    assert.ok(bootstrapKey, 'pemuat tidak punya kunci');
    assert.equal(moduleKey, bootstrapKey, `kunci tema berbeda: ${moduleKey} vs ${bootstrapKey}`);
  });

  test('tema hanya menerima dua nilai dan bertahan di penyimpanan', async () => {
    const stored = new Map();
    const applied = [];
    globalThis.window = {
      localStorage: {
        getItem: key => (stored.has(key) ? stored.get(key) : null),
        setItem: (key, value) => stored.set(key, value),
      },
      matchMedia: () => ({ matches: false, addEventListener() {} }),
    };
    globalThis.document = {
      documentElement: { dataset: {}, style: {} },
      head: { querySelector: () => null },
    };
    const theme = await import('../src/lib/theme.js');
    assert.equal(theme.getTheme(), 'dark', 'tanpa pilihan tersimpan, preferensi sistem yang menang');
    theme.setTheme('light');
    assert.equal(theme.getTheme(), 'light');
    assert.equal(document.documentElement.dataset.theme, 'light', 'atribut tema harus menempel di <html>');
    applied.push(document.documentElement.style.colorScheme);
    assert.equal(applied.at(-1), 'light', 'color-scheme ikut berpindah supaya gulir dan form ikut terang');
    theme.setTheme('polski');
    assert.equal(theme.getTheme(), 'light', 'nilai asing diabaikan, tidak dinormalisasi diam-diam');
    theme.toggleTheme();
    assert.equal(theme.getTheme(), 'dark');
    assert.equal(stored.get('sentil.theme'), 'dark');
    delete globalThis.window;
    delete globalThis.document;
  });
});
