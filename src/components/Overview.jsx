import { useMemo, useState } from 'react';
import { formatNumber, platformLabel } from '../lib/format.js';
import { t, topicLabel } from '../lib/i18n.js';
import { scopeDataset } from '../lib/scope.js';
import { KpiRow } from './KpiRow.jsx';
import { ChannelStrip } from './ChannelStrip.jsx';
import { FilterSelect } from './FilterSelect.jsx';
import { DailyTrend } from './charts/DailyTrend.jsx';
import { ChannelDonut } from './charts/ChannelDonut.jsx';
import { TopicMap } from './charts/TopicMap.jsx';
import { PlatformBars } from './charts/PlatformBars.jsx';

function FilterBar({
  options,
  platform,
  topic,
  startDate,
  endDate,
  onPlatform,
  onTopic,
  onStartDate,
  onEndDate,
  filtered,
  matched,
  total,
  undatedExcluded,
  invalidRange,
  onReset,
}) {
  const topicTitle = entry => (Number.isInteger(entry.topic?.low)
    ? `${formatNumber(entry.topic.low)} 1–2★ ${t('and')} ${formatNumber(entry.topic.high ?? 0)} 4–5★ ${t('reviews mention this topic')}`
    : undefined);
  return (
    <section className="card px-4 py-3" aria-label={t('Dashboard filters')}>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
      {options.platforms.length > 1 && (
        <FilterSelect
          label={t('Channel')}
          value={platform}
          onChange={onPlatform}
          options={[
            { value: 'all', label: `${t('All channels')} · ${formatNumber(total)}` },
            ...options.platforms.map(entry => ({
              value: entry.id,
              label: `${platformLabel(entry.id)} · ${formatNumber(entry.count)}`,
            })),
          ]}
        />
      )}

      {options.topics.length > 0 && (
        <FilterSelect
          label={t('Topic')}
          value={topic}
          onChange={onTopic}
          options={[
            { value: 'all', label: `${t('All topics')} · ${formatNumber(total)}` },
            ...options.topics.map(entry => ({
              value: entry.id,
              label: `${topicLabel(entry.topic)} · ${formatNumber(entry.count)}`,
              title: topicTitle(entry),
            })),
          ]}
        />
      )}

      <label className="flex flex-col gap-1 text-[10px] font-semibold text-slate-400">
        <span>{t('From date')}</span>
        <input
          type="date"
          value={startDate}
          max={endDate || undefined}
          onChange={event => onStartDate(event.target.value)}
          className="field field-sm h-8"
          aria-label={t('From date')}
        />
      </label>
      <label className="flex flex-col gap-1 text-[10px] font-semibold text-slate-400">
        <span>{t('To date')}</span>
        <input
          type="date"
          value={endDate}
          min={startDate || undefined}
          onChange={event => onEndDate(event.target.value)}
          className="field field-sm h-8"
          aria-label={t('To date')}
        />
      </label>

      <div className="ml-auto flex items-center gap-2">
        {filtered && <span className="num text-[10px] text-slate-400">{formatNumber(matched)} {t('of')} {formatNumber(total)} {t('reviews')}</span>}
        {filtered && <button type="button" onClick={onReset} className="btn btn-ghost btn-xs">{t('Clear filters')}</button>}
      </div>
      </div>
      {invalidRange ? (
        <p className="mt-2 text-[10px] font-semibold text-neg" role="alert">{t('The start date must be on or before the end date.')}</p>
      ) : null}
      {filtered && undatedExcluded > 0 ? (
        <p className="mt-2 text-[10px] text-neu">
          {formatNumber(undatedExcluded)} {t('undated rows are excluded from this date range.')}
        </p>
      ) : null}
    </section>
  );
}

function negativeShare(summary) {
  const analyzed = Number(summary?.analyzed) || 0;
  return analyzed ? (Number(summary.negative || 0) / analyzed) * 100 : null;
}

