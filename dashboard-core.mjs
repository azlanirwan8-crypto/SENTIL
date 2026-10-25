import { platforms, observationDate, seedReviews } from './data.js';
import { upsertReviews, classifyReview, withAbsa, sentimentNames } from './model.js';

const connectedSources = new Set(['play', 'appstore']);

// Label otomatis dihitung ulang setiap kali data dibaca, sehingga perbaikan aturan langsung
// berlaku pada baris yang sudah tersimpan — termasuk baris warisan rules-v1. Baris berlabel
// manual (dataset awal maupun label pengguna) tidak pernah ditimpa classifier. Target project
// ikut dipakai agar relevansi dinilai terhadap aplikasi yang benar, bukan terhadap satu merek.
export function reclassifyDerived(rows, target = null) {
  return rows.map(row => row.labeling === 'rules-v1' || row.labeling === 'rules-v2' ? { ...row, ...classifyReview(row, target) } : { ...row });
}

// Label manual adalah tindakan analis, bukan teks sumber. Teks, penulis, tanggal, bintang,
// dan tautan tidak pernah diubah oleh fungsi ini; hanya field turunan sentimen yang diganti.
// Baris yang dikecualikan dari penilaian pelanggan (relevansi excluded/uncertain) tidak boleh
// dilabeli: NSS harus tetap hanya berisi pengalaman produk ini.
export const manualSentiments = ['positive', 'negative', 'neutral'];
export const labelableReview = row => {
  const status = row?.relevance?.status;
  return !status || status === 'relevant';
};
export function applyManualLabel(rows, { platform, id, sentiment, action = 'set' } = {}, at = new Date().toISOString(), target = null) {
  const index = rows.findIndex(row => row.platform === platform && String(row.id) === String(id));
  if (index === -1) throw new Error('label_not_found: ulasan tidak ditemukan pada project ini');
  const row = rows[index];
  if (!labelableReview(row)) throw new Error('label_irrelevant: teks ini berada di luar penilaian pelanggan, jadi tidak dapat dilabeli manual');
  if (action === 'reset') {
    if (row.labeling !== 'manual') throw new Error('label_not_manual: baris ini tidak memiliki label manual');
    // Label otomatis dihitung ulang dengan aturan dan target saat ini; metadata manusia dibuang.
    const next = { ...row, ...classifyReview(row, target) };
    delete next.labelOrigin; delete next.labeledAt; delete next.labelHistory;
    return { rows: [...rows.slice(0, index), next, ...rows.slice(index + 1)], review: next, action:'reset' };
  }
  if (!manualSentiments.includes(sentiment)) throw new Error('label_invalid: label harus positive, negative, atau neutral');
  if (row.labeling === 'manual' && row.sentiment === sentiment && row.labelOrigin === 'user') {
    return { rows, review: row, action:'unchanged' };
  }
  const previous = { at, from: row.sentiment ?? null, fromLabeling: row.labeling ?? null, fromOrigin: row.labelOrigin ?? null, to: sentiment };
  const next = {
    ...row, sentiment, labeling:'manual', labelOrigin:'user', labeledAt:at,
    labelHistory: [...(row.labelHistory || []), previous].slice(-20),
    confidence:null, score:null, engine:'manual', evidence:{ positive:[], negative:[] },
    rationale:`Label manual oleh analis pada ${at} sebagai ${sentimentNames[sentiment].toLowerCase()}. Teks asli tidak diubah; label sebelumnya (${sentimentNames[row.sentiment] || 'tanpa label'}) tersimpan di riwayat label.`,
  };
  return { rows: [...rows.slice(0, index), next, ...rows.slice(index + 1)], review: next, action:'labeled' };
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

// Run actor yang belum selesai dilanjutkan, bukan diulang, agar kuota berbayar tidak
// terbuang. Fase komentar (run kedua pada kanal yang sama) punya runId sendiri dan ikut
// dilanjutkan. Dipakai server lokal dan function Vercel supaya keduanya berhenti membayar
// run ganda dengan cara yang sama.
export function resumeMap(previous) {
  return new Map((previous?.sources || [])
    .filter(source => (source.coverage?.runId && source.coverage.runFinished === false)
      || (source.coverage?.followUp?.runId && source.coverage.followUp.finished === false))
    .map(source => [source.id, {
      runId: source.coverage.runId,
      datasetId: source.coverage.datasetId,
      status: 'RUNNING',
      followUp: source.coverage.followUp?.runId && source.coverage.followUp.finished === false
        ? { runId: source.coverage.followUp.runId, datasetId: source.coverage.followUp.datasetId, status: 'RUNNING' }
        : null,
    }]));
}

export function buildDataset({ previous, results, startedAt, finishedAt, channelConfig, recordRun = true, target = null }) {
  const merged = upsertReviews(reclassifyDerived(previous.reviews, target), results.flatMap(r => r.reviews || []), finishedAt, target);
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
      // giliran pada penarikan bertahap (termasuk kanal project baru yang belum pernah ditarik)
      // mempertahankan status terakhirnya, bukan diubah menjadi "tidak tersedia" secara keliru.
      if (['success', 'partial', 'error', 'snapshot', 'belum_ditarik'].includes(before.status)) return { ...before };
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
    reviews: withAbsa(merged.reviews),
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
  return { reviews: withAbsa(merged.reviews), sources, lastRun: run, runs: [...previous.runs, run], batch: null };
}
