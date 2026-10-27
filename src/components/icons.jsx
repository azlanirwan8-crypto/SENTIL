const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: 'false',
};

export function IconPlus({ size = 17, ...props }) {
  return <svg {...base} width={size} height={size} {...props}><path d="M12 5v14M5 12h14" /></svg>;
}

export function IconRefresh({ size = 17, ...props }) {
  return (
    <svg {...base} width={size} height={size} {...props}>
      <path d="M20 11a8.1 8.1 0 0 0-14.8-4M4 4v4h4" />
      <path d="M4 13a8.1 8.1 0 0 0 14.8 4M20 20v-4h-4" />
    </svg>
  );
}

export function IconTrash({ size = 17, ...props }) {
  return (
    <svg {...base} width={size} height={size} {...props}>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

export function IconChevronDown({ size = 16, ...props }) {
  return <svg {...base} width={size} height={size} {...props}><path d="m6 9 6 6 6-6" /></svg>;
}

export function IconSearch({ size = 17, ...props }) {
  return (
    <svg {...base} width={size} height={size} {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
    </svg>
  );
}

export function IconExternal({ size = 15, ...props }) {
  return (
    <svg {...base} width={size} height={size} {...props}>
      <path d="M14 4h6v6M20 4 10 14" />
      <path d="M19 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4" />
    </svg>
  );
}

export function IconArrowRight({ size = 17, ...props }) {
  return <svg {...base} width={size} height={size} {...props}><path d="M4 12h16M14 6l6 6-6 6" /></svg>;
}

export function IconCheck({ size = 15, ...props }) {
  return <svg {...base} width={size} height={size} {...props}><path d="m4.5 12.5 5 5 10-11" /></svg>;
}

export function IconX({ size = 18, ...props }) {
  return <svg {...base} width={size} height={size} {...props}><path d="m6 6 12 12M18 6 6 18" /></svg>;
}

export function IconDownload({ size = 17, ...props }) {
  return (
    <svg {...base} width={size} height={size} {...props}>
      <path d="M12 3v12M7 10l5 5 5-5" />
      <path d="M4 20h16" />
    </svg>
  );
}

export function IconInfo({ size = 17, ...props }) {
  return (
    <svg {...base} width={size} height={size} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}

export function IconAlert({ size = 17, ...props }) {
  return (
    <svg {...base} width={size} height={size} {...props}>
      <path d="M10.3 4.2 2.6 18a2 2 0 0 0 1.8 3h15.2a2 2 0 0 0 1.8-3L13.7 4.2a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}

export function IconStar({ size = 14, ...props }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true" focusable="false" {...props}>
      <path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3.1L6.2 20.5l1.1-6.5L2.6 9.4l6.5-.9L12 2.6z" />
    </svg>
  );
}

export function IconLayers({ size = 17, ...props }) {
  return (
    <svg {...base} width={size} height={size} {...props}>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 13 9 5 9-5M3 17l9 5 9-5" />
    </svg>
  );
}

export function IconQuote({ size = 16, ...props }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true" focusable="false" {...props}>
      <path d="M9.5 5.2c-3 1.5-5.1 4.2-5.1 8.1v5.5h6.4v-6.4H7.3c.1-2.1 1.1-3.6 3.1-4.6L9.5 5.2Zm10 0c-3 1.5-5.1 4.2-5.1 8.1v5.5h6.4v-6.4h-3.5c.1-2.1 1.1-3.6 3.1-4.6l-.9-2.6Z" />
    </svg>
  );
}

export function IconGrid({ size = 15, ...props }) {
  return (
    <svg {...base} width={size} height={size} {...props}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export function IconGauge({ size = 15, ...props }) {
  return (
    <svg {...base} width={size} height={size} {...props}>
      <path d="M3.5 18a9 9 0 1 1 17 0" />
      <path d="m12 14 4-4" />
      <circle cx="12" cy="14" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconDatabase({ size = 15, ...props }) {
  return (
    <svg {...base} width={size} height={size} {...props}>
      <ellipse cx="12" cy="5.5" rx="8" ry="3" />
      <path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13" />
      <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </svg>
  );
}

export function IconClock({ size = 13, ...props }) {
  return (
    <svg {...base} width={size} height={size} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function IconShield({ size = 13, ...props }) {
  return (
    <svg {...base} width={size} height={size} {...props}>
      <path d="M12 3l7 3v5.5c0 4.2-2.9 7.8-7 9.5-4.1-1.7-7-5.3-7-9.5V6l7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function IconSun({ size = 17, ...props }) {
  return (
    <svg {...base} width={size} height={size} {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
    </svg>
  );
}

export function IconMoon({ size = 17, ...props }) {
  return (
    <svg {...base} width={size} height={size} {...props}>
      <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4 8.4 8.4 0 1 0 20 14.2Z" />
    </svg>
  );
}

export function IconExpand({ size = 17, ...props }) {
  return (
    <svg {...base} width={size} height={size} {...props}>
      <path d="M9 4H5a1 1 0 0 0-1 1v4M15 4h4a1 1 0 0 1 1 1v4M9 20H5a1 1 0 0 1-1-1v-4M15 20h4a1 1 0 0 0 1-1v-4" />
    </svg>
  );
}

export function IconCollapse({ size = 17, ...props }) {
  return (
    <svg {...base} width={size} height={size} {...props}>
      <path d="M4 9h4a1 1 0 0 0 1-1V4M20 9h-4a1 1 0 0 1-1-1V4M4 15h4a1 1 0 0 1 1 1v4M20 15h-4a1 1 0 0 0-1 1v4" />
    </svg>
  );
}
