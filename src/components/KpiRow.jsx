import { formatDecimal, formatNumber, formatNss, formatPercent, isNumber, platformLabel, toNumber } from '../lib/format.js';
import { IconStar } from './icons.jsx';
import { storeColor } from './charts/palette.js';

function Cell({ label, children, accent }) {
  return (
    <div className="flex min-w-0 flex-col justify-between gap-2 border-b border-slate-800/70 p-3 odd:border-r xl:border-b-0 xl:odd:border-r-0 xl:border-l xl:first:border-l-0">
      <p className={`label ${accent ? 'text-accent' : ''}`}>{label}</p>
      {children}
    </div>
  );
}

function direction(value) {
  if (value == null) return 'not available yet';
  if (value >= 60) return 'very positive';
  if (value >= 20) return 'tilts positive';
  if (value > -20) return 'balanced';
  if (value > -60) return 'tilts negative';
  return 'very negative';
}

export function KpiRow({ dataset }) {
  const summary = dataset.summary || {};
  const model = dataset.model || {};
  const reviews = Array.isArray(dataset.reviews) ? dataset.reviews : [];
  const total = Number(summary.reviews) || reviews.length;
  const analyzed = Number(summary.analyzed) || 0;
  const nss = isNumber(summary.nss) ? toNumber(summary.nss) : null;
  const avgRating = isNumber(summary.avgRating) ? toNumber(summary.avgRating) : null;
  const channelTotals = (summary.channels || [])
    .filter(channel => isNumber(channel.fetched) && toNumber(channel.fetched) > 0)
    .map(channel => ({ id: channel.id, count: toNumber(channel.fetched) }));
  const channelSum = channelTotals.reduce((sum, channel) => sum + channel.count, 0) || 1;

  const ratingCounts = [1, 2, 3, 4, 5].map(stars => ({ stars, count: reviews.filter(review => review.rating === stars).length }));
  const rated = ratingCounts.reduce((sum, entry) => sum + entry.count, 0);
  const maxRatingCount = Math.max(1, ...ratingCounts.map(entry => entry.count));

  return (
    <section aria-label="Headline indicators" className="card grid grid-cols-2 overflow-hidden xl:grid-cols-4">
      <Cell label="Reviews read">
        <div>
          <div className="flex items-baseline gap-1.5">
            <span className="metric">{formatNumber(total)}</span>
            <span className="text-[10px] font-semibold text-slate-400">reviews</span>
          </div>
          <div className="mt-2 flex h-1 rounded-full bg-slate-800" role="group" aria-label="Reviews per channel">
            {channelTotals.map((channel, index) => {
              const color = storeColor(channel.id);
              const tipAlign = index === 0 ? 'left-0' : index === channelTotals.length - 1 ? 'right-0' : 'left-1/2 -translate-x-1/2';
              return (
                <span
                  key={channel.id}
                  tabIndex={0}
                  role="img"
                  aria-label={`${platformLabel(channel.id)}: ${formatNumber(channel.count)} reviews, ${formatPercent(channel.count, channelSum)} of the reviews read`}
                  className={`group/seg relative outline-none focus-visible:z-10 ${channelTotals.length === 1 ? 'rounded-full' : index === 0 ? 'rounded-l-full' : index === channelTotals.length - 1 ? 'rounded-r-full' : ''}`}
                  style={{ width: `${(channel.count / channelSum) * 100}%`, backgroundColor: color }}
                >
                  <span className="absolute inset-x-0 -inset-y-1.5 cursor-default" aria-hidden="true" />
                  <span className={`pointer-events-none absolute bottom-full z-10 mb-1.5 whitespace-nowrap rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] font-semibold text-slate-200 opacity-0 shadow-lg shadow-black/50 transition-opacity duration-100 group-hover/seg:opacity-100 group-focus/seg:opacity-100 ${tipAlign}`}>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-[1px]" style={{ backgroundColor: color }} />
                      {platformLabel(channel.id)} <span className="num font-bold" style={{ color }}>{formatNumber(channel.count)}</span>
                      <span className="num font-normal text-slate-500">{formatPercent(channel.count, channelSum)}</span>
                    </span>
                  </span>
                </span>
              );
            })}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-2.5 text-[10px] text-slate-400">
            {isNumber(summary.withText) && (
              <span className="num">{formatNumber(summary.withText)} with text · {formatNumber(summary.withoutText)} without text</span>
            )}
          </div>
        </div>
      </Cell>

      <Cell label="Classification coverage">
        <div>
          <div className="flex items-baseline gap-1.5">
            <span className="metric">{total ? formatPercent(analyzed, total) : 'N/A'}</span>
            <span className="num text-[10px] text-slate-400">{formatNumber(analyzed)}/{formatNumber(total)}</span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800">
            <span className="block h-full rounded-full bg-pos transition-all duration-700" style={{ width: `${total ? (analyzed / total) * 100 : 0}%` }} />
          </div>
          <p className="mt-1.5 text-[10px] text-slate-400">
            <span className="num">{formatNumber(summary.unclassified)}</span> unclassified · <span className="num">{formatNumber(model.metrics?.learnedTerms)}</span> learned terms
          </p>
        </div>
      </Cell>

      <Cell label="NSS · weak labels" accent>
        <div>
          <div className="flex items-baseline gap-1.5">
            <span className="metric text-accent">{nss == null ? 'N/A' : formatNss(nss)}</span>
            <span className="text-[10px] text-slate-400">±100</span>
          </div>
          <div className="relative mt-2 h-1 rounded-full" style={{ background: 'linear-gradient(90deg,#FB7185,#475569 50%,#34D399)' }}>
            {nss != null && (
              <span
                className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-slate-950 bg-slate-100"
                style={{ left: `${((Math.max(-100, Math.min(100, nss)) + 100) / 200) * 100}%` }}
              />
            )}
          </div>
          <p className="mt-1.5 text-[10px] text-slate-400">
            {direction(nss)} · n=<span className="num">{formatNumber(analyzed)}</span> · not a probability
          </p>
        </div>
      </Cell>

      <Cell label="Average stars">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-1">
              <span className="metric">{avgRating == null ? 'N/A' : formatDecimal(avgRating, 2)}</span>
              {avgRating != null && <IconStar size={13} className="mb-0.5 text-neu" />}
            </div>
            <p className="mt-1.5 text-[10px] text-slate-400">from <span className="num">{formatNumber(rated)}</span> rated reviews · weak signal</p>
          </div>
          <div className="flex h-[38px] shrink-0 items-end gap-1" role="img" aria-label={ratingCounts.map(entry => `${entry.stars} stars: ${entry.count}`).join(', ')}>
            {ratingCounts.map(entry => (
              <span key={entry.stars} className="flex flex-col items-center gap-1" title={`${entry.stars}★: ${entry.count} reviews`}>
                <span
                  className={`w-[7px] rounded-[1px] ${entry.stars <= 2 ? 'bg-neg/70' : entry.stars === 3 ? 'bg-neu/70' : 'bg-pos/70'}`}
                  style={{ height: `${Math.max(entry.count ? 6 : 2, (entry.count / maxRatingCount) * 30)}px` }}
                />
                <span className="num text-[10px] leading-none text-slate-400">{entry.stars}</span>
              </span>
            ))}
          </div>
        </div>
      </Cell>
    </section>
  );
}
