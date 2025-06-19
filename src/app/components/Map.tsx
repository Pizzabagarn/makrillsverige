// src/components/Map.tsx

'use client';

import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import CurrentVectorsLayer from './CurrentVectorsLayer';
import WaterMask from './WaterMask';
import CurrentMagnitudeHeatmap from './CurrentMagnitudeHeatmap';

export default function MapView() {
  const position: [number, number] = [55.65, 12.85];

  return (
    <div className="h-[600px] w-full rounded-lg overflow-hidden shadow-lg mt-6">
      <MapContainer
        center={position}
        zoom={8.5}
        scrollWheelZoom={true}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; Esri, Maxar, Earthstar Geographics'
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        />

        <WaterMask />            {/* Lägg mask först */}
        <CurrentVectorsLayer />  {/* Pilar ovanpå */}

      </MapContainer>
    </div>
  );
}
