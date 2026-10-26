// Kamus topik domain dua bahasa. Ini satu-satunya tempat di mesin yang boleh berisi kata di
// luar korpus, dan alasannya: kolom yang dibaca manajer tidak boleh berisi kata fungsi.
//
// Batas yang dijaga:
//   - istilah yang dipakai untuk MENGENALI keluhan bebas (ID + EN, termasuk bahasa toko),
//   - nama yang DIPAMERKAN kepada pembaca selalu diambil dari daftar ini, tidak pernah
//     dibentuk dari kata yang muncul di ulasan,
//   - tiap topik terikat ke satu klaster domain yang juga punya nama Indonesia dan Inggris.
// Jadi "harus", "pake", "tdk", "the", "my" tidak bisa menjadi label struktural, bukan karena
// disaring setelahnya, tapi karena tidak ada jalur yang meminjam kata dari ulasan untuk nama.
export const TAXONOMY_VERSION = 'domain-topic-v1';

export const DOMAIN_CLUSTERS = {
  authentication: { en: 'Biometrics & Authentication', id: 'Biometrik & Autentikasi' },
  reporting: { en: 'Reports & Dashboard', id: 'Laporan & Performa' },
  onboarding: { en: 'Onboarding & Registration', id: 'Onboarding & Registrasi' },
  payments: { en: 'Transactions & Settlement', id: 'Transaksi & Penyelesaian Dana' },
  reliability: { en: 'Stability & Availability', id: 'Stabilitas & Ketersediaan' },
  support: { en: 'Support & Escalation', id: 'Dukungan & Eskalasi' },
};

// Urutan kekhususan: kalau satu ulasan memuat beberapa topik, yang paling spesifik menjadi
// label utama. Urutan ini adalah keputusan tata letak chart, bukan klaim bobot sentimen.
const SPECIFICITY = [
  'biometric_login',
  'face_verification',
  'otp_code',
  'password_pin',
  'login_access',
  'branch_visit',
  'account_registration',
  'card_delivery',
  'kyc_verification',
  'statement_report',
  'transaction_history',
  'balance_display',
  'dashboard_view',
  'data_latency',
  'qris_payment',
  'fund_settlement',
  'transfer_topup',
  'unexpected_charge',
  'app_crash',
  'slow_performance',
  'service_outage',
  'update_regression',
  'customer_service',
];

