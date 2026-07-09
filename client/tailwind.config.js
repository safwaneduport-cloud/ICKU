/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Brand palette carried over from the prototype (ICKU.html CSS variables)
      colors: {
        pine: { DEFAULT: '#134535', tint: '#E4EDE7' },
        sage: { DEFAULT: '#2C7A57', tint: '#E2EFE7' },
        steel: { DEFAULT: '#3F6075', tint: '#E3EAEF' },
        ochre: { DEFAULT: '#9A6312', tint: '#F5EAD4' },
        brick: { DEFAULT: '#9C3A2A', tint: '#F3E1DC' },
        ink: { DEFAULT: '#1B2520', soft: '#5E635B' },
        paper: '#F1EFE8',
        line: '#DEDBD1',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', 'Inter', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
