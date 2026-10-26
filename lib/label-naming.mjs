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
const DEFAULT_MODEL = 'gemini-2.0-flash';
const MAX_CLUSTERS = 40;
const MAX_PHRASES = 6;
const MAX_NAME_LENGTH = 60;

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

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

export async function nameClusters(clusters, { env = process.env, fetchImpl = fetch, timeoutMs = 25_000 } = {}) {
  const list = Array.isArray(clusters) ? clusters.filter(cluster => cluster?.id && Array.isArray(cluster?.phrases) && cluster.phrases.length) : [];
  if (!list.length) return { status: 'skipped', reason: 'no clusters to name', names: {} };
  const config = namingConfiguration(env);
  if (!config.enabled) return { status: 'skipped', reason: 'GEMINI_API_KEY is not set in the server environment', model: config.model, names: {} };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
      const response = await fetchImpl(`${ENDPOINT}/${encodeURIComponent(config.model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': config.key },
        body: JSON.stringify(namingRequest(list)),
        signal: controller.signal,
      });
    if (!response.ok) {
      return { status: 'failed', reason: `gemini responded ${response.status}`, model: config.model, names: {} };
    }
    const body = await response.json();
    const text = (body?.candidates?.[0]?.content?.parts || []).map(part => part?.text || '').join('');
    const names = applyNames(list, parseNames(text));
    const named = Object.keys(names).length;
    if (!named) return { status: 'failed', reason: 'no usable names in the model response', model: config.model, names: {} };
    return { status: 'named', provider: 'gemini', model: config.model, clusters: list.length, named, names };
  } catch (error) {
    return { status: 'failed', reason: error?.name === 'AbortError' ? 'naming timed out' : clean(error?.message) || 'naming failed', model: config.model, names: {} };
  } finally {
    clearTimeout(timer);
  }
}
