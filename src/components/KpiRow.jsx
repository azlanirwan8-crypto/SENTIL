import { formatDecimal, formatNumber, formatNss, formatPercent, isNumber, platformLabel, toNumber } from '../lib/format.js';
import { IconStar } from './icons.jsx';
import { storeColor } from './charts/palette.js';

function Card({ eyebrow, children, dark = false, className = '' }) {
  return (
    <article className={`relative flex min-h-[176px] flex-col justify-between overflow-hidden rounded-[20px] border p-5 transition-shadow hover:shadow-lift ${
      dark
        ? 'dark-panel noise-dark border-ink text-paper-50'
        : 'border-line/80 bg-paper-50/90 text-ink shadow-panel'
    } ${className}`}>
      <p className={`text-[9px] font-bold uppercase tracking-[0.19em] ${dark ? 'text-paper-50/45' : 'text-ink-faint'}`}>{eyebrow}</p>
      {children}
    </article>
  );
}

function NssDirection({ value }) {
  if (value == null) return 'belum tersedia';
  if (value >= 60) return 'sangat positif';
  if (value >= 20) return 'condong positif';
  if (value > -20) return 'berimbang';
  if (value > -60) return 'condong negatif';
  return 'sangat negatif';
}

export function KpiRow({ dataset }) {
  const summary = dataset.summary || {};
  const model = dataset.model || {};
  const reviews = Array.isArray(dataset.reviews) ? dataset.reviews : [];
  const total = Number(summary.reviews) || reviews.length;
  const analyzed = Number(summary.analyzed) || 0;
  const nss = isNumber(summary.nss) ? toNumber(summary.nss) : null;
  const channelTotals = (summary.channels || [])
    .filter(channel => isNumber(channel.fetched) && toNumber(channel.fetched) > 0)
    .map(channel => ({ ...channel, count: toNumber(channel.fetched) }));
  const channelSum = channelTotals.reduce((sum, channel) => sum + channel.count, 0) || 1;

  const ratingCounts = [1, 2, 3, 4, 5].map(stars => ({
    stars,
    count: reviews.filter(review => review.rating === stars).length,
  }));
  const rated = ratingCounts.reduce((sum, entry) => sum + entry.count, 0);
  const maxRatingCount = Math.max(1, ...ratingCounts.map(entry => entry.count));
  const avgRating = isNumber(summary.avgRating) ? toNumber(summary.avgRating) : null;

  return (
    <section aria-label="Indikator utama analisis" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Card eyebrow="01 · Volume terbaca">
        <div>
          <div className="flex items-end gap-2">
            <span className="display-num text-[48px] leading-none text-ink">{formatNumber(total)}</span>
            <span className="mb-1 text-[11px] font-semibold text-ink-faint">ulasan</span>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
            <span className="font-semibold text-ink-soft">{formatNumber(summary.withText)}</span> berteks · <span className="font-semibold text-ink-soft">{formatNumber(summary.withoutText)}</span> tanpa teks
          </p>
        </div>
        <div>
          <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-line/60" role="img" aria-label={channelTotals.map(channel => `${platformLabel(channel.id)} ${channel.count}`).join(', ')}>
            {channelTotals.map(channel => (
              <span key={channel.id} style={{ width: `${(channel.count / channelSum) * 100}%`, backgroundColor: storeColor(channel.id) }} />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            {channelTotals.map(channel => (
              <span key={channel.id} className="inline-flex items-center gap-1 text-[9.5px] text-ink-faint">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: storeColor(channel.id) }} />
                {platformLabel(channel.id)} <span className="num font-semibold text-ink-soft">{formatNumber(channel.count)}</span>
              </span>
            ))}
            {!channelTotals.length && <span className="text-[9.5px] text-ink-faint">Tidak ada kanal terbaca</span>}
          </div>
        </div>
      </Card>

      <Card eyebrow="02 · Cakupan klasifikasi">
        <div>
          <div className="flex items-end gap-2">
            <span className="display-num text-[48px] leading-none text-ink">{total ? formatPercent(analyzed, total) : 'N/A'}</span>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
            <span className="font-semibold text-ink-soft">{formatNumber(analyzed)}</span> dari <span className="font-semibold text-ink-soft">{formatNumber(total)}</span> punya skor kata
          </p>
        </div>
        <div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-line/60">
            <span className="block h-full rounded-full bg-teal transition-all duration-700" style={{ width: `${total ? (analyzed / total) * 100 : 0}%` }} />
          </div>
          <p className="mt-2 text-[9.5px] leading-relaxed text-ink-faint">
            {formatNumber(summary.unclassified)} tak terklasifikasi · {formatNumber(model.metrics?.learnedTerms)} istilah dipelajari
          </p>
        </div>
      </Card>

      <Card eyebrow="03 · Net sentiment" dark>
        <div>
          <div className="flex items-end gap-2">
            <span className="display-num text-[48px] leading-none text-paper-50">{nss == null ? 'N/A' : formatNss(nss)}</span>
            <span className="mb-1 text-[10px] font-semibold text-paper-50/45">/ ±100</span>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-paper-50/60">
            Arah label <span className="font-semibold text-paper-50/90">{NssDirection({ value: nss })}</span> · n={formatNumber(analyzed)}
          </p>
        </div>
        <div>
          <div className="relative h-1.5 rounded-full" style={{ background: 'linear-gradient(90deg, #D46A51, #8E9A92 50%, #2B9C83)' }}>
            {nss != null && (
              <span
                className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px] border-ink bg-paper-50 shadow"
                style={{ left: `${((Math.max(-100, Math.min(100, nss)) + 100) / 200) * 100}%` }}
              />
            )}
          </div>
          <div className="mt-1.5 flex justify-between text-[8.5px] font-semibold uppercase tracking-[0.1em] text-paper-50/35">
            <span>−100</span><span>0</span><span>+100</span>
          </div>
          <p className="mt-2 text-[9px] leading-relaxed text-paper-50/40">Dihitung dari label lemah, bukan probabilitas.</p>
        </div>
      </Card>

      <Card eyebrow="04 · Bintang ulasan">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="flex items-end gap-1.5">
              <span className="display-num text-[48px] leading-none text-ink">{avgRating == null ? 'N/A' : formatDecimal(avgRating, 2)}</span>
              {avgRating != null && <IconStar size={17} className="mb-1.5 text-amber-bright" />}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
              dari <span className="font-semibold text-ink-soft">{formatNumber(rated)}</span> ulasan berating
            </p>
          </div>
          <div className="flex h-[54px] shrink-0 items-end gap-1.5" role="img" aria-label={ratingCounts.map(entry => `${entry.stars} bintang: ${entry.count}`).join(', ')}>
            {ratingCounts.map(entry => {
              const tone = entry.stars <= 2 ? 'bg-coral/75' : entry.stars === 3 ? 'bg-amber/75' : 'bg-teal/80';
              return (
                <span key={entry.stars} className="flex h-full w-[11px] flex-col items-center justify-end gap-1" title={`${entry.stars} bintang: ${entry.count} ulasan`}>
                  <span className={`w-full rounded-sm ${tone}`} style={{ height: `${Math.max(entry.count ? 12 : 2, (entry.count / maxRatingCount) * 42)}px` }} />
                  <span className="text-[7.5px] leading-none text-ink-faint">{entry.stars}</span>
                </span>
              );
            })}
          </div>
        </div>
        <p className="text-[9px] leading-relaxed text-ink-faint">Bintang adalah sinyal lemah untuk mempelajari bobot kata.</p>
      </Card>
    </section>
  );
}
