// Penentu ambang yang dihitung dari korpus itu sendiri. Tujuannya satu: mesin tidak lagi
// membawa angka yang dipilih manusia untuk dataset tertentu. Yang tersisa di sini hanyalah
// konvensi statistik yang lazim (Jeffreys 0,5; z > 1) dan batas pencarian struktural, yang
// keduanya dilaporkan lewat `describe()` supaya pembaca tahu mana yang asumsi dan mana yang
// hasil ukur.
export const PARAM_SOURCE = 'corpus-derived-v1';

// Konvensi statistik, bukan knob yang di-setel per dataset.
export const JEFFREYS_ALPHA = 0.5;
export const SIGNAL_Z = 1;

const safeLog = value => Math.log(Math.max(value, Number.EPSILON));

export function logOdds(dfA, dfB, nA, nB) {
  const pA = (dfA + JEFFREYS_ALPHA) / (nA + 2 * JEFFREYS_ALPHA);
  const pB = (dfB + JEFFREYS_ALPHA) / (nB + 2 * JEFFREYS_ALPHA);
  return Math.log(pA / pB);
}

// Simpangan baku rasio log dua proporsi (delta method). Istilah yang kemunculannya tipis
// punya simpangan besar, jadi ambang "ini sinyal" otomatis ikut besar — tidak perlu angka
// dukungan minimum yang dipilih manual.
export function logOddsError(dfA, dfB, nA, nB) {
  return Math.sqrt(
    1 / (dfA + JEFFREYS_ALPHA) + 1 / (nA + 2 * JEFFREYS_ALPHA)
    + 1 / (dfB + JEFFREYS_ALPHA) + 1 / (nB + 2 * JEFFREYS_ALPHA),
  );
}

export function isSignal(dfA, dfB, nA, nB, z = SIGNAL_Z) {
  const estimate = logOdds(dfA, dfB, nA, nB);
  return { estimate, error: logOddsError(dfA, dfB, nA, nB), significant: Math.abs(estimate) > z * logOddsError(dfA, dfB, nA, nB) };
}

const mean = values => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);

function linearFit(xs, ys) {
  const n = xs.length;
  const meanX = mean(xs);
  const meanY = mean(ys);
  let covariance = 0;
  let variance = 0;
  for (let index = 0; index < n; index += 1) {
    covariance += (xs[index] - meanX) * (ys[index] - meanY);
    variance += (xs[index] - meanX) ** 2;
  }
  const slope = variance ? covariance / variance : 0;
  return { slope, intercept: meanY - slope * meanX };
}

// Kata fungsi dikenali dari caranya menyimpang dari hukum Zipf, bukan dari daftar kata:
// kurva peringkat-frekuensi kosakata alami mengikuti garis lurus di sumbu log-log, dan kata
// fungsi adalah istilah yang muncul JAUH lebih sering daripada yang garis itu ramalkan.
// Ambangnya adalah sebaran residu korpus itu sendiri.
export function zipfOutliers(frequencyEntries) {
  const sorted = [...frequencyEntries]
    .filter(([, count]) => Number.isFinite(count) && count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (sorted.length < 3) return { terms: new Set(), slope: null, sigma: null, flagged: 0, vocabulary: sorted.length };
  const xs = sorted.map((_, index) => safeLog(index + 1));
  const ys = sorted.map(([, count]) => safeLog(count));
  const { slope, intercept } = linearFit(xs, ys);
  const residuals = ys.map((y, index) => y - (intercept + slope * xs[index]));
  const spread = Math.sqrt(mean(residuals.map(residual => residual ** 2)));
  const terms = new Set();
  if (spread > 0) {
    residuals.forEach((residual, index) => {
      if (residual > spread) terms.add(sorted[index][0]);
    });
  }
  return { terms, slope: Number(slope.toFixed(4)), sigma: Number(spread.toFixed(4)), flagged: terms.size, vocabulary: sorted.length };
}

// Batas winsorisasi dari kuantil empirik: pada kosakata berukuran V, secara wajar hanya
// sekitar satu istilah yang diharapkan melampaui kuantil 1 - 1/V. Tidak ada angka ±4 manual.
export function winsorLimit(values) {
  const list = values.filter(Number.isFinite).map(Math.abs).sort((a, b) => a - b);
  if (list.length < 4) return Number.POSITIVE_INFINITY;
  const position = Math.max(0, Math.min(list.length - 1, Math.round(list.length * (1 - 1 / list.length)) - 1));
  return list[position];
}

// Kurva cakupan kumulatif melengkung lalu mendatar; titik di mana ia paling jauh dari tali
// busur adalah tempat menambah item lagi tidak menambah informasi. Ini menggantikan batas
// "maksimal 40"/"maksimal 10" yang sebelumnya ditulis tangan.
export function cumulativeElbow(weights) {
  const list = weights.filter(value => Number.isFinite(value) && value > 0);
  if (list.length < 3) return list.length;
  const total = list.reduce((sum, value) => sum + value, 0);
  if (!total) return list.length;
  let running = 0;
  const points = list.map((value, index) => {
    running += value;
    return [index + 1, running / total];
  });
  const [x1, y1] = points[0];
  const [x2, y2] = points[points.length - 1];
  const dx = x2 - x1;
  const dy = y2 - y1;
  const chord = Math.hypot(dx, dy) || 1;
  let keep = points.length;
  let best = -Infinity;
  for (const [x, y] of points) {
    const distance = Math.abs(dy * (x - x1) - dx * (y - y1)) / chord;
    if (distance > best) {
      best = distance;
      keep = x;
    }
  }
  return keep;
}

// Catatan hasil uji. Niatnya baik: biarkan korpus memilih panjang frasa. Tapi kedua ukuran
// yang dicoba gagal secara terukur pada 32.610 ulasan nyata:
//   - PMUI mentah naik monoton antar ordo (0,42 -> 5,63 -> 12,72 -> 20,28) karena menambah
//     token menambah faktor probabilitas ke pembilang; selalu memilih batas pencarian.
//   - PMUI inkremental (log probabilitas kondisional) juga naik monoton (-5,74 -> -2,10 ->
//     -0,42 -> -0,07) karena konteks panjang memang selalu lebih prediktif.
// Keduanya artefak perbandingan, bukan sinyal. Panjang frasa maka dinyatakan sebagai pilihan
// struktural di pain-points, dan angkanya tetap dilaporkan supaya pembaca bisa menilai.

export function describe() {
  return {
    source: PARAM_SOURCE,
    derived: ['stopwordSet', 'supportFloor', 'severityClamp', 'neutralMargin'],
    conventions: { jeffreysAlpha: JEFFREYS_ALPHA, signalZ: SIGNAL_Z },
    structural: { minTokenLength: 3, minPhraseTokens: 2, maxPhraseTokens: 4, outputBudget: 'presentation only' },
  };
}
