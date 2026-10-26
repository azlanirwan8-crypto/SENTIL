export function niceScale(maxValue, desired = 4) {
  if (!Number.isFinite(maxValue) || maxValue <= 0) {
    return { max: 1, step: 1, ticks: [0, 1] };
  }
  const rough = maxValue / desired;
  const power = 10 ** Math.floor(Math.log10(rough));
  const fraction = rough / power;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  let step = niceFraction * power;
  if (step < 1) step = 1;
  const max = Math.ceil(maxValue / step) * step;
  const ticks = [];
  for (let value = 0; value <= max + step / 1000; value += step) {
    ticks.push(Number(value.toFixed(4)));
  }
  return { max, step, ticks };
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function formatTick(value) {
  if (Math.abs(value) >= 1000) return `${Math.round(value / 100) / 10}k`;
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

// Tooltip dijepit ke jendela scroll yang sedang terlihat, bukan ke lebar konten: chart yang
// lebih lebar dari kartunya bisa digulir, dan anchor di koordinat konten akan keluar dari
// kartu. `viewStart` harus offset scroll saat render, bukan dari event yang masih tertunda.
export function tooltipAnchor({
  x,
  y,
  width,
  height,
  boxWidth = 0,
  boxHeight = 0,
  viewStart = 0,
  viewWidth = 0,
  pad = 8,
}) {
  const half = Math.max(boxWidth / 2, 70);
  const viewSpan = viewWidth || width;
  const minLeft = Math.max(half + pad, viewStart + half + pad);
  const maxLeft = Math.min(width - half - pad, Math.max(minLeft, viewStart + viewSpan - half - pad));
  const left = clamp(x, minLeft, Math.max(minLeft, maxLeft));
  const above = y - pad - boxHeight > 0;
  const top = above ? y - 10 : clamp(y + 14, pad, Math.max(pad, (height || y + 140) - boxHeight - pad));
  return { left, top, above };
}
