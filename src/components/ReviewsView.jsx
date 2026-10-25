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

const PAGE = 25;

const SENTIMENTS = [
  { id: 'all', label: 'Semua' },
  { id: 'positive', label: 'Positif' },
  { id: 'neutral', label: 'Netral' },
  { id: 'negative', label: 'Negatif' },
  { id: 'unclassified', label: 'Tak terklasifikasi' },
];

const SENTIMENT_STYLES = {
  positive: 'border-teal/25 bg-teal-soft/70 text-teal-deep',
  neutral: 'border-amber/25 bg-amber-soft/70 text-amber-deep',
  negative: 'border-coral/25 bg-coral-soft/70 text-coral-deep',
  unclassified: 'border-line-strong/50 bg-paper-200/80 text-ink-muted',
};

const SENTIMENT_DOTS = {
  positive: 'bg-teal',
  neutral: 'bg-amber',
  negative: 'bg-coral',
  unclassified: 'bg-ink-faint',
};

function Stars({ rating }) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return <span className="text-[9.5px] font-semibold text-ink-faint">Bintang N/A</span>;
  }
  return (
    <span className="inline-flex items-center gap-1" aria-label={`${rating} dari 5 bintang`}>
      <span className="flex gap-0.5 text-amber-bright" aria-hidden="true">
        {[1, 2, 3, 4, 5].map(star => (
          <IconStar key={star} size={10} className={star <= rating ? '' : 'text-line-strong'} />
        ))}
      </span>
      <span className="num text-[9.5px] font-semibold text-ink-muted">{rating}/5</span>
    </span>
  );
}

