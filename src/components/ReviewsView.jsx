import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
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
import { loadSentimentAnnotations, saveSentimentAnnotations } from '../lib/annotations.js';
import { classifySocialSample } from '../lib/api.js';
import { loadSocialClassifications, saveSocialClassifications } from '../lib/social-classifications.js';
import { AnalystLine, aiText } from './Analyst.jsx';
import { EmptyState } from './EmptyState.jsx';
import { FilterSelect } from './FilterSelect.jsx';
import { StoreMark } from './Brand.jsx';
import { IconDownload, IconExternal, IconQuote, IconSearch, IconStar, IconX } from './icons.jsx';
import { SERIES_COLORS } from './charts/palette.js';

const PAGE = 25;
const SOCIAL_CLASSIFY_BATCH_SIZE = 25;
const SOCIAL_PLATFORMS = new Set(['youtube', 'reddit', 'facebook', 'instagram', 'tiktok', 'x']);
const reviewKey = review => `${review.platform}:${review.id}`;
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

function ReviewRow({ review, topicLabels, sourceUrls, humanLabel, onHumanLabel, socialClassification }) {
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
            <span className="tag-quiet shrink-0" title={t('No topic from the domain dictionary appears in this review')}>
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
        {socialClassification ? (
          <p className="text-[10px] text-slate-400">
            <span className="font-semibold text-slate-300">{t('Gemini')}</span>
            {' · '}{t(socialClassification.label)}
            {' · '}{t('Model-reported confidence')}: {t(socialClassification.confidence)}
            {' · '}{t(socialClassification.reason)}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <FilterSelect
            label={t('Human audit')}
            value={humanLabel || ''}
            onChange={onHumanLabel}
            options={[
              { value: '', label: t('Not audited') },
              { value: 'positive', label: t('Positive') },
              { value: 'neutral', label: t('Neutral') },
              { value: 'negative', label: t('Negative') },
            ]}
          />
          {humanLabel ? <span className="tag-quiet">{t('Human label saved in this browser')}</span> : null}
        </div>
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

export function ReviewsView({ dataset, workspace, onExportCsv }) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [platform, setPlatform] = useState('all');
  const [sentiment, setSentiment] = useState('all');
  const [topic, setTopic] = useState('all');
  const [rating, setRating] = useState('all');
  const [sort, setSort] = useState('newest');
  const [visible, setVisible] = useState(PAGE);
  const [annotations, setAnnotations] = useState({});
  const [socialClassifications, setSocialClassifications] = useState({});
  const [auditError, setAuditError] = useState(null);
  const [classifyError, setClassifyError] = useState(null);
  const [classifyNotice, setClassifyNotice] = useState(null);
  const [classifying, setClassifying] = useState(false);
  const reviews = Array.isArray(dataset.reviews) ? dataset.reviews : [];
  const activeWorkspaceIdRef = useRef(workspace?.id || null);
  activeWorkspaceIdRef.current = workspace?.id || null;
  useEffect(() => {
    const loaded = loadSentimentAnnotations(workspace?.id);
    const loadedClassifications = loadSocialClassifications(workspace?.id);
    setAnnotations(loaded.annotations);
    setAuditError(loaded.error);
    setSocialClassifications(loadedClassifications.classifications);
    setClassifyError(loadedClassifications.error);
    setClassifyNotice(null);
    setClassifying(false);
  }, [workspace?.id]);
  const topics = Array.isArray(dataset.model?.topics) ? dataset.model.topics : [];
  const ai = dataset.model?.ai?.status === 'answered' ? dataset.model.ai : null;
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
  // Daftar pilihan dibangun setiap render, bukan di-memo: sebutan kamus harus ikut berganti saat
  // bahasa diubah, dan memo dengan dependensi hanya pada topik akan membekukan bahasa pertama
  // yang dibuka. Jumlahnya puluhan, biayanya tidak terlihat.
  const platformChoices = [
    { value: 'all', label: `${t('All channels')} · ${formatNumber(reviews.length)}` },
    ...[...platformCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([id, count]) => ({ value: id, label: `${platformLabel(id)} · ${formatNumber(count)}` })),
  ];
  const topicChoices = [
    { value: 'all', label: `${t('All topics')} · ${formatNumber(reviews.length)}` },
    ...topics.map(item => ({
      value: item.id,
      label: `${topicLabel(item)} · ${formatNumber(item.total)}`,
      title: Number.isInteger(item.low)
        ? `${formatNumber(item.low)} 1–2★ ${t('and')} ${formatNumber(item.high ?? 0)} 4–5★ ${t('reviews mention this topic')}`
        : undefined,
    })),
  ];
  const activeFilters = platform !== 'all' || sentiment !== 'all' || topic !== 'all' || rating !== 'all' || Boolean(query.trim());
  const auditedRows = reviews
    .map(review => ({ review, label: annotations[`${review.platform}:${review.id}`] }))
    .filter(entry => entry.label);
  const agreement = auditedRows.length
    ? auditedRows.filter(({ review, label }) => (review.analysis?.sentiment || 'unclassified') === label).length / auditedRows.length
    : null;
  const geminiAuditedRows = auditedRows
    .map(({ review, label }) => ({ label, classification: socialClassifications[reviewKey(review)] }))
    .filter(entry => entry.classification);
  const geminiAgreement = geminiAuditedRows.length
    ? geminiAuditedRows.filter(({ label, classification }) => classification.label === label).length / geminiAuditedRows.length
    : null;
  const socialClassificationCount = reviews
    .filter(review => SOCIAL_PLATFORMS.has(review.platform) && socialClassifications[reviewKey(review)])
    .length;
  const socialReviewCount = reviews.filter(review => SOCIAL_PLATFORMS.has(review.platform)).length;
  const socialCandidates = filtered
    .filter(review => SOCIAL_PLATFORMS.has(review.platform)
      && typeof review.id === 'string'
      && typeof review.text === 'string'
      && review.text.trim()
      && !socialClassifications[reviewKey(review)])
    .slice(0, SOCIAL_CLASSIFY_BATCH_SIZE);

  function setHumanLabel(review, label) {
    const key = reviewKey(review);
    const next = { ...annotations };
    if (label) next[key] = label;
    else delete next[key];
    const saved = saveSentimentAnnotations(workspace?.id, next);
    if (!saved.ok) {
      setAuditError(saved.error);
      return;
    }
    setAnnotations(next);
    setAuditError(null);
  }

  async function classifyNextSocialSample() {
    if (classifying || !workspace?.id || !socialCandidates.length) return;
    const workspaceId = workspace.id;
    const isActiveWorkspace = () => activeWorkspaceIdRef.current === workspaceId;
    setClassifying(true);
    setClassifyError(null);
    setClassifyNotice(null);
    const sample = socialCandidates.map((review, index) => ({
      ref: `c${index + 1}`,
      platform: review.platform,
      text: review.text.trim().slice(0, 300),
    }));
    try {
      const result = await classifySocialSample(sample);
      if (result.status !== 'answered' || !Array.isArray(result.items) || !result.items.length) {
        if (isActiveWorkspace()) setClassifyError(result.reason || 'Gemini returned no usable social labels.');
        return;
      }
      const byRef = new Map(sample.map((entry, index) => [entry.ref, socialCandidates[index]]));
      const next = { ...socialClassifications };
      for (const item of result.items) {
        const review = byRef.get(item.ref);
        if (!review) continue;
        next[reviewKey(review)] = {
          label: item.label,
          confidence: item.confidence,
          reason: item.reason,
          model: result.model || 'Gemini',
          at: new Date().toISOString(),
        };
      }
      const saved = saveSocialClassifications(workspaceId, next);
      if (!saved.ok) {
        if (isActiveWorkspace()) setClassifyError(saved.error);
        return;
      }
      if (isActiveWorkspace()) {
        setSocialClassifications(next);
        setClassifyNotice(`${formatNumber(result.items.length)} ${t('social comments classified by Gemini')}${result.rejected ? ` · ${formatNumber(result.rejected)} ${t('results not accepted')}` : ''}`);
      }
    } catch (error) {
      if (isActiveWorkspace()) setClassifyError(error?.message || 'Gemini social classification failed.');
    } finally {
      if (isActiveWorkspace()) setClassifying(false);
    }
  }

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
    <div className="reveal-group space-y-3">
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

          {platformCounts.size > 1 && (
            <FilterSelect label={t('Channel')} value={platform} onChange={value => change(setPlatform, value)} options={platformChoices} />
          )}
          {topics.length > 0 && (
            <FilterSelect label={t('Topic')} value={topic} onChange={value => change(setTopic, value)} options={topicChoices} />
          )}

          <FilterSelect
            label={t('Stars')}
            value={rating}
            onChange={value => change(setRating, value)}
            options={[
              { value: 'all', label: `${t('All')} · ${formatNumber(reviews.length)}` },
              ...[5, 4, 3, 2, 1].map(star => ({ value: String(star), label: `${star}★` })),
              { value: 'none', label: t('No stars') },
            ]}
          />
          <FilterSelect
            label={t('Sort')}
            value={sort}
            onChange={value => change(setSort, value)}
            options={[
              { value: 'newest', label: t('Newest') },
              { value: 'oldest', label: t('Oldest') },
              { value: 'ratingHigh', label: t('Highest stars') },
              { value: 'ratingLow', label: t('Lowest stars') },
            ]}
          />
          {activeFilters && (
            <button type="button" onClick={resetFilters} className="btn btn-ghost btn-xs ml-auto">
              <IconX size={11} /> {t('Clear')}
            </button>
          )}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-slate-800/70 pt-2.5">
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
      </section>

      <section className="card flex flex-wrap items-center justify-between gap-2 px-4 py-2.5" aria-label={t('Human sentiment audit')}>
        <div>
          <p className="label">{t('Human-audited sample')}</p>
          <p className="mt-1 text-[10px] text-slate-400">
            {formatNumber(auditedRows.length)} {t('labels saved on this browser')}
            {agreement == null ? '' : ` · ${t('agreement')} ${Math.round(agreement * 100)}%`}
            {geminiAgreement == null ? '' : ` · ${t('Gemini agreement')} ${Math.round(geminiAgreement * 100)}% (${formatNumber(geminiAuditedRows.length)} ${t('human-audited social rows')})`}
          </p>
        </div>
        <p className="max-w-2xl text-[10px] leading-relaxed text-slate-400">
          {t('This is agreement on rows you chose to audit, not an unbiased accuracy estimate. Labels stay in this browser and are not sent to the server.')}
        </p>
        {auditError ? <p className="w-full text-[10px] text-neg" role="alert">{t(auditError)}</p> : null}
      </section>

      <section className="card space-y-2 px-4 py-3" aria-label={t('Gemini social classification')}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="label">{t('Gemini social classification')}</p>
            <p className="mt-1 text-[10px] text-slate-400">
              {formatNumber(socialClassificationCount)} / {formatNumber(socialReviewCount)} {t('social rows classified in this browser')}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            onClick={classifyNextSocialSample}
            disabled={classifying || !workspace?.id || !socialCandidates.length}
            aria-describedby="gemini-social-privacy"
          >
            {classifying
              ? t('Classifying with Gemini…')
              : `${t('Send next filtered sample to Gemini')} · ${formatNumber(socialCandidates.length)}`}
          </button>
        </div>
        <p id="gemini-social-privacy" className="text-[10px] leading-relaxed text-slate-400">
          {t('Clicking sends up to 25 comment texts and channel names to Google Gemini. Author, title, URL, and date are not sent. Google processing terms and any API charges apply. Confidence is model-reported, not calibrated; results stay in this browser and are not used to train Sentil’s model.')}
        </p>
        {classifyError ? <p className="text-[10px] text-neg" role="alert">{t(classifyError)}</p> : null}
        {classifyNotice ? <p className="text-[10px] text-emerald-300" role="status">{classifyNotice}</p> : null}
      </section>

      {ai && aiText(ai.reading.reviews) ? (
        <div className="rounded border border-slate-800/80 bg-slate-950/40 px-3 py-2">
          <AnalystLine field={ai.reading.reviews} model={ai.model} label={t('How reviewers write')} />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
        <p role="status" aria-live="polite" className="text-[11px] text-slate-400">
          <span className="num font-bold text-slate-200">{formatNumber(filtered.length)}</span> {t('reviews')}{activeFilters ? ` ${t('match the filters')}` : ''}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <p className="num text-[10px] text-slate-400">{t('showing')} {formatNumber(shown.length)} · {t('every row is still counted in the statistics')}</p>
          <button
            type="button"
            onClick={() => onExportCsv?.(filtered.map(review => ({
              ...review,
              humanLabel: annotations[reviewKey(review)] || '',
              socialClassification: socialClassifications[reviewKey(review)] || null,
            })))}
            disabled={!filtered.length}
            className="btn btn-secondary btn-xs"
          >
            <IconDownload size={12} /> {t('Export filtered CSV')}
          </button>
        </div>
      </div>

      {shown.length ? (
        <ol aria-label={t('Review list')} className="space-y-2">
          {shown.map((review, index) => (
            <ReviewRow
              key={`${review.platform}:${review.id}:${index}`}
              review={review}
              sourceUrls={dataset.sourceUrls}
              topicLabels={topicBadges(review)}
              humanLabel={annotations[reviewKey(review)] || ''}
              socialClassification={socialClassifications[reviewKey(review)] || null}
              onHumanLabel={label => setHumanLabel(review, label)}
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
