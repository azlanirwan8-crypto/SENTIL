import assert from 'node:assert/strict';
import test, { describe, beforeEach } from 'node:test';

import {
  CONFIG_DEFS,
  acceptsConfigSecret,
  configConfiguration,
  configDefinition,
  configRows,
  forgetConfigValue,
  invalidateConfigCache,
  loadConfigValues,
  maskValue,
  mergeConfigEnv,
  validateConfigValue,
  writeConfigValue,
} from '../lib/config-store.mjs';

const SECRET = 'AbcdEfghIjkl0123456789';
const KEY = 'AIzaSyDEMOKEYxxxxxxxxxxxxxxxxxxxxxx';

// Tempat penyimpanan palsu: yang diuji di sini adalah aturan registry & penyatuan environment,
// jadi satu daftar baris sudah cukup sebagai pengganti PostgREST.
function fakeDb(rows = [], { fail = null } = {}) {
  return {
    enabled: true,
    reason: null,
    calls: [],
    async listConfig() {
      if (fail === 'list') throw new Error('the settings table is unreachable');
      return rows;
    },
    async putConfig(name, value) {
      if (fail === 'put') throw new Error('write refused');
      this.calls.push({ op: 'put', name, value });
      rows.push({ name, value, updated_at: '2026-10-28T00:00:00Z' });
    },
    async deleteConfig(name) {
      this.calls.push({ op: 'delete', name });
    },
  };
}

beforeEach(() => {
  invalidateConfigCache();
});

describe('daftar konfigurasi yang boleh disentuh aplikasi', () => {
  test('setiap entri punya label, catatan, kelompok, dan aturan nilainya sendiri', () => {
    for (const def of CONFIG_DEFS) {
      assert.equal(typeof def.name, 'string', 'nama environment harus ada');
      assert.match(def.name, /^[A-Z][A-Z0-9_]*$/, `${def.name}: bukan nama variabel yang sah`);
      assert.equal(typeof def.label, 'string');
      assert.ok(def.label.length > 3, `${def.name}: label layar terlalu pendek`);
      assert.equal(typeof def.note, 'string');
      assert.ok(def.note.length > 20, `${def.name}: catatan tidak menjelaskan apa pun`);
      assert.ok(['analysis', 'social', 'sources', 'timing'].includes(def.group), `${def.name}: kelompok tidak dikenal`);
      assert.equal(typeof def.validate, 'function');
      assert.equal(typeof def.secret, 'boolean');
    }
    assert.equal(new Set(CONFIG_DEFS.map(def => def.name)).size, CONFIG_DEFS.length, 'satu nama tidak boleh terdaftar dua kali');
  });

  test('kunci yang bisa memindahkan basis data atau menyalakan biaya tidak terdaftar', () => {
    // Alasannya bukan kerapian: kalau layar ini bisa menulis SUPABASE_SERVICE_ROLE_KEY,
    // satu permintaan bisa mengarahkan aplikasi ke server lain; APIFY_ALLOWED menyalakan
    // penarikan berbayar; CRON_SECRET membuka jalur penarikan terjadwal.
    const forbidden = [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'CRON_SECRET',
      'QUOTA_KEY_SALT',
      'QUOTA_ENABLED',
      'APIFY_ALLOWED',
      'REFRESH_ALLOW_UNAUTHENTICATED',
      'PORT',
      'SENIL_FUNCTION_SECONDS',
    ];
    for (const name of forbidden) {
      assert.equal(configDefinition(name), null, `${name} tidak boleh bisa ditulis dari aplikasi`);
      assert.equal(CONFIG_DEFS.some(def => def.name === name), false);
    }
  });

  test('kunci Gemini dan kunci kanal sosial memang terdaftar', () => {
    for (const name of ['GEMINI_API_KEY', 'YOUTUBE_API_KEY', 'GOOGLE_API_KEY', 'REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET', 'APIFY_API_TOKEN']) {
      const def = configDefinition(name);
      assert.ok(def, `${name} harus bisa dipasang dari aplikasi`);
      assert.equal(def.secret, true, `${name} harus ditandai sebagai rahasia`);
    }
    // Id model bukan rahasia: ia justru harus bisa dibaca pemilik di layar.
    assert.equal(configDefinition('GEMINI_MODEL').secret, false);
    assert.equal(configDefinition('NEWS_RSS_URLS').secret, false);
  });
});

