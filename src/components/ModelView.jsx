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
import { bilingual, bilingualAlias, t, topicAlias, topicLabel } from '../lib/i18n.js';
import { AnalystBadge, aiText } from './Analyst.jsx';
import { EmptyState } from './EmptyState.jsx';
import { Signal, signalAreaLookup } from './Signals.jsx';
import { Notice } from './Notices.jsx';
import { StoreMark } from './Brand.jsx';
import { IconDownload, IconExternal, IconInfo } from './icons.jsx';
import { SENTIMENT_SERIES, SERIES_COLORS, storeColor } from './charts/palette.js';

// Panel Metode menulis literalsnya dalam bahasa Indonesia. Tabel i18n dibaca dua arah, jadi
// label seri di bawah adalah sisi Indonesia dari pasangan yang sama dengan SENTIMENT_SERIES —
// menu lain mengirim sisi Inggrisnya dan keduanya bertemu di terjemahan yang sama.
const SERIES_LABELS_ID = {
  positive: 'Positif',
  neutral: 'Netral',
  negative: 'Negatif',
  unclassified: 'Tak terklasifikasi',
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
    return <EmptyState compact icon={IconInfo} title={t('Ambang belum terbentuk')} body={t('Median kelas rendah dan tinggi belum tersedia pada korpus ini.')} />;
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
        <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-slate-950 bg-slate-100" style={{ left: `${pos(threshold)}%` }} title={`${t('Batas')} ${formatDecimal(threshold, 3)}`} />
        <span className="absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-neg" style={{ left: `${pos(lowMedian)}%` }} title={`${t('Median 1–2★')} ${formatDecimal(lowMedian, 3)}`} />
        <span className="absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-pos" style={{ left: `${pos(highMedian)}%` }} title={`${t('Median 4–5★')} ${formatDecimal(highMedian, 3)}`} />
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-slate-400">
        <span className="num">{formatDecimal(domainMin, 2)}</span>
        <span className="num">0</span>
        <span className="num">{formatDecimal(domainMax, 2)}</span>
      </div>

      <dl className="mt-3 grid grid-cols-4 gap-2 border-t border-slate-800/70 pt-3">
        {[
          [t('Median 1–2★'), formatDecimal(lowMedian, 3)],
          [t('Batas'), formatDecimal(threshold, 3)],
          [t('Margin'), `±${formatDecimal(margin, 3)}`],
          [t('Median 4–5★'), formatDecimal(highMedian, 3)],
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
            {t(SERIES_LABELS_ID[series.key])} <span className="num font-bold text-slate-200">{formatNumber(labels[series.key])}</span>
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
              <span className="truncate font-mono text-[10px] font-semibold text-slate-300" title={`${term.term} · ${formatNumber(term.highReviews)} ${t('ulasan tinggi')} · ${formatNumber(term.lowReviews)} ${t('ulasan rendah')}`}>{term.term}</span>
              <span className="relative h-1 overflow-hidden rounded-full bg-slate-800">
                <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(Math.abs(toNumber(term.weight)) / maxAbs) * 100}%`, backgroundColor: color }} />
              </span>
              <span className="num text-right text-[10px] font-bold" style={{ color }}>{formatWeight(term.weight)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 rounded border border-dashed border-slate-800 px-2 py-3 text-center text-[10px] text-slate-400">{t('Belum ada istilah berbobot ini.')}</p>
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
    ? [[t('Halaman'), coverage.pages], [t('Baris'), coverage.rows], [t('Duplikat'), coverage.duplicates], [t('Dibuang'), coverage.skipped], [t('Lewat karena sudah tersimpan'), coverage.olderSkipped], [t('Penanda tanggal'), coverage.since ? formatDateTime(coverage.since) : t('tidak ada')], [t('Batas sampel'), coverage.sampleLimit == null ? t('tidak ada') : coverage.sampleLimit]]
    : [[t('Halaman'), coverage.shelfPages], [t('Feed'), coverage.feedPages], [t('Ulasan halaman'), coverage.shelfReviews], [t('Ulasan feed'), coverage.feedReviews], [t('Berbagi'), coverage.sharedReviews], [t('Dibuang'), coverage.skipped], [t('Lewat karena sudah tersimpan'), coverage.olderSkipped]];

  return (
    <div className="min-w-0 p-3">
      <div className="flex items-center gap-2">
        <StoreMark store={store} size={20} tone="quiet" />
        <p className="truncate text-[11px] font-bold text-slate-200">{platformLabel(store)}</p>
        <span className="font-mono text-[10px] text-slate-400">{workspaceStore?.appId || channel?.appId || 'N/A'}</span>
        <span className={`pill ml-auto ${channel?.status === 'success' ? 'border-pos/25 bg-pos/10 text-pos' : channel?.status === 'error' ? 'border-neg/25 bg-neg/10 text-neg' : 'border-slate-700 bg-slate-800/70 text-slate-400'}`}>
          {/* status kanal adalah kode dari data, bukan prosa — dibiarkan apa adanya */}
          {selected ? channel?.status || 'n/a' : t('tidak disertakan')}
        </span>
      </div>
      {selected && channel ? (
        <>
          <dl className="mt-2.5 grid grid-cols-3 gap-2 border-t border-slate-800/70 pt-2.5">
            {[
              [t('Skor'), formatDecimal(app?.score, 2)],
              [t('Penilaian'), formatNumber(app?.ratingCount ?? app?.ratings)],
              [t('Terbaca'), formatNumber(channel.fetched)],
              [t('Dilaporkan'), formatNumber(app?.reviewCountReported ?? coverage?.reportedReviewCount)],
              [t('Instalasi'), app?.installs || 'N/A'],
              [t('Cache'), cache ? `${cache.hit ? t('hit') : t('baru')} · ${formatDateTime(cache.fetchedAt)}` : 'N/A'],
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
            <summary className="cursor-pointer text-[10px] font-semibold text-slate-400 hover:text-slate-200">{t('Catatan sumber')}</summary>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-400">{channel.message}</p>
          </details>
        </>
      ) : (
        <p className="mt-2.5 rounded border border-dashed border-slate-800 px-2 py-3 text-[10px] text-slate-400">
          {t('Kanal tidak dipilih saat analisis dibuat. Tidak ada metrik yang ditampilkan.')}
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
  // Kategori keluhan menyimpan id topik kamus, bukan kedua sebutannya. Sebutan yang dibaca
  // manajer dipilih di sini lewat topicLabel, jadi mengganti bahasa tidak menyentuh angka.
  const topicsById = useMemo(() => new Map(topics.map(topic => [topic.id, topic])), [topics]);
  const pain = model.painPoints || {};
  const painLabels = Array.isArray(pain.labels) && pain.labelRules ? pain.labels : [];
  const ai = model.ai || null;
  const aiNames = ai?.status === 'answered' ? ai.names || {} : null;
  const labelMetrics = pain.labelMetrics || {};
  const signals = model.signals || null;
  const signalItems = Array.isArray(signals?.items) ? signals.items : [];
  // Baris sinyal memakai nama area yang sama dengan tabel keluhan di bawahnya: sumber namanya
  // tetap bertanda, kalimat sinyalnya tetap tulisan mesin pengukuran.
  const areaForSignal = useMemo(() => signalAreaLookup({ pain, topics, ai }), [pain, topics, ai]);
  const terms = model.terms || {};
  const coverage = model.coverage || {};
  const languages = model.languages || { total: 0, counts: {} };
  const taxonomy = model.taxonomy || {};
  const channels = Array.isArray(dataset.channels) ? dataset.channels : [];
  const byId = new Map(channels.map(channel => [channel.id, channel]));
  const exportButton = (
    <button type="button" onClick={onExport} className="btn btn-secondary btn-xs">
      <IconDownload size={12} /> {t('Ekspor JSON')}
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
    <div className="reveal-group space-y-3">
      {model.status !== 'ready' && (
        <Notice tone="amber" title={t('Model belum siap')} live>
          {t('Korpus belum punya cukup ulasan berating rendah dan tinggi untuk mempelajari pembeda kata. Angka yang ada tetap ditampilkan apa adanya.')}
        </Notice>
      )}

      <section className="card overflow-hidden" aria-label={t('Pipeline mesin')}>
        <header className="flex min-h-[36px] flex-wrap items-center justify-between gap-2 border-b border-slate-800/70 px-4 py-2">
          <div className="flex items-baseline gap-2">
            <h2 className="label">{t('Pipeline mesin')}</h2>
            <span className="text-[10px] text-slate-400">{t('otonom · bobot dipelajari dari korpus · nama topik dari kamus domain bilingual')}</span>
          </div>
          {exportButton}
        </header>
        <div className="grid gap-0 sm:grid-cols-2 xl:grid-cols-4 xl:divide-x divide-slate-800/70">
          <Step
            index="01"
            title={t('Normalisasi regex')}
            detail={t('HTML, emoji, tautan, dan huruf berulang tiga kali ke atas diringkas sebelum dihitung.')}
            metric={`${formatNumber(metrics.vocabulary)} ${t('tipe token')} · ${formatNumber(coverage.withText)} ${t('dokumen berteks')}`}
          />
          <Step
            index="02"
            title={t('Deteksi bahasa')}
            detail={t("Profil kata tugas memisahkan Indonesia dan Inggris per ulasan, tanpa model bahasa. Kata serapan yang dipakai dua bahasa ('update', 'app') sengaja tidak dihitung sebagai penanda.")}
            metric={languages.total
              ? `${formatNumber(languages.counts.id)} ID · ${formatNumber(languages.counts.en)} EN · ${formatNumber(languages.counts.mixed)} ${t('campuran')}`
              : t('belum ada bahasa yang tercatat di snapshot ini')}
          />
          <Step
            index="03"
            title={t('Pemisah kosakata')}
            detail={t('Suatu istilah dianggap beban kosakata hanya kalau bobotnya tidak bisa dibedakan dari nol pada korpus ini. Tidak ada fraksi frekuensi dan tidak ada daftar kata.')}
            metric={`${formatNumber(metrics.informativeTerms)} ${t('informatif')} · ${formatNumber(metrics.nonInformativeTerms)} ${t('beban kosakata')}`}
          />
          <Step
            index="04"
            title={t('Bobot korelasi bintang')}
            detail={t('Rasio kemunculan 4–5★ terhadap 1–2★ dengan smoothing Jeffreys dan penyusutan dukungan.')}
            metric={`${formatNumber(metrics.learnedTerms)} ${t('istilah')} · ${formatNumber(coverage.lowRatings)} ${t('rendah')} vs ${formatNumber(coverage.highRatings)} ${t('tinggi')}`}
          />
          <Step
            index="05"
            title={t('Topik dari kamus domain')}
            detail={t('Nama topik diambil dari kamus fitur produk yang dituliskan tangan dalam dua bahasa, bukan dari kata yang kebetulan sering muncul. Kosakata halaman toko tetap dihitung dan dilaporkan, tetapi tidak lagi boleh menamai sesuatu.')}
            metric={`${formatNumber(topics.length)} ${t('topik dilaporkan')} ${t('dari')} ${formatNumber(taxonomy.defined || 0)} ${t('definisi')} · ${formatNumber(coverage.topicReviews)} ${t('ulasan menyebut minimal satu topik')}`}
          />
          <Step
            index="06"
            title={t('Gerombol frasa jadi label')}
            detail={t('Frasa 2–4 token yang benar-benar ditulis reviewers digabung hanya kalau ulasan yang memuat keduanya melampaui kebetulan. Namanya diambil dari kata jangkar yang dijagokan lebih dari satu anggota, dan arah dihitung dari rentang tanggal yang teramati.')}
            metric={`${formatNumber(labelMetrics.clusters || 0)} ${t('gerombol')} · ${formatNumber(labelMetrics.namedFromTerm || 0)} ${t('nama dari jangkar')} · ${formatNumber(labelMetrics.trimmedLabels || 0)} ${t('terpangkas')}`}
          />
          <Step
            index="07"
            title={t('Tulis sinyal dari hasil ukur')}
            detail={t('Tiap baris analisis ditulis mesin dari dua proporsi yang dibandingkan: kalau selisihnya tidak lebih besar daripada simpangan baku selisih itu, barisnya tidak ada. Tidak ada kalimat yang dirangkai manusia atau model bahasa.')}
            metric={signals
              ? `${formatNumber(signals.metrics?.reported || 0)} ${t('dari')} ${formatNumber(signals.metrics?.candidates || 0)} ${t('kandidat lolos uji')}`
              : t('lapisan sinyal belum ada di snapshot ini')}
          />
          <Step
            index="08"
            title={t('Lapisan analis di atas angka')}
            detail={t('Satu panggilan model per penarikan, dan isinya hanya bisa berupa kata: yang dikirim hanyalah urutan, arah, nama kamus, dan redaksi reviewers; setiap kalimat yang kembali memuat satu pun angka dibuang sebelum tampil. Bacaannya memakai dua bahasa sekaligus, dan seluruh panel yang menampiknya menandai sumbernya dengan AI · model.')}
            metric={ai
              ? `${ai.version || 'ai-analyst-v1'} · ${ai.status || t('tanpa status')}${ai.metrics?.reading?.rejected ? ` · ${formatNumber(ai.metrics.reading.rejected)} ${t('kalimat dibuang')}` : ''}`
              : t('lapisan analis belum ada di snapshot ini')}
          />
        </div>
      </section>

      <Panel
        title={t('Sinyal analis')}
        meta={signals
          ? `${formatNumber(signals.metrics?.reported || 0)} ${t('tampil')} · ${formatNumber(signals.metrics?.candidates || 0)} ${t('kandidat')} · ${signals.status === 'ready' ? t('label tersedia') : t('belum ada label')}`
          : t('belum ada di snapshot ini')}
        action={<span className="hidden text-[10px] text-slate-400 sm:inline">{t('kalimatnya data: ditulis mesin, angka-angkanya ikut terkirim')}</span>}
      >
        {signalItems.length ? (
          <>
            <ul className="grid items-start gap-2 md:grid-cols-2 xl:grid-cols-3">
              {signalItems.map(item => <Signal key={item.id} item={item} area={areaForSignal(item)} />)}
            </ul>
            <dl className="mt-3 grid gap-x-4 gap-y-2 border-t border-slate-800/70 pt-2.5 sm:grid-cols-2">
              {Object.entries(signals.rules || {}).map(([key, value]) => (
                <div key={key}>
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t(RULE_LABELS[key] || key)}</dt>
                  <dd className="mt-0.5 text-[10px] leading-relaxed text-slate-400">{typeof value === 'number' ? formatNumber(value) : t(String(value))}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
              {t("Kalimat sinyal ditulis mesin dalam dua bahasa dari angka yang sama, jadi memindahkan bendera tidak mengubah klaimnya. Snapshot lama hanya punya bahasa Inggris, dan itu yang ditampilkan — tidak ada terjemahan yang dikarang.")}{' '}
              {signals.metrics?.trimmed
                ? `${formatNumber(signals.metrics.trimmed)} ${t('kandidat di luar anggaran tampil tetap dihitung di angka kandidat.')}`
                : t('Tidak ada kandidat yang dipangkas.')}{' '}
              {t('Basis hitungan')}: {formatNumber(signals.basis?.reviews || 0)} {t('ulasan')}, {t('pool keluhan')} {formatNumber(signals.basis?.negativePool || 0)}, {t('pool pujian')} {formatNumber(signals.basis?.positivePool || 0)}
              {signals.basis?.trend ? `, ${t('rentang arah')} ${signals.basis.trend.firstDay} ${t('sampai')} ${signals.basis.trend.lastDay}` : ''}.
            </p>
          </>
        ) : (
          <EmptyState
            compact
            icon={IconInfo}
            title={signals ? t('Belum ada pembacaan yang lolos uji') : t('Snapshot ini dibuat sebelum lapisan sinyal')}
            body={signals
              ? `${t('Korpus menghasilkan')} ${formatNumber(signals.basis?.labels || 0)} ${t('label')}, ${t('tetapi tidak satu pun selisih proporsi yang bisa dibedakan dari kebetulan. Panel kosong di sini adalah hasilnya, bukan kegagalannya.')}`
              : `${t('Model tersimpan oleh')} ${model.version || t('versi lama')}, ${t('yang belum menulis lapisan sinyal. Tarik ulang project ini untuk membuatnya dari angka yang sama.')}`}
          />
        )}
      </Panel>

      <div className="grid gap-3 xl:grid-cols-12">
        <Panel title={t('Batas label')} meta={`${formatNumber(coverage.analyzed)} ${t('dianalisis')}`} className="xl:col-span-7">
          <ScoreScale metrics={metrics} labels={labels} />
        </Panel>

        <Panel title={t('Mutu sinyal')} className="xl:col-span-5">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            {[
              [t('AUC in-sample'), formatDecimal(metrics.inSampleAuc, 3), t('bukan akurasi luar sampel')],
              [t('Separasi median'), formatDecimal(metrics.separation, 2), t('jarak dua kelas bintang')],
              [t('Batas cekaman bobot'), formatDecimal(metrics.weightLimit, 3), t('kuantil empirik korpus ini')],
              [t('Penyusutan dukungan'), `n/(n+${formatNumber(metrics.supportShrinkage)})`, t('konvensi statistik, bukan kamus')],
              [t('Smoothing'), metrics.smoothing || 'N/A', t('Jeffreys untuk kelas tidak seimbang')],
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
              t('Bintang = sinyal lemah, bukan label emas.'),
              t('AUC dihitung pada data yang sama membentuk bobot.'),
              t('NSS = selisih porsi label, bukan probabilitas.'),
            ].map(note => (
              <li key={note} className="flex items-start gap-1.5 text-[10px] leading-relaxed text-slate-400">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-700" />
                {note}
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title={t('Kosakata terpelajar')} meta={t('bobot · dukungan')} action={<span className="text-[10px] text-slate-400">{t('dipelajari dari korpus ini saja')}</span>}>
        <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
          <TermColumn title={t('Condong ke bintang 4–5')} terms={Array.isArray(terms.positive) ? terms.positive : []} tone="positive" />
          <TermColumn title={t('Condong ke bintang 1–2')} terms={Array.isArray(terms.negative) ? terms.negative : []} tone="negative" />
        </div>
        <div className="mt-3 border-t border-slate-800/70 pt-3">
          <p className="label-sm">{t('Beban kosakata — bobotnya tidak bisa dibedakan dari nol')}</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {(terms.stopwords || []).length ? terms.stopwords.map(entry => (
              <span key={entry.term} className="rounded bg-slate-800/60 px-1.5 py-0.5 font-mono text-[10px] text-slate-400" title={`${formatNumber(entry.count)} ${t('kemunculan')}`}>
                {entry.term} <span className="count-quiet">{formatNumber(entry.count)}×</span>
              </span>
            )) : <span className="text-[10px] text-slate-400">{t('Belum ada.')}</span>}
          </div>
        </div>
      </Panel>

      <Panel
        title={t('Topik keluhan')}
        meta={`${formatNumber(topics.length)} ${t('topik dari')} ${formatNumber(taxonomy.defined || 0)} ${t('definisi kamus')}`}
        action={<span className="hidden text-[10px] text-slate-400 sm:inline">{t('nama dari kamus domain dua bahasa, bukan dari kata yang sering muncul')}</span>}
      >
        {topics.length ? (
          <div className="scroll-x">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <caption className="sr-only">{t('Topik keluhan: nama kamus Indonesia dan Inggris, klaster fitur, kata yang benar-benar ditulis reviewers, jumlah ulasan 1–2 bintang, porsi dari pool keluhan, jumlah ulasan 4–5 bintang yang menyebut kata sama, dan berapa persen seluruh sebutan topik itu berupa keluhan')}</caption>
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <th scope="col" className="pb-2 pr-2 font-bold">#</th>
                  <th scope="col" className="pb-2 pr-2 font-bold">{t('Topik')}</th>
                  <th scope="col" className="pb-2 pr-2 font-bold">{t('Klaster')}</th>
                  <th scope="col" className="pb-2 pr-2 font-bold">{t('Kata yang ditulis reviewers')}</th>
                  <th scope="col" className="pb-2 pr-2 text-right font-bold">{t('Keluhan')}</th>
                  <th scope="col" className="pb-2 pr-2 text-right font-bold">{t('Porsi')}</th>
                  <th scope="col" className="pb-2 pr-2 text-right font-bold">{t('Pujian')}</th>
                  <th scope="col" className="pb-2 text-right font-bold">{t('Keluhan / sebutan')}</th>
                </tr>
              </thead>
              <tbody>
                {topics.map((topic, index) => (
                  <tr key={topic.id} className="border-t border-slate-800/60">
                    <td className="num py-2 pr-2 text-[10px] text-slate-400">{String(index + 1).padStart(2, '0')}</td>
                    <td className="py-2 pr-2">
                      <span className="tag font-mono">{topicLabel(topic)}</span>
                      <span className="block truncate text-[10px] text-slate-400" title={t('Sebutan bahasa lain dari kamus yang sama')}>{topicAlias(topic)}</span>
                    </td>
                    <td className="py-2 pr-2 align-top text-[10px] text-slate-300">
                      {bilingual(topic.clusterName?.en, topic.clusterName?.id) || 'N/A'}
                      <span className="block text-slate-400">{bilingualAlias(topic.clusterName?.en, topic.clusterName?.id)}</span>
                    </td>
                    <td className="py-2 pr-2 align-top">
                      <span className="block truncate font-mono text-[10px] text-slate-400" title={(topic.matchedTerms || []).map(entry => `${entry.term} ×${entry.count}`).join(' · ')}>
                        {(topic.matchedTerms || []).slice(0, 4).map(entry => entry.term).join(', ') || 'N/A'}
                        {(topic.matchedTerms || []).length > 4 ? ` · +${(topic.matchedTerms || []).length - 4} ${t('lagi')}` : ''}
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
              {t('Kolom')} <span className="font-semibold text-slate-300">{t('Keluhan')}</span> {t('dan')} <span className="font-semibold text-slate-300">{t('Pujian')}</span> {t('adalah jumlah ulasan yang benar-benar memuat kata topik itu pada bintang 1–2 dan 4–5; satu ulasan bisa dihitung di beberapa topik karena satu ulasan bisa menyebut beberapa fitur.')} {t('Kolom terakhir membandingkan keduanya dengan seluruh sebutan topik, jadi angka kecil berarti topiknya juga disebut orang yang puas.')}
              {taxonomy.reported === 0 ? '' : ` ${formatNumber(taxonomy.reported || 0)} ${t('topik dilaporkan dan')} ${formatNumber(taxonomy.unmatchedReviews || 0)} ${t('ulasan berteks tidak cocok dengan satu pun definisi kamus — ulasan itu tetap dihitung di seluruh angka, hanya tidak berpura-pura punya topik.')}`}{' '}
              {t('Kosakata yang ditulis penerbit di halaman tokonya sendiri tetap diukur —')} <span className="num">{formatNumber(metrics.listingTopicCount || 0)}</span> {t('istilah tersimpan di model sebagai bukti — tetapi lapisan itu tidak lagi boleh menamai satu pun baris tabel ini.')}
            </p>
          </div>
        ) : (
          <EmptyState compact icon={IconInfo} title={t('Belum ada topik')} body={t('Tidak ada ulasan yang memuat kata fitur dari kamus domain dua bahasa. Tidak ada baris yang dipaksa masuk topik demi mengisi tabel ini.')} />
        )}
      </Panel>

      <Panel
        title={t('Gerombol label keluhan')}
        meta={painLabels.length
          ? `${formatNumber(labelMetrics.clusters || painLabels.length)} ${t('gerombol')} · ${formatNumber(labelMetrics.links)} ${t('ikatan')} · ${formatNumber(labelMetrics.singletons)} ${t('beranggota satu')}`
          : `${formatNumber(pain.metrics?.reportedPhrases || 0)} ${t('frasa dipelajari')}`}
        action={<span className="hidden text-[10px] text-slate-400 sm:inline">{t('nama label = kata jangkar dari frasa reviewers')}</span>}
      >
        {painLabels.length ? (
          <div className="scroll-x">
            <table className="w-full min-w-[820px] border-collapse text-left">
              <caption className="sr-only">{t('Gerombol label keluhan: nama yang dipilih mesin dari kata jangkar anggota, frasa bukti, jumlah frasa anggota, jumlah mention, jumlah ulasan berbeda, porsi dari pool 1–2 bintang, pujian 4–5 bintang yang menyebut frasa yang sama, arah laju harian paruh kedua terhadap paruh pertama, dan kanal yang paling banyak memuat label itu')}</caption>
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <th scope="col" className="pb-2 pr-2 font-bold">#</th>
                  <th scope="col" className="pb-2 pr-2 font-bold">{t('Label')}</th>
                  <th scope="col" className="pb-2 pr-2 font-bold">{t('Kategori')}</th>
                  <th scope="col" className="pb-2 pr-2 text-right font-bold">{t('Frasa')}</th>
                  <th scope="col" className="pb-2 pr-2 text-right font-bold">{t('Mention')}</th>
                  <th scope="col" className="pb-2 pr-2 text-right font-bold">{t('Ulasan beda')}</th>
                  <th scope="col" className="pb-2 pr-2 text-right font-bold">{t('Porsi')}</th>
                  <th scope="col" className="pb-2 pr-2 text-right font-bold">{t('Pujian')}</th>
                  <th scope="col" className="pb-2 pr-2 text-right font-bold">{t('Arah')}</th>
                  <th scope="col" className="pb-2 text-right font-bold">{t('Kanal')}</th>
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
                        {entry.phrases.length > 3 ? ` · +${entry.phrases.length - 3} ${t('lagi')}` : ''}
                      </p>
                    </td>
                    <td className="py-2 pr-2 align-top text-[10px]">
                      {aiNames?.[entry.id]?.category
                        ? <span title={`${t('Kategori diberi nama oleh')} ${ai.model} ${t('berdasar frasa di baris ini; seluruh angka di baris ini tetap pengukuran mesin')}`}><span className="font-semibold text-slate-200">{aiText(aiNames[entry.id].category)}</span><span className="block truncate text-slate-400">{aiText(aiNames[entry.id].subLabel) || t('nama model')}</span></span>
                        : entry.category
                          ? <span title={`${t('Nama topik kamus domain yang lebih padat di gerombol ini daripada di keluhan lain')} (${formatNumber(entry.category.inside)} ${t('dari')} ${formatNumber(entry.reviewCount)} ${t('ulasan gerombol')})`}><span className="font-semibold text-slate-300">{topicLabel(topicsById.get(entry.category.id) || entry.category)}</span><span className="block text-slate-400">{t('dari kamus domain')}</span></span>
                          : <span className="text-slate-400" title={t('Belum ada penamaan yang lolos uji bukti untuk gerombol ini')}>N/A</span>}
                    </td>
                    <td className="num py-2 pr-2 text-right text-[11px] text-slate-200">{formatNumber(entry.phraseCount)}</td>
                    <td className="num py-2 pr-2 text-right text-[10px] text-slate-400">{formatNumber(entry.phrases.reduce((sum, phrase) => sum + phrase.dfNegative, 0))}</td>
                    <td className="num py-2 pr-2 text-right text-[11px] font-bold text-slate-100">{formatNumber(entry.reviewCount)}</td>
                    <td className="num py-2 pr-2 text-right text-[10px] text-slate-400">{formatPercent(entry.reviewCount, pain.pools?.negative || 0)}</td>
                    <td className="num py-2 pr-2 text-right text-[10px] text-slate-400">{entry.praiseCount == null ? 'N/A' : formatNumber(entry.praiseCount)}</td>
                    <td className="num py-2 pr-2 text-right text-[10px] text-slate-300">
                      {Number.isFinite(entry.momentum)
                        ? <span title={`${formatNumber(entry.late)} ${t('ulasan di paruh kedua vs')} ${formatNumber(entry.early)} ${t('di paruh pertama')}`}>{entry.momentum.toFixed(2)}{t('×/hari')}</span>
                        : 'N/A'}
                    </td>
                    <td className="num py-2 text-right text-[10px] text-slate-300">
                      {entry.channels?.length
                        ? (
                          <span title={`${formatNumber(entry.channels[0].count)} ${t('dari')} ${formatNumber(entry.channels[0].pool)} ${t('keluhan')} ${platformLabel(entry.channels[0].id)}`}>
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
              {t('Kolom')} <span className="font-semibold text-slate-300">{t('Mention')}</span> {t('adalah penjumlahan setiap frasa anggotanya; kolom')}{' '}
              <span className="font-semibold text-slate-300">{t('Ulasan beda')}</span> {t('adalah jumlah ulasan yang sebenarnya. Selisihnya adalah orang yang sama yang dihitung berulang — tidak pernah ditampilkan sebagai temuan.')}{' '}
              {labelMetrics.trimmedLabels
                ? `${formatNumber(labelMetrics.trimmedLabels)} ${t('gerombol di luar anggaran tampil tetap dihitung dan dilaporkan di angka ini.')}`
                : t('Seluruh gerombol muat di anggaran tampil.')}{' '}
              {formatNumber(labelMetrics.namedFromTerm || 0)} {t('dari')} {formatNumber(painLabels.length)} {t('nama label adalah kata jangkar yang dijagokan lebih dari satu anggotanya; sisanya memakai frasa utuh apa adanya.')}{' '}
              {t(pain.labelRules?.heading || 'Judul adalah nama topik ditambah frasa anggota yang paling informatif, selalu teks asli reviewers.')}{' '}
              {t(pain.labelRules?.link || 'Dua frasa digabung hanya kalau ulasan yang memuat keduanya melampaui kebetulan.')}{' '}
              {t(pain.labelRules?.closure || 'Gabungan diterima hanya kalau seluruh silangan anggotanya lolos uji, jadi gerombol tidak menyatu karena rantai.')}{' '}
              {t('Arah dihitung dari')} {pain.labelMetrics?.trend ? `${t('rentang')} ${pain.labelMetrics.trend.firstDay} ${t('sampai')} ${pain.labelMetrics.trend.lastDay}` : t('rentang tanggal yang tidak tersedia')}.{' '}
              {t('Kolom')} <span className="font-semibold text-slate-300">{t('Kanal')}</span> {t('adalah kanal yang paling banyak memuat label itu, dibaca sebagai porsi keluhan kanal tersebut.')}{' '}
              {t('Kolom')} <span className="font-semibold text-slate-300">{t('Kategori')}</span> {t('punya dua sumber dan keduanya ditulis di barisnya: nama topik kamus domain yang lolos uji kepadatan')} ({t(pain.labelRules?.category || 'lebih dari satu ulasan gerombol memuatnya, dan porsinya beda nyata dari keluhan lain')}), {t('atau nama yang diberi model bahasa')}{' '}
              ({ai?.status === 'answered' ? `${ai.model} ${t('atas')} ${formatNumber(ai.clusters || 0)} ${t('gerombol')}, ${formatNumber(painLabels.filter(entry => ai.names?.[entry.id]?.category).length)} ${t('baris tampil bernama model')}` : `${t('lapisan analis berstatus')} ${ai?.status || t('belum ada di snapshot ini')}${ai?.reason ? ` — ${ai.reason}` : ''}`}).
              {' '}{t('Yang tidak pernah terjadi: angka ikut menamai atau ikut dinamai — seluruh kolom jumlah, porsi, pujian, arah, dan kanal tetap pengukuran mesin.')}
            </p>
            {/* Catatan metode dari lapisan analis: ia menilai bacaannya sendiri, dan jumlah
                kalimat yang dibuang karena memuat angka ikut dilaporkan, bukan disembunyikan. */}
            {aiText(ai?.reading?.method) ? (
              <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[10px] leading-relaxed text-slate-300">
                <AnalystBadge model={ai.model} note={t('Kalimat ini ditulis lapisan analis tentang seberapa jauh bacaannya bisa dipercaya')} />
                <span className="min-w-0">{aiText(ai.reading.method)}</span>
              </p>
            ) : null}
            {ai?.status === 'answered' && ai.metrics?.reading?.rejected ? (
              <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                <span className="num font-semibold text-slate-300">{formatNumber(ai.metrics.reading.rejected)}</span> {t('kalimat model dibuang karena memuat angka atau tidak berbentuk kalimat; yang tampil di panel hanyalah yang lolos uji itu.')}
              </p>
            ) : null}
          </div>
        ) : (
          <EmptyState
            compact
            icon={IconInfo}
            title={pain.labelRules ? t('Belum ada ikatan antar frasa') : t('Snapshot ini dibuat sebelum lapisan label')}
            body={pain.labelRules
              ? `${formatNumber(pain.metrics?.matchedReviews || 0)} ${t('ulasan 1–2★ memuat minimal satu frasa tersimpan, tetapi tidak ada pasangan frasa yang muncul bersama melampaui kebetulan. Tidak ada kategori yang dikarang untuk mengisi tabel ini.')}`
              : `${t('Frasa tersimpan oleh')} ${pain.version || t('versi lama')}, ${t('yang belum punya langkah penggerombolan. Tarik ulang project ini untuk membentuk label dari frasa yang sama.')}`}
          />
        )}
      </Panel>

      <section className="card overflow-hidden" aria-label={t('Audit kanal')}>
        <header className="flex min-h-[36px] items-center justify-between gap-2 border-b border-slate-800/70 px-4 py-2">
          <h2 className="label">{t('Audit kanal & cache')}</h2>
          <span className="num text-[10px] text-slate-400">cache {formatNumber((dataset.cache?.ttlMs || 0) / 60000)} {t('menit · penarikan berikutnya berhenti di ulasan yang sudah tersimpan')}</span>
        </header>
        <div className="grid gap-0 md:grid-cols-2 md:divide-x divide-slate-800/70">
          {['play', 'appstore'].map(store => (
            <AuditPanel key={store} store={store} channel={byId.get(store)} workspaceStore={workspace.stores?.[store]} />
          ))}
        </div>
      </section>

      <Panel title={t('Ruang kerja')} meta={db?.enabled ? t('database server · id aktif di peramban') : t('sesi ini · tanpa database')} action={exportButton}>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-4">
          {[
            [t('Nama'), workspace.label],
            [t('Entitas'), workspace.entity],
            [t('Dibuat'), formatDateTime(workspace.createdAt)],
            [t('Snapshot'), formatDateTime(dataset.fetchedAt)],
            [t('Mesin'), dataset.engine?.version || 'N/A'],
            [t('Supervisi'), dataset.engine?.supervision === 'weak-rating' ? t('sinyal bintang lemah') : dataset.engine?.supervision || 'N/A'],
            [t('Kamus topik'), dataset.engine?.dictionary && dataset.engine.dictionary !== 'none' ? dataset.engine.dictionary : t('tidak ada di snapshot ini')],
            [t('Lapisan analis'), dataset.engine?.analyst ? `${dataset.engine.analyst.version} · ${dataset.engine.analyst.status}${dataset.engine.analyst.model ? ` · ${dataset.engine.analyst.model}` : ''}` : t('belum ada di snapshot ini')],
            [t('Deteksi bahasa'), languages.version || t('tidak ada di snapshot ini')],
            [t('Ukuran'), formatBytes(snapshotBytes)],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</dt>
              <dd className="mt-0.5 truncate text-[11px] font-bold text-slate-300" title={String(value)}>{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-800/70 pt-2.5">
          <p className="text-[10px] leading-relaxed text-slate-400">
            {t('Ekspor JSON memuat seluruh ulasan, analisis per baris, model, dan metadata kanal — tanpa potongan sampel. Tidak ada jalur impor.')}
          </p>
          {workspace.stores?.play?.url && (
            <a href={workspace.stores.play.url} target="_blank" rel="noopener noreferrer" className="link-quiet ml-auto text-[10px]">
              {t('halaman toko')} <IconExternal size={10} />
            </a>
          )}
        </div>
        <p className="mt-2 font-mono text-[10px] text-slate-400">workspace {workspace.id}</p>
      </Panel>
    </div>
  );
}
