// src/components/CurrentVectorsLayer.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet-polylinedecorator";
import { fetchCurrentVectors, CurrentVector } from "../api/dmi/current";
import { useTimeSlider } from "../context/TimeSliderContext";

// Lokal cache: nyckel är t.ex. "55.75,12.60"
const vectorCache = new Map<string, CurrentVector[]>();

// Retry + delay
async function fetchWithRetry(lat: number, lon: number, retries = 3, delayMs = 1000): Promise<CurrentVector[]> {
  try {
    const res = await fetchCurrentVectors(lat, lon);
    return res;
  } catch (err: any) {
    if (retries > 0 && err.message?.includes("429")) {
      console.warn(`⏳ Rate limit - väntar ${delayMs}ms (${retries} försök kvar)...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return fetchWithRetry(lat, lon, retries - 1, delayMs * 2);
    }
    console.error(`❌ Misslyckades (${lat}, ${lon})`, err);
    return [];
  }
}

// Cachelager
async function fetchWithCache(lat: number, lon: number): Promise<CurrentVector[]> {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  if (vectorCache.has(key)) return vectorCache.get(key)!;

  const data = await fetchWithRetry(lat, lon);
  vectorCache.set(key, data);
  return data;
}

export default function CurrentVectorsLayer() {
  const map = useMap();
  const [vectors, setVectors] = useState<CurrentVector[]>([]);
  const { selectedHour } = useTimeSlider();
  const layerRef = useRef<L.LayerGroup | null>(null); // 👈 viktig för att slippa rensa hela tiden

  // Init: Hämta alla punkters data och lagra
  useEffect(() => {
    const points = [
      { lat: 55.65, lon: 12.85 },
      { lat: 55.65, lon: 12.90 },
      
    ];

    Promise.all(points.map(p => fetchWithCache(p.lat, p.lon)))
      .then(results => {
        setVectors(results.flat());
      });
  }, [map]);

  // När timme ändras: Visa nya pilar
  useEffect(() => {
    if (vectors.length === 0) return;

    const now = new Date();
    const selectedDateUTC = new Date(now.getTime() + selectedHour * 3600 * 1000);

    const layerGroup = L.layerGroup();

    vectors.forEach(vec => {
      const vecTime = new Date(vec.timestamp);
      const diff = Math.abs(vecTime.getTime() - selectedDateUTC.getTime());
      if (diff > 30 * 60 * 1000) return;

      const { lat, lon, u, v } = vec;

      const length = 0.05;
      const endLat = lat + length * v;
      const endLng = lon + length * u;

      const start = L.latLng(lat, lon);
      const end = L.latLng(endLat, endLng);

      const arrowLine = L.polyline([start, end], {
        color: "#00f",
        weight: 2,
        opacity: 0.8,
      });

      const decorator = (L as any).polylineDecorator(arrowLine, {
        patterns: [
          {
            offset: '100%',
            repeat: 0,
            symbol: (L as any).Symbol.arrowHead({
              pixelSize: 10,
              polygon: false,
              pathOptions: { stroke: true, color: "#00f" },
            }),
          },
        ],
      });

      layerGroup.addLayer(arrowLine);
      layerGroup.addLayer(decorator);
    });

    // Ta bort gamla pilar om de finns
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
    }

    // Lägg till nya pilar och spara ref
    layerGroup.addTo(map);
    layerRef.current = layerGroup;

  }, [vectors, selectedHour, map]);

  return null;
}
