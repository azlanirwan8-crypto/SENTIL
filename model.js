import { tags, seedReviews } from './data.js';
import { isWondrTarget } from './target.mjs';

export const sentimentNames = { positive: 'Positif', negative: 'Negatif', neutral: 'Netral', unclassified: 'Perlu tinjauan' };
export const complaintGroups = Object.entries(tags).map(([id, name]) => ({ id, name, tags: [id] }));
export function complaintStats(reviews) {
  return complaintGroups.map(group => {
    const matches = reviews.filter(r => r.sentiment === 'negative' && (r.complaintTags || r.tags).includes(group.id));
    return { ...group, total: matches.length, reviews: matches };
  }).sort((a,b) => b.total - a.total);
}
// Komposisi sentimen seluruh ulasan pada satu topik keluhan. Urutan tetap menurut jumlah
// ulasan negatif, sehingga segmen negatif pada baris ini selalu sama dengan complaintStats.
export function complaintBreakdown(reviews) {
  return complaintGroups.map(group => {
    const matches = reviews.filter(r => (r.complaintTags || r.tags).includes(group.id));
    return { ...group, ...summary(matches), reviews: matches };
  }).sort((a,b) => b.negative - a.negative || b.total - a.total);
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
  { name: 'Transaksi dan penerimaan pembayaran', tags: ['transactions'], action: 'Periksa keberhasilan transaksi QRIS dan pencatatan mutasi transaksi, termasuk data transaksi yang dilaporkan tidak masuk.', owner: 'Rekayasa · Pembayaran', metric: 'Tingkat keberhasilan transaksi QRIS dan kelengkapan pencatatan mutasi' },
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
export function timelineMode(reviews, mode = 'week') {
  const dates = reviews.map(r => r.date).filter(validDate).sort();
  return dates.length && Date.parse(dates.at(-1)) - Date.parse(dates[0]) > 365 * 86400000 ? 'month' : mode;
}
export function timeline(reviews, mode = 'week') {
  const dated = reviews.filter(r => validDate(r.date));
  if (!dated.length) return [];
  const sorted = [...dated].sort((a,b) => a.date.localeCompare(b.date));
  mode = timelineMode(sorted,mode);
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
// Proyeksi dihitung dengan rumus yang dapat diperiksa ulang: jumlah ulasan per pekan
// (penjenisan Senin UTC) → regresi kuadrat terkecil untuk arah, tingkat mingguan dari
// pekan-pekan terakhir bila arah belum meyakinkan → rentang Poisson. Tidak ada angka yang
// dikarang; bila data belum cukup, fungsi mengembalikan ok:false beserta alasannya.
export const projectionDefaults = { horizonWeeks: 4, minWeeks: 4, minEvents: 4, confidence: 1.96, convincingT: 2 };
export const projectionMethod = 'ols-weekly-v1';
export const projectionTrends = { rising: 'Naik', falling: 'Turun', flat: 'Relatif tetap' };
export const projectionSignals = { improving: 'Cenderung membaik', worsening: 'Cenderung memburuk', stable: 'Belum ada perubahan yang dapat dinyatakan' };
function weekStart(dateText) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0,10);
}
function shiftWeek(dateText, weeks) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + weeks * 7);
  return date.toISOString().slice(0,10);
}
function linearFit(values) {
  const n = values.length;
  if (n < 3) return null;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / n;
  let sxx = 0, sxy = 0;
  values.forEach((value, index) => { sxx += (index - meanX) ** 2; sxy += (index - meanX) * (value - meanY); });
  const slope = sxx ? sxy / sxx : 0;
  const intercept = meanY - slope * meanX;
  const residual = values.reduce((sum, value, index) => sum + (value - (intercept + slope * index)) ** 2, 0);
  const degrees = n - 2;
  const standardError = degrees > 0 && sxx ? Math.sqrt((residual / degrees) / sxx) : null;
  return { weeks: n, mean: meanY, slope, intercept, standardError, t: standardError ? slope / standardError : null };
}
function poissonRange(lambda, confidence) {
  const spread = confidence * Math.sqrt(lambda);
  return { low: Math.max(0, Math.floor(lambda - spread)), high: Math.ceil(lambda + spread) };
}
// Satu definisi NSS untuk seluruh aplikasi: (positif − negatif) ÷ teks berlabel × 100, dengan
// teks berlabel mencakup netral. Denominasinya dapat dikirim eksplisit; tanpa itu netral tidak
// ada dalam hitungan sehingga (positif + negatif) tetap merupakan denominasi yang benar.
function nssRatio(positive, negative, classified = positive + negative) {
  return classified > 0 ? (positive - negative) / classified * 100 : null;
}
// Kesimpulan arah hanya dinyatakan bila kemiringan salah satu deret dapat dibedakan dari
// kebisingan, dan tidak dibatalkan oleh deret lainnya.
function conclusion(negative, positive) {
  const movement = value => value.convincing ? value.direction : null;
  const neg = movement(negative), pos = movement(positive);
  if (neg === 'falling' && pos !== 'falling') return 'improving';
  if (pos === 'rising' && neg !== 'rising') return 'improving';
  if (neg === 'rising' && pos !== 'rising') return 'worsening';
  if (pos === 'falling' && neg !== 'falling') return 'worsening';
  return 'stable';
}
export function projection(reviews, options = {}) {
  const { horizonWeeks, minWeeks, minEvents, confidence, convincingT } = { ...projectionDefaults, ...options };
  const dated = reviews.filter(r => validDate(r.date));
  const empty = { method: projectionMethod, horizonWeeks, weeks: 0, weekLabels: [], themes: [], ok: false };
  if (!dated.length) return { ...empty, reason: 'Proyeksi dihitung dari tanggal publikasi ulasan. Dalam pilihan ini belum ada ulasan bertanggal.' };
  const days = dated.map(r => r.date).sort();
  const weekLabels = [];
  for (let week = weekStart(days[0]); week <= weekStart(days.at(-1)) && weekLabels.length < 400; week = shiftWeek(week, 1)) weekLabels.push(week);
  const buckets = new Map(weekLabels.map(week => [week, []]));
  for (const review of dated) buckets.get(weekStart(review.date)).push(review);
  const series = test => weekLabels.map(week => buckets.get(week).filter(test).length);
  const total = values => values.reduce((sum, value) => sum + value, 0);
  const base = { ...empty, weeks: weekLabels.length, weekLabels };
  if (weekLabels.length < minWeeks) return { ...base, reason: `Baru ${weekLabels.length} pekan memuat ulasan bertanggal. Kemiringan tren memerlukan minimal ${minWeeks} pekan sebelum dapat diuji, jadi proyeksi sengaja tidak dihitung.` };
  // Ekstrapolasi kemiringan hanya dilakukan bila secara statistik dapat dibedakan dari
  // kebisingan (|t| >= convincingT). Jika tidak, tingkat mingguan dipakai dari rata-rata
  // horizon terakhir yang benar-benar teramati — mencegah satu pekan memuncak menjadi tren.
  const model = values => {
    const fit = linearFit(values);
    const observed = total(values);
    const window = Math.min(horizonWeeks, values.length);
    const recentTotal = total(values.slice(-window));
    const recentRate = recentTotal / window;
    // t bernilai null hanya bila sisa regresi nol (garis sempurna): arahnya pasti, jadi
    // dianggap meyakinkan. Tanpa kemiringan, arah dinyatakan tetap, bukan tidak diketahui.
    const significance = fit.t === null ? Infinity : Math.abs(fit.t);
    const convincing = fit.slope !== 0 && significance >= convincingT;
    const weeklyRate = convincing ? Math.max(0, fit.intercept + fit.slope * (values.length - 1)) : recentRate;
    const lambda = weeklyRate * horizonWeeks;
    return { ...fit, series: values, observed, recentTotal, recentRate, weeklyRate, convincing, projected: lambda, ...poissonRange(lambda, confidence), direction: fit.slope === 0 ? 'flat' : convincing ? (fit.slope > 0 ? 'rising' : 'falling') : 'flat' };
  };
  const negative = model(series(r => r.sentiment === 'negative'));
  const positive = model(series(r => r.sentiment === 'positive'));
  // Netral ikut diproyeksikan hanya agar denominasi NSS proyeksi sama dengan NSS pada kartu
  // lain. Angka netral tidak ditampilkan; ia tidak mengubah arah kesimpulan positif/negatif.
  const neutral = model(series(r => r.sentiment === 'neutral'));
  if (negative.observed < minEvents || positive.observed < minEvents) return { ...base, reason: `Ulasan berlabel pada ${weekLabels.length} pekan ini masih sedikit (positif ${positive.observed}, negatif ${negative.observed}). Proyeksi tidak dihitung supaya rentang angkanya tidak menyesatkan.` };
  const bounds = [
    nssRatio(positive.low, negative.high, positive.low + negative.high + neutral.projected),
    nssRatio(positive.high, negative.low, positive.high + negative.low + neutral.projected),
  ].filter(value => value !== null);
  const nssPoint = nssRatio(positive.projected, negative.projected, positive.projected + negative.projected + neutral.projected);
  const themes = painGroups.map(group => ({ name: group.name, owner: group.owner, action: group.action, ...model(series(r => r.sentiment === 'negative' && r.tags.some(t => group.tags.includes(t)))) }))
    .filter(theme => theme.observed > 0)
    .sort((a,b) => b.projected - a.projected || b.observed - a.observed);
  return {
    ...base, ok: true, negative, positive, themes,
    signal: conclusion(negative, positive),
    nssCurrent: summary(dated).nss,
    nssProjected: { point: nssPoint, low: bounds.length ? Math.min(...bounds) : null, high: bounds.length ? Math.max(...bounds) : null, sample: Math.round(positive.projected + negative.projected + neutral.projected) },
    themeProjectedTotal: total(themes.map(t => t.projected)),
    confidence,
  };
}
// Lonjakan negatif hanya dihitung dari waktu publikasi yang benar-benar dikirim sumber
// (publishedAt). Ulasan yang hanya punya tanggal tidak disebar ke dalam jam — itu mengarang
// distribusi. Bila teks berhanya sedikit, jendela diperbesar menjadi harian dan jendela mana
// yang dipakai selalu ikut dilaporkan supaya pembaca tahu apa yang sebenarnya diuji.
export const anomalyDefaults = { thresholdPct: 200, baselineWindows: 24, dailyBaselineWindows: 14, minWindows: 6, minCurrent: 3, minHourlyRows: 12, maxBuckets: 4000 };
export const anomalyWindowNames = { hour: '1 jam', day: '1 hari' };
export function anomalyScan(reviews, options = {}) {
  const settings = { ...anomalyDefaults, ...options };
  const timed = reviews.filter(r => typeof r.publishedAt === 'string' && Number.isFinite(Date.parse(r.publishedAt)));
  const dated = reviews.filter(r => validDate(r.date));
  const hourly = timed.length >= settings.minHourlyRows;
  const used = hourly ? timed : dated;
  const size = hourly ? 3600000 : 86400000;
  const baselineWindows = hourly ? settings.baselineWindows : settings.dailyBaselineWindows;
  const base = {
    ok: false, findings: [], peak: null, buckets: 0, baselineWindows,
    thresholdPct: settings.thresholdPct, minCurrent: settings.minCurrent,
    window: hourly ? 'hour' : 'day',
    rows: { total: reviews.length, timed: timed.length, dated: dated.length, used: used.length },
  };
  if (used.length < settings.minCurrent) {
    return { ...base, reason: `Baru ${used.length} ulasan ${hourly ? 'memiliki waktu publikasi per jam' : 'memiliki tanggal publikasi'} pada pilihan ini. Lonjakan memerlukan setidaknya ${settings.minCurrent} ulasan negatif dalam satu jendela, jadi belum ada yang dapat diuji.` };
  }
  const stamp = r => hourly ? Date.parse(r.publishedAt) : Date.parse(`${r.date}T00:00:00Z`);
  const starts = used.map(r => Math.floor(stamp(r) / size) * size);
  const first = Math.min(...starts), last = Math.max(...starts);
  const spanBuckets = Math.floor((last - first) / size) + 1;
  const count = Math.min(settings.maxBuckets, spanBuckets);
  // Pagar jendela dihitung mundur dari jendela TERAKHIR. Memotong dari yang terlama berarti
  // ulasan terbaru — yang dicari pemantauan lonjakan — dibuang diam-diam sementara antarmuka
  // tetap menyatakan seluruh baris diuji.
  const windowStart = last - (count - 1) * size;
  const negative = new Array(count).fill(0), total = new Array(count).fill(0), members = Array.from({ length: count }, () => []);
  let scanned = 0;
  for (let i = 0; i < used.length; i++) {
    const index = Math.floor((starts[i] - windowStart) / size);
    if (index < 0 || index >= count) continue;
    scanned++;
    total[index]++;
    if (used[i].sentiment === 'negative') { negative[index]++; members[index].push(used[i]); }
  }
  const findings = [];
  for (let index = 0; index < count; index++) {
    if (negative[index] < settings.minCurrent) continue;
    const prior = negative.slice(Math.max(0, index - baselineWindows), index);
    if (prior.length < settings.minWindows) continue;
    const baseline = prior.reduce((sum, value) => sum + value, 0) / prior.length;
    // Baseline nol tidak menghasilkan persentase: jumlah dinaikkan dari nol dilaporkan apa
    // adanya, bukan sebagai kelipatan yang tidak dapat dihitung.
    const increasePct = baseline > 0 ? (negative[index] - baseline) / baseline * 100 : Number.POSITIVE_INFINITY;
    if (!(increasePct > settings.thresholdPct)) continue;
    findings.push({ start: windowStart + index * size, end: windowStart + (index + 1) * size, negative: negative[index], total: total[index], baseline, increasePct, reviews: members[index] });
  }
  findings.sort((a, b) => b.increasePct - a.increasePct || b.start - a.start);
  const cut = scanned < used.length;
  const reason = findings.length ? null
    : `Tidak ada satu pun jendela ${anomalyWindowNames[base.window]} dengan ${settings.minCurrent}+ ulasan negatif yang melampaui ${settings.thresholdPct}% di atas rata-rata ${baselineWindows} jendela sebelumnya (${count} jendela terbaru diperiksa${cut ? `, ${used.length - scanned} baris terlama di luar jendela itu` : ''}).`;
  return { ...base, ok: findings.length > 0, findings, peak: findings[0] || null, buckets: count, scanned, truncated: cut, span: { first: Math.max(first, windowStart), last }, reason };
}
// Pita NSS hanya label interpretasi di atas angka yang sudah dihitung; ambangnya ditulis
// agar dapat diperdebatkan, bukan ditutup sebagai kebenaran ilmiah.
export const nssBands = [
  { id: 'tekanan-berat', min: -100, max: -50, label: 'Tekanan berat', tone: 'negative' },
  { id: 'cenderung-negatif', min: -50, max: -20, label: 'Cenderung negatif', tone: 'negative' },
  { id: 'netral-negatif', min: -20, max: 0, label: 'Netral condong negatif', tone: 'neutral' },
  { id: 'netral-positif', min: 0, max: 20, label: 'Netral condong positif', tone: 'neutral' },
  { id: 'cenderung-positif', min: 20, max: 50, label: 'Cenderung positif', tone: 'positive' },
  { id: 'positif-kuat', min: 50, max: 100, label: 'Positif kuat', tone: 'positive' },
];
export const nssMinSample = 20;
// Di bawah batas sampel, arah tidak dinyatakan: satu ulasan negatif pernah tampil sebagai
// "Tekanan berat", yang terbaca sebagai kesimpulan padahal bukan.
export const nssInsufficientBand = { id: 'belum-dinilai', min: null, max: null, label: 'Belum dapat dinilai', tone: 'neutral' };
export function nssBand(nss, classified = Infinity) {
  if (nss === null || !Number.isFinite(nss)) return null;
  if (Number.isFinite(classified) && classified < nssMinSample) return nssInsufficientBand;
  return nssBands.find(band => nss >= band.min && nss <= band.max) || null;
}
// Deret harian untuk grafik batang bertumpuk + garis NSS. Hari disusun berurutan dari tanggal
// pertama sampai terakhir yang benar-benar ada datanya (dibatasi maxDays sebagai pagar
// memori, bukan pembatas sampel — bila terpotong, caller mendapat flag truncated).
export function dailySeries(reviews, options = {}) {
  const { maxDays = 400 } = { ...anomalyDefaults, ...options };
  const dated = reviews.filter(r => validDate(r.date)).sort((a, b) => a.date.localeCompare(b.date));
  if (!dated.length) return { days: [], truncated: false, undated: reviews.length };
  const first = dated[0].date, last = dated.at(-1).date;
  const span = Math.floor((Date.parse(`${last}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86400000) + 1;
  // Pagar memori diambil dari sisi TERBARU. Deret ini dipakai untuk melihat lonjakan terbaru:
  // memotong dari tanggal pertama berarti hari-hari terakhir — yang paling perlu diperiksa —
  // hilang tanpa terlihat, dan lencana lonjakan lalu menyatakan "tidak ada lonjakan".
  const keep = Math.min(maxDays, span);
  const windowStart = new Date(Date.parse(`${last}T00:00:00Z`) - (keep - 1) * 86400000).toISOString().slice(0, 10);
  const days = [];
  const cursor = new Date(`${windowStart}T00:00:00Z`);
  while (days.length < keep) {
    days.push({ date: cursor.toISOString().slice(0, 10), positive: 0, negative: 0, neutral: 0, unclassified: 0, total: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  const index = new Map(days.map((day, position) => [day.date, position]));
  for (const review of dated) {
    const slot = index.get(review.date);
    if (slot === undefined) continue;
    const day = days[slot];
    day[review.sentiment]++; day.total++;
  }
  for (const day of days) {
    const classified = day.positive + day.negative + day.neutral;
    day.nss = nssRatio(day.positive, day.negative, classified);
    day.classified = classified;
  }
  return { days, truncated: span > days.length, span, undated: reviews.length - dated.length };
}
// Penanda lonjakan pada sumbu waktu. Sengaja hanya berisi angka dan tanggal hasil hitungan:
// tidak ada label rilis aplikasi atau insiden yang tidak ada sumbernya di data.
export function spikeBadges(series, options = {}) {
  const settings = { ...anomalyDefaults, ...options };
  const values = series.map(day => day.negative);
  const badges = [];
  for (let i = 0; i < values.length; i++) {
    if (values[i] < settings.minCurrent) continue;
    const prior = values.slice(Math.max(0, i - settings.dailyBaselineWindows), i);
    if (prior.length < Math.min(settings.minWindows, 3)) continue;
    const baseline = prior.reduce((sum, value) => sum + value, 0) / prior.length;
    const increasePct = baseline > 0 ? (values[i] - baseline) / baseline * 100 : Number.POSITIVE_INFINITY;
    if (!(increasePct > settings.thresholdPct)) continue;
    badges.push({ date: series[i].date, negative: values[i], baseline, increasePct, label: `${values[i]} ulasan negatif${baseline > 0 ? ` (+${Math.round(increasePct)}% dari rata-rata ${baseline.toFixed(1)} per hari)` : ' (muncul setelah hari-hari tanpa keluhan)'}` });
  }
  return badges.sort((a, b) => b.negative - a.negative || b.date.localeCompare(a.date));
}
// Matriks antar platform: satu baris per kanal yang benar-benar punya teks tersimpan.
export function platformMatrix(reviews, platformList) {
  return platformList.map(platform => {
    const rows = reviews.filter(review => review.platform === platform.id);
    return { id: platform.id, name: platform.short, color: platform.color, icon: platform.icon, total: rows.length, ...summary(rows) };
  }).filter(row => row.total > 0).sort((a, b) => b.total - a.total);
}
// Donut berjenjang: cincin dalam = aspek pengalaman (pendorong), cincin luar = pemecahan
// tiap aspek menurut kanal. Semua angka dihitung dari baris yang sama dengan dasbor.
export function aspectChannelRings(reviews, platformList, sentiment = 'negative') {
  const wanted = review => !sentiment || sentiment === 'all' || review.sentiment === sentiment;
  const inner = [], outer = [];
  for (const group of aspectGroups) {
    const rows = reviews.filter(review => wanted(review) && absaOf(review).aspects.includes(group.id));
    if (!rows.length) continue;
    inner.push({ id: group.id, name: group.name, value: rows.length });
    for (const platform of platformList) {
      const count = rows.filter(review => review.platform === platform.id).length;
      if (count) outer.push({ aspect: group.id, aspectName: group.name, platform: platform.id, name: platform.short, color: platform.color, value: count });
    }
  }
  return { inner: inner.sort((a, b) => b.value - a.value), outer: outer.sort((a, b) => b.value - a.value) };
}
// Peta kotak (squarified treemap) untuk klaster keluhan. Urutan dijaga dari nilai terbesar,
// dan setiap node mendapat persegi panjang tanpa tumpang tindih di dalam area yang diberikan.
export function squarify(nodes, x, y, width, height) {
  const items = nodes.filter(node => node.value > 0).sort((a, b) => b.value - a.value);
  const total = items.reduce((sum, node) => sum + node.value, 0);
  if (!items.length || !total || !(width > 0) || !(height > 0)) return [];
  const scale = (width * height) / total;
  let cells = items.map(node => ({ ...node, area: node.value * scale }));
  const layout = [];
  let box = { x, y, width, height };
  const worst = (candidate, side) => {
    let sum = 0, max = 0, min = Number.POSITIVE_INFINITY;
    for (const cell of candidate) { sum += cell.area; max = Math.max(max, cell.area); min = Math.min(min, cell.area); }
    if (!sum || !min || !(side > 0)) return Number.POSITIVE_INFINITY;
    return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
  };
  while (cells.length) {
    const side = Math.min(box.width, box.height);
    let row = [cells[0]], rest = cells.slice(1);
    while (rest.length && worst([...row, rest[0]], side) <= worst(row, side)) { row.push(rest[0]); rest = rest.slice(1); }
    const sum = row.reduce((acc, cell) => acc + cell.area, 0);
    const thickness = sum / side;
    let offset = 0;
    for (const cell of row) {
      const length = cell.area / thickness;
      // Sisi pendek kotak menjadi tempat baris ditumpuk; sisanya menjadi tebal pita.
      layout.push(box.width <= box.height
        ? { ...cell, x: box.x + offset, y: box.y, width: length, height: thickness }
        : { ...cell, x: box.x, y: box.y + offset, width: thickness, height: length });
      offset += length;
    }
    box = box.width <= box.height
      ? { x: box.x, y: box.y + thickness, width: box.width, height: box.height - thickness }
      : { x: box.x + thickness, y: box.y, width: box.width - thickness, height: box.height };
    cells = rest;
  }
  return layout;
}
// Node treemap keluhan: klaster frasa berulang, diwarnai menurut beratnya keluhan.
export function painTreemapNodes(reviews) {
  const negative = summary(reviews).negative || 1;
  return clusterStats(reviews).map(cluster => {
    const share = cluster.total / negative;
    return { id: cluster.id, name: cluster.label, value: cluster.total, severity: share >= 0.2 ? 'critical' : share >= 0.08 ? 'warning' : 'info' };
  });
}
const sourceDomains = { play: ['play.google.com'], appstore: ['apps.apple.com', 'itunes.apple.com'], x: ['x.com','twitter.com'], instagram: ['instagram.com'], tiktok: ['tiktok.com'], youtube: ['youtube.com','youtu.be'], googlemaps: ['google.com'] };
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
  login: /login|log in|masuk|password|pasword|sidik jari|fingerprint|biometrik|\b(?:otp|pin)\b/,
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
// ABSA: topik yang sudah ada dipetakan ke lima aspek pengalaman aplikasi keuangan.
// Aspek diturunkan dari topik + teks, bukan dari penilaian bintang, dan dapat dihitung
// ulang kapan pun karena fungsinya murni.
export const aspectGroups = [
  { id: 'payment', name: 'Pembayaran, QRIS & pencairan', tags: ['transactions', 'settlement', 'notifications'] },
  // Grup ini memang mencakup pendaftaran/verifikasi, masuk aplikasi, dan migrasi dari aplikasi
  // lama; namanya harus menyebut ketiganya supaya pendorong negatif tidak disalahkan pada
  // OTP/keamanan padahal keluhannya proses verifikasi yang lama.
  { id: 'access', name: 'Pendaftaran, masuk & keamanan akun', tags: ['login', 'onboarding', 'migration'] },
  { id: 'performance', name: 'Performa & gangguan teknis', tags: ['performance'] },
  { id: 'uxui', name: 'Kemudahan tampilan & navigasi', tags: ['ux', 'features', 'benefit'] },
  { id: 'service', name: 'Layanan pelanggan', tags: ['support'] },
];
export const aspectNames = Object.fromEntries(aspectGroups.map(group => [group.id, group.name]));
export const emotionNames = { anger: 'Marah', frustration: 'Frustrasi', satisfaction: 'Puas', query: 'Bertanya', neutral: 'Netral' };
export const intentNames = { bug_report: 'Laporan bug', feature_request: 'Permintaan fitur', praise: 'Pujian', complaint: 'Keluhan umum', other: 'Lainnya' };
const emotionRules = {
  anger: /marah|kesel|emosi|bodoh|sialan|ampun|hancur|parah banget|kecewa berat/,
  frustration: /kecewa|ribet|repot|bingung|pusing|sia-sia|mubazir|lelet|lambat|lemot|gagal|error|crash|rusak|jelek|menyesal|berkali[- ]kali|berulang|berhari[- ]hari|tidak menyelesaikan|belum selesai|belum (?:ada|di)?(?:respon|respons)|harus (?:lama|ulang)|menunggu lama|(?:tidak|belum|blum|blm|ga|gak|nggak|ngga|kagak|enggak|tak|tdk) bisa/,
  satisfaction: /bagus|mantap|mantp|keren|membantu|mempermudah|memudahkan|puas|senang|rekomendasi|mudah|lancar|akurat|terima kasih|nice|love/,
  query: /\?|\b(?:apakah|bagaimana|gimana|kenapa|mengapa|kapan|tolong|cara|info)\b/,
};
const intentRules = {
  feature_request: /semoga (?:ada|ditambah|dibuat|muncul|dikembali)|tolong tambah|minta tambah|harapannya (?:ada|ditambah)|sebaiknya (?:ada|ditambah)|fitur .{0,20}(?:diharapkan|nanti|ke depan)/,
  bug_report: /error|crash|gagal|hang|loading lama|rusak|tidak muncul|belum muncul|(?:tidak|belum|blum|blm|ga|gak|nggak|ngga|kagak|enggak|tak|tdk) bisa|tdk bisa/,
};
export function absaOf(review) {
  const text = String(review.text || '').toLocaleLowerCase('id');
  const tags = Array.isArray(review.tags) ? review.tags : [];
  const aspects = aspectGroups.filter(group => tags.some(tag => group.tags.includes(tag))
    || group.id === 'payment' && /\b(?:qris|settlement|pencairan)\b/.test(text)
    || group.id === 'access' && /\b(?:otp|pin|login|verifikasi)\b/.test(text)).map(group => group.id);
  const emotions = Object.entries(emotionRules).filter(([, rule]) => rule.test(text)).map(([key]) => key);
  const sentiment = review.sentiment;
  const intent = intentRules.feature_request.test(text) ? 'feature_request'
    : sentiment === 'negative' && intentRules.bug_report.test(text) ? 'bug_report'
    : sentiment === 'positive' ? 'praise'
    : sentiment === 'negative' ? 'complaint' : 'other';
  const emotion = sentiment === 'negative' ? (emotions.includes('anger') ? 'anger' : emotions.includes('frustration') ? 'frustration' : 'neutral')
    : sentiment === 'positive' ? (emotions.includes('satisfaction') ? 'satisfaction' : 'neutral')
    : emotions.includes('query') ? 'query' : 'neutral';
  return { aspects, emotions, emotion, intent };
}
// Isi fields ABSA pada setiap baris agar JSON yang keluar dari API terstruktur, bukan
// hanya dihitung di peramban.
export function withAbsa(reviews) {
  const sameList = (a = [], b = []) => a.length === b.length && a.every((value, index) => value === b[index]);
  return reviews.map(review => {
    const { aspects, emotions, emotion, intent } = absaOf(review);
    // Isinya dibandingkan, bukan hanya panjangnya: dua daftar berbeda bisa sama panjang dan
    // membuat label lama bertahan.
    return sameList(review.aspects, aspects) && sameList(review.emotions, emotions) && review.emotion === emotion && review.intent === intent
      ? review : { ...review, aspects, emotions, emotion, intent };
  });
}
export function aspectStats(reviews, sentiment) {
  const wanted = value => !sentiment || sentiment === 'all' || value === sentiment;
  return aspectGroups.map(group => {
    const matches = reviews.filter(r => wanted(r.sentiment) && absaOf(r).aspects.includes(group.id));
    return { ...group, ...summary(matches), reviews: matches };
  }).sort((a, b) => b.negative - a.negative || b.total - a.total);
}
export function countBy(reviews, pick) {
  const counts = new Map();
  for (const review of reviews) {
    const keys = pick(review);
    for (const key of [].concat(keys)) counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts].map(([id, total]) => ({ id, total })).sort((a, b) => b.total - a.total || String(a.id).localeCompare(String(b.id)));
}
// Klaster kata kunci dihitung dari kamus frasa yang dapat diperiksa, bukan dari n-gram
// otomatis, sehingga setiap label klaster punya arti yang jelas dan jumlahnya dapat ditelusuri.
export const painClusters = [
  { id: 'qris-fail', label: 'Gagal QRIS', rule: /\bqris\b[^.!?]{0,30}?\b(?:gagal|tidak|belum|error|bermasalah|ditolak)\b|\b(?:gagal|tidak bisa|belum bisa)\b[^.!?]{0,20}?\bqris\b/i },
  { id: 'settlement-late', label: 'Settlement lambat', rule: /\b(?:settlement|pencairan|dana|settelment)\b[^.!?]{0,30}?\b(?:lambat|telat|terlambat|tidak masuk|belum masuk|hilang|mampet|macet)\b/i },
  { id: 'login-blocked', label: 'Tidak bisa masuk', rule: /\b(?:login|masuk)\b[^.!?]{0,20}?\b(?:gagal|tidak bisa|belum bisa|kagak bisa|tak bisa|tdk bisa)\b|\b(?:tidak|belum|kagak|tak|ga|gak|nggak|tdk|blm) bisa (?:login|masuk)\b/i },
  { id: 'verify-slow', label: 'Verifikasi & pengajuan lama', rule: /\b(?:verifikasi|pengajuan|daftar|pendaftaran|acc|approval)\b[^.!?]{0,30}?\b(?:lama|lamat|telat|terlambat|belum|tidak|gantung|ditolak)\b/i },
  { id: 'otp-pin', label: 'OTP & PIN bermasalah', rule: /\b(?:otp|pin|password|pasword)\b[^.!?]{0,30}?\b(?:lupa|tidak masuk|belum masuk|gagal|error|salah|macet|hilang)\b|\blupa (?:pin|password|pasword)\b/i },
  { id: 'update-error', label: 'Error setelah pembaruan', rule: /\b(?:update|pembaruan|versi baru)\b[^.!?]{0,30}?\b(?:error|gagal|rusak|hang|crash|hilang|bermasalah|lemot)\b|\b(?:error|crash|hang|force close)\b/i },
  { id: 'slow-loading', label: 'Loading lambat & lemot', rule: /\b(?:loading|lemot|lelet)\b|\b(?:aplikasi|halaman|masuk|login|transaksi|pembayaran|sistem|memuat)\b[^.!?]{0,20}?\blambat\b/i },
  { id: 'notif-missing', label: 'Notifikasi tidak masuk', rule: /\b(?:notif|notifikasi|suara nominal)\b[^.!?]{0,30}?\b(?:tidak|belum|hilang|mati|telat|lambat)\b|\b(?:tidak|belum) ada notifikasi\b/i },
  { id: 'support-slow', label: 'Layanan pelanggan lambat', rule: /\b(?:cs|customer service|pelayanan|layanan pelanggan|komplain|tiket)\b[^.!?]{0,30}?\b(?:lambat|lama|telat|tidak|belum|buruk|jelek|berbelit)\b/i },
];
export function clusterStats(reviews, sentiment = 'negative') {
  const wanted = value => !sentiment || sentiment === 'all' || value === sentiment;
  return painClusters.map(cluster => {
    const matches = reviews.filter(r => wanted(r.sentiment) && cluster.rule.test(String(r.text || '')));
    return { ...cluster, total: matches.length, reviews: matches };
  }).filter(cluster => cluster.total > 0).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, 'id'));
}
// Satu daftar kata negasi dipakai bersama semua aturan agar frasa seperti "tak bisa masuk"
// tidak pernah terbaca sebagai keberhasilan.
const negation = 'tidak|bukan|belum|blum|blm|ga|gak|nggak|ngga|kagak|enggak|tak|tdk';
// Klausa harapan ("semoga ...", "mudah-mudahan ...") adalah harapan akan perbaikan, bukan
// keluhan yang sedang terjadi, jadi klausanya sendiri tidak dihitung sebagai negatif.
const hopeClause = new RegExp(`(?:semoga|smoga|moga[\\s-]?2?|mudah[\\s-]?2?an|harapannya|insya\\s?allah|insyallah|aminn?)\\b[^,.!?]*`,'g');
// Kegagalan yang sudah selesai ("... akhirnya bisa masuk") adalah riwayat, bukan keluhan aktif.
// Jeda antar-frasa tidak boleh memuat negasi, supaya "sekarang belum bisa" tetap keluhan.
const notNegated = new RegExp(`(?:(?!\\b(?:${negation})\\b)[^.!?]){0,60}`);
const resolvedHead = `\\b(?:akhirnya|alhamdulillah|alhamdullilah|sekarang|kini)${notNegated.source}\\b(?:bisa|masuk|lancar|berhasil|normal|jalan|oke|enak|bagus)\\b`;
const resolvedClause = new RegExp(`${resolvedHead}[^,.!?]*`,'g');
const successMarker = new RegExp(`${resolvedHead}|(?<!\\b(?:${negation})\\s)(?:bisa masuk|sudah bisa|dapat masuk)\\b`);
const negatedAbility = new RegExp(`\\b(?:${negation})\\s+(?:bisa\\s+bisa|bisa|masuk|acc|selesai)\\b`,'g');
const reassurancePhrase = new RegExp(`\\b(?:(?:${negation}) ada|${negation}|tanpa) (?:masalah|kendala|hambatan|problem)\\b`,'g');
// "dana settlement belum masuk" tetap keluhan meskipun kata bendanya dipisah beberapa kata.
const missingAsset = new RegExp(`\\b(?:dana|uang|settlement|setoran|saldo|pencairan|transaksi|laporan|notifikasi|notif)\\b[^.!?]{0,25}?\\b(?:${negation})\\s+masuk\\b`);
// "lama" berdiri sendiri terlalu mudah salah (mis. "dari lama"), jadi hanya diterima bila melekat
// pada proses yang keluhan utamanya memang kecepatan.
const slowProcess = /(?:daftar|proses|pencairan|verifikasi|tunggu|pending|loading|setoran)[^.!?]{0,14}\b(?:lama|lelet)\b/;
// "Aplikasi biru sebelah sudah bisa semua" memuji produk lain, bukan menyelesaikan keluhan
// tentang aplikasi ini. Klausa penyelesaian hanya membuktikan kepuasan bila subjeknya bukan
// produk lain.
const foreignProductClause = /\b(?:aplikasi|qris|mesin|bank|produk)\s+(?:\w+\s+){0,2}(?:lain|sebelah|kompetitor|pesaing|saingannya)\b/i;
// "masih perlu banyak pengembangan" adalah permintaan perbaikan yang dinyatakan sebagai kekurangan.
const needsWork = /\b(?:masih |perlu |butuh )+banyak pengembangan\b|\bbelum ada perkembangan\b|\btidak ada perkembangan\b/;
const negativeRule = new RegExp(`gagal|lambat|lemot|ribet|repot|jelek|cacat|rusak|lelet|sia-sia|mubazir|menyesal|kecewa|buruk|payah|gangguan|ga ngguan|error|crash|loading lama|lama banget|lama bgt|tidak bagus|kurang (?:cepat|bagus)|\\b(?:${negation})\\s+(?:bisa|ada|update|acc|selesai)\\b|(?:notifikasi|notif|settlement).{0,20}(?:hilang|telat)|${missingAsset.source}|tidak menyelesaikan|bankke|uninstall|\\bscam\\b|penipuan|\\b(?:${negation})\\s+(?:instal|unduh|download)\\b|\\b(?:${negation})\\s+jadi\\b|masih diproses|👎|💩|${slowProcess.source}|${needsWork.source}`);
const positiveRule = /bagus|mantap|mantp|mantab|mantul|terbaik|kereen|keren|luar biasa|membantu|mempermudah|memudahkan|\bmudah\b|lancar|memuaskan|akurat|rekomendasi|recommended|nice app|good|love|lengkap|lebih cepat|tanpa (?:kendala|masalah)|tidak ada (?:kendala|masalah)|suka banget|suka bgt|menarik|gratis|enak|👍|\b(?:ok|oke|okee|okey|okok)\b/;
// Negasi dapat menempel pada kata penilaian: "gak ribet" bukan keluhan, "tidak ok" bukan pujian.
// Pujian yang disangkal diubah menjadi kata keluhan baku (buruk), sedangkan kata keluhan yang
// disangkal dihapus. Jendela satu kata membatasi pembersihan agar frasa seperti "tidak masalah,
// semua lancar" tidak ikut tersapu.
const praiseWords = 'bagus|mantap|mantp|mantab|mantul|terbaik|keren|kereen|membantu|mempermudah|memudahkan|mudah|lancar|memuaskan|akurat|rekomendasi|recommended|puas|enak|simpel|lengkap|menarik|gratis|good|love|nice|ok|oke|okee|okok';
const complaintWords = 'jelek|cacat|rusak|lemot|lambat|ribet|repot|lelet|sia-sia|mubazir|menyesal|kecewa|buruk|payah|error|crash|gagal';
const negatedPraise = new RegExp(`\\b(?:${negation})\\b(?:\\s+[a-z]+){0,1}\\s+(?:${praiseWords})\\b`,'g');
const negatedComplaint = new RegExp(`\\b(?:${negation})\\b(?:\\s+[a-z]+){0,1}\\s+(?:${complaintWords})\\b`,'g');
const scrubNegatedPolarity = scope => scope.replace(negatedPraise,' buruk').replace(negatedComplaint,' ');
// Kualitas label otomatis diukur terhadap baris yang sudah dinilai manusia, bukan diklaim.
// 'seed' adalah korpus awal yang ikut menyusun aturan, sehingga angkanya in-sample. 'user'
// hanya memuat label yang dibuat analis di dasbor pada teks di luar korpus itu, jadi dapat
// disebut uji luar sampel selama aturan tidak disetel ulang memakai label tersebut.
// Cohen's kappa dihitung atas seluruh kategori yang benar-benar muncul, termasuk abstain.
export const classifierVersion = 'rules-v2';
export const abstainThreshold = 1.2;
export const calibrationTexts = new Set(seedReviews.map(row => String(row.text || '').trim().toLocaleLowerCase('id')));
const isCalibrationText = text => calibrationTexts.has(String(text || '').trim().toLocaleLowerCase('id'));
const manualLabelSource = row => row?.labelOrigin === 'user' && !isCalibrationText(row.text) ? 'user' : 'seed';
export function scoreClassifier(rows, classify = classifyText, { labelSource = 'all' } = {}) {
  const labels = ['positive', 'negative', 'neutral'];
  const gold = (rows || []).filter(row => row && typeof row.text === 'string' && row.text.trim()
    && labels.includes(row.sentiment) && row.labeling === 'manual'
    && (labelSource === 'all' || manualLabelSource(row) === labelSource));
  const matrix = {}; const countsGold = {}; const countsPred = {};
  let agree = 0, abstained = 0;
  for (const row of gold) {
    const predicted = classify(row.text).sentiment;
    const key = `${row.sentiment}>${predicted}`;
    matrix[key] = (matrix[key] || 0) + 1;
    countsGold[row.sentiment] = (countsGold[row.sentiment] || 0) + 1;
    countsPred[predicted] = (countsPred[predicted] || 0) + 1;
    if (predicted === row.sentiment) agree++;
    if (predicted === 'unclassified') abstained++;
  }
  const perClass = {};
  for (const label of labels) {
    const tp = matrix[`${label}>${label}`] || 0;
    const fn = (countsGold[label] || 0) - tp;
    const fp = (countsPred[label] || 0) - tp;
    if (!countsGold[label] && !countsPred[label]) { perClass[label] = null; continue; }
    const precision = tp + fp ? tp / (tp + fp) : null;
    const recall = tp + fn ? tp / (tp + fn) : null;
    perClass[label] = {
      support: countsGold[label] || 0, predicted: countsPred[label] || 0,
      precision, recall,
      f1: precision && recall ? (2 * precision * recall) / (precision + recall) : null,
    };
  }
  const n = gold.length;
  const observed = n ? agree / n : null;
  let expected = 0;
  const categories = [...new Set([...labels, ...Object.keys(countsPred)])];
  if (n) for (const category of categories) expected += ((countsGold[category] || 0) / n) * ((countsPred[category] || 0) / n);
  const present = labels.filter(label => (countsGold[label] || 0) > 0);
  const macroF1 = present.length ? present.reduce((sum, label) => sum + (perClass[label]?.f1 ?? 0), 0) / present.length : null;
  return {
    n, agree, observed,
    kappa: n && expected < 1 ? (observed - expected) / (1 - expected) : null,
    matrix, perClass, abstained, coverage: n ? (n - abstained) / n : null, macroF1, labelSource,
  };
}

// Aturan domain mempertahankan pola merchant yang sudah terbukti presisi pada data ini:
// kegagalan proses, aset yang belum masuk, penyangkalan pujian, dan riwayat yang terselesaikan.
// Hasilnya dipakai lebih dulu; leksikon di bawah menangani teks baru yang tidak dikenali pola itu.
function domainDecision(value) {
  const resolved = successMarker.test(value);
  const hopeful = value.replace(hopeClause,' ');
  // Keluhan sebelum kegagalan terselesaikan dihitung sebagai riwayat; teks sesudahnya
  // (misalnya "tapi dana belum masuk") tetap dinilai sebagai keluhan aktif. Riwayat yang
  // dilunakkan hanya kegagalan akses ("gak bisa masuk" yang lalu "akhirnya bisa masuk").
  // Keluhan dengan subjek sendiri — dana, laporan, notifikasi yang belum masuk — TIDAK ikut
  // terlunaskan oleh klausa penyelesaian, karena klausa itu tidak memperbaikinya.
  const headAt = resolved ? hopeful.search(new RegExp(resolvedHead)) : -1;
  const headResolved = headAt !== -1 && !missingAsset.test(hopeful.slice(0, headAt));
  const negativeScope = resolved && headAt !== -1
    ? `${headResolved ? hopeful.slice(0,headAt).replace(negatedAbility,' ') : hopeful.slice(0,headAt)} ${hopeful.slice(headAt).replace(resolvedClause,' ')}`
    : hopeful.replace(reassurancePhrase,' ');
  const negative = negativeRule.test(scrubNegatedPolarity(negativeScope));
  // Klausa penyelesaian ("akhirnya bisa masuk") membuktikan kepuasan hanya bila teks itu tidak
  // sedang memuji produk lain dan tidak menyisakan keluhan yang belum selesai.
  const positive = positiveRule.test(scrubNegatedPolarity(hopeful))
    || (resolved && !negative && !foreignProductClause.test(value));
  const neutral = /^(?:[1-5] bintang dulu|terima kasih atas informasinya)[.! ]*$/.test(value);
  return { sentiment: negative ? 'negative' : positive ? 'positive' : neutral ? 'neutral' : 'unclassified' };
}

// Normalisasi hanya untuk lapisan leksikon. Teks asli tidak pernah diubah dan aturan domain
// tetap membaca teks asli, sehingga label lama tidak bergeser karena ejaan diperpanjang.
const slangMap = new Map([
  ['gk','tidak'], ['gak','tidak'], ['ga','tidak'], ['ngga','tidak'], ['nggak','tidak'],
  ['kagak','tidak'], ['enggak','tidak'], ['engga','tidak'], ['tdk','tidak'], ['tak','tidak'],
  ['bgt','banget'], ['bngt','banget'], ['yg','yang'], ['dgn','dengan'], ['udh','sudah'], ['udah','sudah'],
  ['blm','belum'], ['blum','belum'], ['bnyk','banyak'], ['dr','dari'], ['krn','karena'],
  ['aja','saja'], ['gimana','bagaimana'], ['gitu','begitu'], ['sm','sama'], ['jg','juga'],
]);
export function normalizeSentimentText(text) {
  const emoji = String(text || '')
    .replace(/[\u{1F44D}\u{1F44C}\u{2764}\u{FE0F}\u{1F60D}\u{1F970}\u{1F525}\u{1F60A}\u{1F642}]/gu, ' suka ')
    .replace(/[\u{1F44E}\u{1F4A9}\u{1F621}\u{1F620}\u{1F624}\u{1F92C}\u{1F622}\u{1F62D}]/gu, ' kecewa ');
  return emoji.toLocaleLowerCase('id')
    .replace(/([a-z])\1{2,}/g, '$1')
    .replace(/[-–—]/g, ' ')
    .replace(/[\u2018\u2019']/g, '')
    .replace(/([a-z]+)/g, word => slangMap.get(word) || word)
    .replace(/[^a-z0-9\s?.!,;:()%+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
// Bobot positif dan negatif disusun dari kata penilaian Indonesia yang umum dipakai ulasan
// aplikasi. Frasa diperiksa lebih dulu agar "tidak ada masalah" tidak dihitung sebagai keluhan.
const positiveLexicon = {
  bagus: 2.5, mantap: 2.6, mantp: 2.5, mantab: 2.5, mantul: 2.4, keren: 2.4, kereen: 2.4,
  terbaik: 2.8, hebat: 2.2, memuaskan: 2.4, puas: 2.2, membantu: 2.2, terbantu: 1.8,
  mempermudah: 2.4, memudahkan: 2.4, mempermudahkan: 2.4, mudah: 1.6, simpel: 1.8,
  praktis: 1.6, lancar: 2.0, akurat: 1.7, rekomendasi: 1.8, recommended: 1.8,
  senang: 2.0, suka: 1.8, cinta: 1.8, love: 1.8, enak: 1.4, lengkap: 1.5,
  menarik: 1.4, gratis: 1.1, cepat: 1.3, baik: 1.4, good: 1.8, great: 2.2, nice: 1.8,
  excellent: 2.6, ok: 0.9, oke: 0.9, okee: 0.9, okey: 0.9, top: 1.0, fresh: 1.2,
  modern: 1.0, cakep: 1.6, kece: 1.2, nyaman: 1.4, aman: 1.1, jelas: 1.1,
  responsif: 1.6, stabil: 1.4, ramah: 1.5, profesional: 1.2, murah: 1.0, hemat: 1.0,
  untung: 0.9, alhamdulillah: 1.3, sukses: 1.2, makasih: 1.4,
};
const negativeLexicon = {
  jelek: 2.5, buruk: 2.5, parah: 2.5, rusak: 2.4, gagal: 2.5, error: 2.2, eror: 2.2,
  crash: 2.5, hang: 2.0, bug: 1.6, lambat: 2.0, lemot: 2.2, lelet: 2.0, telat: 1.8,
  terlambat: 1.8, delay: 1.5, ribet: 2.0, repot: 1.6, kerepotan: 1.8, sulit: 1.7,
  susah: 1.7, bingung: 1.5, pusing: 1.2, kecewa: 2.6, mengecewakan: 2.8, menyesal: 2.5,
  marah: 2.2, kesal: 2.2, sedih: 1.8, payah: 2.2, kacau: 2.2, berantakan: 2.0,
  kaku: 1.5, masalah: 1.5, kendala: 1.2, gangguan: 2.0, komplain: 1.2, keluhan: 1.2,
  pending: 1.0, ngguan: 1.8, gantung: 1.5, hilang: 2.0, diblokir: 2.2, blokir: 2.0,
  mahal: 1.2, denda: 1.2, scam: 3.0, penipuan: 3.0, nipu: 2.5, tipu: 2.4, bohong: 2.5,
  bodoh: 2.5, sialan: 2.5, mubazir: 2.0, mangkrak: 2.0, ditahan: 1.2,
};
const lexiconWeights = new Map([
  ...Object.entries(positiveLexicon),
  ...Object.entries(negativeLexicon).map(([term, weight]) => [term, -weight]),
]);
const phraseWeights = new Map(Object.entries({
  'tidak ada masalah': 2.2, 'tidak ada kendala': 2.2, 'tidak ada gangguan': 2.0,
  'tidak ada hambatan': 2.0, 'belum ada masalah': 2.0, 'belum ada kendala': 2.0,
  'tanpa masalah': 2.0, 'tanpa kendala': 2.0, 'tanpa gangguan': 2.0, 'terima kasih': 1.6,
  'luar biasa': 3.0, 'sangat membantu': 3.2, 'sangat memudahkan': 3.2,
  'tidak bisa': -2.4, 'tidak bisa masuk': -2.8, 'tidak bisa login': -2.8,
  'tidak dapat masuk': -2.6, 'tidak masuk': -2.2, 'belum masuk': -2.2,
  'tidak muncul': -2.0, 'belum muncul': -2.0, 'tidak update': -2.0, 'belum update': -1.8,
  'tidak berfungsi': -2.4, 'tidak jalan': -2.2, 'tidak nyambung': -1.8,
  'tidak stabil': -2.0, 'tidak jelas': -1.8, 'tidak nyaman': -2.0, 'tidak puas': -2.4,
  'tidak memuaskan': -2.4, 'tidak membantu': -2.2, 'tidak akurat': -2.0,
  'tidak sesuai': -1.8, 'tidak ada': -1.2, 'belum ada': -1.2,
  'tidak ada notifikasi': -2.2, 'tidak ada notif': -2.2, 'tidak ada respon': -2.2,
  'tidak ada respons': -2.2, 'tidak ada dana': -2.4, 'tidak ada keterangan': -1.8,
  'belum ada keterangan': -1.8, 'dana belum masuk': -2.8, 'uang belum masuk': -2.8,
  'settlement belum masuk': -2.8, 'pencairan belum masuk': -2.8,
  'lama banget': -2.2, 'lama sekali': -2.2, 'loading lama': -2.2, 'lama loading': -2.2,
  'tunggu lama': -2.0, 'nunggu lama': -2.0, 'daftar lama': -1.8, 'proses lama': -1.8,
  'masih pending': -1.7, 'force close': -2.5, 'keluar sendiri': -2.2,
  'dana hilang': -3.0, 'uang hilang': -3.0, 'kurang cepat': -1.8, 'kurang bagus': -1.8,
  'kurang jelas': -1.8, 'kurang lengkap': -1.8, 'gagal terus': -2.8, 'error terus': -2.6,
  'lemot banget': -3.0, 'kecewa berat': -3.0, 'buang waktu': -2.2, 'kode salah': -1.8,
  'pin salah': -2.0, 'password salah': -2.0, 'tidak ngguan': -2.2, 'belum selesai': -1.8,
  'tidak selesai': -2.0, 'masih diproses': -1.2, 'berhari hari': -1.8, 'sia sia': -2.2,
}));
const negators = new Set(['tidak', 'bukan', 'belum', 'jangan', 'tanpa']);
const boosters = new Set(['sangat', 'banget', 'sekali', 'amat', 'terlalu', 'paling', 'lebih', 'begitu', 'benar', 'betul']);
const diminishers = new Set(['agak', 'sedikit', 'lumayan', 'cukup', 'rada', 'hampir']);
const roundScore = value => Math.round(value * 100) / 100;
const contrastMarker = /\b(?:tapi|tetapi|namun|sedangkan|cuma|akan tetapi)\b/;
// Klausa setelah "tapi/namun" diberi bobot lebih besar, seperti aturan kontrastif VADER.
function clausesOf(text) {
  const clauses = [];
  for (const sentence of String(text || '').split(/[.!?;]+|\n+/)) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    const index = trimmed.search(contrastMarker);
    if (index > 0) {
      clauses.push({ text: trimmed.slice(0, index).trim(), weight: 0.8 });
      clauses.push({ text: trimmed.slice(index).replace(contrastMarker, ' ').trim(), weight: 1.5 });
    } else {
      clauses.push({ text: index === 0 ? trimmed.replace(contrastMarker, ' ').trim() : trimmed, weight: index === 0 ? 1.5 : 1 });
    }
  }
  return clauses.filter(clause => clause.text);
}
function scanClause(text, clauseWeight = 1) {
  const tokens = text.match(/[a-z0-9]+/g) || [];
  const consumed = new Set();
  const matches = [];
  for (let index = 0; index < tokens.length; index += 1) {
    if (consumed.has(index)) continue;
    let phrase = null;
    for (const size of [3, 2]) {
      if (index + size > tokens.length) continue;
      const key = tokens.slice(index, index + size).join(' ');
      if (phraseWeights.has(key)) { phrase = { key, size, weight: phraseWeights.get(key) }; break; }
    }
    if (phrase) {
      for (let offset = 0; offset < phrase.size; offset += 1) consumed.add(index + offset);
      const boost = tokens.slice(Math.max(0, index - 2), index).some(token => boosters.has(token)) ? 1.4 : 1;
      matches.push({ term: phrase.key, weight: roundScore(phrase.weight * clauseWeight * boost), negated: false });
      index += phrase.size - 1;
      continue;
    }
    const weight = lexiconWeights.get(tokens[index]);
    if (!weight) continue;
    consumed.add(index);
    const before = tokens.slice(Math.max(0, index - 3), index);
    const after = tokens.slice(index + 1, index + 3);
    const negated = before.some(token => negators.has(token));
    const kurang = before.includes('kurang');
    const boost = before.some(token => boosters.has(token)) || after.some(token => boosters.has(token));
    const diminish = before.some(token => diminishers.has(token)) || after.some(token => diminishers.has(token));
    let adjusted = weight * (boost ? 1.45 : 1) * (diminish ? 0.7 : 1);
    // "kurang bagus" membalik arah; negasi biasa memakai pelunakan 0,74 seperti VADER.
    if (kurang) adjusted = -Math.sign(weight) * Math.max(0.8, Math.abs(weight) * 0.8);
    else if (negated) adjusted = weight > 0 ? -weight * 0.74 : Math.abs(weight) * 0.35;
    matches.push({ term: tokens[index], weight: roundScore(adjusted * clauseWeight), negated });
  }
  return matches;
}
function scanPolarity(text) {
  const matches = clausesOf(text).flatMap(clause => scanClause(clause.text, clause.weight));
  return {
    score: roundScore(matches.reduce((sum, match) => sum + match.weight, 0)),
    positive: matches.filter(match => match.weight > 0).sort((a, b) => b.weight - a.weight),
    negative: matches.filter(match => match.weight < 0).sort((a, b) => a.weight - b.weight),
  };
}
const evidenceOf = matches => matches.slice(0, 3).map(match => `${match.term}${match.negated ? ' (dinegasi)' : ''} ${match.weight > 0 ? '+' : '-'}${Math.abs(match.weight).toFixed(2)}`);
// Polaritas per aspek berasal dari kalimat yang benar-benar menyebut aspek itu. Bila ulasan
// hanya membahas satu aspek, label keseluruhan memang berlaku untuk aspek tersebut; bila
// beberapa aspek tercampur tanpa penanda, aspek itu tidak diberi angka agar tidak dikarang.
// Kata benda aspek sering memakai akhiran -nya ("tampilannya", "navigasinya"); tanpa akhiran
// itu banyak keluhan aspek nyata tidak terpetakan dan polaritasnya jatuh ke "tidak terpisah".
const aspectCueRules = {
  payment: /\b(?:qris|transaksi(?:nya)?|pembayaran(?:nya)?|settlement|settelment|pencairan(?:nya)?|notifikasi(?:nya)?|notif(?:nya)?|mutasi|saldo|dana|uang|edc)\b/i,
  access: /\b(?:daftar|pendaftaran(?:nya)?|registrasi|verifikasi(?:nya)?|approval|approve|pengajuan(?:nya)?|login|password|pasword|otp|pin|akun|migrasi|beralih)\b/i,
  performance: /\b(?:loading|memuat|lemot|lelet|lambat|crash|error|hang|gangguan|ngguan|refresh|stabil|cepat)\b/i,
  uxui: /\b(?:tampilan(?:nya)?|tema(?:nya)?|desain(?:nya)?|mudah|simpel|navigasi(?:nya)?|fitur(?:nya)?|menu(?:nya)?|fresh|menarik|kaku|warna(?:nya)?)\b/i,
  service: /\b(?:cs|customer|service|pelayanan(?:nya)?|layanan(?:nya)?|komplain|tiket|respon(?:nya)?|respons(?:nya)?|petugas(?:nya)?)\b/i,
};
export function aspectPolarity(review) {
  const info = absaOf(review);
  if (!info.aspects.length) return [];
  const clauses = clausesOf(normalizeSentimentText(review?.text || ''));
  return info.aspects.map(id => {
    const rule = aspectCueRules[id];
    const relevant = rule ? clauses.filter(clause => rule.test(clause.text)) : [];
    if (relevant.length) {
      const score = roundScore(relevant.reduce((sum, clause) => sum + scanPolarity(clause.text).score, 0));
      const sentiment = score >= abstainThreshold ? 'positive' : score <= -abstainThreshold ? 'negative' : 'unclassified';
      return { id, sentiment, score, basis: 'kalimat' };
    }
    if (info.aspects.length === 1 && ['positive', 'negative', 'neutral'].includes(review?.sentiment))
      return { id, sentiment: review.sentiment, score: null, basis: 'seluruh teks' };
    return { id, sentiment: null, score: null, basis: 'tidak terpisah' };
  });
}

export function classifyText(text) {
  const value = String(text ?? '').toLocaleLowerCase('id').replace(/\s+/g,' ');
  const reviewTags = Object.entries(topicRules).filter(([,rule]) => rule.test(value)).map(([tag]) => tag);
  const domain = domainDecision(value);
  const normalized = normalizeSentimentText(value.replace(hopeClause, ' '));
  const lexical = scanPolarity(normalized);
  let sentiment, engine;
  if (domain.sentiment === 'negative' || domain.sentiment === 'positive') {
    sentiment = domain.sentiment;
    engine = 'domain';
  } else if (domain.sentiment === 'neutral') {
    sentiment = 'neutral';
    engine = 'neutral';
  } else if (lexical.score >= abstainThreshold) {
    sentiment = 'positive';
    engine = 'lexicon';
  } else if (lexical.score <= -abstainThreshold) {
    sentiment = 'negative';
    engine = 'lexicon';
  } else {
    sentiment = 'unclassified';
    engine = 'abstain';
  }
  const confidence = sentiment === 'unclassified' ? null
    : engine === 'lexicon' ? roundScore(Math.min(0.9, 0.5 + (Math.abs(lexical.score) - abstainThreshold) * 0.1))
    : engine === 'neutral' ? 0.7
    : roundScore(Math.min(0.95, (Math.abs(lexical.score) >= 1 ? 0.9 : 0.76) + (Math.abs(lexical.score) >= 3 ? 0.04 : 0)));
  const positiveEvidence = evidenceOf(lexical.positive);
  const negativeEvidence = evidenceOf(lexical.negative);
  const evidence = [
    positiveEvidence.length ? `positif: ${positiveEvidence.join(', ')}` : '',
    negativeEvidence.length ? `negatif: ${negativeEvidence.join(', ')}` : '',
  ].filter(Boolean).join('; ');
  const method = engine === 'domain'
    ? 'Aturan domain mengenali pola merchant, dan leksikon berbobot dipakai untuk memeriksa arah.'
    : engine === 'lexicon'
      ? 'Aturan domain tidak menemukan pola yang cukup, sehingga leksikon berbobot menentukan arah.'
      : engine === 'neutral' ? 'Teks cocok dengan pola netral eksplisit.' : 'Leksikon tidak menemukan sinyal polaritas yang cukup kuat.';
  const rationale = sentiment === 'unclassified'
    ? `Mesin hybrid ${classifierVersion} tidak menemukan sinyal polaritas yang cukup kuat (skor leksikon ${lexical.score > 0 ? '+' : ''}${lexical.score.toFixed(2)}; ambang ±${abstainThreshold.toFixed(2)}). ${method} Tidak dihitung sebagai netral; perlu ditinjau secara manual.`
    : `Dinilai otomatis oleh mesin hybrid ${classifierVersion} (${sentimentNames[sentiment].toLowerCase()}). ${method}${evidence ? ` Bukti leksikon: ${evidence}.` : ' Tidak ada kata penilaian yang dikenali leksikon.'} Klausa harapan dan kegagalan yang sudah selesai ("akhirnya bisa masuk") tidak dihitung sebagai keluhan aktif, tetapi teks sesudahnya tetap dinilai. Keyakinan aturan ${Math.round(confidence * 100)}% — bukan probabilitas terkalibrasi. Belum diperiksa manusia; sarkasme, bahasa campur, dan ulasan multiaspek dapat dinilai keliru.`;
  return {
    sentiment, tags: reviewTags.length ? reviewTags : ['general'], labeling: classifierVersion,
    confidence, score: lexical.score, engine, evidence: { positive: lexical.positive.slice(0, 3).map(m => m.term), negative: lexical.negative.slice(0, 3).map(m => m.term) },
    rationale,
  };
}
// Satu daftar kata konteks merchant, dipakai bersama oleh kolektor dan penyaring relevansi.
// Daftarnya sengaja tidak dipakai sendirian untuk menerima teks: "qris" atau "toko" saja juga
// dimiliki bank lain, jadi identitas produk tetap syarat utama dan yang dibuang dicatat.
export const merchantKeywords = ['wondr merchant', 'merchant', 'qris', 'edc', 'settlement', 'pencairan', 'toko', 'kasir'];
const merchantContext = new RegExp(`\\b(?:${merchantKeywords.join('|')})\\b`, 'i');
const productIdentity = /\bwondr\s+merchant\b|\bid\.bni\.wfb(?![\w.])|\b(?:id)?6741567238\b/i;
const neverMatch = /(?!)/;
const escapeRegExp = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const builtInTargetId = 'wondr-merchant';
// Aturan merek untuk target bawaan dipertahankan apa adanya — termasuk penyaring aplikasi
// konsumen BNI dan daftar akun resmi — karena keduanya berasal dari pengetahuan merek, bukan
// dari data target, dan label yang sudah tersimpan tidak boleh berubah.
const builtInRules = {
  label: 'wondr merchant',
  productKey: builtInTargetId,
  identity: /\bwondr\s+merchant\b|\bid\.bni\.wfb(?![\w.])/i,
  product: productIdentity,
  context: merchantContext,
  sibling: /\bwondr\s+by\s+bni\b|mobile banking|bni mobile|m[- ]?banking/i,
  otherProduct: /\b(?:aplikasi|qris|mesin)\s+(?:bank\s+)?lain\b|aplikasi\s+sebelah|bukan\s+wondr/i,
  official: /^(?:bni(?:[\W_]*46)?|official[\W_]*bni(?:[\W_]*46)?|bni[\W_]*official(?:[\W_]*46)?|wondr[\W_]*merchant(?:[\W_]*by[\W_]*bni)?)$/i,
  storeConsumerReason: 'Teks ulasan toko menyebut aplikasi konsumen BNI, bukan wondr merchant; perlu diperiksa manusia sebelum dihitung sebagai pengalaman merchant.',
  officialReason: author => `Penulis "${author}" adalah akun resmi BNI atau produk ini, sehingga isinya promosi pemilik, bukan pengalaman pelanggan independen.`,
  siblingReason: both => both
    ? 'Teks juga membahas produk konsumen. Target sentimen belum dipisahkan, sehingga teks tidak dinilai otomatis sebagai pengalaman wondr merchant.'
    : 'Teks menyebut produk konsumen, bukan wondr merchant.',
  otherProductReason: 'Teks mengarah ke aplikasi atau perangkat milik pihak lain, bukan pengalaman menggunakan wondr merchant.',
  vagueReason: 'Komentar pada video terkait belum cukup untuk memastikan pengalaman terhadap aplikasi merchant.',
  relevantReason: 'Teks menyebut aplikasi merchant atau aspek usaha pada video dengan identitas produk yang sesuai; penentuan otomatis masih perlu pemeriksaan manusia.',
};
const targetWords = target => String(target?.entityName || target?.name || '')
  .normalize('NFKD').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);

// Aturan relevansi diturunkan dari target project, supaya project kedua tidak otomatis kehilangan
// sentimen hanya karena teksnya menyebut aplikasinya sendiri, bukan wondr merchant. Target lain
// juga tidak menyaring teks karena merek saudara yang tidak dikenalnya.
export function rulesFor(target) {
  if (!target || isWondrTarget(target)) return builtInRules;
  const words = targetWords(target);
  const label = target.name || target.entityName || 'project ini';
  const identityParts = [];
  if (words.length) identityParts.push(`\\b${words.join('\\s+')}\\b`);
  if (target.play?.appId) identityParts.push(`\\b${escapeRegExp(target.play.appId)}(?![\\w.])`);
  const parts = [...identityParts];
  if (target.appstore?.appId) parts.push(`\\b(?:id)?${escapeRegExp(target.appstore.appId)}\\b`);
  const pattern = list => (list.length ? new RegExp(list.join('|'), 'i') : neverMatch);
  const handle = words.join('[\\W_]*');
  return {
    label,
    productKey: target.id,
    identity: pattern(identityParts),
    product: pattern(parts),
    // Tanpa daftar kata konteks merek, identitas target satu-satunya bukti yang dapat dipakai.
    context: pattern(identityParts),
    sibling: null,
    otherProduct: pattern([
      '\\b(?:aplikasi|situs|layanan|qris|mesin)\\s+lain\\b', 'aplikasi\\s+sebelah',
      ...(words[0] ? [`bukan\\s+${escapeRegExp(words[0])}`] : []),
    ]),
    official: words.length ? new RegExp(`^(?:official[\\W_]*${handle}|${handle}[\\W_]*official|${handle})$`, 'i') : neverMatch,
    storeConsumerReason: '',
    officialReason: author => `Penulis "${author}" adalah akun resmi ${label}, sehingga isinya promosi pemilik, bukan pengalaman pelanggan independen.`,
    siblingReason: () => `Teks tidak dinilai otomatis karena identitas ${label} belum pasti pada teks ini.`,
    otherProductReason: `Teks mengarah ke aplikasi atau perangkat milik pihak lain, bukan pengalaman menggunakan ${label.toLowerCase()}.`,
    vagueReason: `Komentar pada video terkait belum cukup untuk memastikan pengalaman terhadap aplikasi ${label.toLowerCase()}.`,
    relevantReason: `Teks menyebut identitas ${label} atau aspek usaha pada video dengan identitas produk yang sesuai; penentuan otomatis masih perlu pemeriksaan manusia.`,
  };
}
export const hasMerchantContext = (value, target = null) => {
  const text = String(value || '');
  const rules = rulesFor(target);
  return rules.product.test(text) || rules.context.test(text);
};
export function classifyReview(raw, target = null) {
  const rules = rulesFor(target);
  const label = classifyText(raw.text);
  const text = raw.text.toLocaleLowerCase('id');
  const merchant = rules.identity.test(text);
  const consumer = rules.sibling ? rules.sibling.test(text) : false;
  // Keluhan yang jelas ditujukan ke aplikasi lain bukan pengalaman produk ini.
  const otherApp = rules.otherProduct.test(text);
  // Akun resmi pemilik produk mengiklankan aplikasinya sendiri. Teks seperti itu
  // disimpan sebagai konteks, tetapi tidak dihitung sebagai sentimen pelanggan.
  const handle = String(raw.author ?? '').replace(/^@+/, '').trim().toLowerCase();
  const officialAccount = rules.official.test(handle);
  const promotion = /(?:^|[.!?:]|\b(?:ayo|yuk|buruan|segera)\b)\s*(?:download|unduh|install)\b|\bdapatkan\s+(?:cashback|bonus|promo)\b|\binfo\s+promo\b/;
  const question = /\b(?:apakah|kalau|jika|seandainya|bisakah)\b|\bbelum\s+(?:pernah\s+)?(?:mencoba|coba|pakai|menggunakan)\b/;
  if (raw.platform === 'play' || raw.platform === 'appstore') {
    // Akun resmi pemilik produk di halaman toko tetap promosi pemilik, bukan pengalaman
    // pelanggan independen; penyaringnya berlaku di semua kanal, bukan hanya media sosial.
    if (officialAccount) {
      const reason = rules.officialReason(raw.author);
      return { ...label, sentiment:'unclassified', confidence:null, engine:'relevance-gate', tags:['general'], relevance:{ status:'excluded', reason, method:'merchant-context-v1' }, rationale:`${reason} Tetap tersimpan dan dihitung dalam total teks, tetapi tidak dalam persentase sentimen atau NSS.` };
    }
    // Bintang 1 yang isinya memuji aplikasi sebelah ("pindah ke yang sebelah, jauh lebih bagus")
    // bukan pengalaman produk ini, meskipun bentuknya ulasan toko.
    if (otherApp) {
      const reason = rules.otherProductReason;
      return { ...label, sentiment:'unclassified', confidence:null, engine:'relevance-gate', tags:['general'], relevance:{ status:'uncertain', reason, method:'merchant-context-v1' }, rationale:`${reason} Tetap tersimpan dan dihitung dalam total teks, tetapi tidak dalam persentase sentimen atau NSS.` };
    }
    // Tanya-jawab atau "belum pernah mencoba" di halaman toko belum menjadi pengalaman pakai.
    if (question.test(text)) {
      const reason = rules.vagueReason;
      return { ...label, sentiment:'unclassified', confidence:null, engine:'relevance-gate', tags:['general'], relevance:{ status:'uncertain', reason, method:'merchant-context-v1' }, rationale:`${reason} Tetap tersimpan dan dihitung dalam total teks, tetapi tidak dalam persentase sentimen atau NSS.` };
    }
    // Ulasan toko dinilai langsung dari teksnya. Teks yang hanya menyebut aplikasi konsumen
    // BNI tidak boleh dihitung sebagai pengalaman merchant.
    if (!consumer || merchant) return label;
    const reason = rules.storeConsumerReason;
    return { ...label, sentiment:'unclassified', confidence:null, engine:'relevance-gate', tags:['general'], relevance:{ status:'uncertain', reason, method:'merchant-context-v1' }, rationale:`${reason} Tetap tersimpan dan dihitung dalam total teks, tetapi tidak dalam persentase sentimen atau NSS.` };
  }
  let status = 'uncertain', reason = rules.vagueReason;
  if (officialAccount) {
    status = 'excluded'; reason = rules.officialReason(raw.author);
  } else if (raw.authorChannelId && raw.authorChannelId === raw.context?.channelId) {
    status = 'excluded'; reason = 'Balasan pemilik video disimpan sebagai konteks, bukan opini pelanggan independen.';
  } else if (['news', 'blog', 'forum'].includes(raw.platform)) {
    status = 'excluded'; reason = 'Pemberitaan atau artikel ditulis bukan oleh pengguna yang mengalami aplikasi, sehingga disimpan sebagai konteks liputan, bukan sentimen pelanggan.';
  } else if (promotion.test(text)) {
    status = 'excluded'; reason = 'Ajakan promosi tidak diperlakukan sebagai pengalaman pelanggan.';
  } else if (consumer) {
    status = 'excluded'; reason = rules.siblingReason(merchant);
  } else if (otherApp) {
    reason = rules.otherProductReason;
  } else if (question.test(text)) {
    reason = 'Pertanyaan, kondisi hipotetis, atau pernyataan belum mencoba belum cukup untuk menetapkan pengalaman pelanggan; perlu tinjauan konteks.';
  } else if (merchant || (raw.platform === 'youtube' && raw.context?.product === rules.productKey && rules.context.test(text) && label.tags.some(tag => tag !== 'general'))) {
    status = 'relevant'; reason = rules.relevantReason;
  }
  const relevance = {status,reason,method:'merchant-context-v1'};
  if (status === 'relevant') return {...label,relevance};
  return {...label,sentiment:'unclassified',confidence:null,engine:'relevance-gate',tags:['general'],relevance,rationale:`${reason} Tetap tersimpan dan dihitung dalam total teks, tetapi tidak dalam persentase sentimen atau NSS.`};
}
const fingerprint = r => ['play','appstore'].includes(r.platform) && r.author && r.author !== 'N/A' && r.date ? `${r.platform}|${r.author.trim().toLowerCase()}|${r.date}|${r.text.trim().toLowerCase()}` : null;
export function upsertReviews(existing, incoming, observedAt, target = null) {
  const reviews = existing.map(r => ({ ...r }));
  const ids = new Map(reviews.map((r,i) => [`${r.platform}|${r.id}`, i]));
  const prints = new Map(reviews.map((r,i) => [fingerprint(r), i]).filter(([key]) => key));
  let added = 0, updated = 0, unchanged = 0;
  for (const raw of incoming) {
    const key = `${raw.platform}|${raw.id}`, print = fingerprint(raw);
    const index = ids.get(key) ?? (print ? prints.get(print) : undefined);
    if (index === undefined) {
      const r = { ...raw, ...classifyReview(raw, target), observedAt, firstSeenAt: observedAt, lastSeenAt: observedAt, history: [] };
      ids.set(key,reviews.length); if (print) prints.set(print,reviews.length);
      reviews.push(r); added++;
    } else {
      const old = reviews[index];
      const contextChanged = raw.platform === 'youtube' && (['publishedAt','updatedAt','authorChannelId','parentId'].some(k => (old[k] ?? null) !== (raw[k] ?? null)) || JSON.stringify(old.context) !== JSON.stringify(raw.context));
      const changed = contextChanged || ['text','title','rating','date','author'].some(k => (old[k] ?? null) !== (raw[k] ?? null));
      const textChanged = old.text !== raw.text || (old.title ?? '') !== (raw.title ?? '');
      const history = [...(old.history || [])];
      if (changed) { const { history: ignored, ...version } = old; history.push(version); updated++; } else unchanged++;
      const oldPrint = fingerprint(old);
      if (oldPrint) prints.delete(oldPrint);
      // Label manual hanya sah untuk teks yang benar-benar dinilai manusia. Teks sumber yang
      // berubah membatalkan label itu; label otomatis dihitung ulang, bukan diwarisi.
      const keepsManual = old.labeling === 'manual' && !textChanged;
      const refreshed = keepsManual ? {} : textChanged || raw.platform === 'youtube' ? classifyReview(raw, target) : {};
      const next = { ...old, ...raw, id: old.id };
      for (const field of ['sentiment','tags','rationale','labeling','confidence','score','engine','evidence','relevance','labelOrigin','labeledAt','labelHistory']) {
        if (field in old) next[field] = old[field]; else delete next[field];
      }
      Object.assign(next, refreshed);
      if (textChanged) {
        for (const field of ['labelOrigin','labeledAt','labelHistory']) delete next[field];
        if (!('relevance' in refreshed)) delete next.relevance;
      }
      reviews[index] = { ...next, observedAt, firstSeenAt: old.firstSeenAt || old.observedAt, lastSeenAt: observedAt, history };
      ids.set(key,index); if (print) prints.set(print,index);
    }
  }
  return { reviews, added, updated, unchanged };
}
export function exportCsv(reviews) {
  const columns = ['id','platform','author','date','rating','sentiment','relevance','aspects','emotions','emotion','intent','text','tags','sourceUrl','rationale','labeling'];
  const cell = value => {
    // Kolom yang kosong ditulis "N/A", bukan string kosong, supaya pembeda "tidak ada" dan
    // "belum dihitung" tetap terbaca setelah berkas dibuka di lembar kerja.
    let text = Array.isArray(value) ? value.join(';') : String(value ?? '');
    if (text === '') text = 'N/A';
    if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"','""') + '"';
  };
  return '\uFEFF' + [columns.join(','), ...reviews.map(r => {
    // Aspek dihitung ulang agar baris CSV memakai label yang sama dengan grafik di layar.
    const row = { ...r, ...absaOf(r), relevance: r.relevance?.status ?? 'N/A' };
    return columns.map(k => cell(k === 'tags' ? (r.tags || []).join(';') : row[k])).join(',');
  })].join('\r\n');
}
