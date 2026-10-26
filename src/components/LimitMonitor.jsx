import { useCallback, useEffect, useState } from 'react';
import { fetchLimits, resetLimits } from '../lib/api.js';
import { formatDateTime, formatNumber, formatTime, relativeTime } from '../lib/format.js';
import { StoreMark } from './Brand.jsx';
import { IconAlert, IconClock, IconRefresh, IconShield } from './icons.jsx';

const TONE_CLASS = {
  pos: 'border-pos/30 bg-pos/10 text-pos',
  neu: 'border-neu/30 bg-neu/10 text-neu',
  neg: 'border-neg/30 bg-neg/10 text-neg',
  slate: 'border-slate-700 bg-slate-800/70 text-slate-400',
};

const OVERALL = {
  ok: ['All paths read', 'pos'],
  limited: ['Some paths truncated', 'neu'],
  exhausted: ['A source stopped supplying', 'neg'],
  setup: ['Waiting for server credentials', 'slate'],
  idle: ['No pull on this instance yet', 'slate'],
};

const duration = ms => (Number.isFinite(ms) && ms > 0 ? `${(ms / 1000).toFixed(1)}s` : 'N/A');

function Signal({ signal }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded border border-slate-800 bg-slate-950/60 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400"
      title={`${signal.source}: ${signal.detail}`}
    >
      <span className={signal.kind === 'rate-limit' || signal.kind === 'blocked' ? 'text-neg' : 'text-neu'}>
        {signal.httpStatus ? `${signal.httpStatus} · ` : ''}{signal.label}
      </span>
      {signal.retryAfterMs && <span className="num text-slate-400">wait {Math.round(signal.retryAfterMs / 1000)}s</span>}
    </span>
  );
}

function Value({ value, unit }) {
  return (
    <td className="px-2 py-1.5 text-right align-top">
      <span className="num text-[11.5px] font-bold text-slate-200">{value ?? 'N/A'}</span>
      {unit && <span className="ml-1 text-[10px] text-slate-400">{unit}</span>}
    </td>
  );
}

