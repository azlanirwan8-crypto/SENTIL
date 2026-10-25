import { useEffect, useRef, useState } from 'react';

export function useMeasure(minWidth = 0) {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const update = value => setWidth(Math.max(minWidth, Math.floor(value)));
    update(element.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') {
      const onResize = () => update(element.getBoundingClientRect().width);
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    }
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) update(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [minWidth]);

  return [ref, width];
}
