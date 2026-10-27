import { useEffect, useState } from 'react';
import { channelStatusLabel, formatDateTime, formatNumber } from '../lib/format.js';
import { t } from '../lib/i18n.js';
import { StoreMark } from './Brand.jsx';
import { Progress } from './Progress.jsx';
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

// Nama tahap analisis yang dibaca orang. Urutannya sama dengan capaian yang dilaporkan mesin
// (model.timings.stages), jadi label yang menyala adalah tahap yang memang sudah selesai.
const STAGE_LABELS = {
  tokenize: 'splitting review text into words',
  stopwords: 'learning the function words of this corpus',
  weights: 'learning word weights from the 1–2 vs 4–5★ contrast',
  topics: 'matching the 23-topic domain dictionary',
  phrases: 'measuring complaint phrases against praise',
  rows: 'labelling every stored review row',
  signals: 'testing proportion signals',
};

const PHASE_TITLES = {
  fetch: 'Reading sources',
  analyse: 'Analysing the corpus',
  write: 'Saving the snapshot',
  storing: 'Saving the snapshot',
  done: 'Finishing',
  failed: 'Stopped',
};

function PhaseLine({ active, done, title, detail }) {
  return (
    <div className={`flex items-baseline gap-2 px-3 py-1.5 text-[11px] ${active ? 'text-slate-100' : 'text-slate-400'}`}>
      <span className={`num w-[14px] shrink-0 text-[10px] ${done ? 'text-pos' : ''}`}>{done ? '✓' : active ? '●' : '○'}</span>
      <span className={`min-w-0 flex-1 truncate font-semibold ${active ? '' : 'font-normal'}`}>{title}</span>
      {detail ? <span className="num shrink-0 text-[10px] text-slate-400">{detail}</span> : null}
    </div>
  );
}

function SyncHeader({ phase, percent, rows, elapsed }) {
  // Laju dihitung dari apa yang benar-benar terlihat di layar ini: baris yang dilaporkan server
  // dibagi detik sejak layar dibuka. Fase tarik tidak punya persen, jadi laju inilah yang
  // membuat orang tahu apakah penarikan masih jalan atau macet.
  const rate = elapsed >= 3 && rows > 0 ? Math.round(rows / elapsed) : 0;
  return (
    <header className="flex items-center justify-between gap-3 border-b border-slate-800/70 px-4 py-2">
      <h2 className="label">{PHASE_TITLES[phase] ? t(PHASE_TITLES[phase]) : t('Pull in progress')}</h2>
      <p className="num flex shrink-0 items-baseline gap-2 text-[10px] text-slate-400">
        {percent !== null
          ? <span className="font-semibold text-slate-200">{Math.round(percent)}%</span>
          : <span>{formatNumber(rows)} {t('rows read')}</span>}
        {rate > 0 && <span aria-hidden="true">· {formatNumber(rate)}/s</span>}
        <span aria-hidden="true">·</span>
        <span>{elapsed < 1 ? t('just started') : `${elapsed} s`}</span>
      </p>
    </header>
  );
}

export function BootScreen({ label = t('Loading') }) {
  return (
    <div className="space-y-3" aria-busy="true">
      <section className="card overflow-hidden">
        <header className="flex items-center justify-between gap-3 border-b border-slate-800/70 px-4 py-2">
          <h2 className="label">{label}</h2>
          <p className="text-[10px] text-slate-400">
            {t('database')}<span className="sr-only">{t(' is being read')}</span>
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
        <Progress label={t('Reading sources')} />
      </section>
    </div>
  );
}

