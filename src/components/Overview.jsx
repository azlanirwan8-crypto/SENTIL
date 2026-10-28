import { useMemo, useState } from 'react';
import { formatNumber, platformLabel } from '../lib/format.js';
import { t, topicLabel } from '../lib/i18n.js';
import { scopeDataset } from '../lib/scope.js';
import { KpiRow } from './KpiRow.jsx';
import { ChannelStrip } from './ChannelStrip.jsx';
import { FilterSelect } from './FilterSelect.jsx';
import { PainLabels } from './PainLabels.jsx';
import { Signals } from './Signals.jsx';
import { DailyTrend } from './charts/DailyTrend.jsx';
import { ChannelDonut } from './charts/ChannelDonut.jsx';
import { TopicMap } from './charts/TopicMap.jsx';
import { PlatformBars } from './charts/PlatformBars.jsx';

function FilterBar({ options, platform, topic, onPlatform, onTopic, filtered, matched, total, onReset }) {
  if (!options.platforms.length && !options.topics.length) return null;
  const topicTitle = entry => (Number.isInteger(entry.topic?.low)
    ? `${formatNumber(entry.topic.low)} 1–2★ ${t('and')} ${formatNumber(entry.topic.high ?? 0)} 4–5★ ${t('reviews mention this topic')}`
    : undefined);
  return (
    <section className="card flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3" aria-label={t('Dashboard filters')}>
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

      {filtered && (
        <div className="ml-auto flex items-center gap-2">
          <span className="num text-[10px] text-slate-400">{formatNumber(matched)} {t('of')} {formatNumber(total)} {t('reviews')}</span>
          <button type="button" onClick={onReset} className="btn btn-ghost btn-xs">{t('Clear filter')}</button>
        </div>
      )}
    </section>
  );
}

export function Overview({ dataset, workspace }) {
  const [platform, setPlatform] = useState('all');
  const [topic, setTopic] = useState('all');
  const scoped = useMemo(() => scopeDataset(dataset, { platform, topic }), [dataset, platform, topic]);
  const view = { ...dataset, reviews: scoped.rows, summary: scoped.summary, model: scoped.model };
  const total = scoped.totalRows;
  const reset = () => { setPlatform('all'); setTopic('all'); };

  return (
    <div className="space-y-3">
      <FilterBar
        options={scoped.options}
        platform={platform}
        topic={topic}
        onPlatform={setPlatform}
        onTopic={setTopic}
        filtered={scoped.filtered}
        matched={scoped.matched}
        total={total}
        onReset={reset}
      />

      {scoped.filtered && scoped.matched === 0 ? (
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
            <div className="min-w-0 xl:col-span-12">
              <Signals signals={dataset.model?.signals} pain={dataset.model?.painPoints} topics={dataset.model?.topics} ai={dataset.model?.ai} filtered={scoped.filtered} />
            </div>
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
            <div className="min-w-0 xl:col-span-12">
              <PainLabels pain={dataset.model?.painPoints} topics={dataset.model?.topics} ai={dataset.model?.ai} filtered={scoped.filtered} />
            </div>
          </div>
        </>
      )}

      <ChannelStrip dataset={dataset} workspace={workspace} />
    </div>
  );
}
