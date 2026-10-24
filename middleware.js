// Gerbang masuk saat dasbor dijalankan sebagai situs publik (Vercel).
// Tombol Tarik Analisis memicu actor Apify berbayar pada akun pemilik, jadi tanpa
// DASHBOARD_USER dan DASHBOARD_PASSWORD pada environment deployment, penarikan data
// diblokir dan seluruh halaman lain meminta kredensial Basic melalui browser.
const ANALYZE = '/api/analyze';
const HEALTH = '/api/status';

// Perbandingan dilakukan atas hasil hash SHA-256, bukan string sandi, agar bentuk
// sandi tidak ikut terbaca lewat waktu respons.
async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function credentialsOk(header, user, password) {
  const [scheme, encoded = ''] = String(header || '').split(' ');
  if (scheme.toLowerCase() !== 'basic') return false;
  const [givenUser, ...rest] = Buffer.from(encoded, 'base64').toString('utf8').split(':');
  const given = [await digest(givenUser), await digest(rest.join(':'))];
  return given[0] === (await digest(user)) && given[1] === (await digest(password));
}

function unauthorized(message) {
  return new Response(message, {
    status: 401,
    headers: {
      'www-authenticate': 'Basic realm="wondr merchant", charset="UTF-8"',
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

export async function middleware(request) {
  const path = new URL(request.url).pathname;
  const user = (process.env.DASHBOARD_USER || '').trim();
  const password = process.env.DASHBOARD_PASSWORD || '';
  if (!user || !password) {
    // Situs diizinkan tanpa akun, tetapi penarikan data harus dimatikan agar tidak
    // ada pihak luar yang memakai kuota Apify pemilik.
    if (path === ANALYZE) return unauthorized('Penarikan data diblokir: isi DASHBOARD_USER dan DASHBOARD_PASSWORD pada environment deployment.');
    return;
  }
  if (path === HEALTH) return;
  if (await credentialsOk(request.headers.get('authorization'), user, password)) return;
  return unauthorized('Kredensial diperlukan.');
}

export const config = { matcher: '/:path*' };
