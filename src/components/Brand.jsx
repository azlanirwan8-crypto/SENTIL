export function LogoMark({ size = 38, className = '' }) {
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center rounded-[11px] bg-ink ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="14" width="4.5" height="7" rx="1.4" fill="#D46A51" />
        <rect x="9.8" y="9" width="4.5" height="12" rx="1.4" fill="#C18A2B" />
        <rect x="16.6" y="3" width="4.5" height="18" rx="1.4" fill="#2B9C83" />
      </svg>
    </span>
  );
}

export function Wordmark({ compact = false }) {
  return (
    <span className="flex min-w-0 flex-col leading-none">
      <span className={`font-display font-semibold tracking-[-0.025em] text-ink ${compact ? 'text-[17px]' : 'text-[20px]'}`}>
        Sentiment <span className="text-teal">Intelligence</span>
      </span>
      {!compact && (
        <span className="mt-[5px] text-[8.5px] font-bold uppercase tracking-[0.24em] text-ink-faint">
          Mesin korpus · ruang analisis
        </span>
      )}
    </span>
  );
}

export function Brand({ compact = false }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <LogoMark size={compact ? 34 : 38} />
      <Wordmark compact={compact} />
    </span>
  );
}

export function StoreGlyph({ store, size = 18 }) {
  if (store === 'play') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 3.3v17.4c0 .8.9 1.3 1.6.9l14-8.7a1 1 0 0 0 0-1.8l-14-8.7c-.7-.4-1.6.1-1.6.9Z" fill="currentColor" />
        <path d="m5.4 3.7 10.8 9.9 3.1-1.9c.7-.4.7-1 0-1.4L6.8 3.1c-.6-.4-1.4-.1-1.4.6Z" fill="currentColor" opacity=".55" />
      </svg>
    );
  }
  if (store === 'appstore') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6.8 18.2 12 7.6l5.2 10.6M9.2 13.5h5.6" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4.5 21h15" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </svg>
  );
}

export function StoreMark({ store, size = 34, tone = 'solid' }) {
  const play = store === 'play';
  const background = play ? 'bg-teal text-paper-50' : 'bg-amber text-paper-50';
  if (tone === 'quiet') {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-[10px] border ${play ? 'border-teal/20 bg-teal-soft text-teal-deep' : 'border-amber/25 bg-amber-soft text-amber-deep'}`}
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <StoreGlyph store={store} size={size * 0.52} />
      </span>
    );
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-[10px] ${background}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <StoreGlyph store={store} size={size * 0.52} />
    </span>
  );
}

export function StoreName({ store }) {
  return store === 'play' ? 'Google Play' : store === 'appstore' ? 'App Store' : store || 'N/A';
}
