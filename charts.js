// Modul grafik dasbor. Fungsi-fungsinya murni: menerima angka hasil perhitungan dari model.js
// dan mengembalikan markup SVG/DOM. Tidak ada angka yang dihitung di sini, jadi setiap nilai
// tetap dapat ditelusuri ke baris data yang sama dengan tabel ulasan.
import { esc, number, integer, pct, signed, colors, sentimentKeys, severityColors, severityNames, clamp } from './format.js';
import { sentimentNames } from './model.js';
export { severityColors };
const axisLabel = (x, y, text, anchor = 'middle') => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" font-size="10" fill="#878a99">${esc(text)}</text>`;

// Grafik 1 — volume harian bertumpuk + garis NSS + penanda lonjakan.
export function comboChart({ days, badges = [], caption = '' }) {
  if (!days.length) return `<div class="chart-empty" role="img" aria-label="Belum ada ulasan bertanggal">${esc(caption || 'Belum ada ulasan bertanggal untuk digambar.')}</div>`;
  const width = 900, height = 280, left = 40, right = 44, top = 18, bottom = 40;
  const plotW = width - left - right, plotH = height - top - bottom;
  const maxVolume = Math.max(1, ...days.map(day => day.total));
  const step = plotW / days.length;
  const barWidth = Math.max(2, Math.min(20, step * 0.6));
  const yVolume = value => top + plotH - (value / maxVolume) * plotH;
  const yNss = value => top + plotH - (value + 100) / 200 * plotH;
  const badgeDates = new Set(badges.map(badge => badge.date));
  const volumeGrid = [0, 0.25, 0.5, 0.75, 1].map(fraction => {
    const value = Math.round(maxVolume * fraction), y = yVolume(value);
    return `<line x1="${left}" y1="${y}" x2="${width-right}" y2="${y}" stroke="${value === 0 ? '#c7ccd8' : '#eef1f5'}" stroke-width="1"/>${axisLabel(left-6, y+3, integer(value), 'end')}`;
  }).join('');
  const nssGrid = [-100, 0, 100].map(value => axisLabel(width-right+8, yNss(value)+3, value, 'start')).join('');
  const bars = days.map((day, index) => {
    const x = left + step * index + (step - barWidth) / 2;
    let cursor = top + plotH;
    const segments = sentimentKeys.filter(key => day[key] > 0).map(key => {
      const height = day[key] / maxVolume * plotH;
      cursor -= height;
      return `<rect class="combo-bar ${key}" x="${x.toFixed(1)}" y="${cursor.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${height.toFixed(1)}" fill="${colors[key]}"><title>${esc(`${day.date} · ${sentimentNames[key]}: ${day[key]}`)}</title></rect>`;
    }).join('');
    const flagged = badgeDates.has(day.date);
    return `<g data-combo-day="${esc(day.date)}">${segments}${flagged ? `<rect class="combo-spike-frame" x="${(x-1.5).toFixed(1)}" y="${(yVolume(day.total)-1.5).toFixed(1)}" width="${(barWidth+3).toFixed(1)}" height="${(top+plotH-yVolume(day.total)+3).toFixed(1)}"/>` : ''}</g>`;
  }).join('');
  const points = days.map((day, index) => ({ x: left + step * index + step / 2, day })).filter(point => point.day.nss !== null);
  const line = points.length > 1 ? `<path class="combo-line" d="${points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)} ${yNss(point.day.nss).toFixed(1)}`).join(' ')}" fill="none" stroke="#299cdb" stroke-width="2.2"/>` : '';
  const dots = points.map(point => `<circle class="combo-dot${badgeDates.has(point.day.date) ? ' is-spike' : ''}" cx="${point.x.toFixed(1)}" cy="${yNss(point.day.nss).toFixed(1)}" r="${badgeDates.has(point.day.date) ? 4.5 : 2.8}" fill="#299cdb"><title>${esc(`${point.day.date} · NSS ${signed(point.day.nss)} · negatif ${point.day.negative} dari ${point.day.total} ulasan`)}</title></circle>`).join('');
  const every = Math.max(1, Math.ceil(days.length / 8));
  const labels = days.map((day, index) => index % every === 0 ? axisLabel(left + step * index + step / 2, height - 14, day.date.slice(5)) : '').join('');
  const legend = `<div class="legend"><span class="legend-item"><span class="legend-swatch positive"></span>${esc(sentimentNames.positive)}</span><span class="legend-item"><span class="legend-swatch negative"></span>${esc(sentimentNames.negative)}</span><span class="legend-item"><span class="legend-swatch neutral"></span>${esc(sentimentNames.neutral)}</span><span class="legend-item"><span class="legend-swatch nss"></span>Garis NSS (kanan)</span><span class="legend-item"><span class="legend-swatch spike"></span>Penanda lonjakan</span></div>`;
  const badgeList = badges.length ? `<ul class="combo-badges">${badges.slice(0, 3).map(badge => `<li><button class="btn-text" data-complaint-spike="${esc(badge.date)}">${esc(`${badge.date.slice(8)}/${badge.date.slice(5,7)}/${badge.date.slice(0,4)}`)}</button> <span>${esc(badge.label)}</span></li>`).join('')}</ul>` : '';
  return `<div class="chart-scroll" tabindex="0" role="img" aria-label="${esc(`Volume ulasan harian bertumpuk dengan garis skor sentimen neto; ${days.length} hari diperiksa dan ${badges.length} hari ditandai lonjakan.`)}"><svg class="combo-svg" viewBox="0 0 ${width} ${height}">${volumeGrid}${nssGrid}${bars}${line}${dots}${labels}</svg></div>${legend}${badgeList}`;
}

