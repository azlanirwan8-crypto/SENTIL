// Progres penarikan yang bisa dipercaya pembaca.
//
// Yang dilarang di sini adalah persen yang dikarang. Setiap angka berasal dari pekerjaan yang
// benar-benar sudah selesai, dan bobot tiap fase diambil dari hasil ukur di produksi atas korpus
// yang sama (lihat PHASE_WEIGHTS dan ANALYSE_STAGE_SHARES di bawah), bukan dari perasaan:
//   tarik   51.532 baris selesai dalam 92,6 detik  -> 1,80 ms per baris fase tarik+analisis
//   analisis 28.050 baris = 8,3 detik             -> 0,30 ms per baris
//   tulis   51.532 baris = 8,4 .. 42,5 detik       -> 0,16 .. 0,83 ms per baris (dua hasil ukur)
// Fase tarik sengaja TIDAK punya persen: tidak ada penyebut yang jujur. Halaman ulasan toko tidak
// mengumumkan berapa baris yang masih bisa dibaca, dan `reviewCountReported` milik toko adalah
// jumlah rating — bukan jumlah ulasan yang bisa diambil. Menampilkan "37%" ketika angkanya
// sebenarnya tidak diketahui lebih buruk daripada tidak menampilkan angka sama sekali.
// Yang dilaporkan pada fase itu adalah baris yang sudah terbaca, jumlah halaman, dan status kanal.

// Bobot fase dari laju yang terukur di atas (ms per baris dinormalkan ke total). Fase tulis memakai
// ujung yang paling mahal, sama seperti model anggaran penarikan.
export const PHASE_WEIGHTS = Object.freeze({
  fetch: 1.11 / (1.11 + 0.30 + 0.83),
  analyse: 0.30 / (1.11 + 0.30 + 0.83),
  write: 0.83 / (1.11 + 0.30 + 0.83),
});

// Porsi tiap tahap analisis dari 8,3 detik yang tercapat di model.timings atas 28.050 ulasan:
// tokenize 0,5 · stopwords 0,1 · bobot 0,2 · topik 2,7 · frasa 4,5 · baris 0,3 · sinyal 0,1.
export const ANALYSE_STAGES = Object.freeze([
  { stage: 'tokenize', share: 0.5 / 8.3 },
  { stage: 'stopwords', share: 0.1 / 8.3 },
  { stage: 'weights', share: 0.2 / 8.3 },
  { stage: 'topics', share: 2.7 / 8.3 },
  { stage: 'phrases', share: 4.5 / 8.3 },
  { stage: 'rows', share: 0.3 / 8.3 },
  { stage: 'signals', share: 0.1 / 8.3 },
]);

const round = value => (Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value * 10) / 10)) : null);

// Semua tahap yang sudah selesai dijumlahkan; tahap yang sedang berjalan belum dihitung, jadi
// persen analisis tidak pernah mendahului pekerjaan yang benar-benar terjadi.
export function analyseFraction(completedStages = []) {
  let done = 0;
  for (const entry of ANALYSE_STAGES) {
    if (completedStages.includes(entry.stage)) done += entry.share;
  }
  return Math.min(1, done);
}

export function percentOf(record) {
  if (!record || typeof record !== 'object') return { phasePercent: null, overallPercent: null };
  if (record.phase === 'done') return { phasePercent: 100, overallPercent: 100 };
  if (record.phase === 'fetch') return { phasePercent: null, overallPercent: null };
  if (record.phase === 'analyse') {
    const fraction = analyseFraction(record.stages || []);
    return {
      phasePercent: round(fraction * 100),
      overallPercent: round((PHASE_WEIGHTS.fetch + PHASE_WEIGHTS.analyse * fraction) * 100),
    };
  }
  if (record.phase === 'write' || record.phase === 'storing') {
    const total = Number(record.chunks?.total) || 0;
    const done = Number(record.chunks?.done) || 0;
    const fraction = total > 0 ? Math.min(1, done / total) : 0;
    return {
      phasePercent: total > 0 ? round(fraction * 100) : null,
      overallPercent: total > 0
        ? round((PHASE_WEIGHTS.fetch + PHASE_WEIGHTS.analyse + PHASE_WEIGHTS.write * fraction) * 100)
        : null,
    };
  }
  return { phasePercent: null, overallPercent: null };
}

// Catatan progres hidup di memori instance function, dan peramban membacanya lewat aksi `job`.
// Kalau permintaan polling mendarat di instance lain, aksinya tetap menjawab dengan baris riwayat
// (fase + jumlah baris terakhir) dan tanpa persen — lebih jujur daripada memakai angka instance lain
// yang belum tentu project yang sama.
export function createProgressStore({ ttlMs = 15 * 60 * 1000, now = () => Date.now() } = {}) {
  const records = new Map();

  function sweep() {
    const cutoff = now() - ttlMs;
    for (const [key, entry] of records) if (entry.updatedAt < cutoff) records.delete(key);
  }

  return {
    begin(key, meta = {}) {
      sweep();
      const record = {
        key,
        phase: 'fetch',
        rows: 0,
        pages: 0,
        channels: [],
        stages: [],
        chunks: { done: 0, total: 0 },
        startedAt: now(),
        updatedAt: now(),
        workspaceId: meta.workspaceId || null,
        entity: meta.entity || null,
      };
      records.set(key, record);
      return record;
    },
    update(key, patch = {}) {
      const record = records.get(key);
      if (!record) return null;
      Object.assign(record, patch);
      record.updatedAt = now();
      return record;
    },
    channel(key, channel) {
      const record = records.get(key);
      if (!record || !channel?.id) return null;
      const entry = {
        id: channel.id,
        status: channel.status || 'running',
        rows: Number(channel.fetched) || 0,
        pages: Number(channel.pages) || 0,
      };
      const index = record.channels.findIndex(item => item.id === entry.id);
      if (index >= 0) record.channels[index] = entry;
      else record.channels.push(entry);
      record.rows = record.channels.reduce((total, item) => total + item.rows, 0);
      record.pages = record.channels.reduce((total, item) => total + item.pages, 0);
      record.updatedAt = now();
      return record;
    },
    get(key) {
      const record = records.get(key);
      if (!record) return null;
      const { phasePercent, overallPercent } = percentOf(record);
      return { ...record, phasePercent, overallPercent, elapsedMs: record.updatedAt - record.startedAt };
    },
    finish(key, status = 'done') {
      const record = records.get(key);
      if (!record) return null;
      record.phase = status;
      record.channels = record.channels.map(entry => (entry.status === 'running' ? { ...entry, status: 'done' } : entry));
      record.updatedAt = now();
      return record;
    },
    size() {
      sweep();
      return records.size;
    },
  };
}

export const pullProgress = createProgressStore();