function ReviewCard({ review }) {
  const [expanded, setExpanded] = useState(false);
  const sentiment = review.analysis?.sentiment || 'unclassified';
  const text = typeof review.text === 'string' ? review.text : '';
  const long = text.length > 420;
  const terms = Array.isArray(review.analysis?.matchedTerms) ? review.analysis.matchedTerms : [];
  const sourceUrl = review.sourceUrl || null;

  return (
    <li className="relative overflow-hidden rounded-2xl border border-line/75 bg-paper-50/85 p-4 transition hover:border-line-strong sm:p-5">
      <span className={`absolute inset-y-0 left-0 w-[3px] ${SENTIMENT_DOTS[sentiment] || SENTIMENT_DOTS.unclassified}`} aria-hidden="true" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          <StoreMark store={review.platform} size={24} tone="quiet" />
          <span className="text-[10.5px] font-bold text-ink-soft">{platformLabel(review.platform)}</span>
          <span className="h-1 w-1 rounded-full bg-line-strong" aria-hidden="true" />
          <span className="max-w-[200px] truncate text-[11px] font-semibold text-ink">{review.author || 'N/A'}</span>
          <span className="text-[10px] text-ink-faint">{formatDate(review.publishedAt || review.date)}</span>
          {review.meta?.appVersion && <span className="font-mono text-[8.5px] text-ink-faint">v{review.meta.appVersion}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Stars rating={review.rating} />
          <span className={`rounded-full border px-2 py-0.5 text-[8.5px] font-bold ${SENTIMENT_STYLES[sentiment] || SENTIMENT_STYLES.unclassified}`}>
            {sentimentLabel(sentiment)}
          </span>
        </div>
      </div>

      {review.title && <p className="mt-3 text-[12.5px] font-bold leading-snug text-ink">{review.title}</p>}
      {text ? (
        <p className={`mt-1.5 whitespace-pre-line text-[12.5px] leading-[1.7] text-ink-soft ${long && !expanded ? 'line-clamp-4' : ''}`}>{text}</p>
      ) : (
        <p className="mt-1.5 rounded-lg bg-paper-100/70 px-2.5 py-2 text-[11px] italic text-ink-faint">
          Tidak ada teks ulasan pada catatan ini; skor kata tidak dapat dihitung.
        </p>
      )}

      {long && (
        <button
          type="button"
          onClick={() => setExpanded(value => !value)}
          className="mt-1.5 text-[10.5px] font-bold text-teal hover:underline"
          aria-expanded={expanded}
        >
          {expanded ? 'Ringkas teks' : 'Baca selengkapnya'}
        </button>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {terms.length > 0 ? (
            <>
              <span className="text-[8.5px] font-bold uppercase tracking-[0.12em] text-ink-faint">Istilah</span>
              {terms.slice(0, 5).map(term => (
                <span
                  key={term.term}
                  title="Bobot relatif dipelajari dari korelasi bintang 1–2 vs 4–5; bukan kamus."
                  className={`rounded-full border px-1.5 py-0.5 font-mono text-[8.5px] font-semibold ${
                    term.weight > 0 ? 'border-teal/20 bg-teal-soft/50 text-teal-deep' : 'border-coral/20 bg-coral-soft/45 text-coral-deep'
                  }`}
                >
                  {term.term} <span className="opacity-70">{formatWeight(term.weight)}</span>
                </span>
              ))}
            </>
          ) : (
            <span className="text-[9.5px] text-ink-faint">{text ? 'Tidak ada istilah berbobot yang cocok' : 'Tanpa teks'}</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {review.analysis?.score != null && (
            <span className="num text-[9px] text-ink-faint">skor {formatDecimal(review.analysis.score, 2)}</span>
          )}
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[9.5px] font-semibold text-ink-soft transition hover:text-teal"
              aria-label="Buka halaman sumber ulasan"
            >
              Sumber <IconExternal size={11} />
            </a>
          )}
        </div>
      </div>
    </li>
  );
}

export function ReviewsView({ dataset }) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [platform, setPlatform] = useState('all');
  const [sentiment, setSentiment] = useState('all');
  const [rating, setRating] = useState('all');
  const [sort, setSort] = useState('newest');
  const [visible, setVisible] = useState(PAGE);
  const reviews = Array.isArray(dataset.reviews) ? dataset.reviews : [];

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
  }, [reviews, platform, sentiment, rating, deferredQuery, sort]);

  const shown = filtered.slice(0, visible);
  const activeFilters = platform !== 'all' || sentiment !== 'all' || rating !== 'all' || Boolean(query.trim());
  const platformOptions = [...platformCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  function resetFilters() {
    setQuery('');
    setPlatform('all');
    setSentiment('all');
    setRating('all');
    setSort('newest');
    setVisible(PAGE);
  }

  function changeFilter(setter, value) {
    setter(value);
    setVisible(PAGE);
  }

  return (
    <div className="mt-5 space-y-4">
      <section className="surface p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="rule-label">Baca sumber</div>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-2">
              <h2 className="text-[24px] leading-tight text-ink">Seluruh ulasan terbaca</h2>
              <span className="num rounded-full bg-paper-200 px-2 py-0.5 text-[10px] font-bold text-ink-muted">{formatNumber(reviews.length)}</span>
            </div>
            <p className="mt-1 text-[10.5px] leading-relaxed text-ink-faint">Teks dan nama ditampilkan apa adanya dari sumber. Nama kosong ditulis N/A. Filter kartu tidak mengubah model global.</p>
          </div>
          <div className="relative w-full xl:max-w-[300px]">
            <label htmlFor="review-search" className="sr-only">Cari teks, judul, atau nama ulasan</label>
            <IconSearch size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input
              id="review-search"
              className="field h-[42px] min-h-0 pl-10 pr-9 text-[12.5px]"
              placeholder="Cari teks atau nama…"
              value={query}
              onChange={event => { setQuery(event.target.value); setVisible(PAGE); }}
            />
            {query && (
              <button
                type="button"
                onClick={() => { setQuery(''); setVisible(PAGE); }}
                className="absolute right-2.5 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-ink-faint hover:bg-paper-200 hover:text-ink"
                aria-label="Bersihkan pencarian"
              >
                <IconX size={13} />
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-[8.5px] font-bold uppercase tracking-[0.14em] text-ink-faint">Kanal</span>
          <button
            type="button"
            onClick={() => changeFilter(setPlatform, 'all')}
            className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold transition ${platform === 'all' ? 'border-ink bg-ink text-paper-50' : 'border-line bg-paper-50 text-ink-muted hover:border-line-strong'}`}
          >
            Semua <span className="num opacity-60">{formatNumber(reviews.length)}</span>
          </button>
          {platformOptions.map(([id, count]) => (
            <button
              key={id}
              type="button"
              onClick={() => changeFilter(setPlatform, id)}
              className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold transition ${platform === id ? 'border-ink bg-ink text-paper-50' : 'border-line bg-paper-50 text-ink-muted hover:border-line-strong'}`}
            >
              {platformLabel(id)} <span className="num opacity-60">{formatNumber(count)}</span>
            </button>
          ))}
          <span className="mx-1 hidden h-4 w-px bg-line sm:block" aria-hidden="true" />
          {SENTIMENTS.map(option => (
            <button
              key={option.id}
              type="button"
              onClick={() => changeFilter(setSentiment, option.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold transition ${
                sentiment === option.id
                  ? 'border-ink bg-ink text-paper-50'
                  : 'border-line bg-paper-50 text-ink-muted hover:border-line-strong'
              }`}
            >
              {option.id !== 'all' && <span className={`h-1.5 w-1.5 rounded-full ${SENTIMENT_DOTS[option.id]}`} />}
              {option.label} <span className="num opacity-60">{formatNumber(sentimentCounts[option.id] || 0)}</span>
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line/60 pt-3">
          <label className="inline-flex items-center gap-2 text-[10px] text-ink-faint">
            Bintang
            <span className="relative">
              <select value={rating} onChange={event => changeFilter(setRating, event.target.value)} className="h-8 appearance-none rounded-lg border border-line bg-paper-50 pl-2.5 pr-7 text-[10.5px] font-semibold text-ink-soft">
                <option value="all">Semua</option>
                {[5, 4, 3, 2, 1].map(star => <option key={star} value={String(star)}>{star} bintang</option>)}
                <option value="none">Tanpa bintang</option>
              </select>
              <IconChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint" />
            </span>
          </label>
          <label className="inline-flex items-center gap-2 text-[10px] text-ink-faint">
            Urutkan
            <span className="relative">
              <select value={sort} onChange={event => changeFilter(setSort, event.target.value)} className="h-8 appearance-none rounded-lg border border-line bg-paper-50 pl-2.5 pr-7 text-[10.5px] font-semibold text-ink-soft">
                <option value="newest">Terbaru</option>
                <option value="oldest">Terlama</option>
                <option value="ratingHigh">Bintang tertinggi</option>
                <option value="ratingLow">Bintang terendah</option>
              </select>
              <IconChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint" />
            </span>
          </label>
          {activeFilters && (
            <button type="button" onClick={resetFilters} className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold text-coral-deep hover:underline">
              <IconX size={11} /> Bersihkan filter
            </button>
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
        <p className="text-[10.5px] text-ink-muted">
          <span className="num font-bold text-ink">{formatNumber(filtered.length)}</span> ulasan cocok
          {activeFilters ? ' dengan filter tampilan' : ''} · semua baris tetap dihitung dalam statistik
        </p>
        <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-faint">
          {filtered.length > visible ? `${formatNumber(shown.length)} / ${formatNumber(filtered.length)} dirender` : `${formatNumber(shown.length)} dirender`}
        </p>
      </div>

      {shown.length ? (
        <ol className="space-y-2.5">
          {shown.map((review, index) => (
            <ReviewCard key={`${review.platform}:${review.id}:${index}`} review={review} />
          ))}
        </ol>
      ) : (
        <div className="surface">
          <EmptyState
            icon={IconQuote}
            title="Tidak ada ulasan yang cocok"
            body="Kombinasi filter atau pencarian ini kosong. Semua ulasan sumber tetap tersimpan; ubah filter untuk melihatnya."
            action={<button type="button" onClick={resetFilters} className="btn btn-soft btn-sm">Bersihkan filter</button>}
          />
        </div>
      )}

      {filtered.length > visible && (
        <div className="flex justify-center pt-2">
          <button type="button" onClick={() => setVisible(value => value + PAGE)} className="btn btn-outline">
            Muat {formatNumber(Math.min(PAGE, filtered.length - visible))} ulasan berikutnya
          </button>
        </div>
      )}
    </div>
  );
}
