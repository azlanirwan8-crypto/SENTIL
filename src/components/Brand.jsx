import { SERIES_COLORS, storeColor } from './charts/palette.js';

export function LogoMark({ size = 24 }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-md border border-slate-800 bg-slate-900"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="14" width="4.5" height="7" rx="1.2" fill={SERIES_COLORS.negative} />
        <rect x="9.8" y="9" width="4.5" height="12" rx="1.2" fill={SERIES_COLORS.neutral} />
        <rect x="16.6" y="3" width="4.5" height="18" rx="1.2" fill={SERIES_COLORS.positive} />
      </svg>
    </span>
  );
}

export function Wordmark() {
  return (
    <span className="min-w-0 truncate text-[15px] font-extrabold tracking-[-0.01em] text-slate-100">Sentil</span>
  );
}

export function StoreGlyph({ store, size = 14 }) {
  if (store === 'play') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 3.3v17.4c0 .8.9 1.3 1.6.9l14-8.7a1 1 0 0 0 0-1.8l-14-8.7c-.7-.4-1.6.1-1.6.9Z" fill="currentColor" />
      </svg>
    );
  }
  if (store === 'appstore') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6.8 18.2 12 7.6l5.2 10.6M9.2 13.5h5.6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4.5 21h15" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function StoreMark({ store, size = 22, tone = 'solid' }) {
  // Warna diambil palet kanal, bukan ditulis di sini: sebelumnya apa pun yang bukan 'play'
  // dipaksa violet, jadi badge YouTube, Reddit, dan berita tampil dengan warna App Store.
  const color = storeColor(store);
  // Tinta mengikuti tema, bukan ditulis tetap: di tema gelap kanal memakai warna terang sehingga
  // glifnya harus gelap, di tema terang warnanya gelap sehingga glifnya harus terang.
  const ink = 'rgb(var(--slate-950))';
  if (tone === 'quiet') {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded border border-slate-800 bg-slate-900"
        style={{ width: size, height: size, color }}
        aria-hidden="true"
      >
        <StoreGlyph store={store} size={size * 0.55} />
      </span>
    );
  }
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded"
      style={{ width: size, height: size, color: ink, background: color }}
      aria-hidden="true"
    >
      <StoreGlyph store={store} size={size * 0.55} />
    </span>
  );
}
