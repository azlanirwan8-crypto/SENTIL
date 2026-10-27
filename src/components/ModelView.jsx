import { useMemo } from 'react';
import {
  formatDateTime,
  formatDecimal,
  formatNumber,
  formatPercent,
  formatWeight,
  isNumber,
  platformLabel,
  toNumber,
} from '../lib/format.js';
import { EmptyState } from './EmptyState.jsx';
import { Signal } from './Signals.jsx';
import { Notice } from './Notices.jsx';
import { StoreMark } from './Brand.jsx';
import { IconDownload, IconExternal, IconInfo } from './icons.jsx';
import { SENTIMENT_SERIES, SERIES_COLORS, storeColor } from './charts/palette.js';

// Menu Metode memakai bahasa Indonesia, jadi label seri diambil dari peta lokal,
// bukan dari SENTIMENT_SERIES yang sudah berbahasa Inggris untuk menu lain.
const SERIES_LABELS_ID = {
  positive: 'Positif',
  neutral: 'Netral',
  negative: 'Negatif',
  unclassified: 'Tak terklas.',
};

// Aturan penerbitan sinyal dikirim model sebagai teks; peta ini hanya memberi judul Indonesianya.
const RULE_LABELS = {
  emission: 'Penerbitan',
  numbers: 'Angka',
  ranking: 'Urutan',
  silence: 'Bagian yang kosong',
  maxSignals: 'Anggaran tampil',
};

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'N/A';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${formatDecimal(bytes / 1024, 1)} KB`;
  return `${formatDecimal(bytes / (1024 * 1024), 2)} MB`;
}

function Panel({ title, meta, action, children, className = '' }) {
  return (
    <section className={`card flex min-w-0 flex-col ${className}`} aria-label={title}>
      <header className="flex min-h-[36px] flex-wrap items-center justify-between gap-2 border-b border-slate-800/70 px-4 py-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="label">{title}</h2>
          {meta && <span className="num truncate text-[10px] text-slate-400">{meta}</span>}
        </div>
        {action}
      </header>
      <div className="min-h-0 flex-1 p-3.5">{children}</div>
    </section>
  );
}

function Step({ index, title, detail, metric }) {
  return (
    <div className="min-w-0 border-slate-800/70 px-3.5 py-3.5">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[10px] font-bold text-accent">{index}</span>
        <p className="truncate text-[11px] font-bold text-slate-200">{title}</p>
      </div>
      <p className="mt-1 text-[10px] leading-relaxed text-slate-400">{detail}</p>
      <p className="num mt-1.5 border-t border-slate-800/70 pt-1.5 text-[10px] font-semibold text-slate-400">{metric}</p>
    </div>
  );
}

function ScoreScale({ metrics, labels }) {
  const lowMedian = toNumber(metrics.lowMedian);
  const highMedian = toNumber(metrics.highMedian);
  const threshold = toNumber(metrics.threshold);
  const margin = Math.max(0, toNumber(metrics.neutralMargin) || 0);
  if (![lowMedian, highMedian, threshold].every(Number.isFinite)) {
    return <EmptyState compact icon={IconInfo} title="Ambang belum terbentuk" body="Median kelas rendah dan tinggi belum tersedia pada korpus ini." />;
  }
  const values = [lowMedian, highMedian, threshold - margin, threshold + margin];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max(0.25, (max - min) * 0.18);
  const domainMin = min - pad;
  const domainMax = max + pad;
  const span = domainMax - domainMin || 1;
  const pos = value => Math.max(0, Math.min(100, ((value - domainMin) / span) * 100));
  const leftBand = pos(threshold - margin);
  const rightBand = pos(threshold + margin);

  return (
    <div>
      <div className="relative h-1.5 rounded-full bg-slate-800">
        <span className="absolute inset-y-0 left-0 rounded-l-full bg-neg/70" style={{ width: `${leftBand}%` }} />
        <span className="absolute inset-y-0 bg-neu/60" style={{ left: `${leftBand}%`, width: `${Math.max(0, rightBand - leftBand)}%` }} />
        <span className="absolute inset-y-0 right-0 rounded-r-full bg-pos/70" style={{ left: `${rightBand}%` }} />
        <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-slate-950 bg-slate-100" style={{ left: `${pos(threshold)}%` }} title={`Batas ${formatDecimal(threshold, 3)}`} />
        <span className="absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-neg" style={{ left: `${pos(lowMedian)}%` }} title={`Median 1–2★ ${formatDecimal(lowMedian, 3)}`} />
        <span className="absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-pos" style={{ left: `${pos(highMedian)}%` }} title={`Median 4–5★ ${formatDecimal(highMedian, 3)}`} />
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-slate-400">
        <span className="num">{formatDecimal(domainMin, 2)}</span>
        <span className="num">0</span>
        <span className="num">{formatDecimal(domainMax, 2)}</span>
      </div>

      <dl className="mt-3 grid grid-cols-4 gap-2 border-t border-slate-800/70 pt-3">
        {[
          ['Median 1–2★', formatDecimal(lowMedian, 3)],
          ['Batas', formatDecimal(threshold, 3)],
          ['Margin', `±${formatDecimal(margin, 3)}`],
          ['Median 4–5★', formatDecimal(highMedian, 3)],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</dt>
            <dd className="num mt-0.5 text-[12px] font-bold text-slate-200">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 border-t border-slate-800/70 pt-2.5">
        {SENTIMENT_SERIES.map(series => (
          <span key={series.key} className="inline-flex items-center gap-1.5 text-[10px] text-slate-400">
            <span className="h-1.5 w-1.5 rounded-[1px]" style={{ backgroundColor: series.color }} />
            {SERIES_LABELS_ID[series.key]} <span className="num font-bold text-slate-200">{formatNumber(labels[series.key])}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function TermColumn({ title, terms, tone }) {
  const maxAbs = Math.max(1, ...terms.map(term => Math.abs(toNumber(term.weight) || 0)));
  const color = tone === 'positive' ? SERIES_COLORS.positive : SERIES_COLORS.negative;
  return (
    <div className="min-w-0">
      <p className="label-sm flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-[1px]" style={{ backgroundColor: color }} /> {title}
      </p>
      {terms.length ? (
        <ul className="mt-1.5">
          {terms.map((term, index) => (
            <li key={term.term} className="grid grid-cols-[16px_minmax(52px,0.9fr)_1fr_42px] items-center gap-2 border-b border-slate-800/60 py-1 last:border-0">
              <span className="num text-[10px] text-slate-400">{String(index + 1).padStart(2, '0')}</span>
              <span className="truncate font-mono text-[10px] font-semibold text-slate-300" title={`${term.term} · ${formatNumber(term.highReviews)} ulasan tinggi · ${formatNumber(term.lowReviews)} ulasan rendah`}>{term.term}</span>
              <span className="relative h-1 overflow-hidden rounded-full bg-slate-800">
                <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(Math.abs(toNumber(term.weight)) / maxAbs) * 100}%`, backgroundColor: color }} />
              </span>
              <span className="num text-right text-[10px] font-bold" style={{ color }}>{formatWeight(term.weight)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 rounded border border-dashed border-slate-800 px-2 py-3 text-center text-[10px] text-slate-400">Belum ada istilah berbobot ini.</p>
      )}
    </div>
  );
}

