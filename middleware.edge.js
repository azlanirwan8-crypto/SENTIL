// Gerbang masuk opsional untuk hosting Vercel. Berkas ini tidak aktif selama namanya masih
// middleware.edge.js — Vercel hanya memproses berkas bernama tepat `middleware.js` di akar
// proyek. Ganti namanya bila ingin browser meminta login sebelum halaman terbuka.
// Tanpa berkas ini, penarikan data TIDAK dilindungi kredensial: yang menahan permintaan adalah
// pemeriksaan header peramban di api/analyze.js dan api/project.js, dan itu bukan pengganti login
// (lihat batasnya di README). Nama file ini sengaja tidak diubah selama dasbor dipakai tanpa akun.
// Middleware Vercel berjalan di Edge Runtime: hanya API Web yang boleh dipakai di sini
// (atob, TextDecoder, Response, URL). Buffer, node:crypto, dan fs tidak tersedia dan pernah membuat
// seluruh situs gagal dengan 500 MIDDLEWARE_INVOCATION_FAILED.
const ANALYZE = '/api/analyze';
const HEALTH = '/api/status';

// Perbandingan konstan tanpa API Node: panjang keduanya dibandingkan lebih dulu, lalu
// setiap karakter di-XOR. Tujuannya mencegah kebocoran waktu pada percobaan sandi acak.
function secretsEqual(given, expected) {
  if (typeof given !== 'string' || typeof expected !== 'string') return false;
  if (given.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < given.length; index++) difference |= given.charCodeAt(index) ^ expected.charCodeAt(index);
  return difference === 0;
}

function decodeBasic(header) {
  const [scheme, encoded = ''] = String(header || '').split(' ');
  if (scheme.toLowerCase() !== 'basic' || !encoded) return null;
  let text;
  try {
    // Base64 -> byte -> UTF-8 memakai API Web murni; `escape` dan Buffer keduanya berisiko
    // di Edge Runtime, padahal kegagalan di sini membuat seluruh situs tidak dapat dibuka.
    text = new TextDecoder().decode(Uint8Array.from(atob(encoded), character => character.charCodeAt(0)));
  } catch { return null; }
  const [user, ...rest] = text.split(':');
  return { user, password: rest.join(':') };
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

export function middleware(request) {
  // Kesalahan apa pun di sini tidak boleh membuat seluruh situs tidak dapat dibuka.
  // Halaman dibiarkan lewat; hanya jalur berbayar yang ditutup bila terjadi galat.
  try {
    return decide(request);
  } catch {
    return new URL(request.url).pathname === ANALYZE
      ? unauthorized('Penarikan data diblokir karena kesalahan pada gerbang masuk. Periksa environment deployment.')
      : undefined;
  }
}

function decide(request) {
  const user = (process.env.DASHBOARD_USER || '').trim();
  const password = process.env.DASHBOARD_PASSWORD || '';
  const path = new URL(request.url).pathname;
  if (!user || !password) {
    // Situs diizinkan tanpa akun, tetapi penarikan data harus dimatikan agar tidak ada
    // pihak luar yang memakai kuota Apify pemilik.
    return path === ANALYZE ? unauthorized('Penarikan data diblokir: isi DASHBOARD_USER dan DASHBOARD_PASSWORD pada environment deployment.') : undefined;
  }
  if (path === HEALTH) return undefined;
  const given = decodeBasic(request.headers.get('authorization'));
  if (given && secretsEqual(given.user, user) && secretsEqual(given.password, password)) return undefined;
  return unauthorized('Kredensial diperlukan.');
}

// Bentuk array adalah format yang dipakai dokumentasi Vercel untuk matcher.
export const config = { matcher: ['/:path*'] };
