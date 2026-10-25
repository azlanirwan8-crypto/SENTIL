import { IconArrowRight, IconInfo, IconPlus, IconSearchSignal } from './icons.jsx';

function EnginePlate() {
  return (
    <div className="dark-panel noise-dark relative flex h-full min-h-[430px] flex-col overflow-hidden rounded-[28px] border border-ink-900/20 p-6 text-paper-50 shadow-lift sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-paper-50/45">Alur mesin</p>
          <p className="mt-1.5 font-display text-[20px] leading-tight text-paper-50">Korpus jadi sinyal</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-paper-50/15 bg-paper-50/[0.06] px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-[0.12em] text-paper-50/70">
          <span className="h-1.5 w-1.5 rounded-full bg-teal-bright animate-pulse-soft" />
          Tanpa kamus
        </span>
      </div>

      <div className="relative mt-7 flex-1">
        <svg viewBox="0 0 420 280" className="h-full w-full" aria-hidden="true">
          <defs>
            <linearGradient id="plate-line" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#2B9C83" stopOpacity="0.18" />
              <stop offset="0.55" stopColor="#2B9C83" stopOpacity="0.85" />
              <stop offset="1" stopColor="#C18A2B" stopOpacity="0.5" />
            </linearGradient>
            <linearGradient id="plate-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#2B9C83" stopOpacity="0.28" />
              <stop offset="1" stopColor="#2B9C83" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          <g stroke="#FCFAF4" strokeOpacity="0.08">
            <line x1="0" y1="56" x2="420" y2="56" />
            <line x1="0" y1="140" x2="420" y2="140" />
            <line x1="0" y1="224" x2="420" y2="224" />
            <line x1="96" y1="0" x2="96" y2="280" />
            <line x1="210" y1="0" x2="210" y2="280" />
            <line x1="324" y1="0" x2="324" y2="280" />
          </g>

          <path d="M14 198 C 72 196, 78 138, 122 146 S 190 212, 238 170 S 302 82, 406 102" fill="none" stroke="url(#plate-line)" strokeWidth="2" strokeLinecap="round" />
          <path d="M14 198 C 72 196, 78 138, 122 146 S 190 212, 238 170 S 302 82, 406 102 L 406 262 L 14 262 Z" fill="url(#plate-area)" />

          {[
            [42, 224, 74, 38],
            [64, 208, 74, 54],
            [86, 190, 74, 72],
          ].map(([x, y, w, h], index) => (
            <rect key={index} x={x} y={y} width={w} height={h} rx="4" fill="#FCFAF4" fillOpacity={0.05 + index * 0.025} stroke="#FCFAF4" strokeOpacity="0.08" />
          ))}

          {[0, 1, 2, 3, 4, 5].map(index => (
            <rect key={index} x={126 + index * 16} y={214 - (index % 3) * 17 - index * 3} width="8" height={26 + (index % 3) * 17 + index * 3} rx="3" fill={index % 2 ? '#C18A2B' : '#2B9C83'} fillOpacity="0.7" />
          ))}

          <g transform="translate(300 80)">
            <circle r="44" fill="none" stroke="#FCFAF4" strokeOpacity="0.1" />
            <circle r="29" fill="none" stroke="#FCFAF4" strokeOpacity="0.16" />
            <circle r="13" fill="#B5462F" fillOpacity="0.9" />
            <circle r="4" fill="#FCFAF4" fillOpacity="0.85" />
          </g>
          {[[349, 43, 4], [262, 110, 3], [342, 146, 3], [374, 63, 2.4]].map(([cx, cy, r], index) => (
            <circle key={index} cx={cx} cy={cy} r={r} fill="#FCFAF4" fillOpacity="0.4" />
          ))}

          <g fill="#FCFAF4" fillOpacity="0.5" fontSize="8.5" letterSpacing="1.4">
            <text x="16" y="24">TEKS MENTAH</text>
            <text x="124" y="24">TOKEN</text>
            <text x="238" y="24">BOBOT</text>
            <text x="352" y="24">KLASTER</text>
          </g>
          <g fill="#FCFAF4" fillOpacity="0.22" fontSize="8">
            <text x="17" y="246">01</text>
            <text x="125" y="246">02</text>
            <text x="239" y="246">03</text>
            <text x="353" y="246">04</text>
          </g>
        </svg>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-3 border-t border-paper-50/10 pt-4">
        {[
          ['Ambang korpus', '2% teratas'],
          ['Sinyal bobot', 'bintang 1–2 vs 4–5'],
          ['Kelompok', 'ko-okurensi'],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-paper-50/40">{label}</p>
            <p className="mt-1 text-[10.5px] leading-snug text-paper-50/80">{value}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[10px] leading-relaxed text-paper-50/45">
        Bintang bukan label emas. Skor adalah sinyal statistik dari korpus, bukan akurasi terkalibrasi.
      </p>
    </div>
  );
}

const STEPS = [
  {
    number: '01',
    title: 'Tulis dua isian',
    body: 'Nama analisis dan entitas target. Tidak ada unggah CSV, kunci API, atau akun.',
  },
  {
    number: '02',
    title: 'Pilih identitas toko',
    body: 'Kandidat Google Play dan App Store ditemukan otomatis. Kamu memilih yang benar; mesin tidak menebak.',
  },
  {
    number: '03',
    title: 'Baca sinyal korpus',
    body: 'Seluruh ulasan yang terbaca dianalisis. Empat grafik dan tabel ulasan mengikuti analisis aktif.',
  },
];

export function Welcome({ onAdd }) {
  return (
    <div className="pb-10 pt-8 sm:pt-12 lg:pt-16">
      <div className="grid items-stretch gap-8 lg:grid-cols-[1.08fr_0.92fr] lg:gap-12">
        <section className="flex flex-col justify-center py-2">
          <div className="rule-label">Ruang sinyal · data publik</div>
          <h1 className="mt-5 max-w-[13ch] text-balance text-[clamp(2.7rem,6vw,4.8rem)] leading-[0.98] text-ink">
            Baca seluruh suara.{' '}
            <span className="hl-amber">Tanpa kamus.</span>
          </h1>
          <p className="mt-6 max-w-[52ch] text-[14px] leading-[1.75] text-ink-soft text-pretty sm:text-[15px]">
            Ulasan publik Google Play dan App Store ditarik otomatis, lalu dibaca oleh mesin korpus yang mempelajari bobot katanya dari data itu sendiri. Tanpa kamus manual, tanpa impor berkas, tanpa sampel buatan.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button type="button" onClick={onAdd} className="btn btn-primary h-12 px-6 text-[14px]">
              <IconPlus size={17} />
              Mulai analisis pertama
              <IconArrowRight size={16} className="ml-1" />
            </button>
            <a href="#cara-kerja" className="btn btn-outline h-12 px-5 text-[13px]">
              <IconSearchSignal size={16} />
              Lihat cara kerja
            </a>
          </div>
          <p className="mt-4 text-[11px] text-ink-faint">Tanpa login · tanpa kunci API · analisis tersimpan lokal di peramban</p>

          <dl className="mt-10 grid max-w-xl grid-cols-3 border-t border-line/80 pt-5">
            {[
              ['2', 'sumber toko publik'],
              ['1 jam', 'cache per kanal'],
              ['0', 'kamus manual'],
            ].map(([value, label]) => (
              <div key={label} className="border-r border-line/60 pr-4 last:border-r-0 last:pl-4 first:pl-0">
                <dt className="display-num text-[26px] leading-none text-ink">{value}</dt>
                <dd className="mt-1.5 text-[10px] leading-snug text-ink-faint">{label}</dd>
              </div>
            ))}
          </dl>
        </section>

        <EnginePlate />
      </div>

      <section id="cara-kerja" className="mt-16 scroll-mt-28" aria-labelledby="cara-kerja-title">
        <div className="flex items-end justify-between gap-6 border-b border-line/80 pb-4">
          <div>
            <div className="rule-label">Cara kerja</div>
            <h2 id="cara-kerja-title" className="mt-2 text-[clamp(1.5rem,2.4vw,2rem)] leading-tight text-ink">Dari pencarian ke bacaan, tanpa campur tangan manual.</h2>
          </div>
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint sm:block">3 langkah</span>
        </div>
        <div className="grid gap-0 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <div key={step.number} className={`py-6 md:py-7 ${index < STEPS.length - 1 ? 'border-b border-line/70 md:border-b-0 md:border-r md:pr-7' : ''} ${index > 0 ? 'md:pl-7' : ''}`}>
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-[10px] font-semibold tracking-[0.12em] text-coral">{step.number}</span>
                <h3 className="text-[18px] leading-snug text-ink">{step.title}</h3>
              </div>
              <p className="mt-2 max-w-[34ch] text-[12px] leading-relaxed text-ink-muted">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-line/75 bg-paper-100/65 p-4 sm:flex-row sm:items-center sm:gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-paper-50"><IconInfo size={14} /></span>
        <p className="text-[11.5px] leading-relaxed text-ink-muted">
          Workspace adalah ruang kerja lokal di peramban ini, bukan akun server. Kamu dapat membuat beberapa analisis, berpindah instan, memperbarui, mengekspor JSON, dan menghapusnya sendiri.
        </p>
      </div>
    </div>
  );
}
