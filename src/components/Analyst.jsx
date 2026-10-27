import { bilingual, t } from '../lib/i18n.js';

// Bacaan lapisan `ai-analyst-v1` tidak pernah berdiri sendiri: tiap baris menyebut model yang
// menulisnya, dan seluruh angka di panel yang sama tetap pengukuran mesin. Dua helper kecil ini
// menjaga aturan itu di satu tempat supaya enam panel tidak menyalin markap dan alasannya
// masing-masing.
export function aiText(field) {
  return field ? bilingual(field.en, field.id) : '';
}

export function AnalystBadge({ model, note }) {
  return (
    <span
      className="tag-quiet shrink-0"
      title={note || t('Written by the language model from measured facts only — it never sees and never writes a number')}
    >
      {`AI · ${model || t('model')}`}
    </span>
  );
}

// Satu baris bacaan untuk satu panel. Tanpa bacaan ia tidak menampilkan apa pun: panel tetap
// terbaca dengan angka mesinnya saja, dan tidak ada kotak kosong yang menyamar sebagai analisis.
export function AnalystLine({ field, model, label, id = '' }) {
  const text = aiText(field);
  if (!text) return null;
  return (
    <p id={id || undefined} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[10px] leading-relaxed text-slate-300">
      <AnalystBadge model={model} />
      {label ? <span className="label-sm shrink-0">{label}</span> : null}
      <span className="min-w-0">{text}</span>
    </p>
  );
}
