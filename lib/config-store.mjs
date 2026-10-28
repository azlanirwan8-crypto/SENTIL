// Registry konfigurasi induk: nama kunci yang boleh disimpan aplikasi, bentuk nilainya, dan
// cara nilainya ditampilkan. Daftarnya eksplisit dan tertutup — sebuah permintaan tidak pernah
// bisa menulis atau membaca nama di luar daftar ini, jadi tabel sentil_config tidak bisa
// dipakai untuk menyuntikkan variabel environment apa pun ke proses server.
//
// Yang SENGAJA tidak didaftarkan: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (kunci tempat
// penyimpanan ini sendiri — kalau bisa ditulis dari aplikasi, satu permintaan bisa memindahkan
// seluruh basis data ke server lain), CRON_SECRET, QUOTA_KEY_SALT, QUOTA_ENABLED, APIFY_ALLOWED
// (izin tertulis pemilik untuk pemakaian berbayar tidak boleh bisa di-flip dari peramban),
// REFRESH_ALLOW_UNAUTHENTICATED, PORT, SENIL_FUNCTION_SECONDS (plafon waktu dimiliki platform).
// Kunci-kunci itu tetap dibaca dari environment Vercel seperti sebelumnya.

import { timingSafeEqual } from 'node:crypto';

export const CONFIG_VERSION = 'config-store-v1';

// Imbuhan yang menandai satu layar utuh bagi pembaca, bukan per kelompok teknis.
const GROUPS = ['analysis', 'social', 'sources', 'timing'];

const KEY_SHAPE = /^[\x21-\x7e]{8,400}$/;
const MODEL_SHAPE = /^[A-Za-z0-9._-]{2,60}$/;
// Identifikasi kanal/subreddit/feed: nama paket, id video, atau nama subreddit. Spasi dan
// tanda baca berat tidak pernah muncul di dalamnya, jadi bentuk ini cukup ketat untuk
// memotong nilai yang sebenarnya adalah sesuatu yang lain.
const ID_SHAPE = /^[A-Za-z0-9][A-Za-z0-9._-]{1,79}$/;

const listOf = value => String(value ?? '')
  .split(/[,\n]+/)
  .map(entry => entry.trim())
  .filter(Boolean);

function secretRule() {
  return raw => {
    const value = String(raw ?? '').trim();
    if (!KEY_SHAPE.test(value)) {
      return { ok: false, reason: 'A key is 8–400 printable characters without spaces.' };
    }
    return { ok: true, value };
  };
}

function integerRule({ min, max }) {
  return raw => {
    const value = String(raw ?? '').trim();
    if (!/^-?\d{1,12}$/.test(value)) return { ok: false, reason: `A whole number between ${min} and ${max} is required.` };
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
      return { ok: false, reason: `The number must be between ${min} and ${max}.` };
    }
    return { ok: true, value: String(parsed) };
  };
}

function idListRule({ max }) {
  return raw => {
    const items = listOf(raw);
    if (!items.length) return { ok: false, reason: 'At least one identifier is required.' };
    if (items.length > max) return { ok: false, reason: `No more than ${max} identifiers are accepted.` };
    const bad = items.find(item => !ID_SHAPE.test(item));
    if (bad) return { ok: false, reason: `"${bad.slice(0, 40)}" is not a valid identifier.` };
    return { ok: true, value: items.join(',') };
  };
}

function urlListRule({ max }) {
  return raw => {
    const items = listOf(raw);
    if (!items.length) return { ok: false, reason: 'At least one address is required.' };
    if (items.length > max) return { ok: false, reason: `No more than ${max} addresses are accepted.` };
    for (const item of items) {
      let parsed;
      try {
        parsed = new URL(item);
      } catch {
        return { ok: false, reason: `"${item.slice(0, 60)}" is not a valid address.` };
      }
      // Hanya https, tanpa kredensial di dalam alamat: alamat ini diambil servernya dari dalam
      // fungsi, jadi alamat http atau file:// adalah jalan keluar yang tidak boleh ada.
      if (parsed.protocol !== 'https:') return { ok: false, reason: `"${item.slice(0, 60)}" must be https.` };
      if (parsed.username || parsed.password) return { ok: false, reason: `"${item.slice(0, 60)}" must not carry credentials.` };
    }
    return { ok: true, value: items.join(',') };
  };
}

