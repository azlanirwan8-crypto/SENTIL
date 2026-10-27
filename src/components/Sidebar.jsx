import { LogoMark, Wordmark } from './Brand.jsx';
import { IconDatabase, IconGauge, IconGrid, IconLayers, IconStar } from './icons.jsx';
import { formatNumber } from '../lib/format.js';
import { t } from '../lib/i18n.js';

// Label nav 'Metode' sudah ditulis dalam bahasa Indonesia, jadi tabel i18n membacanya dua
// arah dan kunci ini tetap satu sumber.
const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: IconGrid, always: true },
  { id: 'reviews', label: 'Review', icon: IconDatabase, countKey: 'reviews' },
  { id: 'limits', label: 'Platform', icon: IconLayers, always: true },
  { id: 'compare', label: 'Compare', icon: IconStar, always: true },
  { id: 'method', label: 'Metode', icon: IconGauge },
];

export function Sidebar({ view, onView, snapshot, workspaceCount, hasData }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-[208px] shrink-0 flex-col border-r border-slate-800/80 bg-slate-900 p-3 lg:flex">
      <div className="flex min-w-0 items-center gap-2 px-1 py-1.5">
        <LogoMark size={24} />
        <Wordmark />
      </div>

      <nav className="mt-4 flex flex-col gap-0.5" aria-label={t('Primary navigation')}>
        {NAV.map(item => {
          const Icon = item.icon;
          const active = view === item.id;
          const count = item.countKey && snapshot ? snapshot[item.countKey] : null;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onView(item.id)}
              aria-current={active ? 'page' : undefined}
              disabled={!hasData && !item.always}
              className={`nav-item ${active ? 'nav-item-active' : ''} disabled:cursor-not-allowed disabled:opacity-35`}
            >
              <Icon size={14} className={active ? 'text-accent' : 'text-slate-400'} />
              <span className="flex-1 text-left">{t(item.label)}</span>
              {count != null && (
                <span className={`num rounded px-1 py-0.5 text-[10px] font-bold ${active ? 'bg-slate-700 text-slate-100' : 'bg-slate-800/80 text-slate-400'}`}>
                  {formatNumber(count)}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto space-y-2 border-t border-slate-800/80 pt-3">
        <dl className="space-y-1.5 px-1">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-[10px] uppercase tracking-wider text-slate-400">{t('Workspaces')}</dt>
            <dd className="num text-[10px] font-semibold text-slate-400">{formatNumber(workspaceCount)}</dd>
          </div>
        </dl>
      </div>
    </aside>
  );
}

export function MobileNav({ view, onView, snapshot, hasData }) {
  return (
    <nav className="flex items-center gap-1 lg:hidden" aria-label={t('Primary navigation')}>
      {NAV.map(item => {
        const active = view === item.id;
        const count = item.countKey && snapshot ? snapshot[item.countKey] : null;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onView(item.id)}
            aria-current={active ? 'page' : undefined}
            disabled={!hasData && !item.always}
            className={`filter-chip ${active ? 'filter-chip-active' : ''} disabled:opacity-40`}
          >
            {t(item.label)}
            {count != null && <span className="count-quiet">{formatNumber(count)}</span>}
          </button>
        );
      })}
    </nav>
  );
}
