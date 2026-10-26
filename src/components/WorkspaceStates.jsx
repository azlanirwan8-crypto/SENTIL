import { useEffect, useState } from 'react';
import { channelStatusLabel, formatDateTime, formatNumber } from '../lib/format.js';
import { StoreMark } from './Brand.jsx';
import { Notice } from './Notices.jsx';
import { IconArrowRight, IconExternal, IconRefresh } from './icons.jsx';

const CHANNEL_TONES = {
  success: 'border-pos/25 bg-pos/10 text-pos',
  partial: 'border-neu/25 bg-neu/10 text-neu',
  empty: 'border-slate-700 bg-slate-800/70 text-slate-400',
  error: 'border-neg/30 bg-neg/10 text-neg',
};

function Spinner({ size = 12 }) {
  return (
    <span
      className="inline-block animate-spin rounded-full border-[1.5px] border-current border-r-transparent"
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}

export function BootScreen({ label = 'Loading' }) {
  return (
    <div className="space-y-3" aria-busy="true">
      <section className="card overflow-hidden">
        <header className="flex items-center justify-between gap-3 border-b border-slate-800/70 px-3 py-1.5">
          <h2 className="label">{label}</h2>
          <p className="text-[10px] text-slate-400">
            database<span className="sr-only"> is being read</span>
          </p>
        </header>
        <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map(index => (
            <div key={index}>
              <div className="skeleton h-2 w-12" />
              <div className="skeleton mt-3 h-6 w-20" />
              <div className="skeleton mt-3 h-1.5 w-full" />
            </div>
          ))}
        </div>
        <div className="progress-indeterminate h-[2px] w-full bg-slate-900" />
      </section>
    </div>
  );
}

function ScanRow({ store, appId }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-slate-800/70 px-3 py-2.5 last:border-b-0">
      <StoreMark store={store} size={22} tone="quiet" />
      <div className="min-w-0 flex-1">
        <p className="text-[11.5px] font-bold text-slate-100">{store === 'play' ? 'Google Play' : 'App Store'}</p>
        <p className="truncate font-mono text-[10px] text-slate-400">{appId}</p>
      </div>
      <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-accent">
        <Spinner />
        pulling
      </span>
    </div>
  );
}

