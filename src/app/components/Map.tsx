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
    <div
      className="
    relative
    w-full
    max-w-6xl

    /* 📱 Mobilhöjd – kortare och manuellt styrd */
    h-[32vh]

    /* 🖥 Desktop: ignorera mobilhöjd, använd aspect-ratio */
    sm:h-auto
    sm:aspect-[4/3]

    /* Mobil: ingen aspect-ratio så att h-[32vh] styr */
    aspect-auto

    mx-auto
    mt-[2vh]
    sm:mt-[6vh]

    md:mb-[20vh]
    rounded-3xl
    border border-white/10
    bg-white/5
    backdrop-blur-md
    overflow-hidden
    glow-pulse
  "
    >

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
