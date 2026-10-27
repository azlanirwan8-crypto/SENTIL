import { useDeferredValue, useMemo, useState } from 'react';
import {
  formatDate,
  formatDecimal,
  formatNumber,
  formatWeight,
  platformLabel,
  safeHttpUrl,
  sentimentLabel,
} from '../lib/format.js';
import { t, topicLabel } from '../lib/i18n.js';
import { EmptyState } from './EmptyState.jsx';
import { StoreMark } from './Brand.jsx';
import { IconChevronDown, IconExternal, IconQuote, IconSearch, IconStar, IconX } from './icons.jsx';
import { SERIES_COLORS } from './charts/palette.js';

const PAGE = 25;
const SENTIMENTS = [
  { id: 'all', label: 'All' },
  { id: 'positive', label: 'Positive' },
  { id: 'neutral', label: 'Neutral' },
  { id: 'negative', label: 'Negative' },
  { id: 'unclassified', label: 'Unclassified' },
];
const SENTIMENT_COLOR = {
  positive: SERIES_COLORS.positive,
  neutral: SERIES_COLORS.neutral,
  negative: SERIES_COLORS.negative,
  unclassified: SERIES_COLORS.unclassified,
};
const SENTIMENT_PILL = {
  positive: 'border-pos/25 bg-pos/10 text-pos',
  neutral: 'border-neu/25 bg-neu/10 text-neu',
  negative: 'border-neg/25 bg-neg/10 text-neg',
  unclassified: 'border-slate-700 bg-slate-800/70 text-slate-400',
};

function Stars({ rating }) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return <span className="num text-[10px] text-slate-400">N/A</span>;
  }
  return (
    <span className="inline-flex items-center gap-1" aria-label={`${rating} ${t('of 5 stars')}`}>
      <span className="flex gap-px" aria-hidden="true">
        {[1, 2, 3, 4, 5].map(star => (
          <IconStar key={star} size={9} className={star <= rating ? 'text-neu' : 'text-slate-400'} />
        ))}
      </span>
      <span className="num text-[10px] font-semibold text-slate-400">{rating}/5</span>
    </span>
  );
}

