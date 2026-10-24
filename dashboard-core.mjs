import { platforms, observationDate, seedReviews } from './data.js';
import { upsertReviews, classifyReview } from './model.js';

const connectedSources = new Set(['play', 'appstore']);

// Label otomatis dihitung ulang setiap kali data dibaca, sehingga perbaikan aturan
// langsung berlaku pada baris yang sudah tersimpan. Baris berlabel manual (dataset
// awal) tidak pernah ditimpa oleh classifier.
export function reclassifyDerived(rows) {
  return rows.map(row => row.labeling === 'rules-v1' ? { ...row, ...classifyReview(row) } : { ...row });
}
// Daftar sumber awal disusun di satu tempat agar server lokal dan function serverless
// memulai dari keadaan yang sama persis.
export function initialDataset() {
  return {
    reviews: [...seedReviews],
    runs: [],
    lastRun: null,
    batch: null,
    sources: platforms.map(p => ({
      id: p.id,
      status: connectedSources.has(p.id) ? 'snapshot' : 'unsupported',
      fetched: 0,
      message: connectedSources.has(p.id) ? 'Data awal dari halaman publik; belum diperbarui pada sesi ini.' : `Belum terhubung; tidak ada pengambilan data. ${p.note}`,
      ...(p.rating ? { rating: p.rating, ratingCount: p.ratingCount, ratingObservedAt: observationDate, installs: p.installs ?? null } : {}),
    })),
  };
}

// Logika penyusunan dataset dipakai bersama oleh server lokal dan function Vercel,
// supaya kedua jalur melaporkan status dan cakupan dengan aturan yang identik.
export function overlayConfiguration(sources, channelConfig) {
  const awaiting = new Set(['unsupported', 'needs_setup', 'ready']);
  return sources.map(source => {
    const channel = channelConfig.get(source.id);
    if (channel && (channel.status === 'needs_setup' || awaiting.has(source.status))) return { ...source, status: channel.status, message: channel.message, fetched: null };
    if (source.status === 'unsupported') return { ...source, message: platforms.find(platform => platform.id === source.id)?.note || source.message };
    return source;
  });
}

export function buildDataset({ previous, results, startedAt, finishedAt, channelConfig, recordRun = true }) {
  const merged = upsertReviews(reclassifyDerived(previous.reviews), results.flatMap(r => r.reviews || []), finishedAt);
  const sources = platforms.map(p => {
    const result = results.find(r => r.id === p.id);
    const before = previous.sources.find(s => s.id === p.id) || { id: p.id };
    if (!result) {
      // Kanal yang sudah diperiksa pada batch ini menyimpan hasilnya; panggilan penutup
      // tidak boleh menimpanya dengan status konfigurasi.
      const touched = before.checkedAt && previous.batch?.startedAt && before.checkedAt >= previous.batch.startedAt;
      if (touched) return { ...before };
      const channel = channelConfig.get(p.id);
      if (channel) return { ...before, status: channel.status, fetched: null, message: channel.message };
      // Kanal tanpa konektor tetap dilaporkan tidak diambil. Kanal yang hanya belum mendapat
      // giliran pada penarikan bertahap mempertahankan status terakhirnya, bukan diubah
      // menjadi "tidak tersedia" secara keliru.
      if (['success', 'partial', 'error', 'snapshot'].includes(before.status)) return { ...before };
      return { ...before, status: 'unsupported', fetched: null, message: `Belum terhubung; tidak ada pengambilan data. ${p.note}` };
    }
    const { reviews, ...source } = result;
    const success = source.status === 'success' || source.status === 'partial';
    return { ...before, ...source, checkedAt: finishedAt, ...(success ? { lastSuccessAt: finishedAt } : {}), ...(Number.isFinite(source.rating) ? { ratingObservedAt: finishedAt } : {}) };
  });
  // Status run dihitung dari sumber hasil gabungan, bukan dari daftar hasil permintaan ini,
  // supaya panggilan penutup batch (tanpa hasil baru) tetap melaporkan kanal yang barusan
  // diperiksa dan tidak melaporkannya sebagai kegagalan.
  const successes = sources.filter(source => ['success', 'partial'].includes(source.status)).length;
  const complete = sources.every(source => source.status === 'success');
  // Penarikan bertahap (satu kanal per permintaan) hanya menyimpan hasil per kanal;
  // satu entri run dibuat pada tahap terakhir, dengan waktu mulai dari tahap pertama.
  if (!recordRun) return {
    reviews: merged.reviews,
    sources,
    lastRun: previous.lastRun,
    runs: previous.runs,
    batch: {
      startedAt: previous.batch?.startedAt ?? startedAt,
      added: (previous.batch?.added ?? 0) + merged.added,
      updated: (previous.batch?.updated ?? 0) + merged.updated,
      unchanged: (previous.batch?.unchanged ?? 0) + merged.unchanged,
    },
  };
  const run = {
    startedAt: previous.batch?.startedAt ?? startedAt,
    finishedAt,
    status: !successes ? 'error' : complete ? 'success' : 'partial',
    coverage: {
      fetchedSources: sources.filter(source => ['success', 'partial'].includes(source.status)).map(source => source.id),
      unavailableSources: sources.filter(source => !['success', 'partial'].includes(source.status)).map(source => source.id),
    },
    added: (previous.batch?.added ?? 0) + merged.added,
    updated: (previous.batch?.updated ?? 0) + merged.updated,
    unchanged: (previous.batch?.unchanged ?? 0) + merged.unchanged,
    sources: sources.map(s => ({ ...s })),
  };
  return { reviews: merged.reviews, sources, lastRun: run, runs: [...previous.runs, run], batch: null };
}
