import { useState } from 'react';

import { formatNumber, formatPercent } from '../lib/format.js';
import { EmptyState } from './EmptyState.jsx';
import { ChartFrame } from './charts/ChartFrame.jsx';
import { IconLayers } from './icons.jsx';

// Panel ini hanya membaca lapisan label yang sudah dihitung mesin. Tidak ada satu pun nama di
// sini yang ditulis di berkas klien: setiap baris adalah frasa yang benar-benar bersebelahan di
// ulasan 1-2★, dan jumlah ulasannya adalah union ulasan berbeda, bukan penjumlahan frasa.

function Header({ children, className = '' }) {
  return <th scope="col" className={`label py-1 pr-3 text-left font-semibold ${className}`}>{children}</th>;
}

export function PainLabels({ pain, filtered = false }) {
  const [open, setOpen] = useState(null);

  if (!pain || !Array.isArray(pain.items) || !pain.items.length) {
    return (
      <ChartFrame label="Complaint labels">
        <EmptyState
          compact
          icon={IconLayers}
          title="No complaint phrase yet"
          body="A label is built only from phrases that live in 1–2★ reviews and are absent from 4–5★ reviews. A corpus without both pools, or without repeated wording, cannot produce one."
        />
      </ChartFrame>
    );
  }

  if (!Array.isArray(pain.labels)) {
    return (
      <ChartFrame label="Complaint labels" meta={`${formatNumber(pain.items.length)} phrases stored`}>
        <EmptyState
          compact
          icon={IconLayers}
          title="This snapshot predates the label layer"
          body={`Phrases were stored by ${pain.version || 'an older version'}, which had no clustering step. Pull this project again to build labels from the same phrases.`}
        />
      </ChartFrame>
    );
  }

  const labels = pain.labels;
  const metrics = pain.labelMetrics || {};
  const pool = pain.pools?.negative || 0;
  const ceiling = Math.max(1, ...labels.map(entry => entry.reviewCount));

  if (!labels.length) {
    return (
      <ChartFrame label="Complaint labels" meta={`${formatNumber(pain.items.length)} phrases · ${formatNumber(metrics.phrases || 0)} clustered`}>
        <EmptyState
          compact
          icon={IconLayers}
          title="No phrase survived the label test"
          body={`${formatNumber(pain.metrics?.matchedReviews || 0)} of ${formatNumber(pool)} 1–2★ reviews carry a stored phrase, but none of them share wording often enough to cluster. Nothing was invented to fill this panel.`}
        />
      </ChartFrame>
    );
  }

  const clusters = metrics.clusters || labels.length;
  const meta = `${labels.length === clusters ? `${formatNumber(clusters)} clusters` : `${labels.length} of ${formatNumber(clusters)} clusters`} · ${formatNumber(pool)} 1–2★ reviews${filtered ? ' · whole corpus' : ''}`;
  const singletons = metrics.singletons || 0;

  return (
    <ChartFrame
      label="Complaint labels"
      meta={meta}
      legend={<span className="text-[10px] text-slate-400">click a label for its phrases</span>}
      bodyClassName="flex flex-col"
    >
      <div className="min-h-0 flex-1 overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-800">
              <Header>Label</Header>
              <Header className="w-[62px] text-right">Phrases</Header>
              <Header className="w-[58px] text-right">1–2★</Header>
              <Header className="w-[52px] text-right">Share</Header>
              <Header className="w-[52px] text-right">4–5★</Header>
              <Header className="w-[64px] text-right">Severity</Header>
            </tr>
          </thead>
          <tbody>
            {labels.map((entry, index) => {
              const active = open === entry.id;
              const width = Math.max(2, (entry.reviewCount / ceiling) * 100);
              return (
                <tr key={entry.id} className={`border-b border-slate-800/50 last:border-0 ${active ? 'bg-slate-800/40' : ''}`}>
                  <th scope="row" className="py-1 pr-3 text-left font-normal">
                    <button
                      type="button"
                      onClick={() => setOpen(active ? null : entry.id)}
                      aria-expanded={active}
                      aria-controls={`label-detail-${index}`}
                      aria-label={`${entry.label}: ${formatNumber(entry.reviewCount)} of ${formatNumber(pool)} 1–2 star reviews, ${formatNumber(entry.phraseCount)} phrase${entry.phraseCount === 1 ? '' : 's'}.`}
                      className="group flex w-full items-center gap-2 text-left"
                    >
                      <span className="relative h-3 w-full max-w-[120px] shrink-0 overflow-hidden rounded-[2px] bg-slate-800/50">
                        <span className="absolute inset-y-0 left-0 rounded-[2px] bg-neg/70" style={{ width: `${width}%` }} />
                      </span>
                      <span className={`min-w-0 truncate text-[11px] font-semibold ${active ? 'text-slate-50' : 'text-slate-200 group-hover:text-slate-50'}`}>
                        {entry.label}
                      </span>
                      {entry.phraseCount > 1 ? null : (
                        <span className="shrink-0 rounded border border-slate-700/70 px-1 text-[9px] uppercase tracking-wider text-slate-500">single</span>
                      )}
                    </button>
                    {active ? (
                      <div id={`label-detail-${index}`} role="group" aria-label={`Phrases inside the cluster named ${entry.label}`} className="mt-1 rounded border border-slate-800/80 bg-slate-950/60 px-2 py-1.5">
                        <p className="label-sm">Phrases in this cluster · {formatNumber(entry.phraseCount)}</p>
                        <ul className="mt-1 space-y-0.5">
                          {entry.phrases.map(phrase => (
                            <li key={phrase.text} className="flex items-baseline justify-between gap-2">
                              <span className="min-w-0 truncate font-mono text-[10px] text-slate-300">{phrase.text}</span>
                              <span className="num shrink-0 text-[10px] text-slate-500">
                                1–2★ {formatNumber(phrase.dfNegative)}
                                {phrase.dfPositive ? ` · 4–5★ ${formatNumber(phrase.dfPositive)}` : ''}
                              </span>
                            </li>
                          ))}
                        </ul>
                        <p className="mt-1 border-t border-slate-800/70 pt-1 text-[10px] leading-relaxed text-slate-400">
                          {formatNumber(entry.reviewCount)} distinct reviews mention at least one of these phrases. Counting each phrase
                          separately would report {formatNumber(entry.phrases.reduce((sum, phrase) => sum + phrase.dfNegative, 0))} findings from the same people.
                        </p>
                      </div>
                    ) : null}
                  </th>
                  <td className="num py-1 pr-3 text-right text-[11px] text-slate-400">{formatNumber(entry.phraseCount)}</td>
                  <td className="num py-1 pr-3 text-right text-[12px] font-bold text-slate-100">{formatNumber(entry.reviewCount)}</td>
                  <td className="num py-1 pr-3 text-right text-[11px] text-neg">{formatPercent(entry.reviewCount, pool)}</td>
                  <td className="num py-1 pr-3 text-right text-[11px] text-slate-400">
                    {entry.praiseCount == null ? '—' : formatNumber(entry.praiseCount)}
                  </td>
                  <td className="num py-1 pr-3 text-right text-[11px] text-slate-400">{entry.severity == null ? '—' : entry.severity.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 shrink-0 text-[10px] leading-relaxed text-slate-400">
        A label is a phrase real reviewers wrote, not a category chosen by a model. Two phrases share one label only when the reviews carrying
        both outnumber what chance explains (z&gt;1, Jeffreys-smoothed). {formatNumber(singletons)} {singletons === 1 ? 'label is' : 'labels are'} a cluster of a single phrase;{' '}
        {metrics.trimmedLabels
          ? <>{formatNumber(metrics.trimmedLabels)} clusters fell outside the display budget and are counted in the metrics instead of being dropped silently.</>
          : 'every cluster fits the display budget.'}
        {filtered ? ' Counts cover the whole corpus, not the active filter.' : ''}
      </p>
    </ChartFrame>
  );
}
