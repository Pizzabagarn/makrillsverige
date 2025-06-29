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
import { useLayerVisibility } from '../context/LayerContext';

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
  const { showCurrentMagnitude: contextShowCurrentMagnitude, showCurrentVectors: contextShowCurrentVectors } = useLayerVisibility();
  
  // console.log('🗺️ MapView render:', { showCurrentMagnitude, showCurrentVectors });

  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [isDesktop, setIsDesktop] = useState(true);
  
  useEffect(() => {
    const check = () => setIsDesktop(window.matchMedia('(min-width: 768px)').matches);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  
  // Beräkna maximal utzoomning för att visa hela maxBounds-området
  const getInitialZoom = () => {
    if (typeof window === 'undefined') return 6; // Server-side fallback
    
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    // MaxBounds: [10.3, 54.9] till [16.6, 59.6]
    // Longitude span: 6.3 grader, Latitude span: 4.7 grader
    
    // Beräkna lägsta zoom som fortfarande visar hela det begränsade området
    const lonSpan = 6.3; // 16.6 - 10.3
    const latSpan = 4.7; // 59.6 - 54.9
    const aspectRatio = width / height;
    
    // Maximal utzoomning (lägsta zoom-värde) som visar hela området
    let zoom;
    if (aspectRatio > 1.4) {
      // Bred skärm: latitude bestämmer zoom
      zoom = Math.max(6.0, 6.5 - Math.log2(height / 600));
    } else {
      // Smal skärm: longitude bestämmer zoom  
      zoom = Math.max(6.0, 6.2 - Math.log2(width / 400));
    }
    
    // Begränsa till giltiga värden - prioritera lägre zoom (mer utzoomad)
    return Math.max(6.0, Math.min(6.8, zoom));
  };
  
  const showNavigation = showZoom && isDesktop;

  return (
    <div className="relative w-full h-full">
      <Map
        initialViewState={{
          longitude: 10.8, // Nära sydvästra hörnet (med lite marginal från kanten)
          latitude: 55.913158,  // Nära sydvästra hörnet (med lite marginal från kanten)
          zoom: getInitialZoom()
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
          visible={contextShowCurrentMagnitude}
          opacity={1.0}
        />
        
        {/* PILAR MÅSTE RENDERAS EFTER MAGNITUDE FÖR ATT VARA OVANPÅ */}
        <CurrentVectorsLayer 
          visible={contextShowCurrentVectors}
        />
      </Map>
      
      {/* Legend för strömstyrka - FLYTTAD TILL ÖVRE HÖGRA HÖRNET, kompakt design */}
      <CurrentMagnitudeLegend 
        visible={contextShowCurrentMagnitude}
        className="absolute top-4 right-4 z-10"
      />
    </div>
  );
}