const TOPIC_RECORD = {
  biometric_login: {
    label: '[Biometric Login]', labelId: '[Login Biometrik]', cluster: 'authentication',
    terms: ['sidik jari', 'fingerprint', 'biometric', 'biometrik', 'sidikjari', 'finger print'],
  },
  face_verification: {
    label: '[Face Verification]', labelId: '[Verifikasi Wajah]', cluster: 'authentication',
    terms: ['verifikasi wajah', 'wajah', 'face verification', 'face id', 'faceid', 'liveness', 'selfi', 'foto wajah', 'kenapa muka'],
  },
  otp_code: {
    label: '[OTP & Verification Code]', labelId: '[OTP & Kode Verifikasi]', cluster: 'authentication',
    terms: ['otp', 'kode verifikasi', 'verification code', 'sms token', 'token sms', 'kode token'],
  },
  password_pin: {
    label: '[Password & PIN Entry]', labelId: '[Masuk Password & PIN]', cluster: 'authentication',
    terms: ['pasword', 'password', 'kata sandi', 'sandi', 'pin', 'mpin', 'm pin', 'nomor kunci', '6 digit', 'lupa sandi'],
  },
  login_access: {
    label: '[Login & Session Access]', labelId: '[Login & Akses Sesi]', cluster: 'authentication',
    terms: ['login', 'log in', 'signin', 'sign in', 'masuk aplikasi', 'masuk apps', 'keluar sendiri', 'auto login', 'kredensial', 'tidak bisa masuk', 'gagal login'],
  },
  branch_visit: {
    label: '[Branch Visit Required]', labelId: '[Wajib ke Cabang]', cluster: 'onboarding',
    terms: ['cabang', 'kantor cabang', 'branch', 'ke bank', 'datang ke bank', 'kantor bni', 'offline ke bank'],
  },
  account_registration: {
    label: '[Account Registration]', labelId: '[Pendaftaran Akun]', cluster: 'onboarding',
    terms: ['daftar', 'dftr', 'pendaftaran', 'registrasi', 'register', 'rekening baru', 'buat akun', 'akun baru', 'buka rekening', 'signup', 'sign up', 'onboard'],
  },
  card_delivery: {
    label: '[Card Delivery]', labelId: '[Pengiriman Kartu]', cluster: 'onboarding',
    terms: ['kartu debit', 'pengiriman kartu', 'kartu tidak sampai', 'kartu belum sampai', 'kirim kartu', 'debit card', 'card delivery', 'buat kartu', 'ganti kartu'],
  },
  kyc_verification: {
    label: '[Identity Verification]', labelId: '[Verifikasi Identitas]', cluster: 'onboarding',
    terms: ['ktp', 'verifikasi data', 'validasi data', 'identitas', 'ektp', 'kyc', 'npwp', 'setoran awal', 'aktivasi', 'activation'],
  },
  statement_report: {
    label: '[Statements & Reports]', labelId: '[Laporan & E-Statement]', cluster: 'reporting',
    terms: ['laporan', 'statement', 'e-statement', 'estatement', 'rekening koran', 'report', 'unduh laporan', 'download laporan', 'rekap', 'pdf rekening'],
  },
  transaction_history: {
    label: '[Transaction History]', labelId: '[Riwayat Transaksi]', cluster: 'reporting',
    terms: ['riwayat', 'mutasi', 'history', 'transaction history', 'rekaman transaksi', 'keluar masuk uang', 'daftar transaksi'],
  },
  balance_display: {
    label: '[Balance Display]', labelId: '[Tampilan Saldo]', cluster: 'reporting',
    terms: ['saldo', 'balance', 'sisa saldo', 'tampilan jumlah', 'jumlah saldo', 'saldo tidak muncul', 'informasi saldo'],
  },
  dashboard_view: {
    label: '[Dashboard & Chart View]', labelId: '[Tampilan Dasbor & Grafik]', cluster: 'reporting',
    terms: ['dashboard', 'dasbor', 'tampilan', 'grafik', 'chart', 'menu', 'ui', 'halaman utama', 'tampilan utama'],
  },
  data_latency: {
    label: '[Data Latency]', labelId: '[Keterlambatan Data]', cluster: 'reporting',
    terms: ['delay', 'terlambat', 'tidak update', 'belum update', 'lama muncul', 'notifikasi lama', 'notifikasi telat', 'realtime', 'real time', 'latency'],
  },
  qris_payment: {
    label: '[QRIS Payments]', labelId: '[Pembayaran QRIS]', cluster: 'payments',
    terms: ['qris', 'qr dinamis', 'qr statis', 'scanner qr', 'pindai qr'],
  },
  fund_settlement: {
    label: '[Fund Settlement]', labelId: '[Pencairan Dana]', cluster: 'payments',
    terms: ['settlement', 'pencairan', 'pencairan dana', 'dana cair', 'payout', 'dana masuk', 'uang masuk', 'pembayaran masuk', 'penarikan dana', 'tarik dana'],
  },
  transfer_topup: {
    label: '[Transfers & Top-up]', labelId: '[Transfer & Top-up]', cluster: 'payments',
    terms: ['transfer', 'top up', 'topup', 'isi saldo', 'pemindahan dana', 'biaya transfer', 'intern bank', 'sesama bank'],
  },
  unexpected_charge: {
    label: '[Unexpected Charges]', labelId: '[Potongan Biaya Tidak Jelas]', cluster: 'payments',
    terms: ['terpotong', 'potongan', 'biaya admin', 'dipotong', 'uang saya berkurang', 'charge', 'fee', 'biaya tidak jelas'],
  },
  app_crash: {
    label: '[App Crash & Errors]', labelId: '[Crash & Error Aplikasi]', cluster: 'reliability',
    terms: ['eror', 'error', 'crash', 'force close', 'keluar sendiri', 'gagal terus', 'bermasalah', 'bug', 'exception', 'sistem kami', 'gangguan sistem'],
  },
  slow_performance: {
    label: '[Slow Performance]', labelId: '[Kinerja Lambat]', cluster: 'reliability',
    terms: ['lama', 'lelet', 'loading', 'lambat', 'nunggu', 'kelamaan', 'delay lama', 'slow', 'ngelag'],
  },
  service_outage: {
    label: '[Service Outage]', labelId: '[Gangguan Layanan]', cluster: 'reliability',
    terms: ['gangguan', 'server', 'sinyal', 'tidak bisa dibuka', 'susah dibuka', 'maintenance', 'offline', 'down', 'err500', 'sedang pemeliharaan'],
  },
  update_regression: {
    label: '[Update Regression]', labelId: '[Regresi Setelah Update]', cluster: 'reliability',
    terms: ['update', 'habis update', 'selesai update', 'versi baru', 'apk baru', 'pembaruan', 'sejak upgrade', 'setelah upgrade'],
  },
  customer_service: {
    label: '[Customer Service]', labelId: '[Layanan Pelanggan]', cluster: 'support',
    terms: ['cs', 'customer service', 'merchant care', 'call center', 'bantuan', 'helpdesk', 'hubungi', 'whatsapp', 'telepon', 'kontak bni', 'email bni', 'tidak ada respon'],
  },
};

