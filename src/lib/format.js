const numberFormatter = new Intl.NumberFormat('en-GB');
const decimalFormatter = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const LOCALE = 'en-GB';

// Number(null) dan Number('') adalah 0. Tanpa penjaga ini, kolom yang kosong di sumber
// akan tampil sebagai angka nol — padahal yang benar adalah tidak ada angka sama sekali.
export function toNumber(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return Number.NaN;
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
}

export function isNumber(value) {
  return Number.isFinite(toNumber(value));
}

export function formatNumber(value) {
  const numeric = toNumber(value);
  return Number.isNaN(numeric) ? 'N/A' : numberFormatter.format(numeric);
}

export function formatDecimal(value, digits = 1) {
  const numeric = toNumber(value);
  if (Number.isNaN(numeric)) return 'N/A';
  if (digits === 1) return decimalFormatter.format(numeric);
  return new Intl.NumberFormat(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(numeric);
}

export function formatPercent(part, whole, digits = 1) {
  const numerator = toNumber(part);
  const denominator = toNumber(whole);
  if (Number.isNaN(numerator) || Number.isNaN(denominator) || denominator === 0) return 'N/A';
  return `${formatDecimal((numerator / denominator) * 100, digits)}%`;
}

export function formatSigned(value, digits = 1) {
  const numeric = toNumber(value);
  if (Number.isNaN(numeric)) return 'N/A';
  const absolute = formatDecimal(Math.abs(numeric), digits);
  return `${numeric > 0 ? '+' : numeric < 0 ? '−' : ''}${absolute}`;
}

export function formatNss(value) {
  return formatSigned(value, 1);
}

export function formatWeight(value) {
  const numeric = toNumber(value);
  if (Number.isNaN(numeric)) return 'N/A';
  return `${numeric > 0 ? '+' : numeric < 0 ? '−' : ''}${formatDecimal(Math.abs(numeric), 2)}`;
}

function safeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value, options = {}) {
  const date = safeDate(value);
  if (!date) return 'N/A';
  return new Intl.DateTimeFormat(LOCALE, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...options,
  }).format(date);
}

export function formatDateTime(value) {
  const date = safeDate(value);
  if (!date) return 'N/A';
  return new Intl.DateTimeFormat(LOCALE, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatTime(value) {
  const date = safeDate(value);
  if (!date) return 'N/A';
  return new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' }).format(date);
}

export function formatDay(dateString, { long = false } = {}) {
  if (typeof dateString !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return 'N/A';
  const date = new Date(`${dateString}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return new Intl.DateTimeFormat(LOCALE, {
    day: '2-digit',
    month: long ? 'long' : 'short',
    year: long ? 'numeric' : undefined,
    timeZone: 'UTC',
  }).format(date);
}

export function relativeTime(value, now = Date.now()) {
  const date = safeDate(value);
  if (!date) return 'N/A';
  const delta = Math.round((date.getTime() - now) / 1000);
  if (Math.abs(delta) < 60) return delta <= 0 ? 'just now' : 'less than a minute from now';
  const formatter = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
  const ranges = [
    ['year', 60 * 60 * 24 * 365],
    ['month', 60 * 60 * 24 * 30],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
  ];
  for (const [unit, seconds] of ranges) {
    if (Math.abs(delta) >= seconds || unit === 'minute') {
      return formatter.format(Math.round(delta / seconds), unit);
    }
  }
  return 'just now';
}

const PLATFORM_NAMES = {
  play: 'Google Play',
  appstore: 'App Store',
  youtube: 'YouTube',
  reddit: 'Reddit',
  news: 'News & blogs',
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  x: 'X / Twitter',
};

export function platformLabel(value) {
  return PLATFORM_NAMES[value] || (value ? String(value) : 'N/A');
}

export const SENTIMENT_LABELS = {
  positive: 'Positive',
  neutral: 'Neutral',
  negative: 'Negative',
  unclassified: 'Unclassified',
};

export function sentimentLabel(value) {
  return SENTIMENT_LABELS[value] || 'Unclassified';
}

export function channelStatusLabel(status) {
  if (status === 'success') return 'Complete';
  if (status === 'partial') return 'Partial';
  if (status === 'empty') return 'Empty';
  if (status === 'error') return 'Failed';
  if (status === 'needs_setup') return 'Needs credentials';
  return 'N/A';
}

export function sanitizeFilename(value) {
  const base = String(value || 'analysis')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
  return base || 'analysis';
}