export function SyncScreen({ workspace }) {
  const [elapsed, setElapsed] = useState(0);
  const stores = ['play', 'appstore'].filter(store => workspace.stores?.[store]?.appId);

  useEffect(() => {
    const timer = window.setInterval(() => setElapsed(value => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="space-y-3" aria-busy="true">
      <section className="card overflow-hidden">
        <header className="flex items-center justify-between gap-3 border-b border-slate-800/70 px-3 py-1.5">
          <h2 className="label">Pull in progress</h2>
          <p className="num text-[10px] text-slate-400">
            {elapsed < 1 ? 'just started' : `${elapsed} seconds`}<span className="sr-only"> since the pull started</span>
          </p>
        </header>
        <div className="grid md:grid-cols-2 md:divide-x divide-slate-800/70">
          <div>
            {stores.map(store => (
              <ScanRow key={store} store={store} appId={workspace.stores[store].appId} />
            ))}
            <div className="flex items-center gap-2.5 px-3 py-2.5">
              <span className="flex h-[22px] w-[22px] items-center justify-center rounded-md border border-slate-800 bg-slate-900 text-[10px] font-bold text-slate-400">
                NLP
              </span>
              <p className="min-w-0 flex-1 truncate text-[11.5px] font-bold text-slate-100">Corpus model</p>
              <span className="text-[10px] text-slate-400">stopwords · weights · topics</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-0 divide-x divide-slate-800/70">
            {[0, 1, 2, 3].map(index => (
              <div key={index} className="p-3 odd:border-r odd:border-slate-800/70">
                <div className="skeleton h-2 w-12" />
                <div className="skeleton mt-3 h-6 w-20" />
                <div className="skeleton mt-3 h-1.5 w-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="progress-indeterminate h-[2px] w-full bg-slate-900" />
      </section>
    </div>
  );
}

function ChannelState({ channel, workspaceStore, store }) {
  const status = channel?.status;
  const tone = CHANNEL_TONES[status] || 'border-slate-800 bg-slate-900 text-slate-400';
  const url = channel?.app?.url || workspaceStore?.url || null;
  return (
    <div className="min-w-0 p-3">
      <div className="flex items-center gap-2">
        <StoreMark store={store} size={22} tone="quiet" />
        <p className="min-w-0 flex-1 truncate text-[11.5px] font-bold text-slate-100">
          {store === 'play' ? 'Google Play' : 'App Store'}
        </p>
        <span className={`pill ${tone}`}>{channelStatusLabel(status) || 'Not pulled yet'}</span>
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-accent" aria-label="Open the store page">
            <IconExternal size={12} />
          </a>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-800/70 pt-2">
        <span className="truncate font-mono text-[10px] text-slate-400">{workspaceStore?.appId || 'N/A'}</span>
        <span className="num shrink-0 text-[10px] font-semibold text-slate-400">
          {channel?.fetched != null ? `${formatNumber(channel.fetched)} read` : '0 read'}
        </span>
      </div>
      {channel?.message && (
        <p className="mt-1.5 line-clamp-2 text-[10px] leading-snug text-slate-400">{channel.message}</p>
      )}
    </div>
  );
}

export function WorkspaceEmpty({ workspace, dataset, datasetError, syncError, syncing, onRefresh }) {
  const channels = Array.isArray(dataset?.channels) ? dataset.channels : [];
  const byId = new Map(channels.map(channel => [channel.id, channel]));
  const stores = ['play', 'appstore'].filter(store => workspace.stores?.[store]?.appId);
  const allError = channels.length > 0 && channels.every(channel => channel.status === 'error');
  const title = dataset
    ? allError ? 'Channels could not be read' : 'No written review was read'
    : syncError ? 'Pull failed' : 'No snapshot yet';
  const body = dataset
    ? allError
      ? 'Source failures on the last pull, not proof of zero reviews. The older snapshot is still in use.'
      : 'The sources responded, but no written review came back for the selected channels.'
    : syncError || datasetError || 'No data copy exists in this workspace yet.';

  return (
    <div className="mx-auto w-full max-w-[720px] space-y-3" aria-live="polite">
      {dataset && (syncError || datasetError) && (
        <Notice tone="coral" title="Load note" live>{syncError || datasetError}</Notice>
      )}

      <section className="card overflow-hidden">
        <div className="flex flex-col items-center px-4 py-6 text-center">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-800 bg-slate-900 text-slate-400">
            <IconRefresh size={15} />
          </span>
          <h2 className="mt-3 text-[13px] font-bold text-slate-100">{title}</h2>
          <p className="mt-1 max-w-[46ch] text-[11px] leading-relaxed text-slate-400 text-balance">{body}</p>
          <div className="mt-4 flex items-center gap-2">
            <button type="button" onClick={onRefresh} disabled={syncing} className="btn btn-primary">
              {syncing ? <Spinner size={12} /> : <IconRefresh size={13} />}
              {syncing ? 'Pulling data…' : 'Pull data now'}
              {!syncing && <IconArrowRight size={12} />}
            </button>
            {dataset?.fetchedAt && (
              <span className="text-[10px] text-slate-400">Last snapshot {formatDateTime(dataset.fetchedAt)}</span>
            )}
          </div>
        </div>

        {stores.length > 0 && (
          <div className="grid border-t border-slate-800/80 sm:grid-cols-2 sm:divide-x divide-slate-800/70">
            {stores.map(store => (
              <ChannelState key={store} store={store} channel={byId.get(store)} workspaceStore={workspace.stores[store]} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
