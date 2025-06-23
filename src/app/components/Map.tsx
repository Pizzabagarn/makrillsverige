//src/app/components/Map.tsx

// src/app/components/Map.tsx

'use client';

import { MapContainer, TileLayer } from 'react-leaflet';
import { useEffect, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import CurrentVectorsLayer from './CurrentVectorsLayer';
import WaterMask from './WaterMask';

export default function MapView({ showZoom = true }: { showZoom?: boolean }) {
  const position: [number, number] = [55.65, 12.85];
  const [isDesktop, setIsDesktop] = useState(true);
  useEffect(() => {
    const check = () => setIsDesktop(window.matchMedia('(min-width: 768px)').matches);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  const zoomControl = showZoom && isDesktop;

  return (
    <div className="relative w-full h-full">
      <MapContainer
        center={position}
        zoom={8.5}
        scrollWheelZoom
        zoomControl={zoomControl}
        className="w-full h-full"
      >
        <TileLayer
          attribution="&copy; Esri, Maxar, Earthstar Geographics"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        />
        <WaterMask />
        <CurrentVectorsLayer />
      </MapContainer>
    </div>
  );
}