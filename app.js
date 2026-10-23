import { seedReviews, platforms, tags, observationDate } from './data.js';
import { summary, filterReviews, timeline, groupStats, featureGroups, painGroups, positiveGroups, sentimentNames, complaintStats, ratingSummary, exportCsv } from './model.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const number = value => new Intl.NumberFormat('id-ID', { maximumFractionDigits:1, minimumFractionDigits:1 }).format(value);
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
const color = value => /^#[\da-f]{3,8}$/i.test(value || '') ? value : '#7c8799';
const colors = { positive:'#269e86', negative:'#e37c75', neutral:'#aeb9cc', unclassified:'#a58ac4' };
const sentimentKeys = Object.keys(colors);
const sourceStatusNames = { success:'Berhasil', partial:'Sebagian berhasil', error:'Gagal', unsupported:'Tidak dicoba · konektor belum tersedia', snapshot:'Snapshot tersimpan · belum ditarik' };
const runStatusNames = { success:'Berhasil', partial:'Sebagian berhasil', error:'Gagal', running:'Sedang berjalan' };
const activeSourceIds = new Set(['play','appstore']);
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
function labelMethod(r) {
  if (r.labeling === 'manual') return 'manual · label berdasarkan teks yang diaudit pada snapshot';
  if (r.labeling === 'rules-v1') return 'rules-v1 · aturan kata kunci konservatif otomatis, bukan LLM; perlu validasi manusia';
  return `${r.labeling || 'N/A'} · metode label belum terverifikasi`;
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
};
function icon(name) { return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.message}</svg>`; }
let reviews = [...seedReviews];
const state = { view:'overview', platform:'all', period:'all', from:'', to:'', trend:'week', sentiment:'all', query:'', tag:'', group:null, groupName:'', complaint:'', page:1 };
const sync = { sources:[], lastRun:null, runs:[], running:false, loading:true, busy:false, requesting:false, loaded:false, error:'', attempt:null };
const views = { overview:'Ringkasan', sentiment:'Analisis sentimen', reviews:'Ulasan & percakapan', platforms:'Cakupan platform', methodology:'Metodologi & data' };
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
    message:activeSourceIds.has(p.id) ? 'Belum ada hasil pengambilan online yang dikonfirmasi server. Snapshot dasar tetap terlihat.' : 'Tidak dicoba: konektor belum tersedia.',
    checkedAt:null, lastSuccessAt:null,
  };
}
const numericCount = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
const fetchedCount = source => numericCount(source?.fetched);
function wasFetched(source) {
  return source && !['unsupported','snapshot'].includes(source.status) && (source.fetched === true || fetchedCount(source) > 0 || (['success','partial'].includes(source.status) && source.fetched !== false));
}
function nav() {
  $('#sidebar').innerHTML = `<div class="brand"><div class="brandmark">w</div><div><div class="brandword">wondr<span> pulse</span></div><div class="brand-subtitle">Merchant intelligence</div></div></div>
    <div class="workspace-chip"><span class="workspace-icon">${icon('folder')}</span>wondr merchant<span class="chev">${icon('down')}</span></div>
    <nav><div class="nav-label">Workspace</div>${Object.entries(views).map(([id,label],i) => `${i === 4 ? '<div class="sidebar-separator"></div><div class="nav-label">Data & transparansi</div>' : ''}<button class="nav-item ${state.view===id?'active':''}" data-view="${id}" aria-label="${esc(label)}" ${state.view===id?'aria-current="page"':''} title="${esc(label)}">${icon(['grid','pulse','message','layers','book'][i])}<span>${esc(label)}</span>${id==='reviews'?`<span class="nav-count">${reviews.length}</span>`:''}</button>`).join('')}</nav>
    <div class="sidebar-bottom"><div class="local-card"><div class="local-card-title">Batch · server lokal</div><p>Hasil pengambilan online disimpan di server lokal, bukan browser.<br>Pembaruan per batch, bukan live feed.</p></div><div class="profile"><div class="profile-avatar">DA</div><div><strong>Data Analyst</strong><small>Local workspace</small></div></div></div>`;
  $('#topbar').innerHTML = `<div class="breadcrumb">${icon('home')}<span>Workspace</span><span>/</span><strong>${esc(views[state.view])}</strong></div><div class="topbar-right"><div class="snapshot-indicator"><span class="dot"></span><span>${sync.loaded?'Dataset server lokal':'Snapshot dasar'} · bukan live feed</span></div><span class="topbar-separator"></span><span class="topbar-brand">BNI MERCHANT</span><span class="avatar-light">DA</span></div>`;
}
function heading() {
  const subtitles = {
    overview:'Pahami suara merchant. Ubah setiap masukan menjadi langkah perbaikan.',
    sentiment:'Temukan apa yang disukai pelanggan — dan apa yang perlu diperbaiki.',
    reviews:'Jelajahi teks asli, label sentimen, dan alasan di balik setiap penilaian.',
    platforms:'Cakupan, status pengambilan, dan keterbatasan setiap sumber.',
    methodology:'Analisis yang bisa ditelusuri, tanpa angka buatan atau klaim real-time.',
  };
  const title = state.view === 'overview' ? 'Monitoring sentimen' : views[state.view];
  return `<section class="page-heading"><div><div class="eyebrow">Customer experience intelligence</div><h1>${esc(title)}</h1><p>${esc(subtitles[state.view])}</p></div><div class="heading-actions"><button class="btn btn-primary" data-action="analyze" ${isBusy()?'disabled aria-busy="true"':''}>${isBusy()?'<span class="spinner" aria-hidden="true"></span>':icon('pulse')}${isBusy()?'Menarik & menganalisis…':'Tarik Analisa'}</button></div></section>`;
}
function dataNote() {
  const attempt = sync.attempt || sync.lastRun;
  const resultSources = Array.isArray(sync.lastRun?.sources) ? sync.lastRun.sources : [];
  const fetched = resultSources.filter(wasFetched);
  const unsupported = platforms.filter(p => sourceFor(p).status === 'unsupported');
  const sourceNames = sources => sources.map(s => platformById(s.id)?.short || s.id).join(', ');
  const versions = reviews.reduce((sum,r) => sum + reviewHistory(r).length,0);
  const status = isBusy() ? 'running' : attempt?.status;
  const errorState = Boolean(sync.error) || status === 'error';
  const attemptText = attempt ? `${runStatusNames[status] || status || 'Status tidak tersedia'} · mulai ${timeLabel(attempt.startedAt)}${attempt.finishedAt?` · selesai ${timeLabel(attempt.finishedAt)}`:''}` : isBusy() ? 'Memuat status dan dataset dari server lokal…' : 'Belum ada percobaan pengambilan online yang dikonfirmasi server.';
  return `<section class="data-note sync-note ${errorState?'sync-error':status==='partial'?'sync-partial':''}" aria-label="Status data" role="status" aria-live="polite"><div class="sync-note-body"><strong>Pembaruan batch, bukan live feed.</strong><p>Percobaan terakhir: ${esc(attemptText)}</p>${isBusy()?'<p>Proses berjalan; ulasan yang sudah tersedia tetap terlihat. Semua konektor aktif ditarik, tanpa mengubah filter Anda.</p>':''}${sync.error?`<p class="sync-error-message"><strong>Kesalahan server:</strong> ${esc(sync.error)} Data saat ini dipertahankan. Coba lagi melalui Tarik Analisa.</p>`:''}<p>Hasil server terakhir — sumber benar-benar diambil: ${fetched.length?`${fetched.length} (${esc(sourceNames(fetched))})`:'belum ada yang dikonfirmasi'}. Tidak dicoba / konektor belum tersedia: ${unsupported.length} dari ${platforms.length} (${esc(unsupported.map(p=>p.short).join(', ')) || 'tidak ada'}).</p>${sync.lastRun?`<p>Batch tersimpan: ${integer(numericCount(sync.lastRun.added) ?? 0)} baru · ${integer(numericCount(sync.lastRun.updated) ?? 0)} diperbarui · ${integer(numericCount(sync.lastRun.unchanged) ?? 0)} tidak berubah. Status: ${esc(runStatusNames[sync.lastRun.status] || sync.lastRun.status)}.</p>`:''}<p><strong>Dataset historis dipertahankan: ${integer(reviews.length)} ulasan unik</strong> · ${integer(versions)} versi terdahulu pada detail. ${sync.loaded?'Menampilkan rekaman dari server lokal.':`Menampilkan seed snapshot ${esc(dateLabel(observationDate,{year:'numeric'}))}; bukan hasil penarikan online.`}</p>${sync.error&&sync.loaded?'<p>Status sumber di bawah berasal dari respons server terakhir, bukan konfirmasi keberhasilan percobaan yang gagal.</p>':''}</div><button class="btn-text" data-view="platforms">Status sumber ${icon('arrow')}</button></section>`;
}
function filters() {
  const months = [...new Set(reviews.filter(r => validDay(r.date)).map(r => r.date.slice(0,7)))].sort();
  if (/^\d{4}-\d{2}$/.test(state.period) && !months.includes(state.period)) months.push(state.period);
  months.sort();
  return `<section class="filters" aria-label="Filter dashboard"><div class="platform-tabs"><button class="platform-tab ${state.platform==='all'?'active':''}" data-platform="all" aria-pressed="${state.platform==='all'}">${icon('layers')}Semua platform<span class="count">${reviews.length}</span></button>${platforms.map(p => { const count = reviews.filter(r => r.platform === p.id).length; return `<button class="platform-tab ${state.platform===p.id?'active':''}" data-platform="${esc(p.id)}" aria-pressed="${state.platform===p.id}"><span style="color:${state.platform===p.id?color(p.color):'inherit'};display:flex">${icon(p.icon)}</span>${esc(p.short)}<span class="count">${count}</span></button>`; }).join('')}</div><label class="range-button">${icon('calendar')}<select id="period" aria-label="Periode ulasan"><option value="all" ${state.period==='all'?'selected':''}>Semua tanggal</option>${months.map(month=>`<option value="${esc(month)}" ${state.period===month?'selected':''}>${esc(dateLabel(month+'-01',{day:undefined,month:'long',year:'numeric'}))}</option>`).join('')}<option value="custom" ${state.period==='custom'?'selected':''}>Rentang khusus</option></select></label></section>${state.period==='custom'?`<div class="custom-dates"><label>Dari tanggal<input id="date-from" type="date" value="${esc(state.from)}"></label><label>Sampai tanggal<input id="date-to" type="date" value="${esc(state.to)}"></label><button class="btn" data-action="apply-dates">Terapkan</button><span class="filter-error" id="date-error" role="alert"></span></div>`:''}`;
}
function metricCards(data) {
  const s = summary(data), sources = new Set(data.map(r=>r.platform)).size;
  const metrics = [
    {label:'Total ulasan',value:integer(s.total),unit:'',icon:'message',cls:'',sub:`<strong>${sources} platform</strong> dengan ulasan`,width:0},
    {label:'Sentimen positif',value:s.classified?number(s.positivePct):'—',unit:s.classified?'%':'',icon:'smile',cls:'positive',sub:`<strong>${s.positive} ulasan</strong> dari ${s.classified} terklasifikasi`,width:s.positivePct||0},
    {label:'Sentimen negatif',value:s.classified?number(s.negativePct):'—',unit:s.classified?'%':'',icon:'frown',cls:'negative',sub:`<strong>${s.negative} ulasan</strong> dari ${s.classified} terklasifikasi`,width:s.negativePct||0},
    {label:'Net sentiment score',value:s.classified?`${s.nss>0?'+':''}${number(s.nss)}`:'—',unit:'',icon:'pulse',cls:'nss',sub:s.classified?`<strong>${s.nss>10?'Cenderung positif':s.nss>0?'Positif tipis':s.nss<0?'Cenderung negatif':'Berimbang'}</strong> · poin`:'Belum ada label terklasifikasi',width:s.classified?Math.abs(s.nss):0},
  ];
  return `<section class="metrics" aria-label="Metrik sentimen">${metrics.map(m=>`<article class="metric ${m.cls}"><div class="metric-top"><span class="metric-label">${m.label}</span><span class="metric-icon">${icon(m.icon)}</span></div><div class="metric-value">${m.value}<span class="unit">${m.unit}</span></div><div class="metric-sub">${m.sub}</div>${m.cls?`<div class="mini-track"><span style="width:${m.width}%"></span></div>`:''}</article>`).join('')}</section><p class="classification-note ${s.unclassified?'needs-review':''}">${s.unclassified?`<strong>${s.unclassified} ulasan perlu tinjauan</strong>; bukan netral dan tidak masuk denominator persentase sentimen / NSS. `:''}Persentase sentimen dan NSS memakai ${s.classified} ulasan terklasifikasi (positif + negatif + netral), bukan seluruh pengguna.</p>`;
}
function legend() { return `<div class="legend">${sentimentKeys.map(id=>`<span class="legend-item"><span class="legend-swatch ${id}"></span>${esc(sentimentNames[id])}</span>`).join('')}</div>`; }
function trendChart(data) {
  const bins = timeline(data,state.trend), width = 650, height = 182, left = 30, right = 12, top = 12, bottom = 30;
  if (!bins.length) return empty('Belum ada tanggal yang dapat digrafikkan','Ulasan tanpa tanggal tetap tersimpan dan tampil saat semua tanggal dipilih.');
  const plotW = width-left-right, plotH = height-top-bottom;
  const max = Math.ceil(Math.max(4,...bins.map(b=>sentimentKeys.reduce((sum,k)=>sum+(b[k]||0),0)))/4)*4;
  const step = plotW/bins.length, barW = Math.min(30,step*.49);
  const grids = Array.from({length:5},(_,i)=>{const y=top+plotH-i*plotH/4;return `<line x1="${left}" y1="${y}" x2="${width-right}" y2="${y}" stroke="#edf1f6" stroke-dasharray="3 4"/><text x="${left-10}" y="${y+3}" text-anchor="end" fill="#7c8799" font-size="9">${Math.ceil(max*i/4)}</text>`;}).join('');
  const bars = bins.map((b,i)=>{
    let offset=0;
    const x=left+step*i+step/2;
    const segments=sentimentKeys.map(key=>{const h=(b[key]||0)/max*plotH;offset+=h;return b[key]?`<rect x="${x-barW/2}" y="${top+plotH-offset}" width="${barW}" height="${h}" rx="2" fill="${colors[key]}"><title>${esc(dateLabel(b.date))} · ${esc(sentimentNames[key])}: ${b[key]} ulasan</title></rect>`:'';}).join('');
    return `${segments}${bins.length<=Math.floor(plotW/44)||i%Math.ceil(bins.length/Math.max(2,Math.floor(plotW/44)))===0?`<text x="${x}" y="${height-6}" text-anchor="middle" font-size="9" fill="#7c8799">${esc(dateLabel(b.date))}</text>`:''}`;
  }).join('');
  const description=bins.map(b=>`${dateLabel(b.date)}: ${sentimentKeys.map(k=>`${sentimentNames[k]} ${b[k]||0}`).join(', ')}`).join('; ');
  return `<svg class="trend-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc('Grafik volume ulasan: '+description)}">${grids}${bars}</svg>`;
}
function composition(data) {
  const s=summary(data);
  let start=0;
  const segments=sentimentKeys.map(key=>{const end=start+pct(s[key],s.total), segment=`${colors[key]} ${start}% ${end}%`;start=end;return segment;}).join(',');
  return `<article class="card"><div class="card-header"><div><h2>Komposisi sentimen</h2><p class="card-subtitle">Luas donat = proporsi seluruh ulasan, termasuk perlu tinjauan</p></div>${icon('layers')}</div>${s.total?`<div class="donut-wrap"><div class="donut" style="background:conic-gradient(${segments})" role="img" aria-label="${esc(sentimentKeys.map(k=>`${sentimentNames[k]}: ${s[k]} dari ${s.total} ulasan`).join('; '))}"><div class="donut-center"><strong>${s.total}</strong><span>total ulasan</span></div></div></div><div class="distribution-list">${sentimentKeys.map(key=>`<div class="distribution-item"><span class="legend-item"><span class="legend-swatch ${key}"></span>${esc(sentimentNames[key])}</span><strong>${s[key]}<small>ulasan</small></strong></div>`).join('')}</div><div class="insight-strip">${icon('spark')}${s.classified?`NSS ${s.nss>0?'+':''}${number(s.nss)} poin · hanya ${s.classified} terklasifikasi`:'NSS belum dapat dihitung; semua label perlu tinjauan.'}</div>`:empty('Belum ada komposisi','Distribusi sentimen akan muncul setelah ada ulasan.')}</article>`;
}
const complaintName = group => group.id === 'general' ? 'Penilaian umum (non-spesifik)' : group.name;
function complaintChart() {
  const data=analyticalReviews(), groups=complaintStats(data), negative=summary(data).negative;
  const ranked=groups.filter(g=>g.total>0), max=ranked[0]?.total || 0, zero=groups.length-ranked.length;
  return `<article class="card complaint-card" aria-labelledby="complaint-heading"><div class="card-header"><div><h2 id="complaint-heading">Fitur yang paling banyak dikomplain</h2><p class="card-subtitle">Hanya ulasan negatif · platform dan tanggal terpilih · klik kategori untuk teks buktinya</p></div><span class="badge negative">${negative} ulasan negatif</span></div>${ranked.length?`<div class="complaint-chart"><div class="complaint-axis" aria-hidden="true"><span>0</span><span>Skala panjang batang: 0–${max} ulasan</span><span>${max}</span></div><ol class="complaint-list">${ranked.map(g=>`<li><button class="complaint-row" data-complaint="${esc(g.id)}" aria-label="${esc(`${complaintName(g)}: ${g.total} ulasan negatif unik, ${number(pct(g.total,negative))}% dari ${negative} ulasan negatif. Buka ulasan terkait.`)}"><span class="complaint-label">${esc(complaintName(g))}</span><span class="complaint-track" aria-hidden="true"><span class="complaint-bar" style="width:${pct(g.total,max)}%"></span></span><span class="complaint-value"><strong>${g.total} ulasan</strong><small>${number(pct(g.total,negative))}% dari ${negative} negatif</small></span></button></li>`).join('')}</ol></div>`:empty(negative?'Belum ada kategori keluhan yang cocok':'Tidak ada ulasan negatif dalam filter ini',negative?'Ada ulasan negatif, tetapi belum memiliki kategori keluhan yang dapat ditampilkan.':'Ini bukan bukti seluruh pengguna bebas kendala. Perhatikan cakupan dan ukuran sampel.')}<p class="note-inline">${zero} kategori bernilai nol dalam filter ini tetap terdaftar; riwayat tidak dihapus. Satu ulasan dapat masuk beberapa kategori: persentase memakai seluruh ${negative} ulasan negatif, bukan jumlah seluruh kategori, sehingga tidak harus berjumlah 100%. Sebutan keluhan bukan insiden terkonfirmasi. Label otomatis dapat memerlukan tinjauan. Penilaian umum bersifat non-spesifik, bukan kegagalan fitur tertentu.</p></article>`;
}
function sampleRating(data) {
  const r=ratingSummary(data), max=Math.max(1,...r.distribution.map(d=>d.count));
  return `<article class="card sample-rating"><div><h2>Rating sampel ulasan</h2><p><strong>${r.total?`${number(r.average)} / 5`:'N/A'}</strong> · ${r.total} dari ${data.length} ulasan memiliki rating</p><small>Hanya rekaman dalam filter, bukan rating listing toko.</small></div><div class="rating-distribution" role="list" aria-label="Distribusi rating sampel">${[...r.distribution].reverse().map(d=>`<div class="rating-row" role="listitem" aria-label="${d.stars} bintang: ${d.count} ulasan"><span>${d.stars} ★</span><span class="rating-track" aria-hidden="true"><span style="width:${pct(d.count,max)}%"></span></span><strong>${d.count}</strong></div>`).join('')}</div></article>`;
}
function featureCard(data) {
  const groups=groupStats(data,featureGroups);
  return `<article class="card"><div class="card-header"><div><h2>Apa yang dibicarakan?</h2><p class="card-subtitle">Semua sentimen per area pengalaman, bukan ranking keluhan</p></div><button class="btn-text" data-view="sentiment">Detail ${icon('arrow')}</button></div><div class="feature-list">${groups.map((g,i)=>`<div class="feature-row"><div class="feature-row-label"><button class="btn-text" data-feature="${i}">${esc(g.name)}</button><strong>${g.total} ulasan</strong></div><div class="feature-bar" role="img" aria-label="${esc(`${g.name}: ${sentimentKeys.map(k=>`${g[k]||0} ${sentimentNames[k]}`).join(', ')}`)}">${sentimentKeys.map(k=>`<span class="${k}" style="width:${pct(g[k]||0,g.total)}%" title="${esc(sentimentNames[k])}: ${g[k]||0}"></span>`).join('')}</div></div>`).join('')}${legend()}<p class="feature-hint">Multi-label: satu ulasan dapat membahas beberapa area. Panjang segmen memakai total ulasan area, termasuk perlu tinjauan.</p></div></article>`;
}
function priorities(data) {
  const groups=groupStats(data,painGroups,'negative').filter(g=>g.total).sort((a,b)=>b.total-a.total).slice(0,3);
  return `<article class="card"><div class="card-header"><div><h2>Prioritas perbaikan</h2><p class="card-subtitle">Tema keluhan untuk ditinjau, bukan insiden terkonfirmasi</p></div><button class="btn-text" data-view="sentiment" aria-label="Lihat semua prioritas">${icon('arrow')}</button></div>${groups.length?`<div class="priority-list">${groups.map((g,i)=>`<div class="priority"><span class="priority-number">0${i+1}</span><div class="priority-main"><h3>${esc(g.name)}</h3><p>${esc(g.action)}</p></div><span class="priority-count">${g.total} ulasan</span></div>`).join('')}</div>`:empty('Tidak ada keluhan dalam filter','Tidak berarti seluruh pengguna bebas kendala; perhatikan ukuran sampel.')}</article>`;
}
function dataScopeNote() {
  const rows=['play','appstore'].map(id=>{
    const p=platformById(id), stored=reviews.filter(r=>r.platform===id).length, listing=latestListing(id);
    const ratings=numericCount(listing?.ratingCount) ?? numericCount(sourceFor(p).ratingCount) ?? numericCount(p.ratingCount);
    return `${esc(p?.short || id)}: ${integer(stored)} ulasan tertulis${ratings!==null?` dari ${integer(ratings)} penilaian`:''}`;
  });
  return `<p class="note-inline scope-note">${icon('info')}<span><strong>${integer(reviews.length)} ulasan tertulis unik</strong> dapat dicari berdasarkan nama atau teks; seluruh teks publik yang dapat diakses sudah dimuat tanpa sampling. ${rows.join(' · ')}. Penilaian tanpa teks tidak memiliki nama atau isi publik, sehingga tidak dapat dianalisis atau dicari tanpa mengarang data.</span></p>`;
}
function reviewRows(data) {
  return data.map((r,i)=>`<tr><td><div class="review-author"><span class="review-avatar ${['','warm','mint'][i%3]}">${esc(initials(r))}</span><div><div class="review-name" title="${esc(authorName(r))}">${esc(authorName(r))}</div><div class="review-date">${esc(dateLabel(r.date,{year:'numeric'}))}</div></div></div></td><td><button class="review-text-button" data-review="${esc(r.platform+'|'+r.id)}" aria-label="Baca ulasan ${esc(authorName(r))}"><span class="review-text">${esc(r.text)}</span></button><div class="review-tags">${reviewTags(r).slice(0,2).map(t=>`<button class="tag tag-chip-button" data-tag="${esc(t)}">${esc(tags[t] || t)}</button>`).join('')}<span class="tag" title="${esc(labelMethod(r))}">${esc(r.labeling || 'N/A')}</span></div></td><td>${platformLabel(r.platform)}${hasRating(r.rating)?`<div class="stars" aria-label="${r.rating} dari 5 bintang">${'★'.repeat(r.rating)}<span class="unfilled-stars">${'★'.repeat(5-r.rating)}</span></div>`:'<div class="review-date">Rating N/A</div>'}</td><td>${badge(r.sentiment)}</td><td><button class="icon-button" data-review="${esc(r.platform+'|'+r.id)}" aria-label="Detail ulasan ${esc(authorName(r))}">${icon('chevron')}</button></td></tr>`).join('');
}
function reviewTable(data, full=false) {
  const all=full?visibleReviews():[...data].sort(newestFirst), pageSize=full?10:4;
  const totalPages=Math.max(1,Math.ceil(all.length/pageSize));
  state.page=Math.max(1,Math.min(state.page,totalPages));
  const shown=all.slice(full?(state.page-1)*pageSize:0,full?state.page*pageSize:pageSize);
  const complaint=state.complaint?complaintStats(analyticalReviews()).find(g=>g.id===state.complaint):null;
  return `<article class="card review-card"><div class="card-header"><div><h2>${full?'Semua ulasan & percakapan':'Suara merchant terbaru'}</h2><p class="card-subtitle">${full?'Label dapat ditelusuri ke teks, riwayat, dan sumber aslinya':'Cuplikan ulasan terbaru dalam dataset yang dipilih'}</p></div>${!full?`<button class="btn-text" data-view="reviews">Lihat semua ${icon('arrow')}</button>`:`<div class="review-heading-actions"><span class="badge">${all.length} ulasan</span><button class="btn" data-action="export">${icon('download')}Ekspor CSV</button></div>`}</div>${full?`<div class="review-controls"><div class="sentiment-tabs" aria-label="Filter sentimen">${Object.entries({all:'Semua',...sentimentNames}).map(([id,label])=>`<button class="sentiment-tab ${state.sentiment===id?'active':''}" data-sentiment="${esc(id)}" aria-pressed="${state.sentiment===id}">${esc(label)}</button>`).join('')}</div><label class="search-box">${icon('search')}<input type="search" id="review-search" value="${esc(state.query)}" placeholder="Cari ulasan atau nama…" aria-label="Cari ulasan atau nama"></label><select class="tag-filter" id="tag-filter" aria-label="Filter topik"><option value="">Semua topik</option>${Object.entries(tags).map(([id,label])=>`<option value="${esc(id)}" ${state.tag===id?'selected':''}>${esc(label)}</option>`).join('')}</select></div>${dataScopeNote()}${state.complaint?`<div class="active-filter complaint-filter"><span>Keluhan: <strong>${esc(complaint?complaintName(complaint):state.complaint)}</strong> · hanya negatif · ${all.length} ulasan unik</span><button class="btn-text" data-action="clear-complaint" aria-label="Hapus filter keluhan">Hapus filter ${icon('close')}</button></div>`:''}${state.group?`<div class="active-filter"><span>Topik: ${esc(state.groupName)}</span><button class="btn-text" data-action="clear-group">Hapus filter ${icon('close')}</button></div>`:''}${summary(all).unclassified?`<p class="note-inline">${summary(all).unclassified} ulasan perlu tinjauan; tidak dihitung sebagai netral maupun denominator persentase sentimen / NSS.</p>`:''}`:''}${all.length?`<div class="table-wrap" tabindex="0" role="region" aria-label="Tabel ulasan; gulir horizontal jika diperlukan"><table><thead><tr><th>Pengguna / tanggal</th><th>Ulasan & topik</th><th>Platform</th><th>Sentimen</th><th><span class="sr-only">Detail</span></th></tr></thead><tbody>${reviewRows(shown)}</tbody></table></div><div class="table-footer"><span>Menampilkan ${full?(state.page-1)*pageSize+1:1}–${full?Math.min(state.page*pageSize,all.length):shown.length} dari ${all.length} ulasan</span>${full?`<div class="pagination"><button data-page="prev" aria-label="Halaman sebelumnya" ${state.page===1?'disabled':''}>${icon('left')}</button><span>${state.page} / ${totalPages}</span><button data-page="next" aria-label="Halaman berikutnya" ${state.page===totalPages?'disabled':''}>${icon('chevron')}</button></div>`:'<span>Tanggal terbaru; tanggal N/A di akhir</span>'}</div>`:empty('Tidak ada ulasan yang cocok','Ubah kata kunci, sentimen, topik, platform, atau rentang tanggal. Ulasan tanpa tanggal hanya masuk pilihan semua tanggal.')}</article>`;
}
function overview(data) {
  const undated=data.filter(r=>!validDay(r.date)).length;
  return `${metricCards(data)}${complaintChart()}${sampleRating(data)}<section class="grid-chart"><article class="card"><div class="card-header"><div><h2>Tren percakapan</h2><p class="card-subtitle">Volume ulasan berdasarkan tanggal publikasi</p></div><select id="trend-mode" aria-label="Agregasi grafik"><option value="week" ${state.trend==='week'?'selected':''}>Mingguan</option><option value="month" ${state.trend==='month'?'selected':''}>Bulanan</option></select></div><div class="chart-body">${legend()}${trendChart(data)}</div><div class="chart-caption">${icon('info')}Tren dataset ulasan tertulis, bukan seluruh pengguna atau aktivitas real-time. ${undated} ulasan bertanggal N/A tidak masuk grafik.</div></article>${composition(data)}</section><section class="grid-lower">${featureCard(data)}${priorities(data)}</section>${reviewTable(data)}`;
}
function driverCard(data,sentiment) {
  const groups=groupStats(data,sentiment==='positive'?positiveGroups:painGroups,sentiment).filter(g=>g.total).sort((a,b)=>b.total-a.total);
  const count=summary(data)[sentiment];
  return `<article class="card analysis-card ${sentiment}"><div class="card-header"><div class="analysis-title"><span class="analysis-icon">${icon(sentiment==='positive'?'smile':'frown')}</span><div><h2>${sentiment==='positive'?'Yang disukai merchant':'Yang perlu diperbaiki'}</h2><p class="card-subtitle">${sentiment==='positive'?'Tema pujian':'Tema keluhan & pain points'}</p></div></div><strong class="analysis-total">${count}</strong></div>${groups.length?`<div class="driver-list">${groups.map(g=>`<div class="driver"><div class="driver-heading"><h3>${esc(g.name)}</h3><span class="driver-count">${g.total} ulasan</span></div><div class="feature-bar"><span class="${sentiment}" style="width:${pct(g.total,count)}%"></span></div><p>${esc(g.action)}</p><button class="btn-text" data-driver="${esc(g.name)}" data-driver-sentiment="${sentiment}">Telusuri bukti ${icon('arrow')}</button></div>`).join('')}</div>`:empty('Belum ada driver spesifik','Ulasan umum tidak dipaksakan masuk ke kategori fitur.')}<p class="note-inline">Satu ulasan dapat masuk beberapa tema. Pujian atau keluhan umum tanpa objek jelas tidak dihitung sebagai driver fitur.</p></article>`;
}
function analysis(data) {
  const s=summary(data), mismatches=data.filter(r=>hasRating(r.rating)&&r.rating>=4&&r.sentiment==='negative');
  const ranked=groupStats(data,painGroups,'negative').filter(g=>g.total).sort((a,b)=>b.total-a.total);
  return `${metricCards(data)}${complaintChart()}<div class="analysis-grid">${driverCard(data,'positive')}${driverCard(data,'negative')}</div><div class="grid-lower">${featureCard(data)}<article class="card method-card"><h2>Di balik angka sentimen</h2><p>${s.classified?`${s.positive} ulasan positif dan ${s.negative} ulasan negatif dari ${s.classified} terklasifikasi menghasilkan NSS ${s.nss>0?'+':''}${number(s.nss)} poin. Angka ini bukan skor kepuasan seluruh merchant.`:'Belum ada ulasan terklasifikasi untuk menghitung interpretasi.'}</p><div class="formula">NSS = (positif − negatif) ÷ terklasifikasi × 100</div><p><strong>${mismatches.length} ulasan berbintang tinggi berisi keluhan.</strong> Rating 4–5 tidak otomatis positif. Label rules-v1 memakai aturan kata kunci, bukan LLM. ${s.unclassified} ulasan perlu tinjauan tidak dihitung sebagai netral.</p><p>Keluhan “settlement tidak update” tidak membuktikan dana terlambat cair. Perlu validasi dengan log operasional.</p></article></div><article class="card"><div class="card-header"><div><h2>Rekomendasi untuk produk & operasional</h2><p class="card-subtitle">Diurutkan berdasarkan jumlah keluhan terkait dalam filter</p></div>${icon('spark')}</div>${ranked.length?`<div class="recommendations">${ranked.map((g,i)=>`<div class="recommendation"><span class="priority-number">${i+1}</span><div><h3>${esc(g.name)} <span class="tag">${g.total} ulasan</span></h3><p>${esc(g.action)}</p><p><strong>Pantau:</strong> ${esc(g.metric)}.</p></div><div class="owner"><strong>REKOMENDASI PEMILIK</strong>${esc(g.owner)}</div></div>`).join('')}</div>`:empty('Belum ada keluhan spesifik','Tidak ada rekomendasi berbasis keluhan yang bisa diprioritaskan dalam filter ini.')}</article>`;
}
function latestListing(id) {
  const history=[...sync.sources, ...(sync.lastRun?.sources || []), ...sync.runs.flatMap(run=>Array.isArray(run.sources)?run.sources:[])];
  return history.filter(s=>s.id===id && s.status!=='snapshot' && (['success','partial'].includes(s.status)||s.lastSuccessAt) && typeof s.rating==='number' && s.rating>=1 && s.rating<=5 && Number.isFinite(Date.parse(s.lastSuccessAt || s.checkedAt || '')))
    .sort((a,b)=>Date.parse(b.lastSuccessAt || b.checkedAt)-Date.parse(a.lastSuccessAt || a.checkedAt))[0];
}
function coverage() {
  const scoped=filterReviews(reviews,{from:state.from,to:state.to});
  return `<p class="coverage-intro">Status pengambilan dan jumlah server berlaku untuk seluruh batch; statistik sampel mengikuti periode terpilih. Hanya Google Play dan Apple App Store memiliki konektor aktif. Platform lain tidak dicoba. Kegagalan tidak menghapus ulasan historis.</p><div class="coverage-grid">${platforms.filter(p=>state.platform==='all'||p.id===state.platform).map(p=>{
    const source=sourceFor(p), data=scoped.filter(r=>r.platform===p.id), s=summary(data), rating=ratingSummary(data);
    const stored=reviews.filter(r=>r.platform===p.id).length, listing=latestListing(p.id), url=safeHttps(p.url);
    const status=Object.hasOwn(sourceStatusNames,source.status)?source.status:'snapshot';
    const fetched=fetchedCount(source), serverCount=numericCount(source.count);
    return `<article class="card coverage-card"><div class="coverage-title"><span class="platform-circle" style="color:${color(p.color)}">${icon(p.icon)}</span><div><h3>${esc(p.name)}</h3><small>${esc(p.type)}</small></div></div><span class="coverage-state ${status}"><span class="dot"></span>${esc(sourceStatusNames[status])}</span><p class="source-message">${esc(source.message || (status==='unsupported'?'Tidak dicoba: konektor belum tersedia.':'Server tidak memberikan pesan tambahan.'))}</p>${status==='unsupported'?`<p>Tidak ada pengambilan online untuk sumber ini. ${esc(p.note)}</p>`:''}<div class="coverage-stats"><div><strong>${s.total}</strong><small>ulasan dalam periode</small></div><div><strong>${s.classified?`${s.nss>0?'+':''}${number(s.nss)}`:'—'}</strong><small>NSS · ${s.classified} terklasifikasi</small></div></div>${s.unclassified?`<p class="needs-review">${s.unclassified} perlu tinjauan, bukan netral; dikecualikan dari persentase sentimen / NSS.</p>`:''}<dl class="source-facts"><div><dt>Ulasan historis tersimpan</dt><dd>${stored}${serverCount!==null&&serverCount!==stored?` (server melaporkan ${serverCount})`:''}</dd></div><div><dt>Diambil pada hasil terakhir</dt><dd>${['unsupported','snapshot'].includes(status)?'Tidak dicoba':fetched!==null?`${fetched} rekaman`:wasFetched(source)?'Diambil; jumlah N/A':'Tidak dikonfirmasi'}</dd></div><div><dt>Diperiksa</dt><dd>${esc(timeLabel(source.checkedAt))}</dd></div><div><dt>Terakhir berhasil</dt><dd>${esc(timeLabel(source.lastSuccessAt || (status==='success'?source.checkedAt:null)))}</dd></div></dl><div class="coverage-rating"><strong>Rating sampel periode ini</strong><p>${rating.total?`${number(rating.average)} / 5 dari ${rating.total} ulasan ber-rating`:'N/A · tidak ada rating sampel'}. Bukan rating listing.</p></div><div class="coverage-rating listing-rating"><strong>Metadata listing online terakhir yang berhasil</strong><p>${listing?`${number(listing.rating)} / 5 · ${numericCount(listing.ratingCount)!==null?integer(numericCount(listing.ratingCount)):'N/A'} penilaian listing<br>Diamati ${esc(timeLabel(listing.lastSuccessAt || listing.checkedAt))}; bukan jumlah teks ulasan dan bukan klaim real-time.`:'Belum tersedia dari pengambilan online yang berhasil. Metadata statis snapshot tidak ditampilkan sebagai data terbaru.'}</p></div><div class="coverage-actions"><button class="btn-text" data-open-platform="${esc(p.id)}">Jelajahi ulasan ${icon('arrow')}</button>${url?`<a class="btn-text action-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Listing publik ${icon('external')}</a>`:''}</div></article>`;
  }).join('')}</div><article class="card method-card"><h2>Batas perbandingan sumber</h2><p>Jumlah ulasan tersimpan bukan ukuran seluruh percakapan di platform. Konektor yang belum tersedia tidak berarti tidak ada keluhan. Rating listing, rating sampel, dan sentimen teks merupakan ukuran berbeda. Bandingkan periode, metode sampling, dan jenis penulis yang setara; sampel kecil tidak membuktikan pengalaman satu platform lebih baik.</p></article>`;
}
function methodology() {
  const base=summary(seedReviews);
  return `<div class="method-grid"><article class="card method-card"><h2>Sumber & cakupan</h2><p>Snapshot dasar diakses pada ${esc(dateLabel(observationDate,{year:'numeric'}))}: <strong>${seedReviews.filter(r=>r.platform==='play').length} ulasan tertulis Google Play</strong> dan <strong>${seedReviews.filter(r=>r.platform==='appstore').length} ulasan tertulis App Store</strong>. Aplikasi yang dianalisis adalah wondr merchant (Play <strong>id.bni.wfb</strong>; App Store <strong>id6741567238</strong>), bukan wondr konsumen, BNI Merchant lama, atau paket lain seperti id.bni.wondrmerchant.</p><p>Tarik Analisa meminta kedua konektor aktif dan mengambil seluruh halaman ulasan berteks yang tersedia (Play memakai urutan terbaru). Ini bukan 68 penilaian Play atau 15 penilaian App Store: penilaian tanpa teks tidak mempublikasikan nama atau isi sehingga tidak dapat dianalisis. Filter hanya membatasi tampilan, bukan pengambilan. Platform lain belum memiliki konektor dan dilaporkan “tidak dicoba”, bukan nol keluhan.</p><div class="method-callout">Konten promosi resmi, berita, ulasan duplikat, dan komentar tentang produk lain tidak diperlakukan sebagai pengalaman merchant.</div></article><article class="card method-card"><h2>Cara membaca sentimen</h2><ul><li><strong>Positif:</strong> pujian, kepuasan, atau manfaat yang dinyatakan pengguna.</li><li><strong>Negatif:</strong> keluhan, masalah penggunaan, dan kekurangan yang mengganggu.</li><li><strong>Netral:</strong> informasi atau pertanyaan tanpa penilaian yang jelas, bukan label pengganti untuk teks yang tidak dipahami.</li><li><strong>Perlu tinjauan:</strong> bukti teks belum cukup; bukan netral dan dikecualikan dari denominator persentase sentimen / NSS.</li></ul><div class="formula">NSS = (positif − negatif) ÷ terklasifikasi × 100</div><p>Terklasifikasi = positif + negatif + netral. Dataset dasar: (${base.positive} − ${base.negative}) ÷ ${base.classified} × 100 = <strong>${base.nss>0?'+':''}${number(base.nss)} poin</strong>.</p></article><article class="card method-card"><h2>Label & keterbatasan</h2><ul><li><strong>manual:</strong> label snapshot berdasarkan pembacaan teks; teks yang tidak berubah mempertahankan labelnya. Belum ada audit penilai kedua.</li><li><strong>rules-v1:</strong> aturan kata kunci konservatif otomatis, bukan LLM. Negasi, sarkasme, dan aspek campuran dapat salah; teks yang tidak dikenali perlu tinjauan manusia.</li><li>Rating bintang bukan penentu otomatis sentimen.</li><li>Google Play diambil dengan urutan terbaru; seluruh 35 teks yang tersedia habis. Kumpulan ulasan tertulis ini bukan sampel acak dan tidak mewakili seluruh 68 penilai atau seluruh pengguna.</li><li>Grafik tanggal hanya mendistribusikan ulasan tertulis yang bertanggal. Tanggal N/A tidak masuk rentang tanggal atau tren, tetapi rekamannya tetap tersimpan.</li><li>Ranking keluhan hanya memakai ulasan negatif unik per kategori. Persentase dibagi seluruh ulasan negatif dalam platform / tanggal terpilih, bukan jumlah kategori. Satu ulasan bisa masuk beberapa kategori.</li><li>Penilaian umum tidak membuktikan kegagalan fitur; sebutan keluhan bukan insiden terkonfirmasi.</li></ul></article><article class="card method-card"><h2>Penyimpanan & jejak perubahan</h2><p>Batch hasil pengambilan online disimpan di server lokal. Dashboard memuat dataset tersimpan saat dibuka; ini bukan live feed. Status sumber dan waktu pemeriksaan dilaporkan server. Gangguan pengambilan tidak menghapus rekaman yang sudah tersedia.</p><p>Ulasan baru ditambahkan; perubahan teks, rating, atau tanggal disimpan sebagai versi sebelumnya. Detail ulasan menampilkan waktu diamati, pertama / terakhir terlihat, dan riwayat. Versi lama tidak dihitung sebagai ulasan baru di grafik.</p><p>Jika server tidak dapat dimuat saat awal, seed snapshot tetap terlihat dengan pesan kesalahan eksplisit. Rating listing hanya ditampilkan dari metadata online yang berhasil, terpisah dari rating sampel. Sumber publik tidak memverifikasi identitas penulis atau kebenaran keluhan.</p></article></div><article class="card method-card category-card"><h2>Kategori yang didukung</h2>${Object.entries(tags).map(([id,label])=>`<span class="tag">${esc(id)} · ${esc(label)}</span>`).join('')}<p>Kategori bernilai nol tetap tersedia dalam model. Kategori dan hitungan diperbarui mengikuti data server serta filter platform / tanggal. Ekspor CSV pada halaman ulasan mengikuti filter aktif.</p></article>`;
}
function render() {
  nav();
  const data=analyticalReviews();
  $('#main').innerHTML=heading()+dataNote()+(state.view!=='methodology'?filters():'')+(state.view==='overview'?overview(data):state.view==='sentiment'?analysis(data):state.view==='reviews'?reviewTable(data,true):state.view==='platforms'?coverage():methodology());
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
  state.view=view; state.page=1; render(); window.scrollTo({top:0,behavior:'instant'});
}
function openReview(key) {
  const r=reviews.find(x=>x.platform+'|'+x.id===key);
  if (!r) return;
  const dialog=$('#detail-dialog'), url=safeHttps(r.sourceUrl), history=reviewHistory(r);
  dialog.innerHTML=`<div class="dialog-header"><div><h2 id="detail-heading">Di balik sebuah ulasan</h2><p>Teks asli, konteks, dan alasan klasifikasi</p></div><button class="icon-button" data-close="detail-dialog" aria-label="Tutup detail">${icon('close')}</button></div><div class="dialog-body"><div class="detail-author"><div class="review-author"><span class="review-avatar">${esc(initials(r))}</span><div><div class="review-name">${esc(authorName(r))}</div><div class="review-date">${esc(dateLabel(r.date,{year:'numeric'}))} · ${esc(platformById(r.platform)?.name || r.platform)} · ${hasRating(r.rating)?`${r.rating}/5 bintang`:'Rating N/A'}</div></div></div>${badge(r.sentiment)}</div>${r.title?`<p class="detail-title">${esc(r.title)}</p>`:''}<div class="detail-text">${esc(r.text)}</div><div class="review-tags">${reviewTags(r).map(t=>`<span class="tag">${esc(tags[t] || t)}</span>`).join('')}</div><div class="detail-section"><h3>Alasan klasifikasi</h3><p>${esc(r.rationale || 'N/A')}</p><p><strong>Label:</strong> ${esc(labelMethod(r))}</p>${r.sentiment==='unclassified'?'<p>Ulasan ini tidak dihitung sebagai netral dan tidak masuk denominator persentase sentimen / NSS.</p>':''}</div><div class="detail-section"><h3>Jejak sumber</h3><p>${esc(r.provenance || 'N/A')}</p><dl class="source-facts"><div><dt>Diamati</dt><dd>${esc(timeLabel(r.observedAt))}</dd></div><div><dt>Pertama terlihat</dt><dd>${esc(timeLabel(r.firstSeenAt || r.observedAt))}</dd></div><div><dt>Terakhir terlihat</dt><dd>${esc(timeLabel(r.lastSeenAt || r.observedAt))}</dd></div><div><dt>ID sumber</dt><dd>${esc(r.id)}</dd></div></dl></div><div class="detail-section"><h3>Riwayat tersimpan</h3><p>${history.length} versi terdahulu; versi terkini saja yang dihitung di dashboard.</p>${history.length?`<details class="review-history"><summary>Lihat ${history.length} versi sebelumnya</summary><ol>${[...history].reverse().map((old,i)=>`<li><h3>Versi ${history.length-i}</h3><p>Penulis: ${esc(authorName(old))} · Tanggal ulasan: ${esc(dateLabel(old.date,{year:'numeric'}))} · Rating: ${hasRating(old.rating)?`${old.rating}/5`:'N/A'}<br>Diamati: ${esc(timeLabel(old.observedAt))} · Terakhir terlihat: ${esc(timeLabel(old.lastSeenAt || old.observedAt))}</p>${old.title?`<p class="detail-title">${esc(old.title)}</p>`:''}<div class="detail-text">${esc(old.text || 'N/A')}</div><p>Label: ${esc(labelMethod(old))}</p></li>`).join('')}</ol></details>`:''}</div></div><div class="dialog-footer"><small>Isi ulasan merupakan pernyataan pengguna.</small>${url?`<a class="btn" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Buka sumber asli ${icon('external')}</a>`:'<small>Tautan HTTPS sumber tidak tersedia.</small>'}</div>`;
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
  catch { throw new Error(`Respons server bukan JSON yang valid (HTTP ${response.status}).`); }
  if (!response.ok) {
    const message=typeof payload?.error==='string'?payload.error:typeof payload?.message==='string'?payload.message:typeof payload?.error?.message==='string'?payload.error.message:`Permintaan gagal (HTTP ${response.status}).`;
    throw new Error(message);
  }
  if (!payload || !Array.isArray(payload.reviews) || !Array.isArray(payload.sources) || !Array.isArray(payload.runs) || typeof payload.running!=='boolean' || !(payload.lastRun===null || (payload.lastRun && typeof payload.lastRun==='object'))) {
    throw new Error('Format dataset server tidak sesuai kontrak; data saat ini tetap dipertahankan.');
  }
  return payload;
}
function applyPayload(payload) {
  reviews=payload.reviews;
  sync.sources=payload.sources; sync.lastRun=payload.lastRun; sync.runs=payload.runs; sync.running=payload.running; sync.loaded=true; sync.error='';
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
    sync.error=`${sync.loaded?'Status server tidak dapat diperbarui.':'Dataset server gagal dimuat; seed snapshot digunakan.'} ${error instanceof Error?error.message:'Kesalahan tidak dikenal.'}`;
    sync.running=false;
    if (sync.attempt?.status==='running') sync.attempt={...sync.attempt,status:'error',finishedAt:new Date().toISOString()};
  } finally {
    sync.loading=false; sync.requesting=false; render(); scheduleRefresh();
  }
}
async function analyze() {
  if (isBusy() || sync.requesting) return;
  clearTimeout(refreshTimer);
  sync.busy=true; sync.requesting=true;
  sync.attempt={startedAt:new Date().toISOString(),finishedAt:null,status:'running'};
  render();
  try { applyPayload(await requestData('/api/analyze','POST')); }
  catch (error) {
    sync.running=false;
    sync.attempt={...sync.attempt,status:'error',finishedAt:new Date().toISOString()};
    sync.error=`Pengambilan gagal. ${error instanceof Error?error.message:'Kesalahan tidak dikenal.'}`;
  } finally {
    sync.busy=false; sync.requesting=false; render(); scheduleRefresh();
  }
}
document.addEventListener('click',event=>{
  const button=event.target.closest('button,a');
  if (!button || button.disabled) return;
  if (button.dataset.view) { navigate(button.dataset.view); return; }
  if (button.dataset.platform) { state.platform=button.dataset.platform; state.page=1; render(); return; }
  if (button.dataset.openPlatform) { clearReviewFilters(); state.platform=button.dataset.openPlatform; navigate('reviews'); return; }
  if (button.dataset.review) { openReview(button.dataset.review); return; }
  if (button.dataset.close==='detail-dialog') { $('#detail-dialog').close(); return; }
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
render();
void loadData();
