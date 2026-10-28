import { useCallback, useEffect, useState } from 'react';
import { fetchLimits, resetLimits } from '../lib/api.js';
import { formatDateTime, formatNumber, formatTime, relativeTime } from '../lib/format.js';
import { t } from '../lib/i18n.js';
import { StoreMark } from './Brand.jsx';
import { IconAlert, IconClock, IconRefresh, IconShield } from './icons.jsx';

const TONE_CLASS = {
  pos: 'border-pos/30 bg-pos/10 text-pos',
  neu: 'border-neu/30 bg-neu/10 text-neu',
  neg: 'border-neg/30 bg-neg/10 text-neg',
  slate: 'border-slate-700 bg-slate-800/70 text-slate-400',
};

// Label ditulis dalam bentuk baku; t() yang memilih bahasanya. Perbandingan status di bawah
// memakai nilai mentah ini, jadi ia tidak boleh membandingkan hasil terjemahan.
const OVERALL = {
  ok: ['All paths read', 'pos'],
  limited: ['Some paths truncated', 'neu'],
  exhausted: ['A source stopped supplying', 'neg'],
  // Tanpa baris ini, satu sumber yang menjawab kosong jatuh ke OVERALL.ok dan bilah kepala
  // menyatakan "All paths read" padahal tidak ada satu baris pun yang terbaca.
  empty: ['A source answered with no rows', 'neu'],
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
        {signal.httpStatus ? `${signal.httpStatus} · ` : ''}{t(signal.label)}
      </span>
      {signal.retryAfterMs && <span className="num text-slate-400">{t('wait')} {Math.round(signal.retryAfterMs / 1000)}s</span>}
    </span>
  );
}

