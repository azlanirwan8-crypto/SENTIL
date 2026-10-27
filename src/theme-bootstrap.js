// Dijalankan sebelum stylesheet sempat menggambar: membaca preferensi lalu menempelkannya di
// <html>. Ia berdiri sendiri (bukan bagian dari src/lib/theme.js) karena CSP aplikasi ini
// `script-src 'self'` tanpa 'unsafe-inline' — skrip inline akan diblokir, dan tema yang baru
// terpasang setelah penerjun pertama berarti satu kedip gelap di layar orang yang memilih terang.
// Kunci dan nilainya harus sama dengan src/lib/theme.js; tests/theme.test.mjs yang menjaganya.
const KEY = 'sentil.theme';

try {
  const stored = window.localStorage.getItem(KEY);
  const light = stored === 'light' || (!stored && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
  const root = document.documentElement;
  root.dataset.theme = light ? 'light' : 'dark';
  root.style.colorScheme = light ? 'light' : 'dark';
} catch {
  document.documentElement.dataset.theme = 'dark';
}
