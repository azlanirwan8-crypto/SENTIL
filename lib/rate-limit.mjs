// Gerbang kuota untuk satu pintu API. Proyek ini sengaja tanpa akun (keputusan pemilik),
// jadi satu-satunya penahan pengunjung yang me-refresh "Tarik analisa" tanpa henti adalah
// kuota per-pengunjung. Dua jendela dipakai untuk setiap aksi mahal: satu pendek untuk
// menghentikan loop permintaan, satu harian untuk melindungi kuota sumber publik (Play,
// App Store, RSS) dan kunci Gemini yang dihitung per token.
//
// Hitungan diambil lewat fungsi Postgres sentil_take_slot supaya satu pengunjung tetap
// terhitung walau permintaannya mendarat di instance serverless yang berbeda. Kalau
// database belum terpasang atau migrasinya belum dijalankan, hitungan jatuh ke memori
// proses: jendela pendek tetap terlindung, hanya batas hariannya mulai ulang tiap
// instance. Gerbang ini tidak pernah menolak permintaan hanya karena kuotanya gagal
// dibaca — kegagalan penyimpanan kuota bukan bukti bahwa pengunjung kehabisan jatah.
import { createHash } from 'node:crypto';

export const QUOTA_VERSION = 'quota-v1';

// Batas bakunya longgar terhadap pemakaian sungguhan dan keras terhadap loop: satu
// penarikan penuh butuh puluhan detik, jadi enam dalam sepuluh menit sudah lebih cepat
// daripada yang bisa dibaca manusia, dan empat puluh dalam sehari menutupi audit panjang.
const RULES = {
  sync: [
    { id: 'burst', windowSeconds: 600, limit: 6, envName: 'QUOTA_SYNC_BURST' },
    { id: 'day', windowSeconds: 86400, limit: 40, envName: 'QUOTA_SYNC_DAY' },
  ],
  discover: [
    { id: 'burst', windowSeconds: 60, limit: 20, envName: 'QUOTA_DISCOVER_BURST' },
    { id: 'day', windowSeconds: 86400, limit: 400, envName: 'QUOTA_DISCOVER_DAY' },
  ],
};

const MAX_MEMORY_KEYS = 20000;

const positiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export function quotaConfiguration(env = process.env) {
  const flag = String(env?.QUOTA_ENABLED ?? '').trim().toLowerCase();
  const enabled = !(flag === 'false' || flag === 'off' || flag === '0');
  const rules = {};
  for (const [action, list] of Object.entries(RULES)) {
    rules[action] = list.map(rule => ({ ...rule, limit: positiveInteger(env?.[rule.envName], rule.limit) }));
  }
  return { enabled, rules, salt: String(env?.QUOTA_KEY_SALT ?? '').trim() };
}

