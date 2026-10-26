// Penarik terjadwal. Satu pintu API hanya menarik ketika seseorang menekan tombol, jadi
// tanpa lapisan ini "realtime" berarti "sejak terakhir kali seseorang membuka halaman".
// Fungsi cron memanggil ini, dan yang ditarik hanyalah workspace yang datanya sudah tua.
//
// Tiga aturan yang membuatnya aman dijalankan tanpa manusia:
//   1. urutan dari yang paling tua — satu kesempatan cron dipakai untuk menyegarkan yang
//      paling perlu, bukan yang pertama ditemukan;
//   2. satu workspace per waktu: penarikan penuh butuh menit, jadi sebelum memulai kita
//      cek sisa anggaran fungsi. Yang tidak muat dilaporkan sebagai tertunda, bukan
//      dipotong di tengah jalan;
//   3. tidak ada angka yang diubah dua kali — hasil hanya ditulis lewat jalur simpan yang
//      sama dengan penarikan manual, sehingga revisi baru lahir dari baris yang benar-benar
//      terbaca, dan workspace yang gagal tetap memakai snapshot sebelumnya.
import { database } from './db.mjs';
import { storeResult } from './persist.mjs';
import { SyncError, normalizeSocialTargets, syncService } from './sync-core.mjs';

export const REFRESH_VERSION = 'refresh-v1';

const HOUR_MS = 3_600_000;

