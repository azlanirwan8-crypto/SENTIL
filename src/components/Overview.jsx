import { useMemo, useState } from 'react';
import { formatNumber, platformLabel } from '../lib/format.js';
import { scopeDataset } from '../lib/scope.js';
import { KpiRow } from './KpiRow.jsx';
import { ChannelStrip } from './ChannelStrip.jsx';
import { PainLabels } from './PainLabels.jsx';
import { Signals } from './Signals.jsx';
import { DailyTrend } from './charts/DailyTrend.jsx';
import { ChannelDonut } from './charts/ChannelDonut.jsx';
import { TopicMap } from './charts/TopicMap.jsx';
import { PlatformBars } from './charts/PlatformBars.jsx';

function Chip({ active, onClick, children, count }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`filter-chip ${active ? 'filter-chip-active' : ''}`}
    >
      {children}
      {count != null && <span className="num opacity-70">{formatNumber(count)}</span>}
    </button>
  );
}

function FilterBar({ options, platform, topic, onPlatform, onTopic, filtered, matched, total, onReset }) {
  if (!options.platforms.length && !options.topics.length) return null;
  return (
    <section className="card flex flex-wrap items-center gap-x-3 gap-y-1.5 p-3" aria-label="Dashboard filters">
      {options.platforms.length > 1 && (
        <div role="group" aria-label="Channel filter" className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="label-sm shrink-0">Channel</span>
          <Chip active={platform === 'all'} onClick={() => onPlatform('all')} count={total}>All</Chip>
          {options.platforms.map(entry => (
            <Chip key={entry.id} active={platform === entry.id} onClick={() => onPlatform(entry.id)} count={entry.count}>
              {platformLabel(entry.id)}
            </Chip>
          ))}
        </div>
      )}

      {options.topics.length > 0 && (
        <div role="group" aria-label="Topic filter" className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="label-sm shrink-0">Topic</span>
          <Chip active={topic === 'all'} onClick={() => onTopic('all')} count={total}>All</Chip>
          {options.topics.map(entry => (
            <Chip key={entry.id} active={topic === entry.id} onClick={() => onTopic(entry.id)} count={entry.count}>
              {entry.name}
            </Chip>
          ))}
        </div>
      )}

      {filtered && (
        <div className="ml-auto flex items-center gap-2">
          <span className="num text-[10px] text-slate-400">{formatNumber(matched)} of {formatNumber(total)} reviews</span>
          <button type="button" onClick={onReset} className="btn btn-ghost btn-xs">Clear filter</button>
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
        <section className="card p-4" aria-label="No review matches this filter">
          <p className="label">No review matches this filter</p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
            {formatNumber(total)} reviews were read, but none carries this combination of channel and topic. Every chart counts only what is in the
            corpus, so an empty filter stays empty instead of falling back to the unfiltered numbers.
          </p>
          <button type="button" onClick={reset} className="btn btn-ghost btn-xs mt-2">Clear filter</button>
        </section>
      ) : (
        <>
          <KpiRow dataset={view} />

          <div className="grid gap-3 xl:grid-cols-12">
            <div className="min-w-0 xl:col-span-12">
              <Signals signals={dataset.model?.signals} filtered={scoped.filtered} />
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
              <PlatformBars platforms={scoped.model.platforms} />
            </div>
            <div className="min-w-0 xl:col-span-12">
              <PainLabels pain={dataset.model?.painPoints} filtered={scoped.filtered} />
            </div>
          </div>
        </>
      )}

      <ChannelStrip dataset={dataset} workspace={workspace} />
    </div>
  );
}
