// src/components/Map.tsx
'use client';

import React from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import CurrentVectorsLayer from './CurrentVectorsLayer';
import WaterMask from './WaterMask';

export default function MapView() {
  const position: [number, number] = [55.65, 12.85];

  return (
    <div className="relative w-full max-w-6xl aspect-[4/3] mx-auto mt-[6vh] overflow-hidden md:mb-[20vh]">
      <MapContainer
        center={position}
        zoom={8.5}
        scrollWheelZoom
        className="absolute inset-0 w-full h-full z-10"
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