const integer = (value, fallback, { min, max } = {}) => {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

export function refreshConfiguration(env = process.env) {
  const budgetMs = integer(env.REFRESH_BUDGET_MS, 270_000, { min: 20_000, max: 280_000 });
  return {
    // Cron Vercel mengirim Authorization: Bearer <CRON_SECRET> bila kunci itu dipasang.
    // Tanpa kunci, fungsi ini menolak bekerja: endpooint penarikan tidak boleh pernah ada
    // di internet dalam keadaan terbuka hanya karena satu langkah pemasangan terlewat.
    secret: String(env.CRON_SECRET || '').trim(),
    requireAuth: String(env.REFRESH_ALLOW_UNAUTHENTICATED || '').trim().toLowerCase() !== 'true',
    staleAfterMs: integer(env.REFRESH_STALE_HOURS, 6, { min: 1, max: 168 }) * HOUR_MS,
    budgetMs,
    // Sisa waktu minimum agar satu penarikan masih punya peluang selesai utuh.
    minRoomMs: Math.min(budgetMs - 10_000, integer(env.REFRESH_MIN_ROOM_MS, 150_000, { min: 15_000, max: 240_000 })),
  };
}

const ageOf = (workspace, now) => {
  const stamp = workspace?.lastSyncedAt || workspace?.snapshot?.fetchedAt || null;
  const parsed = stamp ? Date.parse(stamp) : NaN;
  return Number.isNaN(parsed) ? Infinity : now - parsed;
};

export function isStale(workspace, now, staleAfterMs) {
  return ageOf(workspace, now) >= staleAfterMs;
}

export function createRefreshService({
  service = syncService,
  db = database,
  env = process.env,
  now = () => Date.now(),
} = {}) {
  const config = refreshConfiguration(env);

  // Penjadwal ikut memakai cache inkremental: penanda tanggal dibaca, baris lama diambil dari
  // bank data, dan sumber hanya ditanya sampai ulasan yang sudah-known. Kalau penanda tidak ada
  // atau pembacaan gagal, penarikan berjalan penuh seperti sebelumnya — lebih lambat, bukan cacat.
  async function readCarry(workspace) {
    if (!db?.enabled || typeof db.reviewCursor !== 'function') return { since: null, carry: null };
    try {
      const cursor = await db.reviewCursor(workspace.id);
      if (!cursor || !Object.keys(cursor.platforms || {}).length) return { since: null, carry: null };
      const stored = await db.loadDataset(workspace.id);
      const carry = Array.isArray(stored?.reviews) && stored.reviews.length ? stored.reviews : null;
      return carry ? { since: cursor.platforms, carry } : { since: null, carry: null };
    } catch {
      return { since: null, carry: null };
    }
  }

  async function pullWorkspace(workspace) {
    const stores = workspace.stores || {};
    const social = normalizeSocialTargets(workspace.channels || {});
    const playAppId = stores.play?.appId || null;
    const appleAppId = stores.appstore?.appId || null;
    if (!playAppId && !appleAppId && !Object.values(social).some(entry => entry?.enabled)) {
      return { workspaceId: workspace.id, label: workspace.label, status: 'skipped', reason: 'No channel is enabled for this analysis.' };
    }
    try {
      const { since, carry } = await readCarry(workspace);
      const result = await service.sync({
        entity: workspace.entity,
        playAppId,
        appleAppId,
        social,
        // Cron harus bertanya ke sumber, bukan memakai salinan hangat satu jam — tetapi ia tidak
        // boleh menulis ulang snapshot yang isinya masih sama, jadi keduanya dipisah.
        force: false,
        bypassCache: true,
        since,
        carry,
      });
      // `unchanged` juga lewat penyimpanan: satu pintu itu hanya menyentuh cap waktu dan
      // mencatat runs, jadi riwayat tetap jujur tanpa menulis ulang puluhan ribu baris.
      const stored = await storeResult(db, workspace, result);
      const channels = Array.isArray(result.channels) ? result.channels : [];
      const failed = channels.filter(channel => channel.status === 'error').map(channel => channel.id);
      if (!stored.ok) {
        return {
          workspaceId: workspace.id,
          label: workspace.label,
          status: 'not_stored',
          reviews: result.reviews?.length ?? result.incremental?.carried ?? null,
          reason: stored.reason,
          failedChannels: failed,
          fetchedAt: result.fetchedAt || null,
        };
      }
      if (result.unchanged) {
        return {
          workspaceId: workspace.id,
          label: workspace.label,
          status: 'unchanged',
          reviews: stored.rows,
          rows: stored.rows,
          elapsedMs: stored.elapsedMs,
          failedChannels: failed,
          reason: 'Sources answered and nothing new came back, so the stored snapshot and its analysis were left untouched.',
          fetchedAt: result.fetchedAt || null,
        };
      }
      return {
        workspaceId: workspace.id,
        label: workspace.label,
        status: result.reviews.length ? 'pulled' : 'empty',
        reviews: result.reviews.length,
        revision: stored.revision,
        rows: stored.rows,
        elapsedMs: stored.elapsedMs,
        failedChannels: failed,
        fetchedAt: result.fetchedAt || null,
      };
    } catch (error) {
      return {
        workspaceId: workspace.id,
        label: workspace.label,
        status: 'failed',
        reason: error instanceof SyncError ? error.message : 'The pull stopped before it could finish. The previous snapshot is still in use.',
      };
    }
  }

  async function run({ workspaceId = null, limit = null, all = false } = {}) {
    const startedAt = now();
    const probe = db ? await db.status() : { enabled: false, reachable: false, reason: 'No database is attached to this scheduler.' };
    if (!probe.reachable) {
      return { action: 'refresh', version: REFRESH_VERSION, ok: false, at: new Date(startedAt).toISOString(), reason: probe.reason || 'The database could not be reached.', db: probe, results: [] };
    }
    const stored = await db.listWorkspaces();
    // Cron hanya menyegarkan yang umurnya sudah lewat ambang; `all` dan `workspaceId` adalah
    // permintaan eksplisit manusia, jadi keduanya boleh menarik yang masih segar.
    const targets = workspaceId || all
      ? workspaceId ? stored.filter(workspace => workspace.id === workspaceId) : [...stored]
      : stored.filter(workspace => isStale(workspace, startedAt, config.staleAfterMs));
    targets.sort((a, b) => ageOf(b, startedAt) - ageOf(a, startedAt));
    const cap = Number.isInteger(limit) && limit > 0 ? limit : targets.length;

    const results = [];
    let used = 0;
    for (const [index, workspace] of targets.entries()) {
      if (index >= cap) {
        results.push({ workspaceId: workspace.id, label: workspace.label, status: 'deferred', reason: 'Another workspace was pulled first; this one waits for the next run.' });
        continue;
      }
      // Sisa waktu diukur dari anggaran, bukan dari selisih stempel absolut: membandingkan
      // "sampai jam berapa" dengan "sudah berapa lama" selalu memberi jawaban muat.
      used = now() - startedAt;
      const remaining = config.budgetMs - used;
      if (remaining < config.minRoomMs) {
        results.push({ workspaceId: workspace.id, label: workspace.label, status: 'deferred', reason: `Not enough time was left in this run (${Math.round(remaining / 1000)}s of ${Math.round(config.minRoomMs / 1000)}s needed).` });
        continue;
      }
      results.push(await pullWorkspace(workspace));
      used = now() - startedAt;
    }

    return {
      action: 'refresh',
      version: REFRESH_VERSION,
      // Runs dianggap sehat kecuali ada project yang benar-benar gagal: melewatti project
      // tanpa kanal dan menunda yang tidak muat dalam anggaran keduanya keadaan biasa.
      ok: !results.some(result => result.status === 'failed' || result.status === 'not_stored'),
      at: new Date(startedAt).toISOString(),
      finishedAt: new Date(now()).toISOString(),
      elapsedMs: used,
      budgetMs: config.budgetMs,
      staleAfterMs: config.staleAfterMs,
      workspaces: stored.length,
      considered: targets.length,
      counts: results.reduce(( tally, result) => ({ ...tally, [result.status]: (tally[result.status] || 0) + 1 }), {}),
      results,
      db: probe,
    };
  }

  return { version: REFRESH_VERSION, config, run };
}
