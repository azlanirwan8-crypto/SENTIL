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

// Warna kanal hanyalah pengelompok, bukan meaning: yang membawa arti tetap tiga warna sentimen di
// atas. Versi sebelumnya menyalakan seluruh kanal pada saturasi 86-96%, sehingga tabrakannya nyata
// dan terukur: news persis sama dengan accent (#22D3EE), play vs accent Δhue 10, youtube vs
// negative Δ9 pada lightness yang sama, tiktok vs positive Δ10, reddit vs neutral Δ16. Sekarang
// kromanya 14-58 dengan lightness bertangga, hue dijauhkan dari pita sentimen (158/43/351) dan dari
// accent, dan setiap warna masih ≥ 4,5:1 di atas kartu karena ia juga dipakai sebagai teks angka.
// Identitas kanal tidak pernah bergantung pada warna sendirian: setiap baris membawa ikon dan label.
export const STORE_COLORS = {
  play: '#72A2CA',
  appstore: '#AA92D3',
  youtube: '#D38373',
  reddit: '#D6A266',
  news: '#70A9A9',
  facebook: '#949CD1',
  instagram: '#D289B7',
  tiktok: '#C18DCE',
  x: '#BFC6CF',
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

// Satu kebijakan tiga keadaan untuk seluruh chart batang: redup saat tidak dipilih, sedikit
// lunak saat diam, penuh hanya untuk yang sedang dibaca. Warna sentimen tetap membawa meaning;
// yang berubah hanyalah seberapa keras ia berteriak.
export const BAR_OPACITY = { dimmed: 0.5, idle: 0.88, active: 1 };