function ReviewRow({ review, topicLabels, sourceUrls }) {
  const [expanded, setExpanded] = useState(false);
  const sentiment = review.analysis?.sentiment || 'unclassified';
  const text = typeof review.text === 'string' ? review.text : '';
  const long = text.length > 320;
  const terms = Array.isArray(review.analysis?.matchedTerms) ? review.analysis.matchedTerms : [];
  // Jalur baca mengirim satu URL per kanal, bukan per baris: URL-nya sama untuk seluruh ulasan
  // dari kanal yang sama dan menyedot 12% dari isi respons.
  const sourceUrl = safeHttpUrl(review.sourceUrl || sourceUrls?.[review.platform]);
  const language = typeof review.analysis?.language === 'string' ? review.analysis.language : null;
  const primary = topicLabels[0] || null;

  return (
    <li className="card relative overflow-hidden p-3.5 pl-4">
      <span className="absolute inset-y-0 left-0 w-[2px]" style={{ backgroundColor: SENTIMENT_COLOR[sentiment] }} aria-hidden="true" />
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <StoreMark store={review.platform} size={18} tone="quiet" />
        <span className="max-w-[22ch] truncate text-[11px] font-bold text-slate-200">{review.author || 'N/A'}</span>
        {primary
          ? (
            <span className="tag truncate" title={t('Primary topic measured on this review')}>
              {primary}
            </span>
          )
          : (
            <span className="tag-quiet shrink-0" title={t('No dictionary term appears in this review')}>
              {t('no topic')}
            </span>
          )}
        {language && language !== 'unknown' && (
          <span className="font-mono text-[10px] text-slate-400" title={t('Language detected from this review alone')}>{language}</span>
        )}
        <span className="num text-[10px] text-slate-400">{formatDate(review.publishedAt || review.date)}</span>
        {review.meta?.appVersion && <span className="font-mono text-[10px] text-slate-400">v{review.meta.appVersion}</span>}
        <span className="ml-auto flex items-center gap-2">
          <Stars rating={review.rating} />
          <span className={`pill ${SENTIMENT_PILL[sentiment] || SENTIMENT_PILL.unclassified}`}>{sentimentLabel(sentiment)}</span>
        </span>
      </div>

      {review.title && <p className="mt-1.5 text-[11px] font-bold text-slate-300">{review.title}</p>}
      {text ? (
        <p className={`mt-1 whitespace-pre-line text-[11.5px] leading-relaxed text-slate-400 ${long && !expanded ? 'line-clamp-3' : ''}`}>{text}</p>
      ) : (
        <p className="mt-1 text-[11px] italic text-slate-400">{t('No review text · word score not computed')}</p>
      )}
      {long && (
        <button type="button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded} className="mt-1 text-[10px] font-semibold text-accent hover:underline">
          {expanded ? t('Show less') : t('Read more')}
        </button>
      )}

      <div className="mt-2.5 space-y-1.5 border-t border-slate-800/70 pt-2.5">
        {topicLabels.length > 1 && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="w-11 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t('also')}</span>
            {topicLabels.slice(1).map(label => (
              <span
                key={label}
                className="tag-quiet"
                title={t('Topic named by the domain dictionary (English and Indonesian terms are recognised)')}
              >
                {label}
              </span>
            ))}
          </div>
        )}
        {terms.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="w-11 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t('terms')}</span>
            {terms.slice(0, 5).map(term => (
              <span
                key={term.term}
                title={t('Weight learned from the 1–2 vs 4–5 star correlation')}
                className={`tag-quiet font-mono ${term.weight > 0 ? 'text-pos' : 'text-neg'}`}
              >
                {term.term} {formatWeight(term.weight)}
              </span>
            ))}
          </div>
        )}
        {(review.analysis?.score != null || sourceUrl) && (
          <div className="flex items-center justify-between gap-3 pt-0.5">
            {review.analysis?.score != null ? (
              <span className="num text-[10px] text-slate-400">{t('score')} {formatDecimal(review.analysis.score, 2)}</span>
            ) : <span />}
            {sourceUrl && (
              <a href={sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400 hover:text-accent">
                {t('source')} <IconExternal size={10} />
              </a>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

export function ReviewsView({ dataset }) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [platform, setPlatform] = useState('all');
  const [sentiment, setSentiment] = useState('all');
  const [topic, setTopic] = useState('all');
  const [rating, setRating] = useState('all');
  const [sort, setSort] = useState('newest');
  const [allTopics, setAllTopics] = useState(false);
  const [visible, setVisible] = useState(PAGE);
  const reviews = Array.isArray(dataset.reviews) ? dataset.reviews : [];
  const topics = Array.isArray(dataset.model?.topics) ? dataset.model.topics : [];
  const topicsById = useMemo(() => new Map(topics.map(topic => [topic.id, topic])), [topics]);
  // Badge topik per ulasan dibaca dari kamus lewat id, bukan dari nama yang dibakar di baris:
  // sebutan kamuslah yang harus ikut berganti saat bahasa diubah. Nama lama hanya menjadi
  // cadangan kalau id-nya tidak ada di daftar topik yang dilaporkan.
  const topicBadges = review => {
    const ids = review.analysis?.topics || [];
    if (!ids.length) return review.analysis?.topicNames || [];
    return ids.slice(0, 4).map((id, index) => topicLabel(topicsById.get(id)) || review.analysis?.topicNames?.[index] || id);
  };

  const platformCounts = useMemo(() => {
    const counts = new Map();
    for (const review of reviews) {
      const key = review.platform || 'unknown';
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }, [reviews]);

  const sentimentCounts = useMemo(() => {
    const counts = { all: reviews.length, positive: 0, neutral: 0, negative: 0, unclassified: 0 };
    for (const review of reviews) {
      const key = review.analysis?.sentiment;
      if (key && counts[key] != null) counts[key] += 1;
      else counts.unclassified += 1;
    }
    return counts;
  }, [reviews]);

  const filtered = useMemo(() => {
    const needle = deferredQuery.trim().toLocaleLowerCase('id-ID');
    const result = reviews.filter(review => {
      if (platform !== 'all' && review.platform !== platform) return false;
      if (sentiment !== 'all' && (review.analysis?.sentiment || 'unclassified') !== sentiment) return false;
      if (topic !== 'all' && !(review.analysis?.topics || []).includes(topic)) return false;
      if (rating !== 'all') {
        const value = rating === 'none' ? null : Number(rating);
        if (value === null ? review.rating != null : review.rating !== value) return false;
      }
      if (needle) {
        const haystack = [review.text, review.title, review.author].filter(Boolean).join(' ').toLocaleLowerCase('id-ID');
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
    const time = review => {
      const stamp = Date.parse(review.publishedAt || review.date || '');
      return Number.isNaN(stamp) ? -Infinity : stamp;
    };
    const ratingValue = review => (Number.isInteger(review.rating) ? review.rating : -Infinity);
    if (sort === 'oldest') result.sort((a, b) => time(a) - time(b));
    else if (sort === 'ratingHigh') result.sort((a, b) => ratingValue(b) - ratingValue(a) || time(b) - time(a));
    else if (sort === 'ratingLow') result.sort((a, b) => ratingValue(a) - ratingValue(b) || time(b) - time(a));
    else result.sort((a, b) => time(b) - time(a));
    return result;
  }, [reviews, platform, sentiment, topic, rating, deferredQuery, sort]);

  const shown = filtered.slice(0, visible);
  // Topik terpilih harus tetap tampil walau daftar ditutup; kalau tidak, filter berjalan tanpa
  // ada satu pun badge yang menunjukkannya.
  const shownTopics = useMemo(() => {
    if (allTopics || topics.length <= 8) return topics;
    const head = topics.slice(0, 8);
    const selected = topics.find(item => item.id === topic);
    return selected && !head.some(item => item.id === selected.id) ? [...head, selected] : head;
  }, [allTopics, topics, topic]);
  const activeFilters = platform !== 'all' || sentiment !== 'all' || topic !== 'all' || rating !== 'all' || Boolean(query.trim());

  function resetFilters() {
    setQuery('');
    setPlatform('all');
    setSentiment('all');
    setTopic('all');
    setRating('all');
    setSort('newest');
    setVisible(PAGE);
  }

  function change(setter, value) {
    setter(value);
    setVisible(PAGE);
  }

  return (
    <div className="space-y-3">
      <section className="card px-4 py-3" aria-label={t('Review filters')}>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
          <div className="relative min-w-[180px] flex-1 sm:max-w-[280px]">
            <label htmlFor="review-search" className="sr-only">{t('Search text, title, or reviewer name')}</label>
            <IconSearch size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="review-search"
              className="field field-sm h-8 pl-8 pr-7"
              placeholder={t('Search text or name…')}
              value={query}
              onChange={event => { setQuery(event.target.value); setVisible(PAGE); }}
            />
            {query && (
              <button type="button" onClick={() => { setQuery(''); setVisible(PAGE); }} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300" aria-label={t('Clear search')}>
                <IconX size={12} />
              </button>
            )}
          </div>

          <label className="flex items-center gap-1.5 text-[10px] text-slate-400">
            {t('Stars')}
            <span className="relative">
              <select value={rating} onChange={event => change(setRating, event.target.value)} className="select">
                <option value="all">{t('All')}</option>
                {[5, 4, 3, 2, 1].map(star => <option key={star} value={String(star)}>{star}★</option>)}
                <option value="none">{t('No stars')}</option>
              </select>
              <IconChevronDown size={11} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
            </span>
          </label>
          <label className="flex items-center gap-1.5 text-[10px] text-slate-400">
            {t('Sort')}
            <span className="relative">
              <select value={sort} onChange={event => change(setSort, event.target.value)} className="select">
                <option value="newest">{t('Newest')}</option>
                <option value="oldest">{t('Oldest')}</option>
                <option value="ratingHigh">{t('Highest stars')}</option>
                <option value="ratingLow">{t('Lowest stars')}</option>
              </select>
              <IconChevronDown size={11} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
            </span>
          </label>
          {activeFilters && (
            <button type="button" onClick={resetFilters} className="btn btn-ghost btn-xs ml-auto">
              <IconX size={11} /> {t('Clear')}
            </button>
          )}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-slate-800/70 pt-2.5">
          <div role="group" aria-label={t('Channel filter')} className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <button type="button" onClick={() => change(setPlatform, 'all')} aria-pressed={platform === 'all'} className={`filter-chip ${platform === 'all' ? 'filter-chip-active' : ''}`}>
              {t('All channels')} <span className="num">{formatNumber(reviews.length)}</span>
            </button>
            {[...platformCounts.entries()].map(([id, count]) => (
              <button key={id} type="button" onClick={() => change(setPlatform, id)} aria-pressed={platform === id} className={`filter-chip ${platform === id ? 'filter-chip-active' : ''}`}>
                {platformLabel(id)} <span className="num">{formatNumber(count)}</span>
              </button>
            ))}
          </div>
          <span className="mx-1 hidden h-4 w-px bg-slate-800 sm:block" />
          <div role="group" aria-label={t('Sentiment label filter')} className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            {SENTIMENTS.map(option => (
              <button
                key={option.id}
                type="button"
                onClick={() => change(setSentiment, option.id)}
                aria-pressed={sentiment === option.id}
                className={`filter-chip ${sentiment === option.id ? 'filter-chip-active' : ''}`}
              >
                {option.id !== 'all' && <span className="h-1.5 w-1.5 rounded-[1px]" style={{ backgroundColor: SENTIMENT_COLOR[option.id] }} />}
                {t(option.label)} <span className="num">{formatNumber(sentimentCounts[option.id] || 0)}</span>
              </button>
            ))}
          </div>
        </div>

        {topics.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-slate-800/70 pt-2.5" role="group" aria-label={t('Complaint topic filter')}>
            <span className="label-sm mr-0.5">{t('Topics')}</span>
            <button type="button" onClick={() => change(setTopic, 'all')} aria-pressed={topic === 'all'} className={`filter-chip ${topic === 'all' ? 'filter-chip-active' : ''}`}>
              {t('All topics')} <span className="num">{formatNumber(reviews.length)}</span>
            </button>
            {shownTopics.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => change(setTopic, item.id)}
                aria-pressed={topic === item.id}
                title={`${formatNumber(item.low)} 1–2★ ${t('and')} ${formatNumber(item.high)} 4–5★ ${t('reviews mention this term')}`}
                className={`filter-chip ${topic === item.id ? 'filter-chip-active' : ''}`}
              >
                {topicLabel(item)} <span className="num">{formatNumber(item.total)}</span>
              </button>
            ))}
            {topics.length > 8 && (
              <button
                type="button"
                onClick={() => setAllTopics(value => !value)}
                aria-expanded={allTopics}
                className="link-quiet text-[10px] font-semibold"
              >
                {allTopics ? t('Show fewer') : `${t('Show all')} ${topics.length} ${t('topics')}`}
              </button>
            )}
          </div>
        )}
      </section>

      <div className="flex items-baseline justify-between px-0.5">
        <p role="status" aria-live="polite" className="text-[11px] text-slate-400">
          <span className="num font-bold text-slate-200">{formatNumber(filtered.length)}</span> {t('reviews')}{activeFilters ? ` ${t('match the filters')}` : ''}
        </p>
        <p className="num text-[10px] text-slate-400">{t('showing')} {formatNumber(shown.length)} · {t('every row is still counted in the statistics')}</p>
      </div>

      {shown.length ? (
        <ol aria-label={t('Review list')} className="space-y-2">
          {shown.map((review, index) => (
            <ReviewRow
              key={`${review.platform}:${review.id}:${index}`}
              review={review}
              sourceUrls={dataset.sourceUrls}
              topicLabels={topicBadges(review)}
            />
          ))}
        </ol>
      ) : (
        <div className="card">
          <EmptyState
            icon={IconQuote}
            title={t('No review matches')}
            body={t('This filter combination is empty. Every source review stays stored.')}
            action={<button type="button" onClick={resetFilters} className="btn btn-secondary btn-xs">{t('Clear filters')}</button>}
          />
        </div>
      )}

      {filtered.length > visible && (
        <div className="flex justify-center">
          <button type="button" onClick={() => setVisible(value => value + PAGE)} className="btn btn-secondary">
            {t('Load')} {formatNumber(Math.min(PAGE, filtered.length - visible))} {t('more')}
          </button>
        </div>
      )}
    </div>
  );
}
