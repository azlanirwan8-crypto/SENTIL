/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#18211C',
          soft: '#3C4A42',
          muted: '#69776F',
          faint: '#8E9A92',
          900: '#101613',
        },
        paper: {
          DEFAULT: '#F3EEE1',
          50: '#FCFAF4',
          100: '#FAF7EE',
          200: '#F6F1E5',
          300: '#EFE8D8',
        },
        line: {
          DEFAULT: '#DCD4C1',
          soft: '#E9E2D3',
          strong: '#C9BFA9',
        },
        teal: {
          DEFAULT: '#0E6B5A',
          deep: '#084C41',
          bright: '#2B9C83',
          soft: '#DCEBE4',
        },
        coral: {
          DEFAULT: '#B5462F',
          deep: '#7E2D1D',
          bright: '#D46A51',
          soft: '#F5DED6',
        },
        amber: {
          DEFAULT: '#9C6714',
          deep: '#6E4A0F',
          bright: '#C18A2B',
          soft: '#F2E5C7',
        },
        mist: '#EDF0EA',
      },
      fontFamily: {
        sans: ['Manrope', 'Poppins', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        panel: '0 1px 0 rgba(24,33,28,.03), 0 24px 48px -40px rgba(24,33,28,.45)',
        lift: '0 2px 0 rgba(24,33,28,.03), 0 30px 60px -36px rgba(24,33,28,.55)',
        insetline: 'inset 0 0 0 1px rgba(24,33,28,.06)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(.97)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '.55' },
          '50%': { opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'bar-grow': {
          from: { transform: 'scaleY(0)' },
          to: { transform: 'scaleY(1)' },
        },
        'draw-line': {
          from: { strokeDashoffset: '1' },
          to: { strokeDashoffset: '0' },
        },
      },
      animation: {
        'fade-up': 'fade-up .65s cubic-bezier(.2,.7,.2,1) both',
        'fade-in': 'fade-in .5s ease both',
        'scale-in': 'scale-in .25s cubic-bezier(.2,.7,.2,1) both',
        'pulse-soft': 'pulse-soft 1.8s ease-in-out infinite',
        shimmer: 'shimmer 1.8s linear infinite',
        'bar-grow': 'bar-grow .7s cubic-bezier(.2,.7,.2,1) both',
      },
    },
  },
  plugins: [],
};
