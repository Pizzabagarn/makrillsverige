// src/components/WaterMask.tsx

import { useEffect, useState } from 'react';
import { Source, Layer } from 'react-map-gl/maplibre';
import type { GeoJSON } from 'geojson';

export default function WaterMask() {
  const [data, setData] = useState<GeoJSON.FeatureCollection | null>(null);

  useEffect(() => {
    fetch('/data/skandinavien-water.geojson')
      .then((res) => res.json())
      .then(setData);
  }, []);

  if (!data) return null;

  return (
    <Source id="water-mask" type="geojson" data={data}>
      <Layer
        id="water-mask-layer"
        type="fill"
        paint={{
          'fill-opacity': 0, // helt osynlig för nu
          'fill-color': 'transparent'
        }}
      />
    </Source>
  );
}

