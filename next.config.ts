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
      // INTELLIGENT CACHE HEADERS - matchande Service Worker strategi
      // Bilder - lång cache (uppdateras dagligen kl 02:00)
      {
        source: '/data/:path*.(png|jpg|jpeg|gif|webp)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=72000, s-maxage=72000', // 20 timmar
          },
        ],
      },
      // Metadata - medellång cache (säkerhetsmarginal)
      {
        source: '/data/:path*metadata.json',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=43200, s-maxage=43200', // 12 timmar
          },
        ],
      },
      // API-endpoints - kort cache (popup-responsivitet)
      {
        source: '/api/area-parameters',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=600, s-maxage=600', // 10 minuter
          },
        ],
      },
      {
        source: '/api/mackerel-values/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=600, s-maxage=600', // 10 minuter
          },
        ],
      },
      // Behåll lång cache för statiska assets
      {
        source: '/images/:path*.(png|jpg|jpeg|gif|webp|svg|ico)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable', // 1 år för statiska assets
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
        ],
      },
      // Uppdaterat: Preload viktiga resurser
      {
        source: '/',
        headers: [
          {
            key: 'Link',
            value: '</data/current-images-mercator/metadata.json>; rel=preload; as=fetch; crossorigin', // FIXAT: Rätt mapp
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
