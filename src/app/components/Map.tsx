//src/app/components/Map.tsx

// src/app/components/Map.tsx

'use client';

import React from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import CurrentVectorsLayer from './CurrentVectorsLayer';
import WaterMask from './WaterMask';

export default function MapView() {
  const position: [number, number] = [55.65, 12.85];

  return (
    <div className="relative w-full h-full">
      <MapContainer
        center={position}
        zoom={8.5}
        scrollWheelZoom
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
