//src/app/components/Map.tsx

// src/app/components/Map.tsx

'use client';

import { Map, NavigationControl } from 'react-map-gl/maplibre';
import { useEffect, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import AreaParametersLayer from './AreaParametersLayer';
import CurrentMagnitudeLayer from './CurrentMagnitudeLayer';
import CurrentVectorsLayer from './CurrentVectorsLayer';
import CurrentMagnitudeLegend from './CurrentMagnitudeLegend';

interface MapViewProps {
  showZoom?: boolean;
  // Layer visibility controls
  showCurrentMagnitude?: boolean;
  showCurrentVectors?: boolean;
}

export default function MapView({ 
  showZoom = true,
  showCurrentMagnitude = true,
  showCurrentVectors = true
}: MapViewProps) {
  const [isDesktop, setIsDesktop] = useState(true);
  
  console.log('🗺️ MapView render:', { showCurrentMagnitude, showCurrentVectors });
  
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
        maxBounds={[
          [10.3, 54.9], // sydväst (lon_min, lat_min)
          [16.6, 59.6]  // nordöst (lon_max, lat_max)
        ]}
        minZoom={6}
        maxZoom={12}
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
        
        {/* Grundlager */}
        <AreaParametersLayer />
        
        {/* Ström-lager - strömstyrka kommer först (under pilar) */}
        <CurrentMagnitudeLayer 
          visible={showCurrentMagnitude}
          opacity={1.0}
        />
        
        {/* PILAR MÅSTE RENDERAS EFTER MAGNITUDE FÖR ATT VARA OVANPÅ */}
        <CurrentVectorsLayer 
          visible={showCurrentVectors}
        />
      </Map>
      
      {/* Legend för strömstyrka - FLYTTAD TILL ÖVRE HÖGRA HÖRNET, kompakt design */}
      <CurrentMagnitudeLegend 
        visible={showCurrentMagnitude}
        className="absolute top-4 right-4 z-10"
      />
    </div>
  );
}