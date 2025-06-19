// src/components/CurrentVectorsLayer.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useMap, useMapEvent } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-polylinedecorator';
import chroma from 'chroma-js';
import { useTimeSlider } from '../context/TimeSliderContext';

interface CurrentVector { u: number; v: number; time: string }
interface GridPoint      { lat: number; lon: number; vectors: CurrentVector[] }

// Beräkna avstånd (km)
function haversineDistance(lat1:number,lon1:number,lat2:number,lon2:number) {
  const R=6371, toRad=(d:number)=>(d*Math.PI)/180;
  const dLat=toRad(lat2-lat1), dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2
          +Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

export default function CurrentVectorsLayer() {
  const map = useMap();
  const { selectedHour } = useTimeSlider();
  const [gridData, setGridData] = useState<GridPoint[]>([]);
  const layerRef = useRef<L.LayerGroup|null>(null);
  const [zoomLevel, setZoomLevel] = useState(map.getZoom());

  // 1) Ladda förberäknad grid
  useEffect(() => {
    fetch('/data/precomputed-grid.json')
      .then(r => r.json())
      .then(setGridData)
      .catch(console.error);
  }, []);

  // 2) Track zoom
  useMapEvent('zoomend', () => {
    setZoomLevel(map.getZoom());
  });

  // 3) Se till att vectorPane finns
  useEffect(() => {
    if (!map.getPane('vectorPane')) {
      map.createPane('vectorPane').style.zIndex = '420';
    }
  }, [map]);

  // 4) Rendera pilar med glow + huvud
  useEffect(() => {
    if (!gridData.length) return;

    // Rensa gamla
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
    }
    const group = L.layerGroup([], { pane: 'vectorPane' });

    // Skala 0–0.7 m/s blå→röd
    const scale = chroma
      .scale(['#0000ff','#00ffff','#00ff00','#ffff00','#ff0000'])
      .domain([0,0.7]);

    const tsPrefix = new Date(Date.now()+selectedHour*3600_000)
      .toISOString().slice(0,13);

    // Seed-avstånd
    const minD = zoomLevel<5?50:
                 zoomLevel<6?35:
                 zoomLevel<7?25:
                 zoomLevel<8?15:
                 zoomLevel<9?8:4;

    const used: L.LatLng[] = [];

    for (const pt of gridData) {
      // Täthet
      if (used.some(u=>haversineDistance(u.lat,u.lng,pt.lat,pt.lon)<minD)) continue;
      used.push(L.latLng(pt.lat,pt.lon));

      const v = pt.vectors.find(v=>v.time.startsWith(tsPrefix));
      if (!v||v.u==null||v.v==null) continue;

      const mag = Math.hypot(v.u,v.v);
      if (mag < 0.01) continue;
      const color = scale(mag).hex();

      // Linjens slutpunkt
      const len = 0.05;
      const lat2 = pt.lat + len * v.v;
      const lon2 = pt.lon + len * v.u;

      // 1) Glow-linje (tjock & låg opacity)
      const glow = L.polyline(
        [[pt.lat,pt.lon],[lat2,lon2]],
        { pane:'vectorPane', color, weight:6, opacity:0.3 }
      );
      group.addLayer(glow);

      // 2) Huvudlinje
      const line = L.polyline(
        [[pt.lat,pt.lon],[lat2,lon2]],
        { pane:'vectorPane', color, weight:2, opacity:1 }
      );
      group.addLayer(line);

      // 3) Pilhuvud med decorator
      const decorator = (L as any).polylineDecorator(line, {
        pane: 'vectorPane',
        patterns: [{
          offset: '100%',
          repeat: 0,
          symbol: (L as any).Symbol.arrowHead({
            pixelSize: 8,
            polygon: true,
            pathOptions: {
              fill: true,
              fillColor: color,
              fillOpacity: 1,
              stroke: false
            }
          })
        }]
      });
      group.addLayer(decorator);
    }

    group.addTo(map);
    layerRef.current = group;
  }, [map,gridData,selectedHour,zoomLevel]);

  return null;
}