export function LimitMonitor({ dataset, workspace, onToast }) {
  const [monitor, setMonitor] = useState(dataset?.limits || null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (dataset?.limits) setMonitor(dataset.limits);
  }, [dataset?.limits]);

  // Kirim hanya kanal yang diminta supaya kunci cache/ledger di server cocok dengan
  // penarikan sebenarnya. `sourceId` null berarti seluruh kanal aktif workspace.
  const idsFor = useCallback(sourceId => {
    const channels = workspace?.channels || {};
    const pick = id => channels[id] || null;
    const social = sourceId && sourceId !== 'play' && sourceId !== 'appstore'
      ? { [sourceId]: pick(sourceId) }
      : channels;
    return {
      entity: workspace?.entity || dataset?.entity || '',
      playAppId: sourceId === 'appstore' ? null : workspace?.stores?.play?.appId || null,
      appleAppId: sourceId === 'play' ? null : workspace?.stores?.appstore?.appId || null,
      social,
    };
  }, [workspace, dataset]);

  async function call(action, run, successTitle) {
    setBusy(action === 'check' ? 'check' : action.source || 'all');
    setError(null);
    try {
      const response = await run();
      if (action === 'check') {
        setMonitor(response);
        onToast?.('Source limit status was refreshed from the instance that is still warm.', 'info', 'Monitoring refreshed');
      } else {
        onToast?.(response.message || 'Channel attempt log cleared.', 'success', successTitle);
        setMonitor(await fetchLimits(idsFor(null)));
      }
    } catch (cause) {
      setError(cause.message || 'Source limit monitoring failed.');
      onToast?.(cause.message || 'Source limit monitoring failed.', 'error', 'Failed');
    } finally {
      setBusy(null);
    }
  }

  const sources = monitor?.sources || [];
  const overall = OVERALL[monitor?.overall] || OVERALL.ok;
  const history = sources.flatMap(source => (source.history || []).map(attempt => ({ ...attempt, source: source.label })));

  return (
    <div className="space-y-3">
      <section className="card overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/70 px-3 py-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <IconShield size={13} className="shrink-0 text-slate-400" />
            <h2 className="label">Source limits</h2>
            <span className={`pill ${TONE_CLASS[overall[1]]}`}>{overall[0]}</span>
            {monitor?.setupCount > 0 && overall[0].startsWith('All') && (
              <span className="pill border border-slate-700 bg-slate-800/70 text-slate-400">
                {formatNumber(monitor.setupCount)} channels waiting for credentials
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="num text-[10px] text-slate-400">
              {monitor?.generatedAt ? formatDateTime(monitor.generatedAt) : 'no monitoring yet'}
            </span>
            <button
              type="button"
              onClick={() => call('check', () => fetchLimits(idsFor(null)))}
              disabled={Boolean(busy)}
              className="btn btn-secondary btn-xs"
              title="Re-read limit status from the server instance that is still warm"
            >
              <IconRefresh size={12} className={busy === 'check' ? 'animate-spin' : ''} />
              Re-check
            </button>
            <button
              type="button"
              onClick={() => call({ source: 'all' }, () => resetLimits(idsFor(null)), 'Monitoring reset')}
              disabled={Boolean(busy)}
              className="btn btn-ghost btn-xs"
              title="Clear the attempt log + channel cache on this instance"
            >
              Reset
            </button>
          </div>
        </header>

        <div className="scroll-x" tabIndex={0} role="region" aria-label="Limit status per source channel">
          <table className="w-full min-w-[760px] border-collapse text-xs">
            <caption className="sr-only">Limit status per source channel: state, observed signals, rows read, figures reported by the store, pages, and fallback path</caption>
            <thead>
              <tr className="border-b border-slate-800/70 bg-slate-950/40 text-[10px] uppercase tracking-wider text-slate-400">
                <th scope="col" className="px-2 py-1 text-left font-semibold">Source</th>
                <th scope="col" className="px-2 py-1 text-left font-semibold">Limit status</th>
                <th scope="col" className="px-2 py-1 text-left font-semibold">Observed signals</th>
                <th scope="col" className="px-2 py-1 text-right font-semibold">Read</th>
                <th scope="col" className="px-2 py-1 text-right font-semibold">Reported by source</th>
                <th scope="col" className="px-2 py-1 text-right font-semibold">Pages</th>
                <th scope="col" className="px-2 py-1 text-left font-semibold">Fallback path</th>
                <th scope="col" className="px-2 py-1 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {sources.map(source => {
                const appId = source.appId || workspace?.stores?.[source.id]?.appId || null;
                // Kanal sosial/web tidak punya identitas toko; aksinya boleh selama kanal
                // itu memang aktif di workspace.
                const actionable = Boolean(appId) || workspace?.channels?.[source.id]?.enabled === true;
                return (
                <tr key={source.id} className="align-top hover:bg-slate-900/60">
                  <td className="px-2 py-1.5">
                    <span className="flex items-center gap-1.5">
                      <StoreMark store={source.id} size={14} tone="quiet" />
                      <span className="font-semibold text-slate-100">{source.label}</span>
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[10px] text-slate-400">
                      {appId || source.appId || (workspace?.channels?.[source.id]?.enabled ? 'target: entity name' : 'N/A')}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    <span className={`pill ${TONE_CLASS[source.tone]}`}>{source.stateLabel}</span>
                    {source.errorCount > 0 && (
                      <span className="num mt-1 block text-[10px] text-slate-400">
                        {formatNumber(source.errorCount)} of {formatNumber(source.sourceCalls)} source attempts had problems
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="flex flex-wrap gap-1">
                      {source.signals.length ? source.signals.map((signal, index) => <Signal key={`${signal.kind}-${index}`} signal={signal} />)
                        : <span className="text-[10px] text-slate-400">{source.staleLedger ? 'history present, channel copy missing' : 'no limit signal'}</span>}
                    </span>
                    {source.nextSafeAt && (
                      <span className="num mt-1 block text-[10px] text-neu">suggested retry ≈ {formatTime(source.nextSafeAt)}</span>
                    )}
                  </td>
                  <Value value={formatNumber(source.read)} />
                  <td className="px-2 py-1.5 text-right align-top">
                    <span className="num text-[11.5px] font-bold text-slate-200">{formatNumber(source.reported)}</span>
                    <span className="num mt-0.5 block text-[10px] text-slate-400">{formatNumber(source.reportedRatings)} ratings</span>
                  </td>
                  <Value value={formatNumber(source.pages)} />
                  <td className="px-2 py-1.5">
                    <span className={`text-[10px] leading-snug ${source.fallback?.used ? 'text-pos' : 'text-slate-400'}`}>
                      {source.fallback?.used ? 'used' : 'not needed'}
                    </span>
                    <span className="mt-0.5 block text-[10px] leading-snug text-slate-400">{source.fallback?.detail || 'single path'}</span>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => call({ source: source.id }, () => resetLimits(idsFor(source.id)), 'Channel refreshed')}
                      disabled={Boolean(busy) || !actionable}
                      className="btn btn-ghost btn-xs"
                      title={`Drop the cache + log for ${source.label} so the next pull starts on a clean path`}
                    >
                      {busy === source.id ? <IconRefresh size={12} className="animate-spin" /> : <IconClock size={12} />}
                      Refresh
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {error && (
          <p className="flex items-start gap-1.5 border-t border-neg/25 bg-neg/[0.07] px-3 py-2 text-[10.5px] text-neg">
            <IconAlert size={12} className="mt-0.5 shrink-0" />
            {error}
          </p>
        )}

        {monitor?.hint && (
          <footer className="border-t border-slate-800/70 bg-slate-950/40 px-3 py-1.5">
            <p className="num text-[10px] leading-snug text-slate-400">{monitor.hint}</p>
          </footer>
        )}
      </section>

      <section className="card overflow-hidden">
        <header className="flex items-center justify-between gap-2 border-b border-slate-800/70 px-3 py-1.5">
          <h2 className="label">Attempt log</h2>
          <span className="num text-[10px] text-slate-400">{formatNumber(history.length)} entries · max 24 per channel</span>
        </header>
        {history.length ? (
          <div className="scroll-x max-h-[168px] overflow-y-auto" tabIndex={0} role="region" aria-label="Attempt log per channel">
            <table className="w-full min-w-[620px] border-collapse text-xs">
              <caption className="sr-only">The last twenty-four attempts per channel on the warm server instance</caption>
              <thead>
                <tr className="border-b border-slate-800/70 text-[10px] uppercase tracking-wider text-slate-400">
                  <th scope="col" className="px-2 py-1 text-left font-semibold">Time</th>
                  <th scope="col" className="px-2 py-1 text-left font-semibold">Channel</th>
                  <th scope="col" className="px-2 py-1 text-left font-semibold">Path</th>
                  <th scope="col" className="px-2 py-1 text-right font-semibold">Duration</th>
                  <th scope="col" className="px-2 py-1 text-right font-semibold">Rows</th>
                  <th scope="col" className="px-2 py-1 text-right font-semibold">Status</th>
                  <th scope="col" className="px-2 py-1 text-right font-semibold">Signal</th>
                  <th scope="col" className="px-2 py-1 text-right font-semibold">Ago</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {[...history].reverse().map((attempt, index) => (
                  <tr key={`${attempt.at}-${index}`} className="hover:bg-slate-900/60">
                    <td className="num px-2 py-1 text-[10px] text-slate-400">{formatTime(attempt.at)}</td>
                    <td className="px-2 py-1 text-[10px] font-semibold text-slate-300">{attempt.source}</td>
                    <td className="px-2 py-1 text-[10px] text-slate-400">{attempt.cacheHit ? 'cache' : 'fresh pull'}</td>
                    <td className="num px-2 py-1 text-right text-[10px] text-slate-400">
                      {attempt.cacheHit ? `age ${duration(attempt.cacheAgeMs)}` : duration(attempt.ms)}
                    </td>
                    <td className="num px-2 py-1 text-right text-[10px] text-slate-400">{formatNumber(attempt.fetched)} rows</td>
                    <td className="px-2 py-1 text-right">
                      <span className={`pill ${attempt.status === 'error' ? TONE_CLASS.neg : attempt.status === 'partial' ? TONE_CLASS.neu : TONE_CLASS.pos}`}>
                        {attempt.status || 'failed'}
                      </span>
                    </td>
                    <td className="px-2 py-1 text-right text-[10px] text-slate-400">
                      {attempt.httpStatuses?.length ? `HTTP ${attempt.httpStatuses.join('/')}` : attempt.kinds?.length ? attempt.kinds.join(', ') : '—'}
                    </td>
                    <td className="num px-2 py-1 text-right text-[10px] text-slate-400">{relativeTime(attempt.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-3 py-4 text-center text-[10.5px] text-slate-400">
            The warm server instance has not logged an attempt on this channel yet. Press Refresh or run a pull to fill the log.
          </p>
        )}
      </section>
    </div>
  );
}
