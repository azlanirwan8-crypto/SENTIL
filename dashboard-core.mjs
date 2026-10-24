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

export function buildDataset({ previous, results, startedAt, finishedAt, channelConfig }) {
  const merged = upsertReviews(reclassifyDerived(previous.reviews), results.flatMap(r => r.reviews || []), finishedAt);
  const sources = platforms.map(p => {
    const result = results.find(r => r.id === p.id);
    const before = previous.sources.find(s => s.id === p.id) || { id: p.id };
    if (!result) {
      const channel = channelConfig.get(p.id);
      return channel
        ? { ...before, status: channel.status, fetched: null, message: channel.message }
        : { ...before, status: 'unsupported', fetched: null, message: `Belum terhubung; tidak ada pengambilan data. ${p.note}` };
    }
    const { reviews, ...source } = result;
    const success = source.status === 'success' || source.status === 'partial';
    return { ...before, ...source, checkedAt: finishedAt, ...(success ? { lastSuccessAt: finishedAt } : {}), ...(Number.isFinite(source.rating) ? { ratingObservedAt: finishedAt } : {}) };
  });
  const successes = results.filter(r => r.status === 'success' || r.status === 'partial').length;
  const complete = sources.every(source => source.status === 'success');
  const run = {
    startedAt, finishedAt,
    status: !successes ? 'error' : complete ? 'success' : 'partial',
    coverage: {
      fetchedSources: sources.filter(source => ['success', 'partial'].includes(source.status)).map(source => source.id),
      unavailableSources: sources.filter(source => !['success', 'partial'].includes(source.status)).map(source => source.id),
    },
    added: merged.added, updated: merged.updated, unchanged: merged.unchanged,
    sources: sources.map(s => ({ ...s })),
  };
  return { reviews: merged.reviews, sources, lastRun: run, runs: [...previous.runs, run] };
}