export function SyncScreen({ workspace, progress = null }) {
  const [elapsed, setElapsed] = useState(0);
  const stores = ['play', 'appstore'].filter(store => workspace.stores?.[store]?.appId);
  const phase = progress?.phase || 'fetch';
  const percent = Number.isFinite(progress?.overallPercent) ? progress.overallPercent : null;
  const rows = Number(progress?.rows) || 0;
  const channels = Array.isArray(progress?.channels) ? progress.channels : [];
  const stages = Array.isArray(progress?.stages) ? progress.stages : [];
  const chunks = progress?.chunks || { done: 0, total: 0 };
  const activeChannel = id => channels.find(entry => entry.id === id) || null;
  // Nilai peta label tetap dibaca lewat t(variabel) di tempat digambar; yang berdiri sendiri di
  // sini hanyalah teks cadangannya, supaya ia juga menjadi literal t('...') yang terlihat pemindai.
  const stageLabel = STAGE_LABELS[stages[stages.length - 1]] || null;

  useEffect(() => {
    const timer = window.setInterval(() => setElapsed(value => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const rowsOf = id => {
    const entry = activeChannel(id);
    return entry ? formatNumber(entry.rows || 0) : null;
  };

  return (
    <div className="space-y-3" aria-busy="true">
      <section className="card overflow-hidden">
        <SyncHeader phase={phase} percent={percent} rows={rows} elapsed={elapsed} />
        <div className="grid gap-3 p-3 md:grid-cols-2 md:divide-x divide-slate-800/70">
          <div>
            <PhaseLine
              active={phase === 'fetch'}
              done={['analyse', 'write', 'storing', 'done'].includes(phase)}
              title={t('1 · Read the sources')}
              detail={phase === 'fetch' && rows ? `${formatNumber(rows)} ${t('rows')}` : (stores.length ? stores.map(store => rowsOf(store)).filter(Boolean).join(' · ') || t('opening') : null)}
            />
            {stores.map(store => {
              const counted = rowsOf(store);
              const running = phase === 'fetch';
              return (
                <div key={store} className="flex items-center gap-2.5 px-3 py-2">
                  <StoreMark store={store} size={20} tone="quiet" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-bold text-slate-200">{store === 'play' ? 'Google Play' : 'App Store'}</p>
                    <p className="truncate font-mono text-[10px] text-slate-400">{workspace.stores[store].appId}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold ${running ? 'text-accent' : 'text-slate-400'}`}>
                    {running ? <Spinner /> : null}
                    {counted ? <span className="num">{counted} {t('read')}</span> : running ? t('pulling') : t('done')}
                  </span>
                </div>
              );
            })}
            <PhaseLine
              active={phase === 'analyse'}
              done={['write', 'storing', 'done'].includes(phase)}
              title={t('2 · Analyse the corpus')}
              detail={phase === 'analyse'
                ? `${stages.length}/7 · ${stageLabel ? t(stageLabel) : t('starting')}`
                : (['write', 'storing', 'done'].includes(phase) ? t('7/7 stages') : null)}
            />
            <PhaseLine
              active={['write', 'storing'].includes(phase)}
              done={phase === 'done'}
              title={t('3 · Save the snapshot')}
              detail={chunks.total ? `${formatNumber(chunks.done)}/${formatNumber(chunks.total)} ${t('blocks of 1.000')}` : null}
            />
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
        <Progress
          label={PHASE_TITLES[phase] ? t(PHASE_TITLES[phase]) : t('Pull in progress')}
          percent={percent}
          detail={percent === null ? t('The reading phase has no honest total: a store page never says how many reviews are still readable.') : `${Math.round(percent)}% ${t('of the measured work')}`}
        />
        <p className="px-4 py-2 text-[10px] leading-relaxed text-slate-400">
          {percent === null
            ? t('No percentage is shown while sources are being read, because the store does not report how much of its review history is still reachable — the row counter is real work, the percentage would not be. Percentages start as soon as the corpus is complete and measurable.')
            : t('Percentages are computed from finished work only: analysis stages that already returned and review blocks the database already accepted.')}
        </p>
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
        <span className={`pill ${tone}`}>{channelStatusLabel(status) || t('Not pulled yet')}</span>
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-accent" aria-label={t('Open the store page')}>
            <IconExternal size={12} />
          </a>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-800/70 pt-2">
        <span className="truncate font-mono text-[10px] text-slate-400">{workspaceStore?.appId || 'N/A'}</span>
        <span className="num shrink-0 text-[10px] font-semibold text-slate-400">
          {channel?.fetched != null ? `${formatNumber(channel.fetched)} ${t('read')}` : `0 ${t('read')}`}
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
    ? allError ? t('Channels could not be read') : t('No written review was read')
    : syncError ? t('Pull failed') : t('No snapshot yet');
  // Error yang sudah dibawa ke layar ini adalah string yang mungkin dibuat dalam bahasa lain,
  // jadi ia dibaca ulang lewat tabel dua arah; pesan dari server tidak ada di tabel dan tetap
  // apa adanya.
  const body = dataset
    ? allError
      ? t('Source failures on the last pull, not proof of zero reviews. The older snapshot is still in use.')
      : t('The sources responded, but no written review came back for the selected channels.')
    : (syncError || datasetError) ? t(syncError || datasetError) : t('No data copy exists in this workspace yet.');

  return (
    <div className="mx-auto w-full max-w-[720px] space-y-3" aria-live="polite">
      {dataset && (syncError || datasetError) && (
        <Notice tone="coral" title={t('Load note')} live>{syncError || datasetError}</Notice>
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
              {syncing ? t('Pulling data…') : t('Pull data now')}
              {!syncing && <IconArrowRight size={12} />}
            </button>
            {dataset?.fetchedAt && (
              <span className="text-[10px] text-slate-400">{t('Last snapshot')} {formatDateTime(dataset.fetchedAt)}</span>
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
