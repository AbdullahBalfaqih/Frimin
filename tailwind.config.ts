import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        lumin: {
          bg: '#F4F5F7',
          card: '#FFFFFF',
          obsidian: '#0A0B0E',
          charcoal: '#181A1F',
          lime: '#C8FF00',
          limeSoft: '#D7FF3B',
          limeDark: '#9ECC00',
          border: '#EAECEF',
          muted: '#6E7480',
          ink: '#0D0E12',
        },
      },
      borderRadius: {
        '3xl': '24px',
        '4xl': '28px',
      },
      boxShadow: {
        bento: '0 4px 24px rgba(13, 14, 18, 0.035)',
        bentoHover: '0 10px 32px rgba(13, 14, 18, 0.07)',
      },
    },
  },
  plugins: [],
};

export default config;
