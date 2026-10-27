import { useState } from 'react';
import { formatNumber, formatPercent, isNumber, toNumber } from '../../lib/format.js';
import { bilingual, t, topicAlias, topicLabel } from '../../lib/i18n.js';
import { EmptyState } from '../EmptyState.jsx';
import { IconGrid } from '../icons.jsx';
import { ChartFrame } from './ChartFrame.jsx';
import { BAR_OPACITY, SERIES_COLORS } from './palette.js';

// Di korpus nyata, nama topik terpanjang yang dihasilkan kamus digambar pada 150px; bingkai 132px
// memotong tiga dari 23 baris dan menyisakan "Payment Settlem…". 156px cukup untuk seluruh isi
// kamus, jadi elipsis hanya muncul bila seseorang menambahkan definisi yang lebih panjang.
const LABEL_WIDTH = 156;

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
      <ChartFrame label={t('Complaint map')}>
        <EmptyState
          compact
          icon={IconGrid}
          title={t('No complaint topic yet')}
          body={t('Reviews were read, but none of them matched a feature term in the domain dictionary. Nothing is forced into a topic to fill this chart.')}
        />
      </ChartFrame>
    );
  }

  const active = data.find(topic => topic.id === selected) || null;
  const activeAlias = active ? topicAlias(active) : '';

  return (
    <ChartFrame
      label={t('Complaint map')}
      meta={`${data.length} ${t('topics')} · ${formatNumber(data.reduce((sum, topic) => sum + topic.low, 0))} 1–2★ ${t('reviews')}${filtered ? ` ${t('in filter')}` : ''}`}
      legend={active
        ? (
          <button type="button" onClick={() => setSelected(null)} className="text-[10px] font-semibold text-slate-400 hover:text-slate-200">
            {t('close detail')}
          </button>
        )
        : <span className="text-[10px] text-slate-400">{t('click a topic for details')}</span>}
      className="h-full"
      bodyClassName="flex flex-col"
    >
      <div role="group" aria-label={t('Complaint topics named by the domain dictionary')} className="flex flex-1 flex-col justify-between gap-1 py-1">
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
              aria-label={`${topicLabel(topic)}: ${formatNumber(topic.low)} ${t('1–2 star reviews')}, ${formatPercent(topic.share, 100)} ${t('of the complaint pool')}, ${formatNumber(topic.high)} ${t('4–5 star reviews')}.`}
              title={words.length ? `${t('Reviewers wrote')}: ${words.join(', ')}` : t('Named by the domain dictionary')}
              className={`flex w-full items-center gap-2.5 rounded px-1.5 py-1 text-left transition ${activeRow ? 'bg-slate-800/70' : 'hover:bg-slate-800/40'}`}
            >
              <span className={`shrink-0 truncate text-[10px] font-semibold ${activeRow ? 'text-slate-50' : 'text-slate-300'}`} style={{ width: LABEL_WIDTH }}>
                {topicLabel(topic)}
              </span>
              {/* Dua segmen dipisah 2px agar keluhan dan pujian tidak dibaca sebagai satu blok dua warna. */}
              <span className="relative h-3 min-w-0 flex-1 overflow-hidden rounded-[2px] bg-slate-800/50">
                <span className="absolute inset-y-0 left-0 rounded-[2px]" style={{ width: `${complaintWidth}%`, backgroundColor: SERIES_COLORS.negative, opacity: activeRow ? BAR_OPACITY.active : BAR_OPACITY.idle }} />
                {praiseWidth > 0 && <span className="absolute inset-y-0 rounded-[2px]" style={{ left: `calc(${complaintWidth}% + 2px)`, width: `${Math.max(0, praiseWidth - 1)}%`, backgroundColor: SERIES_COLORS.positive, opacity: activeRow ? 0.72 : 0.45 }} />}
              </span>
              <span className="num w-[74px] shrink-0 text-right text-[11px] font-bold leading-none text-slate-100">
                {formatNumber(topic.low)}
                <span className="num ml-1 text-[10px] font-normal text-slate-400">{formatPercent(topic.share, 100)}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-2.5 min-h-[36px] rounded border border-slate-800/80 bg-slate-950/40 px-3 py-2">
        {active ? (
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="text-[11px] font-bold text-slate-100">{topicLabel(active)}</span>
            {activeAlias && <span className="text-[10px] text-slate-400">{activeAlias}</span>}
            {active.clusterName && (
              <span className="tag">{bilingual(active.clusterName.en, active.clusterName.id)}</span>
            )}
            <span className="num text-[10px] text-slate-400">
              {formatNumber(active.low)} {t('complaints')} · {formatNumber(active.mid)} {t('neutral')} · {formatNumber(active.high)} {t('praise')}
              {active.unrated ? ` · ${formatNumber(active.unrated)} ${t('unstarred')}` : ''}
            </span>
            {isNumber(active.complaintRate) && (
              <span className="num text-[10px] text-slate-400">{Math.round(toNumber(active.complaintRate))}% {t('of its mentions are complaints')}</span>
            )}
            {wordsOf(active).length > 0 && (
              <span className="font-mono text-[10px] text-slate-400">{t('matched')}: {wordsOf(active).join(', ')}</span>
            )}
          </div>
        ) : (
          <p className="text-[10px] leading-relaxed text-slate-400">
            {t('Each bar is a product feature named by the domain dictionary, counted across 1–2★ reviews; the green segment counts 4–5★ reviews using the same words. Names come from the dictionary in English and Indonesian, never from filler words inside a review. One review can carry several topics, so the bars do not add up to 100%.')}
          </p>
        )}
      </div>
    </ChartFrame>
  );
}
