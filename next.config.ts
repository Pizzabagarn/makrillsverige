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
      // Cache för bilder - WebP prioriterat
      {
        source: '/data/:path*.(webp|avif)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=604800, stale-while-revalidate=86400', // 7 dagar cache för optimerade format
          },
          {
            key: 'Vary',
            value: 'Accept',
          },
        ],
      },
      // Fallback för PNG/JPEG - kortare cache
      {
        source: '/data/:path*.(png|jpg|jpeg|gif)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, stale-while-revalidate=3600', // 24h cache för legacy format
          },
        ],
      },
      // Cache för metadata
      {
        source: '/data/:path*metadata.json',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600, stale-while-revalidate=900', // 1h cache
          },
        ],
      },
      // Cache för statiska assets
      {
        source: '/images/:path*.(png|jpg|jpeg|gif|webp|svg|ico)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable', // 1 år för statiska assets
          },
        ],
      },
      // Preload viktiga resurser
      {
        source: '/',
        headers: [
          {
            key: 'Link',
            value: '</data/current-images-mercator/metadata.json>; rel=preload; as=fetch; crossorigin',
          },
        ],
      },
    ];
  },
  
  // Optimera bildkomprimering
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 7200, // 2 timmar - matchar nya cache-strategin
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  
  // Optimera för produktionsprestanda
  experimental: {
    optimizePackageImports: ['react-map-gl', 'maplibre-gl'],
    gzipSize: true,
  },
};

export default nextConfig;
