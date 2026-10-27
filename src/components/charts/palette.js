// Semua nilai adalah variabel CSS, bukan hex: SVG membaca `fill="rgb(var(--pos))"` sama baiknya
// dengan kelas Tailwind, jadi satu penanda tema mengubah tabel, bilah, dan donat sekaligus.
// Angka tiap tema hidup di satu tempat — src/index.css.
export const SERIES_COLORS = {
  positive: 'rgb(var(--pos))',
  neutral: 'rgb(var(--neu))',
  negative: 'rgb(var(--neg))',
  unclassified: 'rgb(var(--unk))',
  line: 'rgb(var(--slate-800))',
  lineSoft: 'rgb(var(--slate-800) / 0.55)',
  hoverBand: 'rgb(var(--hover-band) / var(--hover-band-opacity))',
};

// Warna kanal hanyalah pengelompok, bukan meaning: yang membawa arti tetap tiga warna sentimen di
// atas. Versi sebelumnya menyalakan seluruh kanal pada saturasi 86-96%, sehingga tabrakannya nyata
// dan terukur: news persis sama dengan accent (#22D3EE), play vs accent Δhue 10, youtube vs
// negative Δ9 pada lightness yang sama, tiktok vs positive Δ10, reddit vs neutral Δ16. Sekarang
// kromanya 14-58 dengan lightness bertangga, hue dijauhkan dari pita sentimen (158/43/351) dan dari
// accent, dan setiap warna masih ≥ 4,5:1 di atas kartu karena ia juga dipakai sebagai teks angka.
// Identitas kanal tidak pernah bergantung pada warna sendirian: setiap baris membawa ikon dan label.
export const STORE_COLORS = {
  play: 'rgb(var(--play))',
  appstore: 'rgb(var(--appstore))',
  youtube: 'rgb(var(--youtube))',
  reddit: 'rgb(var(--reddit))',
  news: 'rgb(var(--news))',
  facebook: 'rgb(var(--facebook))',
  instagram: 'rgb(var(--instagram))',
  tiktok: 'rgb(var(--tiktok))',
  x: 'rgb(var(--x))',
  default: 'rgb(var(--channel-default))',
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
