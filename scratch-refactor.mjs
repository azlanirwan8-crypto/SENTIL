// Scratch: menghapus blok fungsi besar di app.js berdasarkan batas yang diverifikasi,
// lalu menulis ulang overview(). Dijalankan sekali, hasil dicetak untuk diperiksa.
import { readFile, writeFile } from 'node:fs/promises';

const path = new URL('./app.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
let source = await readFile(path, 'utf8');

function cut(startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  if (start === -1) { console.log(`MISS ${label}: start`); return; }
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end === -1) { console.log(`MISS ${label}: end`); return; }
  const removed = source.slice(start, end);
  source = source.slice(0, start) + source.slice(end);
  console.log(`CUT ${label}: ${removed.split('\n').length} baris | awal="${removed.slice(0, 46).replace(/\n/g, ' ')}" akhir="${removed.slice(-46).replace(/\n/g, ' ')}"`);
}

cut('function trendChart(data) {', 'const complaintName = group =>', 'trendChart+composition');
cut('function executiveSummary(data) {', 'function clusterCard(data) {', 'executiveSummary');
cut('function clusterCard(data) {', 'const gaugePoint =', 'clusterCard');
cut('function shareOfVoice() {', '// Laporan insiden ditulis ke wadah', 'shareOfVoice');
cut('function sentimentLine(bins) {', 'function mixRows(data,pick,names) {', 'sentimentLine');

const overviewStart = source.indexOf('function overview(data) {');
const overviewEnd = source.indexOf('\n}\n', overviewStart) + 3;
const newOverview = `function overview(data) {
  return \`\${summaryHeader(data)}\${anomalyBanner(data)}\${chartOne(data)}<section class="grid-lower">\${chartTwo(data)}\${chartThree(data)}</section><section class="grid-lower">\${chartFour(data)}\${nssGauge(data)}</section><section class="grid-complaint">\${complaintChart()}\${projectionCard(data)}</section>\${sampleRating(data)}<section class="grid-lower">\${featureCard(data)}\${priorities(data)}</section>\${incidentCard(data)}\${reviewTable(data)}\`;
}
`;
console.log(`OVERVIEW lama ${source.slice(overviewStart, overviewEnd).split('\n').length} baris -> baru ${newOverview.split('\n').length} baris`);
source = source.slice(0, overviewStart) + newOverview + source.slice(overviewEnd);

await writeFile(path, source);
console.log('selesai');
