export function layoutTreemap(entries, width, height, gap = 3) {
  if (!Array.isArray(entries) || !entries.length || width <= 0 || height <= 0) return [];
  const data = entries
    .map(entry => ({ entry, value: Math.max(0, Number(entry.value) || 0) }))
    .filter(item => item.value > 0)
    .sort((a, b) => b.value - a.value);
  if (!data.length) return [];

  const total = data.reduce((sum, item) => sum + item.value, 0);
  const scale = (width * height) / total;
  const rects = [];
  let free = { x: 0, y: 0, w: width, h: height };
  let row = [];
  let index = 0;

  const ratio = (items, sideLength) => {
    if (!items.length || sideLength <= 0) return Infinity;
    const sum = items.reduce((acc, item) => acc + item.area, 0);
    const max = Math.max(...items.map(item => item.area));
    const min = Math.min(...items.map(item => item.area));
    if (!sum || !min) return Infinity;
    return Math.max((sideLength * sideLength * max) / (sum * sum), (sum * sum) / (sideLength * sideLength * min));
  };

  const flush = () => {
    if (!row.length) return;
    const rowArea = row.reduce((sum, item) => sum + item.area, 0);
    if (free.w >= free.h) {
      const rowWidth = free.h > 0 ? rowArea / free.h : 0;
      let y = free.y;
      for (const item of row) {
        const itemHeight = rowWidth > 0 ? item.area / rowWidth : 0;
        rects.push({ entry: item.entry, x: free.x, y, w: rowWidth, h: itemHeight });
        y += itemHeight;
      }
      free = { ...free, x: free.x + rowWidth, w: free.w - rowWidth };
    } else {
      const rowHeight = free.w > 0 ? rowArea / free.w : 0;
      let x = free.x;
      for (const item of row) {
        const itemWidth = rowHeight > 0 ? item.area / rowHeight : 0;
        rects.push({ entry: item.entry, x, y: free.y, w: itemWidth, h: rowHeight });
        x += itemWidth;
      }
      free = { ...free, y: free.y + rowHeight, h: free.h - rowHeight };
    }
    row = [];
  };

  while (index < data.length) {
    const item = data[index];
    const candidate = { entry: item.entry, area: item.value * scale };
    const sideLength = Math.min(free.w, free.h);
    if (!row.length || ratio([...row, candidate], sideLength) <= ratio(row, sideLength)) {
      row.push(candidate);
      index += 1;
    } else {
      flush();
    }
  }
  flush();

  return rects.map(rect => ({
    entry: rect.entry,
    x: rect.x + gap / 2,
    y: rect.y + gap / 2,
    w: Math.max(0, rect.w - gap),
    h: Math.max(0, rect.h - gap),
  }));
}
