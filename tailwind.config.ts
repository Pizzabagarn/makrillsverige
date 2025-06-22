// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      maxHeight: {
        '1/2': '50vh',
        'screen-1/3': '33vh',
        '30vh': '30vh',
      },
    },
  },
  plugins: [],
};