// Lapisan analis (ai-analyst-v1): MODEL BAHASA MEMBACA HASIL UKUR, MESIN YANG MENGUKUR.
//
// Posisi lapisan ini persis di atas angka, bukan di dalamnya. Mesin korpus menghitung,
// mengelompokkan, dan menguji kemaknaan; lapisan ini menerima HASILnya sebagai fact sheet
// kualitatif lalu menulis bagian yang tidak bisa ditulis oleh hitungan: kenapa pola itu
// muncul, apa yang perlu dilakukan, dan seberapa percaya diri pembacaan itu.
//
// Kontrak yang membuat seluruh isi panel ini tetap bisa diaudit:
//   1. tidak ada SATU PUN angka hasil pengukuran yang dikirim, dan tidak ada angka yang boleh
//      kembali. Yang menyeberang hanyalah referensi kabut (c1, p1, t1, s1), urutan (yang lebih
//      dulu disebut = lebih besar porsinya), istilah kamus, dan frasa verbatim reviewers.
//      Kalimat yang memuat digit apa pun dibuang — jadi tidak ada angka yang bisa lolos dari
//      kepala model ke tabel yang terbaca sebagai hasil ukur;
//   2. yang kembali hanya boleh referensi yang kita kirim. Referensi asing dibuang: model tidak
//      bisa menambah gerombol, kanal, atau project yang tidak dibuktikan mesin;
//   3. setiap balikan membawa dua bahasa (en + id) sekaligus. Pengalih bahasa di antarmuka
//      memilih salah satunya, jadi satu penarikan tetap terbaca penuh di dua bahasa;
//   4. tanpa kunci, panggilan gagal, atau kuota habis — lapisan ini di-skip dan setiap panel
//      jatuh ke teks mesin seperti biasa. Penarikan data tidak pernah gagal karena lapisan ini,
//      dan tidak pernah menunggu lebih lama daripada sisa anggaran sebelum fase menulis;
//   5. status, model yang menjawab, dan berapa kalimat yang ditolak dicatat apa adanya, supaya
//      panel Metode bisa menyebut sumber setiap baris alih-alih menyembunyikannya.
import { PLATFORM_LABELS } from './channels.mjs';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
export const ANALYST_VERSION = 'ai-analyst-v1';
// Id model diambil dari jawaban API-nya sendiri, bukan dari ingatan. Yang tercatat di produksi:
// gemini-2.0-flash dan gemini-2.5-flash menjawab 404 dengan pesan "Please update your code to use
// models/gemini-3.8-flash", dan gemini-flash-latest menjawab 503. Jadi yang pertama diminta adalah
// id yang diminta API, dan 503 dicoba sekali lagi karena API sendiri menyebutnya sementara.
const DEFAULT_MODEL = 'gemini-3.8-flash';
// Dicoba hanya kalau model di atas menjawab 404. Nomor model berganti lebih cepat daripada
// deployment di-update; daftar ini adalah id yang pernah benar-benar menjawab, bukan karangan.
const FALLBACK_MODELS = ['gemini-flash-latest', 'gemini-2.5-flash'];
// 503/500 berarti "sedang sibuk", bukan "salah permintaan": satu percobaan ulang dibayar hanya
// kalau sisa anggaran masih cukup untuk panggilan penuh. 429 tidak diulang — itu kuota, dan
// mengulanginya hanya membakar kuota yang sama.
const RETRY_STATUSES = new Set([500, 502, 503, 504]);
// Status yang menyuruh seluruh tangga berhenti: kunci tidak berlaku (401/403) atau kuota habis
// (429). Yang terakhir ini tidak boleh dikejar dengan model lain — kuncinya sama, kuotanya sama.
const STOP_STATUSES = new Set([401, 403, 429]);
const RETRY_DELAY_MS = 1_500;
// Sisa waktu minimal untuk memaksa satu panggilan lagi setelah jeda percobaan ulang.
const RETRY_RESERVE_MS = 9_000;
// Jatah satu percobaan satu model. Anggaran total (timeoutMs di bawah) tidak boleh dihabiskan
// oleh satu panggilan yang tidak menjawab: kandidat cadangan masih harus dapat giliran.
const PER_TRY_MS = 20_000;
// Percobaan pertama adalah model yang justru direkomendasikan API, jadi ia dibayar sampai selesai.
// Terukur di produksi 28 Oktober: `gemini-3.8-flash` dan `gemini-flash-latest` keduanya diputus
// pada jatah 20 detik tanpa satu byte pun kembali, dan yang menjawab cepat hanya 404. Jatah
// 20 detik itu tidak cukup untuk balasan dua bahasa sepanjang ini; yang diam tetap kecil
// jatahnya supaya tangga tidak mati di model kedua.
const FIRST_TRY_MS = 90_000;
// Sisa waktu terkecil yang masih layak dibelanjakan untuk satu panggilan. Di bawah ini lapisan
// ini berhenti sendiri, sebelum sempat memotong anggaran fase menulis.
const MIN_BUDGET_MS = 9_000;
// Balasan lapisan ini jauh lebih panjang daripada penamaan saja (satu bacaan per panel, dua
// bahasa), jadi plafon token keluaran dinaikkan. Potongan di tengah JSON berarti balasan tidak
// bisa dibaca dan seluruh lapisan di-skip — itu sebabnya angkanya diberi ruang, bukan dihemat.
const MAX_OUTPUT_TOKENS = 8192;
const MAX_CLUSTERS = 40;
const MAX_PHRASES = 6;
const MAX_PLATFORMS = 8;
const MAX_PROJECTS = 8;
const MAX_NAME_LENGTH = 60;
const MIN_AREA_WORDS = 2;
const MIN_TEXT_LENGTH = 16;
const MAX_TEXT_LENGTH = 340;

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const wait = (ms, sleep = null) => (sleep ? sleep(ms) : new Promise(resolve => setTimeout(resolve, ms)));

