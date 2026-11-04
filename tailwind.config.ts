import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#08080b',
          900: '#0c0c11',
          850: '#101016',
          800: '#14141b',
          700: '#1b1b24',
          600: '#262633'
        },
        lavender: '#c4b5fd',
        sage: '#a7f3d0',
        mist: '#a1a1b5'
      },
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif'
        ]
      },
      boxShadow: {
        glow: '0 0 60px -12px rgba(196, 181, 253, 0.45)',
        player: '0 -24px 60px -24px rgba(0, 0, 0, 0.9)'
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        },
        'pulse-slow': {
          '0%, 100%': { opacity: '0.35' },
          '50%': { opacity: '0.75' }
        },
        eq: {
          '0%, 100%': { transform: 'scaleY(0.35)' },
          '50%': { transform: 'scaleY(1)' }
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' }
        },
        'spin-slow': {
          to: { transform: 'rotate(360deg)' }
        }
      },
      animation: {
        'fade-up': 'fade-up 0.45s cubic-bezier(0.16, 1, 0.3, 1) both',
        'pulse-slow': 'pulse-slow 5s ease-in-out infinite',
        eq: 'eq 0.9s ease-in-out infinite',
        shimmer: 'shimmer 1.8s infinite',
        'spin-slow': 'spin-slow 12s linear infinite'
      }
    }
  },
  plugins: []
};

export default config;
