// src/components/CurrentVectorsLayer.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet-polylinedecorator";
import { useTimeSlider } from "../context/TimeSliderContext";

// Typdefinitioner
interface CurrentVector {
  u: number;
  v: number;
  time: string;
}

interface GridPoint {
  lat: number;
  lon: number;
  vectors: CurrentVector[];
}

export default function CurrentVectorsLayer() {
  const map = useMap();
  const { selectedHour } = useTimeSlider();
  const [precomputedData, setPrecomputedData] = useState<GridPoint[]>([]);
  const layerRef = useRef<L.LayerGroup | null>(null);

  // Ladda vektordata från statisk JSON
  useEffect(() => {
    fetch("/data/precomputed-grid.json")
      .then((res) => res.json())
      .then((data) => setPrecomputedData(data))
      .catch((err) => {
        console.error("❌ Kunde inte läsa precomputed-grid.json", err);
      });
  }, []);

  // Rendera pilar
  useEffect(() => {
    if (precomputedData.length === 0) return;

    const selectedTime = new Date(Date.now() + selectedHour * 3600 * 1000)
      .toISOString()
      .slice(0, 13); // YYYY-MM-DDTHH

    const layerGroup = L.layerGroup();

    precomputedData.forEach((point) => {
      const vector = point.vectors.find((v) => v.time.startsWith(selectedTime));
      if (!vector || vector.u == null || vector.v == null) return;

      const { lat, lon } = point;
      const { u, v } = vector;

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

    if (layerRef.current) {
      map.removeLayer(layerRef.current);
    }

    console.log("🎯 Pilar renderade:", layerGroup.getLayers().length / 2);
    layerGroup.addTo(map);
    layerRef.current = layerGroup;
  }, [precomputedData, selectedHour, map]);

  return null;
}
