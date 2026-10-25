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

export function linePath(points) {
  if (!points.length) return '';
  return points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
}

export function formatTick(value) {
  if (Math.abs(value) >= 1000) return `${Math.round(value / 100) / 10}k`;
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}
