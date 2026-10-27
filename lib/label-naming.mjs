// Lapisan penamaan (label-naming-v1): MODEL BAHASA HANYA MEMBERI NAMA, mesin yang menghitung.
//
// Kontrak yang membuat kolom "Category" tetap bisa diaudit:
//   1. tidak ada SATU PUN angka hasil pengukuran yang dikirim — jumlah ulasan, porsi, pujian,
//      arah, dan severity berhenti di mesin. Yang menyeberang hanya referensi kabut (c1, c2, …)
//      dan frasa verbatim reviewers; frasa memang boleh memuat digit karena ia teks bukti,
//      bukan metrik, dan itulah sebabnya referensi dikirim kabut: id gerombol adalah teks frasa,
//      jadi id aslinya tidak boleh dipakai sebagai pegangan balikan;
//   2. yang kembali hanya boleh referensi yang kita kirim. Referensi asing dibuang, jadi model
//      tidak bisa menambah gerombol yang tidak dibuktikan mesin;
//   3. nama yang memuat angka apa pun ditolak, supaya tidak ada angka yang lolos dari kepala
//      model ke tabel yang terbaca sebagai hasil pengukuran;
//   4. tanpa kunci, panggilan gagal, atau kuota habis — penamaan di-skip dan panel jatuh ke
//      nama korpus seperti biasa. Penarikan data tidak pernah gagal karena lapisan ini.
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
export const NAMING_VERSION = 'label-naming-v1';
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
const RETRY_DELAY_MS = 1_500;
// Sisa waktu minimal untuk memaksa satu panggilan lagi setelah jeda percobaan ulang.
const RETRY_RESERVE_MS = 9_000;
const MAX_CLUSTERS = 40;
const MAX_PHRASES = 6;
const MAX_NAME_LENGTH = 60;

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const wait = (ms, sleep = null) => (sleep ? sleep(ms) : new Promise(resolve => setTimeout(resolve, ms)));

export function namingConfiguration(env = process.env) {
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

// Referensi kabut: `c1, c2, …` dipakai sebagai pegangan balikan supaya id asli (yang berupa
// teks frasa dan boleh memuat digit) tidak pernah keluar dan tidak pernah perlu diulang persis.
function slots(clusters) {
  return clusters.slice(0, MAX_CLUSTERS).map((cluster, index) => ({
    ref: `c${index + 1}`,
    id: cluster.id,
    phrases: cluster.phrases.slice(0, MAX_PHRASES),
  }));
}

export function namingRequest(clusters) {
  const list = slots(clusters);
  return {
    systemInstruction: {
      parts: [{
        text: [
          'You are naming clusters of app-review complaints for an analytics table.',
          'You receive a reference id and the exact wording reviewers wrote. You receive no counts.',
          'For each cluster return a short analyst category (2-4 words, an area of the product)',
          'and a shorter sub-label (1-3 words, the specific thing being complained about).',
          'Rules: reply with JSON only, as {"names":[{"ref":"...","category":"...","subLabel":"..."}]}',
          'Use every ref exactly once and invent no new ref. Write in English. Never use digits in a name.',
          'Do not restate the reviewers; name what they are talking about.',
        ].join(' '),
      }],
    },
    contents: [{ role: 'user', parts: [{ text: JSON.stringify({ clusters: list.map(({ ref, phrases }) => ({ ref, phrases })) }) }] }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json', maxOutputTokens: 2048 },
  };
}

// Respons model di-parse sekuat mungkin: Gemini membungkus JSON di `candidates[0].content.parts`,
// dan model kadang masih menambahkan pagar markdown. Yang tidak bisa dibaca = penamaan di-skip.
function parseNames(text) {
  const raw = clean(text).replace(/^```(?:json)?/i, '').replace(/```$/, '');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.names) ? parsed.names : null;
  } catch {
    return null;
  }
}

export function applyNames(clusters, names) {
  const byRef = new Map(slots(clusters).map(entry => [entry.ref, entry.id]));
  const out = {};
  if (!Array.isArray(names)) return out;
  for (const entry of names) {
    const ref = clean(entry?.ref);
    if (!byRef.has(ref)) continue;
    const category = acceptableName(entry?.category);
    const subLabel = acceptableName(entry?.subLabel);
    if (!category) continue;
    out[byRef.get(ref)] = { category, subLabel: subLabel || null };
  }
  return out;
}

export async function nameClusters(clusters, { env = process.env, fetchImpl = fetch, timeoutMs = 25_000, sleep = null, now = Date.now } = {}) {
  const list = Array.isArray(clusters) ? clusters.filter(cluster => cluster?.id && Array.isArray(cluster?.phrases) && cluster.phrases.length) : [];
  if (!list.length) return { status: 'skipped', reason: 'no clusters to name', names: {} };
  const config = namingConfiguration(env);
  if (!config.enabled) return { status: 'skipped', reason: 'GEMINI_API_KEY is not set in the server environment', model: config.model, names: {} };

  // 404 dari generativelanguage berarti "id model ini tidak ada untuk kunci ini" — itu
  // bukan salah prompt dan tidak akan sembuh dengan mencoba hal yang sama. Nomor model
  // berganti lebih cepat daripada deployment di-update, jadi kandidat berikutnya dicoba;
  // yang menjawab dilaporkan apa adanya supaya nama kolom bisa ditelusuri ke model nyata.
  const candidates = [config.model, ...FALLBACK_MODELS.filter(model => model !== config.model)];
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
      const timer = setTimeout(() => controller.abort(), left());
      try {
        const response = await fetchImpl(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': config.key },
          body: JSON.stringify(namingRequest(list)),
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
            ...(retryable ? { retry: 'once' } : {}),
          });
          if (retryable) {
            retried = true;
            await wait(RETRY_DELAY_MS, sleep);
            continue;
          }
          if (response.status === 404) continue outer;
          return { status: 'failed', reason: `gemini responded ${response.status}`, detail: detail || null, model, tried, names: {} };
        }
        const body = await response.json();
        const text = (body?.candidates?.[0]?.content?.parts || []).map(part => part?.text || '').join('');
        const names = applyNames(list, parseNames(text));
        const named = Object.keys(names).length;
        if (!named) return { status: 'failed', reason: 'no usable names in the model response', model, tried, names: {} };
        return { status: 'named', provider: 'gemini', model, clusters: list.length, named, tried, names };
      } catch (error) {
        const reason = error?.name === 'AbortError' ? 'naming timed out' : clean(error?.message) || 'naming failed';
        return { status: 'failed', reason, model, tried, names: {} };
      } finally {
        clearTimeout(timer);
      }
    }
  }
  const last = tried[tried.length - 1] || {};
  return {
    status: 'failed',
    reason: last.reason || 'no gemini model answered',
    model: candidates[candidates.length - 1],
    tried,
    names: {},
  };
}
