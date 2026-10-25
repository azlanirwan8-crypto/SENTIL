import { useRef } from 'react';
import { formatDateTime, formatNumber, relativeTime } from '../lib/format.js';
import { StoreMark } from './Brand.jsx';
import { IconChart, IconExternal, IconQuote, IconSpark } from './icons.jsx';

const TABS = [
  { id: 'dashboard', label: 'Dasbor', icon: IconChart },
  { id: 'reviews', label: 'Ulasan', icon: IconQuote, countKey: 'reviews' },
  { id: 'method', label: 'Metode & data', icon: IconSpark },
];

export function WorkspaceHeader({ workspace, dataset, view, onView, syncing }) {
  const tabRefs = useRef([]);
  const snapshot = dataset?.summary || workspace.snapshot || null;
  const fetchedAt = dataset?.fetchedAt || workspace.lastSyncedAt || null;
  const stores = ['play', 'appstore'].filter(store => workspace.stores?.[store]?.appId);

  function onTabKeyDown(event, index) {
    let next = null;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TABS.length - 1;
    if (next == null) return;
    event.preventDefault();
    onView(TABS[next].id);
    tabRefs.current[next]?.focus();
  }

  return (
    <header className="pt-7 sm:pt-9">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rule-label">Workspace aktif</span>
            <span className="chip py-0.5 text-[9px]">lokal</span>
            {syncing && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-teal/25 bg-teal-soft/60 px-2 py-0.5 text-[9px] font-bold text-teal-deep">
                <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-teal" />
                memperbarui
              </span>
            )}
          </div>
          <h1 className="mt-3 max-w-[22ch] text-balance text-[clamp(2rem,4.2vw,3.35rem)] leading-[1.02] text-ink">{workspace.label}</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
            Entitas <span className="font-semibold text-ink-soft">{workspace.entity}</span>
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {stores.map(store => {
              const target = workspace.stores[store];
              const content = (
                <>
                  <StoreMark store={store} size={20} tone="quiet" />
                  <span className="text-[10.5px] font-semibold">{store === 'play' ? 'Google Play' : 'App Store'}</span>
                  <span className="max-w-[130px] truncate font-mono text-[9px] text-ink-faint">{target.appId}</span>
                  {target.url && <IconExternal size={11} className="text-ink-faint" />}
                </>
              );
              return target.url ? (
                <a
                  key={store}
                  href={target.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="chip bg-paper-50/80 transition hover:border-line-strong hover:bg-paper-100"
                  aria-label={`Buka ${store === 'play' ? 'Google Play' : 'App Store'} ${target.appId} di tab baru`}
                >
                  {content}
                </a>
              ) : (
                <span key={store} className="chip bg-paper-50/80">{content}</span>
              );
            })}
            {!stores.length && <span className="chip text-ink-faint">Tidak ada target toko</span>}
          </div>
        </div>

        <dl className="grid shrink-0 grid-cols-2 gap-x-8 gap-y-4 border-line/80 sm:border-l sm:pl-7 lg:min-w-[300px]">
          <div>
            <dt className="eyebrow">Tarik terakhir</dt>
            <dd className="mt-1.5 text-[12px] font-semibold leading-snug text-ink">{fetchedAt ? formatDateTime(fetchedAt) : 'Belum pernah'}</dd>
            <dd className="mt-0.5 text-[10px] text-ink-faint">{fetchedAt ? relativeTime(fetchedAt) : 'Snapshot belum tersedia'}</dd>
          </div>
          <div>
            <dt className="eyebrow">Snapshot</dt>
            <dd className="num mt-1.5 text-[12px] font-semibold leading-snug text-ink">
              {snapshot ? `${formatNumber(snapshot.reviews)} ulasan` : 'N/A'}
            </dd>
            <dd className="mt-0.5 text-[10px] text-ink-faint">
              {snapshot ? `${formatNumber(snapshot.analyzed)} terklasifikasi` : 'Belum ada data'}
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-line/80 pb-3">
        <div role="tablist" aria-label="Bagian analisis" className="flex items-center gap-1">
          {TABS.map((tab, index) => {
            const Icon = tab.icon;
            const selected = view === tab.id;
            const count = tab.countKey && snapshot ? snapshot[tab.countKey] : null;
            return (
              <button
                key={tab.id}
                ref={node => { tabRefs.current[index] = node; }}
                id={`tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`panel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => onView(tab.id)}
                onKeyDown={event => onTabKeyDown(event, index)}
                className={`tab ${selected ? 'tab-active' : ''}`}
              >
                <Icon size={15} />
                {tab.label}
                {count != null && (
                  <span className={`num rounded-full px-1.5 py-0.5 text-[9px] ${selected ? 'bg-paper-50/15 text-paper-50/85' : 'bg-paper-200 text-ink-muted'}`}>
                    {formatNumber(count)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-faint">
          {dataset?.engine?.version ? `mesin ${dataset.engine.version}` : 'mesin belum aktif'}
        </span>
      </div>
    </header>
  );
}
