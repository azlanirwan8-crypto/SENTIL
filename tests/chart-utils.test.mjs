import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { niceScale, tooltipAnchor } from '../src/components/charts/chart-utils.js';

describe('tooltipAnchor', () => {
  test('menjepit ke jendela gulir yang terlihat, bukan ke lebar konten', () => {
    // Geometri live: chart 1.800 px digulir sampai ujung, kartu hanya menampilkan 444 px.
    const anchor = tooltipAnchor({ x: 1786, y: 60, width: 1800, height: 216, boxWidth: 136, boxHeight: 138, viewStart: 1356, viewWidth: 444 });
    assert.ok(anchor.left >= 1356 + 76, `kiri ${anchor.left} harus di dalam jendela`);
    assert.ok(anchor.left + 68 <= 1356 + 444, `kanan ${anchor.left + 68} harus di dalam jendela`);
  });

  test('anchor di ujung kiri tidak keluar dari jendela', () => {
    const anchor = tooltipAnchor({ x: 1360, y: 60, width: 1800, height: 216, boxWidth: 136, boxHeight: 138, viewStart: 1356, viewWidth: 444 });
    assert.equal(anchor.left, 1434);
  });

  test('tanpa gulir dijepit ke tepi kartu', () => {
    const far = tooltipAnchor({ x: 3000, y: 60, width: 1800, height: 216, boxWidth: 136, boxHeight: 138, viewStart: 0, viewWidth: 1800 });
    assert.equal(far.left, 1722);
    const near = tooltipAnchor({ x: 0, y: 60, width: 1800, height: 216, boxWidth: 136, boxHeight: 138, viewStart: 0, viewWidth: 1800 });
    assert.equal(near.left, 78);
  });

  test('jendela lebih sempit dari tooltip tidak membalik batas', () => {
    const anchor = tooltipAnchor({ x: 900, y: 60, width: 1800, height: 216, boxWidth: 220, boxHeight: 120, viewStart: 600, viewWidth: 120 });
    assert.equal(anchor.left, 718);
  });

  test('naik ke atas selama masih muat, kalau tidak dijepit di bawah', () => {
    const high = tooltipAnchor({ x: 400, y: 120, width: 1800, height: 216, boxWidth: 136, boxHeight: 100 });
    assert.equal(high.above, true);
    assert.equal(high.top, 110);
    const low = tooltipAnchor({ x: 400, y: 140, width: 1800, height: 216, boxWidth: 136, boxHeight: 138 });
    assert.equal(low.above, false);
    assert.ok(low.top + 138 <= 216, `bawah ${low.top + 138} harus di dalam chart`);
  });

  test('tinggi kotak belum terukur tetap mengembalikan angka hingga', () => {
    const anchor = tooltipAnchor({ x: 400, y: 200, width: 1800, height: 0 });
    assert.ok(Number.isFinite(anchor.left) && Number.isFinite(anchor.top));
  });
});

describe('niceScale', () => {
  test('nilai nol atau tidak hingga tetap menghasilkan tick', () => {
    assert.deepEqual(niceScale(0), { max: 1, step: 1, ticks: [0, 1] });
    assert.deepEqual(niceScale(Number.NaN), { max: 1, step: 1, ticks: [0, 1] });
  });

  test('tick selalu mencakup nilai maksimum', () => {
    const scale = niceScale(29100, 4);
    assert.ok(scale.max >= 29100);
    assert.equal(scale.ticks[0], 0);
    assert.equal(scale.ticks.at(-1), scale.max);
  });
});
