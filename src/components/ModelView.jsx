import { useMemo } from 'react';
import {
  formatDateTime,
  formatDecimal,
  formatNumber,
  formatNss,
  formatPercent,
  formatWeight,
  isNumber,
  platformLabel,
  toNumber,
} from '../lib/format.js';
import { ChannelStrip } from './ChannelStrip.jsx';
import { EmptyState } from './EmptyState.jsx';
import { Notice } from './Notices.jsx';
import { StoreMark } from './Brand.jsx';
import { IconAlert, IconDownload, IconExternal, IconInfo, IconSpark } from './icons.jsx';

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'N/A';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${formatDecimal(bytes / 1024, 1)} KB`;
  return `${formatDecimal(bytes / (1024 * 1024), 2)} MB`;
}

function ageLabel(ageMs) {
  if (!Number.isFinite(ageMs)) return 'N/A';
  if (ageMs < 1000) return 'kurang dari 1 detik';
  if (ageMs < 60000) return `${Math.round(ageMs / 1000)} detik`;
  return `${Math.round(ageMs / 60000)} menit`;
}

function ProcessCard({ number, title, body, foot }) {
  return (
    <li className="relative flex flex-col rounded-2xl border border-line/75 bg-paper-100/55 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[9px] font-bold tracking-[0.14em] text-coral">{number}</span>
        <span className="h-px flex-1 bg-line/70" aria-hidden="true" />
      </div>
      <p className="mt-3 font-display text-[16px] font-semibold leading-tight text-ink">{title}</p>
      <p className="mt-1.5 flex-1 text-[10.5px] leading-relaxed text-ink-muted">{body}</p>
      <p className="mt-3 border-t border-line/60 pt-2 text-[9.5px] font-semibold leading-relaxed text-ink-faint">{foot}</p>
    </li>
  );
}

function ScoreScale({ metrics, labels }) {
  const lowMedian = toNumber(metrics.lowMedian);
  const highMedian = toNumber(metrics.highMedian);
  const threshold = toNumber(metrics.threshold);
  const margin = Math.max(0, toNumber(metrics.neutralMargin) || 0);
  if (![lowMedian, highMedian, threshold].every(Number.isFinite)) return null;
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
    <div className="rounded-2xl border border-line/75 bg-paper-100/55 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-bold text-ink-soft">Ambang label dari korpus</p>
        <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-ink-faint">skor dokumen</span>
      </div>
      <div className="relative mt-5 h-2 rounded-full bg-paper-200">
        <span className="absolute inset-y-0 left-0 rounded-l-full bg-coral/70" style={{ width: `${leftBand}%` }} />
        <span className="absolute inset-y-0 bg-amber/60" style={{ left: `${leftBand}%`, width: `${Math.max(0, rightBand - leftBand)}%` }} />
        <span className="absolute inset-y-0 right-0 rounded-r-full bg-teal/70" style={{ left: `${rightBand}%` }} />
        <span className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink bg-paper-50" style={{ left: `${pos(threshold)}%` }} title={`Ambang ${formatDecimal(threshold, 2)}`} />
        {Number.isFinite(lowMedian) && (
          <span className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-coral-deep" style={{ left: `${pos(lowMedian)}%` }} title={`Median bintang 1–2: ${formatDecimal(lowMedian, 2)}`} />
        )}
        {Number.isFinite(highMedian) && (
          <span className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal-deep" style={{ left: `${pos(highMedian)}%` }} title={`Median bintang 4–5: ${formatDecimal(highMedian, 2)}`} />
        )}
      </div>
      <div className="mt-2 flex justify-between text-[8px] text-ink-faint">
        <span>{formatDecimal(domainMin, 2)}</span>
        <span>0</span>
        <span>{formatDecimal(domainMax, 2)}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['Median 1–2★', formatDecimal(lowMedian, 3)],
          ['Batas', formatDecimal(threshold, 3)],
          ['Margin netral', `±${formatDecimal(margin, 3)}`],
          ['Median 4–5★', formatDecimal(highMedian, 3)],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="text-[8px] font-bold uppercase tracking-[0.1em] text-ink-faint">{label}</p>
            <p className="num mt-0.5 text-[11px] font-semibold text-ink-soft">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-line/60 pt-2.5 text-[9.5px] text-ink-muted">
        <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-coral" /> Negatif {formatNumber(labels.negative)}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-amber" /> Netral {formatNumber(labels.neutral)}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-teal" /> Positif {formatNumber(labels.positive)}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-ink-faint" /> Tak terklasifikasi {formatNumber(labels.unclassified)}</span>
      </div>
    </div>
  );
}

function TermList({ title, terms, tone }) {
  const maxAbs = Math.max(1, ...terms.map(term => Math.abs(Number(term.weight) || 0)));
  const accent = tone === 'positive' ? 'bg-teal' : 'bg-coral';
  const text = tone === 'positive' ? 'text-teal-deep' : 'text-coral-deep';
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.13em] text-ink-soft">
          <span className={`h-1.5 w-1.5 rounded-full ${accent}`} /> {title}
        </p>
        <span className="text-[8.5px] text-ink-faint">bobot · dukungan</span>
      </div>
      {terms.length ? (
        <ol className="mt-2 space-y-1">
          {terms.map((term, index) => (
            <li key={term.term} className="grid grid-cols-[14px_minmax(58px,0.8fr)_minmax(48px,1fr)_44px] items-center gap-2 border-b border-line/40 py-1.5 last:border-0">
              <span className="num text-[8px] text-ink-faint">{String(index + 1).padStart(2, '0')}</span>
              <span className="truncate font-mono text-[10px] font-semibold text-ink-soft" title={term.term}>{term.term}</span>
              <span className="relative h-1 rounded-full bg-line/55">
                <span className={`absolute inset-y-0 left-0 rounded-full ${accent}`} style={{ width: `${(Math.abs(Number(term.weight)) / maxAbs) * 100}%` }} />
              </span>
              <span className={`num text-right text-[9.5px] font-semibold ${text}`}>{formatWeight(term.weight)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 rounded-xl border border-dashed border-line px-3 py-4 text-center text-[10px] text-ink-faint">Belum ada istilah dengan bobot ini.</p>
      )}
    </div>
  );
}

function ChannelAuditCard({ channel, store, workspaceStore }) {
  const selected = Boolean(workspaceStore?.appId);
  const app = channel?.app || null;
  const coverage = channel?.coverage || null;
  const cache = channel?.cache || null;
  const histogram = Array.isArray(app?.ratingHistogram) && app.ratingHistogram.length === 5 ? app.ratingHistogram : null;
  const appRatingCount = app?.ratingCount ?? app?.ratings;
  const status = channel?.status;

  return (
    <article className="rounded-2xl border border-line/80 bg-paper-50/75 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <StoreMark store={store} size={30} tone="quiet" />
          <div>
            <p className="text-[11.5px] font-bold text-ink">{platformLabel(store)}</p>
            <p className="truncate font-mono text-[9px] text-ink-faint">{workspaceStore?.appId || channel?.appId || 'N/A'}</p>
          </div>
        </div>
        {selected ? (
          <span className={`rounded-full border px-2 py-0.5 text-[8.5px] font-bold ${
            status === 'success'
              ? 'border-teal/25 bg-teal-soft/60 text-teal-deep'
              : status === 'error'
                ? 'border-coral/25 bg-coral-soft/55 text-coral-deep'
                : 'border-amber/25 bg-amber-soft/55 text-amber-deep'
          }`}>
            {status === 'success' ? 'lengkap' : status === 'error' ? 'gagal' : status || 'tidak diketahui'}
          </span>
        ) : (
          <span className="rounded-full border border-line px-2 py-0.5 text-[8.5px] font-semibold text-ink-faint">tidak disertakan</span>
        )}
      </div>

      {selected && channel ? (
        <>
          <div className="mt-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[12px] font-bold text-ink">{app?.title || workspaceStore?.title || 'N/A'}</p>
              <p className="mt-0.5 truncate text-[9.5px] text-ink-muted">{app?.developer || workspaceStore?.developer || 'N/A'}</p>
            </div>
            {app?.url && (
              <a href={app.url} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 text-[9px] font-semibold text-ink-soft hover:text-teal">
                Toko <IconExternal size={10} />
              </a>
            )}
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line/60 pt-3 sm:grid-cols-3">
            {[
              ['Skor toko', formatDecimal(app?.score, 2)],
              ['Penilaian', formatNumber(appRatingCount)],
              ['Dibaca', formatNumber(channel.fetched)],
              ['Dilaporkan', formatNumber(app?.reviewCountReported)],
              ['Instalasi', app?.installs || 'N/A'],
              ['Cache', cache?.hit ? `hit · ${ageLabel(cache.ageMs)}` : cache ? 'tarikan baru' : 'N/A'],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-[8px] font-bold uppercase tracking-[0.1em] text-ink-faint">{label}</dt>
                <dd className="num mt-0.5 text-[10.5px] font-semibold text-ink-soft">{value}</dd>
              </div>
            ))}
          </dl>

          {histogram && (
            <div className="mt-3 border-t border-line/60 pt-2.5">
              <p className="text-[8px] font-bold uppercase tracking-[0.1em] text-ink-faint">Histogram penilaian toko · 5★ → 1★</p>
              <div className="mt-1.5 flex items-center gap-1.5">
                {histogram.map((count, index) => (
                  <span key={index} className="flex items-center gap-1 rounded bg-paper-100 px-1.5 py-0.5 text-[8.5px] text-ink-muted" title={`${5 - index} bintang: ${formatNumber(count)}`}>
                    <span className="font-bold text-ink-soft">{5 - index}★</span>
                    <span className="num">{formatNumber(count)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-1.5">
            {(coverage && (store === 'play'
              ? [['Halaman', coverage.pages], ['Baris', coverage.rows], ['Duplikat', coverage.duplicates]]
              : [['Halaman', coverage.shelfPages], ['Feed', coverage.feedPages], ['Halaman ulasan', coverage.shelfReviews], ['Feed ulasan', coverage.feedReviews], ['Berbagi', coverage.sharedReviews], ['Dilewati', coverage.skipped]]
            ) || []).map(([label, value]) => (
              <span key={label} className="rounded border border-line/70 bg-paper-100/70 px-1.5 py-0.5 text-[8.5px] text-ink-muted">
                {label} <span className="num font-semibold text-ink-soft">{formatNumber(value)}</span>
              </span>
            ))}
            {cache?.fetchedAt && <span className="rounded border border-line/70 bg-paper-100/70 px-1.5 py-0.5 text-[8.5px] text-ink-muted">Cache {formatDateTime(cache.fetchedAt)}</span>}
          </div>

          <details className="mt-3 border-t border-line/60 pt-2">
            <summary className="cursor-pointer text-[9.5px] font-semibold text-ink-muted hover:text-ink">Catatan sumber mentah</summary>
            <p className="mt-1.5 text-[9.5px] leading-relaxed text-ink-faint">{channel.message}</p>
          </details>
        </>
      ) : (
        <p className="mt-3 rounded-xl border border-dashed border-line bg-paper-100/50 px-3 py-3 text-[10px] leading-relaxed text-ink-faint">
          Kanal ini tidak dipilih saat analisis dibuat. Tidak ada metrik toko yang ditampilkan.
        </p>
      )}
    </article>
  );
}

export function ModelView({ dataset, workspace, onExport }) {
  const model = dataset.model || {};
  const metrics = model.metrics || {};
  const labels = model.labels || { positive: 0, neutral: 0, negative: 0, unclassified: 0 };
  const clusters = Array.isArray(model.clusters) ? model.clusters : [];
  const terms = model.terms || {};
  const coverage = model.coverage || {};
  const channels = Array.isArray(dataset.channels) ? dataset.channels : [];
  const channelById = new Map(channels.map(channel => [channel.id, channel]));
  const insufficient = model.status !== 'ready';

  const snapshotBytes = useMemo(() => {
    try {
      return new Blob([JSON.stringify(dataset)]).size;
    } catch {
      return null;
    }
  }, [dataset]);

  return (
    <div className="mt-5 space-y-4">
      {insufficient && (
        <Notice tone="amber" title="Model belum siap" live>
          Korpus belum memiliki cukup ulasan berating rendah dan tinggi untuk mempelajari pembeda kata. Angka di bawah tetap ditampilkan bila tersedia, tanpa diisi nilai pengganti.
        </Notice>
      )}

      <section className="surface p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <div className="rule-label">Otak analisis</div>
            <h2 className="mt-2 text-[clamp(1.5rem,2.7vw,2.1rem)] leading-tight text-ink">Otonom, tanpa kamus. Bukan tanpa asumsi.</h2>
            <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
              Tidak ada daftar kata sentimen, kategori keluhan, atau pelabelan manual. Bobot dipelajari dari ulasan yang ikut ditarik, dengan bintang 1–5 sebagai sinyal lemah. Mesin ini tidak mengklaim pemahaman bahasa seperti manusia.
            </p>
          </div>
          <button type="button" onClick={onExport} className="btn btn-outline btn-sm shrink-0">
            <IconDownload size={14} /> Ekspor JSON lengkap
          </button>
        </div>

        <ol className="mt-5 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          <ProcessCard
            number="01"
            title="Normalisasi regex"
            body="HTML, emoji, tautan, dan huruf berulang tiga kali ke atas diringkas sebelum dihitung. Tidak memakai kamus alay."
            foot={`${formatNumber(metrics.vocabulary)} tipe token · ${formatNumber(coverage.withText)} dokumen berteks`}
          />
          <ProcessCard
            number="02"
            title="Stopwords dari frekuensi"
            body={`${formatDecimal((metrics.stopwordFraction || 0.02) * 100, 0)}% kata paling sering dibuang, kecuali kandidat yang terbukti diskriminatif antar-kelas.`}
            foot={`${formatNumber(metrics.stopwordsRemoved)} dibuang · ${formatNumber(metrics.protectedSignalTerms)} dilindungi`}
          />
          <ProcessCard
            number="03"
            title="Bobot korelasi bintang"
            body="Frekuensi kata pada ulasan 4–5★ dibandingkan dengan 1–2★, memakai smoothing Jeffreys dan penyusutan dukungan."
            foot={`${formatNumber(metrics.learnedTerms)} istilah · ${formatNumber(coverage.lowRatings)} rendah vs ${formatNumber(coverage.highRatings)} tinggi`}
          />
          <ProcessCard
            number="04"
            title="Klaster ko-okurensi"
            body="Istilah negatif yang sering muncul bersama dikelompokkan satu hop. Nama klaster diambil dari istilahnya sendiri."
            foot={`${formatNumber(clusters.length)} klaster · ambang dari sebaran kemiripan`}
          />
        </ol>
      </section>

      <div className="grid gap-3 lg:grid-cols-[1.08fr_0.92fr]">
        <section className="surface p-5 sm:p-6" aria-labelledby="ambang-title">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="rule-label">Batas kelas</div>
              <h2 id="ambang-title" className="mt-1.5 text-[20px] leading-tight text-ink">Ambang dan label akhir</h2>
            </div>
            <span className="chip">{formatNumber(coverage.analyzed)} dianalisis</span>
          </div>
          <p className="mt-2 text-[10.5px] leading-relaxed text-ink-faint">
            Skor dokumen adalah rata-rata bobot istilah terpelajari. Pita netral mencegah skor dekat batas dipaksa menjadi positif atau negatif.
          </p>
          <div className="mt-4">
            {metrics.threshold != null ? (
              <ScoreScale metrics={metrics} labels={labels} />
            ) : (
              <EmptyState compact icon={IconInfo} title="Ambang belum terbentuk" body="Median kelas belum cukup untuk menetapkan batas positif, netral, dan negatif." />
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ['Positif', labels.positive, 'bg-teal'],
              ['Netral', labels.neutral, 'bg-amber'],
              ['Negatif', labels.negative, 'bg-coral'],
              ['Tak terklasifikasi', labels.unclassified, 'bg-ink-faint'],
            ].map(([label, value, tone]) => (
              <div key={label} className="rounded-xl border border-line/70 bg-paper-100/55 p-2.5">
                <p className="flex items-center gap-1.5 text-[8.5px] font-semibold text-ink-faint"><span className={`h-1.5 w-1.5 rounded-full ${tone}`} /> {label}</p>
                <p className="num mt-1 text-[17px] font-semibold leading-none text-ink">{formatNumber(value)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="dark-panel noise-dark relative overflow-hidden rounded-[22px] border border-ink p-5 text-paper-50 shadow-panel sm:p-6" aria-labelledby="mutu-title">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-paper-50/45">Mutu sinyal</p>
              <h2 id="mutu-title" className="mt-1.5 text-[20px] leading-tight text-paper-50">Apa yang boleh disimpulkan</h2>
            </div>
            <IconSpark size={18} className="text-teal-bright" />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4">
            <div>
              <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-paper-50/40">AUC in-sample</p>
              <p className="display-num mt-1 text-[28px] leading-none text-paper-50">{formatDecimal(metrics.inSampleAuc, 3)}</p>
              <p className="mt-1 text-[9px] text-paper-50/45">bukan akurasi luar sampel</p>
            </div>
            <div>
              <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-paper-50/40">Separasi median</p>
              <p className="display-num mt-1 text-[28px] leading-none text-paper-50">{formatDecimal(metrics.separation, 2)}</p>
              <p className="mt-1 text-[9px] text-paper-50/45">jarak skor dua kelas bintang</p>
            </div>
            <div>
              <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-paper-50/40">Dukungan minimum</p>
              <p className="num mt-1 text-[16px] font-semibold text-paper-50">{formatNumber(metrics.minSupport)} dokumen</p>
              <p className="mt-1 text-[9px] text-paper-50/45">penyusutan n/(n+{formatNumber(metrics.supportShrinkage)})</p>
            </div>
            <div>
              <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-paper-50/40">Smoothing</p>
              <p className="num mt-1 text-[16px] font-semibold text-paper-50">{metrics.smoothing || 'N/A'}</p>
              <p className="mt-1 text-[9px] text-paper-50/45">Jeffreys untuk kelas tidak seimbang</p>
            </div>
          </div>
          <div className="mt-5 rounded-xl border border-paper-50/10 bg-paper-50/[0.045] p-3">
            <p className="text-[9.5px] leading-relaxed text-paper-50/60">
              <span className="font-bold text-paper-50/80">Bukan probabilitas.</span> NSS adalah selisih porsi label, bukan keyakinan model. AUC dihitung pada data yang sama yang membentuk bobot, sehingga tidak membuktikan performa pada data baru.
            </p>
          </div>
          <p className="mt-3 font-mono text-[8.5px] leading-relaxed text-paper-50/30">
            w = clamp(ln(P(kata|4–5★)/P(kata|1–2★)) × dukungan, −4, +4)
          </p>
        </section>
      </div>

      <section className="surface p-5 sm:p-6" aria-labelledby="istilah-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="rule-label">Kosakata terpelajar</div>
            <h2 id="istilah-title" className="mt-1.5 text-[20px] leading-tight text-ink">Istilah dengan bobot terkuat</h2>
          </div>
          <span className="text-[9.5px] text-ink-faint">Dukungan = jumlah ulasan yang memuat istilah</span>
        </div>
        <div className="mt-4 grid gap-x-6 gap-y-5 md:grid-cols-2">
          <TermList title="Condong ke bintang 4–5" terms={Array.isArray(terms.positive) ? terms.positive : []} tone="positive" />
          <TermList title="Condong ke bintang 1–2" terms={Array.isArray(terms.negative) ? terms.negative : []} tone="negative" />
        </div>
        <div className="mt-5 grid gap-3 border-t border-line/70 pt-4 sm:grid-cols-2">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-ink-faint">Kandidat frekuensi yang dilindungi</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(terms.protectedStopwords || []).length ? terms.protectedStopwords.map(entry => (
                <span key={entry.term} className="rounded-full border border-amber/25 bg-amber-soft/50 px-2 py-0.5 text-[9.5px] font-semibold text-amber-deep" title={`${entry.count} kemunculan; sinyal ${formatDecimal(entry.signal, 2)}`}>
                  {entry.term} <span className="num font-normal opacity-65">{formatNumber(entry.count)}×</span>
                </span>
              )) : <span className="text-[10px] text-ink-faint">Tidak ada kandidat yang perlu dilindungi.</span>}
            </div>
            <p className="mt-2 text-[9px] leading-relaxed text-ink-faint">Kata paling sering yang tetap dipertahankan karena memisahkan kelas rating lebih kuat daripada sekadar kata struktur.</p>
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-ink-faint">Stopwords dinamis yang dibuang</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(terms.stopwords || []).length ? terms.stopwords.map(entry => (
                <span key={entry.term} className="rounded-full border border-line bg-paper-200/60 px-2 py-0.5 text-[9.5px] font-medium text-ink-faint line-through decoration-line-strong" title={`${entry.count} kemunculan`}>
                  {entry.term}
                </span>
              )) : <span className="text-[10px] text-ink-faint">Belum ada stopword yang dibuang.</span>}
            </div>
            <p className="mt-2 text-[9px] leading-relaxed text-ink-faint">Dihitung dari frekuensi korpus saat tarikan berjalan; daftar ini berbeda untuk setiap dataset.</p>
          </div>
        </div>
      </section>

      <section className="surface p-5 sm:p-6" aria-labelledby="klaster-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="rule-label">Peta ko-okurensi</div>
            <h2 id="klaster-title" className="mt-1.5 text-[20px] leading-tight text-ink">Klaster keluhan mentah</h2>
            <p className="mt-1 text-[10px] leading-relaxed text-ink-faint">Terbentuk dari istilah berbobot negatif pada ulasan 1–2★. Satu ulasan dapat muncul di beberapa klaster.</p>
          </div>
          <span className="chip">{formatNumber(clusters.length)} klaster</span>
        </div>
        {clusters.length ? (
          <div className="scrollbar-soft mt-4 overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line/80 text-[8.5px] font-bold uppercase tracking-[0.12em] text-ink-faint">
                  <th className="py-2 pr-3 font-bold">#</th>
                  <th className="py-2 pr-3 font-bold">Istilah klaster</th>
                  <th className="py-2 pr-3 text-right font-bold">Ulasan</th>
                  <th className="py-2 pr-3 text-right font-bold">Porsi</th>
                  <th className="py-2 pr-3 text-right font-bold">Frekuensi</th>
                  <th className="py-2 text-right font-bold">Ambang</th>
                </tr>
              </thead>
              <tbody>
                {clusters.map((cluster, index) => (
                  <tr key={cluster.id} className="border-b border-line/45 last:border-0">
                    <td className="num py-2.5 pr-3 text-[9px] text-ink-faint">{String(index + 1).padStart(2, '0')}</td>
                    <td className="py-2.5 pr-3">
                      <div className="flex flex-wrap items-center gap-1">
                        {cluster.terms.map(term => (
                          <span key={term} className="rounded bg-paper-200/70 px-1.5 py-0.5 font-mono text-[9px] text-ink-soft">{term}</span>
                        ))}
                      </div>
                    </td>
                    <td className="num py-2.5 pr-3 text-right text-[10.5px] font-semibold text-ink-soft">{formatNumber(cluster.count)}</td>
                    <td className="num py-2.5 pr-3 text-right text-[10px] text-ink-muted">{formatPercent(cluster.share, 100)}</td>
                    <td className="num py-2.5 pr-3 text-right text-[10px] text-ink-muted">{formatNumber(cluster.frequency)}</td>
                    <td className="num py-2.5 text-right text-[10px] text-ink-muted">{isNumber(cluster.threshold) ? `${formatDecimal(toNumber(cluster.threshold) * 100, 1)}%` : 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState compact icon={IconInfo} title="Belum ada klaster" body="Tidak ada kelompok istilah yang lolos ambang ko-okurensi pada korpus ini." />
        )}
      </section>

      <div>
        <ChannelStrip dataset={dataset} workspace={workspace} />
      </div>

      <section className="surface p-5 sm:p-6" aria-labelledby="audit-sumber-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="rule-label">Jejak sumber</div>
            <h2 id="audit-sumber-title" className="mt-1.5 text-[20px] leading-tight text-ink">Audit kanal & cache</h2>
            <p className="mt-1 text-[10px] leading-relaxed text-ink-faint">Angka toko ditampilkan apa adanya; tidak dipaksa sama dengan jumlah yang berhasil dibaca.</p>
          </div>
          <span className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-ink-faint">cache {formatNumber((dataset.cache?.ttlMs || 0) / 60000)} menit</span>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {['play', 'appstore'].map(store => (
            <ChannelAuditCard key={store} store={store} channel={channelById.get(store)} workspaceStore={workspace.stores?.[store]} />
          ))}
        </div>
      </section>

      <section className="surface p-5 sm:p-6" aria-labelledby="workspace-meta-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="rule-label">Ruang kerja</div>
            <h2 id="workspace-meta-title" className="mt-1.5 text-[20px] leading-tight text-ink">Metadata & salinan lokal</h2>
          </div>
          <button type="button" onClick={onExport} className="btn btn-primary btn-sm">
            <IconDownload size={14} /> Unduh snapshot
          </button>
        </div>
        <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Nama analisis', workspace.label],
            ['Entitas', workspace.entity],
            ['Dibuat', formatDateTime(workspace.createdAt)],
            ['Diperbarui', formatDateTime(workspace.updatedAt)],
            ['Snapshot', formatDateTime(dataset.fetchedAt)],
            ['Mesin', dataset.engine?.version || 'N/A'],
            ['Supervisi', dataset.engine?.supervision === 'weak-rating' ? 'sinyal bintang lemah' : dataset.engine?.supervision || 'N/A'],
            ['Ukuran data', formatBytes(snapshotBytes)],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-[8px] font-bold uppercase tracking-[0.12em] text-ink-faint">{label}</dt>
              <dd className="mt-1 break-words text-[10.5px] font-semibold leading-relaxed text-ink-soft">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-line/70 bg-paper-100/60 p-3">
          <IconInfo size={14} className="mt-0.5 shrink-0 text-ink-faint" />
          <p className="text-[9.5px] leading-relaxed text-ink-faint">
            Snapshot ini disimpan di localStorage peramban, bukan di akun server. Ekspor JSON memuat seluruh ulasan, analisis per baris, model, dan metadata kanal tanpa memotong sampel. Tidak ada jalur impor.
          </p>
        </div>
        {metadataWarning(metrics, labels) && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber/25 bg-amber-soft/40 p-3">
            <IconAlert size={14} className="mt-0.5 shrink-0 text-amber-deep" />
            <p className="text-[9.5px] leading-relaxed text-amber-deep">{metadataWarning(metrics, labels)}</p>
          </div>
        )}
        <p className="mt-3 font-mono text-[8.5px] text-ink-faint">workspace {workspace.id}</p>
      </section>
    </div>
  );
}

function metadataWarning(metrics, labels) {
  if (labels.unclassified > 0) {
    return `${formatNumber(labels.unclassified)} ulasan tidak memiliki istilah terpelajari yang cocok atau tidak berteks, sehingga tidak diberi label. Nilai itu tidak dipaksa menjadi netral.`;
  }
  if (Number(metrics.inSampleAuc) >= 0.9) {
    return 'AUC tinggi di sini dihitung pada data yang sama dengan proses pembelajaran (in-sample). Jangan membacanya sebagai akurasi di luar sampel.';
  }
  return null;
}
