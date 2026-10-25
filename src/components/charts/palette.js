export const SERIES_COLORS = {
  positive: '#0E6B5A',
  positiveSoft: '#2B9C83',
  negative: '#B5462F',
  negativeSoft: '#D46A51',
  neutral: '#9C6714',
  unclassified: '#8E9A92',
  ink: '#18211C',
  inkSoft: '#3C4A42',
  line: '#DCD4C1',
  paper: '#FCFAF4',
};

export const STORE_COLORS = {
  play: '#0E6B5A',
  appstore: '#9C6714',
  default: '#3C4A42',
};

export const SENTIMENT_SERIES = [
  { key: 'positive', label: 'Positif', color: SERIES_COLORS.positive },
  { key: 'neutral', label: 'Netral', color: SERIES_COLORS.neutral },
  { key: 'negative', label: 'Negatif', color: SERIES_COLORS.negative },
  { key: 'unclassified', label: 'Tak terklasifikasi', color: SERIES_COLORS.unclassified },
];

export const CLUSTER_COLORS = [
  { fill: '#B5462F', text: '#FCFAF4' },
  { fill: '#0E6B5A', text: '#FCFAF4' },
  { fill: '#7E2D1D', text: '#FCFAF4' },
  { fill: '#9C6714', text: '#FCFAF4' },
  { fill: '#3C4A42', text: '#FCFAF4' },
  { fill: '#D46A51', text: '#18211C' },
  { fill: '#C18A2B', text: '#18211C' },
  { fill: '#2B9C83', text: '#101613' },
];

export function storeColor(id) {
  return STORE_COLORS[id] || STORE_COLORS.default;
}
