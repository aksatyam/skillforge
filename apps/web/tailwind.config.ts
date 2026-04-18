import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // SkillForge brand — inherits CLAUDE.md enterprise palette for consistency
        brand: {
          navy: '#1B3A5C',
          blue: '#2E75B6',
          green: '#27AE60',
          orange: '#E67E22',
          red: '#E74C3C',
          dark: '#2C3E50',
          medium: '#7F8C8D',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