export const TOPICS = SPECIFICITY
  .filter(id => TOPIC_RECORD[id])
  .map(id => ({ id, ...TOPIC_RECORD[id] }));

// Kata tugas dua bahasa. Fungsinya BUKAN membentuk label — label sudah dibentuk dari TOPICS —
// tapi menolak nama kategori apa pun yang datang dari jalur lain (misalnya kosakata halaman
// toko atau nama yang diusulkan model) kalau isinya hanya kata sambung/kata tugas.
const FUNCTION_WORDS = new Set([
  'yang', 'dan', 'atau', 'dengan', 'untuk', 'pada', 'ke', 'dari', 'di', 'saya', 'aku', 'kami', 'kita',
  'sudah', 'udah', 'belum', 'blum', 'tdk', 'tidak', 'bukan', 'akan', 'lagi', 'juga', 'aja',
  'pake', 'pakai', 'harus', 'boleh', 'kayak', 'macam', 'bgt', 'banget', 'sih', 'dong', 'kok', 'nih',
  'itu', 'ini', 'dia', 'mereka', 'apa', 'kenapa', 'bagaimana', 'begitu', 'sekali', 'lebih', 'sangat',
  'the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'with', 'is', 'are', 'was', 'were',
  'be', 'been', 'it', 'this', 'that', 'i', 'my', 'me', 'we', 'our', 'you', 'your', 'they', 'not',
  'have', 'has', 'had', 'will', 'would', 'can', 'could', 'so', 'very', 'too', 'but', 'if', 'because',
]);

const STOPWORD_SUFFIX = /(?:nya|pun|kah|lah|tah)$/;

