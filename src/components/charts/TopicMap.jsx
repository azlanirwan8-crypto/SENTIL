import { useState } from 'react';
import { formatNumber, formatPercent, isNumber, toNumber } from '../../lib/format.js';
import { EmptyState } from '../EmptyState.jsx';
import { IconGrid } from '../icons.jsx';
import { ChartFrame } from './ChartFrame.jsx';
import { SERIES_COLORS } from './palette.js';

const LABEL_WIDTH = 96;

export function TopicMap({ topics, filtered = false }) {
  const [selected, setSelected] = useState(null);
  const data = Array.isArray(topics) ? topics.filter(topic => Number(topic.low) > 0) : [];
  const max = Math.max(1, ...data.map(topic => topic.low));

  if (!data.length) {
    return (
      <ChartFrame label="Complaint map">
        <EmptyState
          compact
          icon={IconGrid}
          title="No complaint topic yet"
          body="Topics come from feature terms in the app's own store listing. While that text has not been read, no topic can be named."
        />
      </ChartFrame>
    );
  }

  const active = data.find(topic => topic.id === selected) || null;

  return (
    <ChartFrame
      label="Complaint map"
      meta={`${data.length} topics · ${formatNumber(data.reduce((sum, topic) => sum + topic.low, 0))} 1–2★ reviews${filtered ? ' in filter' : ''}`}
      legend={active
        ? (
          <button type="button" onClick={() => setSelected(null)} className="text-[10px] font-semibold text-slate-400 hover:text-slate-200">
            close detail
          </button>
        )
        : <span className="text-[10px] text-slate-400">click a topic for details</span>}
      className="h-full"
      bodyClassName="flex flex-col"
    >
      <div role="group" aria-label="Complaint topics taken from the store listing text" className="flex flex-1 flex-col justify-between gap-0.5 py-0.5">
        {data.map(topic => {
          const activeRow = selected === topic.id;
          const complaintWidth = Math.max(1.5, (topic.low / max) * 100);
          const praiseWidth = Math.max(0, Math.min(100 - complaintWidth, (topic.high / max) * 100));
          return (
            <button
              key={topic.id}
              type="button"
              onClick={() => setSelected(current => (current === topic.id ? null : topic.id))}
              aria-pressed={activeRow}
              aria-label={`${topic.name}: ${formatNumber(topic.low)} 1–2 star reviews, ${formatPercent(topic.share, 100)} of the complaint pool, ${formatNumber(topic.high)} 4–5 star reviews.`}
              title={`Mentioned ${formatNumber(topic.listingMentions)}x in the store listing text`}
              className={`flex w-full items-center gap-2 rounded px-1 py-[3px] text-left transition ${activeRow ? 'bg-slate-800/70' : 'hover:bg-slate-800/40'}`}
            >
              <span className={`shrink-0 truncate font-mono text-[10px] font-semibold uppercase tracking-wider ${activeRow ? 'text-slate-50' : 'text-slate-300'}`} style={{ width: LABEL_WIDTH }}>
                {topic.name}
              </span>
              <span className="relative h-3 min-w-0 flex-1 overflow-hidden rounded-[2px] bg-slate-800/50">
                <span className="absolute inset-y-0 left-0 rounded-[2px]" style={{ width: `${complaintWidth}%`, backgroundColor: SERIES_COLORS.negative, opacity: activeRow ? 1 : 0.82 }} />
                {praiseWidth > 0 && <span className="absolute inset-y-0" style={{ left: `${complaintWidth}%`, width: `${praiseWidth}%`, backgroundColor: SERIES_COLORS.positive, opacity: 0.5 }} />}
              </span>
              <span className="num w-[74px] shrink-0 text-right text-[11px] font-bold leading-none text-slate-100">
                {formatNumber(topic.low)}
                <span className="num ml-1 text-[10px] font-normal text-slate-400">{formatPercent(topic.share, 100)}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-2 min-h-[34px] rounded border border-slate-800/80 bg-slate-950/50 px-2.5 py-1.5">
        {active ? (
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="text-[11px] font-bold text-slate-100">{active.name}</span>
            <span className="num text-[10px] text-slate-400">
              {formatNumber(active.low)} complaints · {formatNumber(active.mid)} neutral · {formatNumber(active.high)} praise
              {active.unrated ? ` · ${formatNumber(active.unrated)} unstarred` : ''}
            </span>
            {isNumber(active.complaintRate) && (
              <span className="num text-[10px] text-slate-400">{Math.round(toNumber(active.complaintRate))}% of its mentions are complaints</span>
            )}
            <span className="num text-[10px] text-slate-400">mentioned {formatNumber(active.listingMentions)}x in the store text</span>
          </div>
        ) : (
          <p className="text-[10px] leading-relaxed text-slate-400">
            Each bar is a feature term the publisher wrote on its own store page, counted across 1–2★ reviews. The green segment shows 4–5★ reviews that use the same term. One review can belong to several topics.
          </p>
        )}
      </div>
    </ChartFrame>
  );
}
