// src/components/CurrentVectorsLayer.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useMap, useMapEvent } from "react-leaflet";
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

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function CurrentVectorsLayer() {
  const map = useMap();
  const { selectedHour } = useTimeSlider();
  const [precomputedData, setPrecomputedData] = useState<GridPoint[]>([]);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const [zoomLevel, setZoomLevel] = useState(map.getZoom());

  // Ladda vektordata från statisk JSON
  useEffect(() => {
    fetch("/data/precomputed-grid.json")
      .then((res) => res.json())
      .then((data) => setPrecomputedData(data))
      .catch((err) => {
        console.error("❌ Kunde inte läsa precomputed-grid.json", err);
      });
  }, []);

  // Uppdatera zoom vid zoom event
  useMapEvent("zoomend", () => {
    setZoomLevel(map.getZoom());
  });

  // Rendera pilar
  useEffect(() => {
    if (precomputedData.length === 0) return;

    const selectedTime = new Date(Date.now() + selectedHour * 3600 * 1000)
      .toISOString()
      .slice(0, 13); // YYYY-MM-DDTHH

    const layerGroup = L.layerGroup();

    // Avståndskrav i km beroende på zoomnivå
    const minDistKm = zoomLevel < 5 ? 50 : zoomLevel < 6 ? 35 : zoomLevel < 7 ? 25 : zoomLevel < 8 ? 15 : zoomLevel < 9 ? 8 : zoomLevel < 10 ? 4 : 0;

    const renderedPoints: L.LatLng[] = [];

    for (const point of precomputedData) {
      const { lat, lon } = point;
      const thisPoint = L.latLng(lat, lon);

      const tooClose = renderedPoints.some(p => haversineDistance(p.lat, p.lng, lat, lon) < minDistKm);
      if (tooClose) continue;

      renderedPoints.push(thisPoint);

      const vector = point.vectors.find((v) => v.time.startsWith(selectedTime));
      if (!vector || vector.u == null || vector.v == null) continue;

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
    }

    if (layerRef.current) {
      map.removeLayer(layerRef.current);
    }

    console.log("🎯 Pilar renderade:", layerGroup.getLayers().length / 2);
    layerGroup.addTo(map);
    layerRef.current = layerGroup;
  }, [precomputedData, selectedHour, zoomLevel, map]);

  return null;
}
