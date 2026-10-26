/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        pos: '#34D399',
        neg: '#FB7185',
        neu: '#FBBF24',
        unk: '#64748B',
        play: '#38BDF8',
        appstore: '#A78BFA',
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
