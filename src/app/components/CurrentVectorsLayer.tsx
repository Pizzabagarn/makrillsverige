// src/components/CurrentVectorsLayer.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useMap, useMapEvent } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-polylinedecorator';
import 'leaflet-curve';                 // Läs in plugin
import chroma from 'chroma-js';
import { useTimeSlider } from '../context/TimeSliderContext';

interface CurrentVector { u: number; v: number; time: string }
interface GridPoint      { lat: number; lon: number; vectors: CurrentVector[] }

// Haversine i km
function haversine(lat1:number, lon1:number, lat2:number, lon2:number) {
  const R = 6371, toRad = (d:number)=>(d*Math.PI)/180;
  const dLat = toRad(lat2-lat1), dLon=toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 +
    Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Meter → grad
const m2lat = (m:number)=> m/111320;
const m2lon = (m:number,lat:number)=> m/(111320*Math.cos(lat*Math.PI/180));

export default function CurrentVectorsLayer() {
  const map = useMap();
  const { selectedHour } = useTimeSlider();
  const [grid, setGrid] = useState<GridPoint[]>([]);
  const layerRef = useRef<L.LayerGroup|null>(null);
  const [zoom, setZoom] = useState(map.getZoom());

  // 1) Ladda grid
  useEffect(() => {
    fetch('/data/precomputed-grid.json')
      .then(r=>r.json())
      .then(setGrid)
      .catch(console.error);
  }, []);

  // 2) Track zoom
  useMapEvent('zoomend', ()=> setZoom(map.getZoom()));

  // 3) Rendera blojda pilar
  useEffect(() => {
    if (!grid.length) return;

    // ta bort ev. heat-layer om du vill:
    map.eachLayer((lyr:any) => {
      if (lyr.options?.pane==='heatPane') map.removeLayer(lyr);
    });

    // create or reuse vectorPane
    if (!map.getPane('vectorPane')) {
      map.createPane('vectorPane').style.zIndex='420';
    }
    // ta bort gammalt
    if (layerRef.current) map.removeLayer(layerRef.current);
    const group = L.layerGroup([], { pane: 'vectorPane' });

    // färgskala
    const scale = chroma
      .scale(['#0000ff','#00ffff','#00ff00','#ffff00','#ff0000'])
      .domain([0,1]);

    // tidsprefix
    const ts = new Date(Date.now()+selectedHour*3600_000)
      .toISOString().slice(0,13);

    // avståndskrav beroende på zoom
    const minD = zoom<5?50:zoom<6?35:zoom<7?25:zoom<8?15:zoom<9?8:4;
    const used: L.LatLng[] = [];

    grid.forEach(pt => {
      const v = pt.vectors.find(v=>v.time.startsWith(ts));
      if (!v||v.u==null||v.v==null) return;

      // dämpa seed
      if (used.some(u=>haversine(u.lat,u.lng,pt.lat,pt.lon)<minD))
        return;
      used.push(L.latLng(pt.lat,pt.lon));

      const mag = Math.hypot(v.u,v.v);
      if (mag<0.05) return;
      const norm = Math.min(mag/0.7,1);
      const color = scale(norm).hex();

      // integrera en lätt kurva
      const steps = 6, dt = 600; // 10min/steg
      let [lat,lon] = [pt.lat,pt.lon];
      const coords: [number,number][] = [[lat,lon]];
      for (let i=0;i<steps;i++){
        lat += m2lat(v.v*dt);
        lon += m2lon(v.u*dt, lat);
        coords.push([lat,lon]);
      }
      if (coords.length<2) return;

      // rita Bézier‐kurva via leaflet-curve
      const path: any[] = ['M', coords[0]];
      for (let i=1;i<coords.length;i++){
        const c0=coords[i-1], c1=coords[i];
        // enkel Q‐kontrollpunkt mitt emellan, höjt lite i lat:
        const mid: [number,number] = [
          (c0[0]+c1[0])/2 + 0.01,
          (c0[1]+c1[1])/2
        ];
        path.push('Q', mid, c1);
      }
      const curve = (L as any).curve(path, {
        color, weight:2, opacity:0.8, pane:'vectorPane'
      });
      group.addLayer(curve);

      // dekorera med pilhuvud längst ut
      const deco = (L as any).polylineDecorator(curve, {
        patterns:[{ offset:'100%',repeat:0,
          symbol:(L as any).Symbol.arrowHead({
            pixelSize:8,
            pathOptions:{color,fillOpacity:1,stroke:false}
          })
        }]
      });
      group.addLayer(deco);
    });

    group.addTo(map);
    layerRef.current = group;
  }, [map,grid,selectedHour,zoom]);

  return null;
}
