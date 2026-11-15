/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#08883d',
          700: '#087333',
          800: '#126a32',
          900: '#183d2b',
          950: '#0f281d',
        },
        accent: {
          50: '#fdf2f5',
          100: '#f9dfe7',
          500: '#ba2e55',
          600: '#9e1c43',
          700: '#801535',
        },
        surface: {
          DEFAULT: '#f8fafc',
          muted: '#f1f5f9',
        },
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.25rem',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(0,0,0,0.04), 0 1px 3px 0 rgba(0,0,0,0.06)',
        'card-hover': '0 4px 12px 0 rgba(0,0,0,0.08)',
      },
    },
  },
  plugins: [],
};
