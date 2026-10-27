import { LogoMark } from './Brand.jsx';
import { Progress } from './Progress.jsx';
import { IconChevronDown, IconPlus, IconRefresh, IconTrash } from './icons.jsx';
import { formatNumber } from '../lib/format.js';
import { setLanguage, t, useLanguage } from '../lib/i18n.js';

function Spinner({ size = 13 }) {
  return (
    <span
      className="inline-block animate-spin rounded-full border-[1.5px] border-current border-r-transparent"
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}

// Bendera digambar inline, bukan emoji: Windows menampilkan pasangan huruf regional sebagai
// blok "ID"/"EN" mentah, dan satu berkas gambar tambahan adalah byte yang harus dimuat
// sebelum tombol pertama bisa ditekan. Kotaknya sama untuk dua tombol (16x12) supaya ritme
// gap-1.5 tidak berubah saat bahasa diganti.
const FLAG_EDGE = '#334155';

function FlagEnglish() {
  // Union Jack yang disederhanakan: garam putih, jalur merah, lalu salib merah berbingkai
  // putih. Dipotong dengan clip supaya ujungnya tidak keluar kotak pada 28px.
  return (
    <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id="sentil-union-clip">
          <rect width="16" height="12" rx="1.5" />
        </clipPath>
      </defs>
      <g clipPath="url(#sentil-union-clip)">
        <rect width="16" height="12" fill="#1D3A8A" />
        <path d="M0 0 16 12M16 0 0 12" stroke="#F8FAFC" strokeWidth="3" />
        <path d="M0 0 16 12M16 0 0 12" stroke="#C8102E" strokeWidth="1.4" />
        <path d="M8 0v12M0 6h16" stroke="#F8FAFC" strokeWidth="4" />
        <path d="M8 0v12M0 6h16" stroke="#C8102E" strokeWidth="2.2" />
      </g>
      <rect x="0.5" y="0.5" width="15" height="11" rx="1.5" fill="none" stroke={FLAG_EDGE} />
    </svg>
  );
}

function FlagIndonesian() {
  return (
    <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true" focusable="false">
      <rect width="16" height="6" fill="#C8102E" />
      <rect y="6" width="16" height="6" fill="#F8FAFC" />
      <rect x="0.5" y="0.5" width="15" height="11" rx="1.5" fill="none" stroke={FLAG_EDGE} />
    </svg>
  );
}

export function TopBar({ workspaces, activeId, activeWorkspace, syncing, syncProgress = null, onSwitch, onAdd, onRefresh, onDelete }) {
  const language = useLanguage();
  const hasWorkspace = Boolean(activeWorkspace);
  const snapshot = activeWorkspace?.snapshot || null;
  const pullPercent = Number.isFinite(syncProgress?.overallPercent) ? Math.round(syncProgress.overallPercent) : null;
  const pullRows = Number(syncProgress?.rows) || 0;

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-md">
      <div className="flex h-[52px] items-center gap-2 px-3 sm:px-4">
        <span className="lg:hidden">
          <LogoMark size={24} />
        </span>

        <div className="group relative h-8 min-w-0 max-w-[320px] flex-1 rounded-md border border-slate-800 bg-slate-900/70 transition focus-within:border-accent/60 focus-within:ring-1 focus-within:ring-accent/25 hover:border-slate-700">
          <div className="pointer-events-none flex h-full items-center gap-2 px-2.5" aria-hidden="true">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent/80" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold leading-tight text-slate-100">
                {hasWorkspace ? activeWorkspace.label : t('No analysis yet')}
              </span>
              {hasWorkspace && snapshot?.reviews != null && (
                <span className="num block text-[10px] leading-tight text-slate-400">
                  {formatNumber(snapshot.reviews)} {t('reviews')} · {activeWorkspace.entity}
                </span>
              )}
            </span>
            <IconChevronDown size={14} className="shrink-0 text-slate-400 transition group-hover:text-slate-300" />
          </div>
          <select
            aria-label={t('Select workspace')}
            value={activeId || ''}
            onChange={event => onSwitch(event.target.value || null)}
            disabled={workspaces.length === 0}
            className="absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-md text-transparent opacity-0 disabled:cursor-not-allowed"
          >
            {workspaces.length === 0 && <option value="">{t('No analysis yet')}</option>}
            {workspaces.map(workspace => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.label} — {workspace.entity}
              </option>
            ))}
          </select>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {syncing && (
            <span className="hidden items-center gap-1.5 rounded border border-accent/25 bg-accent/10 px-2 py-1 text-[10px] font-semibold text-accent sm:inline-flex">
              <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-accent" />
              {pullPercent !== null ? <span className="num">{pullPercent}% {t('of the pull')}</span> : pullRows ? <span className="num">{formatNumber(pullRows)} {t('rows read')}</span> : t('pulling data')}
            </span>
          )}
          <button
            type="button"
            onClick={() => setLanguage('en')}
            aria-label={t('Switch to English')}
            aria-pressed={language === 'en'}
            title={t('Switch to English')}
            className={`icon-btn h-7 w-7 ${language === 'en' ? 'border-accent/60' : ''}`}
          >
            <FlagEnglish />
          </button>
          <button
            type="button"
            onClick={() => setLanguage('id')}
            aria-label={t('Switch to Indonesian')}
            aria-pressed={language === 'id'}
            title={t('Switch to Indonesian')}
            className={`icon-btn h-7 w-7 ${language === 'id' ? 'border-accent/60' : ''}`}
          >
            <FlagIndonesian />
          </button>
          <button type="button" onClick={onAdd} disabled={syncing} className="btn btn-primary" title={t('Add a new analysis')}>
            <IconPlus size={14} />
            <span className="hidden sm:inline">{t('Add analysis')}</span>
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={!hasWorkspace || syncing}
            className="btn btn-secondary"
            title={t('Refresh data (force sync, skips the one-hour cache)')}
          >
            {syncing ? <Spinner /> : <IconRefresh size={14} />}
            <span className="hidden md:inline">{syncing ? t('Pulling…') : t('Refresh')}</span>
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={!hasWorkspace || syncing}
            className="icon-btn hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300"
            aria-label={t('Delete this analysis')}
            title={t('Delete this analysis')}
          >
            <IconTrash size={14} />
          </button>
        </div>
      </div>
      {syncing && (
        <Progress
          label={pullPercent !== null ? `${t('Pull progress')} ${pullPercent}%` : t('Pulling data')}
          percent={pullPercent}
        />
      )}
    </header>
  );
}
