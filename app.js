import { platforms, tags, tagColors } from './data.js';
import { summary, filterReviews, groupStats, featureGroups, painGroups, positiveGroups, sentimentNames, complaintStats, complaintBreakdown, ratingSummary, projection, projectionMethod, projectionTrends, projectionSignals, absaOf, aspectStats, clusterStats, painClusters, aspectNames, emotionNames, intentNames, exportCsv, anomalyScan, anomalyDefaults, anomalyWindowNames, scoreClassifier, nssBand, nssBands, nssMinSample, dailySeries, spikeBadges, platformMatrix, aspectChannelRings, squarify, painTreemapNodes } from './model.js';
import { esc, number, decimal, integer, pct, signed, colors, sentimentKeys } from './format.js';
import { comboChart, nestedDonut, painTreemap, matrixChart, statCard } from './charts.js';

const $ = selector => document.querySelector(selector);
const validDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
function dateLabel(value, options = {}) {
  if (typeof value !== 'string' || !value.trim()) return 'N/A';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value) && !validDay(value)) return 'N/A';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'N/A';
  return new Intl.DateTimeFormat('id-ID', { day:'numeric', month:'short', timeZone:'UTC', ...options }).format(date);
}
const timeLabel = value => dateLabel(value, { year:'numeric', hour:'2-digit', minute:'2-digit', timeZoneName:'short' });
const platformById = id => platforms.find(p => p.id === id);
const authorName = r => typeof r.author === 'string' && r.author.trim() ? r.author : 'N/A';
const initials = r => authorName(r) === 'N/A' ? 'N/A' : authorName(r).split(/\s+/).filter(Boolean).map(x => x[0]).slice(0,2).join('').toUpperCase();
const reviewTags = r => Array.isArray(r.tags) ? r.tags : [];
const reviewHistory = r => Array.isArray(r.history) ? r.history : [];
const hasRating = rating => Number.isInteger(rating) && rating >= 1 && rating <= 5;
const color = value => /^#[\da-f]{3,8}$/i.test(value || '') ? value : '#878a99';
const sourceStatusNames = { success:'Pengambilan selesai', partial:'Berhasil sebagian', error:'Gagal', unsupported:'Konektor belum tersedia', needs_setup:'Perlu konfigurasi API', ready:'Akses API belum diuji', snapshot:'Data tersimpan · belum diperbarui', belum_ditarik:'Belum diambil pada project ini' };
const activeSourceIds = new Set(['play','appstore']);
const awaitingSource = source => ['unsupported','needs_setup','ready','belum_ditarik'].includes(source.status);
function safeHttps(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}
function newestFirst(a, b) {
  const ad = validDay(a.date) ? a.date : '', bd = validDay(b.date) ? b.date : '';
  return bd.localeCompare(ad) || authorName(a).localeCompare(authorName(b));
}
// Urutan tabel memakai pembanding eksplisit per kolom, lalu newestFirst sebagai pengimbang
// agar baris dengan nilai sama selalu tampil pada urutan yang sama di setiap render.
const sortFieldLabels = { author:'nama pengguna', date:'tanggal ulasan', topic:'topik pertama', platform:'platform', sentiment:'sentimen' };
const sentimentOrder = { positive: 0, negative: 1, neutral: 2, unclassified: 3 };
const sortComparators = {
  author: (a, b) => authorName(a).localeCompare(authorName(b), 'id'),
  date: (a, b) => (validDay(a.date) ? a.date : '').localeCompare(validDay(b.date) ? b.date : ''),
  topic: (a, b) => (tags[reviewTags(a)[0]] || '\uffff').localeCompare(tags[reviewTags(b)[0]] || '\uffff', 'id'),
  platform: (a, b) => (platformById(a.platform)?.name || a.platform).localeCompare(platformById(b.platform)?.name || b.platform, 'id'),
  sentiment: (a, b) => (sentimentOrder[a.sentiment] ?? 9) - (sentimentOrder[b.sentiment] ?? 9),
};
function sortReviews(rows) {
  const compare = sortComparators[state.sort.key] || sortComparators.date;
  const sign = state.sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => (sign * compare(a, b)) || newestFirst(a, b));
}
function toggleSort(key) {
  state.sort = state.sort.key === key ? { key, dir: state.sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'date' ? 'desc' : 'asc' };
  state.page = 1;
}
// Warna label diambil dari satu sumber (tagColors) agar chip topik dan legenda memakai tinta yang sama.
function tagStyle(hex) {
  const parts = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
  if (!parts) return '';
  const [r, g, b] = parts.slice(1).map(part => Number.parseInt(part, 16));
  return ` style="--tag-ink:${hex};--tag-soft:rgba(${r},${g},${b},.1);--tag-line:rgba(${r},${g},${b},.28)"`;
}
const labelStyles = { manual: '#0ab39c', 'rules-v1': '#299cdb' };
function labelMethod(r) {
  if (r.labeling === 'manual') return 'Manual · label dibaca langsung dari teks pada data ini';
  if (r.labeling === 'rules-v1') return 'Aturan kata kunci (versi 1) · otomatis, bukan model bahasa; perlu pemeriksaan manusia';
  return `${r.labeling || 'N/A'} · metode pelabelan belum terverifikasi`;
}
function labelBadge(r) {
  if (r.labeling === 'manual') return 'Manual';
  if (r.labeling === 'rules-v1') return 'Otomatis';
  return r.labeling || 'N/A';
}
const paths = {
  grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  chart:'<path d="M4 4v16h17M8 15V9m5 6V5m5 10v-7"/>',
  message:'<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2V11.5a9.5 9.5 0 0 1 19 0Z"/><path d="M7 10h9M7 14h6"/>',
  layers:'<path d="m12 3 10 5-10 5L2 8l10-5Zm-10 9 10 5 10-5M2 16l10 5 10-5"/>',
  book:'<path d="M12 5c-3-2-7-2-10-1v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Zm0 0v15"/>',
  arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
  chevron:'<path d="m9 5 7 7-7 7"/>',
  down:'<path d="m6 9 6 6 6-6"/>',
  left:'<path d="m15 5-7 7 7 7"/>',
  external:'<path d="M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.2"/>',
  smile:'<circle cx="12" cy="12" r="9"/><path d="M8 14s1 3 4 3 4-3 4-3M8 9h.1M16 9h.1"/>',
  frown:'<circle cx="12" cy="12" r="9"/><path d="M8 17s1-3 4-3 4 3 4 3M8 9h.1M16 9h.1"/>',
  pulse:'<path d="M2 12h5l3-7 4 14 3-7h5"/>',
  spark:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  check:'<path d="m5 13 4 4L19 7"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  home:'<path d="m3 10 9-7 9 7v11h-7v-7h-4v7H3V10Z"/>',
  folder:'<path d="M3 6h7l2 3h9v12H3V6Z"/>',
  play:'<path d="m5 3 15 9L5 21V3Z"/><path d="m5 3 10 13m-10 5 10-13"/>',
  apple:'<path d="M15 3c-2 0-3 2-3 4 2 0 3-2 3-4ZM12 8c-5-4-10 1-8 7 1 4 3 7 5 6l3-1 3 1c2 1 4-2 5-5-4-2-4-5-1-7-3-3-5-2-7-1Z"/>',
  x:'<path d="m4 3 16 18h-5L4 8V3Zm0 18L20 3"/>',
  instagram:'<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',
  music:'<path d="M14 3v13a4 4 0 1 1-4-4m4-9c1 4 3 5 7 5V5c-2 0-3-1-4-2h-3Z"/>',
  youtube:'<rect x="2" y="5" width="20" height="14" rx="4"/><path d="m10 9 5 3-5 3V9Z"/>',
  caret:'<path d="m7 14 5-5 5 5"/>',
  pen:'<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13 6 4 4"/>',
  trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6m4-6v6"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
  user:'<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5c1-3.6 3.8-5.5 7.5-5.5s6.5 1.9 7.5 5.5"/>',
  link:'<path d="M10 13.5a4.4 4.4 0 0 0 6.3 0l2.8-2.8a4.4 4.4 0 0 0-6.2-6.2l-1 1"/><path d="M14 10.5a4.4 4.4 0 0 0-6.3 0l-2.8 2.8a4.4 4.4 0 0 0 6.2 6.2l1-1"/>',
  tagIcon:'<path d="M12.6 3H5a2 2 0 0 0-2 2v7.6a2 2 0 0 0 .6 1.4l6.4 6.4a2 2 0 0 0 2.8 0l7-7a2 2 0 0 0 0-2.8L14 3.6a2 2 0 0 0-1.4-.6Z"/><path d="M8 8h.01"/>',
  database:'<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  alert:'<path d="M12 3 22 20H2L12 3Z"/><path d="M12 9v5m0 2.6v.2"/>',
  shield:'<path d="M12 3 20 6v6c0 4-3.4 7.4-8 9-4.6-1.6-8-5-8-9V6l8-3Z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  printer:'<path d="M7 8V3h10v5"/><rect x="3" y="8" width="18" height="8" rx="2"/><path d="M7 13h10v8H7v-8Z"/>',
};
function icon(name) { return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.message}</svg>`; }
// Aplikasi mulai kosong: tidak ada ulasan bawaan. Semua baris yang tampil berasal dari project
// yang dibuat dan ditarik sendiri oleh pengguna, dari server, bukan dari berkas aplikasi.
let reviews = [];
const state = { view:'overview', platform:'all', period:'all', from:'', to:'', sentiment:'all', query:'', tag:'', group:null, groupName:'', complaint:'', cluster:'', aspect:'', page:1, size:10, sort:{ key:'date', dir:'desc' } };
const sync = { sources:[], lastRun:null, runs:[], running:false, loading:true, busy:false, requesting:false, loaded:false, attempt:null, pull:null, storageWarning:null };
// Project analisis: satu berkas data dapat memuat beberapa project, masing-masing dengan
// dataset dan target tokonya sendiri. Penarikan selalu mengikuti project aktif.
const projects = { list:[], active:null, target:null };
// Nama dan slug project aktif dipakai pada judul laporan dan nama berkas ekspor, sehingga
// hasil unduhan project lain tidak diberi merek project bawaan.
const projectName = () => projects.list.find(project => project.id === projects.active)?.name || 'project';
const projectSlug = () => projects.active || 'project';
const discovery = { name:'', entity:'', payload:null, busy:false, error:'', picked:{ play:'', appstore:'' }, searched:'', partial:'' };
const views = { overview:'Dashboard', sentiment:'Analisis sentimen', reviews:'Review', platforms:'Platform', methodology:'Metode & data' };
let toastTimer, refreshTimer;
const isBusy = () => sync.loading || sync.busy || sync.running;
function notify(text, kind) {
  const toast = $('#toast');
  const failure = kind === 'error';
  // Atribut dipasang lebih dulu: teks yang ditulis sebelum role/aria-live terbaca sebagai
  // pengumuman biasa, sehingga kegagalan pertama setelah keberhasilan tidak diumumkan.
  toast.setAttribute('role', failure ? 'alert' : 'status');
  toast.setAttribute('aria-live', failure ? 'assertive' : 'polite');
  toast.textContent = text;
  toast.classList.toggle('error', failure);
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'),failure?9000:4500);
}
// Satu penyaring untuk semua angka dasbor: filterReviews hanya mengenal platform, tanggal,
// sentimen, teks, dan topik, jadi aspek (yang diturunkan dari baris) ditutup di sini. Baris yang
// dipakai grafik, tabel, dan jumlah setiap pilihan selalu berasal dari fungsi yang sama.
function scopedRows({ platform = 'all', from = '', to = '', sentiment = 'all', query = '', tag = '', aspect = '' } = {}) {
  const rows = filterReviews(reviews, { platform, from, to, sentiment, query, tag });
  return aspect ? rows.filter(r => absaOf(r).aspects.includes(aspect)) : rows;
}
function analyticalReviews() {
  // Seluruh filter berlaku untuk seluruh grafik dan tabel, bukan hanya tabel ulasan.
  return scopedRows({ platform: state.platform, from: state.from, to: state.to, sentiment: state.sentiment, query: state.query, tag: state.tag, aspect: state.aspect });
}
function visibleReviews() {
  if (state.complaint) {
    const group = complaintStats(analyticalReviews()).find(g => g.id === state.complaint);
    return [...(group?.reviews || [])].sort(newestFirst);
  }
  if (state.cluster) {
    const cluster = painClusters.find(c => c.id === state.cluster);
    const matches = cluster ? analyticalReviews().filter(r => r.sentiment === 'negative' && cluster.rule.test(String(r.text || ''))) : [];
    return [...matches].sort(newestFirst);
  }
  let data = analyticalReviews();
  if (state.group) data = data.filter(r => reviewTags(r).some(t => state.group.includes(t)));
  return [...data].sort(newestFirst);
}
function badge(sentiment) {
  const key = sentimentKeys.includes(sentiment) ? sentiment : 'unclassified';
  return `<span class="badge ${key}"><span class="dot"></span>${esc(sentimentNames[key])}</span>`;
}
function platformLabel(id) {
  const p = platformById(id);
  return `<span class="platform-label"><span style="color:${color(p?.color)};display:flex">${icon(p?.icon)}</span>${esc(p?.short || id || 'N/A')}</span>`;
}
function empty(title = 'Belum ada data untuk filter ini', text = 'Coba platform atau periode lain. Data yang belum tersedia tidak dianggap sebagai sentimen netral.') {
  return `<div class="empty-state"><div class="empty-icon">${icon('message')}</div><h3>${esc(title)}</h3><p>${esc(text)}</p></div>`;
}
function sourceFor(p) {
  return sync.sources.find(s => s.id === p.id) || {
    id:p.id, status:activeSourceIds.has(p.id) ? 'snapshot' : 'unsupported', fetched:0,
    message:activeSourceIds.has(p.id) ? 'Belum ada data terbaru yang terkonfirmasi. Angka yang tampil berasal dari data tersimpan project ini.' : p.note,
    checkedAt:null, lastSuccessAt:null,
  };
}
const numericCount = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
// Angka halaman toko HANYA boleh berasal dari data project yang sedang dibuka. Daftar `platforms`
// di data.js memuat hasil pembacaan halaman wondr merchant (74 dan 17 penilaian, rentang unduhan
// '10K+'); memakainya sebagai nilai cadangan akan menampilkan angka aplikasi lain pada project baru.
const storeRatingCount = id => numericCount(sourceFor(platformById(id)).ratingCount ?? latestListing(id)?.ratingCount);
// Histogram halaman toko memuat SELURUH penilaian, termasuk bintang yang tidak menulis
// teks. Angka ini diambil apa adanya dari halaman sumber, bukan hasil perkiraan.
const storeHistogram = id => { const h = latestListing(id)?.ratingHistogram; return Array.isArray(h) && h.length === 5 && h.every(v => Number.isInteger(v) && v >= 0) ? h : null; };
function histogramRows(histogram, label) {
  const max = Math.max(1, ...histogram);
  return `<div class="rating-distribution" role="list" aria-label="${esc(label)}">${histogram.map((count, i) => `<div class="rating-row" role="listitem" aria-label="${5 - i} bintang: ${count} penilaian"><span>${5 - i} ★</span><span class="rating-track" aria-hidden="true"><span style="width:${pct(count, max)}%"></span></span><strong>${count}</strong></div>`).join('')}</div>`;
}
const storeInstalls = id => sourceFor(platformById(id)).installs ?? latestListing(id)?.installs ?? null;
const fetchedCount = source => numericCount(source?.fetched);
function wasFetched(source) {
  return source && !awaitingSource(source) && source.status !== 'snapshot' && (source.fetched === true || fetchedCount(source) > 0 || (['success','partial'].includes(source.status) && source.fetched !== false));
}
// Bilah project: pemilih project aktif, tombol ikon tambah, dan tombol "Kelola" yang membuka
// dialog ganti nama / hapus. "Kelola" sengaja diberi teks (bukan hanya ikon) karena pengguna
// tidak boleh menebak-nebak di mana hapus project-nya.
// Dropdown kosong akan terbaca sebagai antarmuka yang rusak, jadi keadaan tanpa project dinyatakan
// dengan pilihan temporer yang tidak dapat dipilih.
const projectOptions = () => projects.list.length
  ? projects.list.map(project => `<option value="${esc(project.id)}" ${project.id === projects.active ? 'selected' : ''}>${esc(project.name)}</option>`).join('')
  : '<option value="" disabled selected>Belum ada project</option>';
function projectBar() {
  const active = projects.list.find(project => project.id === projects.active) || null;
  // Tombol project ikut dikunci selama ada permintaan berjalan (memindahkan project, menarik
  // data): klik di tengah permintaan akan menghasilkan notifikasi "tunggu", bukan tindakan.
  const busy = isBusy() || sync.requesting;
  const idle = busy ? ' disabled' : '';
  return `<section class="project-bar" aria-label="Project analisis">
    <label class="project-pick"><span class="sr-only">Project aktif</span>
      <select class="project-select" aria-label="Pilih project aktif"${idle}>${projectOptions()}</select>
    </label>
    <div class="project-actions">
      <button class="project-button" data-action="add-project" aria-label="Tambah project" title="Tambah project"${idle}>${icon('plus')}</button>
      <button class="project-button project-button-manage" data-action="manage-project" aria-label="Kelola project aktif" title="Ganti nama atau hapus project ini"${active && !busy ? '' : ' disabled'}>${icon('pen')}<span class="project-button-label">Kelola</span></button>
    </div>
  </section>`;
}
function nav() {
  // Pemilih project di bilah atas adalah satu-satunya pemilih pada layar sempit, jadi ia harus
  // terkunci selama ada permintaan berjalan persis seperti versi sidebar.
  const idle = isBusy() || sync.requesting ? ' disabled' : '';
  $('#sidebar').innerHTML = `${projectBar()}<nav>${Object.entries(views).map(([id,label],i) => `<button class="nav-item ${state.view===id?'active':''}" data-view="${id}" aria-label="${esc(label)}" ${state.view===id?'aria-current="page"':''} title="${esc(label)}">${icon(['grid','pulse','message','layers','book'][i])}<span>${esc(label)}</span>${id==='reviews'&&projects.active?`<span class="nav-count">${reviews.length}</span>`:''}</button>`).join('')}</nav>`;
  $('#topbar').innerHTML = `<div class="breadcrumb">${icon('home')}<strong>${esc(views[state.view])}</strong></div><div class="topbar-right"><label class="topbar-project"><span class="sr-only">Project aktif</span><select class="project-select" aria-label="Pilih project aktif"${idle}>${projectOptions()}</select></label><span class="topbar-brand">${esc((projects.list.find(project => project.id === projects.active)?.name || 'belum ada project').toUpperCase())}</span></div>`;
}
function heading() {
  const subtitles = {
    overview:'Pantau suara merchant dan jadikan setiap masukan dasar perbaikan layanan.',
    sentiment:'Kenali kekuatan layanan dan area yang perlu ditingkatkan.',
    reviews:'Telusuri teks asli, label sentimen, dan alasan di balik setiap penilaian.',
    platforms:'Lihat cakupan data, status pengambilan, dan batas setiap sumber.',
    methodology:'Analisis yang dapat ditelusuri, tanpa angka perkiraan atau klaim pembaruan langsung.',
  };
  const title = state.view === 'overview' ? 'Pemantauan sentimen' : views[state.view];
  const months = [...new Set(reviews.filter(r => validDay(r.date)).map(r => r.date.slice(0,7)))].sort();
  if (/^\d{4}-\d{2}$/.test(state.period) && !months.includes(state.period)) months.push(state.period);
  months.sort();
  return `<section class="page-heading"><div><h1 tabindex="-1">${esc(title)}</h1><p>${esc(subtitles[state.view])}</p></div>${state.view!=='methodology'?`<div class="heading-actions">
    <label class="range-button">${icon('calendar')}<select id="period" aria-label="Periode ulasan"><option value="all" ${state.period==='all'?'selected':''}>Semua tanggal</option>${months.map(month=>`<option value="${esc(month)}" ${state.period===month?'selected':''}>${esc(dateLabel(month+'-01',{day:undefined,month:'long',year:'numeric'}))}</option>`).join('')}<option value="custom" ${state.period==='custom'?'selected':''}>Rentang khusus</option></select></label>
    ${state.view==='platforms'||!reviews.length?`<button class="btn btn-primary" data-action="analyze" ${isBusy()?'disabled aria-busy="true"':''}>${isBusy()?'<span class="spinner" aria-hidden="true"></span>':icon('pulse')}${isBusy()?'Mengambil dan menganalisis…':'Tarik Analisis'}</button>`:''}
  </div>`:''}</section>${sync.storageWarning?`<p class="coverage-warning storage-warning" role="status">${esc(sync.storageWarning)}</p>`:''}${state.view!=='methodology'&&state.period==='custom'?`<div class="custom-dates"><label>Dari tanggal<input id="date-from" type="date" value="${esc(state.from)}"></label><label>Sampai tanggal<input id="date-to" type="date" value="${esc(state.to)}"></label><button class="btn" data-action="apply-dates">Terapkan</button><span class="filter-error" id="date-error" role="alert"></span></div>`:''}`;
}
function filters() {
  // Konvensi jumlah pilihan (faceted search): angka pada pilihan platform mengabaikan platform
  // yang sedang dipilih, angka aspek mengabaikan aspek, angka topik mengabaikan topik. Dengan
  // begitu pilihan lain tetap menunjukkan jumlah yang benar dan bukan nol semu.
  const analysis = state.view !== 'platforms';
  // Setiap basis menghitung satu pilihan dengan memakai semua filter lain, termasuk aspek.
  // Karena pilihan dan grafik memakai penyaring yang sama, angka pilihan tidak pernah lebih
  // besar daripada himpunan teks yang benar-benar dibaca dasbor.
  const active = { platform: state.platform, from: state.from, to: state.to, sentiment: state.sentiment, query: state.query, tag: state.tag, aspect: state.aspect };
  const within = only => scopedRows(analysis ? only : { from: state.from, to: state.to });
  const platformBase = within({ ...active, platform: 'all' });
  const aspectBase = within({ ...active, aspect: '' });
  const sentimentBase = within({ ...active, sentiment: 'all' });
  const topicBase = within({ ...active, tag: '' });
  const aspects = aspectStats(aspectBase, 'all').filter(a => a.total > 0);
  const topicCounts = new Map();
  for (const r of topicBase) for (const t of new Set(reviewTags(r))) topicCounts.set(t, (topicCounts.get(t) || 0) + 1);
  const contentActive = Boolean(state.query) || Boolean(state.tag) || (state.sentiment !== 'all' && !state.complaint && !state.cluster);
  return `<section class="filters" aria-label="Filter dashboard">
    <div class="platform-filter">
      <div class="platform-tabs" id="platform-tabs" role="group" aria-label="Pilih platform">
        <button class="platform-tab ${state.platform==='all'?'active':''}" data-platform="all" aria-pressed="${state.platform==='all'}">${icon('layers')}Semua platform<span class="count">${platformBase.length}</span></button>
        ${platforms.map(p => { const count = platformBase.filter(r => r.platform === p.id).length, source = sourceFor(p), unavailable = !count && source.status !== 'success'; return `<button class="platform-tab ${state.platform===p.id?'active':''}" data-platform="${esc(p.id)}" aria-pressed="${state.platform===p.id}"><span style="color:${state.platform===p.id?color(p.color):'inherit'};display:flex">${icon(p.icon)}</span>${esc(p.short)}<span class="count" title="${unavailable?esc(sourceStatusNames[source.status]):`${count} ulasan tersimpan`}">${unavailable?'—':count}</span></button>`; }).join('')}
      </div>
    </div>
    ${analysis ? `<div class="aspect-filter" role="group" aria-label="Filter aspek pengalaman">
      <button class="aspect-pill ${state.aspect===''?'active':''}" data-aspect="" aria-pressed="${state.aspect===''}" title="Tampilkan seluruh aspek pengalaman">Semua aspek<span class="count">${integer(aspectBase.length)}</span></button>
      ${aspects.map(a => `<button class="aspect-pill ${state.aspect===a.id?'active':''}" data-aspect="${esc(a.id)}" aria-pressed="${state.aspect===a.id}" title="${esc(`${a.name}: ${a.total} ulasan, ${a.negative} negatif`)}">${esc(a.name)}<span class="count">${integer(a.total)}${a.negative?` · ${integer(a.negative)}−`:''}</span></button>`).join('')}
    </div>` : ''}
    ${analysis ? `<div class="content-filter">
      <div class="sentiment-tabs" role="group" aria-label="Filter sentimen">${Object.entries({ all: 'Semua', ...sentimentNames }).map(([id, label]) => `<button class="sentiment-tab ${state.sentiment===id?'active':''}" data-sentiment="${esc(id)}" aria-pressed="${state.sentiment===id}">${esc(label)}${id==='all' ? '' : `<span class="count">${integer(sentimentBase.filter(r => r.sentiment === id).length)}</span>`}</button>`).join('')}</div>
      <label class="search-box">${icon('search')}<input type="search" id="review-search" value="${esc(state.query)}" placeholder="Cari ulasan atau nama…" aria-label="Cari ulasan atau nama"></label>
      <select class="tag-filter" id="tag-filter" aria-label="Filter topik"><option value="">Semua topik (${integer(topicBase.length)})</option>${Object.entries(tags).map(([id,label])=>`<option value="${esc(id)}" ${state.tag===id?'selected':''} style="color:${esc(tagColors[id]||'#5e6374')}">${esc(label)} (${integer(topicCounts.get(id)||0)})</option>`).join('')}</select>
    </div>` : ''}
    ${analysis && state.aspect?`<div class="active-filter"><span>Aspek aktif: <strong>${esc(aspectNames[state.aspect]||state.aspect)}</strong> — seluruh grafik dan tabel mengikuti filter ini</span><button class="btn-text" data-action="clear-aspect" aria-label="Hapus filter aspek">Hapus filter ${icon('close')}</button></div>`:''}
    ${analysis && contentActive?`<div class="active-filter"><span>Konten aktif: ${state.tag?`<strong>${esc(tags[state.tag]||state.tag)}</strong> · `:''}${state.sentiment!=='all'?`sentimen <strong>${esc(sentimentNames[state.sentiment])}</strong> · `:''}${state.query?`kata kunci <strong>${esc(state.query)}</strong> · `:''}seluruh grafik dan tabel mengikuti filter ini</span><button class="btn-text" data-action="clear-content" aria-label="Hapus filter konten">Hapus filter ${icon('close')}</button></div>`:''}
  </section>`;
}
function metricCards(data) {
  const s = summary(data), sources = new Set(data.map(r=>r.platform)).size;
  // Arah NSS memakai pita yang sama dengan gauge, termasuk batas sampel: dua label untuk angka
  // yang sama membuat pembaca mengira dasbor mengukur dua hal berbeda.
  const band = nssBand(s.nss, s.classified);
  const source = state.platform === 'all' ? null : sourceFor(platformById(state.platform));
  const unavailable = source && !reviews.some(r=>r.platform===state.platform) && source.status !== 'success';
  const excluded = data.filter(r=>r.relevance?.status==='excluded').length;
  const social = data.filter(r=>platformById(r.platform)?.type==='Media sosial').length;
  const scope = source && unavailable ? `${source.message} Tidak tersedia bukan berarti nol keluhan.` : state.platform === 'all' ? `${data.length-social} teks dari sumber non-sosial dan ${social} komentar sosial dalam filter. ${social?'Konteks video dan promosi bukan opini pelanggan.':'Analisis ini belum mencakup sentimen media sosial.'}` : '';
  const metrics = [
    {label:'Total ulasan',value:unavailable?'—':integer(s.total),unit:'',icon:'message',cls:'',sub:sources?`<strong>${integer(sources)} kanal</strong> memiliki ulasan`:unavailable?'<strong>Data belum tersedia</strong> dari sumber ini':'<strong>Belum ada ulasan</strong> pada filter ini',width:0},
    {label:'Sentimen positif',value:s.classified?number(s.positivePct):'—',unit:s.classified?'%':'',icon:'smile',cls:'positive',sub:`<strong>${s.positive} ulasan</strong> dari ${s.classified} ulasan berlabel`,width:s.positivePct||0},
    {label:'Sentimen negatif',value:s.classified?number(s.negativePct):'—',unit:s.classified?'%':'',icon:'frown',cls:'negative',sub:`<strong>${s.negative} ulasan</strong> dari ${s.classified} ulasan berlabel`,width:s.negativePct||0},
    {label:'Skor sentimen neto (NSS)',value:s.classified?`${s.nss>0?'+':''}${number(s.nss)}`:'—',unit:'',icon:'pulse',cls:'nss',sub:s.classified?`<strong>${esc(band?band.label:'Belum dapat dinilai')}</strong> · ${integer(s.classified)} berlabel`:'Belum ada ulasan berlabel',width:s.classified?Math.abs(s.nss):0},
  ];
  return `<section class="metrics" aria-label="Metrik sentimen">${metrics.map(m=>`<article class="metric ${m.cls}"><div class="metric-top"><span class="metric-label">${m.label}</span><span class="metric-icon">${icon(m.icon)}</span></div><div class="metric-value">${m.value}<span class="unit">${m.unit}</span></div><div class="metric-sub">${m.sub}</div>${m.cls?`<div class="mini-track"><span style="width:${m.width}%"></span></div>`:''}</article>`).join('')}</section><p class="classification-note ${s.unclassified?'needs-review':''}">${s.unclassified?`<strong>${s.unclassified} ulasan perlu ditinjau</strong>; tidak dihitung sebagai netral dan tidak termasuk dasar perhitungan persentase sentimen maupun NSS. `:''}${excluded?`${excluded} teks di luar penilaian pelanggan tetap dihitung dalam total teks, bukan dalam NSS. `:''}Persentase sentimen dan NSS dihitung dari ${s.classified} ulasan berlabel sentimen (positif, negatif, dan netral), bukan dari seluruh pengguna. ${esc(scope)}</p>`;
}
function legend() { return `<div class="legend">${sentimentKeys.map(id=>`<span class="legend-item"><span class="legend-swatch ${id}"></span>${esc(sentimentNames[id])}</span>`).join('')}</div>`; }
// Kepala ringkas: dua kalimat + tiga kartu angka. Paragraf yang mengulang angka dihapus.
function summaryHeader(data) {
  const s = summary(data), band = nssBand(s.nss, s.classified);
  const drivers = aspectStats(data,'negative').filter(a => a.negative > 0).slice(0,2);
  const first = s.classified
    ? `Dari ${integer(s.classified)} teks berlabel pada pilihan ini, ${number(s.positivePct)}% positif dan ${number(s.negativePct)}% negatif; NSS ${signed(s.nss)} poin.`
    : `Belum ada teks berlabel sentimen pada pilihan ini (${integer(s.total)} teks, ${integer(s.unclassified)} perlu ditinjau), jadi NSS tidak dapat dihitung.`;
  const second = drivers.length
    ? `Pendorong negatif utama: ${drivers.map(a => `${a.name} — ${integer(a.negative)} ulasan (${number(pct(a.negative, s.negative))}% dari ${integer(s.negative)} negatif)`).join('; ')}.`
    : s.negative
      ? `${integer(s.negative)} ulasan negatif belum dapat dipetakan ke aspek tertentu; umumnya penilaian tanpa objek yang jelas.`
      : 'Tidak ada ulasan negatif pada pilihan ini; cakupan data tetap perlu diperiksa.';
  const unavailable = state.platform !== 'all' && !data.length && sourceFor(platformById(state.platform)).status !== 'success';
  return `<section class="summary-header" aria-label="Ringkasan dan angka utama">
    <article class="card summary-card" aria-labelledby="summary-heading">
      <div class="summary-mark">${icon('spark')}</div>
      <div class="summary-main"><h2 id="summary-heading">Ringkasan<span class="badge neutral">${integer(s.total)} teks pada pilihan ini</span></h2><p>${esc(first)}</p><p>${esc(second)}</p>${unavailable?`<p class="summary-caveat">${esc(sourceFor(platformById(state.platform)).message)} Tidak tersedia bukan berarti nol keluhan.</p>`:''}
        <details class="chart-notes"><summary>Cara angka ini dihitung</summary><p>NSS = (positif − negatif) ÷ jumlah ulasan berlabel × 100. Label sentimen, aspek, emosi, dan niat dihitung dengan aturan kata kunci (rules-v1) pada teks ulasan — bukan model bahasa. ${integer(s.unclassified)} teks yang perlu ditinjau tidak dihitung sebagai netral dan tidak membagi persentase.</p></details>
      </div>
    </article>
    <div class="stat-cards">${statCard({ label:'Positif', value:s.classified?number(s.positivePct):'—', unit:s.classified?'%':'', tone:'positive', sub:`${integer(s.positive)} ulasan` })}${statCard({ label:'Negatif', value:s.classified?number(s.negativePct):'—', unit:s.classified?'%':'', tone:'negative', sub:`${integer(s.negative)} ulasan` })}${statCard({ label:'NSS', value:s.classified?signed(s.nss):'—', tone:'nss', sub: `${integer(s.classified)} teks berlabel · ${band ? band.label : 'belum dapat dihitung'}` })}</div>
  </section>`;
}
// Grafik 1 — volume harian bertumpuk dengan garis NSS.
function chartOne(data) {
  const series = dailySeries(data), badges = spikeBadges(series.days);
  return `<article class="card chart-card combo-card" aria-labelledby="chart-one-heading"><div class="card-header"><div><h2 id="chart-one-heading">Tren sentimen &amp; fluktuasi harian</h2><p class="card-subtitle">Batang bertumpuk = volume ulasan per hari; garis = NSS harian pada sumbu kanan</p></div><span class="badge ${badges.length?'negative':'neutral'}">${badges.length?`${integer(badges.length)} hari melonjakan`:'tidak ada lonjakan harian'}</span></div>${comboChart({ days: series.days, badges })}${series.truncated?`<p class="note-inline">Rentang panjang: grafik memuat ${integer(series.days.length)} hari pertama dari ${integer(series.span)} hari; seluruh ulasan tetap dihitung pada angka lain.</p>`:''}${series.undated?`<p class="note-inline">${integer(series.undated)} teks tanpa tanggal publikasi tidak masuk grafik ini, tetapi tetap dihitung pada metrik lain.</p>`:''}</article>`;
}
// Grafik 2 — aspek (cincin dalam) dipecah per kanal (cincin luar).
function chartTwo(data) {
  const rings = aspectChannelRings(data, platforms, 'negative');
  const total = rings.inner.reduce((sum, slice) => sum + slice.value, 0);
  const negative = summary(data).negative;
  return `<article class="card chart-card donut-card" aria-labelledby="chart-two-heading"><div class="card-header"><div><h2 id="chart-two-heading">Pendorong negatif per aspek &amp; kanal</h2><p class="card-subtitle">Cincin dalam = aspek pengalaman; cincin luar = pemecahan tiap aspek menurut kanal</p></div>${icon('layers')}</div>${nestedDonut({ inner: rings.inner, outer: rings.outer, total })}<p class="note-inline">Angka ${integer(total)} adalah jumlah keanggotaan aspek dari ${integer(negative)} ulasan negatif — satu ulasan dapat menyebut beberapa aspek, jadi cincin ini tidak dijumlahkan menjadi jumlah ulasan. Ulasan negatif tanpa aspek tidak ikut digambar.</p></article>`;
}
// Grafik 3 — peta kotak klaster keluhan.
function chartThree(data) {
  const nodes = squarify(painTreemapNodes(data), 0, 0, 100, 100);
  return `<article class="card chart-card treemap-card" aria-labelledby="chart-three-heading"><div class="card-header"><div><h2 id="chart-three-heading">Klaster masalah berulang</h2><p class="card-subtitle">Luas kotak = jumlah ulasan negatif yang menyebut frasa tersebut</p></div><span class="badge negative">${integer(summary(data).negative)} ulasan negatif</span></div>${painTreemap({ nodes })}<p class="note-inline">Klik satu kotak untuk membuka ulasan negatif pada klaster itu. Satu ulasan dapat masuk beberapa klaster, jadi luasnya tidak dijumlahkan menjadi jumlah ulasan negatif.</p></article>`;
}
// Grafik 4 — matriks NSS dan persen negatif antar kanal.
function chartFour(data) {
  return `<article class="card chart-card matrix-card" aria-labelledby="chart-four-heading"><div class="card-header"><div><h2 id="chart-four-heading">Matriks perbandingan antar-kanal</h2><p class="card-subtitle">NSS dan persentase negatif berdampingan, hanya kanal yang punya teks tersimpan</p></div>${icon('chart')}</div>${matrixChart({ rows: platformMatrix(data, platforms) })}<p class="note-inline">Kanal tanpa ulasan berlabel tidak digambar; absennya batang berarti datanya belum ada, bukan nilainya nol.</p></article>`;
}
const complaintName = group => group.id === 'general' ? 'Penilaian umum (tanpa rincian)' : group.name;
// Tata letak disamakan dengan kartu "Topik yang dibahas": satu baris label, satu batang
// bertumpuk komposisi sentimen, satu legenda. Urutan tetap menurut jumlah ulasan negatif.
function complaintChart() {
  const data=analyticalReviews(), groups=complaintBreakdown(data).filter(g=>g.negative>0), negative=summary(data).negative;
  return `<article class="card complaint-card" aria-labelledby="complaint-heading">
    <div class="card-header"><div><h2 id="complaint-heading">Area yang paling sering dikeluhkan</h2><p class="card-subtitle">Diurutkan dari jumlah ulasan negatif terbanyak. Batang menunjukkan komposisi sentimen seluruh ulasan yang membahas area tersebut.</p></div><span class="badge negative">${negative} ulasan negatif</span></div>
    ${groups.length?`<div class="feature-list complaint-list">
      ${groups.map((g,i)=>`<div class="feature-row complaint-row${g.id==='general'?' is-general':''}">
        <div class="feature-row-label"><button class="btn-text" data-complaint="${esc(g.id)}" aria-label="${esc(`${complaintName(g)}: ${g.negative} ulasan negatif dari ${g.total} ulasan yang membahas area ini. Buka ulasan terkait.`)}"><span class="complaint-rank" aria-hidden="true">${i+1}</span>${esc(complaintName(g))}</button><strong>${g.negative} negatif · ${g.total} ulasan</strong></div>
        <div class="feature-bar" role="img" aria-label="${esc(`${complaintName(g)}: ${sentimentKeys.map(k=>`${g[k]||0} ${sentimentNames[k]}`).join(', ')}`)}">${sentimentKeys.map(k=>`<span class="${k}" style="width:${pct(g[k]||0,g.total)}%" title="${esc(sentimentNames[k])}: ${g[k]||0}"></span>`).join('')}</div>
      </div>`).join('')}
      ${legend()}
    </div>`:empty(negative?'Belum ada kategori keluhan yang sesuai':'Tidak ada ulasan negatif dalam filter ini',negative?'Ada ulasan negatif, tetapi belum memiliki kategori keluhan yang dapat ditampilkan.':'Angka ini tidak membuktikan bahwa seluruh pengguna terbebas dari kendala. Perhatikan cakupan data dan jumlah ulasan.')}
    ${negative?`<p class="note-inline">Segmen dihitung dari ${groups.length} area yang memiliki ulasan negatif. Satu ulasan dapat membahas beberapa area dan dapat memuat pujian sekaligus keluhan, sehingga jumlah segmen tidak dijumlahkan menjadi ${negative} ulasan negatif. Pilih nama area untuk membaca ulasan sumber.</p><details class="chart-notes"><summary>Catatan interpretasi</summary><p>Penilaian umum tanpa objek yang jelas masuk pada baris terakhir. Penyebutan keluhan belum membuktikan insiden operasional. Label otomatis memakai aturan kata kunci dan masih perlu diperiksa manusia; segmen "Perlu tinjauan" menandakan teks yang polanya belum cukup, bukan sentimen netral.</p></details>`:''}
  </article>`;
}
const trendArrow = { rising:'▲', falling:'▼', flat:'■' };
function projectionCard(data) {
  const p=projection(data), horizon=p.horizonWeeks, headText=`Dihitung dari kecepatan ulasan per pekan pada data ini dengan regresi kuadrat terkecil dan rentang Poisson 95%.`;  const head=`<div class="card-header"><div><h2>Proyeksi ${horizon} pekan ke depan</h2><p class="card-subtitle">${headText}</p></div>${p.ok?`<span class="badge ${p.signal==='worsening'?'negative':p.signal==='improving'?'positive':'neutral'}">${esc(projectionSignals[p.signal])}</span>`:''}</div>`;
  if (!p.ok) return `<article class="card projection-card">${head}${empty('Proyeksi belum dapat dihitung', p.reason)}</article>`;
  const scale=Math.max(1,...p.themes.map(t=>t.recentTotal+t.projected));
  const top=p.themes.find(t=>t.projected>0);
  const signed=value=>`${value>0?'+':''}${number(value)}`;
  // Sama seperti kartu KPI: NSS hanya diberi pita bila jumlah teks berlabel mencukupi.
  const thinSample=nssBand(p.nssProjected.point,p.nssProjected.sample)?.id==='belum-dinilai';
  return `<article class="card projection-card">${head}
    <div class="projection-stats">
      <div><span>Ulasan negatif ${horizon} pekan ke depan</span><strong>${integer(Math.round(p.negative.projected))}</strong><small>rentang ${integer(p.negative.low)}–${integer(p.negative.high)} · ${integer(p.negative.recentTotal)} tercatat pada ${horizon} pekan terakhir</small></div>
      <div><span>NSS proyeksi</span><strong>${p.nssProjected.point===null?'N/A':thinSample?esc(nssBand(p.nssProjected.point,p.nssProjected.sample).label):signed(p.nssProjected.point)}</strong><small>${thinSample?`hanya ${integer(p.nssProjected.sample)} teks berlabel diproyeksikan, di bawah ${nssMinSample} · `:''}rentang ${p.nssProjected.low===null?'N/A':`${signed(p.nssProjected.low)} s.d. ${signed(p.nssProjected.high)}`} · NSS saat ini ${p.nssCurrent===null?'N/A':signed(p.nssCurrent)}</small></div>
    </div>
    <div class="feature-list projection-list">
      ${p.themes.map(t=>`<div class="feature-row projection-row ${t.direction}">
        <div class="feature-row-label"><span class="projection-name"><span class="trend-mark ${t.direction}" aria-hidden="true">${trendArrow[t.direction]}</span>${esc(t.name)}</span><strong>${integer(Math.round(t.projected))} proyeksi · ${integer(t.low)}–${integer(t.high)}</strong></div>
        <div class="feature-bar" role="img" aria-label="${esc(`${t.name}: ${t.recentTotal} ulasan negatif tercatat pada ${horizon} pekan terakhir, proyeksi ${number(t.projected)} dengan rentang ${t.low} sampai ${t.high}. Arah ${projectionTrends[t.direction].toLowerCase()}.`)}"><span class="recorded" style="width:${pct(t.recentTotal,scale)}%" title="Tercatat pada ${horizon} pekan terakhir: ${t.recentTotal}"></span><span class="forecast" style="width:${pct(t.projected,scale)}%" title="Proyeksi ${horizon} pekan ke depan: ${number(t.projected)}"></span></div>
        <p class="projection-meta">${esc(projectionTrends[t.direction])} · laju ${number(t.weeklyRate)} ulasan negatif per pekan · penanggung jawab: ${esc(t.owner)}</p>
      </div>`).join('')}
      <div class="legend"><span class="legend-item"><span class="legend-swatch recorded"></span>Tercatat ${horizon} pekan terakhir</span><span class="legend-item"><span class="legend-swatch forecast"></span>Proyeksi ${horizon} pekan ke depan</span></div>
    </div>
    <p class="note-inline">Bila kecepatan ${horizon} pekan terakhir berlanjut, sekitar <strong>${integer(Math.round(p.negative.projected))} ulasan negatif</strong> baru akan masuk (rentang ${integer(p.negative.low)}–${integer(p.negative.high)}). ${top?`Kontribusi terbesar diproyeksikan pada <strong>${esc(top.name)}</strong> (${integer(Math.round(top.projected))} ulasan, rentang ${integer(top.low)}–${integer(top.high)}). `:''}${p.signal==='stable'?'Perubahan arah belum dapat dinyatakan: kemiringan deret positif maupun negatif belum melampaui ambang |t| ≥ 2.':`Arah yang dapat dinyatakan: <strong>${esc(projectionSignals[p.signal].toLowerCase())}</strong>.`}</p>
    <details class="chart-notes"><summary>Cara angka ini dihitung</summary><p>Ulasan dikelompokkan per pekan Senin–Minggu UTC menurut tanggal publikasi, lalu dihitung jumlah ulasan positif dan negatif tiap pekan. Kemiringan diuji dengan regresi kuadrat terkecil; arah hanya dinyatakan bila |t| ≥ 2. Bila kemiringan belum meyakinkan, laju mingguan diambil dari rata-rata ${horizon} pekan terakhir dan garis tren tidak diekstrapolasi. Rentang memakai sebaran Poisson (λ ± 1,96√λ); rentang NSS dihitung dari sudut terburuk dan terbaik kombinasi kedua rentang. Perhitungan dilakukan aturan statistik deterministik di perangkat ini — bukan model bahasa yang mengarang angka.</p><p>Batas baca: yang diproyeksikan adalah kecepatan ulasan publik masuk, bukan jumlah pengguna, transaksi, atau insiden. Jumlah data masih kecil (${p.weeks} pekan, ${integer(p.negative.observed)} ulasan negatif seluruhnya), sehingga satu pekan dengan banyak tanggal publikasi bersamaan dapat menggeser laju. Ulasan tanpa tanggal tidak masuk hitungan, dan jeda pengambilan data memengaruhi jumlah mingguan. Asumsi tambahan: kanal yang terhubung dan kebiasaan pengguna menulis ulasan dianggap tetap; rilis aplikasi, kampanye, atau penambahan kanal baru akan menggeser angka ini dan tidak dapat diperkirakan dari data yang ada.</p></details>
  </article>`;
}
function sampleRating(data) {
  const r=ratingSummary(data);
  const single=data.length&&data.every(d=>d.platform===data[0].platform)?data[0].platform:null;
  // SATU distribusi saja yang ditampilkan. Bila filter persis satu platform toko pada seluruh
  // periode, angka yang dipakai adalah angka halaman toko itu sendiri — termasuk bintang tanpa
  // teks — supaya sama persis dengan yang dilihat publik. Di luar itu, angka ulasan tertulis
  // dalam filter, karena histogram toko tidak dipecah menurut tanggal.
  const histogram=single&&!state.from&&!state.to&&platformById(single)?.type==='Toko aplikasi'?storeHistogram(single):null;
  const listing=histogram?latestListing(single):null;
  const written=histogram?reviews.filter(x=>x.platform===single).length:0;
  const distribution=histogram?[5,4,3,2,1].map((stars,index)=>({stars,count:histogram[index]})):[...r.distribution].reverse();
  const total=distribution.reduce((sum,row)=>sum+row.count,0);
  const average=total?distribution.reduce((sum,row)=>sum+row.stars*row.count,0)/total:null;
  const max=Math.max(1,...distribution.map(row=>row.count));
  const storeCount=single?storeRatingCount(single):0, textless=!histogram&&storeCount>total?storeCount-total:0;
  const platform=platformById(single);
  const title=histogram?`Penilaian bintang ${platform?.short||platform?.name}`:'Penilaian bintang pada ulasan';
  const note=histogram
    ? `${integer(total)} penilaian di halaman toko, termasuk ${integer(Math.max(0,total-written))} tanpa teks publik — dibaca ${esc(timeLabel(listing?.lastSuccessAt||listing?.checkedAt))}. Analisis sentimen memakai ${integer(written)} ulasan berteks karena teks tidak dapat dikarang.`
    : `Hanya ulasan dalam filter ini, bukan seluruh penilaian di halaman toko aplikasi.${textless?` Halaman toko memperhitungkan ${integer(storeCount)} penilaian bintang — ${integer(textless)} di antaranya tanpa teks publik.`:''}`;
  return `<article class="card sample-rating"><div><h2>${esc(title)}</h2><p><strong>${average!=null?`${histogram?number(average):decimal(average)} / 5`:'N/A'}</strong> · ${integer(total)} ${histogram?'penilaian':`dari ${data.length} ulasan menyertakan penilaian bintang`}</p><small>${note}</small></div><div class="rating-distribution" role="list" aria-label="Distribusi penilaian bintang">${distribution.map(row => `<div class="rating-row" role="listitem" aria-label="${row.stars} bintang: ${row.count} penilaian"><span>${row.stars} ★</span><span class="rating-track" aria-hidden="true"><span style="width:${pct(row.count,max)}%"></span></span><strong>${row.count}</strong></div>`).join('')}</div></article>`;
}
// Ringkasan eksekutif disusun dari angka yang sudah dihitung pada filter ini: polanya
// tetap, angkanya tidak. Tidak ada model bahasa yang menulis kalimat di sini.
const gaugePoint = (fraction, radius) => ({ x: 160 - radius * Math.cos(Math.PI * fraction), y: 150 - radius * Math.sin(Math.PI * fraction) });
const gaugeArc = (from, to, radius) => {
  const a = gaugePoint(from, radius), b = gaugePoint(to, radius);
  return `M${a.x.toFixed(1)} ${a.y.toFixed(1)} A${radius} ${radius} 0 0 1 ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
};
const bandToneColor = { negative: colors.negative, neutral: colors.neutral, positive: colors.positive };
function nssGauge(data) {
  const s = summary(data), band = nssBand(s.nss, s.classified);
  const radius = 118;
  const fraction = s.nss === null ? null : Math.min(1, Math.max(0, (s.nss + 100) / 200));
  const needle = fraction === null ? '' : (() => {
    const tip = gaugePoint(fraction, radius - 14), tail = gaugePoint(fraction, 18);
    return `<line x1="${tail.x.toFixed(1)}" y1="${tail.y.toFixed(1)}" x2="${tip.x.toFixed(1)}" y2="${tip.y.toFixed(1)}" stroke="#2f3842" stroke-width="3" stroke-linecap="round"/><circle cx="${tip.x.toFixed(1)}" cy="${tip.y.toFixed(1)}" r="5" fill="${bandToneColor[band.tone]}"/>`;
  })();
  const scoped = scopedRows({ platform:'all', from:state.from, to:state.to, sentiment:state.sentiment, query:state.query, tag:state.tag, aspect:state.aspect });
  const perSource = platforms.map(p => ({ p, rows: scoped.filter(r => r.platform === p.id) }))
    .filter(entry => entry.rows.length).map(entry => ({ ...entry, s: summary(entry.rows) }));
  return `<article class="card nss-card" aria-labelledby="nss-heading">
    <div class="card-header"><div><h2 id="nss-heading">Skor sentimen neto</h2><p class="card-subtitle">NSS = (positif − negatif) ÷ ulasan berlabel × 100</p></div>${band?`<span class="badge ${esc(band.tone)}">${esc(band.label)}</span>`:`<span class="badge neutral">Belum dapat dihitung</span>`}</div>
    ${s.classified ? `<div class="nss-wrap">
      <svg class="nss-gauge" viewBox="0 0 320 168" role="img" aria-label="${esc(`NSS ${s.nss>0?'+':''}${number(s.nss)} poin dari ${s.classified} ulasan berlabel. Pita: ${band?band.label:'tidak ada'}.`)}">
        ${nssBands.map(b => `<path d="${gaugeArc((b.min + 100) / 200, (b.max + 100) / 200, radius)}" fill="none" stroke="${bandToneColor[b.tone]}" stroke-opacity="${band && b.id === band.id ? '.95' : '.22'}" stroke-width="16" stroke-linecap="butt"/>`).join('')}
        ${[-100, -50, 0, 50, 100].map(v => { const point = gaugePoint((v + 100) / 200, radius + 14); return `<text x="${point.x.toFixed(1)}" y="${point.y.toFixed(1)}" font-size="10" class="chart-axis" text-anchor="middle">${v}</text>`; }).join('')}
        ${needle}
        <text x="160" y="132" text-anchor="middle" font-size="30" font-weight="600" fill="#2f3842">${esc(`${s.nss>0?'+':''}${number(s.nss)}`)}</text>
        <text x="160" y="150" text-anchor="middle" font-size="11" class="chart-axis">poin dari ${integer(s.classified)} ulasan berlabel</text>
      </svg>
      <div class="nss-side">
        <div class="distribution-item"><span class="legend-item"><span class="legend-swatch positive"></span>Positif</span><strong>${s.positive}<small>${number(s.positivePct)}%</small></strong></div>
        <div class="distribution-item"><span class="legend-item"><span class="legend-swatch negative"></span>Negatif</span><strong>${s.negative}<small>${number(s.negativePct)}%</small></strong></div>
        <div class="distribution-item"><span class="legend-item"><span class="legend-swatch neutral"></span>Netral</span><strong>${s.neutral}<small>${number(s.neutralPct)}%</small></strong></div>
        <div class="distribution-item"><span class="legend-item"><span class="legend-swatch unclassified"></span>Perlu tinjauan</span><strong>${s.unclassified}<small>tidak masuk rumus</small></strong></div>
      </div>
    </div>` : empty('NSS belum dapat dihitung', `Pada pilihan ini belum ada ulasan berlabel positif atau negatif (${integer(s.total)} teks, ${s.unclassified} masih perlu ditinjau). Angka nol bukan berarti tidak ada keluhan.`)}
    <p class="note-inline">${s.classified ? `Jumlah sampel ${integer(s.classified)} ulasan berlabel${s.classified < nssMinSample ? ` masih di bawah ${nssMinSample} sehingga pita interpretasinya belum representatif — jadikan arah indikatif, bukan ukuran kepuasan` : ' cukup untuk membaca arahnya'}; pita hanyalah label ambang, bukan hasil uji statistik.` : ''}</p>
    ${perSource.length ? `<div class="nss-sources"><h3>NSS per kanal</h3>${perSource.map(({ p, rows, s: one }) => `<div class="distribution-item"><span class="platform-label"><span style="color:${color(p.color)};display:flex">${icon(p.icon)}</span>${esc(p.short)}</span><strong>${one.classified ? esc(`${one.nss>0?'+':''}${number(one.nss)}`) : 'N/A'}<small>${one.classified ? `${one.positive}+ / ${one.negative}− dari ${one.classified} berlabel` : `${rows.length} teks, belum berlabel`}</small></strong></div>`).join('')}</div>` : ''}
    <details class="chart-notes"><summary>Batas baca angka ini</summary><p>NSS dihitung dari ulasan publik yang terkumpul pada dasbor ini, bukan dari seluruh pengguna aplikasi. Kanal yang belum memiliki konektor, ulasan tanpa teks, dan teks yang masih perlu ditinjau tidak ikut membagi. Satu ulasan berbintang tinggi dapat saja bernada negatif, jadi NSS tidak dibandingkan dengan rata-rata bintang toko. Label otomatis memakai aturan kata kunci (rules-v1) dan dapat keliru pada negasi atau sarkasme.</p></details>
  </article>`;
}
// Spanduk anomali: selalu ditampilkan, baik ada lonjakan maupun tidak, supaya pembaca tahu
// pemantauan berjalan dan jendela mana yang dipakai. Tidak ada ambang yang diloloskan diam-diam.
function anomalyBanner(data) {
  const a = anomalyScan(data), windowName = anomalyWindowNames[a.window];
  const label = value => timeLabel(new Date(value).toISOString());
  if (!a.ok) {
    return `<aside class="anomaly-strip" aria-live="polite">${icon('shield')}<div><strong>Pemantauan lonjakan: tidak ada anomali</strong><p>${esc(a.reason)}</p><p class="anomaly-meta">Jendela ${esc(windowName)} · ${integer(a.rows.timed)} dari ${integer(a.rows.total)} teks pada pilihan ini memiliki jam publikasi UTC, sehingga ${a.window === 'hour' ? 'jendela per jam yang diuji' : 'jendela diperlebar menjadi harian karena sumber tidak mengirim jam publikasi'}${a.truncated ? ` · pagar memori membuat hanya ${integer(a.scanned)} baris terbaru yang masuk jendela pemeriksaan` : ''} · ambang ${a.thresholdPct}% di atas rata-rata ${a.baselineWindows} jendela sebelumnya.</p></div></aside>`;
  }
  const p = a.peak, others = a.findings.slice(1, 4);
  const day = new Date(p.start).toISOString().slice(0, 10);
  const growth = Number.isFinite(p.increasePct) ? `${number(p.increasePct)}%` : 'dari nol';
  return `<aside class="anomaly-alert" role="alert" aria-live="assertive">
    <div class="anomaly-icon">${icon('alert')}</div>
    <div class="anomaly-main"><h2>Lonjakan ulasan negatif terdeteksi</h2>
      <p><strong>${p.negative} ulasan negatif</strong> dalam satu jendela ${esc(windowName)} pada ${esc(label(p.start))}–${esc(label(p.end - 1))} UTC, rata-rata ${a.baselineWindows} jendela sebelumnya ${number(p.baseline)} ulasan negatif per jendela (kenaikan ${esc(growth)}, ambang ${a.thresholdPct}%).</p>
      <div class="anomaly-list">${a.findings.slice(0, 4).map(f => `<div class="anomaly-row"><span>${esc(label(f.start))}</span><strong>${f.negative} negatif · ${f.total} teks</strong><span class="anomaly-grow">${esc(Number.isFinite(f.increasePct) ? `+${number(f.increasePct)}%` : 'dari nol')}</span></div>`).join('')}</div>
      <p class="anomaly-meta">Jendela dihitung dari waktu publikasi yang dikirim sumber (UTC). ${integer(a.rows.timed)} dari ${integer(a.rows.total)} teks pada pilihan ini memiliki jam publikasi; sumber yang hanya mengirim tanggal akan menumpuk pada satu jendela, jadi lonjakan jam hanya dapat dipercaya pada kanal yang mengirim waktu lengkap. Keluhan yang tertulis belum membuktikan insiden operasional.</p>
      <div class="anomaly-actions"><button class="btn btn-primary" data-anomaly-day="${esc(day)}">${icon('search')}Buka ulasan negatif ${esc(dateLabel(day, { year:'numeric' }))}</button>${others.length ? `<span class="anomaly-more">${a.findings.length} jendela melampaui ambang; ${others.length} lainnya tercatat di daftar di atas.</span>` : ''}</div>
    </div>
  </aside>`;
}
// Laporan insiden: CSV dan cetak-PDF disusun dari baris yang sama dengan yang tampil, tanpa
// sampling. PDF memakai stylesheet cetak browser sehingga tidak ada dependensi baru.
function incidentCard(data) {
  const s = summary(data), negative = data.filter(r => r.sentiment === 'negative'), a = anomalyScan(data);
  const rows = (label, value) => `<div class="distribution-item"><span>${esc(label)}</span><strong>${value}</strong></div>`;
  return `<article class="card incident-card" aria-labelledby="incident-heading">
    <div class="card-header"><div><h2 id="incident-heading">Laporan insiden eksekutif</h2><p class="card-subtitle">Seluruh ulasan negatif pada filter ini, beserta aspek, emosi, niat, dan tautan sumbernya</p></div>${icon('download')}</div>
    <div class="incident-facts">${rows('Ulasan negatif', `${integer(negative.length)} baris`)}${rows('Perlu tinjauan', `${integer(s.unclassified)} baris`)}${rows('Kanal terwakili', `${integer(new Set(negative.map(r => r.platform)).size)} kanal`)}${rows('Jendela pemantauan', esc(anomalyWindowNames[a.window]))}${rows('Status lonjakan', a.ok ? `${integer(a.findings.length)} jendela di atas ambang` : 'tidak ada anomali')}</div>
    <div class="incident-actions"><button class="btn btn-primary" data-action="print-incident" ${negative.length ? '' : 'disabled'}>${icon('printer')}Cetak / simpan PDF</button><button class="btn" data-action="export-incident" ${negative.length ? '' : 'disabled'}>${icon('download')}Unduh CSV insiden</button></div>
    <p class="note-inline">Laporan memuat ${integer(negative.length)} ulasan negatif tanpa pembatasan sampel dan tidak menambahkan baris yang tidak ada di data. Teks yang masih perlu ditinjau (${integer(s.unclassified)}) sengaja dikecualikan dari daftar insiden karena labelnya belum pasti; angka NSS dan komposisi di laporan tetap memakai denominasi yang sama dengan dasbor.</p>
  </article>`;
}
// Laporan insiden ditulis ke wadah terpisah lalu dicetak lewat stylesheet cetak browser
// (Simpan sebagai PDF). Tidak ada dependensi PDF, dan setiap tabel hanya memuat baris yang
// memang ada pada dataset — kolom yang tidak dikirim sumber ditulis N/A.
function reportScopeLabel() {
  const platform = state.platform === 'all' ? 'Semua kanal' : (platformById(state.platform)?.name || state.platform);
  const period = state.from || state.to ? `${state.from ? dateLabel(state.from, { year:'numeric' }) : 'awal data'} – ${state.to ? dateLabel(state.to, { year:'numeric' }) : 'tanggal terakhir'}` : 'Semua tanggal';
  const group = state.complaint ? complaintStats(analyticalReviews()).find(g => g.id === state.complaint) : null;
  const extra = [
    state.complaint ? `area keluhan: ${complaintName(group || { name: state.complaint })}` : '',
    state.cluster ? `klaster: ${painClusters.find(c => c.id === state.cluster)?.label || state.cluster}` : '',
    state.group ? `topik: ${state.groupName}` : '',
    state.tag ? `topik: ${tags[state.tag] || state.tag}` : '',
    state.query ? `kata kunci: ${state.query}` : '',
    state.sentiment !== 'all' ? `filter sentimen: ${sentimentNames[state.sentiment] || state.sentiment}` : '',
  ].filter(Boolean);
  return [platform, period, ...extra].join(' · ');
}
function incidentReportHtml(data) {
  const generatedAt = new Date().toISOString();
  const s = summary(data);
  const negative = [...data].filter(r => r.sentiment === 'negative').sort(newestFirst);
  const a = anomalyScan(data);
  const p = projection(data);
  const areas = complaintBreakdown(data).filter(g => g.negative > 0);
  const aspects = aspectStats(data, 'negative').filter(x => x.negative > 0).sort((x, y) => y.negative - x.negative);
  const clusters = clusterStats(data);
  const intents = negative.map(absaOf);
  const intentCount = id => intents.filter(x => x.intent === id).length;
  const emotionCount = id => intents.filter(x => x.emotion === id).length;
  const lastPull = sync.lastRun?.finishedAt ? timeLabel(sync.lastRun.finishedAt) : 'Belum ada penarikan pada sesi ini';
  const kpi = (label, value) => `<div class="report-kpi"><span>${esc(label)}</span><strong>${value}</strong></div>`;
  const list = rows => rows.length ? `<ul>${rows.map(x => `<li>${x}</li>`).join('')}</ul>` : '<p class="report-plain">Tidak ada baris yang memenuhi syarat ini pada lingkup laporan.</p>';
  return `<header class="report-head">
    <h1>Laporan Insiden Sentimen — ${esc(projectName())}</h1>
    <p class="report-meta">Lingkup data: ${esc(reportScopeLabel())}</p>
    <p class="report-meta">Dibuat ${esc(timeLabel(generatedAt))} (${esc(generatedAt)}) · Penarikan terakhir: ${esc(lastPull)} · Penjenisan: rules-v1 · ABSA: aspek/emosi/niat aturan kata kunci · Proyeksi: ${esc(projectionMethod)}</p>
  </header>
  <section class="report-block"><h2>1. Ringkasan</h2>
    <div class="report-kpis">${kpi('Teks dalam lingkup', integer(s.total))}${kpi('Ulasan berlabel', integer(s.classified))}${kpi('Positif', `${integer(s.positive)}${s.classified ? ` · ${number(s.positivePct)}%` : ''}`)}${kpi('Negatif', `${integer(s.negative)}${s.classified ? ` · ${number(s.negativePct)}%` : ''}`)}${kpi('Netral', `${integer(s.neutral)}${s.classified ? ` · ${number(s.neutralPct)}%` : ''}`)}${kpi('Perlu tinjauan', integer(s.unclassified))}${kpi('NSS', s.classified ? `${esc(`${s.nss>0?'+':''}${number(s.nss)}`)} poin` : 'N/A')}${kpi('Pita NSS', esc(nssBand(s.nss, s.classified)?.label || 'N/A'))}</div>
    <p>Dari ${integer(s.classified)} teks berlabel sentimen pada lingkup ini, ${integer(s.negative)} bernada negatif dan ${integer(s.positive)} bernada positif, menghasilkan NSS ${s.classified ? `${s.nss>0?'+':''}${number(s.nss)} poin (${esc(nssBand(s.nss, s.classified)?.label || 'N/A')})` : 'belum dapat dihitung'}. Teks yang masih perlu ditinjau (${integer(s.unclassified)}) tidak dihitung sebagai netral dan tidak membagi persentase. ${s.classified < nssMinSample ? `Jumlah sampel masih di bawah ${nssMinSample} ulasan berlabel, sehingga angka ini bersifat indikatif.` : ''}</p>
    ${aspects.length ? `<p>Pendorong negatif terbesar: ${aspects.slice(0, 3).map(x => `${esc(x.name)} (${integer(x.negative)} ulasan negatif, ${number(pct(x.negative, s.negative))}% dari seluruh negatif)`).join('; ')}.</p>` : `<p>${negative.length ? `${integer(negative.length)} ulasan negatif belum dapat dipetakan ke aspek tertentu; umumnya penilaian tanpa objek yang jelas.` : 'Tidak ada ulasan negatif pada lingkup ini.'}</p>`}
    <p>Niat pada ulasan negatif: laporan bug ${integer(intentCount('bug_report'))}, keluhan umum ${integer(intentCount('complaint'))}, permintaan fitur ${integer(intentCount('feature_request'))}, lainnya ${integer(intentCount('other'))}. Emosi: marah ${integer(emotionCount('anger'))}, frustrasi ${integer(emotionCount('frustration'))}, netral ${integer(emotionCount('neutral'))}, bertanya ${integer(emotionCount('query'))}, puas ${integer(emotionCount('satisfaction'))}.</p>
  </section>
  <section class="report-block"><h2>2. Pemantauan lonjakan (jendela ${esc(anomalyWindowNames[a.window])})</h2>
    ${a.ok ? `<p>Terdeteksi ${integer(a.findings.length)} jendela dengan ulasan negatif melampaui ${a.thresholdPct}% di atas rata-rata ${a.baselineWindows} jendela sebelumnya (ambang minimal ${a.minCurrent} ulasan negatif per jendela):</p>
    <table class="report-table"><thead><tr><th>Jendela mulai (UTC)</th><th>Jendela akhir (UTC)</th><th>Ulasan negatif</th><th>Total teks</th><th>Baseline rata-rata</th><th>Kenaikan</th></tr></thead><tbody>${a.findings.map(f => `<tr><td>${esc(timeLabel(new Date(f.start).toISOString()))}</td><td>${esc(timeLabel(new Date(f.end - 1).toISOString()))}</td><td>${integer(f.negative)}</td><td>${integer(f.total)}</td><td>${number(f.baseline)}</td><td>${esc(Number.isFinite(f.increasePct) ? `+${number(f.increasePct)}%` : 'dari nol')}</td></tr>`).join('')}</tbody></table>` : `<p>${esc(a.reason)}</p>`}
    <p class="report-plain">Jendela dihitung dari waktu publikasi yang dikirim sumber dalam UTC. Pada lingkup ini ${integer(a.rows.timed)} dari ${integer(a.rows.total)} teks memiliki jam publikasi; sumber yang hanya mengirim tanggal akan menumpuk pada satu jendela, jadi kesimpulan lonjakan per jam hanya dapat dipakai pada kanal yang mengirim waktu lengkap. Kenaikan jumlah ulasan tertulis juga dipengaruhi jadwal penarikan data, bukan hanya kejadian di lapangan.</p>
  </section>
  <section class="report-block"><h2>3. Area yang paling sering dikeluhkan</h2>
    ${areas.length ? `<table class="report-table"><thead><tr><th>#</th><th>Area</th><th>Negatif</th><th>Positif</th><th>Netral</th><th>Perlu tinjauan</th><th>Total ulasan area ini</th></tr></thead><tbody>${areas.map((g, i) => `<tr><td>${i + 1}</td><td>${esc(complaintName(g))}</td><td>${integer(g.negative)}</td><td>${integer(g.positive || 0)}</td><td>${integer(g.neutral || 0)}</td><td>${integer(g.unclassified || 0)}</td><td>${integer(g.total)}</td></tr>`).join('')}</tbody></table><p class="report-plain">Satu ulasan dapat membahas beberapa area dan dapat memuat pujian sekaligus keluhan, sehingga kolom negatif tidak dijumlahkan menjadi ${integer(s.negative)}.</p>` : list([])}
    ${clusters.length ? `<h3>Klaster frasa berulang</h3><table class="report-table"><thead><tr><th>Klaster</th><th>Ulasan negatif</th></tr></thead><tbody>${clusters.map(c => `<tr><td>${esc(c.label)}</td><td>${integer(c.total)}</td></tr>`).join('')}</tbody></table>` : ''}
  </section>
  <section class="report-block"><h2>4. Proyeksi ${p.horizonWeeks} pekan ke depan</h2>
    ${p.ok ? `<p>Bila kecepatan ulasan per pekan berlanjut, sekitar ${integer(Math.round(p.negative.projected))} ulasan negatif baru akan masuk (rentang ${integer(p.negative.low)}–${integer(p.negative.high)}), dari ${integer(p.negative.recentTotal)} yang tercatat pada ${p.horizonWeeks} pekan terakhir. NSS proyeksi ${p.nssProjected.point === null ? 'N/A' : `${p.nssProjected.point > 0 ? '+' : ''}${number(p.nssProjected.point)} poin`} (rentang ${p.nssProjected.low === null ? 'N/A' : `${number(p.nssProjected.low)} sampai ${number(p.nssProjected.high)}`}) terhadap NSS saat ini ${p.nssCurrent === null ? 'N/A' : `${p.nssCurrent > 0 ? '+' : ''}${number(p.nssCurrent)}`}. ${p.nssProjected.sample < nssMinSample ? `Jumlah teks berlabel yang diproyeksikan hanya ${integer(p.nssProjected.sample)}, di bawah ${nssMinSample}, sehingga NSS proyeksi belum dapat diberi pita. ` : ''}Arah: ${esc(projectionSignals[p.signal])}.</p>
    <table class="report-table"><thead><tr><th>Area</th><th>Tercatat ${p.horizonWeeks} pekan</th><th>Proyeksi</th><th>Rentang</th><th>Arah</th><th>Penanggung jawab</th></tr></thead><tbody>${p.themes.map(t => `<tr><td>${esc(t.name)}</td><td>${integer(t.recentTotal)}</td><td>${integer(Math.round(t.projected))}</td><td>${integer(t.low)}–${integer(t.high)}</td><td>${esc(projectionTrends[t.direction])}</td><td>${esc(t.owner)}</td></tr>`).join('')}</tbody></table>` : `<p>Proyeksi tidak dihitung: ${esc(p.reason || 'data belum memenuhi syarat minimal.')}</p>`}
  </section>
  <section class="report-block"><h2>5. Daftar insiden — ${integer(negative.length)} ulasan negatif (seluruhnya, tanpa sampling)</h2>
    ${negative.length ? `<div class="report-scroll"><table class="report-table incident-table"><thead><tr><th>Tanggal</th><th>Waktu publikasi (UTC)</th><th>Kanal</th><th>Penulis</th><th>Bintang</th><th>Aspek</th><th>Emosi</th><th>Niat</th><th>Teks asli</th><th>Sumber</th><th>ID</th></tr></thead><tbody>${negative.map(r => { const absa = absaOf(r); return `<tr><td>${esc(r.date || 'N/A')}</td><td>${esc(r.publishedAt || 'N/A')}</td><td>${esc(platformById(r.platform)?.name || r.platform)}</td><td>${esc(authorName(r))}</td><td>${esc(hasRating(r.rating) ? `${r.rating}/5` : 'N/A')}</td><td>${esc(absa.aspects.length ? absa.aspects.map(id => aspectNames[id]).join(', ') : 'N/A')}</td><td>${esc(emotionNames[absa.emotion] || 'N/A')}</td><td>${esc(intentNames[absa.intent] || 'N/A')}</td><td class="incident-text">${esc(r.title ? `${r.title} — ${r.text}` : r.text)}</td><td>${esc(safeHttps(r.sourceUrl) || 'N/A')}</td><td>${esc(r.id)}</td></tr>`; }).join('')}</tbody></table></div>` : list([])}
  </section>
  <section class="report-block"><h2>6. Metodologi dan batasan</h2>
    <p>Seluruh teks, nama penulis, tanggal, penilaian bintang, dan tautan sumber diambil apa adanya dari halaman publik masing-masing kanal; tidak ada baris yang dibuat-buat dan tidak ada sampel yang dibatasi dalam daftar insiden di atas. Label sentimen, aspek, emosi, dan niat dihitung dengan aturan kata kunci deterministik di perangkat ini (bukan model bahasa), sehingga negasi, sarkasme, dan bahasa campur dapat keliru dan perlu pemeriksaan manusia.</p>
    <p>Batasan yang harus dibaca bersama angka ini: (1) yang dianalisis adalah ulasan publik tertulis, bukan seluruh pengguna atau transaksi; (2) kanal yang konektornya belum tersedia atau sedang gagal tidak muncul sebagai nol keluhan; (3) jumlah ulasan per jendela sangat dipengaruhi jadwal penarikan data; (4) teks yang masih perlu ditinjau dikeluarkan dari pembilang dan penyebut persentase; (5) tren dan proyeksi memakai tanggal publikasi, dan ulasan tanpa tanggal tidak masuk grafik. Rincian status per kanal tersedia pada menu Platform dasbor ini.</p>
  </section>`;
}
let reportTitleBefore = '';
function restoreReportChrome() {
  if (!document.body.classList.contains('reporting')) return;
  document.body.classList.remove('reporting');
  if (reportTitleBefore) { document.title = reportTitleBefore; reportTitleBefore = ''; }
}
function openIncidentReport(kind) {
  // Lingkup laporan selalu sama dengan kartu yang menautkannya: lingkup global dasbor,
  // bukan turunan klaster/topik yang sedang dibuka di tabel.
  const data = analyticalReviews();
  const negative = data.filter(r => r.sentiment === 'negative');
  if (!negative.length) { notify('Tidak ada ulasan negatif dalam filter ini, jadi laporan insiden tidak dibuat.'); return; }
  if (kind === 'csv') {
    download(exportCsv(negative), `${projectSlug()}-insiden-${state.platform}-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8');
    notify(`${negative.length} ulasan negatif diekspor sebagai laporan insiden.`);
    return;
  }
  reportTitleBefore = document.title;
  document.title = `Laporan Insiden Sentimen ${projectName()} ${new Date().toISOString().slice(0, 10)}`;
  $('#report-root').innerHTML = incidentReportHtml(data);
  document.body.classList.add('reporting');
  window.print();
  setTimeout(restoreReportChrome, 1500);
}
function mixRows(data,pick,names) {
  const counts=new Map();
  for (const row of data) { const key=pick(absaOf(row)); counts.set(key,(counts.get(key)||0)+1); }
  const total=data.length;
  return [...counts].sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0]),'id')).map(([id,count])=>`<div class="distribution-item"><span>${esc(names[id]||id)}</span><strong>${integer(count)}<small>${number(pct(count,total))}%</small></strong></div>`).join('')||'<p class="feature-hint">Belum ada data.</p>';
}
function absaCard(data) {
  const aspects=aspectStats(data,'all').filter(a=>a.total>0);
  return `<article class="card absa-card"><div class="card-header"><div><h2>Aspek, emosi, dan niat</h2><p class="card-subtitle">Analisis sentimen per aspek pengalaman (ABSA) yang diturunkan dari teks ulasan</p></div>${icon('layers')}</div>
    ${aspects.length?`<div class="feature-list aspect-list">${aspects.map(a=>`<div class="feature-row"><div class="feature-row-label"><span>${esc(a.name)}</span><strong>${a.total} ulasan · ${a.negative} negatif</strong></div><div class="feature-bar" role="img" aria-label="${esc(`${a.name}: ${sentimentKeys.map(k=>`${a[k]||0} ${sentimentNames[k]}`).join(', ')}`)}">${sentimentKeys.map(k=>`<span class="${k}" style="width:${pct(a[k]||0,a.total)}%" title="${esc(sentimentNames[k])}: ${a[k]||0}"></span>`).join('')}</div></div>`).join('')}${legend()}</div>`:empty('Belum ada aspek yang terbaca','Ulasan tanpa topik yang jelas tidak dipaksakan ke dalam aspek.')}
    <div class="absa-mixes"><section><h3>Niat ulasan</h3>${mixRows(data,a=>a.intent,intentNames)}</section><section><h3>Emosi terdeteksi</h3>${mixRows(data,a=>a.emotion,emotionNames)}</section></div>
    <p class="note-inline">Aspek dipetakan dari topik dan kata kunci pada teks; emosi dan niat memakai kamus pola bahasa Indonesia. Ketiganya aturan deterministik, bukan model bahasa, sehingga pola baru (sarkasme, bahasa campur) dapat terlewat dan perlu pemeriksaan manusia.</p>
  </article>`;
}
function featureCard(data) {
  const groups=groupStats(data,featureGroups);
  return `<article class="card"><div class="card-header"><div><h2>Topik yang dibahas</h2><p class="card-subtitle">Seluruh ulasan menurut area pengalaman, bukan peringkat keluhan</p></div><button class="btn-text" data-view="sentiment">Detail ${icon('arrow')}</button></div><div class="feature-list">${groups.map((g,i)=>`<div class="feature-row"><div class="feature-row-label"><button class="btn-text" data-feature="${i}">${esc(g.name)}</button><strong>${g.total} ulasan</strong></div><div class="feature-bar" role="img" aria-label="${esc(`${g.name}: ${sentimentKeys.map(k=>`${g[k]||0} ${sentimentNames[k]}`).join(', ')}`)}">${sentimentKeys.map(k=>`<span class="${k}" style="width:${pct(g[k]||0,g.total)}%" title="${esc(sentimentNames[k])}: ${g[k]||0}"></span>`).join('')}</div></div>`).join('')}${legend()}<p class="feature-hint">Satu ulasan dapat membahas beberapa area. Panjang segmen dihitung dari seluruh ulasan pada area tersebut, termasuk yang masih perlu ditinjau.</p></div></article>`;
}
function priorities(data) {
  const groups=groupStats(data,painGroups,'negative').filter(g=>g.total).sort((a,b)=>b.total-a.total).slice(0,3);
  return `<article class="card"><div class="card-header"><div><h2>Prioritas perbaikan</h2><p class="card-subtitle">Tema keluhan yang perlu ditinjau, bukan insiden yang telah terkonfirmasi</p></div><button class="btn-text" data-view="sentiment" aria-label="Lihat semua prioritas">${icon('arrow')}</button></div>${groups.length?`<div class="priority-list">${groups.map((g,i)=>`<div class="priority"><span class="priority-number">0${i+1}</span><div class="priority-main"><h3>${esc(g.name)}</h3><p>${esc(g.action)}</p></div><span class="priority-count">${g.total} ulasan</span></div>`).join('')}</div>`:empty('Tidak ada keluhan dalam filter','Angka ini tidak berarti seluruh pengguna terbebas dari kendala; perhatikan cakupan data dan jumlah ulasan.')}</article>`;
}
function dataScopeNote() {
  const rows=['play','appstore'].map(id=>{
    const p=platformById(id), stored=reviews.filter(r=>r.platform===id).length, listing=latestListing(id), source=sourceFor(p);
    const ratings=numericCount(listing?.ratingCount) ?? numericCount(source.ratingCount);
    return `${esc(p.short)}: ${integer(stored)} ulasan tertulis${ratings!==null?` · ${integer(ratings)} penilaian halaman toko`:''} · ${esc(sourceStatusNames[source.status] || 'Status belum tersedia')}`;
  });
  return `<p class="note-inline scope-note">${icon('info')}<span><strong>${integer(reviews.length)} teks ulasan tersimpan</strong> dapat dicari berdasarkan nama atau teks; duplikat dihapus dalam satu kanal, sedangkan teks yang sama pada kanal berbeda tetap dihitung dua kali. Seluruh ulasan tersimpan digunakan dalam analisis; kelengkapan seluruh ulasan di internet belum dapat dipastikan. ${rows.join('; ')}. Jumlah penilaian toko bukan jumlah teks ulasan; selisihnya tidak membuktikan penyebab data belum tersedia. Rincian pengambilan tersedia pada menu Platform.</span></p>`;
}
function topicChip(tag, clickable) {
  const label = tags[tag] || tag;
  return clickable
    ? `<button class="tag tag-chip-button" data-tag="${esc(tag)}"${tagStyle(tagColors[tag])}>${icon('tagIcon')}${esc(label)}</button>`
    : `<span class="tag"${tagStyle(tagColors[tag])}>${icon('tagIcon')}${esc(label)}</span>`;
}
function labelChip(r) {
  return `<span class="tag" title="${esc(labelMethod(r))}"${tagStyle(labelStyles[r.labeling] || '#878a99')}>${icon(r.labeling === 'manual' ? 'pen' : 'spark')}${esc(labelBadge(r))}</span>`;
}
function reviewRows(data) {
  return data.map((r,i)=>`<tr><td><div class="review-author"><span class="review-avatar ${['','warm','mint'][i%3]}">${esc(initials(r))}</span><div><div class="review-name" title="${esc(authorName(r))}">${esc(authorName(r))}</div><div class="review-date">${esc(dateLabel(r.date,{year:'numeric'}))}</div></div></div></td><td><button class="review-text-button" data-review="${esc(r.platform+'|'+r.id)}" aria-label="Baca ulasan ${esc(authorName(r))}"><span class="review-text">${esc(r.text)}</span></button><div class="review-tags">${reviewTags(r).map(t=>topicChip(t,true)).join('')}${labelChip(r)}</div></td><td>${platformLabel(r.platform)}${hasRating(r.rating)?`<div class="stars" aria-label="${r.rating} dari 5 bintang">${'★'.repeat(r.rating)}<span class="unfilled-stars">${'★'.repeat(5-r.rating)}</span></div>`:'<div class="review-date">Penilaian N/A</div>'}</td><td>${badge(r.sentiment)}</td><td><button class="icon-button" data-review="${esc(r.platform+'|'+r.id)}" aria-label="Detail ulasan ${esc(authorName(r))}">${icon('chevron')}</button></td></tr>`).join('');
}
const sortHeaders = [
  { cell: 'Pengguna / tanggal', keys: [['author','Pengguna'],['date','Tanggal']] },
  { cell: 'Ulasan & topik', keys: [['topic','Ulasan & topik']] },
  { cell: 'Platform', keys: [['platform','Platform']] },
  { cell: 'Sentimen', keys: [['sentiment','Sentimen']] },
];
function sortButton(key, label) {
  const active = state.sort.key === key;
  // Arah urutan harus ada di nama tombol, bukan hanya pada ikon caret yang decorative.
  const aria = active ? `Urutkan menurut ${label}, saat ini ${state.sort.dir === 'asc' ? 'menaik' : 'menurun'}` : `Urutkan menurut ${label}`;
  return `<button class="th-sort${active?' active':''}" data-sort="${esc(key)}" aria-label="${esc(aria)}" title="${esc(aria)}">${esc(label)}${icon('caret')}</button>`;
}
function reviewHeadings() {
  return sortHeaders.map(({ keys }) => {
    const active = keys.find(([key]) => key === state.sort.key);
    const aria = active ? (state.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
    return `<th scope="col" aria-sort="${aria}">${keys.map(([key,label]) => sortButton(key,label)).join('<span class="th-sep" aria-hidden="true">/</span>')}</th>`;
  }).join('');
}
function reviewTable(data, full=false) {
  const all=full?sortReviews(visibleReviews()):[...data].sort(newestFirst), pageSize=full?(state.size==='all'?Math.max(all.length,1):Number(state.size)||10):4;
  const totalPages=Math.max(1,Math.ceil(all.length/pageSize));
  state.page=Math.max(1,Math.min(state.page,totalPages));
  const shown=all.slice(full?(state.page-1)*pageSize:0,full?state.page*pageSize:pageSize);
  const complaint=state.complaint?complaintStats(analyticalReviews()).find(g=>g.id===state.complaint):null;
  const cluster=state.cluster?painClusters.find(c=>c.id===state.cluster):null;
  return `<article class="card review-card"><div class="card-header"><div><h2>${full?'Seluruh ulasan':'Suara merchant terbaru'}</h2><p class="card-subtitle">${full?`Diurutkan menurut ${esc(sortFieldLabels[state.sort.key]||'tanggal ulasan')} — ${state.sort.dir==='asc'?'menaik':'menurun'}. Klik judul kolom untuk mengubah urutan.`:'Ulasan terbaru dari data yang dipilih'}</p></div>${!full?`<button class="btn-text" data-view="reviews">Lihat semua ${icon('arrow')}</button>`:`<div class="review-heading-actions"><span class="badge">${all.length} ulasan</span><button class="btn" data-action="export">${icon('download')}Unduh CSV</button></div>`}</div>${full?`<div class="review-controls"><label class="size-label">Baris ditampilkan<select class="tag-filter size-filter" id="page-size" aria-label="Jumlah baris ulasan yang ditampilkan">${[10,25,50].map(size=>`<option value="${size}" ${String(state.size)===String(size)?'selected':''}>${size} baris</option>`).join('')}<option value="all" ${state.size==='all'?'selected':''}>Semua ${integer(all.length)} ulasan</option></select></label></div>${dataScopeNote()}${state.complaint?`<div class="active-filter complaint-filter"><span>Keluhan: <strong>${esc(complaint?complaintName(complaint):state.complaint)}</strong> · hanya negatif · ${all.length} ulasan unik</span><button class="btn-text" data-action="clear-complaint" aria-label="Hapus filter keluhan">Hapus filter ${icon('close')}</button></div>`:''}${state.cluster?`<div class="active-filter complaint-filter"><span>Klaster keluhan: <strong>${esc(cluster?cluster.label:state.cluster)}</strong> · hanya negatif · ${all.length} ulasan</span><button class="btn-text" data-action="clear-complaint" aria-label="Hapus filter klaster">Hapus filter ${icon('close')}</button></div>`:''}${state.group?`<div class="active-filter"><span>Topik: ${esc(state.groupName)}</span><button class="btn-text" data-action="clear-group">Hapus filter ${icon('close')}</button></div>`:''}${summary(all).unclassified?`<p class="note-inline">${summary(all).unclassified} ulasan perlu ditinjau; tidak dihitung sebagai netral dan tidak termasuk dasar perhitungan persentase sentimen maupun NSS.</p>`:''}`:''}${all.length?`<div class="table-wrap" tabindex="0" role="region" aria-label="Tabel ulasan; gulir horizontal jika diperlukan"><table><thead><tr>${full?reviewHeadings():'<th scope="col">Pengguna / tanggal</th><th scope="col">Ulasan & topik</th><th scope="col">Platform</th><th scope="col">Sentimen</th>'}<th scope="col"><span class="sr-only">Detail</span></th></tr></thead><tbody>${reviewRows(shown)}</tbody></table></div><div class="table-footer"><span>Menampilkan ${full?(state.page-1)*pageSize+1:1}–${full?Math.min(state.page*pageSize,all.length):shown.length} dari ${all.length} ulasan</span>${full?`<div class="pagination"><button data-page="prev" aria-label="Halaman sebelumnya" ${state.page===1?'disabled':''}>${icon('left')}</button><span>${state.page} / ${totalPages}</span><button data-page="next" aria-label="Halaman berikutnya" ${state.page===totalPages?'disabled':''}>${icon('chevron')}</button></div>`:'<span>Tanggal terbaru; tanpa tanggal di akhir</span>'}</div>`:empty('Tidak ada ulasan yang sesuai','Ubah kata kunci, sentimen, topik, platform, atau rentang tanggal. Ulasan tanpa tanggal hanya masuk pilihan semua tanggal.')}</article>`;
}
function overview(data) {
  return `${summaryHeader(data)}${anomalyBanner(data)}${chartOne(data)}<section class="grid-lower">${chartTwo(data)}${chartThree(data)}</section><section class="grid-lower">${chartFour(data)}${nssGauge(data)}</section><section class="grid-complaint">${complaintChart()}${projectionCard(data)}</section>${sampleRating(data)}<section class="grid-lower">${featureCard(data)}${priorities(data)}</section>${incidentCard(data)}${reviewTable(data)}`;
}
function driverCard(data,sentiment) {
  const groups=groupStats(data,sentiment==='positive'?positiveGroups:painGroups,sentiment).filter(g=>g.total).sort((a,b)=>b.total-a.total);
  const count=summary(data)[sentiment];
  return `<article class="card analysis-card ${sentiment}"><div class="card-header"><div class="analysis-title"><span class="analysis-icon">${icon(sentiment==='positive'?'smile':'frown')}</span><div><h2>${sentiment==='positive'?'Yang disukai merchant':'Yang perlu diperbaiki'}</h2><p class="card-subtitle">${sentiment==='positive'?'Tema pujian':'Tema keluhan'}</p></div></div><strong class="analysis-total">${count}</strong></div>${groups.length?`<div class="driver-list">${groups.map(g=>`<div class="driver"><div class="driver-heading"><h3>${esc(g.name)}</h3><span class="driver-count">${g.total} ulasan</span></div><div class="feature-bar"><span class="${sentiment}" style="width:${pct(g.total,count)}%"></span></div><p>${esc(g.action)}</p><button class="btn-text" data-driver="${esc(g.name)}" data-driver-sentiment="${sentiment}">Telusuri bukti ${icon('arrow')}</button></div>`).join('')}</div>`:empty('Belum ada tema spesifik','Ulasan umum tidak dipaksakan ke dalam kategori fitur.')}<p class="note-inline">Satu ulasan dapat masuk beberapa tema. ${sentiment==='positive'?'Pujian':'Keluhan'} umum tanpa objek yang jelas tidak dihitung sebagai tema fitur.</p></article>`;
}
function analysis(data) {
  const s=summary(data), mismatches=data.filter(r=>hasRating(r.rating)&&r.rating>=4&&r.sentiment==='negative');
  const ranked=groupStats(data,painGroups,'negative').filter(g=>g.total).sort((a,b)=>b.total-a.total);
  return `${metricCards(data)}${complaintChart()}${absaCard(data)}<div class="analysis-grid">${driverCard(data,'positive')}${driverCard(data,'negative')}</div><div class="grid-lower">${featureCard(data)}<article class="card method-card"><h2>Di balik angka sentimen</h2><p>${s.classified?`${s.positive} ulasan positif dan ${s.negative} ulasan negatif dari ${s.classified} ulasan berlabel sentimen menghasilkan NSS ${s.nss>0?'+':''}${number(s.nss)} poin. Angka ini bukan skor kepuasan seluruh merchant.`:'Belum ada ulasan berlabel sentimen untuk menghitung interpretasi.'}</p><div class="formula">NSS = (positif − negatif) ÷ jumlah ulasan berlabel × 100</div><p><strong>${mismatches.length} ulasan berbintang tinggi berisi keluhan.</strong> Penilaian bintang 4–5 tidak otomatis berarti positif. Label otomatis memakai aturan kata kunci dan dapat keliru pada negasi, sarkasme, atau ulasan dengan beberapa aspek. ${s.unclassified?`${s.unclassified} ulasan yang perlu ditinjau tidak dihitung sebagai netral.`:'Tidak ada ulasan yang perlu ditinjau; seluruh ulasan telah memiliki label sentimen.'}</p><p>Keluhan mengenai pembaruan pencairan dana yang tidak tampil belum membuktikan adanya keterlambatan dana. Perlu verifikasi melalui catatan operasional.</p></article></div><article class="card"><div class="card-header"><div><h2>Rekomendasi untuk produk dan operasional</h2><p class="card-subtitle">Diurutkan menurut jumlah keluhan terkait dalam filter</p></div>${icon('spark')}</div>${ranked.length?`<div class="recommendations">${ranked.map((g,i)=>`<div class="recommendation"><span class="priority-number">${i+1}</span><div><h3>${esc(g.name)} <span class="tag">${g.total} ulasan</span></h3><p>${esc(g.action)}</p><p><strong>Pantau:</strong> ${esc(g.metric)}.</p></div><div class="owner"><strong>PENANGGUNG JAWAB</strong>${esc(g.owner)}</div></div>`).join('')}</div>`:empty('Belum ada keluhan spesifik','Tidak ada rekomendasi berbasis keluhan yang dapat diprioritaskan dalam filter ini.')}</article>`;
}
// Tautan "Halaman publik" menunjuk ke aplikasi project yang sedang dibuka, bukan ke alamat tetap
// yang tertulis pada daftar platform. Tanpa identitas toko, tidak ada tautan yang ditawarkan.
function channelPageUrl(id) {
  const target = projects.target;
  if (id === 'play') return safeHttps(target?.play?.url) || (target?.play?.appId ? safeHttps(`https://play.google.com/store/apps/details?id=${encodeURIComponent(target.play.appId)}&hl=id`) : null);
  if (id === 'appstore') return safeHttps(target?.appstore?.url) || (target?.appstore?.appId ? safeHttps(`https://apps.apple.com/id/app/id${encodeURIComponent(target.appstore.appId)}`) : null);
  return null;
}
function latestListing(id) {
  const history=[...sync.sources, ...(sync.lastRun?.sources || []), ...sync.runs.flatMap(run=>Array.isArray(run.sources)?run.sources:[])];
  return history.filter(s=>s.id===id && s.status!=='snapshot' && (['success','partial'].includes(s.status)||s.lastSuccessAt) && typeof s.rating==='number' && s.rating>=1 && s.rating<=5 && Number.isFinite(Date.parse(s.lastSuccessAt || s.checkedAt || '')))
    .sort((a,b)=>Date.parse(b.lastSuccessAt || b.checkedAt)-Date.parse(a.lastSuccessAt || a.checkedAt))[0];
}
// Jejak paginasi dibuat dari hasil pengambilan tersimpan agar klaim kelengkapan dapat diperiksa, bukan disimpulkan.
function paginationTrace(id, coverage) {
  if (!coverage || typeof coverage !== 'object') return '';
  if (id === 'play' && Number.isInteger(coverage.pagesRead)) return `${coverage.pagesRead} halaman, ${coverage.rows} baris, tanpa batas sampel`;
  if (id === 'appstore' && Number.isInteger(coverage.shelfPages)) return `halaman ulasan ${coverage.shelfPages} halaman, feed resmi ${coverage.feedPages} halaman, ${coverage.sharedReviews} ulasan dikonfirmasi dua jalur`;
  if (Number.isInteger(coverage.itemsRead)) return `${coverage.itemsRead} item dataset dibaca${Number.isInteger(coverage.commentItemsRead)&&coverage.commentItemsRead?`, ${coverage.commentItemsRead} item dataset komentar`:''}${Number.isInteger(coverage.emptyResultMarkers)?`, ${coverage.emptyResultMarkers} penanda tidak ada hasil`:''}${Number.isInteger(coverage.identityFiltered)?`, ${coverage.identityFiltered} teks di luar identitas produk`:''}${coverage.followUp?.runId?`, fase komentar ${coverage.followUp.finished===false?'masih berjalan':'sudah selesai'}`:''}${Number.isInteger(coverage.sampleLimit)?`, batas hasil actor ${coverage.sampleLimitField ?? 'input'}=${coverage.sampleLimit}${coverage.possiblyTruncated?' (terpotong di batas ini)':' (belum tercapai)'}`:', tanpa batas hasil pada input actor'}`;
  if (Number.isInteger(coverage.placesFound)) return `${coverage.placesFound} place ditemukan, ${coverage.productMatches} bernama produk, ${coverage.reviewFieldsSeen} teks ulasan disediakan API`;
  if (Number.isInteger(coverage.pagesRead) && Number.isInteger(coverage.relevantVideos)) return `${coverage.pagesRead} halaman API, ${coverage.relevantVideos} video relevan, ${coverage.completedVideos} selesai dipaginasi`;
  return '';
}
function coverage() {
  const scoped=filterReviews(reviews,{from:state.from,to:state.to});
  const socialCount = reviews.filter(r=>platformById(r.platform)?.type==='Media sosial').length;
  const readSources = sync.sources.filter(source=>['success','partial'].includes(source.status)).length;
  const activeProject = projects.list.find(project => project.id === projects.active) || null;
  const targetIds = [projects.target?.play?.appId ? `Google Play ${projects.target.play.appId}` : null, projects.target?.appstore?.appId ? `App Store ${projects.target.appstore.appId}` : null].filter(Boolean).join(' · ');
  const storageNotice = sync.storageWarning ? `<p class="coverage-warning" role="status">${esc(sync.storageWarning)}</p>` : '';
  return `${storageNotice}<p class="coverage-intro"><strong>Project aktif: ${esc(activeProject?.name || 'belum ada project')}</strong> — penarikan mengikuti ${esc(targetIds || 'identitas toko yang belum lengkap')}. ${readSources} dari ${platforms.length} sumber memiliki hasil pengambilan berhasil atau sebagian pada status terakhir. ${socialCount?`${socialCount} komentar sosial tersimpan; hanya teks dengan relevansi dan sentimen yang cukup jelas masuk perhitungan NSS.`:'Belum ada komentar media sosial yang tersimpan. Angka sentimen saat ini bukan analisis media sosial.'} Konfigurasi API tidak sama dengan akses yang sudah berhasil. Kegagalan pengambilan tidak menghapus data tersimpan.</p><div class="coverage-grid">${platforms.filter(p=>state.platform==='all'||p.id===state.platform).map(p=>{
    const source=sourceFor(p), data=scoped.filter(r=>r.platform===p.id), s=summary(data), rating=ratingSummary(data);
    const stored=reviews.filter(r=>r.platform===p.id).length, listing=latestListing(p.id), url=channelPageUrl(p.id);
    const histogram=p.type==='Toko aplikasi'?storeHistogram(p.id):null;
    // Google dan Apple memublikasikan angka agregat dan bucket histogram pada elemen halaman
    // yang berbeda; selisihnya nyata ada di sumber, jadi ditampilkan apa adanya, tidak dipaksa sama.
    const aggregateCount=numericCount(listing?.ratingCount);
    const histogramGap=histogram&&Number.isInteger(aggregateCount)&&aggregateCount!==histogram.reduce((a,b)=>a+b,0)?aggregateCount-histogram.reduce((a,b)=>a+b,0):null;
    const installs = source.installs ?? listing?.installs ?? null;
    const status=Object.hasOwn(sourceStatusNames,source.status)?source.status:'snapshot';
    const fetched=fetchedCount(source), serverCount=numericCount(source.count);
    const unavailable = awaitingSource(source) && !stored;
    const notMeasured = !stored && status !== 'success';
    const excluded = data.filter(r=>r.relevance?.status==='excluded').length;
    const uncertain = data.filter(r=>r.relevance?.status==='uncertain').length;
    const isStore = p.type === 'Toko aplikasi';
    const trace = paginationTrace(p.id, source.coverage ?? source.scope);
    const message = status==='success'&&isStore ? `Daftar ulasan publik dibaca sampai sumber tidak memberi halaman berikutnya${trace?` (${trace})`:''}; jumlah tersimpan adalah seluruh ulasan berteks yang dikembalikan jalur publik itu pada pemeriksaan terakhir. Status berhasil tidak berarti seluruh percakapan di internet atau seluruh penilaian toko terkumpul. Jumlah penilaian toko bukan jumlah teks ulasan.` : source.message || p.note;
    const statusLabel = status==='success'?(Number.isInteger(fetched)&&fetched===0?'Terhubung · tanpa hasil':'Berhasil'):status==='snapshot'?'Data tersimpan':sourceStatusNames[status];
    const scoreClass = !s.classified?'':s.nss>0?'positive':s.nss<0?'negative':'neutral';
    return `<article class="card coverage-card ${unavailable?'is-unavailable':''}" data-source-card="${esc(p.id)}">
      <div class="coverage-header">
        <div class="coverage-title"><span class="platform-circle" style="color:${color(p.color)}">${icon(p.icon)}</span><div><h3>${esc(p.name)}</h3><small>${esc(p.type)}</small></div></div>
        <span class="coverage-state ${status}" title="${esc(sourceStatusNames[status])}"><span class="dot"></span>${esc(statusLabel)}</span>
      </div>
      ${unavailable?`<p class="source-message">${esc(message)}</p>`:''}
      <div class="coverage-stats">${notMeasured?`<div><strong>—</strong><small>Data belum tersedia</small></div><div><strong>—</strong><small>NSS belum diukur</small></div>`:`<div><strong>${s.total}</strong><small>Ulasan dalam periode</small></div><div><strong class="coverage-score ${scoreClass}">${s.classified?`${s.nss>0?'+':''}${number(s.nss)}`:'—'}</strong><small>NSS · ${s.classified} ulasan berlabel</small></div>`}</div>
      ${excluded||uncertain?`<p class="needs-review">${excluded} teks di luar penilaian pelanggan; ${uncertain} komentar belum jelas relevansinya. Keduanya tersimpan, tetapi tidak dihitung sebagai positif, negatif, atau netral.</p>`:''}
      ${s.unclassified?`<p class="needs-review">${s.unclassified} ulasan perlu ditinjau; tidak dihitung sebagai netral dan tidak termasuk dasar perhitungan persentase sentimen maupun NSS.</p>`:''}
      <dl class="source-facts">
        <div><dt>Ulasan tersimpan</dt><dd>${unavailable?'—':`${stored} ulasan${serverCount!==null&&serverCount!==stored?` (data sistem: ${serverCount})`:''}`}</dd></div>
        <div><dt>Pengambilan terakhir</dt><dd>${unavailable?'Tidak diambil':status==='snapshot'?'Belum diperbarui':fetched!==null?`${fetched} ulasan`:wasFetched(source)?'Jumlah tidak tersedia':'Belum dikonfirmasi'}</dd></div>
        ${isStore?`<div><dt>Unduhan dipublikasikan</dt><dd>${installs?`${esc(installs)} · rentang Google`:'Tidak dipublikasikan'}</dd></div>`:''}
        ${trace?`<div><dt>Jejak paginasi</dt><dd>${esc(trace)}</dd></div>`:''}
        <div><dt>Waktu pemeriksaan</dt><dd>${unavailable?'Belum pernah':esc(timeLabel(source.checkedAt))}</dd></div>
        <div><dt>Keberhasilan terakhir</dt><dd>${unavailable?'Belum pernah':esc(timeLabel(source.lastSuccessAt || (status==='success'?source.checkedAt:null)))}</dd></div>
      </dl>
      ${unavailable?'':`<div class="coverage-rating-panel">
        <div class="coverage-rating"><h4>Penilaian bintang</h4><div class="coverage-rating-value">${rating.total?`<strong>${decimal(rating.average)} / 5 <span aria-hidden="true">★</span></strong><span>dari ${rating.total} ulasan</span>`:'<strong>N/A</strong><span>Tidak ada penilaian bintang</span>'}</div><p>Dalam periode terpilih. ${isStore?'Bukan penilaian seluruh halaman toko.':'Bukan penilaian seluruh platform.'}</p></div>
        ${isStore?`<div class="coverage-rating listing-rating"><h4>Skor halaman toko</h4><div class="coverage-rating-value">${listing?`<strong>${number(listing.rating)} / 5</strong><span>· ${numericCount(listing.ratingCount)!==null?integer(numericCount(listing.ratingCount)):'N/A'} penilaian halaman toko</span>`:'<strong>N/A</strong><span>Belum ada pengambilan berhasil</span>'}</div><p>${listing?`Diambil pada ${esc(timeLabel(listing.lastSuccessAt || listing.checkedAt))}. Bukan jumlah teks ulasan atau data waktu nyata.`:'Data awal tidak ditampilkan sebagai data terbaru.'}</p>${histogram?`<div class="listing-histogram">${histogramRows(histogram,`Distribusi seluruh penilaian halaman toko ${p.name}`)}</div>`:''}${histogramGap!==null?`<p class="listing-histogram-note">Jumlah bucket histogram (${integer(histogram.reduce((a,b)=>a+b,0))}) berbeda ${integer(Math.abs(histogramGap))} dari angka agregat halaman toko (${integer(aggregateCount)}). Kedua angka dipublikasikan sumber pada elemen halaman yang berbeda dan tidak dipaksa sama; tidak ada penilaian yang ditambahkan atau dibuang.</p>`:''}</div>`:''}
      </div>`}
      ${status==='success'?`<details class="coverage-scope"><summary>Cakupan pengambilan</summary><p class="source-message">${esc(message)}</p></details>`:!unavailable?`<p class="source-message source-alert">${esc(message)}</p>`:''}
      ${!unavailable||url?`<div class="coverage-actions">${unavailable?'':`<button class="btn-text" data-open-platform="${esc(p.id)}">Jelajahi ulasan ${icon('arrow')}</button>`}${url?`<a class="btn-text action-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Halaman publik ${icon('external')}</a>`:''}</div>`:''}
    </article>`;
  }).join('')}</div><article class="card method-card"><h2>Batas perbandingan sumber</h2><p>Jumlah ulasan tersimpan tidak menggambarkan seluruh percakapan di suatu platform. Sumber yang belum terhubung tidak berarti tidak ada keluhan. Penilaian seluruh halaman toko, penilaian pada ulasan, dan sentimen teks merupakan ukuran yang berbeda. Perbandingan antarplatform perlu memperhatikan periode, cakupan, dan jumlah ulasan; jumlah ulasan yang kecil belum membuktikan pengalaman pengguna di suatu platform lebih baik.</p></article>`;
}
// Panel kualitas label: angka dihitung dari baris yang sudah dinilai manusia pada project ini,
// bukan dikutip dari klaim pabrik model. Keterbatasannya dinyatakan apa adanya.
function classifierQuality() {
  const score = scoreClassifier(reviews);
  if (!score.n) return '<article class="card method-card"><h2>Kualitas label otomatis</h2><p>Belum ada ulasan pada project ini yang sudah dinilai manusia, jadi kecocokan aturan label otomatis belum dapat diukur. Setelah Anda menilai beberapa ulasan (label manual), panel ini menghitung kesesuaian aturan terhadap penilaian Anda.</p></article>';
  const pctValue = value => value === null ? '—' : `${number(value * 100)}%`;
  const rows = [['Positif','positive'],['Negatif','negative'],['Netral','neutral']].filter(([,key]) => score.perClass[key]);
  const table = `<table class="quality-table"><thead><tr><th>Label</th><th>Contoh manusia</th><th>Presisi</th><th>Rekal</th><th>F1</th></tr></thead><tbody>${
    rows.map(([label,key]) => { const s = score.perClass[key]; return `<tr><th scope="row">${label}</th><td>${s.support}</td><td>${pctValue(s.precision)}</td><td>${pctValue(s.recall)}</td><td>${s.f1===null?'—':decimal(s.f1)}</td></tr>`; }).join('')
  }</tbody></table>`;
  const misses = score.n - score.agree;
  return `<article class="card method-card"><h2>Kualitas label otomatis</h2>
    <p>Aturan label (versi <code>rules-v1</code>) diuji terhadap <strong>${integer(score.n)} ulasan yang sudah Anda nilai sendiri</strong> pada project ini. Hasilnya: <strong>${integer(score.agree)} dari ${integer(score.n)} cocok (${number(score.observed * 100)}%)</strong>, Cohen&apos;s kappa <strong>${score.kappa===null?'—':decimal(score.kappa)}</strong>. ${misses ? `${integer(misses)} ulasan tidak cocok dan ditandai perlu ditinjau, bukan dipaksa ke salah satu kelas.` : 'Tidak ada selisih pada sampel ini.'}</p>
    ${table}
    <div class="method-callout">Baca batasnya: angka ini dihitung pada sampel yang sama dengan yang dipakai menyusun aturan, jadi ia mengukur kecocokan internal — bukan akurasi pada teks baru. Presisi tinggi berarti label yang diberikan hampir selalu benar; rekal rendah berarti masih banyak teks benar yang belum dikenali aturannya dan berakhir sebagai "perlu tinjauan". Sarkasme dan ironi belum ditangani; teks pendek tanpa kata sifat umumnya tidak dinilai.</div>
    <p class="note-inline">Ulasan berlabel "perlu tinjauan" tidak masuk pembagi persentase sentimen maupun NSS, sehingga angka yang tampil tidak menggelembung karena teks yang tidak dipahami.</p></article>`;
}
function methodology() {
  const base=summary(reviews);
  const active = projects.list.find(project => project.id === projects.active) || null;
  const categoryCounts = new Map();
  for (const row of analyticalReviews()) for (const tag of new Set(reviewTags(row))) categoryCounts.set(tag, (categoryCounts.get(tag) || 0) + 1);
  // Kalimat sumber selalu melaporkan project aktif: tidak ada lagi angka bawaan yang bisa
  // disalahartikan sebagai hasil penarikan pengguna.
  const storeCounts = [['play', 'Play Store'], ['appstore', 'App Store']]
    .map(([id, label]) => ({ label, count: storeRatingCount(id) })).filter(entry => entry.count !== null);
  const countSentence = storeCounts.length
    ? `Jumlah ulasan tertulis berbeda dari ${storeCounts.map(entry => `${integer(entry.count)} penilaian ${entry.label}`).join(' dan ')} pada halaman toko project ini, karena penilaian tanpa teks tidak menyertakan nama atau isi yang dapat dianalisis.`
    : 'Jumlah penilaian pada halaman toko project ini belum terbaca, jadi angka itu tidak ditampilkan sama sekali.';
  const dataOrigin = active
    ? `Project <strong>${esc(active.name)}</strong> saat ini memuat <strong>${integer(reviews.filter(r=>r.platform==='play').length)} ulasan tertulis Google Play</strong> dan <strong>${integer(reviews.filter(r=>r.platform==='appstore').length)} ulasan tertulis App Store</strong> hasil penarikan Anda. Aplikasi yang dianalisis adalah ${esc(active.name)} (Play: <strong>${esc(projects.target?.play?.appId || 'tidak terpasang')}</strong>; App Store: <strong>${esc(projects.target?.appstore?.appId || 'tidak terpasang')}</strong>). Identitas toko ini yang Anda konfirmasi saat project dibuat; aplikasi lain dengan nama serupa tidak termasuk.`
    : 'Belum ada project. Angka sumber akan dilaporkan setelah project pertama dibuat.';
  return `<div class="method-grid">
    <article class="card method-card"><h2>Sumber dan cakupan</h2><p>${dataOrigin}</p><p>Tombol Tarik Analisis mengambil data dari kedua toko aplikasi yang terhubung dan memuat seluruh halaman pada setiap kumpulan ulasan yang tersedia, dengan urutan terbaru. Google Play memisahkan daftar ulasannya menurut bahasa antarmuka, sehingga kumpulan bahasa Indonesia dan kumpulan bahasa Inggris dibaca keduanya lalu digabung berdasarkan ID ulasan. Jumlah ulasan tertulis dibaca dari data project ini. ${countSentence} Filter hanya membatasi tampilan, bukan proses pengambilan data. Platform lain belum terhubung dan dilaporkan sebagai belum diambil, bukan nol keluhan.</p><div class="method-callout">Konten promosi resmi, pemberitaan, ulasan duplikat, dan komentar tentang produk lain tidak diperlakukan sebagai pengalaman merchant.</div><p><strong>Unduhan.</strong> Google Play hanya mempublikasikan rentang unduhan, saat ini ${esc(storeInstalls('play') || 'belum terbaca')}. Apple tidak mempublikasikan jumlah unduhan di halaman publik, sehingga metrik tersebut tidak tersedia dan tidak diperkirakan. Keduanya bukan ukuran jumlah pengguna aktif.</p></article>
    ${classifierQuality()}
    <article class="card method-card"><h2>Cara membaca sentimen</h2><ul><li><strong>Positif:</strong> pujian, kepuasan, atau manfaat yang dinyatakan pengguna.</li><li><strong>Negatif:</strong> keluhan, masalah penggunaan, dan kekurangan yang mengganggu.</li><li><strong>Netral:</strong> informasi atau pertanyaan tanpa penilaian yang jelas; bukan label pengganti untuk teks yang tidak dipahami.</li><li><strong>Perlu tinjauan:</strong> teks belum cukup jelas untuk dinilai; tidak dihitung sebagai netral dan tidak termasuk dasar perhitungan persentase sentimen maupun NSS.</li></ul><div class="formula">NSS = (positif − negatif) ÷ jumlah ulasan berlabel × 100</div><p>Ulasan berlabel sentimen mencakup ulasan positif, negatif, dan netral. ${base.classified ? `Pada project ini: (${base.positive} − ${base.negative}) ÷ ${base.classified} × 100 = <strong>${base.nss>0?'+':''}${number(base.nss)} poin</strong>.` : 'Belum ada teks berlabel pada project ini, jadi contoh angkanya belum dapat ditampilkan.'}</p></article>
    <article class="card method-card"><h2>Pelabelan dan keterbatasan</h2><ul><li><strong>Manual:</strong> label ditentukan dari pembacaan teks ulasan oleh pemilik dasbor; teks yang tidak berubah mempertahankan labelnya. Belum ada pemeriksaan oleh penilai kedua.</li><li><strong>Otomatis (versi 1):</strong> menggunakan aturan kata kunci sederhana, bukan model bahasa. Negasi, sarkasme, dan ulasan dengan beberapa aspek dapat dinilai keliru; teks yang tidak dikenali ditandai perlu ditinjau.</li><li>Penilaian bintang tidak menentukan sentimen secara otomatis.</li><li>Google Play memisahkan daftar ulasan menurut bahasa antarmuka. Kedua kumpulan dibaca dan digabung berdasarkan ID ulasan, sehingga tidak ada ulasan yang terlewat pada salah satu kumpulan. Kumpulan ulasan tertulis ini bukan sampel acak dan tidak mewakili seluruh penilai di halaman toko maupun seluruh pengguna.</li><li>Grafik tanggal hanya menampilkan ulasan tertulis yang memiliki tanggal. Ulasan tanpa tanggal tidak masuk rentang tanggal atau tren, tetapi datanya tetap tersimpan.</li><li>Peringkat keluhan hanya memakai ulasan negatif unik per kategori. Persentase dihitung dari seluruh ulasan negatif pada platform dan tanggal terpilih, bukan dari jumlah kategori. Satu ulasan dapat masuk beberapa kategori.</li><li>Penilaian umum tidak membuktikan kegagalan fitur; penyebutan keluhan belum tentu merupakan insiden yang terkonfirmasi.</li></ul></article>
    <article class="card method-card"><h2>Penyimpanan dan jejak perubahan</h2><p>Hasil pengambilan data disimpan di komputer ini, bukan di peramban. Dasbor memuat data tersimpan saat dibuka; pembaruan tidak berlangsung terus-menerus. Status sumber dan waktu pemeriksaan mengikuti data tersimpan. Gangguan pengambilan tidak menghapus data yang sudah tersedia.</p><p>Ulasan baru ditambahkan, sedangkan perubahan teks, penilaian bintang, atau tanggal disimpan sebagai versi sebelumnya. Detail ulasan menampilkan waktu pengambilan, waktu pertama dan terakhir tercatat, serta riwayat perubahan. Versi lama tidak dihitung sebagai ulasan baru dalam grafik.</p><p>Jika data tersimpan tidak dapat dimuat saat awal, dasbor menampilkan pesan kesalahan dan tidak menambal angkanya dengan data lain; buat project lebih dulu bila penyimpanan memang masih kosong. Penilaian halaman toko hanya ditampilkan dari data daring yang berhasil diambil dan dipisahkan dari penilaian pada ulasan. Sumber publik tidak memverifikasi identitas penulis maupun kebenaran isi keluhan.</p></article>
    <article class="card method-card"><h2>Deteksi lonjakan dan laporan insiden</h2><ul><li><strong>Jendela lonjakan.</strong> Teks dikelompokkan per jam UTC bila sumber mengirim waktu publikasi yang lengkap; bila tidak, jendela diperlebar menjadi harian dan jendela mana yang dipakai selalu tertulis pada spanduk. Ambang: minimal ${anomalyDefaults.minCurrent} ulasan negatif dalam satu jendela dan lebih dari ${anomalyDefaults.thresholdPct}% di atas rata-rata ${anomalyDefaults.baselineWindows} jendela sebelumnya (${anomalyDefaults.dailyBaselineWindows} jendela untuk versi harian). Baseline nol dilaporkan sebagai "dari nol", bukan persentase tak hingga.</li><li><strong>Pita NSS.</strong> ${nssBands.map(band=>`${band.min} sampai ${band.max} = ${band.label}`).join('; ')}. Pita hanya label ambang untuk membaca arah, bukan hasil uji statistik. Di bawah ${nssMinSample} ulasan berlabel, angka ditandai belum representatif.</li><li><strong>Laporan insiden.</strong> Daftarnya memuat seluruh ulasan negatif pada filter aktif tanpa pembatasan sampel, lengkap dengan waktu publikasi mentah (UTC), aspek, emosi, niat, dan tautan sumber; teks yang masih perlu ditinjau tidak dimasukkan karena labelnya belum pasti. PDF dibuat dari dialog cetak peramban dan CSV dari tombol di kartu yang sama — keduanya memakai baris data yang sama dengan dasbor.</li><li><strong>Batas waktu publikasi.</strong> Sebagian kanal mengirim waktu sampai detik (Google Play, App Store, YouTube); actor media sosial ada yang hanya mengirim tanggal atau jam penuh, sehingga teksnya menumpuk pada satu jendela. Distribusi per jam tidak pernah dikarang untuk teks yang sumbernya hanya mengirim tanggal.</li></ul></article>
  </div><article class="card method-card category-card"><h2>Kategori yang didukung</h2>${Object.entries(tags).map(([id,label])=>`<span class="tag">${esc(label)} · ${integer(categoryCounts.get(id)||0)}</span>`).join('')}<p>Seluruh kategori tetap terdaftar di bagian ini, termasuk yang belum memiliki ulasan. Angka di samping setiap kategori adalah jumlah teks pada pilihan filter yang sedang aktif, dan satu ulasan dapat dihitung pada beberapa kategori. Berkas CSV pada halaman ulasan mengikuti filter yang aktif.</p></article>`;
}
// Tombol geser sengaja tidak dipakai: baris platform dapat digulir dengan sentuhan, roda
// mouse, atau tombol panah saat baris itu fokus. Fungsi ini hanya menjaga tab terpilih terlihat.
function updatePlatformScroll() {
  const tabs=$('#platform-tabs');
  if (!tabs) return;
  const selected=tabs.querySelector('.active');
  if (!selected) return;
  const active=selected.getBoundingClientRect(), bounds=tabs.getBoundingClientRect();
  if (selected===tabs.firstElementChild) tabs.scrollLeft=0;
  else if (selected===tabs.lastElementChild) tabs.scrollLeft=tabs.scrollWidth;
  else if (active.left<bounds.left) tabs.scrollLeft+=active.left-bounds.left;
  else if (active.right>bounds.right) tabs.scrollLeft+=active.right-bounds.right;
}
function render({animate=false}={}) {
  const scrollLeft=$('#platform-tabs')?.scrollLeft || 0, focused=document.activeElement;
  const attribute=['data-platform','data-sentiment','data-page','data-action','data-sort','data-aspect','data-tag'].find(name=>focused?.hasAttribute(name));
  const focusSelector=focused?.id?`#${CSS.escape(focused.id)}`:attribute?`[${attribute}="${CSS.escape(focused.getAttribute(attribute))}"]`:null;
  nav();
  if (!projects.list.length) { $('#main').innerHTML=firstRun(); if (focusSelector) $(focusSelector)?.focus({preventScroll:true}); return; }
  const data=analyticalReviews();
  $('#main').classList.toggle('in-place-update',!animate);
  $('#main').innerHTML=heading()+(state.view!=='methodology'?filters():'')+(state.view==='overview'?overview(data):state.view==='sentiment'?analysis(data):state.view==='reviews'?reviewTable(data,true):state.view==='platforms'?coverage():methodology());
  if ($('#platform-tabs')) $('#platform-tabs').scrollLeft=scrollLeft;
  if (focusSelector) $(focusSelector)?.focus({preventScroll:true});
  updatePlatformScroll();
}
// Belum ada project sama sekali: dasbor tidak boleh menampilkan angka nol, karena nol akan
// terbaca sebagai 'tidak ada keluhan' padahal datanya belum pernah diambil.
function firstRun() {
  return `<section class="first-run card">
    <div class="first-run-mark">${icon('spark')}</div>
    <h1 tabindex="-1">Belum ada project</h1>
    <p>Dasbor ini mulai kosong. Buat project lebih dulu, lalu seluruh angka yang Anda lihat berasal dari penarikan yang Anda jalankan sendiri — bukan dari data contoh yang ikut terkirim dalam aplikasi.</p>
    <ol class="first-run-steps">
      <li><strong>Buat project.</strong> Isi nama project dan nama aplikasi persis seperti tertulis di toko aplikasi.</li>
      <li><strong>Centang aplikasinya.</strong> Kandidat dicari otomatis di Google Play dan App Store; Anda yang memastikan mana yang benar.</li>
      <li><strong>Tarik analisis.</strong> Semua ulasan publik pada aplikasi itu diambil tanpa pembatasan sampel, lalu dinilai sentimennya.</li>
    </ol>
    <button class="btn btn-primary" data-action="add-project">${icon('spark')}Buat project pertama</button>
    ${state.view==='overview'?'':`<p class="first-run-view">Menu <strong>${esc(views[state.view])}</strong> baru menampilkan isinya setelah project pertama dibuat dan datanya ditarik.</p>`}
  </section>`;
}
function clearComplaint() {
  if (state.complaint || state.cluster) { state.complaint=''; state.cluster=''; state.sentiment='all'; }
}
function clearReviewFilters() {
  clearComplaint();
  state.sentiment='all'; state.query=''; state.tag=''; state.group=null; state.groupName=''; state.page=1;
}
// Hanya area konten yang bergulir (topbar dan sidebar tetap). Setiap pindah menu atau project
// dimulai dari atas supaya pengguna tidak mendarat di tengah halaman yang berbeda isinya.
function resetContentScroll() {
  const main = $('#main');
  if (main) main.scrollTop = 0;
}
function navigate(view, keepComplaint=false) {
  if (!Object.hasOwn(views,view)) return;
  if (!keepComplaint) clearComplaint();
  state.view=view; state.page=1; render({animate:true}); resetContentScroll();
  $('#main h1').focus({preventScroll:true});
}
function openReview(key) {
  const r=reviews.find(x=>x.platform+'|'+x.id===key);
  if (!r) return;
  const dialog=$('#detail-dialog'), url=safeHttps(r.sourceUrl), history=reviewHistory(r);
  const platform=platformById(r.platform);
  const relevanceNames={relevant:'Relevan secara otomatis',uncertain:'Perlu tinjauan konteks',excluded:'Di luar penilaian pelanggan'};
  const facts=(rows)=>`<dl class="source-facts">${rows.filter(Boolean).map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>`;
  const absa=absaOf(r);
  const actionTag = absa.intent==='feature_request' ? 'Masukan untuk produk'
    : r.sentiment==='unclassified' ? 'Perlu tinjauan manual'
    : absa.intent==='bug_report' ? (absa.emotion==='anger' ? 'Perlu eskalasi layanan pelanggan' : 'Perlu penelusuran teknis')
    : absa.intent==='complaint' ? 'Perlu ditindaklanjuti' : '';
  dialog.innerHTML=`<div class="dialog-header"><div><h2 id="detail-heading">Rincian ulasan</h2><p>Teks asli, konteks, dan alasan penilaian sentimen</p></div><button class="icon-button" data-close="detail-dialog" aria-label="Tutup detail">${icon('close')}</button></div><div class="dialog-body">
    <div class="detail-author"><div class="review-author"><span class="review-avatar">${esc(initials(r))}</span><div><div class="review-name">${esc(authorName(r))}</div><div class="review-date"><span class="platform-label"><span style="color:${color(platform?.color)};display:flex">${icon(platform?.icon)}</span>${esc(platform?.name || r.platform)}</span> · ${esc(dateLabel(r.date,{year:'numeric'}))} · ${hasRating(r.rating)?`<span class="stars">${'★'.repeat(r.rating)}<span class="unfilled-stars">${'★'.repeat(5-r.rating)}</span></span> ${r.rating}/5`:'Penilaian N/A'}</div></div></div><div class="detail-actions">${actionTag?`<span class="action-tag">${esc(actionTag)}</span>`:''}${badge(r.sentiment)}</div></div>
    ${r.title?`<p class="detail-title">${esc(r.title)}</p>`:''}<div class="detail-text">${esc(r.text)}</div>
    <div class="review-tags">${reviewTags(r).map(t=>topicChip(t,false)).join('')}${labelChip(r)}</div>
    <div class="detail-grid">
      <section class="detail-section"><h3>${icon('pen')}Alasan &amp; aspek</h3><p>${esc(r.rationale || 'N/A')}</p>${facts([['Aspek pengalaman',absa.aspects.length?absa.aspects.map(id=>aspectNames[id]).join(', '):'Tidak menyebut aspek tertentu'],['Emosi',emotionNames[absa.emotion]],['Niat ulasan',intentNames[absa.intent]],['Label sentimen',labelMethod(r)],r.relevance?['Relevansi',`${relevanceNames[r.relevance.status] || 'N/A'} — ${r.relevance.reason}`]:null])}${r.sentiment==='unclassified'?'<p>Teks ini tidak dihitung sebagai netral dan tidak masuk dasar persentase sentimen maupun NSS.</p>':''}</section>
      <section class="detail-section"><h3>${icon('database')}Informasi sumber</h3><p>${esc(r.provenance || 'N/A')}</p>${facts([['Platform',platform?.name || r.platform],['Tanggal publikasi',dateLabel(r.date,{year:'numeric'})],['Tautan resmi',url?'Tersedia':'Tidak tersedia']])}${url?`<a class="btn btn-primary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Buka sumber asli ${icon('external')}</a>`:'<p class="detail-plain">Tautan sumber resmi tidak tersedia untuk teks ini.</p>'}</section>
    </div>
    ${r.context?`<section class="detail-section"><h3>${icon('play')}Konteks video, bukan sentimen</h3><p>${esc(r.context.title || 'N/A')}</p><p>${esc(r.context.description || 'N/A')}</p>${facts([['ID video',r.context.videoId || 'N/A']])}</section>`:''}
    <section class="detail-section"><h3>${icon('clock')}Riwayat perubahan</h3><p>${history.length?`${history.length} versi sebelumnya; hanya versi terbaru yang dihitung dalam dasbor.`:'Tidak ada riwayat. Hanya versi terbaru.'}</p>${history.length?`<details class="review-history"><summary>Lihat ${history.length} versi sebelumnya</summary><ol>${[...history].reverse().map((old,i)=>`<li><h3>Versi ${history.length-i}</h3><p>Penulis: ${esc(authorName(old))} · Tanggal ulasan: ${esc(dateLabel(old.date,{year:'numeric'}))} · Bintang: ${hasRating(old.rating)?`${old.rating}/5`:'N/A'}</p><p>Diambil pada: ${esc(timeLabel(old.observedAt))} · Terakhir tercatat: ${esc(timeLabel(old.lastSeenAt || old.observedAt))}</p>${old.title?`<p class="detail-title">${esc(old.title)}</p>`:''}<div class="detail-text">${esc(old.text || 'N/A')}</div><p>Label: ${esc(labelMethod(old))}</p></li>`).join('')}</ol></details>`:''}</section>
    <details class="detail-audit"><summary>Jejak audit (ID &amp; waktu teknis)</summary>${facts([['ID ulasan',r.id],r.parentId?['ID komentar induk',r.parentId]:null,r.publishedAt?['Waktu publikasi asli (UTC)',r.publishedAt]:null,r.updatedAt?['Waktu pembaruan asli (UTC)',r.updatedAt]:null,['Diambil pada (UTC)',timeLabel(r.retrievedAt || r.observedAt)],['Pertama tercatat',timeLabel(r.firstSeenAt || r.observedAt)],['Terakhir tercatat',timeLabel(r.lastSeenAt || r.observedAt)]])}</details>
  </div><div class="dialog-footer"><small>Isi ulasan merupakan pernyataan pengguna yang diambil apa adanya dari sumber publik.</small></div>`;
  if (!dialog.open) dialog.showModal();
}
// Dialog project. Nama project dan aplikasi yang akan dianalisis diminta di sini; identitas toko
// diambil dari dua sumber gratis (iTunes Search + pencarian Google Play) dan WAJIB dikonfirmasi
// pengguna sebelum penarikan berjalan. Sistem tidak menebak aplikasi yang mirip.
const discoveryStoreNames = { play:'Google Play', appstore:'App Store' };
const categoryLabels = { fintech:'Banking & Fintech', ecommerce:'E-Commerce', app:'Aplikasi umum' };
const discoveryStatusNames = { confirmed:'satu judul paling cocok', ambiguous:'nama mirip — centang yang benar', 'not-found':'tidak ada hasil', unreadable:'halaman terbaca, judul tidak terurai' };
function discoveryColumn(store) {
  const block = discovery.payload?.[store];
  if (!block) return '';
  const picked = discovery.picked[store];
  // Kemiripan nol berarti judulnya hanya kebetulan memuat kata yang sama (permainan, aplikasi
  // lain). Menampilkannya sebagai "nama mirip" menyesatkan, jadi tidak ditawarkan.
  const usable = (block.candidates || []).filter(candidate => !(Number(candidate.similarity) <= 0));
  const rows = usable.slice(0, 6).map(candidate => {
    const publisher = candidate.artist && candidate.artist !== 'N/A' ? candidate.artist : '';
    const rating = Number.isFinite(candidate.ratingCount)
      ? `${integer(candidate.ratingCount)} penilaian${Number.isFinite(candidate.averageRating) ? ` · ★ ${number(candidate.averageRating)}` : ''}`
      : (Number.isFinite(candidate.averageRating) ? `★ ${number(candidate.averageRating)}` : '');
    const facts = [publisher, rating].filter(Boolean).join(' · ');
    const link = safeHttps(candidate.sourceUrl);
    return `<div class="discover-item${picked === candidate.appId ? ' picked' : ''}"><label><input type="radio" name="discover-${store}" value="${esc(candidate.appId)}" ${picked === candidate.appId ? 'checked' : ''}><span><strong>${esc(candidate.title || 'judul tidak terbaca')}</strong><small>${esc(candidate.appId)}${facts ? ` · ${esc(facts)}` : ''}</small></span></label>${link ? `<a class="discover-open" href="${esc(link)}" target="_blank" rel="noopener noreferrer">Buka halaman tokonya</a>` : ''}</div>`;
  }).join('');
  // Grup radio perlu nama: tanpa ini pembaca layar membacakan "1 dari 6" dua kali tanpa
  // menyebut tokonya, padahal memilih toko yang salah adalah kesalahan termahal di alur ini.
  const labelId = `discover-label-${store}`;
  const emptyMessage = block.status === 'unreadable'
    ? `${discoveryStoreNames[store]} memuat ${integer(block.links)} tautan aplikasi, tetapi judulnya tidak terbaca dari halaman ini. Ini kegagalan pembacaan, bukan bukti aplikasinya tidak ada — tulis nama paketnya di kolom bawah bila Anda mengetahuinya.`
    : `${discoveryStoreNames[store]} tidak mengirim judul yang mirip dengan "${discovery.searched}". Periksa ejaan nama aplikasinya, atau tulis nama paketnya di kolom bawah bila Anda tahu.`;
  return `<div class="discover-col"><h4><span id="${labelId}">${esc(discoveryStoreNames[store])}</span> <span class="badge ${block.status === 'confirmed' ? 'positive' : 'neutral'}">${esc(discoveryStatusNames[block.status] || block.status)}</span></h4>${rows ? `<div class="discover-list" role="radiogroup" aria-labelledby="${labelId}">${rows}</div>` : `<p class="discover-empty">${esc(emptyMessage)}</p>`}</div>`;
}
// ID terpilih: isian manual selalu menang di atas kandidat, lalu kandidat yang dipilih,
// lalu kandidat unggul dari sumber. Tidak ada ID yang dikarang bila ketiganya kosong.
function projectTargets() {
  const manual = selector => String($(selector)?.value || '').trim();
  return {
    play: manual('#manual-play') || discovery.picked.play || discovery.payload?.play?.chosen?.appId || '',
    appstore: manual('#manual-appstore') || discovery.picked.appstore || discovery.payload?.appstore?.chosen?.appId || '',
  };
}
function updateProjectReadout() {
  const targets = projectTargets();
  const line = $('.discover-target');
  if (line) {
    line.textContent = targets.play || targets.appstore
      ? `Ulasan akan diambil dari: ${[targets.play ? `Google Play ${targets.play}` : null, targets.appstore ? `App Store ${targets.appstore}` : null].filter(Boolean).join(' · ')}`
      : 'Centang salah satu aplikasi di atas lebih dulu. Penarikan tidak dijalankan tanpa identitas.';
  }
  const create = $('[data-action="create-project"]');
  if (create) create.disabled = !(discovery.name.trim().length >= 2 && discovery.entity.trim().length >= 2 && (targets.play || targets.appstore));
}
function renderProjectDiscovery() {
  const host = $('#project-discovery');
  if (!host) return;
  const d = discovery.payload;
  const targets = projectTargets();
  host.innerHTML = discovery.busy
    ? `<p class="discover-wait">${icon('clock')} Mencari otomatis di Google Play dan App Store…</p>`
    : d
      ? `<p class="discover-note">${esc(d.note)}${d.ok === false ? '' : ` Dibaca sebagai kategori: <strong>${esc(categoryLabels[d.category] || 'umum')}</strong>.`}</p>${discovery.partial ? `<p class="discover-partial" role="status">${esc(discovery.partial)}</p>` : ''}<div class="discover-grid">${discoveryColumn('play')}${discoveryColumn('appstore')}</div>
        <details class="discover-manual"><summary>Tidak ketemu? Isi ID toko manual</summary><div class="discover-manual-fields">
          <label>Nama paket di Google Play<input id="manual-play" type="text" value="${esc(targets.play)}" placeholder="com.contoh.aplikasi" autocomplete="off"></label>
          <label>Nomor App Store<input id="manual-appstore" type="text" inputmode="numeric" value="${esc(targets.appstore)}" placeholder="1234567890" autocomplete="off"></label>
        </div><p>Pakai ini bila pencarian otomatis tidak menemukan aplikasinya — misalnya namanya berbeda di tiap toko. ID yang ditulis manual tetap ditampilkan sebelum data ditarik.</p></details>
        <p class="discover-target" role="status"></p>`
      : discovery.error ? `<p class="discover-empty" role="status">${esc(discovery.error)} Nama yang sudah diketik tetap dipakai, jadi tekan "Cari ulang" untuk mencoba lagi.</p>`
      : `<p class="discover-idle">Kandidat toko dicari otomatis begitu nama aplikasi diisi di atas. Aplikasi membaca dua sumber gratis (iTunes Search dan halaman pencarian Google Play) tanpa kunci API.</p>`;
  updateProjectReadout();
}
function openProjectDialog() {
  const dialog = $('#project-dialog');
  if (!dialog) return;
  dialog.innerHTML = `<div class="dialog-header"><div><h2 id="project-heading">Tambah project analisis</h2><p>Nama project dan aplikasi yang akan dianalisis. Ulasan diambil dari aplikasi yang Anda centang di bawah ini.</p></div><button class="icon-button" data-close="project-dialog" aria-label="Tutup tambah project">${icon('close')}</button></div>
  <div class="dialog-body"><div class="dialog-form">
    <label>Nama project<input id="project-name" type="text" value="${esc(discovery.name)}" placeholder="Misalnya aplikasi kasir terbaru" autocomplete="off" maxlength="80"></label>
    <label>Aplikasi yang akan dianalisis<input id="project-entity" type="text" value="${esc(discovery.entity)}" placeholder="Nama aplikasi persis seperti di toko" autocomplete="off" maxlength="80"><small>Nama ini yang dicari otomatis di Google Play dan App Store; kandidat muncul di bawah tanpa perlu menekan tombol.</small></label>
    <button class="btn" type="button" data-action="discover-project">${icon('search')}${discovery.busy ? 'Memeriksa…' : 'Cari ulang'}</button>
    <p class="filter-error" id="project-error" role="alert">${esc(discovery.error)}</p>
    <div id="project-discovery" class="project-discovery"></div>
  </div></div>
  <div class="dialog-footer"><div><small>Menyimpan project belum mengambil data. Penarikan berjalan saat Anda menekan Tarik Analisis di menu Platform.</small></div><div class="dialog-actions"><button class="btn" data-close="project-dialog">Batal</button><button class="btn btn-primary" data-action="create-project">${icon('check')}Simpan</button></div></div>`;
  renderProjectDiscovery();
  if (!dialog.open) dialog.showModal();
  $('#project-name')?.focus({ preventScroll: true });
  // Nama aplikasi yang sudah terisi langsung dicari; pengguna tidak perlu menekan tombol cari.
  if (!discovery.payload && !discovery.busy) scheduleDiscovery();
}
// Pemeriksaan identitas dijalankan otomatis setelah nama aplikasi berhenti diketik, dan hanya
// untuk nama yang belum pernah dibaca. Hasilnya tetap harus dikonfirmasi: dua judul yang sama
// mirip tidak boleh dipilihkan diam-diam oleh aplikasi ini.
let discoverTimer;
function scheduleDiscovery() {
  clearTimeout(discoverTimer);
  const entity = String($('#project-entity')?.value || discovery.entity).trim();
  if (entity.length < 2 || discovery.busy || entity === discovery.searched) return;
  discoverTimer = setTimeout(() => void discoverIdentity(), 700);
}
// Mengirim permintaan project lalu memakai respons yang sama seperti data dasbor lainnya.
async function requestProject(body) {
  const response = await fetch('/api/project', { method: 'POST', cache: 'no-store', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let payload;
  try { payload = await response.json(); }
  catch { throw new Error(`Balasan sistem tidak dapat dibaca (kode HTTP ${response.status}).`); }
  if (!response.ok) throw new Error(String(typeof payload?.error === 'string' ? payload.error : `Permintaan project gagal (kode HTTP ${response.status}).`).replace(/^[a-z_]+: /, ''));
  if (!payload || !Array.isArray(payload.reviews) || !Array.isArray(payload.sources)) throw new Error('Balasan project tidak memuat dataset yang dapat dipakai.');
  return payload;
}
async function discoverIdentity() {
  if (discovery.busy) return;
  const entity = String($('#project-entity')?.value || discovery.entity).trim();
  discovery.entity = entity; discovery.name = String($('#project-name')?.value || discovery.name);
  const errorHost = $('#project-error');
  if (errorHost) errorHost.textContent = '';
  if (entity.length < 2) { discovery.error = 'Isi nama aplikasi terlebih dahulu (minimal dua karakter).'; if (errorHost) errorHost.textContent = discovery.error; return; }
  discovery.busy = true; discovery.payload = null; discovery.error = ''; discovery.picked = { play: '', appstore: '' }; discovery.searched = entity; discovery.partial = '';
  renderProjectDiscovery();
  try {
    const response = await fetch(`/api/discover?entity=${encodeURIComponent(entity)}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || `Pemeriksaan identitas gagal (kode HTTP ${response.status}).`);
    discovery.payload = payload?.discovery || null;
    // Keterangan "sebagian sumber tidak menjawab" berasal dari server dan harus tetap terlihat:
    // daftar kandidat yang pendek bisa berarti pencariannya gagal, bukan aplikasinya tidak ada.
    discovery.partial = String(payload?.partial || '');
    discovery.picked = { play: discovery.payload?.play?.chosen?.appId || '', appstore: discovery.payload?.appstore?.chosen?.appId || '' };
  } catch (error) {
    discovery.error = error instanceof Error ? error.message : 'Kesalahan tidak dikenal.';
    if (errorHost) errorHost.textContent = discovery.error;
  } finally {
    discovery.busy = false;
    renderProjectDiscovery();
    const button = $('[data-action="discover-project"]');
    if (button) button.innerHTML = `${icon('search')}Cari ulang`;
    // Nama yang diketik saat pemeriksaan sebelumnya masih berjalan tidak boleh hilang begitu saja.
    if (String($('#project-entity')?.value || '').trim() !== discovery.searched) scheduleDiscovery();
  }
}
async function createProjectFromDialog() {
  const targets = projectTargets();
  const body = {
    action: 'create',
    name: discovery.name.trim(),
    entity: discovery.entity.trim(),
    playAppId: targets.play,
    appleAppId: targets.appstore,
  };
  const errorHost = $('#project-error');
  if (errorHost) errorHost.textContent = '';
  if (!body.playAppId && !body.appleAppId) {
    discovery.error = 'Pilih satu kandidat atau isi minimal satu ID toko.';
    if (errorHost) errorHost.textContent = discovery.error;
    return;
  }
  const button = $('[data-action="create-project"]');
  if (button) button.disabled = true;
  try {
    applyPayload(await requestProject(body));
    $('#project-dialog')?.close();
    clearReviewFilters();
    render();
    resetContentScroll();
    discovery.name = ''; discovery.entity = ''; discovery.payload = null; discovery.picked = { play: '', appstore: '' }; discovery.searched = ''; discovery.error = '';
    // Menyimpan project sengaja TIDAK langsung menarik data: penarikan memakai kanal yang dapat
    // memakan kuota, jadi hanya tombol Tarik Analisis yang boleh menjalankannya.
    notify(`Project "${body.name}" disimpan dan menjadi project aktif. Tekan Tarik Analisis di menu Platform untuk mengambil datanya.`);
  } catch (error) {
    discovery.error = error instanceof Error ? error.message : 'Project tidak dapat disimpan.';
    if (errorHost) errorHost.textContent = discovery.error;
    if (button) button.disabled = false;
  }
}
function download(content,name,type) {  const url=URL.createObjectURL(new Blob([content],{type})), a=document.createElement('a');
  a.href=url; a.download=name; document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function requestData(url, method='GET') {
  const response=await fetch(url,{method,cache:'no-store',headers:{Accept:'application/json'}});
  let payload;
  try { payload=await response.json(); }
  catch { throw new Error(`Format data dari sistem tidak sesuai (kode HTTP ${response.status}).`); }
  if (!response.ok) {
    const message=typeof payload?.error==='string'?payload.error:typeof payload?.message==='string'?payload.message:typeof payload?.error?.message==='string'?payload.error.message:`Permintaan data gagal (kode HTTP ${response.status}).`;
    throw new Error(message);
  }
  if (!payload || !Array.isArray(payload.reviews) || !Array.isArray(payload.sources) || !Array.isArray(payload.runs) || typeof payload.running!=='boolean' || !(payload.lastRun===null || (payload.lastRun && typeof payload.lastRun==='object'))) {
    throw new Error('Struktur data yang diterima tidak sesuai. Data yang sedang ditampilkan tetap dipertahankan.');
  }
  return payload;
}
function applyPayload(payload) {
  reviews=payload.reviews;
  sync.sources=payload.sources; sync.lastRun=payload.lastRun; sync.runs=payload.runs; sync.running=payload.running; sync.loaded=true;
  if (Array.isArray(payload.projects)) projects.list=payload.projects;
  if (typeof payload.activeProject==='string') projects.active=payload.activeProject;
  projects.target = payload.target && typeof payload.target === 'object' ? payload.target : null;
  if (!payload.running) sync.attempt=null;
  sync.storageWarning = typeof payload.storageWarning === 'string' ? payload.storageWarning : null;
  // Peringatan gagal tulis ditampilkan sebagai spanduk tetap di bawah judul (heading()), bukan
  // lewat toast: notifikasi sukses yang menyusul akan menimpa satu-satunya wilayah toast.
}
async function switchProject(id) {
  if (!id || id === projects.active) return;
  if (isBusy()) { notify('Tunggu penarikan selesai sebelum memindahkan project.'); return; }
  sync.loading = true;
  render();
  try { applyPayload(await requestProject({ action: 'activate', project: id })); }
  catch (error) { notify(`Project tidak dapat dibuka. ${error instanceof Error ? error.message : 'Kesalahan tidak dikenal.'}`, 'error'); }
  clearReviewFilters();
  sync.loading = false;
  render();
  resetContentScroll();
}
// Penghapusan project adalah satu-satunya jalur yang membuang baris ulasan, jadi ia meminta
// konfirmasi eksplisit dan hanya berlaku pada project yang sedang aktif.
function openDeleteDialog() {
  const active = projects.list.find(project => project.id === projects.active) || null;
  if (!active) return;
  if (isBusy()) { notify('Tunggu penarikan selesai sebelum menghapus project.'); return; }
  const dialog = $('#delete-dialog');
  if (!dialog) return;
  const lost = `${integer(reviews.length)} teks ulasan dan ${integer(sync.runs.length)} catatan penarikan` +
    (active.lastPulledAt ? ` (penarikan terakhir ${timeLabel(active.lastPulledAt)})` : ' (belum pernah ditarik)');
  dialog.innerHTML = `<div class="dialog-header"><div><h2 id="delete-heading">Hapus project</h2><p>Project aktif akan dihapus berikut seluruh datanya.</p></div><button class="icon-button" data-close="delete-dialog" aria-label="Tutup hapus project">${icon('close')}</button></div>
  <div class="dialog-body"><p class="delete-target"><strong>${esc(active.name)}</strong><br>${esc(active.entity)} · ${esc(active.stores)}</p>
  <p>Yang hilang: ${lost}. Penghapusan ini tidak dapat dibatalkan dari dasbor; unduh laporan terlebih dahulu bila datanya masih diperlukan. Project lain dan datanya tidak terpengaruh.</p></div>
  <div class="dialog-footer"><div><small>${projects.list.length > 1 ? 'Project lain tetap tersedia setelah penghapusan.' : 'Ini project terakhir, jadi dasbor kembali kosong setelahnya.'}</small></div><div class="dialog-actions"><button class="btn" data-close="delete-dialog">Batal</button><button class="btn btn-danger" data-action="confirm-delete-project">${icon('trash')}Hapus project</button></div></div>`;
  if (!dialog.open) dialog.showModal();
}
// Dialog yang menutup dirinya sendiri tepat setelah render kehilangan tombol pemicunya: bilah
// project dibuat ulang, jadi fokus bawaan <dialog> jatuh ke elemen yang sudah tercabut dan
// pengguna pembaca layar harus Tab dari awal. Fokus dikembalikan ke kontrol yang masih ada.
function focusProjectControl(action) {
  $(`.project-bar [data-action="${action}"]`)?.focus({ preventScroll: true });
}
async function deleteActiveProject(button) {
  const active = projects.list.find(project => project.id === projects.active) || null;
  if (!active) return;
  if (button) button.disabled = true;
  try {
    applyPayload(await requestProject({ action: 'delete', project: active.id }));
    $('#delete-dialog')?.close();
    $('#manage-dialog')?.close();
    clearReviewFilters();
    render();
    resetContentScroll();
    focusProjectControl('add-project');
    notify(projects.list.length ? `Project "${active.name}" dihapus beserta datanya. Project aktif sekarang: ${projectName()}.` : `Project "${active.name}" dihapus beserta datanya. Dasbor kembali kosong — buat project baru kapan saja.`);
  } catch (error) {
    if (button) button.disabled = false;
    notify(`Project tidak dapat dihapus. ${error instanceof Error ? error.message : 'Kesalahan tidak dikenal.'}`, 'error');
  }
}

// Dialog kelola project: satu tempat untuk mengganti nama project dan untuk menghapusnya.
// Identitas toko ditampilkan read-only karena itulah penarikan data diarahkan; menggantinya
// berarti menganalisis aplikasi yang berbeda, jadi dibuat project baru.
function openManageDialog() {
  const active = projects.list.find(project => project.id === projects.active) || null;
  if (!active) { notify('Belum ada project untuk dikelola.'); return; }
  if (isBusy()) { notify('Tunggu penarikan selesai sebelum mengubah project.'); return; }
  const dialog = $('#manage-dialog');
  if (!dialog) return;
  const lastPull = active.lastPulledAt ? timeLabel(active.lastPulledAt) : 'belum pernah ditarik';
  dialog.innerHTML = `<div class="dialog-header"><div><h2 id="manage-heading">Kelola project</h2><p>Ganti nama project atau hapus beserta datanya.</p></div><button class="icon-button" data-close="manage-dialog" aria-label="Tutup kelola project">${icon('close')}</button></div>
  <div class="dialog-body"><div class="dialog-form">
    <label>Nama project<input id="manage-name" type="text" value="${esc(active.name)}" maxlength="80" autocomplete="off"></label>
    <p class="manage-facts"><span>Aplikasi dianalisis</span><strong>${esc(active.entity)}</strong></p>
    <p class="manage-facts"><span>Aplikasi sumber</span><strong>${esc(active.stores)}</strong></p>
    <p class="manage-facts"><span>Data tersimpan</span><strong>${integer(reviews.length)} teks · penarikan ${esc(lastPull)}</strong></p>
    <p class="note-inline">Aplikasi sumber tidak diganti di sini. Kalau salah pilih aplikasi, hapus project ini lalu buat project baru agar datanya tetap terpisah.</p>
    <div class="manage-danger">
      <div><h3>Hapus project</h3><p>Penghapusan membuang seluruh teks ulasan dan riwayat penarikan project ini. Unduh laporan terlebih dahulu bila datanya masih diperlukan. Project lain tidak terpengaruh.</p></div>
      <button class="btn btn-danger" data-action="delete-project">${icon('trash')}Hapus project</button>
    </div>
    <p class="filter-error" id="manage-error" role="alert"></p>
  </div></div>
  <div class="dialog-footer"><div><small>Nama baru langsung dipakai di seluruh judul dan menu.</small></div><div class="dialog-actions"><button class="btn" data-close="manage-dialog">Batal</button><button class="btn btn-primary" data-action="rename-project">${icon('check')}Simpan nama</button></div></div>`;
  if (!dialog.open) dialog.showModal();
  $('#manage-name')?.focus({ preventScroll: true });
}
async function renameProjectFromDialog(button) {
  const active = projects.list.find(project => project.id === projects.active) || null;
  if (!active) return;
  const name = String($('#manage-name')?.value || '').trim();
  const errorHost = $('#manage-error');
  if (errorHost) errorHost.textContent = '';
  if (name.length < 2) { if (errorHost) errorHost.textContent = 'Nama project minimal dua karakter.'; return; }
  if (name === active.name) { $('#manage-dialog')?.close(); return; }
  if (button) button.disabled = true;
  try {
    applyPayload(await requestProject({ action: 'rename', project: active.id, name }));
    $('#manage-dialog')?.close();
    render();
    focusProjectControl('manage-project');
    notify(`Nama project diubah menjadi "${name}".`);
  } catch (error) {
    if (button) button.disabled = false;
    if (errorHost) errorHost.textContent = error instanceof Error ? error.message : 'Project tidak dapat diubah.';
    notify(`Project tidak dapat diubah. ${error instanceof Error ? error.message : 'Kesalahan tidak dikenal.'}`, 'error');
  }
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  if (sync.running) refreshTimer=setTimeout(()=>loadData(),2000);
}
async function loadData() {
  if (sync.requesting) return;
  sync.requesting=true;
  try { applyPayload(await requestData('/api/data')); }
  catch (error) {
    notify(`${sync.loaded?'Status data tidak dapat diperbarui.':'Data tersimpan gagal dimuat; angka pada layar tidak diganti.'} ${error instanceof Error?error.message:'Kesalahan tidak dikenal.'}`,'error');
    sync.running=false;
    if (sync.attempt?.status==='running') sync.attempt={...sync.attempt,status:'error',finishedAt:new Date().toISOString()};
  } finally {
    sync.loading=false; sync.requesting=false; render(); scheduleRefresh();
  }
}
const pullStatusNames = { menunggu:'Menunggu giliran', diproses:'Sedang diambil…', selesai:'Selesai diperiksa', sebagian:'Selesai sebagian', gagal:'Gagal', 'belum dikonfigurasi':'Perlu konfigurasi API', 'belum diuji':'Akses belum diuji', 'tidak diambil':'Tidak diambil', 'data tersimpan':'Data tersimpan' };
const pullFinalStates = new Set(['selesai','sebagian','gagal','belum dikonfigurasi','belum diuji','tidak diambil','data tersimpan']);
const pullStateFor = source => ({ success:'selesai', partial:'sebagian', error:'gagal', needs_setup:'belum dikonfigurasi', ready:'belum diuji', unsupported:'tidak diambil', snapshot:'data tersimpan' })[source?.status] || 'gagal';
// Baris metadata diisi dari cakupan yang benar-benar dilaporkan sumber, bukan teks tetap,
// sehingga angka bahasa/actor/batas hasil pada modal dapat ditelusuri ke hasil pengambilan.
function pullMeta(source) {
  const c = source?.coverage || source?.scope || {};
  const rows = [];
  if (source?.id === 'play') {
    if (Array.isArray(c.pools)) rows.push(['Analisis bahasa', c.pools.map(p => `${String(p.hl).toUpperCase()} ${integer(p.added)}`).join(' · ')]);
    rows.push(['Sumber', 'Halaman publik Google Play']);
  }
  if (source?.id === 'appstore') {
    rows.push(['Sumber', 'Halaman resmi + feed resmi']);
    if (Number.isInteger(c.sharedReviews)) rows.push(['Dikonfirmasi dua jalur', `${integer(c.sharedReviews)} ulasan`]);
  }
  if (Number.isInteger(c.itemsRead)) {
    if (c.actor) rows.push(['Sumber', 'Hasil kueri publik via Apify']);
    rows.push(['Item dataset', `${integer(c.itemsRead)}${Number.isInteger(c.commentItemsRead) && c.commentItemsRead ? ` + ${integer(c.commentItemsRead)} komentar` : ''}`]);
    if (Number.isInteger(c.identityFiltered)) rows.push(['Di luar identitas produk', integer(c.identityFiltered)]);
    rows.push(['Batas hasil actor', Number.isInteger(c.sampleLimit) ? `${c.sampleLimitField || 'input'}=${c.sampleLimit}${c.possiblyTruncated ? ' (terpotong)' : ''}` : 'tanpa batas']);
  }
  if (Number.isInteger(c.relevantVideos)) rows.push(['Video relevan', `${integer(c.relevantVideos)} dari ${integer(c.pagesRead)} panggilan API`]);
  if (Number.isInteger(c.placesFound)) rows.push(['Tempat ditemukan', `${integer(c.placesFound)} · ${integer(c.productMatches)} bernama produk`]);
  const storeTotal = numericCount(source?.ratingHistogramTotal);
  if (storeTotal !== null && Number.isInteger(source?.fetched)) rows.push(['Penilaian halaman toko', `${integer(storeTotal)} · ${integer(Math.max(0, storeTotal - source.fetched))} tanpa teks`]);
  return rows.slice(0, 4);
}
function pullQueue() {
  // Hanya kanal yang memiliki konektor yang dikirim ke server. Kanal tanpa konektor tidak
  // pernah diminta, sehingga tidak pernah muncul sebagai "nol" yang keliru.
  return platforms.filter(p => sourceFor(p).status !== 'unsupported')
    .map(p => ({ id: p.id, name: p.name, status: 'menunggu', fetched: null, message: '', meta: pullMeta(sourceFor(p)) }));
}
function renderPullDialog() {
  const dialog = $('#pull-dialog');
  if (!dialog || !sync.pull) return;
  const { queue, finished } = sync.pull;
  const checked = queue.filter(row => pullFinalStates.has(row.status)).length;
  const percent = Math.round(pct(checked, queue.length));
  const chip = row => `<span class="pull-chip is-${row.status}">${esc(pullStatusNames[row.status])}</span>`;
  const count = row => Number.isInteger(row.fetched) ? `${integer(row.fetched)} teks` : '—';
  const meta = row => row.meta?.length ? `<div class="pull-meta"><h4>Detail metadata</h4><dl>${row.meta.map(([key, value]) => `<div><dt>${esc(key)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl></div>` : '';
  const card = row => pullFinalStates.has(row.status)
    ? `<div class="pull-main"><div class="pull-head"><strong>${esc(row.name)}</strong>${chip(row)}</div>${row.message ? `<p class="pull-msg">${esc(shortMessage(row.message))}</p>` : ''}<div class="pull-foot"><span>Ulasan publik: <strong>${count(row)}</strong></span>${chip(row)}</div></div>${meta(row)}`
    : `<div class="pull-main"><div class="pull-head"><strong>${esc(row.name)}</strong></div><div class="pull-foot"><span>Ulasan/Teks: <strong>—</strong></span><span class="pull-state">${esc(pullStatusNames[row.status])}</span></div></div>`;
  // Kerangka dialog dibuat sekali per penarikan dan hanya isinya yang diperbarui. Membangun
  // ulang seluruh isi pada setiap tahap menghancurkan wilayah hidup di dalamnya, sehingga
  // pembaca layar tidak pernah mengumumkan kemajuan sama sekali.
  if (!dialog.querySelector('.pull-list')) {
    dialog.innerHTML = `<div class="dialog-header"><div><h2 id="pull-heading">Mengambil dan menganalisis</h2><p>Project aktif: <strong>${esc(projects.list.find(project => project.id === projects.active)?.name || 'belum ada project')}</strong>. Kanal diambil satu per satu mengikuti identitas toko project ini. Status di bawah adalah hasil nyata dari kanal tersebut, bukan perkiraan.</p></div><button class="icon-button" data-close="pull-dialog" aria-label="Tutup progres">${icon('close')}</button></div><div class="dialog-body"><div class="pull-progress"><span>Platform</span><strong id="pull-count"></strong></div><div class="pull-meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-label="Kemajuan pemeriksaan kanal"><span></span></div><ol class="pull-list" id="pull-list"></ol><p id="pull-live" class="sr-only" role="status" aria-live="polite"></p></div><div class="dialog-footer"><small>Kanal yang menjawab tanpa hasil berarti terhubung tetapi tidak mengirim konten; itu bukan nol keluhan.</small></div>`;
    if (!dialog.open) dialog.showModal();
  }
  const summary = `${checked} dari ${queue.length} kanal diperiksa · ${percent}%${finished ? '; riwayat diperbarui' : ''}`;
  const meter = dialog.querySelector('.pull-meter');
  meter.setAttribute('aria-valuenow', String(percent));
  meter.setAttribute('aria-valuetext', `${checked} dari ${queue.length} kanal diperiksa`);
  meter.querySelector('span').style.width = `${percent}%`;
  dialog.querySelector('#pull-count').textContent = summary;
  dialog.querySelector('#pull-list').innerHTML = queue.map(row => `<li class="pull-row is-${row.status}"><span class="pull-dot" aria-hidden="true"></span>${card(row)}</li>`).join('');
  const last = [...queue].reverse().find(row => pullFinalStates.has(row.status));
  dialog.querySelector('#pull-live').textContent = `${checked} dari ${queue.length} kanal diperiksa${last ? `; terakhir ${last.name}: ${pullStatusNames[last.status]}` : ''}.`;
}
// Pesan singkat tetap memuat keterangan pemotongan: kalimat pertama saja akan membuat hasil
// terpotong terbaca seperti pengambilan yang lengkap.
const truncationMark = /\b(?:belum lengkap|terpotong|terbatas|time_budget|page_limit|run_limit|dibatasi)\b/i;
// Di dalam modal progres pengguna tidak perlu nama actor atau ID run. Jejak teknis lengkap
// tetap ada pada menu Platform.
const technicalToken = [
  [/\b(?:apify\s+)?actor\s+(?:[a-z0-9_.-]+\/)?[a-z0-9_.-]+\b/gi, 'actor'],
  [/\brun\s+[A-Za-z0-9_-]{8,}\b/gi, 'proses'],
  [/\bdataset\s+[A-Za-z0-9_-]{8,}\b/gi, 'dataset'],
];
const plainMessage = message => technicalToken.reduce((text,[rule, replacement]) => text.replace(rule, replacement), String(message || ''));
function shortMessage(message) {
  const text = plainMessage(message).trim();
  if (!text) return '';
  const sentences = text.split(/(?<=[.!?])\s/).filter(Boolean);
  const clip = (value, limit) => value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
  const lead = clip(sentences[0] || text, 150);
  const caveat = sentences.slice(1).find(sentence => truncationMark.test(sentence));
  return caveat ? `${lead} ${clip(caveat, 130)}` : lead;
}
async function analyze() {
  if (isBusy() || sync.requesting) return;
  clearTimeout(refreshTimer);
  // Project dikunci pada awal penarikan: seluruh permintaan batch menyebut project yang sama
  // supaya pemindahan project di tengah jalan tidak dapat menulis ke dataset lain.
  const project = projects.active ? `project=${encodeURIComponent(projects.active)}&` : '';
  sync.busy=true; sync.requesting=true;
  sync.attempt={startedAt:new Date().toISOString(),finishedAt:null,status:'running'};
  const queue = pullQueue();
  sync.pull = { queue, finished:false };
  // Kerangka lama dibuang agar penarikan berikutnya membangun ulang kepala dialog: nama project
  // aktif di dalamnya harus mengikuti penarikan yang sedang berjalan.
  const pullDialog = $('#pull-dialog');
  if (pullDialog) pullDialog.innerHTML = '';
  render(); renderPullDialog();
  let stopped = false;
  if (!queue.length) {
    // Status sumber tidak dapat dibaca (misalnya server sedang turun). Jalankan satu
    // permintaan gabungan seperti biasa agar pengguna tetap mendapat hasil atau pesan galat.
    try { applyPayload(await requestData(`/api/analyze?${project}`,'POST')); }
    catch (error) { stopped = true; notify(`Pengambilan gagal. ${error instanceof Error?error.message:'Kesalahan tidak dikenal.'} Ulasan yang sudah tersimpan tetap ditampilkan.`); }
  }
  for (const row of queue) {
    row.status='diproses'; renderPullDialog();
    try {
      applyPayload(await requestData(`/api/analyze?${project}platform=${encodeURIComponent(row.id)}`,'POST'));
      const source = sync.sources.find(s => s.id === row.id);
      row.meta = pullMeta(source);
      row.status = pullStateFor(source);
      row.fetched = Number.isInteger(source?.fetched) ? source.fetched : null;
      row.message = source?.message || '';
    } catch (error) {
      row.status='gagal';
      row.message = error instanceof Error ? error.message : 'Kesalahan tidak dikenal.';
      // Kesalahan jaringan berarti server tidak terjangkau: melanjutkan hanya mengulang galat.
      if (error instanceof TypeError) { stopped = true; break; }
    }
    renderPullDialog();
  }
  for (const row of queue) if (row.status === 'diproses') row.status = 'menunggu';
  // Riwayat penarikan dicatat pada panggilan penutup terpisah, sehingga kegagalan satu
  // kanal (termasuk kanal terakhir) tidak meninggalkan penarikan tanpa catatan.
  if (queue.length && !stopped) {
    try { applyPayload(await requestData(`/api/analyze?${project}finish=1`,'POST')); }
    catch (error) { notify(`Riwayat penarikan tidak dapat dicatat. ${error instanceof Error?error.message:'Kesalahan tidak dikenal.'}`); }
  }
  sync.pull.finished = true;
  renderPullDialog();
  // Modal ditutup sendiri setelah hasil terbaca, agar dasbor tidak terkunci oleh progresnya.
  setTimeout(() => { const dialog = $('#pull-dialog'); if (dialog?.open && sync.pull?.finished) { dialog.close(); sync.pull = null; } }, 2500);
  const run = sync.lastRun;
  if (stopped) notify('Penarikan dihentikan karena server tidak dapat dihubungi. Hasil kanal yang sudah selesai tetap tersimpan.');
  else if (!run) notify('Pengambilan selesai. Periksa status sumber pada bagian Platform.');
  else if (run.status === 'error') notify('Tarik Analisis gagal. Ulasan yang tersimpan tetap ditampilkan; periksa status sumber.');
  else notify(`Tarik Analisis ${run.status==='partial'?'selesai sebagian':'berhasil'} · ${integer(numericCount(run.added) ?? 0)} ulasan baru · ${integer(numericCount(run.updated) ?? 0)} diperbarui · ${integer(numericCount(run.unchanged) ?? 0)} tidak berubah. ${run.coverage?.fetchedSources.length ?? 0} dari ${platforms.length} sumber berhasil dibaca; lihat Platform untuk kanal yang belum tersedia.`);
  sync.busy=false; sync.requesting=false; render(); scheduleRefresh();
}
document.addEventListener('click',event=>{
  const button=event.target.closest('button,a');
  if (!button || button.disabled) return;
  if (button.dataset.view) { navigate(button.dataset.view); return; }
  if (button.dataset.platform) { state.platform=button.dataset.platform; state.page=1; render(); return; }
  if (button.dataset.openPlatform) { clearReviewFilters(); state.platform=button.dataset.openPlatform; navigate('reviews'); return; }
  if (button.dataset.anomalyDay) {
    // Jendela anomali bisa berupa satu jam; filter dasbor berversi harian, jadi tanggalnya
    // yang dibuka dan tekanannya dinyatakan pada spanduk, bukan disembunyikan.
    clearReviewFilters();
    const day = button.dataset.anomalyDay;
    state.period='custom'; state.from=day; state.to=day; state.sentiment='negative';
    navigate('reviews');
    notify(`Filter dibuka pada seluruh ulasan negatif ${dateLabel(day, { year:'numeric' })}; jendela lonjakannya lebih sempit dari satu hari.`);
    return;
  }
  if (button.dataset.review) { openReview(button.dataset.review); return; }
  // Semua tombol tutup dialog memakai satu jalur: dialog yang baru ditambah tidak boleh
  // kehilangan Batal dan X-nya hanya karena penanganannya ditulis per-nama.
  if (button.dataset.close) {
    const target = document.getElementById(button.dataset.close);
    target?.close();
    if (button.dataset.close === 'pull-dialog') sync.pull = null;
    return;
  }
  if (button.dataset.complaint) {
    const group=complaintStats(analyticalReviews()).find(g=>g.id===button.dataset.complaint);
    if (!group) return;
    clearReviewFilters(); state.complaint=group.id; state.sentiment='negative'; navigate('reviews',true); return;
  }
  if (button.dataset.cluster) {
    if (!painClusters.some(c => c.id===button.dataset.cluster)) return;
    clearReviewFilters(); state.cluster=button.dataset.cluster; state.sentiment='negative'; navigate('reviews',true); return;
  }
  if (button.dataset.aspect !== undefined) { state.aspect = button.dataset.aspect; state.page = 1; render(); return; }
  if (button.dataset.complaintSpike) {
    const day = button.dataset.complaintSpike;
    if (!validDay(day)) return;
    clearReviewFilters(); state.period='custom'; state.from=day; state.to=day;
    render();
    notify(`Grafik dan tabel dibatasi pada ${dateLabel(day, { year:'numeric' })}; penanda lonjakan hanya menyebut jumlah harian, penyebabnya belum terverifikasi.`);
    return;
  }
  if (button.dataset.sentiment) { clearComplaint(); state.sentiment=button.dataset.sentiment; state.page=1; render(); return; }
  if (button.dataset.tag) { clearReviewFilters(); state.tag=button.dataset.tag; navigate('reviews'); return; }
  if (button.dataset.feature!==undefined) {
    const group=featureGroups[Number(button.dataset.feature)];
    if (!group) return;
    clearReviewFilters(); state.group=group.tags; state.groupName=group.name; navigate('reviews'); return;
  }
  if (button.dataset.driver) {
    const sentiment=button.dataset.driverSentiment, group=(sentiment==='positive'?positiveGroups:painGroups).find(g=>g.name===button.dataset.driver);
    if (!group) return;
    clearReviewFilters(); state.group=group.tags; state.groupName=group.name; state.sentiment=sentiment; navigate('reviews'); return;
  }
  if (button.dataset.sort) { toggleSort(button.dataset.sort); render(); return; }
  if (button.dataset.page) { state.page+=button.dataset.page==='next'?1:-1; render(); return; }
  const action=button.dataset.action;
  if (action==='analyze') { void analyze(); return; }
  if (action==='add-project') { openProjectDialog(); return; }
  if (action==='manage-project') { openManageDialog(); return; }
  if (action==='rename-project') { void renameProjectFromDialog(button); return; }
  if (action==='discover-project') { button.innerHTML=`${icon('clock')}Memeriksa…`; void discoverIdentity(); return; }
  if (action==='create-project') { void createProjectFromDialog(); return; }
  if (action==='delete-project') { openDeleteDialog(); return; }
  if (action==='confirm-delete-project') { void deleteActiveProject(button); return; }
  if (action==='clear-complaint') { clearComplaint(); state.page=1; render(); }
  if (action==='clear-aspect') { state.aspect=''; state.page=1; render(); }
  if (action==='clear-content') { state.sentiment='all'; state.query=''; state.tag=''; state.page=1; render(); }
  if (action==='clear-group') { state.group=null; state.groupName=''; state.page=1; render(); }
  if (action==='export') {
    const data=visibleReviews();
    if (!data.length) { notify('Tidak ada ulasan untuk diekspor dalam filter ini.'); return; }
    download(exportCsv(data),`${projectSlug()}-sentiment-${state.platform}-${new Date().toISOString().slice(0,10)}.csv`,'text/csv;charset=utf-8');
    notify(`${data.length} ulasan diekspor sesuai filter aktif.`);
  }
  if (action==='print-incident') { openIncidentReport('pdf'); return; }
  if (action==='export-incident') { openIncidentReport('csv'); return; }
  if (action==='apply-dates') {
    const from=$('#date-from').value, to=$('#date-to').value;
    if ((from&&!validDay(from)) || (to&&!validDay(to)) || (from&&to&&from>to)) { $('#date-error').textContent='Gunakan tanggal valid; tanggal awal harus sebelum atau sama dengan tanggal akhir.'; return; }
    state.from=from; state.to=to; state.page=1; render();
  }
});
document.addEventListener('change',event=>{
  if (event.target.id==='period') {
    state.period=event.target.value; state.page=1;
    if (state.period==='all') { state.from=''; state.to=''; }
    else if (state.period!=='custom') {
      state.from=state.period+'-01';
      const date=new Date(`${state.from}T00:00:00Z`);
      date.setUTCMonth(date.getUTCMonth()+1); date.setUTCDate(0); state.to=date.toISOString().slice(0,10);
    }
    render();
  }
  if (event.target.id==='tag-filter') { clearComplaint(); state.tag=event.target.value; state.page=1; render(); }
  if (event.target.id==='page-size') { state.size=event.target.value==='all'?'all':Number(event.target.value)||10; state.page=1; render(); }
  if (event.target.matches('select.project-select')) { void switchProject(event.target.value); return; }
  if (event.target.name==='discover-play'||event.target.name==='discover-appstore') {
    const store = event.target.name==='discover-play'?'play':'appstore';
    discovery.picked[store]=event.target.value;
    document.querySelectorAll(`input[name="${event.target.name}"]`).forEach(input=>input.closest('.discover-item')?.classList.toggle('picked',input.checked));
    updateProjectReadout();
  }
});
let searchTimer;
document.addEventListener('input',event=>{
  if (event.target.id==='project-name') { discovery.name=event.target.value; updateProjectReadout(); }
  if (event.target.id==='project-entity') {
    discovery.entity=event.target.value;
    // Kandidat milik nama sebelumnya tidak boleh tetap terpilih: identitasnya berbeda.
    if (discovery.payload && discovery.entity.trim() !== discovery.searched) {
      discovery.payload = null; discovery.picked = { play:'', appstore:'' };
      renderProjectDiscovery();
    } else updateProjectReadout();
    scheduleDiscovery();
  }
  if (event.target.id==='manual-play'||event.target.id==='manual-appstore') { updateProjectReadout(); }
  if (event.target.id==='review-search') {
    clearComplaint(); state.query=event.target.value; state.page=1; clearTimeout(searchTimer);
    searchTimer=setTimeout(()=>{
      // Kata kunci berlaku di semua menu, jadi tampilan selalu diperbarui.
      const active=document.activeElement?.id==='review-search', cursor=event.target.selectionStart;
      render();
      if (active) { const input=$('#review-search'); input.focus(); try { input.setSelectionRange(cursor,cursor); } catch {} }
    },180);
  }
});
window.addEventListener('afterprint', restoreReportChrome);
for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('click',event=>{
  if (event.target===dialog) {
    const rect=dialog.getBoundingClientRect();
    if (event.clientX<rect.left || event.clientX>rect.right || event.clientY<rect.top || event.clientY>rect.bottom) dialog.close();
  }
});
document.addEventListener('scroll',event=>{
  if (event.target.id==='platform-tabs') updatePlatformScroll();
},true);
window.addEventListener('resize',()=>updatePlatformScroll());
render({animate:true});
void loadData();
