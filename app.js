import { seedReviews, platforms, tags, tagColors, observationDate } from './data.js';
import { summary, filterReviews, timeline, timelineMode, groupStats, featureGroups, painGroups, positiveGroups, sentimentNames, complaintStats, complaintBreakdown, ratingSummary, projection, projectionTrends, projectionSignals, exportCsv } from './model.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const number = value => new Intl.NumberFormat('id-ID', { maximumFractionDigits:1, minimumFractionDigits:1 }).format(value);
const decimal = value => new Intl.NumberFormat('id-ID', { maximumFractionDigits:2, minimumFractionDigits:2 }).format(value);
const integer = value => new Intl.NumberFormat('id-ID').format(value);
const pct = (part, total) => total ? part / total * 100 : 0;
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
const colors = { positive:'#0ab39c', negative:'#f06548', neutral:'#878a99', unclassified:'#299cdb' };
const sentimentKeys = Object.keys(colors);
const sourceStatusNames = { success:'Pengambilan selesai', partial:'Berhasil sebagian', error:'Gagal', unsupported:'Konektor belum tersedia', needs_setup:'Perlu konfigurasi API', ready:'Akses API belum diuji', snapshot:'Data tersimpan · belum diperbarui' };
const activeSourceIds = new Set(['play','appstore']);
const awaitingSource = source => ['unsupported','needs_setup','ready'].includes(source.status);
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
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
  user:'<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5c1-3.6 3.8-5.5 7.5-5.5s6.5 1.9 7.5 5.5"/>',
  link:'<path d="M10 13.5a4.4 4.4 0 0 0 6.3 0l2.8-2.8a4.4 4.4 0 0 0-6.2-6.2l-1 1"/><path d="M14 10.5a4.4 4.4 0 0 0-6.3 0l-2.8 2.8a4.4 4.4 0 0 0 6.2 6.2l1-1"/>',
  tagIcon:'<path d="M12.6 3H5a2 2 0 0 0-2 2v7.6a2 2 0 0 0 .6 1.4l6.4 6.4a2 2 0 0 0 2.8 0l7-7a2 2 0 0 0 0-2.8L14 3.6a2 2 0 0 0-1.4-.6Z"/><path d="M8 8h.01"/>',
  database:'<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
};
function icon(name) { return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.message}</svg>`; }
let reviews = [...seedReviews];
const state = { view:'overview', platform:'all', period:'all', from:'', to:'', trend:'week', sentiment:'all', query:'', tag:'', group:null, groupName:'', complaint:'', page:1, size:10, sort:{ key:'date', dir:'desc' } };
const sync = { sources:[], lastRun:null, runs:[], running:false, loading:true, busy:false, requesting:false, loaded:false, attempt:null, pull:null };
const views = { overview:'Dashboard', sentiment:'Analisis sentimen', reviews:'Review', platforms:'Platform', methodology:'Metode & data' };
let toastTimer, refreshTimer;
const isBusy = () => sync.loading || sync.busy || sync.running;
function notify(text) {
  const toast = $('#toast');
  toast.textContent = text;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'),4500);
}
function analyticalReviews() { return filterReviews(reviews,{ platform:state.platform, from:state.from, to:state.to }); }
function visibleReviews() {
  if (state.complaint) {
    const group = complaintStats(analyticalReviews()).find(g => g.id === state.complaint);
    return [...(group?.reviews || [])].sort(newestFirst);
  }
  let data = filterReviews(reviews,state);
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
    message:activeSourceIds.has(p.id) ? 'Belum ada data terbaru yang terkonfirmasi. Data awal tetap ditampilkan.' : p.note,
    checkedAt:null, lastSuccessAt:null,
  };
}
const numericCount = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
const storeRatingCount = id => { const p = platformById(id); return numericCount(sourceFor(p).ratingCount ?? p?.ratingCount) ?? 0; };
// Histogram halaman toko memuat SELURUH penilaian, termasuk bintang yang tidak menulis
// teks. Angka ini diambil apa adanya dari halaman sumber, bukan hasil perkiraan.
const storeHistogram = id => { const h = latestListing(id)?.ratingHistogram; return Array.isArray(h) && h.length === 5 && h.every(v => Number.isInteger(v) && v >= 0) ? h : null; };
function histogramRows(histogram, label) {
  const max = Math.max(1, ...histogram);
  return `<div class="rating-distribution" role="list" aria-label="${esc(label)}">${histogram.map((count, i) => `<div class="rating-row" role="listitem" aria-label="${5 - i} bintang: ${count} penilaian"><span>${5 - i} ★</span><span class="rating-track" aria-hidden="true"><span style="width:${pct(count, max)}%"></span></span><strong>${count}</strong></div>`).join('')}</div>`;
}
const storeInstalls = id => { const p = platformById(id); return sourceFor(p).installs ?? p?.installs ?? null; };
const fetchedCount = source => numericCount(source?.fetched);
function wasFetched(source) {
  return source && !awaitingSource(source) && source.status !== 'snapshot' && (source.fetched === true || fetchedCount(source) > 0 || (['success','partial'].includes(source.status) && source.fetched !== false));
}
function nav() {
  $('#sidebar').innerHTML = `<nav>${Object.entries(views).filter(([id]) => id !== 'methodology').map(([id,label],i) => `<button class="nav-item ${state.view===id?'active':''}" data-view="${id}" aria-label="${esc(label)}" ${state.view===id?'aria-current="page"':''} title="${esc(label)}">${icon(['grid','pulse','message','layers'][i])}<span>${esc(label)}</span>${id==='reviews'?`<span class="nav-count">${reviews.length}</span>`:''}</button>`).join('')}</nav>`;
  $('#topbar').innerHTML = `<div class="breadcrumb">${icon('home')}<strong>${esc(views[state.view])}</strong></div><div class="topbar-right"><span class="topbar-brand">WONDR MERCHANT</span></div>`;
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
    ${state.view==='platforms'?`<button class="btn btn-primary" data-action="analyze" ${isBusy()?'disabled aria-busy="true"':''}>${isBusy()?'<span class="spinner" aria-hidden="true"></span>':icon('pulse')}${isBusy()?'Mengambil dan menganalisis…':'Tarik Analisis'}</button>`:''}
  </div>`:''}</section>${state.view!=='methodology'&&state.period==='custom'?`<div class="custom-dates"><label>Dari tanggal<input id="date-from" type="date" value="${esc(state.from)}"></label><label>Sampai tanggal<input id="date-to" type="date" value="${esc(state.to)}"></label><button class="btn" data-action="apply-dates">Terapkan</button><span class="filter-error" id="date-error" role="alert"></span></div>`:''}`;
}
function filters() {
  return `<section class="filters" aria-label="Filter dashboard">
    <div class="platform-filter">
      <div class="platform-tabs" id="platform-tabs" role="group" aria-label="Pilih platform" tabindex="0">
        <button class="platform-tab ${state.platform==='all'?'active':''}" data-platform="all" aria-pressed="${state.platform==='all'}">${icon('layers')}Semua platform<span class="count">${reviews.length}</span></button>
        ${platforms.map(p => { const count = reviews.filter(r => r.platform === p.id).length, source = sourceFor(p), unavailable = !count && source.status !== 'success'; return `<button class="platform-tab ${state.platform===p.id?'active':''}" data-platform="${esc(p.id)}" aria-pressed="${state.platform===p.id}"><span style="color:${state.platform===p.id?color(p.color):'inherit'};display:flex">${icon(p.icon)}</span>${esc(p.short)}<span class="count" title="${unavailable?esc(sourceStatusNames[source.status]):`${count} ulasan tersimpan`}">${unavailable?'—':count}</span></button>`; }).join('')}
      </div>
    </div>
  </section>`;
}
function metricCards(data) {
  const s = summary(data), sources = new Set(data.map(r=>r.platform)).size;
  const source = state.platform === 'all' ? null : sourceFor(platformById(state.platform));
  const unavailable = source && !reviews.some(r=>r.platform===state.platform) && source.status !== 'success';
  const excluded = data.filter(r=>r.relevance?.status==='excluded').length;
  const social = data.filter(r=>platformById(r.platform)?.type==='Media sosial').length;
  const scope = source && unavailable ? `${source.message} Tidak tersedia bukan berarti nol keluhan.` : state.platform === 'all' ? `${data.length-social} teks dari sumber non-sosial dan ${social} komentar sosial dalam filter. ${social?'Konteks video dan promosi bukan opini pelanggan.':'Analisis ini belum mencakup sentimen media sosial.'}` : '';
  const metrics = [
    {label:'Total ulasan',value:unavailable?'—':integer(s.total),unit:'',icon:'message',cls:'',sub:sources?`<strong>${integer(sources)} kanal</strong> memiliki ulasan`:unavailable?'<strong>Data belum tersedia</strong> dari sumber ini':'<strong>Belum ada ulasan</strong> pada filter ini',width:0},
    {label:'Sentimen positif',value:s.classified?number(s.positivePct):'—',unit:s.classified?'%':'',icon:'smile',cls:'positive',sub:`<strong>${s.positive} ulasan</strong> dari ${s.classified} ulasan berlabel`,width:s.positivePct||0},
    {label:'Sentimen negatif',value:s.classified?number(s.negativePct):'—',unit:s.classified?'%':'',icon:'frown',cls:'negative',sub:`<strong>${s.negative} ulasan</strong> dari ${s.classified} ulasan berlabel`,width:s.negativePct||0},
    {label:'Skor sentimen neto (NSS)',value:s.classified?`${s.nss>0?'+':''}${number(s.nss)}`:'—',unit:'',icon:'pulse',cls:'nss',sub:s.classified?`<strong>${s.nss>10?'Cenderung positif':s.nss>0?'Positif tipis':s.nss<0?'Cenderung negatif':'Berimbang'}</strong> · poin`:'Belum ada ulasan berlabel',width:s.classified?Math.abs(s.nss):0},
  ];
  return `<section class="metrics" aria-label="Metrik sentimen">${metrics.map(m=>`<article class="metric ${m.cls}"><div class="metric-top"><span class="metric-label">${m.label}</span><span class="metric-icon">${icon(m.icon)}</span></div><div class="metric-value">${m.value}<span class="unit">${m.unit}</span></div><div class="metric-sub">${m.sub}</div>${m.cls?`<div class="mini-track"><span style="width:${m.width}%"></span></div>`:''}</article>`).join('')}</section><p class="classification-note ${s.unclassified?'needs-review':''}">${s.unclassified?`<strong>${s.unclassified} ulasan perlu ditinjau</strong>; tidak dihitung sebagai netral dan tidak termasuk dasar perhitungan persentase sentimen maupun NSS. `:''}${excluded?`${excluded} teks di luar penilaian pelanggan tetap dihitung dalam total teks, bukan dalam NSS. `:''}Persentase sentimen dan NSS dihitung dari ${s.classified} ulasan berlabel sentimen (positif, negatif, dan netral), bukan dari seluruh pengguna. ${esc(scope)}</p>`;
}
function legend() { return `<div class="legend">${sentimentKeys.map(id=>`<span class="legend-item"><span class="legend-swatch ${id}"></span>${esc(sentimentNames[id])}</span>`).join('')}</div>`; }
function trendChart(data) {
  const bins = timeline(data,state.trend), width = 650, height = 182, left = 30, right = 12, top = 12, bottom = 30;
  if (!bins.length) return empty('Belum ada tanggal yang dapat digrafikkan','Ulasan tanpa tanggal tetap tersimpan dan tampil saat semua tanggal dipilih.');
  const plotW = width-left-right, plotH = height-top-bottom;
  const max = Math.ceil(Math.max(4,...bins.map(b=>sentimentKeys.reduce((sum,k)=>sum+(b[k]||0),0)))/4)*4;
  const step = plotW/bins.length, barW = Math.min(30,step*.49);
  const grids = Array.from({length:5},(_,i)=>{const y=top+plotH-i*plotH/4;return `<line x1="${left}" y1="${y}" x2="${width-right}" y2="${y}" stroke="#e9ebec" stroke-dasharray="3 4"/><text x="${left-10}" y="${y+3}" text-anchor="end" fill="#878a99" font-size="9">${Math.ceil(max*i/4)}</text>`;}).join('');
  const bars = bins.map((b,i)=>{
    let offset=0;
    const x=left+step*i+step/2;
    const segments=sentimentKeys.map(key=>{const h=(b[key]||0)/max*plotH;offset+=h;return b[key]?`<rect x="${x-barW/2}" y="${top+plotH-offset}" width="${barW}" height="${h}" rx="2" fill="${colors[key]}"><title>${esc(dateLabel(b.date))} · ${esc(sentimentNames[key])}: ${b[key]} ulasan</title></rect>`:'';}).join('');
    return `${segments}${bins.length<=Math.floor(plotW/44)||i%Math.ceil(bins.length/Math.max(2,Math.floor(plotW/44)))===0?`<text x="${x}" y="${height-6}" text-anchor="middle" font-size="9" fill="#878a99">${esc(dateLabel(b.date))}</text>`:''}`;
  }).join('');
  const description=bins.map(b=>`${dateLabel(b.date)}: ${sentimentKeys.map(k=>`${sentimentNames[k]} ${b[k]||0}`).join(', ')}`).join('; ');
  return `<svg class="trend-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc('Grafik volume ulasan: '+description)}">${grids}${bars}</svg>`;
}
function composition(data) {
  const s=summary(data);
  let start=0;
  const segments=sentimentKeys.map(key=>{const end=start+pct(s[key],s.total), segment=`${colors[key]} ${start}% ${end}%`;start=end;return segment;}).join(',');
  return `<article class="card"><div class="card-header"><div><h2>Komposisi sentimen</h2><p class="card-subtitle">Proporsi seluruh ulasan, termasuk yang masih perlu ditinjau</p></div>${icon('layers')}</div>${s.total?`<div class="donut-wrap"><div class="donut" style="background:conic-gradient(${segments})" role="img" aria-label="${esc(sentimentKeys.map(k=>`${sentimentNames[k]}: ${s[k]} dari ${s.total} ulasan`).join('; '))}"><div class="donut-center"><strong>${s.total}</strong><span>total ulasan</span></div></div></div><div class="distribution-list">${sentimentKeys.map(key=>`<div class="distribution-item"><span class="legend-item"><span class="legend-swatch ${key}"></span>${esc(sentimentNames[key])}</span><strong>${s[key]}<small>ulasan</small></strong></div>`).join('')}</div><div class="insight-strip">${icon('spark')}${s.classified?`NSS ${s.nss>0?'+':''}${number(s.nss)} poin · dihitung dari ${s.classified} ulasan berlabel`:'NSS belum dapat dihitung; seluruh ulasan masih perlu ditinjau.'}</div>`:empty('Belum ada komposisi','Distribusi sentimen akan muncul setelah ada ulasan.')}</article>`;
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
  const p=projection(data), horizon=p.horizonWeeks, headText=`Dihitung dari kecepatan ulasan per pekan pada data ini dengan regresi kuadrat terkecil dan rentang Poisson 95%.`;
  const head=`<div class="card-header"><div><h2>Proyeksi ${horizon} pekan ke depan</h2><p class="card-subtitle">${headText}</p></div>${p.ok?`<span class="badge ${p.signal==='worsening'?'negative':p.signal==='improving'?'positive':'neutral'}">${esc(projectionSignals[p.signal])}</span>`:''}</div>`;
  if (!p.ok) return `<article class="card projection-card">${head}${empty('Proyeksi belum dapat dihitung', p.reason)}</article>`;
  const scale=Math.max(1,...p.themes.map(t=>t.recentTotal+t.projected));
  const top=p.themes.find(t=>t.projected>0);
  const signed=value=>`${value>0?'+':''}${number(value)}`;
  return `<article class="card projection-card">${head}
    <div class="projection-stats">
      <div><span>Ulasan negatif ${horizon} pekan ke depan</span><strong>${integer(Math.round(p.negative.projected))}</strong><small>rentang ${integer(p.negative.low)}–${integer(p.negative.high)} · ${integer(p.negative.recentTotal)} tercatat pada ${horizon} pekan terakhir</small></div>
      <div><span>NSS proyeksi</span><strong>${p.nssProjected.point===null?'N/A':signed(p.nssProjected.point)}</strong><small>rentang ${p.nssProjected.low===null?'N/A':`${signed(p.nssProjected.low)} s.d. ${signed(p.nssProjected.high)}`} · NSS saat ini ${p.nssCurrent===null?'N/A':signed(p.nssCurrent)}</small></div>
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
    <details class="chart-notes"><summary>Cara angka ini dihitung</summary><p>Ulasan dikelompokkan per pekan Senin–Minggu UTC menurut tanggal publikasi, lalu dihitung jumlah ulasan positif dan negatif tiap pekan. Kemiringan diuji dengan regresi kuadrat terkecil; arah hanya dinyatakan bila |t| ≥ 2. Bila kemiringan belum meyakinkan, laju mingguan diambil dari rata-rata ${horizon} pekan terakhir dan garis tren tidak diekstrapolasi. Rentang memakai sebaran Poisson (λ ± 1,96√λ); rentang NSS dihitung dari sudut terburuk dan terbaik kombinasi kedua rentang. Perhitungan dilakukan aturan statistik deterministik di perangkat ini — bukan model bahasa yang mengarang angka.</p><p>Batas baca: yang diproyeksikan adalah kecepatan ulasan publik masuk, bukan jumlah pengguna, transaksi, atau insiden. Jumlah data masih kecil (${p.weeks} pekan, ${integer(p.negative.observed)} ulasan negatif seluruhnya), sehingga satu pekan dengan banyak tanggal publikasi bersamaan dapat menggeser laju. Ulasan tanpa tanggal tidak masuk hitungan, dan jeda pengambilan data memengaruhi jumlah mingguan.</p></details>
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
    const ratings=numericCount(listing?.ratingCount) ?? numericCount(source.ratingCount) ?? numericCount(p.ratingCount);
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
  return `<button class="th-sort${active?' active':''}" data-sort="${esc(key)}" title="Urutkan menurut ${esc(label)}">${esc(label)}${icon('caret')}</button>`;
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
  // Jumlah topik dihitung dari filter platform/tanggal saja, supaya pilihan dropdown yang
  // sedang tidak dipakai tetap menunjukkan angka yang benar dan bukan nol semu.
  const analytical=analyticalReviews(), topicCounts=new Map();
  for (const r of analytical) for (const t of new Set(reviewTags(r))) topicCounts.set(t,(topicCounts.get(t)||0)+1);
  return `<article class="card review-card"><div class="card-header"><div><h2>${full?'Seluruh ulasan':'Suara merchant terbaru'}</h2><p class="card-subtitle">${full?`Diurutkan menurut ${esc(sortFieldLabels[state.sort.key]||'tanggal ulasan')} — ${state.sort.dir==='asc'?'menaik':'menurun'}. Klik judul kolom untuk mengubah urutan.`:'Ulasan terbaru dari data yang dipilih'}</p></div>${!full?`<button class="btn-text" data-view="reviews">Lihat semua ${icon('arrow')}</button>`:`<div class="review-heading-actions"><span class="badge">${all.length} ulasan</span><button class="btn" data-action="export">${icon('download')}Unduh CSV</button></div>`}</div>${full?`<div class="review-controls"><div class="sentiment-tabs" aria-label="Filter sentimen">${Object.entries({all:'Semua',...sentimentNames}).map(([id,label])=>`<button class="sentiment-tab ${state.sentiment===id?'active':''}" data-sentiment="${esc(id)}" aria-pressed="${state.sentiment===id}">${esc(label)}</button>`).join('')}</div><label class="search-box">${icon('search')}<input type="search" id="review-search" value="${esc(state.query)}" placeholder="Cari ulasan atau nama…" aria-label="Cari ulasan atau nama"></label><select class="tag-filter" id="tag-filter" aria-label="Filter topik"><option value="">Semua topik (${integer(analytical.length)})</option>${Object.entries(tags).map(([id,label])=>`<option value="${esc(id)}" ${state.tag===id?'selected':''} style="color:${esc(tagColors[id]||'#5e6374')}">${esc(label)} (${integer(topicCounts.get(id)||0)})</option>`).join('')}</select><select class="tag-filter size-filter" id="page-size" aria-label="Jumlah baris ulasan yang ditampilkan">${[10,25,50].map(size=>`<option value="${size}" ${String(state.size)===String(size)?'selected':''}>${size} baris</option>`).join('')}<option value="all" ${state.size==='all'?'selected':''}>Semua ${integer(all.length)} ulasan</option></select></div>${dataScopeNote()}${state.complaint?`<div class="active-filter complaint-filter"><span>Keluhan: <strong>${esc(complaint?complaintName(complaint):state.complaint)}</strong> · hanya negatif · ${all.length} ulasan unik</span><button class="btn-text" data-action="clear-complaint" aria-label="Hapus filter keluhan">Hapus filter ${icon('close')}</button></div>`:''}${state.group?`<div class="active-filter"><span>Topik: ${esc(state.groupName)}</span><button class="btn-text" data-action="clear-group">Hapus filter ${icon('close')}</button></div>`:''}${summary(all).unclassified?`<p class="note-inline">${summary(all).unclassified} ulasan perlu ditinjau; tidak dihitung sebagai netral dan tidak termasuk dasar perhitungan persentase sentimen maupun NSS.</p>`:''}`:''}${all.length?`<div class="table-wrap" tabindex="0" role="region" aria-label="Tabel ulasan; gulir horizontal jika diperlukan"><table><thead><tr>${full?reviewHeadings():'<th scope="col">Pengguna / tanggal</th><th scope="col">Ulasan & topik</th><th scope="col">Platform</th><th scope="col">Sentimen</th>'}<th scope="col"><span class="sr-only">Detail</span></th></tr></thead><tbody>${reviewRows(shown)}</tbody></table></div><div class="table-footer"><span>Menampilkan ${full?(state.page-1)*pageSize+1:1}–${full?Math.min(state.page*pageSize,all.length):shown.length} dari ${all.length} ulasan</span>${full?`<div class="pagination"><button data-page="prev" aria-label="Halaman sebelumnya" ${state.page===1?'disabled':''}>${icon('left')}</button><span>${state.page} / ${totalPages}</span><button data-page="next" aria-label="Halaman berikutnya" ${state.page===totalPages?'disabled':''}>${icon('chevron')}</button></div>`:'<span>Tanggal terbaru; tanpa tanggal di akhir</span>'}</div>`:empty('Tidak ada ulasan yang sesuai','Ubah kata kunci, sentimen, topik, platform, atau rentang tanggal. Ulasan tanpa tanggal hanya masuk pilihan semua tanggal.')}</article>`;
}
function overview(data) {
  const undated=data.filter(r=>!validDay(r.date)).length, mode=timelineMode(data,state.trend);
  return `${metricCards(data)}<section class="grid-complaint">${complaintChart()}${projectionCard(data)}</section>${sampleRating(data)}<section class="grid-chart"><article class="card"><div class="card-header"><div><h2>Tren ulasan</h2><p class="card-subtitle">${mode!==state.trend?'Agregasi bulanan otomatis untuk rentang lebih dari satu tahun.':'Jumlah ulasan menurut tanggal publikasi'}</p></div><select id="trend-mode" aria-label="Agregasi grafik"><option value="week" ${mode==='week'?'selected':''}>Mingguan</option><option value="month" ${mode==='month'?'selected':''}>Bulanan</option></select></div><div class="chart-body" tabindex="0" role="region" aria-label="Grafik tren ulasan; gulir horizontal jika diperlukan">${legend()}${trendChart(data)}</div><div class="chart-caption">${icon('info')}Tren ini menggambarkan ulasan tertulis yang terkumpul, bukan seluruh pengguna atau aktivitas waktu nyata. ${undated?`${undated} ulasan tanpa tanggal tidak dimasukkan ke grafik.`:'Seluruh ulasan memiliki tanggal dan dimasukkan ke grafik.'}</div></article>${composition(data)}</section><section class="grid-lower">${featureCard(data)}${priorities(data)}</section>${reviewTable(data)}`;
}
function driverCard(data,sentiment) {
  const groups=groupStats(data,sentiment==='positive'?positiveGroups:painGroups,sentiment).filter(g=>g.total).sort((a,b)=>b.total-a.total);
  const count=summary(data)[sentiment];
  return `<article class="card analysis-card ${sentiment}"><div class="card-header"><div class="analysis-title"><span class="analysis-icon">${icon(sentiment==='positive'?'smile':'frown')}</span><div><h2>${sentiment==='positive'?'Yang disukai merchant':'Yang perlu diperbaiki'}</h2><p class="card-subtitle">${sentiment==='positive'?'Tema pujian':'Tema keluhan'}</p></div></div><strong class="analysis-total">${count}</strong></div>${groups.length?`<div class="driver-list">${groups.map(g=>`<div class="driver"><div class="driver-heading"><h3>${esc(g.name)}</h3><span class="driver-count">${g.total} ulasan</span></div><div class="feature-bar"><span class="${sentiment}" style="width:${pct(g.total,count)}%"></span></div><p>${esc(g.action)}</p><button class="btn-text" data-driver="${esc(g.name)}" data-driver-sentiment="${sentiment}">Telusuri bukti ${icon('arrow')}</button></div>`).join('')}</div>`:empty('Belum ada tema spesifik','Ulasan umum tidak dipaksakan ke dalam kategori fitur.')}<p class="note-inline">Satu ulasan dapat masuk beberapa tema. ${sentiment==='positive'?'Pujian':'Keluhan'} umum tanpa objek yang jelas tidak dihitung sebagai tema fitur.</p></article>`;
}
function analysis(data) {
  const s=summary(data), mismatches=data.filter(r=>hasRating(r.rating)&&r.rating>=4&&r.sentiment==='negative');
  const ranked=groupStats(data,painGroups,'negative').filter(g=>g.total).sort((a,b)=>b.total-a.total);
  return `${metricCards(data)}${complaintChart()}<div class="analysis-grid">${driverCard(data,'positive')}${driverCard(data,'negative')}</div><div class="grid-lower">${featureCard(data)}<article class="card method-card"><h2>Di balik angka sentimen</h2><p>${s.classified?`${s.positive} ulasan positif dan ${s.negative} ulasan negatif dari ${s.classified} ulasan berlabel sentimen menghasilkan NSS ${s.nss>0?'+':''}${number(s.nss)} poin. Angka ini bukan skor kepuasan seluruh merchant.`:'Belum ada ulasan berlabel sentimen untuk menghitung interpretasi.'}</p><div class="formula">NSS = (positif − negatif) ÷ jumlah ulasan berlabel × 100</div><p><strong>${mismatches.length} ulasan berbintang tinggi berisi keluhan.</strong> Penilaian bintang 4–5 tidak otomatis berarti positif. Label otomatis memakai aturan kata kunci dan dapat keliru pada negasi, sarkasme, atau ulasan dengan beberapa aspek. ${s.unclassified?`${s.unclassified} ulasan yang perlu ditinjau tidak dihitung sebagai netral.`:'Tidak ada ulasan yang perlu ditinjau; seluruh ulasan telah memiliki label sentimen.'}</p><p>Keluhan mengenai pembaruan pencairan dana yang tidak tampil belum membuktikan adanya keterlambatan dana. Perlu verifikasi melalui catatan operasional.</p></article></div><article class="card"><div class="card-header"><div><h2>Rekomendasi untuk produk dan operasional</h2><p class="card-subtitle">Diurutkan menurut jumlah keluhan terkait dalam filter</p></div>${icon('spark')}</div>${ranked.length?`<div class="recommendations">${ranked.map((g,i)=>`<div class="recommendation"><span class="priority-number">${i+1}</span><div><h3>${esc(g.name)} <span class="tag">${g.total} ulasan</span></h3><p>${esc(g.action)}</p><p><strong>Pantau:</strong> ${esc(g.metric)}.</p></div><div class="owner"><strong>PENANGGUNG JAWAB</strong>${esc(g.owner)}</div></div>`).join('')}</div>`:empty('Belum ada keluhan spesifik','Tidak ada rekomendasi berbasis keluhan yang dapat diprioritaskan dalam filter ini.')}</article>`;
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
  if (Number.isInteger(coverage.itemsRead)) return `${coverage.itemsRead} item dataset dibaca${Number.isInteger(coverage.commentItemsRead)&&coverage.commentItemsRead?`, ${coverage.commentItemsRead} item dataset komentar`:''}${Number.isInteger(coverage.emptyResultMarkers)?`, ${coverage.emptyResultMarkers} penanda tidak ada hasil`:''}${Number.isInteger(coverage.identityFiltered)?`, ${coverage.identityFiltered} teks di luar identitas produk`:''}${coverage.followUp?.runId?`, run komentar ${coverage.followUp.runId}${coverage.followUp.finished===false?' belum selesai':''}`:''}${Number.isInteger(coverage.sampleLimit)?`, batas hasil actor ${coverage.sampleLimitField ?? 'input'}=${coverage.sampleLimit}${coverage.possiblyTruncated?' (terpotong di batas ini)':' (belum tercapai)'}`:', tanpa batas hasil pada input actor'}`;
  if (Number.isInteger(coverage.placesFound)) return `${coverage.placesFound} place ditemukan, ${coverage.productMatches} bernama produk, ${coverage.reviewFieldsSeen} teks ulasan disediakan API`;
  if (Number.isInteger(coverage.pagesRead) && Number.isInteger(coverage.relevantVideos)) return `${coverage.pagesRead} halaman API, ${coverage.relevantVideos} video relevan, ${coverage.completedVideos} selesai dipaginasi`;
  return '';
}
function coverage() {
  const scoped=filterReviews(reviews,{from:state.from,to:state.to});
  const socialCount = reviews.filter(r=>platformById(r.platform)?.type==='Media sosial').length;
  const readSources = sync.sources.filter(source=>['success','partial'].includes(source.status)).length;
  return `<p class="coverage-intro">${readSources} dari ${platforms.length} sumber memiliki hasil pengambilan berhasil atau sebagian pada status terakhir. ${socialCount?`${socialCount} komentar sosial tersimpan; hanya teks dengan relevansi dan sentimen yang cukup jelas masuk perhitungan NSS.`:'Belum ada komentar media sosial yang tersimpan. Angka sentimen saat ini bukan analisis media sosial.'} Konfigurasi API tidak sama dengan akses yang sudah berhasil. Kegagalan pengambilan tidak menghapus data tersimpan.</p><div class="coverage-grid">${platforms.filter(p=>state.platform==='all'||p.id===state.platform).map(p=>{
    const source=sourceFor(p), data=scoped.filter(r=>r.platform===p.id), s=summary(data), rating=ratingSummary(data);
    const stored=reviews.filter(r=>r.platform===p.id).length, listing=latestListing(p.id), url=safeHttps(p.url);
    const installs = source.installs ?? listing?.installs ?? p.installs ?? null;
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
        ${isStore?`<div class="coverage-rating listing-rating"><h4>Skor halaman toko</h4><div class="coverage-rating-value">${listing?`<strong>${number(listing.rating)} / 5</strong><span>· ${numericCount(listing.ratingCount)!==null?integer(numericCount(listing.ratingCount)):'N/A'} penilaian halaman toko</span>`:'<strong>N/A</strong><span>Belum ada pengambilan berhasil</span>'}</div><p>${listing?`Diambil pada ${esc(timeLabel(listing.lastSuccessAt || listing.checkedAt))}. Bukan jumlah teks ulasan atau data waktu nyata.`:'Data awal tidak ditampilkan sebagai data terbaru.'}</p>${storeHistogram(p.id)?`<div class="listing-histogram">${histogramRows(storeHistogram(p.id),`Distribusi seluruh penilaian halaman toko ${p.name}`)}</div>`:''}</div>`:''}
      </div>`}
      ${status==='success'?`<details class="coverage-scope"><summary>Cakupan pengambilan</summary><p class="source-message">${esc(message)}</p></details>`:!unavailable?`<p class="source-message source-alert">${esc(message)}</p>`:''}
      ${!unavailable||url?`<div class="coverage-actions">${unavailable?'':`<button class="btn-text" data-open-platform="${esc(p.id)}">Jelajahi ulasan ${icon('arrow')}</button>`}${url?`<a class="btn-text action-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Halaman publik ${icon('external')}</a>`:''}</div>`:''}
    </article>`;
  }).join('')}</div><article class="card method-card"><h2>Batas perbandingan sumber</h2><p>Jumlah ulasan tersimpan tidak menggambarkan seluruh percakapan di suatu platform. Sumber yang belum terhubung tidak berarti tidak ada keluhan. Penilaian seluruh halaman toko, penilaian pada ulasan, dan sentimen teks merupakan ukuran yang berbeda. Perbandingan antarplatform perlu memperhatikan periode, cakupan, dan jumlah ulasan; jumlah ulasan yang kecil belum membuktikan pengalaman pengguna di suatu platform lebih baik.</p></article>`;
}
function methodology() {
  const base=summary(seedReviews);
  return `<div class="method-grid">
    <article class="card method-card"><h2>Sumber dan cakupan</h2><p>Data awal diambil pada ${esc(dateLabel(observationDate,{year:'numeric'}))}: <strong>${seedReviews.filter(r=>r.platform==='play').length} ulasan tertulis Google Play</strong> dan <strong>${seedReviews.filter(r=>r.platform==='appstore').length} ulasan tertulis App Store</strong>. Aplikasi yang dianalisis adalah wondr merchant by BNI (Play: <strong>id.bni.wfb</strong>; App Store: <strong>id6741567238</strong>). Aplikasi wondr untuk konsumen dan BNI Merchant lama tidak termasuk dalam analisis ini.</p><p>Tombol Tarik Analisis mengambil data dari kedua toko aplikasi yang terhubung dan memuat seluruh halaman pada setiap kumpulan ulasan yang tersedia, dengan urutan terbaru. Google Play memisahkan daftar ulasannya menurut bahasa antarmuka, sehingga kumpulan bahasa Indonesia dan kumpulan bahasa Inggris dibaca keduanya lalu digabung berdasarkan ID ulasan. Jumlah ulasan tertulis berbeda dari ${integer(storeRatingCount('play'))} penilaian Play Store dan ${integer(storeRatingCount('appstore'))} penilaian App Store karena penilaian tanpa teks tidak menyertakan nama atau isi yang dapat dianalisis. Filter hanya membatasi tampilan, bukan proses pengambilan data. Platform lain belum terhubung dan dilaporkan sebagai belum diambil, bukan nol keluhan.</p><div class="method-callout">Konten promosi resmi, pemberitaan, ulasan duplikat, dan komentar tentang produk lain tidak diperlakukan sebagai pengalaman merchant.</div><p><strong>Unduhan.</strong> Google Play hanya mempublikasikan rentang unduhan, saat ini ${esc(storeInstalls('play') || 'belum terbaca')}. Apple tidak mempublikasikan jumlah unduhan di halaman publik, sehingga metrik tersebut tidak tersedia dan tidak diperkirakan. Keduanya bukan ukuran jumlah pengguna aktif.</p></article>
    <article class="card method-card"><h2>Cara membaca sentimen</h2><ul><li><strong>Positif:</strong> pujian, kepuasan, atau manfaat yang dinyatakan pengguna.</li><li><strong>Negatif:</strong> keluhan, masalah penggunaan, dan kekurangan yang mengganggu.</li><li><strong>Netral:</strong> informasi atau pertanyaan tanpa penilaian yang jelas; bukan label pengganti untuk teks yang tidak dipahami.</li><li><strong>Perlu tinjauan:</strong> teks belum cukup jelas untuk dinilai; tidak dihitung sebagai netral dan tidak termasuk dasar perhitungan persentase sentimen maupun NSS.</li></ul><div class="formula">NSS = (positif − negatif) ÷ jumlah ulasan berlabel × 100</div><p>Ulasan berlabel sentimen mencakup ulasan positif, negatif, dan netral. Data awal: (${base.positive} − ${base.negative}) ÷ ${base.classified} × 100 = <strong>${base.nss>0?'+':''}${number(base.nss)} poin</strong>.</p></article>
    <article class="card method-card"><h2>Pelabelan dan keterbatasan</h2><ul><li><strong>Manual:</strong> label pada data awal ditentukan dari pembacaan teks; teks yang tidak berubah mempertahankan labelnya. Belum ada pemeriksaan oleh penilai kedua.</li><li><strong>Otomatis (versi 1):</strong> menggunakan aturan kata kunci sederhana, bukan model bahasa. Negasi, sarkasme, dan ulasan dengan beberapa aspek dapat dinilai keliru; teks yang tidak dikenali ditandai perlu ditinjau.</li><li>Penilaian bintang tidak menentukan sentimen secara otomatis.</li><li>Google Play memisahkan daftar ulasan menurut bahasa antarmuka. Kedua kumpulan dibaca dan digabung berdasarkan ID ulasan, sehingga tidak ada ulasan yang terlewat pada salah satu kumpulan. Kumpulan ulasan tertulis ini bukan sampel acak dan tidak mewakili seluruh ${integer(storeRatingCount('play'))} penilai di halaman toko maupun seluruh pengguna.</li><li>Grafik tanggal hanya menampilkan ulasan tertulis yang memiliki tanggal. Ulasan tanpa tanggal tidak masuk rentang tanggal atau tren, tetapi datanya tetap tersimpan.</li><li>Peringkat keluhan hanya memakai ulasan negatif unik per kategori. Persentase dihitung dari seluruh ulasan negatif pada platform dan tanggal terpilih, bukan dari jumlah kategori. Satu ulasan dapat masuk beberapa kategori.</li><li>Penilaian umum tidak membuktikan kegagalan fitur; penyebutan keluhan belum tentu merupakan insiden yang terkonfirmasi.</li></ul></article>
    <article class="card method-card"><h2>Penyimpanan dan jejak perubahan</h2><p>Hasil pengambilan data disimpan di komputer ini, bukan di peramban. Dasbor memuat data tersimpan saat dibuka; pembaruan tidak berlangsung terus-menerus. Status sumber dan waktu pemeriksaan mengikuti data tersimpan. Gangguan pengambilan tidak menghapus data yang sudah tersedia.</p><p>Ulasan baru ditambahkan, sedangkan perubahan teks, penilaian bintang, atau tanggal disimpan sebagai versi sebelumnya. Detail ulasan menampilkan waktu pengambilan, waktu pertama dan terakhir tercatat, serta riwayat perubahan. Versi lama tidak dihitung sebagai ulasan baru dalam grafik.</p><p>Jika data tersimpan tidak dapat dimuat saat awal, data awal tetap ditampilkan disertai pesan kesalahan yang jelas. Penilaian halaman toko hanya ditampilkan dari data daring yang berhasil diambil dan dipisahkan dari penilaian pada ulasan. Sumber publik tidak memverifikasi identitas penulis maupun kebenaran isi keluhan.</p></article>
  </div><article class="card method-card category-card"><h2>Kategori yang didukung</h2>${Object.values(tags).map(label=>`<span class="tag">${esc(label)}</span>`).join('')}<p>Seluruh kategori tetap terdaftar di bagian ini, termasuk yang belum memiliki ulasan. Jumlah ulasan per kategori mengikuti filter platform dan tanggal. Berkas CSV pada halaman ulasan mengikuti filter yang aktif.</p></article>`;
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
  const attribute=['data-platform','data-sentiment','data-page','data-action','data-sort'].find(name=>focused?.hasAttribute(name));
  const focusSelector=focused?.id?`#${CSS.escape(focused.id)}`:attribute?`[${attribute}="${CSS.escape(focused.getAttribute(attribute))}"]`:null;
  nav();
  const data=analyticalReviews();
  $('#main').classList.toggle('in-place-update',!animate);
  $('#main').innerHTML=heading()+(state.view!=='methodology'?filters():'')+(state.view==='overview'?overview(data):state.view==='sentiment'?analysis(data):state.view==='reviews'?reviewTable(data,true):state.view==='platforms'?coverage():methodology());
  if ($('#platform-tabs')) $('#platform-tabs').scrollLeft=scrollLeft;
  if (focusSelector) $(focusSelector)?.focus({preventScroll:true});
  updatePlatformScroll();
}
function clearComplaint() {
  if (state.complaint) { state.complaint=''; state.sentiment='all'; }
}
function clearReviewFilters() {
  clearComplaint();
  state.sentiment='all'; state.query=''; state.tag=''; state.group=null; state.groupName=''; state.page=1;
}
function navigate(view, keepComplaint=false) {
  if (!Object.hasOwn(views,view)) return;
  if (!keepComplaint) clearComplaint();
  state.view=view; state.page=1; render({animate:true}); window.scrollTo({top:0,behavior:'instant'});
  $('#main h1').focus({preventScroll:true});
}
function openReview(key) {
  const r=reviews.find(x=>x.platform+'|'+x.id===key);
  if (!r) return;
  const dialog=$('#detail-dialog'), url=safeHttps(r.sourceUrl), history=reviewHistory(r);
  const platform=platformById(r.platform);
  const relevanceNames={relevant:'Relevan secara otomatis',uncertain:'Perlu tinjauan konteks',excluded:'Di luar penilaian pelanggan'};
  const facts=(rows)=>`<dl class="source-facts">${rows.filter(Boolean).map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>`;
  dialog.innerHTML=`<div class="dialog-header"><div><h2 id="detail-heading">Rincian ulasan</h2><p>Teks asli, konteks, dan alasan penilaian sentimen</p></div><button class="icon-button" data-close="detail-dialog" aria-label="Tutup detail">${icon('close')}</button></div><div class="dialog-body">
    <div class="detail-author"><div class="review-author"><span class="review-avatar">${esc(initials(r))}</span><div><div class="review-name">${esc(authorName(r))}</div><div class="review-date">${esc(dateLabel(r.date,{year:'numeric'}))} · <span class="platform-label"><span style="color:${color(platform?.color)};display:flex">${icon(platform?.icon)}</span>${esc(platform?.name || r.platform)}</span> · ${hasRating(r.rating)?`${r.rating}/5 bintang`:'Penilaian N/A'}</div></div></div>${badge(r.sentiment)}</div>
    ${r.title?`<p class="detail-title">${esc(r.title)}</p>`:''}<div class="detail-text">${esc(r.text)}</div>
    <div class="review-tags">${reviewTags(r).map(t=>topicChip(t,false)).join('')}${labelChip(r)}${hasRating(r.rating)?`<span class="tag stars-tag">${'★'.repeat(r.rating)}<span class="unfilled-stars">${'★'.repeat(5-r.rating)}</span></span>`:''}</div>
    <div class="detail-grid">
      <section class="detail-section"><h3>${icon('pen')}Alasan penilaian</h3><p>${esc(r.rationale || 'N/A')}</p><p><strong>Label:</strong> ${esc(labelMethod(r))}</p>${r.sentiment==='unclassified'?'<p>Ulasan ini tidak dihitung sebagai netral dan tidak termasuk dasar perhitungan persentase sentimen maupun NSS.</p>':''}${r.relevance?`<p><strong>Relevansi:</strong> ${esc(relevanceNames[r.relevance.status] || 'N/A')} — ${esc(r.relevance.reason)}</p>`:''}</section>
      <section class="detail-section"><h3>${icon('database')}Sumber data</h3><p>${esc(r.provenance || 'N/A')}</p>${url?'':'<p>Tautan sumber resmi tidak tersedia.</p>'}${facts([['ID ulasan',r.id],['Platform',platform?.name || r.platform],r.parentId?['ID komentar induk',r.parentId]:null])}</section>
    </div>
    ${r.context?`<section class="detail-section"><h3>${icon('play')}Konteks video, bukan sentimen</h3><p>${esc(r.context.title || 'N/A')}</p><p>${esc(r.context.description || 'N/A')}</p>${facts([['ID video',r.context.videoId || 'N/A'],['Waktu publikasi asli',r.publishedAt || 'N/A'],['Waktu pembaruan asli',r.updatedAt || 'N/A']])}</section>`:''}
    <section class="detail-section"><h3>${icon('clock')}Waktu data</h3>${facts([['Diambil pada',timeLabel(r.retrievedAt || r.observedAt)],['Pertama tercatat',timeLabel(r.firstSeenAt || r.observedAt)],['Terakhir tercatat',timeLabel(r.lastSeenAt || r.observedAt)]])}</section>
    <section class="detail-section"><h3>${icon('clock')}Riwayat perubahan</h3><p>${history.length?`${history.length} versi sebelumnya; hanya versi terbaru yang dihitung dalam dasbor.`:'Tidak ada riwayat. Hanya versi terbaru.'}</p>${history.length?`<details class="review-history"><summary>Lihat ${history.length} versi sebelumnya</summary><ol>${[...history].reverse().map((old,i)=>`<li><h3>Versi ${history.length-i}</h3><p>Penulis: ${esc(authorName(old))} · Tanggal ulasan: ${esc(dateLabel(old.date,{year:'numeric'}))} · Bintang: ${hasRating(old.rating)?`${old.rating}/5`:'N/A'}</p><p>Diambil pada: ${esc(timeLabel(old.observedAt))} · Terakhir tercatat: ${esc(timeLabel(old.lastSeenAt || old.observedAt))}</p>${old.title?`<p class="detail-title">${esc(old.title)}</p>`:''}<div class="detail-text">${esc(old.text || 'N/A')}</div><p>Label: ${esc(labelMethod(old))}</p></li>`).join('')}</ol></details>`:''}</section>
  </div><div class="dialog-footer"><small>Isi ulasan merupakan pernyataan pengguna.</small>${url?`<a class="btn" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Buka sumber asli ${icon('external')}</a>`:'<small>Tautan sumber resmi tidak tersedia.</small>'}</div>`;
  if (!dialog.open) dialog.showModal();
}
function download(content,name,type) {
  const url=URL.createObjectURL(new Blob([content],{type})), a=document.createElement('a');
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
  if (!payload.running) sync.attempt=null;
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
    notify(`${sync.loaded?'Status data tidak dapat diperbarui.':'Data tersimpan gagal dimuat; data awal digunakan.'} ${error instanceof Error?error.message:'Kesalahan tidak dikenal.'}`);
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
    if (c.actor) rows.push(['Actor', String(c.actor).split('/').pop() || c.actor]);
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
  const chip = row => `<span class="pull-chip is-${row.status}">${esc(pullStatusNames[row.status])}</span>`;
  const count = row => Number.isInteger(row.fetched) ? `${integer(row.fetched)} teks` : '—';
  const meta = row => row.meta?.length ? `<div class="pull-meta"><h4>Detail metadata</h4><dl>${row.meta.map(([key, value]) => `<div><dt>${esc(key)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl></div>` : '';
  const card = row => pullFinalStates.has(row.status)
    ? `<div class="pull-main"><div class="pull-head"><strong>${esc(row.name)}</strong>${chip(row)}</div>${row.message ? `<p class="pull-msg">${esc(shortMessage(row.message))}</p>` : ''}<div class="pull-foot"><span>Ulasan publik: <strong>${count(row)}</strong></span>${chip(row)}</div></div>${meta(row)}`
    : `<div class="pull-main"><div class="pull-head"><strong>${esc(row.name)}</strong></div><div class="pull-foot"><span>Ulasan/Teks: <strong>—</strong></span><span class="pull-state">${esc(pullStatusNames[row.status])}</span></div></div>`;
  dialog.innerHTML = `<div class="dialog-header"><div><h2 id="pull-heading">Mengambil dan menganalisis</h2><p>Kanal diambil satu per satu. Status di bawah adalah hasil nyata dari kanal tersebut, bukan perkiraan.</p></div><button class="icon-button" data-close="pull-dialog" aria-label="Tutup progres">${icon('close')}</button></div><div class="dialog-body"><div class="pull-progress"><span>Platform</span><strong>${checked} dari ${queue.length} kanal diperiksa${finished?'; riwayat diperbarui':''}</strong></div><ol class="pull-list" aria-live="polite">${queue.map(row => `<li class="pull-row is-${row.status}"><span class="pull-dot" aria-hidden="true"></span>${card(row)}</li>`).join('')}</ol></div><div class="dialog-footer"><small>Kanal yang menjawab tanpa hasil berarti terhubung tetapi tidak mengirim konten; itu bukan nol keluhan.</small></div>`;
  if (!dialog.open) dialog.showModal();
}
// Pesan singkat tetap memuat keterangan pemotongan: kalimat pertama saja akan membuat hasil
// terpotong terbaca seperti pengambilan yang lengkap.
const truncationMark = /\b(?:belum lengkap|terpotong|terbatas|time_budget|page_limit|run_limit|dibatasi)\b/i;
function shortMessage(message) {
  const text = String(message || '').trim();
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
  sync.busy=true; sync.requesting=true;
  sync.attempt={startedAt:new Date().toISOString(),finishedAt:null,status:'running'};
  const queue = pullQueue();
  sync.pull = { queue, finished:false };
  render(); renderPullDialog();
  let stopped = false;
  if (!queue.length) {
    // Status sumber tidak dapat dibaca (misalnya server sedang turun). Jalankan satu
    // permintaan gabungan seperti biasa agar pengguna tetap mendapat hasil atau pesan galat.
    try { applyPayload(await requestData('/api/analyze','POST')); }
    catch (error) { stopped = true; notify(`Pengambilan gagal. ${error instanceof Error?error.message:'Kesalahan tidak dikenal.'} Ulasan yang sudah tersimpan tetap ditampilkan.`); }
  }
  for (const row of queue) {
    row.status='diproses'; renderPullDialog();
    try {
      applyPayload(await requestData(`/api/analyze?platform=${encodeURIComponent(row.id)}`,'POST'));
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
    try { applyPayload(await requestData('/api/analyze?finish=1','POST')); }
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
  if (button.dataset.review) { openReview(button.dataset.review); return; }
  if (button.dataset.close==='detail-dialog') { $('#detail-dialog').close(); return; }
  if (button.dataset.close==='pull-dialog') { $('#pull-dialog').close(); sync.pull=null; return; }
  if (button.dataset.complaint) {
    const group=complaintStats(analyticalReviews()).find(g=>g.id===button.dataset.complaint);
    if (!group) return;
    clearReviewFilters(); state.complaint=group.id; state.sentiment='negative'; navigate('reviews',true); return;
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
  if (action==='clear-complaint') { clearComplaint(); state.page=1; render(); }
  if (action==='clear-group') { state.group=null; state.groupName=''; state.page=1; render(); }
  if (action==='export') {
    const data=visibleReviews();
    if (!data.length) { notify('Tidak ada ulasan untuk diekspor dalam filter ini.'); return; }
    download(exportCsv(data),`wondr-sentiment-${state.platform}-${new Date().toISOString().slice(0,10)}.csv`,'text/csv;charset=utf-8');
    notify(`${data.length} ulasan diekspor sesuai filter aktif.`);
  }
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
  if (event.target.id==='trend-mode') { state.trend=event.target.value; render(); }
  if (event.target.id==='tag-filter') { clearComplaint(); state.tag=event.target.value; state.page=1; render(); }
  if (event.target.id==='page-size') { state.size=event.target.value==='all'?'all':Number(event.target.value)||10; state.page=1; render(); }
});
let searchTimer;
document.addEventListener('input',event=>{
  if (event.target.id==='review-search') {
    clearComplaint(); state.query=event.target.value; state.page=1; clearTimeout(searchTimer);
    searchTimer=setTimeout(()=>{
      if (state.view!=='reviews') return;
      const active=document.activeElement?.id==='review-search', cursor=event.target.selectionStart;
      render();
      if (active) { const input=$('#review-search'); input.focus(); try { input.setSelectionRange(cursor,cursor); } catch {} }
    },180);
  }
});
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
