/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: 'var(--c-bg)',
          soft: 'var(--c-bg-soft)',
        },
        surface: {
          DEFAULT: 'var(--c-surface)',
          light: 'var(--c-surface-light)',
          lighter: 'var(--c-surface-lighter)',
        },
        border: {
          DEFAULT: 'var(--c-border)',
          strong: 'var(--c-border-strong)',
        },
        brand: {
          50: 'rgb(var(--brand-50) / <alpha-value>)',
          100: 'rgb(var(--brand-100) / <alpha-value>)',
          200: 'rgb(var(--brand-200) / <alpha-value>)',
          300: 'rgb(var(--brand-300) / <alpha-value>)',
          400: 'rgb(var(--brand-400) / <alpha-value>)',
          500: 'rgb(var(--brand-500) / <alpha-value>)',
          600: 'rgb(var(--brand-600) / <alpha-value>)',
          700: 'rgb(var(--brand-700) / <alpha-value>)',
          800: 'rgb(var(--brand-800) / <alpha-value>)',
          900: 'rgb(var(--brand-900) / <alpha-value>)',
        },
        violet: {
          300: '#C4B5FD',
          400: '#9D7DE8',
          500: '#7C5CD6',
        },
        ink: {
          primary: 'rgb(var(--ink-primary) / <alpha-value>)',
          secondary: 'rgb(var(--ink-secondary) / <alpha-value>)',
          muted: 'rgb(var(--ink-muted) / <alpha-value>)',
        },
        danger: {
          DEFAULT: 'rgb(var(--danger) / <alpha-value>)',
          soft: 'var(--danger-soft)',
        },
        positive: {
          DEFAULT: 'rgb(var(--positive) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'rgb(var(--warning) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Manrope', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl2: '1.25rem',
        '3xl': '1.75rem',
        '4xl': '2.25rem',
      },
      boxShadow: {
        soft: '0 8px 30px -12px rgba(0, 0, 0, 0.6)',
        glow: '0 0 0 1px rgb(var(--a-300) / 0.28), 0 8px 30px -8px rgb(var(--a-300) / 0.4)',
        'glow-lg': '0 0 0 1px rgb(var(--a-300) / 0.32), 0 0 70px -12px rgb(var(--a-300) / 0.55)',
        'glow-violet': '0 0 0 1px rgba(157,125,232,0.28), 0 8px 30px -8px rgba(157,125,232,0.4)',
        card: '0 4px 28px -10px rgba(0, 0, 0, 0.5)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'brand-gradient': 'linear-gradient(135deg, rgb(var(--a-300)) 0%, rgb(var(--a-500)) 100%)',
        'surface-gradient': 'linear-gradient(155deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.015) 100%)',
        aurora: 'var(--aurora)',
      },
      spacing: {
        18: '4.5rem',
        22: '5.5rem',
      },
      keyframes: {
        'modal-in': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'aurora-drift': {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '50%': { transform: 'translate(2%, -3%) scale(1.05)' },
        },
      },
      animation: {
        'modal-in': 'modal-in 200ms ease-out',
        'fade-in': 'fade-in 150ms ease-out',
        'aurora-drift': 'aurora-drift 22s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
