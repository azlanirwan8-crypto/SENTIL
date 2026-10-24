import { tags } from './data.js';

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
function nssRatio(positive, negative) {
  return positive + negative > 0 ? (positive - negative) / (positive + negative) * 100 : null;
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
  if (negative.observed < minEvents || positive.observed < minEvents) return { ...base, reason: `Ulasan berlabel pada ${weekLabels.length} pekan ini masih sedikit (positif ${positive.observed}, negatif ${negative.observed}). Proyeksi tidak dihitung supaya rentang angkanya tidak menyesatkan.` };
  const bounds = [nssRatio(positive.low, negative.high), nssRatio(positive.high, negative.low)].filter(value => value !== null);
  const nssPoint = nssRatio(positive.projected, negative.projected);
  const themes = painGroups.map(group => ({ name: group.name, owner: group.owner, action: group.action, ...model(series(r => r.sentiment === 'negative' && r.tags.some(t => group.tags.includes(t)))) }))
    .filter(theme => theme.observed > 0)
    .sort((a,b) => b.projected - a.projected || b.observed - a.observed);
  return {
    ...base, ok: true, negative, positive, themes,
    signal: conclusion(negative, positive),
    nssCurrent: summary(dated).nss,
    nssProjected: { point: nssPoint, low: bounds.length ? Math.min(...bounds) : null, high: bounds.length ? Math.max(...bounds) : null },
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
  const count = Math.min(settings.maxBuckets, Math.floor((last - first) / size) + 1);
  const negative = new Array(count).fill(0), total = new Array(count).fill(0), members = Array.from({ length: count }, () => []);
  for (let i = 0; i < used.length; i++) {
    const index = Math.floor((starts[i] - first) / size);
    if (index < 0 || index >= count) continue;
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
    findings.push({ start: first + index * size, end: first + (index + 1) * size, negative: negative[index], total: total[index], baseline, increasePct, reviews: members[index] });
  }
  findings.sort((a, b) => b.increasePct - a.increasePct || b.start - a.start);
  const reason = findings.length ? null
    : `Tidak ada satu pun jendela ${anomalyWindowNames[base.window]} dengan ${settings.minCurrent}+ ulasan negatif yang melampaui ${settings.thresholdPct}% di atas rata-rata ${baselineWindows} jendela sebelumnya (rentang ${count} jendela diperiksa).`;
  return { ...base, ok: findings.length > 0, findings, peak: findings[0] || null, buckets: count, span: { first, last }, reason };
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
export function nssBand(nss) {
  if (nss === null || !Number.isFinite(nss)) return null;
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
  const days = [];
  const cursor = new Date(`${first}T00:00:00Z`);
  while (days.length < maxDays && days.length < span) {
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
    day.nss = nssRatio(day.positive, day.negative);
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
  { id: 'access', name: 'Masuk, OTP & keamanan akun', tags: ['login', 'onboarding', 'migration'] },
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
  return reviews.map(review => {
    const { aspects, emotions, emotion, intent } = absaOf(review);
    return review.aspects?.length === aspects.length && review.emotions?.length === emotions.length && review.emotion === emotion && review.intent === intent
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
const negation = 'tidak|belum|blum|blm|ga|gak|nggak|ngga|kagak|enggak|tak|tdk';
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
const missingAsset = new RegExp(`\\b(?:dana|uang|settlement|transaksi|laporan|notifikasi|notif)\\b[^.!?]{0,25}?\\b(?:${negation})\\s+masuk\\b`);
const negativeRule = new RegExp(`gagal|lambat|lemot|ribet|repot|jelek|cacat|rusak|lelet|sia-sia|mubazir|menyesal|kecewa|buruk|payah|gangguan|ga ngguan|error|crash|loading lama|lama banget|lama bgt|tidak bagus|kurang (?:cepat|bagus)|\\b(?:${negation})\\s+(?:bisa|ada|update|acc|selesai)\\b|(?:notifikasi|notif|settlement).{0,20}(?:hilang|telat)|${missingAsset.source}|tidak menyelesaikan|bankke`);
const positiveRule = /bagus|mantap|mantp|keren|kereen|membantu|mempermudah|memudahkan|mudah digunakan|lancar|memuaskan|akurat|rekomendasi|nice app|good|love|lengkap|lebih cepat|tanpa (?:kendala|masalah)|tidak ada (?:kendala|masalah)|^ok(?:e)?[.! ]*$/;
export function classifyText(text) {
  const value = text.toLocaleLowerCase('id').replace(/\s+/g,' ');
  const reviewTags = Object.entries(topicRules).filter(([,rule]) => rule.test(value)).map(([tag]) => tag);
  const resolved = successMarker.test(value);
  const hopeful = value.replace(hopeClause,' ');
  // Keluhan sebelum kegagalan terselesaikan dihitung sebagai riwayat; teks sesudahnya
  // (misalnya "tapi dana belum masuk") tetap dinilai sebagai keluhan aktif.
  const headAt = resolved ? hopeful.search(new RegExp(resolvedHead)) : -1;
  const negativeScope = resolved && headAt !== -1
    ? `${hopeful.slice(0,headAt).replace(negatedAbility,' ')} ${hopeful.slice(headAt).replace(resolvedClause,' ')}`
    : hopeful.replace(reassurancePhrase,' ');
  const negative = negativeRule.test(negativeScope);
  const positive = positiveRule.test(hopeful) || (resolved && !negative);
  const neutral = /^(?:[1-5] bintang dulu|terima kasih atas informasinya)[.! ]*$/.test(value);
  const sentiment = negative ? 'negative' : positive ? 'positive' : neutral ? 'neutral' : 'unclassified';
  return { sentiment, tags: reviewTags.length ? reviewTags : ['general'], labeling: 'rules-v1', rationale: sentiment === 'unclassified' ? 'Pola teks belum cukup untuk menentukan sentimen. Tidak dihitung sebagai netral; perlu ditinjau secara manual.' : `Klasifikasi otomatis berbasis aturan kata kunci pada teks (${sentimentNames[sentiment].toLowerCase()}), bukan penilaian bintang. Klausa harapan dan kegagalan yang sudah selesai ("akhirnya bisa masuk") tidak dihitung sebagai keluhan aktif, tetapi teks sesudah klausa itu tetap dinilai. Belum diperiksa manusia; negasi, sarkasme, dan ulasan dengan beberapa aspek dapat dinilai keliru.` };
}
// Satu daftar kata konteks merchant, dipakai bersama oleh kolektor dan penyaring relevansi.
// Daftarnya sengaja tidak dipakai sendirian untuk menerima teks: "qris" atau "toko" saja juga
// dimiliki bank lain, jadi identitas produk tetap syarat utama dan yang dibuang dicatat.
export const merchantKeywords = ['wondr merchant', 'merchant', 'qris', 'edc', 'settlement', 'pencairan', 'toko', 'kasir'];
const merchantContext = new RegExp(`\\b(?:${merchantKeywords.join('|')})\\b`, 'i');
const productIdentity = /\bwondr\s+merchant\b|\bid\.bni\.wfb(?![\w.])|\b(?:id)?6741567238\b/i;
export const hasMerchantContext = value => productIdentity.test(String(value || '')) || merchantContext.test(String(value || ''));
export function classifyReview(raw) {
  const label = classifyText(raw.text);
  const text = raw.text.toLocaleLowerCase('id');
  const merchant = /\bwondr\s+merchant\b|\bid\.bni\.wfb(?![\w.])/.test(text);
  const consumer = /\bwondr\s+by\s+bni\b|mobile banking|bni mobile|m[- ]?banking/.test(text);
  // Keluhan yang jelas ditujukan ke aplikasi lain bukan pengalaman produk ini.
  const otherApp = /\b(?:aplikasi|qris|mesin)\s+(?:bank\s+)?lain\b|aplikasi\s+sebelah|bukan\s+wondr/.test(text);
  // Akun resmi pemilik produk mengiklankan aplikasinya sendiri. Teks seperti itu
  // disimpan sebagai konteks, tetapi tidak dihitung sebagai sentimen pelanggan.
  const handle = String(raw.author ?? '').replace(/^@+/, '').trim().toLowerCase();
  const officialAccount = /^(?:bni(?:[\W_]*46)?|official[\W_]*bni(?:[\W_]*46)?|bni[\W_]*official(?:[\W_]*46)?|wondr[\W_]*merchant(?:[\W_]*by[\W_]*bni)?)$/.test(handle);
  if (raw.platform === 'play' || raw.platform === 'appstore') {
    // Ulasan toko dinilai langsung dari teksnya. Teks yang hanya menyebut aplikasi konsumen
    // BNI tidak boleh dihitung sebagai pengalaman merchant.
    if (!consumer || merchant) return label;
    const reason = 'Teks ulasan toko menyebut aplikasi konsumen BNI, bukan wondr merchant; perlu diperiksa manusia sebelum dihitung sebagai pengalaman merchant.';
    return { ...label, sentiment:'unclassified', tags:['general'], relevance:{ status:'uncertain', reason, method:'merchant-context-v1' }, rationale:`${reason} Tetap tersimpan dan dihitung dalam total teks, tetapi tidak dalam persentase sentimen atau NSS.` };
  }
  const promotion = /(?:^|[.!?:]|\b(?:ayo|yuk|buruan|segera)\b)\s*(?:download|unduh|install)\b|\bdapatkan\s+(?:cashback|bonus|promo)\b|\binfo\s+promo\b/.test(text);
  const question = /\b(?:apakah|kalau|jika|seandainya|bisakah)\b|\bbelum\s+(?:pernah\s+)?(?:mencoba|coba|pakai|menggunakan)\b/.test(text);
  let status = 'uncertain', reason = 'Komentar pada video terkait belum cukup untuk memastikan pengalaman terhadap aplikasi merchant.';
  if (officialAccount) {
    status = 'excluded'; reason = `Penulis "${raw.author}" adalah akun resmi BNI atau produk ini, sehingga isinya promosi pemilik, bukan pengalaman pelanggan independen.`;
  } else if (raw.authorChannelId && raw.authorChannelId === raw.context?.channelId) {
    status = 'excluded'; reason = 'Balasan pemilik video disimpan sebagai konteks, bukan opini pelanggan independen.';
  } else if (['news', 'blog', 'forum'].includes(raw.platform)) {
    status = 'excluded'; reason = 'Pemberitaan atau artikel ditulis bukan oleh pengguna yang mengalami aplikasi, sehingga disimpan sebagai konteks liputan, bukan sentimen pelanggan.';
  } else if (promotion) {
    status = 'excluded'; reason = 'Ajakan promosi tidak diperlakukan sebagai pengalaman pelanggan.';
  } else if (consumer) {
    status = 'excluded'; reason = merchant ? 'Teks juga membahas produk konsumen. Target sentimen belum dipisahkan, sehingga teks tidak dinilai otomatis sebagai pengalaman wondr merchant.' : 'Teks menyebut produk konsumen, bukan wondr merchant.';
  } else if (otherApp) {
    reason = 'Teks mengarah ke aplikasi atau perangkat milik pihak lain, bukan pengalaman menggunakan wondr merchant.';
  } else if (question) {
    reason = 'Pertanyaan, kondisi hipotetis, atau pernyataan belum mencoba belum cukup untuk menetapkan pengalaman pelanggan; perlu tinjauan konteks.';
  } else if (merchant || (raw.platform === 'youtube' && raw.context?.product === 'wondr-merchant' && merchantContext.test(text) && label.tags.some(tag => tag !== 'general'))) {
    status = 'relevant'; reason = 'Teks menyebut aplikasi merchant atau aspek usaha pada video dengan identitas produk yang sesuai; penentuan otomatis masih perlu pemeriksaan manusia.';
  }
  const relevance = {status,reason,method:'merchant-context-v1'};
  if (status === 'relevant') return {...label,relevance};
  return {...label,sentiment:'unclassified',tags:['general'],relevance,rationale:`${reason} Tetap tersimpan dan dihitung dalam total teks, tetapi tidak dalam persentase sentimen atau NSS.`};
}
const fingerprint = r => ['play','appstore'].includes(r.platform) && r.author && r.author !== 'N/A' && r.date ? `${r.platform}|${r.author.trim().toLowerCase()}|${r.date}|${r.text.trim().toLowerCase()}` : null;
export function upsertReviews(existing, incoming, observedAt) {
  const reviews = existing.map(r => ({ ...r }));
  const ids = new Map(reviews.map((r,i) => [`${r.platform}|${r.id}`, i]));
  const prints = new Map(reviews.map((r,i) => [fingerprint(r), i]).filter(([key]) => key));
  let added = 0, updated = 0, unchanged = 0;
  for (const raw of incoming) {
    const key = `${raw.platform}|${raw.id}`, print = fingerprint(raw);
    const index = ids.get(key) ?? (print ? prints.get(print) : undefined);
    if (index === undefined) {
      const r = { ...raw, ...classifyReview(raw), observedAt, firstSeenAt: observedAt, lastSeenAt: observedAt, history: [] };
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
      reviews[index] = { ...old, ...raw, id: old.id, ...(textChanged || raw.platform === 'youtube' ? classifyReview(raw) : {}), observedAt, firstSeenAt: old.firstSeenAt || old.observedAt, lastSeenAt: observedAt, history };
      ids.set(key,index); if (print) prints.set(print,index);
    }
  }
  return { reviews, added, updated, unchanged };
}
export function exportCsv(reviews) {
  const columns = ['id','platform','author','date','rating','sentiment','aspects','emotions','emotion','intent','text','tags','sourceUrl','rationale','labeling'];
  const cell = value => {
    let text = Array.isArray(value) ? value.join(';') : String(value ?? '');
    if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"','""') + '"';
  };
  return '\uFEFF' + [columns.join(','), ...reviews.map(r => {
    const row = { ...absaOf(r), ...r };
    return columns.map(k => cell(k === 'tags' ? (r.tags || []).join(';') : row[k])).join(',');
  })].join('\r\n');
}
