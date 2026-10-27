import { useSyncExternalStore } from 'react';

// Tema adalah status modul, sama seperti bahasa: satu nilai yang dibaca seluruh pohon tanpa
// meneruskan prop. Yang disimpan hanyalah pilihan pengunjung — tidak ada data, angka, atau
// teks analisis yang ikut tersimpan, jadi mengganti tema tidak pernah mengubah laporan.
//
// Tanpa pilihan tersimpan, mesin mengikuti preferensi sistem. Sekali pengunjung menekan tombol,
// pilihannya menang sampai ia menghapusnya; preferensi sistem setelah itu hanya diikuti kembali
// lewat tombol "ikuti sistem" — yang sengaja TIDAK ada, karena dua tombol untuk satu sumbu
// membuat status aktif sulit dibaca di layar kecil.
const STORAGE_KEY = 'sentil.theme';
const THEME_COLORS = { dark: '#020617', light: '#F8FAFC' };

const listeners = new Set();

function systemTheme() {
  try {
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function readStoredTheme() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    // Peramban yang memblokir penyimpanan (mode privat, kebijakan situs) tetap bisa berganti
    // tema untuk sesi ini — hanya saja pilihannya tidak bertahan muat ulang.
    return null;
  }
}

function setMeta(name, content) {
  const meta = document.head?.querySelector(`meta[name='${name}']`);
  if (meta) meta.setAttribute('content', content);
}

function apply(theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  setMeta('color-scheme', theme);
  setMeta('theme-color', THEME_COLORS[theme]);
}

let theme = null;

function ensureStarted() {
  if (theme) return theme;
  theme = readStoredTheme() || systemTheme();
  apply(theme);
  try {
    // Pengunjung yang belum memilih ikut berpindah saat sistemnya berpindah; yang sudah
    // memilih tidak direbut kembali.
    window.matchMedia?.('(prefers-color-scheme: light)')?.addEventListener?.('change', event => {
      if (readStoredTheme()) return;
      const next = event.matches ? 'light' : 'dark';
      theme = next;
      apply(next);
      notify();
    });
  } catch {
    // Peramban tanpa addEventListener pada MediaQueryList hanya kehilangan pengikutannya.
  }
  return theme;
}

const notify = () => {
  for (const listener of listeners) listener();
};

export function getTheme() {
  return ensureStarted();
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setTheme(next) {
  // Nilai asing diabaikan: panggilan salah ketik tidak boleh memindahkan tampilan ke tema
  // yang tidak ada.
  if (next !== 'light' && next !== 'dark') return;
  ensureStarted();
  if (next === theme) return;
  theme = next;
  apply(next);
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* pilihan tetap berlaku untuk sesi ini walau tidak tersimpan */
  }
  notify();
}

export function toggleTheme() {
  setTheme(getTheme() === 'light' ? 'dark' : 'light');
}

export function useTheme() {
  return useSyncExternalStore(subscribe, getTheme, () => 'dark');
}
