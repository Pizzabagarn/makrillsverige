//src/app/components/Map.tsx

// src/app/components/Map.tsx

'use client';

import { Map, NavigationControl } from 'react-map-gl/maplibre';
import { useEffect, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import CurrentVectorsLayer from './CurrentVectorsLayer';
import WaterMask from './WaterMask';

export default function MapView({ showZoom = true }: { showZoom?: boolean }) {
  const [isDesktop, setIsDesktop] = useState(true);
  
  useEffect(() => {
    const check = () => setIsDesktop(window.matchMedia('(min-width: 768px)').matches);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  
  const showNavigation = showZoom && isDesktop;

  return (
    <div className="relative w-full h-full">
      <Map
        initialViewState={{
          longitude: 12.85,
          latitude: 55.65,
          zoom: 8.5
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle={{
          version: 8,
          sources: {
            'esri-world-imagery': {
              type: 'raster',
              tiles: [
                'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
              ],
              tileSize: 256,
              attribution: '&copy; Esri, Maxar, Earthstar Geographics'
            }
          },
          layers: [
            {
              id: 'esri-world-imagery',
              type: 'raster',
              source: 'esri-world-imagery'
            }
          ]
        }}
        scrollZoom={true}
      >
        {showNavigation && <NavigationControl position="top-right" />}
        <WaterMask />
        <CurrentVectorsLayer />
      </Map>
    </div>
  );
}