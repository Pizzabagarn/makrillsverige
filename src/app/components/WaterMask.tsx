// src/components/WaterMask.tsx

import { useEffect, useState } from 'react';
import { GeoJSON, useMap } from 'react-leaflet';

export default function WaterMask() {
  const [data, setData] = useState<GeoJSON.FeatureCollection | null>(null);
  const map = useMap();

  useEffect(() => {
    fetch('/data/skandinavien-water.geojson')
      .then((res) => res.json())
      .then(setData);
  }, []);

  useEffect(() => {
    if (!map.getPane('maskPane')) {
      map.createPane('maskPane');
      map.getPane('maskPane')!.style.zIndex = '100'; // 👈 Lägst prioritet
    }
  }, [map]);

  if (!data) return null;

  return (
    <GeoJSON
      data={data}
      pane="maskPane"
      style={{
        fillOpacity: 0, // helt osynlig för nu
        color: 'transparent',
        weight: 0,
      }}
    />
  );
}