// Yang ditanyakan ke API hanyalah daftar model yang memang ada untuk kunci ini — satu permintaan
// kecil yang tidak memakai kuota generasi. Alasannya terukur: tangga yang disusun dari ingatan
// menghabiskan produksi 27–28 Oktober pada id yang menjawab 404 dan id yang menjawab 503, dan
// setiap id yang tidak ada untuk kunci ini adalah satu percobaan yang terbuang. Kalau daftar
// tidak bisa dibaca (jaring diam, bukan 200), tangga tetap memakai daftar yang dihafal.
const LIST_MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const LIST_TIMEOUT_MS = 5_000;
const MAX_DISCOVERED = 3;

async function discoverModels({ env = process.env, fetchImpl = fetch } = {}) {
  const config = analystConfiguration(env);
  if (!config.enabled) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${LIST_MODELS_URL}?pageSize=200`, {
      headers: { 'x-goog-api-key': config.key },
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const body = await response.json();
    return (Array.isArray(body?.models) ? body.models : [])
      .filter(entry => String(entry?.name || '').startsWith('models/'))
      .filter(entry => (entry?.supportedGenerationMethods || []).includes('generateContent'))
      .map(entry => clean(entry.name).replace(/^models\//, ''))
      .filter(id => /flash/i.test(id))
      .slice(0, MAX_DISCOVERED);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export function analystConfiguration(env = process.env) {
  const key = clean(env?.GEMINI_API_KEY);
  const model = clean(env?.GEMINI_MODEL) || DEFAULT_MODEL;
  return { enabled: Boolean(key), key, model };
}

// Angka tidak boleh keluar dari mulut model — dan tidak boleh masuk ke prompt-nya.
function hasDigits(value) {
  return /\d/.test(value);
}

function acceptableName(value) {
  const name = clean(value);
  if (name.length < 2 || name.length > MAX_NAME_LENGTH) return null;
  if (hasDigits(name)) return null;
  return name;
}

// Nama area adalah item, bukan kata. Satu kata ("Notifikasi", "Jaringan") boleh menjadi label di
// kepala manajer tapi tidak menjelaskan apa yang gagal, jadi area wajib dua kata atau lebih; yang
// di bawah itu dibuang dan barisnya tetap menampilkan redaksi reviewers apa adanya.
function acceptableArea(value) {
  const name = acceptableName(value);
  if (!name) return null;
  if (name.split(/\s+/).length < MIN_AREA_WORDS) return null;
  return name;
}

// Satu kalimat bacaan: hanya lolos kalau benar-benar berupa kalimat (bukan fragmen satu kata
// atau paragraf yang memuat angka). Dua bahasa dinilai terpisah; yang hilang tidak diganti
// dengan karangan, penyaji yang jatuh ke bahasa lain.
function acceptableText(value) {
  const text = clean(value);
  if (text.length < MIN_TEXT_LENGTH || text.length > MAX_TEXT_LENGTH) return null;
  if (hasDigits(text)) return null;
  if (!/[a-zA-ZÀ-ɏ]{3,}\s+[a-zA-ZÀ-ɏ]{3,}/.test(text)) return null;
  return text;
}

function pair(value) {
  const en = acceptableText(value?.en);
  const id = acceptableText(value?.id);
  if (!en && !id) return null;
  return { en, id };
}

const counted = value => (Number.isFinite(value) && value > 0);

// Referensi kabut: `c1, c2, …` dipakai sebagai pegangan balikan supaya id asli (yang berupa
// teks frasa dan boleh memuat digit) tidak pernah keluar dan tidak pernah perlu diulang persis.
function labelSlots(labels) {
  return (Array.isArray(labels) ? labels : []).slice(0, MAX_CLUSTERS).map((label, index) => ({
    ref: `c${index + 1}`,
    id: label.id,
    phrases: (Array.isArray(label.phrases) ? label.phrases : []).slice(0, MAX_PHRASES).map(entry => entry.text),
    area: label.category?.name || null,
    direction: !Number.isFinite(label.momentum) ? 'undated' : label.momentum > 1 ? 'rising' : label.momentum < 1 ? 'falling' : 'steady',
  }));
}

// Urutan membawa informasi tanpa angka: kanal yang disebut lebih dulu adalah kanal yang lebih
// besar porsinya. Yang dikirim tetap hanya nama dan kata sifat hasil ukur.
function platformSlots(platforms) {
  const rows = (Array.isArray(platforms) ? platforms : [])
    .filter(row => row && typeof row.id === 'string' && counted(row.total))
    .slice()
    .sort((a, b) => b.total - a.total || a.id.localeCompare(b.id))
    .slice(0, MAX_PLATFORMS);
  return rows.map((row, index) => ({
    ref: `p${index + 1}`,
    id: row.id,
    name: PLATFORM_LABELS[row.id] || row.id,
    tilt: dominantTilt(row),
  }));
}

// Arah kanal ditulis sebagai kata, tanpa ambang "cukup besar" yang harus dikarang: yang dikirim
// hanyalah kelompok terbesar dan kelompok berikutnya yang benar-benar ada. Kanal yang isinya
// hanya satu kelompok dikatakan hanya satu kelompok.
function dominantTilt(row) {
  const parts = [
    ['complaints', row.negative],
    ['praise', row.positive],
    ['neutral wording', row.neutral],
    ['reviews that could not be classified', row.unclassified],
  ].filter(part => counted(part[1])).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!parts.length) return 'no readable text';
  const lead = parts[0][0];
  return parts[1] ? `mostly ${lead}, with a real share of ${parts[1][0]}` : `${lead} only`;
}

// Fact sheet: hasil ukur yang sudah diubah menjadi kata. Tidak ada satu pun jumlah yang ikut,
// termasuk yang tampak tidak berbahaya (persentase, skor, tanggal) — yang boleh lewat hanyalah
// urutan, nama kamus, arah, dan bahasa.
export function factSheet(model) {
  const labels = Array.isArray(model?.painPoints?.labels) ? model.painPoints.labels : [];
  const sentiment = model?.labels || {};
  const ranked = [
    ['negative', sentiment.negative || 0],
    ['positive', sentiment.positive || 0],
    ['neutral', sentiment.neutral || 0],
    ['unclassified', sentiment.unclassified || 0],
  ].sort((a, b) => b[1] - a[1]);
  const coverage = model?.coverage || {};
  const limits = [];
  if (counted(coverage.unclassified)) limits.push('a part of the corpus could not be classified into any sentiment');
  if (counted(coverage.withoutText)) limits.push('some reviews carry a star rating but no words');
  const trends = (Array.isArray(model?.daily) ? model.daily : []).reduce((sum, day) => sum + (counted(day.total) ? 1 : 0), 0);
  if (trends < 2) limits.push('the corpus is too short in time to read a direction');
  const languages = model?.languages?.counts || {};
  const dominantLanguage = Object.entries(languages).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  return {
    verdict: {
      // Kata, bukan angka: penguasa korpus dan tanda NSS. Tidak ada nilai indeks yang dikirim.
      dominantSentiment: counted(ranked[0]?.[1]) ? ranked[0][0] : 'unknown',
      netScore: !Number.isFinite(model?.nss) ? 'not measurable' : model.nss > 0 ? 'above zero' : model.nss < 0 ? 'below zero' : 'at zero',
      language: dominantLanguage === 'id' ? 'mostly Indonesian' : dominantLanguage === 'en' ? 'mostly English' : dominantLanguage ? 'mixed languages' : 'unknown',
    },
    channels: platformSlots(model?.platforms),
    // Urutan daftar = urutan kepadatan keluhan, jadi model bisa bilang "the loudest topic"
    // tanpa pernah diberi jumlahnya.
    topics: (Array.isArray(model?.topics) ? model.topics : [])
      .slice()
      .sort((a, b) => (b.low || 0) - (a.low || 0) || String(a.id).localeCompare(String(b.id)))
      .slice(0, 10)
      .map(topic => topic.name)
      .filter(Boolean),
    complaints: labelSlots(labels),
    findings: (Array.isArray(model?.signals?.items) ? model.signals.items : []).slice(0, 8).map((item, index) => ({
      ref: `s${index + 1}`,
      kind: item.kind,
      about: clean(item.subject) || null,
    })),
    limits,
  };
}

const SHAPE = 'Reply with JSON only, exactly this shape: {"names":[{"ref":"c1","category":{"en":"...","id":"..."},"subLabel":{"en":"...","id":"..."}}],"reading":{"narrative":{"en":"...","id":"..."},"reviews":{"en":"...","id":"..."},"method":{"en":"...","id":"..."},"labels":[{"ref":"c1","cause":{"en":"...","id":"..."},"action":{"en":"...","id":"..."}}],"platforms":[{"ref":"p1","note":{"en":"...","id":"..."}}]}}';

const RULES = [
  'You are a senior product analyst writing the reading that sits on top of a measured table.',
  'Every fact you receive is qualitative: rankings, directions, dictionary area names, and the exact wording reviewers wrote. No counts, shares, scores, or dates are sent to you.',
  'topics are listed from the densest complaint area to the least dense. findings are the machine-tested observations your reading sits on top of: a kind and what it is about. limits lists what this corpus cannot support.',
  'Never write a digit. Never estimate, mention, or imply a quantity; the table already carries every number and yours is the only text that must not.',
  'Write every text field in BOTH languages: "en" in English and "id" in Indonesian. Same meaning, natural analyst Indonesian, not a literal translation.',
  'Name what reviewers are talking about; do not restate their sentences. If the evidence does not support a claim, omit that field instead of inventing one.',
  // Aturan kosakata ini yang membuat panel terbaca sebagai laporan tim, bukan sebagai kutipan.
  'category is a line item in an incident report, not a keyword: two to four words naming the system behaviour that fails. Use the vocabulary an engineering or product team writes — "Payment notification not received", "Transfer declined", "Refund delayed", "Money debited, not credited", "Login blocked", "Biometric login fails", "Balance not updated", "Statement download fails", "Identity verification pending", "Card or QR payment failure", "App crash or freeze", "Slow response", "Customer support response late", "Fee or limit complaint". In "id" use the same register in Indonesian: "Notifikasi pembayaran tidak tiba", "Transfer gagal", "Pengembalian dana terlambat", "Saldo tidak diperbarui", "Verifikasi identitas tertunda".',
  'A one-word category is rejected by the machine, so never answer with a bare noun such as "Notifikasi", "Jaringan", "notification" or "latency": name what happens to the user. Never quote or tidy a reviewer sentence, and never name a product, feature, or team the sheet did not give you.',
  'subLabel is the shorter qualifier under the category, naming the second thing reviewers mention (two or three words). cause and action keep the same register: cause is the failing behaviour or component, action is what the owning team does next. Write them as a line item, not as advice prose.',
  'Use every ref exactly once for names. Use only refs that were sent to you, in names, labels, and platforms.',
  'narrative: two or three sentences on what the corpus says overall, written for a product manager who will read the numbers next to it.',
  'reviews: one or two sentences on how the reviewers write and what dominates their complaints.',
  'method: one or two sentences on how far this reading can be trusted, given the limits listed.',
  'labels: for each complaint cluster, the most likely product cause and the concrete next action for the team that owns it.',
  'platforms: for each channel, one sentence on what its reviewers show about that channel.',
  SHAPE,
].join(' ');

// Field yang dipakai untuk memetakan balik (id asli) tidak ikut menyeberang: id gerombol adalah
// teks ulasan yang boleh memuat digit, dan mengirimnya berarti mengundang model mengulang digit
// itu persis — yang setelahnya tidak bisa dibedakan dari angka hasil ukur.
export function analystRequest(sheet) {
  const payload = {
    verdict: sheet.verdict,
    limits: sheet.limits,
    topics: sheet.topics,
    channels: sheet.channels.map(({ ref, name, tilt }) => ({ ref, name, tilt })),
    complaints: sheet.complaints.map(({ ref, phrases, area, direction }) => ({ ref, phrases, area, direction })),
    findings: sheet.findings.map(({ ref, kind, about }) => ({ ref, kind, about })),
  };
  return {
    systemInstruction: { parts: [{ text: RULES }] },
    contents: [{ role: 'user', parts: [{ text: JSON.stringify(payload) }] }],
    generationConfig: { temperature: 0.3, responseMimeType: 'application/json', maxOutputTokens: MAX_OUTPUT_TOKENS },
  };
}

// Respons model di-parse sekuat mungkin: Gemini membungkus JSON di `candidates[0].content.parts`,
// dan model kadang masih menambahkan pagar markdown. Yang tidak bisa dibaca = lapisan di-skip.
function parseJson(text) {
  const raw = clean(text).replace(/^```(?:json)?/i, '').replace(/```$/, '');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Nama kategori dinilai dengan aturan nama (pendek, tanpa angka), bukan aturan kalimat.
// Dua bahasa diterima terpisah: kalau hanya satu yang lolos, bahasa itu tetap dipakai dan
// penyaji jatuh ke bahasa lain lewat bilingual() — tidak pernah diganti dengan karangan.
function namePair(value, { area = false } = {}) {
  const check = area ? acceptableArea : acceptableName;
  if (typeof value === 'string') {
    const one = check(value);
    return one ? { en: one, id: one } : null;
  }
  const en = check(value?.en);
  const id = check(value?.id);
  if (!en && !id) return null;
  return { en, id };
}

export function applyNames(labels, names) {
  const byRef = new Map(labelSlots(labels).map(entry => [entry.ref, entry.id]));
  const out = {};
  if (!Array.isArray(names)) return out;
  for (const entry of names) {
    const ref = clean(entry?.ref);
    if (!byRef.has(ref)) continue;
    const category = namePair(entry?.category, { area: true });
    if (!category) continue;
    out[byRef.get(ref)] = { category, subLabel: namePair(entry?.subLabel) };
  }
  return out;
}

// Satu daftar balikan (`[{ref, ...fields}]`) menjadi peta berdasar id asli, dengan hitungan
// yang ditolak ikut tercatat. Penolakan adalah fakta tentang balasan model, jadi ia dilaporkan,
// bukan disembunyikan.
function mapRef(list, slots, build) {
  const byRef = new Map(slots.map(entry => [entry.ref, entry.id]));
  const accepted = {};
  let rejected = 0;
  if (Array.isArray(list)) {
    for (const entry of list) {
      const ref = clean(entry?.ref);
      if (!byRef.has(ref)) { rejected += 1; continue; }
      const value = build(entry);
      if (!value) { rejected += 1; continue; }
      accepted[byRef.get(ref)] = value;
    }
  }
  return { accepted, rejected };
}

export function applyReading(sheet, reading) {
  const out = { narrative: null, reviews: null, method: null, labels: {}, platforms: {} };
  if (!reading || typeof reading !== 'object') return { out, rejected: 1, kept: 0 };
  let rejected = 0;
  out.narrative = pair(reading.narrative);
  out.reviews = pair(reading.reviews);
  out.method = pair(reading.method);
  if (reading.narrative && !out.narrative) rejected += 1;
  if (reading.reviews && !out.reviews) rejected += 1;
  if (reading.method && !out.method) rejected += 1;
  const labels = mapRef(reading.labels, sheet.complaints, entry => {
    const cause = pair(entry?.cause);
    const action = pair(entry?.action);
    if (!cause && !action) return null;
    return { cause, action };
  });
  const platforms = mapRef(reading.platforms, sheet.channels, entry => pair(entry?.note));
  out.labels = labels.accepted;
  out.platforms = platforms.accepted;
  return { out, rejected: rejected + labels.rejected + platforms.rejected, kept: readingPanels(out) };
}

// Panggilan tunggal dengan tangga kandidat model dan anggaran waktu. Sama seperti lapisan
// penamaan yang digantikannya: 404 berarti id model tidak ada untuk kunci ini (coba kandidat
// berikut), 503 berarti sedang sibuk (coba ulang sekali), 429 berarti kuota (jangan bakar lagi).
async function callGemini(request, { env = process.env, fetchImpl = fetch, timeoutMs = 120_000, sleep = null, now = Date.now, label = 'analyst' } = {}) {
  const config = analystConfiguration(env);
  if (!config.enabled) {
    return { ok: false, status: 'skipped', reason: 'GEMINI_API_KEY is not set in the server environment', model: config.model, tried: [] };
  }
  const candidates = [...new Set([config.model, ...await discoverModels({ env, fetchImpl }), ...FALLBACK_MODELS])];
  const startedAt = now();
  const left = () => timeoutMs - (now() - startedAt);
  const tried = [];
  outer: for (const model of candidates) {
    let retried = false;
    for (;;) {
      if (left() < 4_000) {
        tried.push({ model, status: null, reason: 'no time left for another model' });
        break outer;
      }
      const controller = new AbortController();
      // Batas per percobaan, bukan sekadar sisa anggaran: di produksi 27 Oktober panggilan ke
      // `gemini-3.8-flash` menghabiskan seluruh anggaran tanpa satu balasan pun dan kandidat
      // cadangan tidak pernah sempat dicoba. Model yang diam hanya menghabiskan jatahnya sendiri.
      const attemptMs = Math.min(left(), model === candidates[0] ? FIRST_TRY_MS : PER_TRY_MS);
      const startedAttemptAt = now();
      const timer = setTimeout(() => controller.abort(), attemptMs);
      try {
        const response = await fetchImpl(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': config.key },
          body: JSON.stringify(request),
          signal: controller.signal,
        });
        if (!response.ok) {
          // Pesan API dipotong dan diringkas: ia menjelaskan ke pemilik apa yang harus
          // diganti, dan tidak pernah berisi kunci (kunci dikirim di header, bukan di URL).
          const detail = clean(await response.text().catch(() => '')).slice(0, 160);
          const retryable = RETRY_STATUSES.has(response.status) && !retried && left() > RETRY_RESERVE_MS;
          tried.push({
            model,
            status: response.status,
            reason: detail || `gemini responded ${response.status}`,
            ms: Math.round(now() - startedAttemptAt),
            ...(retryable ? { retry: 'once' } : {}),
          });
          if (retryable) {
            retried = true;
            await wait(RETRY_DELAY_MS, sleep);
            continue;
          }
          if (STOP_STATUSES.has(response.status)) {
            return { ok: false, status: 'failed', reason: `gemini responded ${response.status}`, detail: detail || null, model, tried };
          }
          // Sisa status adalah keadaan model, bukan keadaan permintaan ini: 404 berarti id-nya tidak
          // ada untuk kunci ini, 5xx berarti sedang sibuk. Keduanya boleh dijawab dengan kandidat
          // berikut — di produksi 27 Oktober satu 503 menutup seluruh lapisan padahal dua model
          // cadangan belum sempat diminta, dan yang dibaca layar jadi nama frasa mentah.
          if (left() > 4_000) continue outer;
          return { ok: false, status: 'failed', reason: `gemini responded ${response.status}`, detail: detail || null, model, tried };
        }
        const body = await response.json();
        const text = (body?.candidates?.[0]?.content?.parts || []).map(part => part?.text || '').join('');
        return { ok: true, model, tried, parsed: parseJson(text) };
      } catch (error) {
        const aborted = error?.name === 'AbortError';
        tried.push({
          model,
          status: null,
          reason: aborted ? `no answer within ${Math.round(attemptMs / 1000)}s` : clean(error?.message) || `${label} failed`,
          ms: Math.round(now() - startedAttemptAt),
        });
        // Jaringan yang membeku bukan bukti satu-satunya model mati: kandidat berikutnya masih
        // seluruh lapisan ini.
        if (left() > 4_000) continue outer;
        return { ok: false, status: 'failed', reason: tried[tried.length - 1].reason, model, tried };
      } finally {
        clearTimeout(timer);
      }
    }
  }
  const last = tried[tried.length - 1] || {};
  return {
    ok: false,
    status: 'failed',
    reason: last.reason || 'no gemini model answered',
    model: candidates[candidates.length - 1],
    tried,
  };
}

// Satu panggilan per penarikan: nama kategori DAN seluruh bacaan panel datang dari balasan yang
// sama. Dua panggilan berarti dua kesempatan lapisan ini memakan anggaran penulisan.
export async function analyseCorpus(model, { env = process.env, fetchImpl = fetch, timeoutMs = 120_000, sleep = null, now = Date.now } = {}) {
  const sheet = factSheet(model);
  if (!sheet.complaints.length && !sheet.channels.length) {
    return { status: 'skipped', reason: 'nothing measured to read', names: {}, reading: emptyReading(), metrics: zeroMetrics() };
  }
  // Waktu yang tidak cukup untuk satu panggilan penuh tidak dibelanjakan: lapisan ini selalu
  // boleh tidak ada, tetapi fase menulis tidak boleh gagal karena menunggunya.
  if (!(timeoutMs >= MIN_BUDGET_MS)) {
    return { status: 'skipped', reason: 'not enough time left before the write window', names: {}, reading: emptyReading(), metrics: zeroMetrics() };
  }
  const result = await callGemini(analystRequest(sheet), { env, fetchImpl, timeoutMs, sleep, now });
  if (!result.ok) {
    return {
      status: result.status,
      reason: result.reason,
      ...(result.detail ? { detail: result.detail } : {}),
      model: result.model,
      tried: result.tried,
      names: {},
      reading: emptyReading(),
      metrics: zeroMetrics(sheet.complaints.length),
    };
  }
  const names = applyNames(model.painPoints?.labels || [], result.parsed?.names);
  const applied = applyReading(sheet, result.parsed?.reading);
  const named = Object.keys(names).length;
  const panels = applied.kept;
  if (!named && !panels) {
    return {
      status: 'failed',
      reason: 'no usable text in the model response',
      model: result.model,
      tried: result.tried,
      names: {},
      reading: emptyReading(),
      metrics: { names: { requested: sheet.complaints.length, accepted: 0, rejected: sheet.complaints.length }, reading: { panels: 0, accepted: 0, rejected: Math.max(1, applied.rejected) } },
    };
  }
  return {
    status: 'answered',
    provider: 'gemini',
    model: result.model,
    tried: result.tried,
    clusters: sheet.complaints.length,
    named,
    names,
    reading: applied.out,
    metrics: {
      names: { requested: sheet.complaints.length, accepted: named, rejected: Math.max(0, sheet.complaints.length - named) },
      reading: { panels, accepted: panels, rejected: applied.rejected || 0 },
    },
  };
}

function emptyReading() {
  return { narrative: null, reviews: null, method: null, labels: {}, platforms: {} };
}

function zeroMetrics(requested = 0) {
  return { names: { requested, accepted: 0, rejected: 0 }, reading: { panels: 0, accepted: 0, rejected: 0 } };
}

function readingPanels(reading) {
  return [reading.narrative, reading.reviews, reading.method].filter(Boolean).length
    + Object.keys(reading.labels || {}).length
    + Object.keys(reading.platforms || {}).length;
}

// ---- Pembacaan lintas project (menu Compare) ----
// Matriks bandingkan dihitung mesin dari beberapa snapshot sekaligus. Yang menyeberang ke model
// tetap hanya kata dan urutan: project disusun dari korpus terbesar ke terkecil, arahnya disebut
// sebagai 'net praise' atau 'net complaint', dan keluhan terkeras tiap project diambil dari baris
// heat-map yang sudah dihitung mesin. Tidak ada satu pun angka yang ikut.
function compareSlots(matrix) {
  const rows = (Array.isArray(matrix?.projects) ? matrix.projects : []).filter(project => project.hasData);
  const ordered = rows.slice().sort((a, b) => (b.metrics?.volume || 0) - (a.metrics?.volume || 0) || String(a.id).localeCompare(String(b.id)));
  const loudestOf = id => {
    let best = null;
    for (const row of (Array.isArray(matrix?.painPoints) ? matrix.painPoints : [])) {
      const cell = row?.cells?.[id];
      if (!cell || !Number.isFinite(cell.share)) continue;
      if (!best || cell.share > best.share) best = { share: cell.share, text: clean(row.anchor) || clean(row.text) || null };
    }
    return best?.text || null;
  };
  return ordered.slice(0, MAX_PROJECTS).map((project, index) => ({
    ref: `w${index + 1}`,
    id: project.id,
    name: clean(project.label) || clean(project.entity) || null,
    stance: !Number.isFinite(project.metrics?.nss)
      ? 'not measurable'
      : project.metrics.nss > 0 ? 'net praise' : project.metrics.nss < 0 ? 'net complaint' : 'net flat',
    loudest: loudestOf(project.id),
  }));
}

export function compareFactSheet(matrix) {
  const apps = compareSlots(matrix);
  return {
    rule: 'Apps are listed from the largest review corpus to the smallest; that order is the only quantity you receive.',
    apps,
    limits: apps.length < 2 ? ['fewer than two apps with stored data are in this comparison'] : [],
  };
}

export function compareRequest(sheet) {
  const payload = {
    rule: sheet.rule,
    limits: sheet.limits,
    apps: sheet.apps.map(({ ref, name, stance, loudest }) => ({ ref, name, stance, loudest })),
  };
  return {
    systemInstruction: {
      parts: [{
        text: [
          'You are a senior product analyst reading a side-by-side comparison of several apps that share one owner.',
          'You receive only names, an overall stance in words, the loudest complaint area of each app, and the order they are listed in. No counts, shares, scores, or dates are sent to you.',
          'Never write a digit. Never estimate or imply a quantity; the matrix already carries every number.',
          'Write every text field in BOTH languages: "en" in English and "id" in Indonesian. Same meaning, natural analyst Indonesian, not a literal translation.',
          'Say what the difference between these apps means for the owner and what they should do next; do not restate the rows.',
          'compare: two or three sentences for the whole comparison. apps: one sentence per app, keyed by the ref you were given; use each ref at most once and invent none.',
          'Reply with JSON only, exactly this shape: {"reading":{"compare":{"en":"...","id":"..."},"apps":[{"ref":"w1","note":{"en":"...","id":"..."}}]}}',
        ].join(' '),
      }],
    },
    contents: [{ role: 'user', parts: [{ text: JSON.stringify(payload) }] }],
    generationConfig: { temperature: 0.3, responseMimeType: 'application/json', maxOutputTokens: MAX_OUTPUT_TOKENS },
  };
}

export function applyCompare(sheet, reading) {
  if (!reading || typeof reading !== 'object') return { out: { compare: null, apps: {} }, rejected: 0 };
  const compare = pair(reading.compare);
  const apps = mapRef(reading.apps, sheet.apps, entry => pair(entry?.note));
  return {
    out: { compare, apps: apps.accepted },
    rejected: (reading.compare && !compare ? 1 : 0) + apps.rejected,
    kept: Object.keys(apps.accepted).length + (compare ? 1 : 0),
  };
}

// Dipanggil dari aksi compare: satu panggilan, satu bacaan, dan seluruh sel matriks tetap
// pengukuran mesin. Tanpa kunci atau saat gagal, panel bandingkan menampilkan matriksnya saja.
export async function analyseComparison(matrix, { env = process.env, fetchImpl = fetch, timeoutMs = 120_000, sleep = null, now = Date.now } = {}) {
  const sheet = compareFactSheet(matrix);
  const nothing = { compare: null, apps: {} };
  if (sheet.apps.length < 2) return { status: 'skipped', reason: 'a comparison needs at least two apps with stored data', reading: nothing };
  const result = await callGemini(compareRequest(sheet), { env, fetchImpl, timeoutMs, sleep, now, label: 'compare reading' });
  if (!result.ok) {
    return {
      status: result.status,
      reason: result.reason,
      ...(result.detail ? { detail: result.detail } : {}),
      model: result.model,
      tried: result.tried,
      reading: nothing,
    };
  }
  const applied = applyCompare(sheet, result.parsed?.reading);
  if (!applied.kept) {
    return { status: 'failed', reason: 'no usable reading in the model response', model: result.model, tried: result.tried, reading: nothing };
  }
  return {
    status: 'answered',
    provider: 'gemini',
    model: result.model,
    tried: result.tried,
    apps: sheet.apps.length,
    reading: applied.out,
    metrics: { accepted: applied.kept, rejected: applied.rejected },
  };
}
