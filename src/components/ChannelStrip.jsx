import { channelStatusLabel, formatDateTime, formatDecimal, formatNumber, isNumber } from '../lib/format.js';
import { t } from '../lib/i18n.js';
import { StoreMark } from './Brand.jsx';
import { IconAlert, IconExternal, IconInfo } from './icons.jsx';

const STATUS_STYLES = {
  success: 'border-pos/25 bg-pos/10 text-pos',
  partial: 'border-neu/25 bg-neu/10 text-neu',
  empty: 'border-slate-700 bg-slate-800/70 text-slate-400',
  error: 'border-neg/30 bg-neg/10 text-neg',
};

function Stat({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="label-sm">{label}</p>
      <p className="num mt-1 truncate text-[12px] font-bold text-slate-200">{value}</p>
    </div>
  );
}

function ChannelRow({ channel, store, workspaceStore, fetchedAt }) {
  const selected = Boolean(workspaceStore?.appId);
  const app = channel?.app || null;
  const coverage = channel?.coverage || null;
  const storeRatings = app?.ratingCount ?? app?.ratings;
  const url = app?.url || workspaceStore?.url || null;
  const status = channel?.status;
  const style = STATUS_STYLES[status] || STATUS_STYLES.empty;
  const note = channel?.status === 'error' || channel?.status === 'empty'
    ? channel.message
    : channel?.truncated
      ? t('This channel was not read to the end on this pull.')
      : null;
  const noteTone = channel?.status === 'error' ? 'text-neg' : 'text-neu';

  return (
    <div className="min-w-0 px-4 py-3.5">
      <div className="flex items-start gap-2.5">
        <StoreMark store={store} size={26} tone="quiet" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-xs font-bold text-slate-100">{store === 'play' ? 'Google Play' : 'App Store'}</p>
            {selected ? (
              <span className={`pill ${style}`}>{channelStatusLabel(status)}</span>
            ) : (
              <span className="pill border-slate-800 bg-slate-900 text-slate-400">{t('not included')}</span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[10px] text-slate-400">
            {selected ? `${app?.title || workspaceStore?.title || 'N/A'} · ${workspaceStore?.appId || channel?.appId || 'N/A'}` : `${t('This channel was not selected')} · ${workspaceStore?.appId || 'N/A'}`}
          </p>
        </div>
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className="icon-btn h-7 w-7" aria-label={`${t('Open')} ${store === 'play' ? 'Google Play' : 'App Store'}`} title={t('Open in store')}>
            <IconExternal size={12} />
          </a>
        )}
      </div>

      {selected && (
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 border-t border-slate-800/70 pt-3 sm:grid-cols-4">
          <Stat label={t('Score')} value={isNumber(app?.score) ? formatDecimal(app.score, 2) : 'N/A'} />
          <Stat label={t('Ratings')} value={formatNumber(storeRatings)} />
          <Stat label={t('Read')} value={formatNumber(channel?.fetched)} />
          <Stat label={t('Reported')} value={formatNumber(coverage?.reportedReviewCount ?? app?.reviewCountReported)} />
        </div>
      )}

      {selected && note && (
        <p className={`mt-2 flex items-start gap-1.5 text-[10px] leading-relaxed ${noteTone}`}>
          <IconAlert size={11} className="mt-0.5 shrink-0" />
          <span className="line-clamp-2">{t(note)}</span>
        </p>
      )}

      {/* Baris kesegaran hanya ada kalau kanal itu benar-benar punya catatan dalam snapshot.
          Tanpa penjaga ini, project yang menyalakan satu toko tetapi snapshot-nya hanya memuat
          toko lain membaca `channel.cache` dari undefined dan seluruh dasbor hilang — dan
          klaim "fresh pull" untuk kanal yang tidak pernah di tarik bukan kebenaran. */}
      {selected && !note && channel ? (
        <p className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-400">
          <IconInfo size={11} />
          {channel.cache?.hit ? t('from cache') : t('fresh pull')} · {formatDateTime(channel.cache?.fetchedAt || fetchedAt)}
        </p>
      ) : null}
    </div>
  );
}

export function ChannelStrip({ dataset, workspace }) {
  const channels = Array.isArray(dataset.channels) ? dataset.channels : [];
  const byId = new Map(channels.map(channel => [channel.id, channel]));
  return (
    <section aria-labelledby="sumber-title" className="card overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-slate-800/70 px-4 py-2">
        <h2 id="sumber-title" className="label">{t('Sources')}</h2>
        <p className="text-[10px] text-slate-400">{t('Store figures shown as published, never forced to match what was read')}</p>
      </header>
      <div className="grid gap-0 md:grid-cols-2 md:divide-x divide-slate-800/70">
        {['play', 'appstore'].map(store => (
          <ChannelRow
            key={store}
            store={store}
            channel={byId.get(store)}
            workspaceStore={workspace?.stores?.[store]}
            fetchedAt={dataset.fetchedAt}
          />
        ))}
      </div>
    </section>
  );
}
