// src/components/CurrentMagnitudeHeatmap.tsx
'use client';

import { useEffect, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';
import { useTimeSlider } from '../context/TimeSliderContext';
import type { FeatureCollection } from 'geojson';

interface Vector {
  u: number;
  v: number;
  time: string;
}

interface GridPoint {
  lat: number;
  lon: number;
  vectors: Vector[];
}

export default function CurrentMagnitudeHeatmap() {
  const map = useMap();
  const { selectedHour } = useTimeSlider();

  const [mask, setMask] = useState<FeatureCollection | null>(null);
  const [grid, setGrid] = useState<GridPoint[]>([]);
  const [heatLayer, setHeatLayer] = useState<any>(null);

  // 1) Ladda vattenmask-GeoJSON
  useEffect(() => {
    fetch('/data/skandinavien-water.geojson')
      .then((r) => r.json())
      .then(setMask)
      .catch(console.error);
  }, []);

  // 2) Ladda din precomputed grid
  useEffect(() => {
    fetch('/data/precomputed-grid.json')
      .then((r) => r.json())
      .then(setGrid)
      .catch(console.error);
  }, []);

  // 3) Vid förändrat selectedHour / då både mask+grid finns: (re)rita heatmap
  useEffect(() => {
    if (!map || !mask || !grid.length) return;

    // Se till att vi har en egen heat-pane
    if (!map.getPane('heatPane')) {
      map.createPane('heatPane');
      map.getPane('heatPane')!.style.zIndex = '410';
    }

    // Plocka ut rätt timestamp (YYYY-MM-DDTHH)
    const ts = new Date(Date.now() + selectedHour * 3600_000)
      .toISOString()
      .slice(0, 13);

    // Bygg av points: [lat, lon, vikt]
    const points: [number, number, number][] = [];
    grid.forEach(({ lat, lon, vectors }) => {
      const v = vectors.find((v) => v.time.startsWith(ts));
      if (v && v.u != null && v.v != null) {
        const mag = Math.sqrt(v.u * v.u + v.v * v.v);
        const norm = Math.min(mag / 0.7, 1);  // normalisera mot max 0.7 m/s
        points.push([lat, lon, norm]);
      }
    });

    // Ta bort tidigare layer
    if (heatLayer) map.removeLayer(heatLayer);

    // Skapa nytt heatLayer
    const heat = (L as any).heatLayer(points, {
      radius: 25,
      blur: 15,
      maxZoom: 10,
      pane: 'heatPane',
      gradient: {
        0.0: '#0000ff',
        0.3: '#00ffff',
        0.5: '#00ff00',
        0.7: '#ffff00',
        1.0: '#ff0000',
      },
    });

    // Clip: begränsa ritningen till polygonerna i masken
    heat.on('prerender', (e: any) => {
      const ctx: CanvasRenderingContext2D = e.layer._canvas.getContext('2d');
      ctx.save();
      ctx.beginPath();

      mask.features.forEach((feat) => {
        const coordsArr = (feat.geometry as any).coordinates as number[][][];
        coordsArr.forEach((ring) => {
          ring.forEach(([lon, lat]) => {
            const p = map.latLngToContainerPoint([lat, lon]);
            ctx.lineTo(p.x, p.y);
          });
          ctx.closePath();
        });
      });

      ctx.clip();
    });
    heat.on('postrender', (e: any) => {
      e.layer._canvas.getContext('2d')!.restore();
    });

    // Lägg på kartan och spara referens
    heat.addTo(map);
    setHeatLayer(heat);
  }, [map, mask, grid, selectedHour]);

  return null;
}
