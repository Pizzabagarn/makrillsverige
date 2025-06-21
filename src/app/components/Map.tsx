//src/app/components/Map.tsx

'use client';

import React from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import CurrentVectorsLayer from './CurrentVectorsLayer';
import WaterMask from './WaterMask';

export default function MapView() {
  const position: [number, number] = [55.65, 12.85];

  return (
    <div
      className="absolute top-0 left-0 right-0 bottom-[120px] lg:bottom-0 z-0 glow-pulse overflow-hidden"
      style={{
        WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 2%, black 100%)',
        maskImage: 'linear-gradient(to bottom, transparent 0%, black 2%, black 100%)',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
      }}
    >
      <MapContainer
        center={position}
        zoom={8.5}
        scrollWheelZoom
        className="absolute inset-0 w-full h-full"
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