const ringArc = (radius, from, to) => {
  const point = angle => [160 + radius * Math.cos(angle), 160 + radius * Math.sin(angle)];
  const [x1, y1] = point(from), [x2, y2] = point(to);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${radius} ${radius} 0 ${to - from > Math.PI ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
};

// Grafik 2 — donut berjenjang: cincin dalam aspek, cincin luar pemecahan per kanal.
export function nestedDonut({ inner, outer, total }) {
  if (!inner.length) return '<div class="chart-empty" role="img" aria-label="Belum ada aspek yang terbaca">Belum ada aspek yang terbaca pada filter ini.</div>';
  const palette = ['#299cdb', '#0ab39c', '#f06548', '#7c3aed', '#f7b84b', '#0891b2', '#db2777', '#65a30d'];
  const innerColor = new Map(inner.map((slice, index) => [slice.id, palette[index % palette.length]]));
  let angle = -Math.PI / 2;
  const innerArcs = inner.map(slice => {
    const span = slice.value / total * Math.PI * 2, from = angle; angle += span;
    return `<path d="${ringArc(78, from, Math.max(from + 0.001, angle - 0.012))}" stroke="${innerColor.get(slice.id)}" stroke-width="26" fill="none"><title>${esc(`${slice.name}: ${slice.value} ulasan`)}</title></path>`;
  }).join('');
  let outerAngle = -Math.PI / 2;
  const outerArcs = outer.map(slice => {
    const span = slice.value / total * Math.PI * 2, from = outerAngle; outerAngle += span;
    return `<path d="${ringArc(108, from, Math.max(from + 0.001, outerAngle - 0.012))}" stroke="${slice.color || innerColor.get(slice.aspect)}" stroke-opacity=".85" stroke-width="22" fill="none"><title>${esc(`${slice.aspectName} · ${slice.name}: ${slice.value} ulasan`)}</title></path>`;
  }).join('');
  const list = inner.map((slice, index) => `<div class="distribution-item donut-item"><span class="legend-item"><span class="donut-swatch" style="background:${innerColor.get(slice.id)}"></span>${esc(slice.name)}</span><strong>${integer(slice.value)}<small>${number(pct(slice.value, total))}%</small></strong></div>`).join('');
  return `<div class="donut-grid"><div class="donut-wrap"><svg viewBox="0 0 320 320" role="img" aria-label="${esc(`Donut berjenjang: ${inner.length} aspek pada cincin dalam dan ${outer.length} potongan kanal pada cincin luar.`)}">${innerArcs}${outerArcs}<text x="160" y="154" text-anchor="middle" font-size="26" font-weight="600" fill="#2f3842">${integer(total)}</text><text x="160" y="174" text-anchor="middle" font-size="11" fill="#878a99">keanggotaan aspek</text></svg></div><div class="distribution-list donut-list">${list}</div></div>`;
}

// Grafik 3 — peta kotak klaster keluhan.
export function painTreemap({ nodes, width = 1000, height = 420 }) {
  if (!nodes.length) return '<div class="chart-empty" role="img" aria-label="Belum ada klaster keluhan">Belum ada klaster keluhan yang cocok pada filter ini.</div>';
  // Kotak kecil hanya memuat nama; jumlah dan kategori tetap terbaca lewat aria-label, jadi
  // tidak ada angka yang hilang — hanya tidak digambar dua kali pada ruang yang sempit.
  const cells = nodes.map(node => {
    const showValue = node.width >= 12 && node.height >= 16;
    const showSeverity = node.width >= 18 && node.height >= 26;
    return `<button class="treemap-cell severity-${node.severity}" data-cluster="${esc(node.id)}" style="left:${node.x}%;top:${node.y}%;width:${node.width}%;height:${node.height}%" aria-label="${esc(`${node.name}: ${node.value} ulasan negatif, kategori ${severityNames[node.severity]}. Buka ulasan terkait.`)}"><span class="treemap-name">${esc(node.name)}</span>${showValue ? `<span class="treemap-value">${integer(node.value)} negatif</span>` : ''}${showSeverity ? `<span class="treemap-sev">${esc(severityNames[node.severity])}</span>` : ''}</button>`;
  }).join('');
  const legend = Object.entries(severityNames).map(([id, label]) => `<span class="legend-item"><span class="legend-swatch severity-${id}"></span>${esc(label)}</span>`).join('');
  return `<div class="treemap-plot" style="--treemap-ar:${width} / ${height}">${cells}</div><div class="legend">${legend}</div>`;
}

// Grafik 4 — matriks antar platform: NSS dan persen negatif berdampingan.
export function matrixChart({ rows }) {
  if (!rows.length) return '<div class="chart-empty" role="img" aria-label="Belum ada kanal dengan data">Belum ada kanal yang memiliki teks tersimpan pada filter ini.</div>';
  const width = 900, height = 300, left = 40, right = 16, top = 18, bottom = 54;
  const plotW = width - left - right, plotH = height - top - bottom;
  const zero = top + plotH / 2;
  const yNss = value => zero - (value / 100) * (plotH / 2);
  const yRate = value => top + plotH - (value / 100) * plotH;
  const step = plotW / rows.length, barWidth = Math.min(26, step * 0.28);
  const grid = [-100, -50, 0, 50, 100].map(value => `<line x1="${left}" y1="${yNss(value)}" x2="${width-right}" y2="${yNss(value)}" stroke="${value === 0 ? '#c7ccd8' : '#eef1f5'}"/>${axisLabel(left-6, yNss(value)+3, value, 'end')}`).join('');
  const bars = rows.map((row, index) => {
    const center = left + step * index + step / 2;
    const nssX = center - barWidth - 2, rateX = center + 2;
    const nssBar = row.nss === null ? '' : `<rect x="${nssX.toFixed(1)}" y="${Math.min(zero, yNss(row.nss)).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(1, Math.abs(yNss(row.nss) - zero)).toFixed(1)}" fill="${row.nss >= 0 ? colors.positive : colors.negative}"><title>${esc(`${row.name}: NSS ${signed(row.nss)} dari ${row.classified} ulasan berlabel`)}</title></rect>`;
    const rateBar = row.classified ? `<rect class="matrix-rate" x="${rateX.toFixed(1)}" y="${yRate(row.negativePct).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(1, top + plotH - yRate(row.negativePct)).toFixed(1)}" fill="#f7b84b"><title>${esc(`${row.name}: ${row.negative} negatif dari ${row.classified} berlabel (${number(row.negativePct)}%)`)}</title></rect>` : '';
    const label = axisLabel(center, height - 30, row.name);
    const count = axisLabel(center, height - 16, `${integer(row.total)} teks`);
    return `<g>${nssBar}${rateBar}${label}${count}</g>`;
  }).join('');
  return `<div class="chart-scroll" tabindex="0" role="img" aria-label="${esc(`Matriks perbandingan ${rows.length} kanal: skor sentimen neto dan persentase negatif.`)}"><svg class="matrix-svg" viewBox="0 0 ${width} ${height}">${grid}${bars}</svg></div><div class="legend"><span class="legend-item"><span class="legend-swatch positive"></span>NSS (kanan-nol naik, kiri-nol turun)</span><span class="legend-item"><span class="legend-swatch warning"></span>Persen negatif</span></div>`;
}

// Kepala ringkas: dua kalimat ringkasan + tiga kartu angka.
export function statCard({ label, value, unit = '', tone = '', sub = '' }) {
  return `<article class="stat-card${tone ? ` ${tone}` : ''}"><span class="stat-label">${esc(label)}</span><strong class="stat-value">${esc(value)}${unit ? `<small>${esc(unit)}</small>` : ''}</strong>${sub ? `<span class="stat-sub">${esc(sub)}</span>` : ''}</article>`;
}
export const clampPercent = value => clamp(Number.isFinite(value) ? value : 0, 0, 100);
