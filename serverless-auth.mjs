// Penjaga kedua untuk function Node. Middleware Edge sudah meminta kredensial, tetapi
// bila konfigurasi routing berubah atau middleware dilewati, endpoint yang memicu actor
// Apify berbayar tetap tidak boleh terbuka untuk siapa pun.
import { timingSafeEqual } from 'node:crypto';

const same = (given, expected) => {
  const a = Buffer.from(String(given), 'utf8');
  const b = Buffer.from(String(expected), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
};

export function credentialsRequired() {
  return Boolean((process.env.DASHBOARD_USER || '').trim() && process.env.DASHBOARD_PASSWORD);
}

export function authorized(headers = {}) {
  if (!credentialsRequired()) return false;
  const [scheme, encoded = ''] = String(headers.authorization || '').split(' ');
  if (scheme.toLowerCase() !== 'basic') return false;
  const [user, ...rest] = Buffer.from(encoded, 'base64').toString('utf8').split(':');
  return same(user, process.env.DASHBOARD_USER.trim()) && same(rest.join(':'), process.env.DASHBOARD_PASSWORD);
}
