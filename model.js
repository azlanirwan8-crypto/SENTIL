import { tags } from './data.js';

export const sentimentNames = { positive: 'Positif', negative: 'Negatif', neutral: 'Netral', unclassified: 'Perlu tinjauan' };
export const complaintGroups = Object.entries(tags).map(([id, name]) => ({ id, name, tags: [id] }));
export function complaintStats(reviews) {
  return complaintGroups.map(group => {
    const matches = reviews.filter(r => r.sentiment === 'negative' && (r.complaintTags || r.tags).includes(group.id));
    return { ...group, total: matches.length, reviews: matches };
  }).sort((a,b) => b.total - a.total);
}
export function ratingSummary(reviews) {
  const rated = reviews.filter(r => Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 5);
  return { total: rated.length, average: rated.length ? rated.reduce((sum,r) => sum + r.rating,0) / rated.length : null, distribution: [1,2,3,4,5].map(stars => ({ stars, count: rated.filter(r => r.rating === stars).length })) };
}
export const featureGroups = [
  { name: 'Transaksi & QRIS', tags: ['transactions', 'notifications', 'settlement'] },
  { name: 'Pendaftaran & masuk aplikasi', tags: ['onboarding', 'login'] },
  { name: 'Performa & tampilan', tags: ['ux', 'performance', 'features'] },
  { name: 'Layanan pelanggan', tags: ['support'] },
];
export const painGroups = [
  { name: 'Pendaftaran belum tuntas', tags: ['onboarding'], action: 'Tampilkan progres verifikasi dan sediakan jalur eskalasi saat estimasi terlewati.', owner: 'Operasional merchant', metric: 'Waktu persetujuan pada 95% pengajuan dan jumlah pengajuan yang melewati batas waktu' },
  { name: 'Notifikasi & pembaruan laporan', tags: ['notifications', 'settlement'], action: 'Periksa waktu pengiriman notifikasi, sinkronisasi laporan, dan status pencairan dana secara terpisah.', owner: 'Rekayasa · Pembayaran', metric: 'Waktu pengiriman notifikasi dan ketepatan pembaruan pencairan dana' },
  { name: 'Akses & performa aplikasi', tags: ['login', 'performance'], action: 'Telusuri penyebab kegagalan masuk aplikasi dan waktu muat yang lama; evaluasi sidik jari atau biometrik sebagai fitur kenyamanan.', owner: 'Rekayasa · Penjaminan mutu', metric: 'Tingkat keberhasilan masuk dan waktu muat pada 95% penggunaan' },
  { name: 'Migrasi kurang jelas', tags: ['migration'], action: 'Sediakan panduan migrasi, status akun, dan informasi penggunaan aplikasi lama.', owner: 'Produk · Operasional', metric: 'Keberhasilan migrasi dan jumlah tiket terkait perpindahan' },
  { name: 'Penanganan layanan', tags: ['support'], action: 'Berikan pemilik tiket, estimasi penyelesaian, dan jalur eskalasi yang jelas.', owner: 'Layanan pelanggan', metric: 'Waktu penyelesaian dan jumlah kontak ulang' },
];
export const positiveGroups = [
  { name: 'Mudah digunakan & bermanfaat', tags: ['ux', 'benefit'], action: 'Pertahankan alur sederhana yang membantu kegiatan usaha.' },
  { name: 'Transaksi & notifikasi membantu', tags: ['transactions', 'notifications', 'settlement'], action: 'Jaga keandalan transaksi dan kejelasan informasi pembayaran.' },
  { name: 'Penggunaan terasa lancar', tags: ['performance'], action: 'Pertahankan pengalaman cepat dan konsisten di berbagai perangkat.' },
  { name: 'Kelengkapan fitur', tags: ['features'], action: 'Pertahankan fitur bernilai bagi merchant tanpa memperumit navigasi.' },
  { name: 'Pelayanan memuaskan', tags: ['support'], action: 'Perkuat praktik layanan yang diapresiasi pelanggan.' },
];
export function summary(reviews) {
  const counts = { positive: 0, negative: 0, neutral: 0, unclassified: 0 };
  for (const review of reviews) counts[review.sentiment]++;
  const total = reviews.length, classified = total - counts.unclassified;
  return { ...counts, total, classified, positivePct: classified ? counts.positive / classified * 100 : null, negativePct: classified ? counts.negative / classified * 100 : null, neutralPct: classified ? counts.neutral / classified * 100 : null, nss: classified ? (counts.positive - counts.negative) / classified * 100 : null };
}
export function filterReviews(reviews, { platform = 'all', from = '', to = '', sentiment = 'all', query = '', tag = '' } = {}) {
  const search = query.trim().toLocaleLowerCase('id');
  return reviews.filter(r => (platform === 'all' || r.platform === platform) && (!from || (r.date && r.date >= from)) && (!to || (r.date && r.date <= to)) && (sentiment === 'all' || r.sentiment === sentiment) && (!tag || r.tags.includes(tag)) && (!search || `${r.author} ${r.text} ${r.tags.map(t => tags[t]).join(' ')}`.toLocaleLowerCase('id').includes(search)));
}
export function groupStats(reviews, groups, sentiment) {
  return groups.map(group => {
    const matches = reviews.filter(r => (!sentiment || r.sentiment === sentiment) && r.tags.some(t => group.tags.includes(t)));
    return { ...group, ...summary(matches), reviews: matches };
  });
}
export function timeline(reviews, mode = 'week') {
  const dated = reviews.filter(r => validDate(r.date));
  if (!dated.length) return [];
  const sorted = [...dated].sort((a,b) => a.date.localeCompare(b.date));
  const first = new Date(`${sorted[0].date}T00:00:00Z`);
  const last = new Date(`${sorted.at(-1).date}T00:00:00Z`);
  if (last - first > 365 * 86400000) mode = 'month';
  const key = date => {
    const d = new Date(`${date}T00:00:00Z`);
    if (mode === 'month') return date.slice(0,7) + '-01';
    d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
    return d.toISOString().slice(0,10);
  };
  const start = new Date(`${key(sorted[0].date)}T00:00:00Z`);
  const end = key(sorted.at(-1).date);
  const bins = new Map();
  while (start.toISOString().slice(0,10) <= end) {
    bins.set(start.toISOString().slice(0,10), { positive: 0, negative: 0, neutral: 0, unclassified: 0 });
    if (mode === 'month') start.setUTCMonth(start.getUTCMonth()+1); else start.setUTCDate(start.getUTCDate()+7);
  }
  for (const r of dated) bins.get(key(r.date))[r.sentiment]++;
  return [...bins].map(([date, values]) => ({ date, ...values }));
}
const sourceDomains = { play: ['play.google.com'], appstore: ['apps.apple.com', 'itunes.apple.com'], x: ['x.com','twitter.com'], instagram: ['instagram.com'], tiktok: ['tiktok.com'], youtube: ['youtube.com','youtu.be'] };
export function validSource(value, platform) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && sourceDomains[platform]?.some(domain => url.hostname === domain || url.hostname.endsWith('.' + domain));
  } catch { return false; }
}
export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
}
const topicRules = {
  onboarding: /daftar|pendaftaran|registrasi|verifikasi|approval|approve|pengajuan|ngajuin/,
  login: /login|log in|masuk|password|pasword|sidik jari|fingerprint|biometrik/,
  transactions: /qris|transaksi|pembayaran/,
  notifications: /notif|notifikasi|suara nominal/,
  settlement: /settlement|settelment|pencairan|laporan/,
  performance: /loading|lambat|lemot|lancar|gangguan|ga ngguan|crash|error|hang/,
  ux: /tampilan|mudah digunakan|simpel|user friendly|mudah dipahami/,
  features: /fitur|sidik jari|fingerprint|hapus toko/,
  support: /\bcs\b|customer service|pelayanan|layanan pelanggan/,
  migration: /migrasi|beralih|aplikasi lama|aplikasi sebelumnya|discontinue/,
  benefit: /membantu|mempermudah|usaha/,
};
export function classifyText(text) {
  const value = text.toLocaleLowerCase('id').replace(/\s+/g,' ');
  const reviewTags = Object.entries(topicRules).filter(([,rule]) => rule.test(value)).map(([tag]) => tag);
  const negative = /gagal|lambat|lemot|ribet|repot|kecewa|buruk|payah|gangguan|ga ngguan|error|crash|loading lama|lama banget|lama bgt|tidak bagus|kurang (?:cepat|bagus)|(?:tidak|belum|blum|ga|gak|nggak|tdk) (?:bisa|ada|update|acc|selesai)|(?:notifikasi|notif|settlement).{0,20}(?:hilang|telat)|tidak menyelesaikan|bankke/.test(value.replace(/\btidak ada (?:masalah|kendala)\b/g,''));
  const positive = /bagus|mantap|mantp|keren|kereen|membantu|mempermudah|memudahkan|mudah digunakan|lancar|memuaskan|akurat|rekomendasi|nice app|good|love|lengkap|lebih cepat|tanpa (?:kendala|masalah)|tidak ada (?:kendala|masalah)|^ok(?:e)?[.! ]*$/.test(value);
  const neutral = /^(?:[1-5] bintang dulu|terima kasih atas informasinya)[.! ]*$/.test(value);
  const sentiment = negative ? 'negative' : positive ? 'positive' : neutral ? 'neutral' : 'unclassified';
  return { sentiment, tags: reviewTags.length ? reviewTags : ['general'], labeling: 'rules-v1', rationale: sentiment === 'unclassified' ? 'Pola teks belum cukup untuk menentukan sentimen. Tidak dihitung sebagai netral; perlu ditinjau secara manual.' : `Klasifikasi otomatis berbasis aturan kata kunci pada teks (${sentimentNames[sentiment].toLowerCase()}), bukan penilaian bintang. Belum diperiksa manusia; negasi, sarkasme, dan ulasan dengan beberapa aspek dapat dinilai keliru.` };
}
const fingerprint = r => r.author && r.author !== 'N/A' && r.date ? `${r.platform}|${r.author.trim().toLowerCase()}|${r.date}|${r.text.trim().toLowerCase()}` : null;
export function upsertReviews(existing, incoming, observedAt) {
  const reviews = existing.map(r => ({ ...r }));
  const ids = new Map(reviews.map((r,i) => [`${r.platform}|${r.id}`, i]));
  const prints = new Map(reviews.map((r,i) => [fingerprint(r), i]).filter(([key]) => key));
  let added = 0, updated = 0, unchanged = 0;
  for (const raw of incoming) {
    const key = `${raw.platform}|${raw.id}`, print = fingerprint(raw);
    const index = ids.get(key) ?? (print ? prints.get(print) : undefined);
    if (index === undefined) {
      const r = { ...raw, ...classifyText(raw.text), observedAt, firstSeenAt: observedAt, lastSeenAt: observedAt, history: [] };
      ids.set(key,reviews.length); if (print) prints.set(print,reviews.length);
      reviews.push(r); added++;
    } else {
      const old = reviews[index];
      const changed = ['text','title','rating','date','author'].some(k => (old[k] ?? null) !== (raw[k] ?? null));
      const textChanged = old.text !== raw.text || (old.title ?? '') !== (raw.title ?? '');
      const history = [...(old.history || [])];
      if (changed) { const { history: ignored, ...version } = old; history.push(version); updated++; } else unchanged++;
      const oldPrint = fingerprint(old);
      if (oldPrint) prints.delete(oldPrint);
      reviews[index] = { ...old, ...raw, id: old.id, ...(textChanged ? classifyText(raw.text) : {}), observedAt, firstSeenAt: old.firstSeenAt || old.observedAt, lastSeenAt: observedAt, history };
      ids.set(key,index); if (print) prints.set(print,index);
    }
  }
  return { reviews, added, updated, unchanged };
}
export function exportCsv(reviews) {
  const columns = ['id','platform','author','date','rating','sentiment','text','tags','sourceUrl','rationale','labeling'];
  const cell = value => {
    let text = String(value ?? '');
    if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"','""') + '"';
  };
  return '\uFEFF' + [columns.join(','), ...reviews.map(r => columns.map(k => cell(k === 'tags' ? r.tags.join(';') : r[k])).join(','))].join('\r\n');
}
