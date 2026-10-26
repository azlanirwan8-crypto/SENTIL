// Deteksi bahasa per ulasan. Mesin ini tidak memakai model dan tidak memakai daftar kata
// kaku sebagai penentu hasil: yang dihitung adalah profil kata tugas, yaitu kata yang hanya
// ada di satu bahasa. Ulasan Indonesia informal ("gak", "udah", "tdk") dan Inggris formal
// ("the app keeps crashing") keduanya terukur, dan teks yang benar-benar campuran ditandai
// apa adanya, bukan dipaksa masuk satu bahasa.
// Normalisasi dilakukan lokal (tanpa mengimpor dari corpus-engine) karena mesin korpus memanggil
// modul ini — impor dua arah membuat urutan inisialisasi modul bergantung pada bundler.
export const LANGUAGE_VERSION = 'lang-profile-v1';

const clean = value => String(value ?? '')
  .normalize('NFKC')
  .replace(/<[^>]*>/g, ' ')
  .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, ' ');

const MARKERS = {
  id: [
    'yang', 'dan', 'atau', 'tidak', 'tdk', 'gak', 'ga', 'nggak', 'ngga', 'bukan', 'sudah', 'udah', 'udh',
    'belum', 'blum', 'blm', 'saya', 'aku', 'aq', 'sy', 'kami', 'kita', 'punya', 'pake', 'pakai', 'harus',
    'banget', 'bgt', 'aja', 'sih', 'dong', 'kok', 'lho', 'nih', 'itu', 'ini', 'kenapa', 'gimana', 'gmn',
    'karena', 'krn', 'jadi', 'jd', 'kalau', 'kalo', 'buat', 'untuk', 'dengan', 'sangat', 'terlalu',
    'lamanya', 'kayak', 'macam', 'sekali', 'lagi', 'juga', 'saja', 'dari', 'ke', 'di', 'pada', 'sama',
    'makasih', 'terima', 'kasih', 'tolong', 'mohon', 'jelek', 'buruk', 'lama', 'susah', 'gagal', 'parah',
  ],
  // Kata serapan ("update", "app", "download") sengaja tidak masuk daftar: keduanya memakai
  // kata itu, jadi yang dihitung hanya kata yang benar-benar milik satu bahasa.
  en: [
    'the', 'and', 'or', 'but', 'for', 'with', 'without', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'can', 'could', 'should', 'shall', 'may',
    'it', 'its', 'this', 'that', 'these', 'those', 'i', 'im', 'my', 'me', 'we', 'our', 'you', 'your', 'they',
    'them', 'their', 'he', 'she', 'very', 'too', 'so', 'not', 'no', 'yes', 'never', 'always', 'still',
    'please', 'thanks', 'thank', 'worst', 'best', 'terrible', 'awful', 'great', 'excellent', 'good',
    'bad', 'slow', 'crash', 'crashes', 'crashing', 'broken', 'works', 'working', 'because', 'when',
    'what', 'how', 'why', 'after', 'before', 'since', 'every', 'each', 'more', 'most',
  ],
};

const INDEX = {
  id: new Set(MARKERS.id),
  en: new Set(MARKERS.en),
};

const wordsOf = value => clean(value)
  .toLowerCase()
  .split(/[^a-z']+/)
  .filter(word => word.length > 0);

export function detectLanguage(value) {
  const words = wordsOf(value);
  if (!words.length) return { language: 'unknown', id: 0, en: 0, tokens: 0 };
  const seen = new Set(words);
  let id = 0;
  let en = 0;
  for (const word of seen) {
    if (INDEX.id.has(word)) id += 1;
    if (INDEX.en.has(word)) en += 1;
  }
  const top = Math.max(id, en);
  const bottom = Math.min(id, en);
  let language = 'unknown';
  if (top === 0) language = words.length >= 3 ? 'other' : 'unknown';
  else if (bottom > 0 && bottom / top >= 0.5) language = 'mixed';
  else language = id > en ? 'id' : 'en';
  return { language, id, en, tokens: words.length };
}

export function summarizeLanguages(rows) {
  const counts = { id: 0, en: 0, mixed: 0, other: 0, unknown: 0 };
  for (const row of rows) counts[row.language] = (counts[row.language] || 0) + 1;
  const total = rows.length;
  return {
    version: LANGUAGE_VERSION,
    method: 'function-word profile, per ulasan',
    total,
    counts,
    share: Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, total ? Number(((value / total) * 100).toFixed(2)) : null])),
  };
}
