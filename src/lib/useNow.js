import { useEffect, useState } from 'react';

// Jam yang berdenyut. relativeTime() menghitung dari `now` yang diberikan, jadi tanpa denyut
// label "5 minutes ago" membeku sampai ada render lain yang kebetulan lewat — dan pada dasbor
// yang tidak berubah, tidak ada. Denyut 30 detik cukup untuk label relatif; tidak ada
// animasi yang bergantung padanya.
export function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
