import { useDeferredValue, useMemo, useState } from 'react';
import {
  formatDate,
  formatDecimal,
  formatNumber,
  formatWeight,
  platformLabel,
  sentimentLabel,
} from '../lib/format.js';
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
    <span className="inline-flex items-center gap-1" aria-label={`${rating} of 5 stars`}>
      <span className="flex gap-px" aria-hidden="true">
        {[1, 2, 3, 4, 5].map(star => (
          <IconStar key={star} size={9} className={star <= rating ? 'text-neu' : 'text-slate-400'} />
        ))}
      </span>
      <span className="num text-[10px] font-semibold text-slate-400">{rating}/5</span>
    </span>
  );
}

function ReviewRow({ review, topicLabels }) {
  const [expanded, setExpanded] = useState(false);
  const sentiment = review.analysis?.sentiment || 'unclassified';
  const text = typeof review.text === 'string' ? review.text : '';
  const long = text.length > 320;
  const terms = Array.isArray(review.analysis?.matchedTerms) ? review.analysis.matchedTerms : [];

  return (
    <li className="card relative overflow-hidden p-3 pl-3.5">
      <span className="absolute inset-y-0 left-0 w-[2px]" style={{ backgroundColor: SENTIMENT_COLOR[sentiment] }} aria-hidden="true" />
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <StoreMark store={review.platform} size={18} tone="quiet" />
        <span className="max-w-[26ch] truncate text-[11px] font-bold text-slate-200">{review.author || 'N/A'}</span>
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
        <p className="mt-1 text-[11px] italic text-slate-400">No review text · word score not computed</p>
      )}
      {long && (
        <button type="button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded} className="mt-1 text-[10px] font-semibold text-accent hover:underline">
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-800/70 pt-2">
        {topicLabels.map(label => (
          <span
            key={label}
            className="mr-1 inline-flex items-center gap-1 rounded bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-accent"
            title="Topic from feature terms in the store listing text"
          >
            <span className="h-1.5 w-1.5 rounded-[1px] bg-accent" aria-hidden="true" />
            {label}
          </span>
        ))}
        {terms.length > 0 && (
          <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">terms</span>
        )}
        {terms.slice(0, 5).map(term => (
          <span
            key={term.term}
            title="Weight learned from the 1–2 vs 4–5 star correlation"
            className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${term.weight > 0 ? 'bg-pos/10 text-pos' : 'bg-neg/10 text-neg'}`}
          >
            {term.term} {formatWeight(term.weight)}
          </span>
        ))}
        <span className="ml-auto flex items-center gap-2.5">
          {review.analysis?.score != null && (
            <span className="num text-[10px] text-slate-400">score {formatDecimal(review.analysis.score, 2)}</span>
          )}
          {review.sourceUrl && (
            <a href={review.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400 hover:text-accent">
              source <IconExternal size={10} />
            </a>
          )}
        </span>
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
  const [visible, setVisible] = useState(PAGE);
  const reviews = Array.isArray(dataset.reviews) ? dataset.reviews : [];
  const topics = Array.isArray(dataset.model?.topics) ? dataset.model.topics : [];
  const topicNames = useMemo(() => new Map(topics.map(topic => [topic.id, topic.name])), [topics]);

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
      <section className="card p-3" aria-label="Review filters">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1 sm:max-w-[280px]">
            <label htmlFor="review-search" className="sr-only">Search text, title, or reviewer name</label>
            <IconSearch size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="review-search"
              className="field field-sm h-8 pl-8 pr-7"
              placeholder="Search text or name…"
              value={query}
              onChange={event => { setQuery(event.target.value); setVisible(PAGE); }}
            />
            {query && (
              <button type="button" onClick={() => { setQuery(''); setVisible(PAGE); }} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300" aria-label="Clear search">
                <IconX size={12} />
              </button>
            )}
          </div>

          <label className="flex items-center gap-1.5 text-[10px] text-slate-400">
            Stars
            <span className="relative">
              <select value={rating} onChange={event => change(setRating, event.target.value)} className="select">
                <option value="all">All</option>
                {[5, 4, 3, 2, 1].map(star => <option key={star} value={String(star)}>{star}★</option>)}
                <option value="none">No stars</option>
              </select>
              <IconChevronDown size={11} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
            </span>
          </label>
          <label className="flex items-center gap-1.5 text-[10px] text-slate-400">
            Sort
            <span className="relative">
              <select value={sort} onChange={event => change(setSort, event.target.value)} className="select">
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="ratingHigh">Highest stars</option>
                <option value="ratingLow">Lowest stars</option>
              </select>
              <IconChevronDown size={11} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
            </span>
          </label>
          {activeFilters && (
            <button type="button" onClick={resetFilters} className="btn btn-ghost btn-xs ml-auto">
              <IconX size={11} /> Clear
            </button>
          )}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-slate-800/70 pt-2.5">
          <div role="group" aria-label="Channel filter" className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => change(setPlatform, 'all')} aria-pressed={platform === 'all'} className={`filter-chip ${platform === 'all' ? 'filter-chip-active' : ''}`}>
              All channels <span className="num">{formatNumber(reviews.length)}</span>
            </button>
            {[...platformCounts.entries()].map(([id, count]) => (
              <button key={id} type="button" onClick={() => change(setPlatform, id)} aria-pressed={platform === id} className={`filter-chip ${platform === id ? 'filter-chip-active' : ''}`}>
                {platformLabel(id)} <span className="num">{formatNumber(count)}</span>
              </button>
            ))}
          </div>
          <span className="mx-1 hidden h-4 w-px bg-slate-800 sm:block" />
          <div role="group" aria-label="Sentiment label filter" className="flex flex-wrap items-center gap-1.5">
            {SENTIMENTS.map(option => (
              <button
                key={option.id}
                type="button"
                onClick={() => change(setSentiment, option.id)}
                aria-pressed={sentiment === option.id}
                className={`filter-chip ${sentiment === option.id ? 'filter-chip-active' : ''}`}
              >
                {option.id !== 'all' && <span className="h-1.5 w-1.5 rounded-[1px]" style={{ backgroundColor: SENTIMENT_COLOR[option.id] }} />}
                {option.label} <span className="num">{formatNumber(sentimentCounts[option.id] || 0)}</span>
              </button>
            ))}
          </div>
        </div>

        {topics.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-slate-800/70 pt-2.5" role="group" aria-label="Complaint topic filter">
            <span className="label-sm mr-0.5">Topics</span>
            <button type="button" onClick={() => change(setTopic, 'all')} aria-pressed={topic === 'all'} className={`filter-chip ${topic === 'all' ? 'filter-chip-active' : ''}`}>
              All topics <span className="num">{formatNumber(reviews.length)}</span>
            </button>
            {topics.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => change(setTopic, item.id)}
                aria-pressed={topic === item.id}
                title={`${formatNumber(item.low)} 1–2★ and ${formatNumber(item.high)} 4–5★ reviews mention this term`}
                className={`filter-chip ${topic === item.id ? 'filter-chip-active' : ''}`}
              >
                {item.name} <span className="num">{formatNumber(item.total)}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="flex items-baseline justify-between px-0.5">
        <p role="status" aria-live="polite" className="text-[11px] text-slate-400">
          <span className="num font-bold text-slate-200">{formatNumber(filtered.length)}</span> reviews{activeFilters ? ' match the filters' : ''}
        </p>
        <p className="num text-[10px] text-slate-400">showing {formatNumber(shown.length)} · every row is still counted in the statistics</p>
      </div>

      {shown.length ? (
        <ol aria-label="Review list" className="space-y-2">
          {shown.map((review, index) => (
            <ReviewRow
              key={`${review.platform}:${review.id}:${index}`}
              review={review}
              topicLabels={(review.analysis?.topics || []).slice(0, 3).map(id => topicNames.get(id) || id)}
            />
          ))}
        </ol>
      ) : (
        <div className="card">
          <EmptyState
            icon={IconQuote}
            title="No review matches"
            body="This filter combination is empty. Every source review stays stored."
            action={<button type="button" onClick={resetFilters} className="btn btn-secondary btn-xs">Clear filters</button>}
          />
        </div>
      )}

      {filtered.length > visible && (
        <div className="flex justify-center">
          <button type="button" onClick={() => setVisible(value => value + PAGE)} className="btn btn-secondary">
            Load {formatNumber(Math.min(PAGE, filtered.length - visible))} more
          </button>
        </div>
      )}
    </div>
  );
}
