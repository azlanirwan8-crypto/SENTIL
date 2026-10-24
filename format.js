// Format bersama untuk dasbor dan modul grafik. Dipisah supaya angka tidak diformat dengan
// dua cara berbeda antara tabel dan sumbu grafik.
export const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
export const number = value => new Intl.NumberFormat('id-ID', { maximumFractionDigits:1, minimumFractionDigits:1 }).format(value);
export const decimal = value => new Intl.NumberFormat('id-ID', { maximumFractionDigits:2, minimumFractionDigits:2 }).format(value);
export const integer = value => new Intl.NumberFormat('id-ID').format(value);
export const pct = (part, total) => total ? part / total * 100 : 0;
export const signed = value => `${value > 0 ? '+' : ''}${number(value)}`;
export const colors = { positive:'#0ab39c', negative:'#f06548', neutral:'#878a99', unclassified:'#299cdb' };
export const sentimentKeys = Object.keys(colors);
// Warna severity peta kotak: merah kritis, oranye sedang, biru permintaan fitur.
export const severityColors = { critical:'#f06548', warning:'#f7b84b', info:'#299cdb' };
export const severityNames = { critical:'Kritis', warning:'Sedang', info:'Perlu dipantau' };
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