function AuditPanel({ channel, store, workspaceStore }) {
  const selected = Boolean(workspaceStore?.appId);
  const app = channel?.app || null;
  const coverage = channel?.coverage || null;
  const cache = channel?.cache || null;
  const histogram = Array.isArray(app?.ratingHistogram) && app.ratingHistogram.length === 5 ? app.ratingHistogram : null;
  const coveragePairs = !coverage ? [] : store === 'play'
    ? [['Halaman', coverage.pages], ['Baris', coverage.rows], ['Duplikat', coverage.duplicates], ['Dibuang', coverage.skipped], ['Lewat karena sudah tersimpan', coverage.olderSkipped], ['Penanda tanggal', coverage.since ? formatDateTime(coverage.since) : 'tidak ada'], ['Batas sampel', coverage.sampleLimit == null ? 'tidak ada' : coverage.sampleLimit]]
    : [['Halaman', coverage.shelfPages], ['Feed', coverage.feedPages], ['Ulasan halaman', coverage.shelfReviews], ['Ulasan feed', coverage.feedReviews], ['Berbagi', coverage.sharedReviews], ['Dibuang', coverage.skipped], ['Lewat karena sudah tersimpan', coverage.olderSkipped]];

  return (
    <div className="min-w-0 p-3">
      <div className="flex items-center gap-2">
        <StoreMark store={store} size={20} tone="quiet" />
        <p className="truncate text-[11px] font-bold text-slate-200">{platformLabel(store)}</p>
        <span className="font-mono text-[10px] text-slate-400">{workspaceStore?.appId || channel?.appId || 'N/A'}</span>
        <span className={`pill ml-auto ${channel?.status === 'success' ? 'border-pos/25 bg-pos/10 text-pos' : channel?.status === 'error' ? 'border-neg/25 bg-neg/10 text-neg' : 'border-slate-700 bg-slate-800/70 text-slate-400'}`}>
          {selected ? channel?.status || 'n/a' : 'tidak disertakan'}
        </span>
      </div>
      {selected && channel ? (
        <>
          <dl className="mt-2.5 grid grid-cols-3 gap-2 border-t border-slate-800/70 pt-2.5">
            {[
              ['Skor', formatDecimal(app?.score, 2)],
              ['Penilaian', formatNumber(app?.ratingCount ?? app?.ratings)],
              ['Terbaca', formatNumber(channel.fetched)],
              ['Dilaporkan', formatNumber(app?.reviewCountReported ?? coverage?.reportedReviewCount)],
              ['Instalasi', app?.installs || 'N/A'],
              ['Cache', cache ? `${cache.hit ? 'hit' : 'baru'} · ${formatDateTime(cache.fetchedAt)}` : 'N/A'],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</dt>
                <dd className="num mt-0.5 truncate text-[11px] font-bold text-slate-300">{value}</dd>
              </div>
            ))}
          </dl>
          {histogram && (
            <div className="mt-2.5 flex flex-wrap gap-1 border-t border-slate-800/70 pt-2.5">
              {histogram.map((count, index) => (
                <span key={index} className="chip">
                  <span className="font-bold text-slate-300">{5 - index}★</span> {formatNumber(count)}
                </span>
              ))}
            </div>
          )}
          {coveragePairs.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {coveragePairs.map(([label, value]) => (
                <span key={label} className="text-[10px] text-slate-400">
                  {label} <span className="num font-semibold text-slate-400">{value == null ? 'N/A' : typeof value === 'number' ? formatNumber(value) : String(value)}</span>
                </span>
              ))}
            </div>
          )}
          <details className="mt-2 border-t border-slate-800/70 pt-2">
            <summary className="cursor-pointer text-[10px] font-semibold text-slate-400 hover:text-slate-200">Catatan sumber</summary>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-400">{channel.message}</p>
          </details>
        </>
      ) : (
        <p className="mt-2.5 rounded border border-dashed border-slate-800 px-2 py-3 text-[10px] text-slate-400">
          Kanal tidak dipilih saat analisis dibuat. Tidak ada metrik yang ditampilkan.
        </p>
      )}
    </div>
  );
}