function Value({ value, unit }) {
  return (
    <td className="px-2 py-1.5 text-right align-top">
      <span className="num text-[11px] font-bold text-slate-200">{value ?? 'N/A'}</span>
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
        onToast?.(t('Source limit status was refreshed from the instance that is still warm.'), 'info', t('Monitoring refreshed'));
      } else {
        onToast?.(response.message || t('Channel attempt log cleared.'), 'success', successTitle);
        setMonitor(await fetchLimits(idsFor(null)));
      }
    } catch (cause) {
      setError(cause.message || t('Source limit monitoring failed.'));
      onToast?.(cause.message || t('Source limit monitoring failed.'), 'error', t('Failed'));
    } finally {
      setBusy(null);
    }
  }

  const sources = monitor?.sources || [];
  const overall = OVERALL[monitor?.overall] || OVERALL.ok;
  const history = sources.flatMap(source => (source.history || []).map(attempt => ({ ...attempt, source: source.label })));

  return (
    <div className="reveal-group space-y-3">
      <section className="card overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/70 px-4 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <IconShield size={13} className="shrink-0 text-slate-400" />
            <h2 className="label">{t('Source limits')}</h2>
            <span className={`pill ${TONE_CLASS[overall[1]]}`}>{t(overall[0])}</span>
            {monitor?.setupCount > 0 && overall[0] === OVERALL.ok[0] && (
              <span className="pill border border-slate-700 bg-slate-800/70 text-slate-400">
                {formatNumber(monitor.setupCount)} {t('channels waiting for credentials')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="num text-[10px] text-slate-400">
              {monitor?.generatedAt ? formatDateTime(monitor.generatedAt) : t('no monitoring yet')}
            </span>
            <button
              type="button"
              onClick={() => call('check', () => fetchLimits(idsFor(null)))}
              disabled={Boolean(busy)}
              className="btn btn-secondary btn-xs"
              title={t('Re-read limit status from the server instance that is still warm')}
            >
              <IconRefresh size={12} className={busy === 'check' ? 'animate-spin' : ''} />
              {t('Re-check')}
            </button>
            <button
              type="button"
              onClick={() => call({ source: 'all' }, () => resetLimits(idsFor(null)), t('Monitoring reset'))}
              disabled={Boolean(busy)}
              className="btn btn-ghost btn-xs"
              title={t('Clear the attempt log + channel cache on this instance')}
            >
              {t('Reset')}
            </button>
          </div>
        </header>

        <div className="scroll-x" tabIndex={0} role="region" aria-label={t('Limit status per source channel')}>
          <table className="w-full min-w-[760px] border-collapse text-xs">
            <caption className="sr-only">{t('Limit status per source channel: state, observed signals, rows read, figures reported by the store, pages, and fallback path')}</caption>
            <thead>
              <tr className="border-b border-slate-800/70 bg-slate-950/40 text-[10px] uppercase tracking-wider text-slate-400">
                <th scope="col" className="px-2 py-1 text-left font-semibold">{t('Source')}</th>
                <th scope="col" className="px-2 py-1 text-left font-semibold">{t('Limit status')}</th>
                <th scope="col" className="px-2 py-1 text-left font-semibold">{t('Observed signals')}</th>
                <th scope="col" className="px-2 py-1 text-right font-semibold">{t('Read')}</th>
                <th scope="col" className="px-2 py-1 text-right font-semibold">{t('Reported by source')}</th>
                <th scope="col" className="px-2 py-1 text-right font-semibold">{t('Pages')}</th>
                <th scope="col" className="px-2 py-1 text-left font-semibold">{t('Fallback path')}</th>
                <th scope="col" className="px-2 py-1 text-right font-semibold">{t('Action')}</th>
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
                      {appId || source.appId || (workspace?.channels?.[source.id]?.enabled ? t('target: entity name') : 'N/A')}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    <span className={`pill ${TONE_CLASS[source.tone]}`}>{source.stateLabel}</span>
                    {source.errorCount > 0 && (
                      <span className="num mt-1 block text-[10px] text-slate-400">
                        {formatNumber(source.errorCount)} {t('of')} {formatNumber(source.sourceCalls)} {t('source attempts had problems')}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="flex flex-wrap gap-1">
                      {source.signals.length ? source.signals.map((signal, index) => <Signal key={`${signal.kind}-${index}`} signal={signal} />)
                        : <span className="text-[10px] text-slate-400">{source.staleLedger ? t('history present, channel copy missing') : t('no limit signal')}</span>}
                    </span>
                    {source.nextSafeAt && (
                      <span className="num mt-1 block text-[10px] text-neu">{t('suggested retry')} ≈ {formatTime(source.nextSafeAt)}</span>
                    )}
                  </td>
                  <Value value={formatNumber(source.read)} />
                  <td className="px-2 py-1.5 text-right align-top">
                    <span className="num text-[11px] font-bold text-slate-200">{formatNumber(source.reported)}</span>
                    <span className="num mt-0.5 block text-[10px] text-slate-400">{formatNumber(source.reportedRatings)} {t('ratings')}</span>
                  </td>
                  <Value value={formatNumber(source.pages)} />
                  <td className="px-2 py-1.5">
                    <span className={`text-[10px] leading-snug ${source.fallback?.used ? 'text-pos' : 'text-slate-400'}`}>
                      {source.fallback?.used ? t('used') : t('not needed')}
                    </span>
                    <span className="mt-0.5 block text-[10px] leading-snug text-slate-400">{source.fallback?.detail || t('single path')}</span>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => call({ source: source.id }, () => resetLimits(idsFor(source.id)), t('Channel refreshed'))}
                      disabled={Boolean(busy) || !actionable}
                      className="btn btn-ghost btn-xs"
                      title={`${t('Drop the cache + log for')} ${source.label} ${t('so the next pull starts on a clean path')}`}
                    >
                      {busy === source.id ? <IconRefresh size={12} className="animate-spin" /> : <IconClock size={12} />}
                      {t('Refresh')}
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {error && (
          <p className="flex items-start gap-1.5 border-t border-neg/25 bg-neg/[0.07] px-3 py-2 text-[11px] text-neg">
            <IconAlert size={12} className="mt-0.5 shrink-0" />
            {error}
          </p>
        )}

        {monitor?.hint && (
          <footer className="border-t border-slate-800/70 bg-slate-950/40 px-4 py-2">
            <p className="num text-[10px] leading-snug text-slate-400">{monitor.hint}</p>
          </footer>
        )}
      </section>

      <section className="card overflow-hidden">
        <header className="flex items-center justify-between gap-2 border-b border-slate-800/70 px-4 py-2">
          <h2 className="label">{t('Attempt log')}</h2>
          <span className="num text-[10px] text-slate-400">{formatNumber(history.length)} {t('entries')} · {t('max 24 per channel')}</span>
        </header>
        {history.length ? (
          <div className="scroll-x max-h-[168px] overflow-y-auto" tabIndex={0} role="region" aria-label={t('Attempt log per channel')}>
            <table className="w-full min-w-[620px] border-collapse text-xs">
              <caption className="sr-only">{t('The last twenty-four attempts per channel on the warm server instance')}</caption>
              <thead>
                <tr className="sticky top-0 z-10 border-b border-slate-800/70 bg-slate-900 text-[10px] uppercase tracking-wider text-slate-400">
                  <th scope="col" className="px-2 py-1 text-left font-semibold">{t('Time')}</th>
                  <th scope="col" className="px-2 py-1 text-left font-semibold">{t('Channel')}</th>
                  <th scope="col" className="px-2 py-1 text-left font-semibold">{t('Path')}</th>
                  <th scope="col" className="px-2 py-1 text-right font-semibold">{t('Duration')}</th>
                  <th scope="col" className="px-2 py-1 text-right font-semibold">{t('Rows')}</th>
                  <th scope="col" className="px-2 py-1 text-right font-semibold">{t('Status')}</th>
                  <th scope="col" className="px-2 py-1 text-right font-semibold">{t('Signal')}</th>
                  <th scope="col" className="px-2 py-1 text-right font-semibold">{t('Ago')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {[...history].reverse().map((attempt, index) => (
                  <tr key={`${attempt.at}-${index}`} className="hover:bg-slate-900/60">
                    <td className="num px-2 py-1 text-[10px] text-slate-400">{formatTime(attempt.at)}</td>
                    <td className="px-2 py-1 text-[10px] font-semibold text-slate-300">{attempt.source}</td>
                    <td className="px-2 py-1 text-[10px] text-slate-400">{attempt.cacheHit ? t('cache') : t('fresh pull')}</td>
                    <td className="num px-2 py-1 text-right text-[10px] text-slate-400">
                      {attempt.cacheHit ? `${t('age')} ${duration(attempt.cacheAgeMs)}` : duration(attempt.ms)}
                    </td>
                    <td className="num px-2 py-1 text-right text-[10px] text-slate-400">{formatNumber(attempt.fetched)} {t('rows')}</td>
                    <td className="px-2 py-1 text-right">
                      <span className={`pill ${attempt.status === 'error' ? TONE_CLASS.neg : attempt.status === 'partial' ? TONE_CLASS.neu : TONE_CLASS.pos}`}>
                        {attempt.status ? t(attempt.status) : t('failed')}
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
          <p className="px-3 py-4 text-center text-[11px] text-slate-400">
            {t('The warm server instance has not logged an attempt on this channel yet. Press Refresh or run a pull to fill the log.')}
          </p>
        )}
      </section>
    </div>
  );
}
