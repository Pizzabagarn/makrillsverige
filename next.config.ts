import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  
  // Konfigurera headers för komprimerade filer
  async headers() {
    return [
      {
        source: '/data/:path*.gz',
        headers: [
          {
            key: 'Content-Encoding',
            value: 'gzip',
          },
          {
            key: 'Content-Type',
            value: 'application/json',
          },
        ],
      },
      {
        source: '/data/mackerel-probability-images-mercator/mackerel-values/:path*.gz',
        headers: [
          {
            key: 'Content-Encoding',
            value: 'gzip',
          },
          {
            key: 'Content-Type',
            value: 'application/json',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
