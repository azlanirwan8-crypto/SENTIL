import { useState } from 'react';
import { formatNumber, formatPercent, isNumber, toNumber } from '../../lib/format.js';
import { EmptyState } from '../EmptyState.jsx';
import { IconGrid } from '../icons.jsx';
import { ChartFrame } from './ChartFrame.jsx';
import { SERIES_COLORS } from './palette.js';

const LABEL_WIDTH = 132;

const wordsOf = topic => (Array.isArray(topic.matchedTerms) ? topic.matchedTerms.slice(0, 4).map(entry => entry.term) : []);

// Bar chart paling atas menentukan apa yang dibaca orang di seluruh panel ini, jadi urutannya
// tidak boleh menyerah pada alphabet: keluhan terbanyak di atas, dan nama bar adalah istilah
// fitur dari kamus domain, bukan kata yang dipungut dari kalimat ulasan.
export function TopicMap({ topics, filtered = false }) {
  const [selected, setSelected] = useState(null);
  const data = (Array.isArray(topics) ? topics : [])
    .filter(topic => Number(topic.low) > 0)
    .sort((a, b) => b.low - a.low || String(a.id).localeCompare(String(b.id)));
  const max = Math.max(1, ...data.map(topic => topic.low));

  if (!data.length) {
    return (
      <ChartFrame label="Complaint map">
        <EmptyState
          compact
          icon={IconGrid}
          title="No complaint topic yet"
          body="Reviews were read, but none of them matched a feature term in the domain dictionary. Nothing is forced into a topic to fill this chart."
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
      <div role="group" aria-label="Complaint topics named by the domain dictionary" className="flex flex-1 flex-col justify-between gap-0.5 py-0.5">
        {data.map(topic => {
          const activeRow = selected === topic.id;
          const complaintWidth = Math.max(1.5, (topic.low / max) * 100);
          const praiseWidth = Math.max(0, Math.min(100 - complaintWidth, (topic.high / max) * 100));
          const words = wordsOf(topic);
          return (
            <button
              key={topic.id}
              type="button"
              onClick={() => setSelected(current => (current === topic.id ? null : topic.id))}
              aria-pressed={activeRow}
              aria-label={`${topic.name}: ${formatNumber(topic.low)} 1–2 star reviews, ${formatPercent(topic.share, 100)} of the complaint pool, ${formatNumber(topic.high)} 4–5 star reviews.`}
              title={words.length ? `Reviewers wrote: ${words.join(', ')}` : 'Named by the domain dictionary'}
              className={`flex w-full items-center gap-2 rounded px-1 py-[3px] text-left transition ${activeRow ? 'bg-slate-800/70' : 'hover:bg-slate-800/40'}`}
            >
              <span className={`shrink-0 truncate text-[10px] font-semibold ${activeRow ? 'text-slate-50' : 'text-slate-300'}`} style={{ width: LABEL_WIDTH }}>
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
            {active.nameId && <span className="text-[10px] text-slate-400">{active.nameId}</span>}
            {active.clusterName && (
              <span className="rounded bg-slate-800/70 px-1.5 py-0.5 text-[10px] text-slate-200">{active.clusterName.en}</span>
            )}
            <span className="num text-[10px] text-slate-400">
              {formatNumber(active.low)} complaints · {formatNumber(active.mid)} neutral · {formatNumber(active.high)} praise
              {active.unrated ? ` · ${formatNumber(active.unrated)} unstarred` : ''}
            </span>
            {isNumber(active.complaintRate) && (
              <span className="num text-[10px] text-slate-400">{Math.round(toNumber(active.complaintRate))}% of its mentions are complaints</span>
            )}
            {wordsOf(active).length > 0 && (
              <span className="font-mono text-[10px] text-slate-400">matched: {wordsOf(active).join(', ')}</span>
            )}
          </div>
        ) : (
          <p className="text-[10px] leading-relaxed text-slate-400">
            Each bar is a product feature named by the domain dictionary, counted across 1–2★ reviews; the green segment counts
            4–5★ reviews using the same words. Names come from the dictionary in English and Indonesian, never from filler words
            inside a review. One review can carry several topics, so the bars do not add up to 100%.
          </p>
        )}
      </div>
    </ChartFrame>
  );
}
