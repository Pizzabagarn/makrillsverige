import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  
  // Konfigurera headers för komprimerade filer och caching
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
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600, s-maxage=3600', // 1 hour cache
          },
        ],
      },
      {
        source: '/data/:path*-images/:filename*.png',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, s-maxage=86400, immutable', // 24 hours cache for images
          },
        ],
      },
      {
        source: '/data/:path*/metadata.json',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=1800, s-maxage=1800', // 30 minutes cache for metadata
          },
        ],
      },
      {
        source: '/images/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, s-maxage=31536000, immutable', // 1 year cache for static images
          },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate', // Never cache service worker
          },
        ],
      },
    ];
  },
};

export default nextConfig;
