/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Dua sumber, satu kenyataan: angka di sini harus sama dengan SERIES_COLORS dan
        // STORE_COLORS di src/components/channels palette — yang satu dipakai kelas Tailwind,
        // yang satu dipakai atribut SVG. Kanal yang jarang muncul (youtube, reddit, sosial) tidak
        // punya kelas karena tidak pernah diwarnai lewat kelas.
        pos: '#34D399',
        neg: '#FB7185',
        neu: '#FBBF24',
        unk: '#64748B',
        play: '#72A2CA',
        appstore: '#AA92D3',
        // Accent adalah warna interaksi (fokus, navigasi aktif, status langsung), bukan warna data.
        accent: '#22D3EE',
      },
      fontFamily: {
        // Hanya satu wajah yang benar-benar dimuat dan di-preload (index.html). Nama lain
        // di tumpukan ini adalah janji yang tidak bisa ditepati bundel tanpa asetnya.
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['11px', { lineHeight: '15px' }],
      },
      spacing: {
        '4.5': '18px',
        '5.5': '22px',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'scale-in': {
          from: { opacity: '0', transform: 'translateY(6px) scale(.985)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'pulse-soft': { '0%,100%': { opacity: '.4' }, '50%': { opacity: '1' } },
        'bar-grow': { from: { transform: 'scaleY(0)' }, to: { transform: 'scaleY(1)' } },
      },
      animation: {
        'fade-in': 'fade-in .25s ease both',
        'scale-in': 'scale-in .18s cubic-bezier(.2,.7,.2,1) both',
        'pulse-soft': 'pulse-soft 1.6s ease-in-out infinite',
        'bar-grow': 'bar-grow .5s cubic-bezier(.2,.7,.2,1) both',
      },
    },
  },
  plugins: [],
};
