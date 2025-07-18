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
      // Optimerad cache för bilder (uppdateras dagligen)
      {
        source: '/data/:path*.(png|jpg|jpeg|gif|webp)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=72000, stale-while-revalidate=7200', // 20h cache, 2h stale
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Vary',
            value: 'Accept-Encoding', // Optimera för komprimering
          },
        ],
      },
      // Samma cache som bilder (uppdateras tillsammans)
      {
        source: '/data/:path*metadata.json',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=72000, stale-while-revalidate=7200', // 20h cache, 2h stale
          },
          {
            key: 'Vary',
            value: 'Accept-Encoding',
          },
        ],
      },
      // Kortare cache för GeoJSON filer
      {
        source: '/data/:path*.(geojson|json)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=43200, stale-while-revalidate=3600', // 12h cache, 1h stale
          },
          {
            key: 'Vary',
            value: 'Accept-Encoding',
          },
        ],
      },
      // NYTT: Optimera för andra statiska assets
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
      // NYTT: Preload kritiska resurser
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
  
  // NYTT: Optimera bildkomprimering
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 72000, // 20 timmar samma som övriga bilder
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  
  // NYTT: Optimera för produktionsprestanda
  experimental: {
    optimizePackageImports: ['react-map-gl', 'maplibre-gl'],
    gzipSize: true,
  },
};

export default nextConfig;