// Kunci pengunjung di-hash supaya tabel kuota tidak menjadi log alamat IP. Tanpa salt
// konfigurasi, hash memang bisa dibalik dengan menebak alamat; itu masih lebih baik
// daripada menyimpannya mentah, dan salt tersedia lewat QUOTA_KEY_SALT.
export function visitorKey(headers = {}, salt = '') {
  const forwarded = String(headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = forwarded
    || String(headers['x-real-ip'] || '').trim()
    || String(headers['cf-connecting-ip'] || '').trim()
    || String(headers['x-vercel-forwarded-for'] || '').split(',')[0].trim();
  if (!ip) return 'anonymous';
  return createHash('sha256').update(`${salt}|${ip}`).digest('hex').slice(0, 24);
}

const unit = (value, name) => `${value} ${name}${value === 1 ? '' : 's'}`;

export function windowLabel(seconds) {
  if (seconds >= 86400) return unit(Math.round(seconds / 86400), 'day');
  if (seconds >= 3600) return unit(Math.round(seconds / 3600), 'hour');
  if (seconds >= 60) return unit(Math.round(seconds / 60), 'minute');
  return unit(seconds, 'second');
}

export function createQuota({ env = process.env, db = null, now = () => Date.now() } = {}) {
  const config = quotaConfiguration(env);
  const memory = new Map();
  // Setelah beberapa kali fungsi simpanan tidak menjawab, instance ini berhenti
  // mencobanya: tanpa itu setiap penarikan membayar satu bolak-balik jaringan yang
  // pasti gagal hanya karena migrasi kuota belum dijalankan.
  let storedFailures = 0;

  function prune(epochSeconds) {
    if (memory.size <= MAX_MEMORY_KEYS) return;
    for (const [key, entry] of memory) {
      if (entry.expiresAt <= epochSeconds) memory.delete(key);
    }
    while (memory.size > MAX_MEMORY_KEYS) memory.delete(memory.keys().next().value);
  }

  function takeMemory(scope, rule, bucket) {
    const key = `${scope}|${rule.windowSeconds}`;
    const expiresAt = (bucket + 1) * rule.windowSeconds;
    const previous = memory.get(key);
    const hits = (previous && previous.expiresAt > bucket * rule.windowSeconds ? previous.hits : 0) + 1;
    memory.set(key, { hits, expiresAt });
    prune(Math.floor(now() / 1000));
    return {
      allowed: hits <= rule.limit,
      hits,
      resetAt: new Date(expiresAt * 1000).toISOString(),
      via: 'memory',
    };
  }

  async function takeStored(scope, rule, bucket) {
    const rows = await db.rpc('sentil_take_slot', {
      p_scope: scope,
      p_bucket: String(bucket),
      p_limit: rule.limit,
      p_window_seconds: rule.windowSeconds,
    });
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row || !Number.isSafeInteger(row.hits)) throw new Error('the quota table did not answer with a count');
    return {
      allowed: row.allowed === true,
      hits: row.hits,
      resetAt: row.reset_at || new Date((bucket + 1) * rule.windowSeconds * 1000).toISOString(),
      via: 'database',
    };
  }

  async function take(action, visitor) {
    const rules = config.rules[action];
    if (!config.enabled || !rules || !rules.length) return { enforced: false, allowed: true, action };
    const epochSeconds = Math.floor(now() / 1000);
    const bucketOf = rule => Math.floor(epochSeconds / rule.windowSeconds);
    const scope = `${action}:${visitor}`;
    const used = [];
    for (const rule of rules) {
      const bucket = bucketOf(rule);
      const useStored = db && db.enabled !== false && typeof db.rpc === 'function' && storedFailures < 3;
      let result;
      try {
        if (useStored) {
          result = await takeStored(scope, rule, bucket);
          storedFailures = 0;
        } else {
          result = takeMemory(scope, rule, bucket);
        }
      } catch {
        // Situs penyimpanan kuota gagal dibaca — bukan bukti pelanggarannya. Hitung di
        // memori instance ini saja supaya loop permintaan tetap terhenti.
        storedFailures += 1;
        result = takeMemory(scope, rule, bucket);
        result.via = 'memory-after-database-failure';
      }
      used.push({ windowSeconds: rule.windowSeconds, limit: rule.limit, ...result });
      if (!result.allowed) {
        const blocked = result;
        return {
          enforced: true,
          allowed: false,
          action,
          limit: rule.limit,
          windowSeconds: rule.windowSeconds,
          window: windowLabel(rule.windowSeconds),
          hits: blocked.hits,
          retryAfterSeconds: Math.max(1, blocked.resetAt ? Math.ceil((Date.parse(blocked.resetAt) - now()) / 1000) : (bucket + 1) * rule.windowSeconds - epochSeconds),
          resetAt: blocked.resetAt,
          used,
        };
      }
    }
    return { enforced: true, allowed: true, action, used };
  }

  return {
    version: QUOTA_VERSION,
    enabled: config.enabled,
    rules: config.rules,
    salted: Boolean(config.salt),
    key: headers => visitorKey(headers, config.salt),
    take,
  };
}
