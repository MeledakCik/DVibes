/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Core Prompt & Stitch Midnight Sanctuary Palette
        background: '#121214',
        sidebar: '#18181C',
        card: '#1E1E24',
        'card-hover': '#25252D',
        border: '#2A2A30',
        'text-primary': '#EAEAF0',
        'text-secondary': '#9A9AA3',
        lavender: '#B8A9C9',
        'lavender-bright': '#D4C4E5',
        'dusty-blue': '#A9B5C9',
        sage: '#A9C9B8',
        peach: '#C9B8A9',
        surface: '#131315',
        'surface-container-lowest': '#0e0e10',
        'surface-container-low': '#18181C',
        'surface-container': '#1E1E24',
        'surface-container-high': '#2a2a2c',
        'surface-container-highest': '#353437',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Sora', 'sans-serif'],
      },
      borderRadius: {
        card: '14px',
        lg: '12px',
        xl: '16px',
      },
    },
  },
  plugins: [],
};
