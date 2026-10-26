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

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'N/A';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${formatDecimal(bytes / 1024, 1)} KB`;
  return `${formatDecimal(bytes / (1024 * 1024), 2)} MB`;
}

function Panel({ title, meta, action, children, className = '' }) {
  return (
    <section className={`card flex min-w-0 flex-col ${className}`} aria-label={title}>
      <header className="flex min-h-[34px] flex-wrap items-center justify-between gap-2 border-b border-slate-800/70 px-3 py-1.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="label">{title}</h2>
          {meta && <span className="num truncate text-[10px] text-slate-400">{meta}</span>}
        </div>
        {action}
      </header>
      <div className="min-h-0 flex-1 p-3">{children}</div>
    </section>
  );
}

function Step({ index, title, detail, metric }) {
  return (
    <div className="min-w-0 border-slate-800/70 p-3">
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
    ? [['Halaman', coverage.pages], ['Baris', coverage.rows], ['Duplikat', coverage.duplicates], ['Dibuang', coverage.skipped], ['Batas sampel', coverage.sampleLimit == null ? 'tidak ada' : coverage.sampleLimit]]
    : [['Halaman', coverage.shelfPages], ['Feed', coverage.feedPages], ['Ulasan halaman', coverage.shelfReviews], ['Ulasan feed', coverage.feedReviews], ['Berbagi', coverage.sharedReviews], ['Dibuang', coverage.skipped]];

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

export function ModelView({ dataset, workspace, onExport }) {
  const model = dataset.model || {};
  const metrics = model.metrics || {};
  const labels = model.labels || { positive: 0, neutral: 0, negative: 0, unclassified: 0 };
  const topics = Array.isArray(model.topics) ? model.topics : [];
  const terms = model.terms || {};
  const coverage = model.coverage || {};
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
        <header className="flex min-h-[34px] flex-wrap items-center justify-between gap-2 border-b border-slate-800/70 px-3 py-1.5">
          <div className="flex items-baseline gap-2">
            <h2 className="label">Pipeline mesin</h2>
            <span className="text-[10px] text-slate-400">otonom · tanpa kamus · bintang sebagai sinyal lemah</span>
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
            title="Pemisah kosakata"
            detail="Suatu istilah dianggap beban kosakata hanya kalau bobotnya tidak bisa dibedakan dari nol pada korpus ini. Tidak ada fraksi frekuensi dan tidak ada daftar kata."
            metric={`${formatNumber(metrics.informativeTerms)} informatif · ${formatNumber(metrics.nonInformativeTerms)} beban kosakata`}
          />
          <Step
            index="03"
            title="Bobot korelasi bintang"
            detail="Rasio kemunculan 4–5★ terhadap 1–2★ dengan smoothing Jeffreys dan penyusutan dukungan."
            metric={`${formatNumber(metrics.learnedTerms)} istilah · ${formatNumber(coverage.lowRatings)} rendah vs ${formatNumber(coverage.highRatings)} tinggi`}
          />
          <Step
            index="04"
            title="Topik dari teks toko"
            detail="Istilah fitur diambil dari judul, ringkasan, dan deskripsi aplikasi di tokonya, lalu dihitung pada ulasan 1-2★."
            metric={`${formatNumber(topics.length)} topik · ${formatNumber(coverage.topicReviews)} ulasan menyebut minimal satu topik`}
          />
        </div>
      </section>

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

      <Panel title="Topik keluhan" meta={`${formatNumber(topics.length)} topik`} action={<span className="hidden text-[10px] text-slate-400 sm:inline">istilah dari teks daftar aplikasi</span>}>
        {topics.length ? (
          <div className="scroll-x">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <caption className="sr-only">Topik keluhan: nomor, istilah, jumlah ulasan 1–2 bintang, porsi dari pool keluhan, sebutan di teks toko, dan jumlah ulasan 4–5 bintang yang menyebut istilah sama</caption>
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <th scope="col" className="pb-1.5 pr-2 font-bold">#</th>
                  <th scope="col" className="pb-1.5 pr-2 font-bold">Istilah</th>
                  <th scope="col" className="pb-1.5 pr-2 text-right font-bold">Keluhan</th>
                  <th scope="col" className="pb-1.5 pr-2 text-right font-bold">Porsi</th>
                  <th scope="col" className="pb-1.5 pr-2 text-right font-bold">Di teks toko</th>
                  <th scope="col" className="pb-1.5 text-right font-bold">Pujian</th>
                </tr>
              </thead>
              <tbody>
                {topics.map((topic, index) => (
                  <tr key={topic.id} className="border-t border-slate-800/60">
                    <td className="num py-1.5 pr-2 text-[10px] text-slate-400">{String(index + 1).padStart(2, '0')}</td>
                    <td className="py-1.5 pr-2">
                      <span className="rounded bg-slate-800/70 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">{topic.name}</span>
                      {topic.nameLike && <span className="text-[10px] text-slate-400">{' '}ditulis sebagai nama</span>}
                    </td>
                    <td className="num py-1.5 pr-2 text-right text-[11px] font-bold text-slate-200">{formatNumber(topic.low)}</td>
                    <td className="num py-1.5 pr-2 text-right text-[10px] text-slate-400">{formatPercent(topic.share, 100)}</td>
                    <td className="num py-1.5 pr-2 text-right text-[10px] text-slate-400">{formatNumber(topic.listingMentions)}×</td>
                    <td className="num py-1.5 text-right text-[10px] text-slate-400">{formatNumber(topic.high)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState compact icon={IconInfo} title="Belum ada topik" body="Tidak ada istilah fitur dari teks daftar aplikasi yang muncul di cukup banyak ulasan 1–2 bintang." />
        )}
      </Panel>

      <section className="card overflow-hidden" aria-label="Audit kanal">
        <header className="flex min-h-[34px] items-center justify-between gap-2 border-b border-slate-800/70 px-3 py-1.5">
          <h2 className="label">Audit kanal &amp; cache</h2>
          <span className="num text-[10px] text-slate-400">cache {formatNumber((dataset.cache?.ttlMs || 0) / 60000)} menit · force sync melewatinya</span>
        </header>
        <div className="grid gap-0 md:grid-cols-2 md:divide-x divide-slate-800/70">
          {['play', 'appstore'].map(store => (
            <AuditPanel key={store} store={store} channel={byId.get(store)} workspaceStore={workspace.stores?.[store]} />
          ))}
        </div>
      </section>

      <Panel title="Ruang kerja" meta="localStorage peramban" action={exportButton}>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-4">
          {[
            ['Nama', workspace.label],
            ['Entitas', workspace.entity],
            ['Dibuat', formatDateTime(workspace.createdAt)],
            ['Snapshot', formatDateTime(dataset.fetchedAt)],
            ['Mesin', dataset.engine?.version || 'N/A'],
            ['Supervisi', dataset.engine?.supervision === 'weak-rating' ? 'sinyal bintang lemah' : dataset.engine?.supervision || 'N/A'],
            ['Kamus', dataset.engine?.dictionary === 'none' ? 'tidak ada' : dataset.engine?.dictionary || 'N/A'],
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