// Setiap baris: nama environment persis seperti yang dibaca kode, label layar, kelompok,
// dan aturan nilainya. `secret: true` berarti nilainya tidak pernah meninggalkan server —
// yang ditampilkan hanya penanda singkatnya.
export const CONFIG_DEFS = [
  {
    name: 'GEMINI_API_KEY',
    group: 'analysis',
    secret: true,
    label: 'Gemini API key',
    note: 'Powers the analyst layer: complaint-cluster names and every plain-language reading panel.',
    validate: secretRule(),
  },
  {
    name: 'GEMINI_MODEL',
    group: 'analysis',
    secret: false,
    label: 'Gemini model id',
    note: 'Optional. Left empty, the built-in ladder is used: gemini-3.8-flash, then the models the key itself reports, then the two older flash ids.',
    validate: raw => {
      const value = String(raw ?? '').trim();
      if (!value) return { ok: true, value: '' };
      if (!MODEL_SHAPE.test(value)) return { ok: false, reason: 'A model id is 2–60 characters of letters, digits, dot, dash or underscore.' };
      return { ok: true, value };
    },
  },
  {
    name: 'YOUTUBE_API_KEY',
    group: 'social',
    secret: true,
    label: 'YouTube Data API key',
    note: 'Reads video comments. Without it the YouTube channel stays listed but empty.',
    validate: secretRule(),
  },
  {
    name: 'GOOGLE_API_KEY',
    group: 'social',
    secret: true,
    label: 'Google API key (alternate)',
    note: 'Accepted by the YouTube connector under its older name. Fill one of the two.',
    validate: secretRule(),
  },
  {
    name: 'REDDIT_CLIENT_ID',
    group: 'social',
    secret: true,
    label: 'Reddit client id',
    note: 'Credentialed Reddit reads. The public connector works without it, but rate-limits sooner.',
    validate: secretRule(),
  },
  {
    name: 'REDDIT_CLIENT_SECRET',
    group: 'social',
    secret: true,
    label: 'Reddit client secret',
    note: 'Paired with the client id above.',
    validate: secretRule(),
  },
  {
    name: 'APIFY_API_TOKEN',
    group: 'social',
    secret: true,
    label: 'Apify API token',
    note: 'Facebook, Instagram, TikTok and X comments. Paid actor runs also need APIFY_ALLOWED=true, which stays in the platform environment on purpose.',
    validate: secretRule(),
  },
  {
    name: 'REDDIT_SUBREDDITS',
    group: 'sources',
    secret: false,
    label: 'Subreddits to search',
    note: 'Comma-separated names without the r/ prefix.',
    validate: idListRule({ max: 30 }),
  },
  {
    name: 'YOUTUBE_CHANNEL_IDS',
    group: 'sources',
    secret: false,
    label: 'YouTube channel ids',
    note: 'Comma-separated channel ids (UC…) used when a brand channel is not found by name.',
    validate: idListRule({ max: 30 }),
  },
  {
    name: 'YOUTUBE_VIDEO_IDS',
    group: 'sources',
    secret: false,
    label: 'YouTube video ids',
    note: 'Comma-separated video ids to read comments from directly.',
    validate: idListRule({ max: 30 }),
  },
  {
    name: 'YOUTUBE_MAX_VIDEOS',
    group: 'sources',
    secret: false,
    label: 'Maximum videos per YouTube pull',
    note: 'Whole number, 1 to 200.',
    validate: integerRule({ min: 1, max: 200 }),
  },
  {
    name: 'NEWS_RSS_URLS',
    group: 'sources',
    secret: false,
    label: 'News RSS feeds',
    note: 'Comma-separated https feed addresses. Free channel; article comments are read as reviews.',
    validate: urlListRule({ max: 20 }),
  },
  {
    name: 'REFRESH_STALE_HOURS',
    group: 'timing',
    secret: false,
    label: 'Refresh after (hours)',
    note: 'How old a project must be before the scheduled pull refreshes it. 1 to 168.',
    validate: integerRule({ min: 1, max: 168 }),
  },
  {
    name: 'REFRESH_BUDGET_MS',
    group: 'timing',
    secret: false,
    label: 'Scheduled pull budget (ms)',
    note: 'Wall-clock budget for one scheduled run. 20000 to 280000.',
    validate: integerRule({ min: 20000, max: 280000 }),
  },
];

