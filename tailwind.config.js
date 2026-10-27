/** @type {import('tailwindcss').Config} */

// Setiap warna antarmuka adalah variabel CSS yang didefinisikan dua kali (gelap dan terang) di
// src/index.css. Kelas tidak pernah menyebut hex, jadi menukar tema tidak menyentuh satu berkas
// komponen pun. Triplet RGB + <alpha-value> menjaga `bg-slate-800/70` tetap bekerja.
const ramp = name => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Dua sumber, satu kenyataan: angka di sini harus sama dengan SERIES_COLORS dan
        // STORE_COLORS di src/components/channels palette — yang satu dipakai kelas Tailwind,
        // yang satu dipakai atribut SVG. Kanal yang jarang muncul (youtube, reddit, sosial) tidak
        // punya kelas karena tidak pernah diwarnai lewat kelas.
        pos: ramp('pos'),
        neg: ramp('neg'),
        neu: ramp('neu'),
        unk: ramp('unk'),
        play: ramp('play'),
        appstore: ramp('appstore'),
        // Accent adalah warna interaksi (fokus, navigasi aktif, status langsung), bukan warna data.
        accent: ramp('accent'),
        slate: {
          50: ramp('slate-50'),
          100: ramp('slate-100'),
          200: ramp('slate-200'),
          300: ramp('slate-300'),
          400: ramp('slate-400'),
          500: ramp('slate-500'),
          600: ramp('slate-600'),
          700: ramp('slate-700'),
          800: ramp('slate-800'),
          900: ramp('slate-900'),
          950: ramp('slate-950'),
        },
        rose: {
          300: ramp('rose-300'),
          400: ramp('rose-400'),
          500: ramp('rose-500'),
        },
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
