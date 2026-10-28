import { IconChevronDown } from './icons.jsx';

// Satu primitif untuk setiap penyaring yang pilihannya panjang (kanal, topik, bintang, urut).
// Chip membungkus menjadi tiga baris begitu topik mencapai dua puluhan, dan bilah filter yang
// tinggi menelan separuh layar tidak lagi terasa seperti laporan. Dropdown menahan tingginya
// tetap satu baris sambil membawa jumlah ulasan di setiap pilihan. `title` per pilihan dipakai
// karena rincian yang dulu muncul sebagai tooltip chip — berapa keluhan dan berapa pujian di
// balik satu angka — tetap harus bisa dibuka. Nama pilihan yang terlalu panjang dipotong dengan
// elipsis, dan nilai terpilihnya tetap terbaca utuh begitu dropdown dibuka.
export function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="flex min-w-0 items-center gap-1.5 text-[10px] text-slate-400">
      {label}
      <span className="relative min-w-0">
        <select value={value} onChange={event => onChange(event.target.value)} className="select max-w-[260px] truncate">
          {options.map(option => (
            <option key={option.value} value={option.value} title={option.title}>
              {option.label}
            </option>
          ))}
        </select>
        <IconChevronDown size={11} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
      </span>
    </label>
  );
}
