// src/components/CurrentVectorsLayer.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet-polylinedecorator";
import { CurrentVector } from "../api/dmi/current";
import { useTimeSlider } from "../context/TimeSliderContext";

export default function CurrentVectorsLayer() {
  const map = useMap();
  const [vectors, setVectors] = useState<CurrentVector[]>([]);
  const { selectedHour } = useTimeSlider();
  const layerRef = useRef<L.LayerGroup | null>(null);

  // Hämta alla vektorer från backend-cache
  useEffect(() => {
    async function loadAllVectors() {
      try {
        const res = await fetch("/api/dmi/full-grid");
        const data: Record<string, CurrentVector[]> = await res.json();

        const allVectors = Object.values(data).flat();
        setVectors(allVectors);
      } catch (err) {
        console.error("❌ Kunde inte ladda vektorer från /api/dmi/full-grid", err);
      }
    }

    loadAllVectors();
  }, []);

  // Uppdatera vektorpilar baserat på valt timsteg
  useEffect(() => {
    if (vectors.length === 0) return;

    const selectedDateUTC = new Date(Date.now() + selectedHour * 3600 * 1000);
    const layerGroup = L.layerGroup();

    vectors.forEach((vec) => {
      const vecTime = new Date(vec.timestamp);
      const diff = Math.abs(vecTime.getTime() - selectedDateUTC.getTime());

      if (diff > 30 * 60 * 1000) return; // max ±30min

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
            offset: "100%",
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

    // Ta bort gamla pilar
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
    }

    // Lägg till nya pilar och spara referens
    layerGroup.addTo(map);
    layerRef.current = layerGroup;
  }, [vectors, selectedHour, map]);

  return null;
}