describe('validasi nilai', () => {
  test('nama di luar daftar ditolak sebelum sempat disimpan', () => {
    const result = validateConfigValue('SUPABASE_SERVICE_ROLE_KEY', KEY);
    assert.equal(result.ok, false);
    assert.match(result.reason, /allowed list/);
  });

  test('kunci harus berupa kunci: cukup panjang dan tanpa spasi', () => {
    assert.equal(validateConfigValue('GEMINI_API_KEY', 'short').ok, false);
    assert.equal(validateConfigValue('GEMINI_API_KEY', 'ada spasi di dalamnya').ok, false);
    assert.equal(validateConfigValue('GEMINI_API_KEY', `${KEY}\nSURAT`).ok, false, 'baris baru bisa menyelundupkan header');
    const ok = validateConfigValue('GEMINI_API_KEY', `  ${KEY}  `);
    assert.equal(ok.ok, true);
    assert.equal(ok.value, KEY, 'spasi di tepi dipotong, isi kunci tidak berubah');
  });

  test('nilai kosong berarti hapus, bukan menimpa dengan string kosong', () => {
    const result = validateConfigValue('GEMINI_API_KEY', '');
    assert.equal(result.ok, true);
    assert.equal(result.value, null);
    assert.equal(result.def.name, 'GEMINI_API_KEY', 'jawaban harus membawa definisinya, kalau tidak jalur hapus kehilangan namanya');
    assert.equal(validateConfigValue('REDDIT_SUBREDDITS', '   ').value, null, 'kosong berarti hapus untuk semua setelan, bukan hanya kunci');
  });

  test('model boleh dikosongkan supaya tangga bawaan dipakai', () => {
    assert.equal(validateConfigValue('GEMINI_MODEL', '').value, null);
    assert.equal(validateConfigValue('GEMINI_MODEL', 'gemini-2.5-flash').value, 'gemini-2.5-flash');
    assert.equal(validateConfigValue('GEMINI_MODEL', 'model yang salah nama').ok, false);
  });

  test('bilangan dibatasi pada rentang yang masih masuk akal', () => {
    assert.equal(validateConfigValue('YOUTUBE_MAX_VIDEOS', '50').value, '50');
    assert.equal(validateConfigValue('YOUTUBE_MAX_VIDEOS', '0').ok, false);
    assert.equal(validateConfigValue('YOUTUBE_MAX_VIDEOS', '201').ok, false);
    assert.equal(validateConfigValue('YOUTUBE_MAX_VIDEOS', 'banyak').ok, false);
    assert.equal(validateConfigValue('REFRESH_BUDGET_MS', '300000').ok, false, 'anggaran tidak boleh melewati plafon fungsi');
    assert.equal(validateConfigValue('REFRESH_STALE_HOURS', '169').ok, false);
  });

  test('daftar feed hanya menerima https tanpa kredensial', () => {
    assert.equal(validateConfigValue('NEWS_RSS_URLS', 'https://a.example/rss,https://b.example/feed').value, 'https://a.example/rss,https://b.example/feed');
    assert.equal(validateConfigValue('NEWS_RSS_URLS', 'http://a.example/rss').ok, false, 'http tidak diizinkan');
    assert.equal(validateConfigValue('NEWS_RSS_URLS', 'https://user:pass@a.example/rss').ok, false);
    assert.equal(validateConfigValue('NEWS_RSS_URLS', 'bukan alamat').ok, false);
    assert.equal(validateConfigValue('NEWS_RSS_URLS', Array.from({ length: 21 }, (_, i) => `https://s${i}.example/rss`).join(',')).ok, false);
  });

  test('daftar identitas dipangkas dan digabung ulang', () => {
    assert.equal(validateConfigValue('REDDIT_SUBREDDITS', ' bni ,, uangnya').value, 'bni,uangnya');
    assert.equal(validateConfigValue('REDDIT_SUBREDDITS', 'r/bni').ok, false, 'awalan r/ bukan bagian dari nama yang disimpan');
    // Kosong bukan nilai: ia permintaan menghapus baris, bukan daftar kosong.
    assert.equal(validateConfigValue('YOUTUBE_CHANNEL_IDS', '').value, null);
    assert.equal(validateConfigValue('YOUTUBE_CHANNEL_IDS', 'UCabc-123_x').value, 'UCabc-123_x');
    assert.equal(validateConfigValue('YOUTUBE_CHANNEL_IDS', '<script>').ok, false);
  });
});