function priorPeriod(startDate, endDate) {
  const dayMs = 24 * 60 * 60 * 1000;
  const length = (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / dayMs + 1;
  const previousEnd = new Date(Date.parse(`${startDate}T00:00:00Z`) - dayMs).toISOString().slice(0, 10);
  const previousStart = new Date(Date.parse(`${previousEnd}T00:00:00Z`) - (length - 1) * dayMs).toISOString().slice(0, 10);
  return { startDate: previousStart, endDate: previousEnd };
}

export function Overview({ dataset, workspace }) {
  const [platform, setPlatform] = useState('all');
  const [topic, setTopic] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const scoped = useMemo(
    () => scopeDataset(dataset, { platform, topic, startDate, endDate }),
    [dataset, platform, topic, startDate, endDate],
  );
  const previousRange = useMemo(() => {
    if (!startDate || !endDate || scoped.invalidRange) return null;
    return priorPeriod(startDate, endDate);
  }, [startDate, endDate, scoped.invalidRange]);
  const previous = useMemo(() => (
    previousRange ? scopeDataset(dataset, { platform, topic, ...previousRange }) : null
  ), [dataset, platform, topic, previousRange]);
  const view = { ...dataset, reviews: scoped.rows, summary: scoped.summary, model: scoped.model };
  const total = scoped.totalRows;
  const reset = () => { setPlatform('all'); setTopic('all'); setStartDate(''); setEndDate(''); };

  return (
    <div className="space-y-3">
      <FilterBar
        options={scoped.options}
        platform={platform}
        topic={topic}
        startDate={startDate}
        endDate={endDate}
        onPlatform={setPlatform}
        onTopic={setTopic}
        onStartDate={setStartDate}
        onEndDate={setEndDate}
        filtered={scoped.filtered}
        matched={scoped.matched}
        total={total}
        undatedExcluded={scoped.undatedExcluded}
        invalidRange={scoped.invalidRange}
        onReset={reset}
      />

      {previous && (
        <section className="card px-4 py-3" aria-label={t('Period comparison')}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="label">{t('Period comparison')}</h2>
            <p className="num text-[10px] text-slate-400">{startDate} – {endDate} · {t('versus')} {previousRange.startDate} – {previousRange.endDate}</p>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <div className="rounded border border-slate-800/70 bg-slate-950/30 p-2">
              <p className="label-sm">{t('Current period volume')}</p>
              <p className="num mt-1 text-[14px] font-bold text-slate-100">{formatNumber(scoped.summary.reviews)}</p>
            </div>
            <div className="rounded border border-slate-800/70 bg-slate-950/30 p-2">
              <p className="label-sm">{t('Previous period volume')}</p>
              <p className="num mt-1 text-[14px] font-bold text-slate-100">{formatNumber(previous.summary.reviews)}</p>
            </div>
            {(() => {
              const currentNegative = negativeShare(scoped.summary);
              const previousNegative = negativeShare(previous.summary);
              const delta = currentNegative == null || previousNegative == null ? null : currentNegative - previousNegative;
              return (
                <div className="rounded border border-slate-800/70 bg-slate-950/30 p-2">
                  <p className="label-sm">{t('Negative share change')}</p>
                  <p className={`num mt-1 text-[14px] font-bold ${delta == null ? 'text-slate-400' : delta > 0 ? 'text-neg' : 'text-pos'}`}>
                    {delta == null ? 'N/A' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)} pp`}
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    {currentNegative == null || previousNegative == null
                      ? t('Not enough classified rows in both periods.')
                      : `${currentNegative.toFixed(1)}% ${t('current')} · ${previousNegative.toFixed(1)}% ${t('previous')}`}
                  </p>
                </div>
              );
            })()}
          </div>
          <p className="mt-2 text-[10px] text-slate-400">{t('Comparison uses only rows in this stored snapshot and the same channel/topic filters.')}</p>
        </section>
      )}

      {scoped.invalidRange ? null : scoped.filtered && scoped.matched === 0 ? (
        <section className="card p-4" aria-label={t('No review matches this filter')}>
          <p className="label">{t('No review matches this filter')}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
            {formatNumber(total)} {t('reviews were read, but none matches this channel and topic together. Charts count only what is in this project, so an empty filter stays empty instead of quietly switching back to all reviews.')}
          </p>
          <button type="button" onClick={reset} className="btn btn-ghost btn-xs mt-2">{t('Clear filter')}</button>
        </section>
      ) : (
        <>
          <KpiRow dataset={view} />

          <div className="reveal-group grid gap-3 xl:grid-cols-12">
            <div className="min-w-0 xl:col-span-8">
              <DailyTrend daily={scoped.model.daily} />
            </div>
            <div className="min-w-0 xl:col-span-4">
              <ChannelDonut platforms={scoped.model.platforms} />
            </div>
            <div className="min-w-0 xl:col-span-7">
              <TopicMap topics={scoped.model.topics} filtered={scoped.filtered} />
            </div>
            <div className="min-w-0 xl:col-span-5">
              <PlatformBars platforms={scoped.model.platforms} ai={dataset.model?.ai} />
            </div>
          </div>
        </>
      )}

      <ChannelStrip dataset={dataset} workspace={workspace} />
    </div>
  );
}
