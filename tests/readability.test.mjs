import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';

// Panel yang dibaca manajer biasa harus tetap terbaca tanpa latar belakang statistik. Metode
// sengaja dikecualikan: panel itu memang dokumentasi mesin, dan istilah teknisnya dijelaskan
// di sana. Yang dijaga di sini: (1) tidak ada jargon di panel lain, (2) satu kalimat tidak
// lebih panjang dari ambang yang masih bisa dibaca sekali pandang.
const METHOD_PANEL = 'ModelView.jsx';
const MAX_WORDS = 30;
const JARGON = [
  'standard error', 'standard deviation', 'log-odds', 'significance', 'significant', 'proportion',
  'corpus', 'union of', 'closure rule', 'in-sample', 'quantile', 'delta method', 'jeffreys',
  'simpangan baku', 'proporsi', 'korpus', 'signifikansi', 'kuantil',
];

const stripCode = text => text.replace(/\$\{[^{}]*\}/g, ' ').replace(/\{\w[^{}]*\}/g, ' ');
const sentences = text => stripCode(text)
  .split(/(?<=[.!?])\s+|[—;]\s+/)
  .map(part => part.replace(/\s+/g, ' ').trim())
  .filter(part => part.split(' ').length > 3);

function uiLiterals(source) {
  const out = [];
  const pattern = /t\(\s*(['"])((?:\\.|(?!\1)[^\\])*)\1\s*\)/g;
  for (const match of source.matchAll(pattern)) out.push(match[2]);
  return out;
}

function engineSentences(source) {
  const out = [];
  const pattern = /(?:title|body):\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
  for (const match of source.matchAll(pattern)) out.push(match[2]);
  return out;
}

const componentDirs = ['src/components', 'src/components/charts'];
const components = componentDirs.flatMap(dir => readdirSync(new URL(`../${dir}`, import.meta.url))
  .filter(name => /\.jsx$/.test(name) && name !== METHOD_PANEL)
  .map(name => `${dir}/${name}`));

const scan = Object.entries({
  ...Object.fromEntries(components.map(file => [file, uiLiterals(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'))])),
  'lib/insights.mjs': engineSentences(readFileSync(new URL('../lib/insights.mjs', import.meta.url), 'utf8')),
});

test('istilah statistik tidak dipakai di panel yang dibaca manajer biasa', () => {
  const offenders = [];
  for (const [file, texts] of scan) {
    for (const text of texts) {
      for (const sentence of sentences(text)) {
        const hit = JARGON.find(word => sentence.toLowerCase().includes(word));
        if (hit) offenders.push(`${file}: "${hit}" dalam ${sentence.slice(0, 90)}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `${offenders.length} kalimat memakai jargon di luar panel Metode:\n${offenders.slice(0, 8).join('\n')}`);
});

test('satu kalimat panel tidak lebih panjang dari yang bisa dibaca sekali pandang', () => {
  const checked = [];
  const offenders = [];
  for (const [file, texts] of scan) {
    for (const text of texts) {
      for (const sentence of sentences(text)) {
        const words = sentence.split(' ').length;
        if (words > 6) checked.push(words);
        if (words > MAX_WORDS) offenders.push(`${file}: ${words} kata — ${sentence.slice(0, 90)}`);
      }
    }
  }
  assert.ok(checked.length > 120, `pemindaian harus menemukan kalimat yang benar-benar dibaca, dapat ${checked.length}`);
  assert.deepEqual(offenders, [], `${offenders.length} kalimat melewati ${MAX_WORDS} kata:\n${offenders.slice(0, 8).join('\n')}`);
});

test('panel Metode justru tempat istilah teknis dijelaskan, tidak didiamkan', () => {
  const method = readFileSync(new URL('../src/components/ModelView.jsx', import.meta.url), 'utf8');
  assert.match(method, /simpangan baku/, 'Metode harus tetap menyebut nama uji yang dipakai mesin');
  assert.match(method, /t\(/, 'Metode dibaca lewat tabel frasa, bukan string lepas');
});
