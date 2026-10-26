export const SERIES_COLORS = {
  positive: '#34D399',
  neutral: '#FBBF24',
  negative: '#FB7185',
  unclassified: '#64748B',
  text: '#94A3B8',
  faint: '#64748B',
  bright: '#E2E8F0',
  line: '#1E293B',
  lineSoft: '#172032',
  surface: '#0F172A',
  canvas: '#020617',
};

export const STORE_COLORS = {
  play: '#38BDF8',
  appstore: '#A78BFA',
  youtube: '#F87171',
  reddit: '#FB923C',
  news: '#22D3EE',
  facebook: '#818CF8',
  instagram: '#F472B6',
  tiktok: '#2DD4BF',
  x: '#CBD5E1',
  default: '#94A3B8',
};

export const SENTIMENT_SERIES = [
  { key: 'positive', label: 'Positive', color: SERIES_COLORS.positive },
  { key: 'neutral', label: 'Neutral', color: SERIES_COLORS.neutral },
  { key: 'negative', label: 'Negative', color: SERIES_COLORS.negative },
  { key: 'unclassified', label: 'Unclassified', color: SERIES_COLORS.unclassified },
];

export function storeColor(id) {
  return STORE_COLORS[id] || STORE_COLORS.default;
}