const BY_NAME = new Map(CONFIG_DEFS.map(def => [def.name, def]));

export function configDefinition(name) {
  return BY_NAME.get(String(name ?? '')) || null;
}

export function configGroups() {
  return GROUPS;
}

export function validateConfigValue(name, raw) {
  const def = configDefinition(name);
  if (!def) return { ok: false, reason: 'This setting is not on the allowed list.' };
  const text = String(raw ?? '').trim();
  // Nilai kosong berarti "hapus", untuk semua setelan termasuk kunci: kode sudah punya
  // perilakunya sendiri tanpa konfigurasi, dan menulis string kosong ke tabel akan
  // menimpa environment platform dengan key yang tidak ada.
  if (!text) return { ok: true, value: null, def };
  const result = def.validate(text);
  if (!result.ok) return result;
  if (!result.value) return { ok: true, value: null, def };
  return { ok: true, value: result.value, def };
}

// Penanda singkat yang aman ditampilkan: empat karakter terakhir. Tidak ada jalur lain yang
// mengeluarkan nilai — termasuk log, pesan galat, dan jawaban aksi mana pun.
export function maskValue(value) {
  const text = String(value ?? '');
  if (text.length <= 4) return '••••';
  return `••••${text.slice(-4)}`;
}

function readFromEnv(env, name) {
  const raw = env?.[name];
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

// Nilai di tabel menang atas environment platform: inilah arti "master di sini". Environment
// tetap jadi cadangan, jadi memasang konfigurasi tidak pernah memutus layanan kalau tabelnya
// belum dimigrasi atau satu baris sedang gagal dibaca.
export function mergeConfigEnv(env = process.env, values = {}) {
  const merged = { ...env };
  const sources = {};
  for (const def of CONFIG_DEFS) {
    const stored = typeof values[def.name] === 'string' && values[def.name].trim() ? values[def.name].trim() : null;
    if (stored) {
      merged[def.name] = stored;
      sources[def.name] = 'config';
    } else if (readFromEnv(env, def.name)) {
      sources[def.name] = 'env';
    } else {
      sources[def.name] = 'none';
    }
  }
  return { env: merged, sources };
}

const CACHE_TTL_MS = 30_000;
// Satu pembacaan tabel per permintaan akan menambah permintaan database pada setiap aksi baca
// dasbor. Cache sekecil ini cukup: tulisan menyiramnya langsung, jadi perubahan tampil di
// instance yang sama pada detik itu juga, dan instance lain paling lama telat 30 detik.
let cache = null;

function cacheRead(now) {
  if (!cache) return null;
  if (now - cache.at > CACHE_TTL_MS) return null;
  return cache;
}

export function invalidateConfigCache() {
  cache = null;
}

// Membaca seluruh baris konfigurasi. Kegagalan dibaca TIDAK boleh menghentikan analisis:
// kalau tabelnya belum ada atau sedang tidak bisa dijangkau, server berjalan dengan
// environment platform saja dan alasannya dikembalikan supaya layar bisa memberitahunya.
export async function loadConfigValues({ db, env = process.env, now = () => Date.now() } = {}) {
  const hit = cacheRead(now());
  if (hit) return { ...hit, cached: true };
  const base = { values: {}, updatedAt: {}, error: null, cached: false };
  if (!db?.enabled || typeof db.listConfig !== 'function') {
    const result = { ...base, reason: db?.reason || 'The database is not configured on this server.' };
    return { ...mergeConfigEnv(env, {}), ...result, at: now() };
  }
  try {
    const rows = await db.listConfig();
    const values = {};
    const updatedAt = {};
    for (const row of Array.isArray(rows) ? rows : []) {
      const def = configDefinition(row?.name);
      if (!def || typeof row.value !== 'string' || !row.value.trim()) continue;
      values[def.name] = row.value.trim();
      updatedAt[def.name] = row.updated_at || null;
    }
    const merged = mergeConfigEnv(env, values);
    const result = { ...merged, values, updatedAt, error: null, cached: false, at: now() };
    cache = result;
    return result;
  } catch (error) {
    const merged = mergeConfigEnv(env, {});
    return {
      ...merged,
      values: {},
      updatedAt: {},
      error: `${error?.code || 'config_read_failed'}: ${String(error?.message || error).slice(0, 180)}`,
      cached: false,
      at: now(),
    };
  }
}

export async function writeConfigValue({ db, name, value }) {
  if (!db?.enabled) throw new Error('The database is not configured on this server, so settings cannot be saved.');
  const checked = validateConfigValue(name, value);
  if (!checked.ok) {
    const failure = new Error(checked.reason);
    failure.code = 'config_value_invalid';
    throw failure;
  }
  if (checked.value === null) return forgetConfigValue({ db, name });
  await db.putConfig(name, checked.value);
  invalidateConfigCache();
  return name;
}

export async function forgetConfigValue({ db, name }) {
  if (!db?.enabled) throw new Error('The database is not configured on this server, so settings cannot be changed.');
  if (!configDefinition(name)) {
    const failure = new Error('This setting is not on the allowed list.');
    failure.code = 'config_name_not_allowed';
    throw failure;
  }
  await db.deleteConfig(name);
  invalidateConfigCache();
  return name;
}

export function configConfiguration(env = process.env) {
  const secret = String(env?.SENTIL_CONFIG_SECRET || '').trim();
  return {
    secret,
    // Gagal tertutup: tanpa kunci admin, menu Config hanya bisa membaca daftar kosong.
    // Aplikasi ini memang tanpa akun untuk data analisis, tapi layar ini menyimpan kunci API,
    // jadi menulisnya harus dibedakan dari permintaan biasa.
    ready: secret.length >= 16,
    reason: secret.length >= 16 ? null : 'SENTIL_CONFIG_SECRET is not installed in the server environment, so saving is switched off. Set it in Vercel (at least 16 characters), then this screen can write.',
  };
}

export function acceptsConfigSecret(headers = {}, secret) {
  const raw = String(headers?.authorization || '');
  const presented = /^Bearer /i.test(raw) ? raw.slice(7).trim() : '';
  if (!presented || !secret) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Bentuk satu baris untuk layar. Nilai bertanda `secret` tidak pernah ikut: yang bisa dibaca
// hanyalah samarannya. Nilai biasa memang daftar yang ingin disalin pemilik, jadi dibawakan
// apa adanya.
export function configRows({ env = process.env, values = {}, updatedAt = {} } = {}) {
  return CONFIG_DEFS.map(def => {
    const stored = values[def.name] || null;
    const fromEnv = readFromEnv(env, def.name);
    const active = stored || fromEnv || null;
    return {
      name: def.name,
      label: def.label,
      note: def.note,
      group: def.group,
      secret: def.secret,
      source: stored ? 'config' : fromEnv ? 'env' : 'none',
      present: Boolean(active),
      updatedAt: stored ? updatedAt[def.name] || null : null,
      masked: def.secret && active ? maskValue(active) : null,
      value: def.secret ? null : active,
    };
  });
}