describe('penyamaran dan tampilan', () => {
  test('yang terlihat hanyalah empat karakter terakhir', () => {
    assert.equal(maskValue(KEY), `••••${KEY.slice(-4)}`);
    assert.equal(maskValue('abc'), '••••');
    assert.equal(maskValue(null), '••••');
    assert.equal(maskValue(KEY).includes(KEY.slice(0, 8)), false);
  });

  test('baris layar tidak pernah membawa nilai rahasia', () => {
    const rows = configRows({ env: { GEMINI_API_KEY: KEY }, values: { REDDIT_SUBREDDITS: 'bni,uangnya' } });
    const gemini = rows.find(row => row.name === 'GEMINI_API_KEY');
    assert.equal(gemini.value, null, 'kunci tidak boleh keluar dari server');
    assert.equal(gemini.masked, `••••${KEY.slice(-4)}`);
    assert.equal(gemini.present, true);
    assert.equal(gemini.source, 'env');
    const subreddits = rows.find(row => row.name === 'REDDIT_SUBREDDITS');
    assert.equal(subreddits.value, 'bni,uangnya', 'daftar biasa boleh dibaca dan disalin pemilik');
    assert.equal(subreddits.source, 'config');
    const empty = rows.find(row => row.name === 'YOUTUBE_VIDEO_IDS');
    assert.equal(empty.present, false);
    assert.equal(empty.source, 'none');
    assert.equal(JSON.stringify(rows).includes(KEY), false, 'satu pun baris tidak memuat kunci aslinya');
  });

  test('jumlah baris sama dengan panjang daftar', () => {
    assert.equal(configRows({}).length, CONFIG_DEFS.length);
  });
});

describe('penyatuan environment', () => {
  test('nilai tersimpan mengalahkan environment platform', () => {
    const { env, sources } = mergeConfigEnv({ GEMINI_API_KEY: KEY, PORT: '5173' }, { GEMINI_API_KEY: 'key-dari-database' });
    assert.equal(env.GEMINI_API_KEY, 'key-dari-database');
    assert.equal(sources.GEMINI_API_KEY, 'config');
    assert.equal(env.PORT, '5173', 'yang tidak didaftarkan tidak tersentuh');
  });

  test('tanpa nilai tersimpan, environment platform dipakai dan sumbernya dinyatakan', () => {
    const { env, sources } = mergeConfigEnv({ YOUTUBE_API_KEY: KEY }, {});
    assert.equal(env.YOUTUBE_API_KEY, KEY);
    assert.equal(sources.YOUTUBE_API_KEY, 'env');
    assert.equal(sources.NEWS_RSS_URLS, 'none');
    assert.equal(env.NEWS_RSS_URLS, undefined);
  });

  test('environment asli tidak diubah oleh penyatuan', () => {
    const original = { GEMINI_API_KEY: KEY };
    mergeConfigEnv(original, { GEMINI_API_KEY: 'lain' });
    assert.equal(original.GEMINI_API_KEY, KEY);
  });
});