export function ModelView({ dataset, workspace, db, onExport }) {
  const model = dataset.model || {};
  const metrics = model.metrics || {};
  const labels = model.labels || { positive: 0, neutral: 0, negative: 0, unclassified: 0 };
  const topics = Array.isArray(model.topics) ? model.topics : [];
  const pain = model.painPoints || {};
  const painLabels = Array.isArray(pain.labels) && pain.labelRules ? pain.labels : [];
  const aiNames = pain.naming?.status === 'named' ? pain.naming.names || {} : null;
  const labelMetrics = pain.labelMetrics || {};
  const signals = model.signals || null;
  const signalItems = Array.isArray(signals?.items) ? signals.items : [];
  const terms = model.terms || {};
  const coverage = model.coverage || {};
  const languages = model.languages || { total: 0, counts: {} };
  const taxonomy = model.taxonomy || {};
  const channels = Array.isArray(dataset.channels) ? dataset.channels : [];
  const byId = new Map(channels.map(channel => [channel.id, channel]));
  const exportButton = (
    <button type="button" onClick={onExport} className="btn btn-secondary btn-xs">
      <IconDownload size={12} /> Ekspor JSON
    </button>
  );

  const snapshotBytes = useMemo(() => {
    try {
      return new Blob([JSON.stringify(dataset)]).size;
    } catch {
      return null;
    }
  }, [dataset]);

  return (
    <div className="space-y-3">
      {model.status !== 'ready' && (
        <Notice tone="amber" title="Model belum siap" live>
          Korpus belum punya cukup ulasan berating rendah dan tinggi untuk mempelajari pembeda kata. Angka yang ada tetap ditampilkan apa adanya.
        </Notice>
      )}

      <section className="card overflow-hidden" aria-label="Pipeline mesin">
        <header className="flex min-h-[36px] flex-wrap items-center justify-between gap-2 border-b border-slate-800/70 px-4 py-2">
          <div className="flex items-baseline gap-2">
            <h2 className="label">Pipeline mesin</h2>
            <span className="text-[10px] text-slate-400">otonom · bobot dipelajari dari korpus · nama topik dari kamus domain bilingual</span>
          </div>
          {exportButton}
        </header>
        <div className="grid gap-0 sm:grid-cols-2 xl:grid-cols-4 xl:divide-x divide-slate-800/70">
          <Step
            index="01"
            title="Normalisasi regex"
            detail="HTML, emoji, tautan, dan huruf berulang tiga kali ke atas diringkas sebelum dihitung."
            metric={`${formatNumber(metrics.vocabulary)} tipe token · ${formatNumber(coverage.withText)} dokumen berteks`}
          />
          <Step
            index="02"
            title="Deteksi bahasa"
            detail="Profil kata tugas memisahkan Indonesia dan Inggris per ulasan, tanpa model bahasa. Kata serapan yang dipakai dua bahasa ('update', 'app') sengaja tidak dihitung sebagai penanda."
            metric={languages.total
              ? `${formatNumber(languages.counts.id)} ID · ${formatNumber(languages.counts.en)} EN · ${formatNumber(languages.counts.mixed)} campuran`
              : 'belum ada bahasa yang tercatat di snapshot ini'}
          />
          <Step
            index="03"
            title="Pemisah kosakata"
            detail="Suatu istilah dianggap beban kosakata hanya kalau bobotnya tidak bisa dibedakan dari nol pada korpus ini. Tidak ada fraksi frekuensi dan tidak ada daftar kata."
            metric={`${formatNumber(metrics.informativeTerms)} informatif · ${formatNumber(metrics.nonInformativeTerms)} beban kosakata`}
          />
          <Step
            index="04"
            title="Bobot korelasi bintang"
            detail="Rasio kemunculan 4–5★ terhadap 1–2★ dengan smoothing Jeffreys dan penyusutan dukungan."
            metric={`${formatNumber(metrics.learnedTerms)} istilah · ${formatNumber(coverage.lowRatings)} rendah vs ${formatNumber(coverage.highRatings)} tinggi`}
          />
          <Step
            index="05"
            title="Topik dari kamus domain"
            detail="Nama topik diambil dari kamus fitur produk yang dituliskan tangan dalam dua bahasa, bukan dari kata yang kebetulan sering muncul. Kosakata halaman toko tetap dihitung dan dilaporkan, tetapi tidak lagi boleh menamai sesuatu."
            metric={`${formatNumber(topics.length)} topik dilaporkan dari ${formatNumber(taxonomy.defined || 0)} definisi · ${formatNumber(coverage.topicReviews)} ulasan menyebut minimal satu topik`}
          />
          <Step
            index="06"
            title="Gerombol frasa jadi label"
            detail="Frasa 2–4 token yang benar-benar ditulis reviewers digabung hanya kalau ulasan yang memuat keduanya melampaui kebetulan. Namanya diambil dari kata jangkar yang dijagokan lebih dari satu anggota, dan arah dihitung dari rentang tanggal yang teramati."
            metric={`${formatNumber(labelMetrics.clusters || 0)} gerombol · ${formatNumber(labelMetrics.namedFromTerm || 0)} nama dari jangkar · ${formatNumber(labelMetrics.trimmedLabels || 0)} terpangkas`}
          />
          <Step
            index="07"
            title="Tulis sinyal dari hasil ukur"
            detail="Tiap baris analisis ditulis mesin dari dua proporsi yang dibandingkan: kalau selisihnya tidak lebih besar daripada simpangan baku selisih itu, barisnya tidak ada. Tidak ada kalimat yang dirangkai manusia atau model bahasa."
            metric={signals
              ? `${formatNumber(signals.metrics?.reported || 0)} dari ${formatNumber(signals.metrics?.candidates || 0)} kandidat lolos uji`
              : 'lapisan sinyal belum ada di snapshot ini'}
          />
        </div>
      </section>

      <Panel
        title="Sinyal analis"
        meta={signals
          ? `${formatNumber(signals.metrics?.reported || 0)} tampil · ${formatNumber(signals.metrics?.candidates || 0)} kandidat · ${signals.status === 'ready' ? 'label tersedia' : 'belum ada label'}`
          : 'belum ada di snapshot ini'}
        action={<span className="hidden text-[10px] text-slate-400 sm:inline">kalimatnya data: ditulis mesin, angka-angkanya ikut terkirim</span>}
      >
        {signalItems.length ? (
          <>
            <ul className="grid items-start gap-2 md:grid-cols-2 xl:grid-cols-3">
              {signalItems.map(item => <Signal key={item.id} item={item} />)}
            </ul>
            <dl className="mt-3 grid gap-x-4 gap-y-2 border-t border-slate-800/70 pt-2.5 sm:grid-cols-2">
              {Object.entries(signals.rules || {}).map(([key, value]) => (
                <div key={key}>
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{RULE_LABELS[key] || key}</dt>
                  <dd className="mt-0.5 text-[10px] leading-relaxed text-slate-400">{typeof value === 'number' ? formatNumber(value) : String(value)}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
              Teks sinyal memakai bahasa Inggris karena ia bagian dari data yang dihitung di server, sama seperti
              nama kanal dan frasa reviewers. {signals.metrics?.trimmed
                ? `${formatNumber(signals.metrics.trimmed)} kandidat di luar anggaran tampil tetap dihitung di angka kandidat.`
                : 'Tidak ada kandidat yang dipangkas.'}{' '}
              Basis hitungan: {formatNumber(signals.basis?.reviews || 0)} ulasan, pool keluhan {formatNumber(signals.basis?.negativePool || 0)}, pool pujian {formatNumber(signals.basis?.positivePool || 0)}
              {signals.basis?.trend ? `, rentang arah ${signals.basis.trend.firstDay} sampai ${signals.basis.trend.lastDay}` : ''}.
            </p>
          </>
        ) : (
          <EmptyState
            compact
            icon={IconInfo}
            title={signals ? 'Belum ada pembacaan yang lolos uji' : 'Snapshot ini dibuat sebelum lapisan sinyal'}
            body={signals
              ? `Korpus menghasilkan ${formatNumber(signals.basis?.labels || 0)} label, tetapi tidak satu pun selisih proporsi yang bisa dibedakan dari kebetulan. Panel kosong di sini adalah hasilnya, bukan kegagalannya.`
              : `Model tersimpan oleh ${model.version || 'versi lama'}, yang belum menulis lapisan sinyal. Tarik ulang project ini untuk membuatnya dari angka yang sama.`}
          />
        )}
      </Panel>

      <div className="grid gap-3 xl:grid-cols-12">
        <Panel title="Batas label" meta={`${formatNumber(coverage.analyzed)} dianalisis`} className="xl:col-span-7">
          <ScoreScale metrics={metrics} labels={labels} />
        </Panel>

        <Panel title="Mutu sinyal" className="xl:col-span-5">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            {[
              ['AUC in-sample', formatDecimal(metrics.inSampleAuc, 3), 'bukan akurasi luar sampel'],
              ['Separasi median', formatDecimal(metrics.separation, 2), 'jarak dua kelas bintang'],
              ['Batas cekaman bobot', formatDecimal(metrics.weightLimit, 3), 'kuantil empirik korpus ini'],
              ['Penyusutan dukungan', `n/(n+${formatNumber(metrics.supportShrinkage)})`, 'konvensi statistik, bukan kamus'],
              ['Smoothing', metrics.smoothing || 'N/A', 'Jeffreys untuk kelas tidak seimbang'],
            ].map(([label, value, note]) => (
              <div key={label}>
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</dt>
                <dd className="num mt-0.5 text-lg font-extrabold tracking-tight text-slate-100">{value}</dd>
                <dd className="mt-0.5 text-[10px] leading-snug text-slate-400">{note}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 border-t border-slate-800/70 pt-2.5 font-mono text-[10px] leading-relaxed text-slate-400">
            w = clamp(ln(P(kata|4–5★)/P(kata|1–2★)) × dukungan, −4, +4)
          </p>
          <ul className="mt-2 space-y-1">
            {[
              'Bintang = sinyal lemah, bukan label emas.',
              'AUC dihitung pada data yang sama membentuk bobot.',
              'NSS = selisih porsi label, bukan probabilitas.',
            ].map(note => (
              <li key={note} className="flex items-start gap-1.5 text-[10px] leading-relaxed text-slate-400">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-700" />
                {note}
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="Kosakata terpelajar" meta="bobot · dukungan" action={<span className="text-[10px] text-slate-400">dipelajari dari korpus ini saja</span>}>
        <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
          <TermColumn title="Condong ke bintang 4–5" terms={Array.isArray(terms.positive) ? terms.positive : []} tone="positive" />
          <TermColumn title="Condong ke bintang 1–2" terms={Array.isArray(terms.negative) ? terms.negative : []} tone="negative" />
        </div>
        <div className="mt-3 border-t border-slate-800/70 pt-3">
          <p className="label-sm">Beban kosakata — bobotnya tidak bisa dibedakan dari nol</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {(terms.stopwords || []).length ? terms.stopwords.map(entry => (
              <span key={entry.term} className="rounded bg-slate-800/60 px-1.5 py-0.5 font-mono text-[10px] text-slate-400" title={`${formatNumber(entry.count)} kemunculan`}>
                {entry.term} <span className="num opacity-70">{formatNumber(entry.count)}×</span>
              </span>
            )) : <span className="text-[10px] text-slate-400">Belum ada.</span>}
          </div>
        </div>
      </Panel>

      <Panel
        title="Topik keluhan"
        meta={`${formatNumber(topics.length)} topik dari ${formatNumber(taxonomy.defined || 0)} definisi kamus`}
        action={<span className="hidden text-[10px] text-slate-400 sm:inline">nama dari kamus domain dua bahasa, bukan dari kata yang sering muncul</span>}
      >
        {topics.length ? (
          <div className="scroll-x">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <caption className="sr-only">Topik keluhan: nama kamus Indonesia dan Inggris, klaster fitur, kata yang benar-benar ditulis reviewers, jumlah ulasan 1–2 bintang, porsi dari pool keluhan, jumlah ulasan 4–5 bintang yang menyebut kata sama, dan berapa persen seluruh sebutan topik itu berupa keluhan</caption>
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <th scope="col" className="pb-2 pr-2 font-bold">#</th>
                  <th scope="col" className="pb-2 pr-2 font-bold">Topik</th>
                  <th scope="col" className="pb-2 pr-2 font-bold">Klaster</th>
                  <th scope="col" className="pb-2 pr-2 font-bold">Kata yang ditulis reviewers</th>
                  <th scope="col" className="pb-2 pr-2 text-right font-bold">Keluhan</th>
                  <th scope="col" className="pb-2 pr-2 text-right font-bold">Porsi</th>
                  <th scope="col" className="pb-2 pr-2 text-right font-bold">Pujian</th>
                  <th scope="col" className="pb-2 text-right font-bold">Keluhan / sebutan</th>
                </tr>
              </thead>
              <tbody>
                {topics.map((topic, index) => (
                  <tr key={topic.id} className="border-t border-slate-800/60">
                    <td className="num py-2 pr-2 text-[10px] text-slate-400">{String(index + 1).padStart(2, '0')}</td>
                    <td className="py-2 pr-2">
                      <span className="tag font-mono">{topic.name}</span>
                      <span className="block truncate text-[10px] text-slate-400" title="Nama Indonesia dari kamus yang sama">{topic.nameId}</span>
                    </td>
                    <td className="py-2 pr-2 align-top text-[10px] text-slate-300">
                      {topic.clusterName?.en || 'N/A'}
                      <span className="block text-slate-400">{topic.clusterName?.id || ''}</span>
                    </td>
                    <td className="py-2 pr-2 align-top">
                      <span className="block truncate font-mono text-[10px] text-slate-400" title={(topic.matchedTerms || []).map(entry => `${entry.term} ×${entry.count}`).join(' · ')}>
                        {(topic.matchedTerms || []).slice(0, 4).map(entry => entry.term).join(', ') || 'N/A'}
                        {(topic.matchedTerms || []).length > 4 ? ` · +${(topic.matchedTerms || []).length - 4} lagi` : ''}
                      </span>
                    </td>
                    <td className="num py-2 pr-2 text-right text-[11px] font-bold text-slate-200">{formatNumber(topic.low)}</td>
                    <td className="num py-2 pr-2 text-right text-[10px] text-slate-400">{formatPercent(topic.share, 100)}</td>
                    <td className="num py-2 pr-2 text-right text-[10px] text-slate-400">{formatNumber(topic.high)}</td>
                    <td className="num py-2 text-right text-[10px] text-slate-400">
                      {isNumber(topic.complaintRate) ? `${Math.round(toNumber(topic.complaintRate))}%` : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
              Kolom <span className="font-semibold text-slate-300">Keluhan</span> dan <span className="font-semibold text-slate-300">Pujian</span> adalah jumlah
              ulasan yang benar-benar memuat kata topik itu pada bintang 1–2 dan 4–5; satu ulasan bisa dihitung di beberapa topik karena satu ulasan bisa menyebut beberapa fitur.
              Kolom terakhir membandingkan keduanya dengan seluruh sebutan topik, jadi angka kecil berarti topiknya juga disebut orang yang puas.
              {taxonomy.reported === 0 ? '' : ` ${formatNumber(taxonomy.reported || 0)} topik dilaporkan dan ${formatNumber(taxonomy.unmatchedReviews || 0)} ulasan berteks tidak cocok dengan satu pun definisi kamus — ulasan itu tetap dihitung di seluruh angka, hanya tidak berpura-pura punya topik.`}{' '}
              Kosakata yang ditulis penerbit di halaman tokonya sendiri tetap diukur — <span className="num">{formatNumber(metrics.listingTopicCount || 0)}</span> istilah tersimpan di model sebagai bukti — tetapi lapisan itu tidak lagi boleh menamai satu pun baris tabel ini.
            </p>
          </div>
        ) : (
          <EmptyState compact icon={IconInfo} title="Belum ada topik" body="Tidak ada ulasan yang memuat kata fitur dari kamus domain dua bahasa. Tidak ada baris yang dipaksa masuk topik demi mengisi tabel ini." />
        )}
      </Panel>

      <Panel
        title="Gerombol label keluhan"
        meta={painLabels.length
          ? `${formatNumber(labelMetrics.clusters || painLabels.length)} gerombol · ${formatNumber(labelMetrics.links)} ikatan · ${formatNumber(labelMetrics.singletons)} beranggota satu`
          : `${formatNumber(pain.metrics?.reportedPhrases || 0)} frasa dipelajari`}
        action={<span className="hidden text-[10px] text-slate-400 sm:inline">nama label = kata jangkar dari frasa reviewers</span>}
      >
        {painLabels.length ? (
          <div className="scroll-x">
            <table className="w-full min-w-[820px] border-collapse text-left">
              <caption className="sr-only">Gerombol label keluhan: nama yang dipilih mesin dari kata jangkar anggota, frasa bukti, jumlah frasa anggota, jumlah mention, jumlah ulasan berbeda, porsi dari pool 1–2 bintang, pujian 4–5 bintang yang menyebut frasa yang sama, arah laju harian paruh kedua terhadap paruh pertama, dan kanal yang paling banyak memuat label itu</caption>
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <th scope="col" className="pb-2 pr-2 font-bold">#</th>
                  <th scope="col" className="pb-2 pr-2 font-bold">Label</th>
                  <th scope="col" className="pb-2 pr-2 font-bold">Kategori</th>
                  <th scope="col" className="pb-2 pr-2 text-right font-bold">Frasa</th>
                  <th scope="col" className="pb-2 pr-2 text-right font-bold">Mention</th>
                  <th scope="col" className="pb-2 pr-2 text-right font-bold">Ulasan beda</th>
                  <th scope="col" className="pb-2 pr-2 text-right font-bold">Porsi</th>
                  <th scope="col" className="pb-2 pr-2 text-right font-bold">Pujian</th>
                  <th scope="col" className="pb-2 pr-2 text-right font-bold">Arah</th>
                  <th scope="col" className="pb-2 text-right font-bold">Kanal</th>
                </tr>
              </thead>
              <tbody>
                {painLabels.map((entry, index) => (
                  <tr key={entry.id} className="border-t border-slate-800/60">
                    <td className="num py-2 pr-2 text-[10px] text-slate-400">{String(index + 1).padStart(2, '0')}</td>
                    <td className="py-2 pr-2">
                      <span className={`tag ${entry.nameSource === 'term' ? 'capitalize' : 'font-mono'}`}>{entry.name}</span>
                      <p className="mt-0.5 truncate text-[10px] text-slate-400" title={entry.phrases.map(phrase => phrase.text).join(' · ')}>
                        {entry.phrases.slice(0, 3).map(phrase => phrase.text).join(' · ')}
                        {entry.phrases.length > 3 ? ` · +${entry.phrases.length - 3} lagi` : ''}
                      </p>
                    </td>
                    <td className="py-2 pr-2 align-top text-[10px]">
                      {aiNames?.[entry.id]?.category
                        ? <span title={`Kategori diberi nama oleh ${pain.naming.model} berdasar frasa di baris ini; seluruh angka di baris ini tetap pengukuran mesin`}><span className="font-semibold text-slate-200">{aiNames[entry.id].category}</span><span className="block truncate text-slate-400">{aiNames[entry.id].subLabel || 'nama model'}</span></span>
                        : entry.category
                          ? <span title={`Nama topik kamus domain yang lebih padat di gerombol ini daripada di keluhan lain (${formatNumber(entry.category.inside)} dari ${formatNumber(entry.reviewCount)} ulasan gerombol)`}><span className="font-semibold text-slate-300">{entry.category.name}</span><span className="block text-slate-400">dari kamus domain</span></span>
                          : <span className="text-slate-400" title="Belum ada penamaan yang lolos uji bukti untuk gerombol ini">N/A</span>}
                    </td>
                    <td className="num py-2 pr-2 text-right text-[11px] text-slate-200">{formatNumber(entry.phraseCount)}</td>
                    <td className="num py-2 pr-2 text-right text-[10px] text-slate-400">{formatNumber(entry.phrases.reduce((sum, phrase) => sum + phrase.dfNegative, 0))}</td>
                    <td className="num py-2 pr-2 text-right text-[11px] font-bold text-slate-100">{formatNumber(entry.reviewCount)}</td>
                    <td className="num py-2 pr-2 text-right text-[10px] text-slate-400">{formatPercent(entry.reviewCount, pain.pools?.negative || 0)}</td>
                    <td className="num py-2 pr-2 text-right text-[10px] text-slate-400">{entry.praiseCount == null ? 'N/A' : formatNumber(entry.praiseCount)}</td>
                    <td className="num py-2 pr-2 text-right text-[10px] text-slate-300">
                      {Number.isFinite(entry.momentum)
                        ? <span title={`${formatNumber(entry.late)} ulasan di paruh kedua vs ${formatNumber(entry.early)} di paruh pertama`}>{entry.momentum.toFixed(2)}×/hari</span>
                        : 'N/A'}
                    </td>
                    <td className="num py-2 text-right text-[10px] text-slate-300">
                      {entry.channels?.length
                        ? (
                          <span title={`${formatNumber(entry.channels[0].count)} dari ${formatNumber(entry.channels[0].pool)} keluhan ${platformLabel(entry.channels[0].id)}`}>
                            {platformLabel(entry.channels[0].id)} {formatPercent(entry.channels[0].count, entry.channels[0].pool)}
                          </span>
                        )
                        : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2.5 border-t border-slate-800/70 pt-2 text-[10px] leading-relaxed text-slate-400">
              Kolom <span className="font-semibold text-slate-300">Mention</span> adalah penjumlahan setiap frasa anggotanya; kolom{' '}
              <span className="font-semibold text-slate-300">Ulasan beda</span> adalah jumlah ulasan yang sebenarnya. Selisihnya adalah orang yang sama
              yang dihitung berulang — tidak pernah ditampilkan sebagai temuan.{' '}
              {labelMetrics.trimmedLabels
                ? `${formatNumber(labelMetrics.trimmedLabels)} gerombol di luar anggaran tampil tetap dihitung dan dilaporkan di angka ini. `
                : 'Seluruh gerombol muat di anggaran tampil. '}
              {formatNumber(labelMetrics.namedFromTerm || 0)} dari {formatNumber(painLabels.length)} nama label adalah kata jangkar yang dijagokan lebih dari satu anggotanya; sisanya memakai frasa utuh apa adanya.{' '}
              {pain.labelRules?.link || 'Dua frasa digabung hanya kalau ulasan yang memuat keduanya melampaui kebetulan.'}{' '}
              {pain.labelRules?.closure || 'Gabungan diterima hanya kalau seluruh silangan anggotanya lolos uji, jadi gerombol tidak menyatu karena rantai.'}{' '}
              Arah dihitung dari {pain.labelMetrics?.trend ? `rentang ${pain.labelMetrics.trend.firstDay} sampai ${pain.labelMetrics.trend.lastDay}` : 'rentang tanggal yang tidak tersedia'}.{' '}
              Kolom <span className="font-semibold text-slate-300">Kanal</span> adalah kanal yang paling banyak memuat label itu, dibaca sebagai porsi keluhan kanal tersebut.{' '}
              Kolom <span className="font-semibold text-slate-300">Kategori</span> punya dua sumber dan keduanya ditulis di barisnya: nama topik kamus domain yang lolos uji kepadatan
              ({pain.labelRules?.category || 'lebih dari satu ulasan gerombol memuatnya, dan porsinya beda nyata dari keluhan lain'}), atau nama yang diberi model bahasa
              ({pain.naming?.status === 'named' ? `${pain.naming.model} atas ${formatNumber(pain.naming.clusters || 0)} gerombol, ${formatNumber(painLabels.filter(entry => pain.naming.names?.[entry.id]?.category).length)} baris tampil bernama model` : `lapisan penamaan berstatus ${pain.naming?.status || 'belum ada di snapshot ini'}${pain.naming?.reason ? ` — ${pain.naming.reason}` : ''}`}).
              {' '}Yang tidak pernah terjadi: angka ikut menamai atau ikut dinamai — seluruh kolom jumlah, porsi, pujian, arah, dan kanal tetap pengukuran mesin.
            </p>
          </div>
        ) : (
          <EmptyState
            compact
            icon={IconInfo}
            title={pain.labelRules ? 'Belum ada ikatan antar frasa' : 'Snapshot ini dibuat sebelum lapisan label'}
            body={pain.labelRules
              ? `${formatNumber(pain.metrics?.matchedReviews || 0)} ulasan 1–2★ memuat minimal satu frasa tersimpan, tetapi tidak ada pasangan frasa yang muncul bersama melampaui kebetulan. Tidak ada kategori yang dikarang untuk mengisi tabel ini.`
              : `Frasa tersimpan oleh ${pain.version || 'versi lama'}, yang belum punya langkah penggerombolan. Tarik ulang project ini untuk membentuk label dari frasa yang sama.`}
          />
        )}
      </Panel>

      <section className="card overflow-hidden" aria-label="Audit kanal">
        <header className="flex min-h-[36px] items-center justify-between gap-2 border-b border-slate-800/70 px-4 py-2">
          <h2 className="label">Audit kanal &amp; cache</h2>
          <span className="num text-[10px] text-slate-400">cache {formatNumber((dataset.cache?.ttlMs || 0) / 60000)} menit · penarikan berikutnya berhenti di ulasan yang sudah tersimpan</span>
        </header>
        <div className="grid gap-0 md:grid-cols-2 md:divide-x divide-slate-800/70">
          {['play', 'appstore'].map(store => (
            <AuditPanel key={store} store={store} channel={byId.get(store)} workspaceStore={workspace.stores?.[store]} />
          ))}
        </div>
      </section>

      <Panel title="Ruang kerja" meta={db?.enabled ? 'database server · id aktif di peramban' : 'sesi ini · tanpa database'} action={exportButton}>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-4">
          {[
            ['Nama', workspace.label],
            ['Entitas', workspace.entity],
            ['Dibuat', formatDateTime(workspace.createdAt)],
            ['Snapshot', formatDateTime(dataset.fetchedAt)],
            ['Mesin', dataset.engine?.version || 'N/A'],
            ['Supervisi', dataset.engine?.supervision === 'weak-rating' ? 'sinyal bintang lemah' : dataset.engine?.supervision || 'N/A'],
            ['Kamus topik', dataset.engine?.dictionary && dataset.engine.dictionary !== 'none' ? dataset.engine.dictionary : 'tidak ada di snapshot ini'],
            ['Deteksi bahasa', languages.version || 'tidak ada di snapshot ini'],
            ['Ukuran', formatBytes(snapshotBytes)],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</dt>
              <dd className="mt-0.5 truncate text-[11px] font-bold text-slate-300" title={String(value)}>{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-800/70 pt-2.5">
          <p className="text-[10px] leading-relaxed text-slate-400">
            Ekspor JSON memuat seluruh ulasan, analisis per baris, model, dan metadata kanal — tanpa potongan sampel. Tidak ada jalur impor.
          </p>
          {workspace.stores?.play?.url && (
            <a href={workspace.stores.play.url} target="_blank" rel="noopener noreferrer" className="link-quiet ml-auto text-[10px]">
              halaman toko <IconExternal size={10} />
            </a>
          )}
        </div>
        <p className="mt-2 font-mono text-[10px] text-slate-400">workspace {workspace.id}</p>
      </Panel>
    </div>
  );
}
