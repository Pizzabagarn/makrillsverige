// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      maxHeight: {
        '1/2': '50vh',
        'screen-1/3': '33vh',
        '30vh': '30vh',
      },
      screens: {
        's5': '360px',
        's8': '360px',
        'xs': '375px',
        'iph13mini': '375px',
        'iph13_15': '390px',
        'iph13pro': '393px',
        'iph15pro': '393px',
        'iphxr': '414px',
        'px7': '412px',
        'px3xl': '411px',
        'iph14promax': '430px',
        'iph15promax': '430px',
      }
    }
  },
  plugins: [],
};

export default config;