describe('pembacaan dan penulisan lewat database', () => {
  test('database mati berarti hanya environment platform yang terpakai, dengan alasannya', async () => {
    const read = await loadConfigValues({ db: { enabled: false, reason: 'SUPABASE_URL is not set.' }, env: { GEMINI_API_KEY: KEY } });
    assert.equal(read.env.GEMINI_API_KEY, KEY);
    assert.equal(read.values.GEMINI_API_KEY, undefined);
    assert.match(read.reason, /SUPABASE_URL/);
  });

  test('tabel yang tidak bisa dibaca tidak boleh menghentikan analisis', async () => {
    const read = await loadConfigValues({ db: fakeDb([], { fail: 'list' }), env: { GEMINI_API_KEY: KEY } });
    assert.equal(read.env.GEMINI_API_KEY, KEY, 'kunci platform tetap dipakai');
    assert.match(read.error, /db_request_failed|config_read_failed|unreachable/);
  });

  test('nama di luar daftar diabaikan walau ada di tabel', async () => {
    const read = await loadConfigValues({
      db: fakeDb([{ name: 'SUPABASE_SERVICE_ROLE_KEY', value: 'mencuri', updated_at: 'x' }, { name: 'GEMINI_MODEL', value: 'gemini-2.5-flash', updated_at: 'x' }]),
      env: {},
    });
    assert.equal(read.env.SUPABASE_SERVICE_ROLE_KEY, undefined, 'baris asing tidak boleh masuk environment');
    assert.equal(read.env.GEMINI_MODEL, 'gemini-2.5-flash');
  });

  test('pembacaan kedua memakai cache sampai disiram oleh tulisan', async () => {
    const rows = [{ name: 'GEMINI_MODEL', value: 'satu', updated_at: 'x' }];
    const db = fakeDb(rows);
    const first = await loadConfigValues({ db, env: {} });
    assert.equal(first.env.GEMINI_MODEL, 'satu');
    assert.equal(first.cached, false);
    rows.push({ name: 'GEMINI_MODEL', value: 'dua', updated_at: 'x' });
    const second = await loadConfigValues({ db, env: {} });
    assert.equal(second.cached, true, 'permintaan kedua tidak boleh menambah pembacaan tabel');
    assert.equal(second.env.GEMINI_MODEL, 'satu');
    await writeConfigValue({ db, name: 'GEMINI_MODEL', value: 'dua' });
    const third = await loadConfigValues({ db, env: {} });
    assert.equal(third.env.GEMINI_MODEL, 'dua', 'sesudah ditulis, yang terbaca harus nilai baru');
  });

  test('menulis mengirim nilai yang sudah divalidasi dan membuang cache', async () => {
    const db = fakeDb();
    await writeConfigValue({ db, name: 'REDDIT_SUBREDDITS', value: ' bni , uangnya ' });
    assert.deepEqual(db.calls, [{ op: 'put', name: 'REDDIT_SUBREDDITS', value: 'bni,uangnya' }]);
  });

  test('nilai cacat ditolak sebelum menyentuh database', async () => {
    const db = fakeDb();
    assert.equal(validateConfigValue('NEWS_RSS_URLS', 'http://telalu').ok, false);
    await assert.rejects(writeConfigValue({ db, name: 'NEWS_RSS_URLS', value: 'http://telalu' }), /https/);
    assert.deepEqual(db.calls, [], 'permintaan yang cacat tidak boleh sampai ke tabel');
  });

  test('mengosongkan nilai berarti menghapus barisnya', async () => {
    const db = fakeDb();
    await writeConfigValue({ db, name: 'GEMINI_MODEL', value: '  ' });
    assert.deepEqual(db.calls, [{ op: 'delete', name: 'GEMINI_MODEL' }]);
  });

  test('penghapusan hanya bisa untuk nama yang terdaftar', async () => {
    const db = fakeDb();
    await assert.rejects(forgetConfigValue({ db, name: 'CRON_SECRET' }), /allowed list/);
    assert.deepEqual(db.calls, []);
  });

  test('tanpa database, tulisan dan hapus ditolak dengan alasan', async () => {
    const db = { enabled: false, reason: 'no db' };
    await assert.rejects(writeConfigValue({ db, name: 'GEMINI_MODEL', value: 'x' }), /not configured/);
    await assert.rejects(forgetConfigValue({ db, name: 'GEMINI_MODEL' }), /not configured/);
  });
});

describe('gerbang kunci admin', () => {
  test('tanpa SENTIL_CONFIG_SECRET layar ini tidak boleh menulis', () => {
    const gate = configConfiguration({});
    assert.equal(gate.ready, false);
    assert.match(gate.reason, /SENTIL_CONFIG_SECRET/);
    assert.equal(acceptsConfigSecret({ authorization: `Bearer ${SECRET}` }, gate.secret), false);
  });

  test('kunci pendek bukan kunci admin', () => {
    assert.equal(configConfiguration({ SENTIL_CONFIG_SECRET: 'pendek' }).ready, false);
    assert.equal(configConfiguration({ SENTIL_CONFIG_SECRET: SECRET }).ready, true);
  });

  test('bearer yang cocok diterima, yang lain ditolak', () => {
    assert.equal(acceptsConfigSecret({ authorization: `Bearer ${SECRET}` }, SECRET), true);
    assert.equal(acceptsConfigSecret({ authorization: `bearer ${SECRET}` }, SECRET), true, 'skema header tidak peka besar-kecil');
    assert.equal(acceptsConfigSecret({ authorization: `Bearer ${SECRET.slice(0, -1)}` }, SECRET), false);
    assert.equal(acceptsConfigSecret({ authorization: `Token ${SECRET}` }, SECRET), false, 'hanya bearer yang diterima');
    assert.equal(acceptsConfigSecret({}, SECRET), false);
    assert.equal(acceptsConfigSecret({ authorization: `Bearer ${SECRET}X` }, SECRET), false, 'panjang berbeda tidak dibandingkan');
  });
});