// Nama kategori harus berupa istilah fitur, bukan kata tugas dan bukan angka. Fungsi ini adalah
// gerbang terakhir: ia dipakai untuk menolak nama dari jalur apa pun yang meminjam teks mentah.
export function isJunkTerm(value) {
  const name = String(value ?? '').trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  if (!name) return true;
  if (/\d/.test(name)) return true;
  const words = name.split(/[^a-z0-9']+/).filter(Boolean);
  if (!words.length) return true;
  if (words.every(word => FUNCTION_WORDS.has(word) || STOPWORD_SUFFIX.test(word))) return true;
  return name.replace(/[^a-z0-9]/g, '').length < 3;
}

const norm = value => ` ${String(value ?? '').toLowerCase().normalize('NFKC').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()} `;

// Satu pola panjang didahulukan supaya "sidik jari" tidak dihitung sebagai "jari" dobel
// dan "verifikasi wajah" tidak dihitung sebagai "wajah" dua kali.
const BY_CLUSTER = Object.entries(TOPICS.reduce((map, topic) => {
  (map[topic.cluster] = map[topic.cluster] || []).push(topic);
  return map;
}, {}));

export const TOPIC_BY_ID = new Map(TOPICS.map(topic => [topic.id, topic]));

const sortedTerms = TOPICS.map(topic => ({
  topic,
  terms: [...new Set(topic.terms.map(term => term.trim().toLowerCase()))].filter(Boolean),
}));

export function matchTopics(value) {
  const hay = norm(value);
  if (hay.trim().length < 2) return [];
  const found = [];
  for (const entry of sortedTerms) {
    const hits = entry.terms.filter(term => hay.includes(` ${term} `) || (term.length > 5 && hay.includes(` ${term}`)));
    if (hits.length) found.push({ topic: entry.topic, triggers: [...new Set(hits)] });
  }
  if (!found.length) return [];
  const rank = new Map(SPECIFICITY.map((id, index) => [id, index]));
  found.sort((a, b) => rank.get(a.topic.id) - rank.get(b.topic.id));
  return found;
}

export function primaryTopic(matches) {
  return matches.length ? matches[0] : null;
}

export function clusterOf(topicId) {
  const topic = TOPIC_BY_ID.get(String(topicId || ''));
  return topic ? topic.cluster : null;
}

export function clusterName(cluster, locale = 'en') {
  const entry = DOMAIN_CLUSTERS[cluster];
  if (!entry) return null;
  return locale === 'id' ? entry.id : entry.en;
}

export function topicsByCluster() {
  return BY_CLUSTER.map(([cluster, topics]) => ({ cluster, name: DOMAIN_CLUSTERS[cluster], topics }));
}

// Aturan pemilihan label untuk angka yang sudah dihitung: sebuah topik boleh mewakili sebuah
// gerombol keluhan hanya kalau cukup ulasan di dalam gerombol itu memuat istilah topik tersebut
// DAN porsinya lebih padat di gerombol itu daripada di keluhan lain. Tidak ada satu pun kata
// yang dipinjam dari teks ulasan untuk nama yang dikembalikan.
export function nameClusterWithTopics(clusterReviews, allComplaintReviews, { minReviews = 2, minLift = 1.2 } = {}) {
  const inCluster = clusterReviews.map(review => matchTopics(review.text ?? review.kutipan ?? ''));
  const elsewhere = allComplaintReviews.map(review => matchTopics(review.text ?? review.kutipan ?? ''));
  const tally = list => {
    const map = new Map();
    for (const matches of list) for (const entry of matches) map.set(entry.topic.id, (map.get(entry.topic.id) || 0) + 1);
    return map;
  };
  const inside = tally(inCluster);
  const outside = tally(elsewhere);
  const clusterSize = inCluster.length || 1;
  const outsideSize = Math.max(elsewhere.length - clusterSize, 1);
  const ranked = [...inside.entries()]
    .map(([id, count]) => {
      const rate = count / clusterSize;
      const baseRate = (outside.get(id) || 0) / outsideSize;
      return { topic: TOPIC_BY_ID.get(id), count, rate, lift: baseRate > 0 ? rate / baseRate : rate / (1 / outsideSize) };
    })
    .filter(entry => entry.topic && entry.count >= minReviews && entry.lift >= minLift)
    .sort((a, b) => SPECIFICITY.indexOf(a.topic.id) - SPECIFICITY.indexOf(b.topic.id) || b.count - a.count);
  return ranked;
}
