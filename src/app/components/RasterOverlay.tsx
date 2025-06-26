'use client';

import React, { useRef, useEffect, useState } from 'react';
import { Map } from 'maplibre-gl';

interface RasterData {
  lat: number;
  lon: number;
  value: number;
}

interface RasterOverlayProps {
  map: Map | null;
  data: RasterData[];
  parameter: 'temperature' | 'currentSpeed' | 'salinity';
  opacity?: number;
  minValue?: number;
  maxValue?: number;
}

interface ColorScale {
  min: number;
  max: number;
  colors: string[];
  labels: string[];
}

const COLOR_SCALES: Record<string, ColorScale> = {
  temperature: {
    min: -2,
    max: 25,
    colors: ['#0000ff', '#00ffff', '#00ff00', '#ffff00', '#ff8000', '#ff0000'],
    labels: ['-2°C', '5°C', '10°C', '15°C', '20°C', '25°C']
  },
  currentSpeed: {
    min: 0,
    max: 2,
    colors: ['#000080', '#0080ff', '#00ff80', '#ffff00', '#ff8000', '#ff0000'],
    labels: ['0 m/s', '0.4 m/s', '0.8 m/s', '1.2 m/s', '1.6 m/s', '2.0 m/s']
  },
  salinity: {
    min: 20,
    max: 35,
    colors: ['#ff0000', '#ff8000', '#ffff00', '#80ff00', '#00ff00', '#00ff80'],
    labels: ['20 psu', '23 psu', '26 psu', '29 psu', '32 psu', '35 psu']
  }
};

/**
 * Färgfunktion enligt guidens specifikation
 * Implementerar linjär interpolation mellan färger i en given skala
 */
function valueToColor(value: number | null, scale: ColorScale): string {
  if (value == null || isNaN(value)) {
    return 'rgba(0,0,0,0)'; // Transparent för saknade värden (t.ex. land)
  }
  
  const { min, max, colors } = scale;
  const normalizedValue = Math.max(0, Math.min(1, (value - min) / (max - min)));
  
  // Hitta rätt färgintervall
  const colorIndex = normalizedValue * (colors.length - 1);
  const lowerIndex = Math.floor(colorIndex);
  const upperIndex = Math.ceil(colorIndex);
  
  if (lowerIndex === upperIndex) {
    return colors[lowerIndex];
  }
  
  // Interpolera mellan två färger
  const t = colorIndex - lowerIndex;
  const color1 = hexToRgb(colors[lowerIndex]);
  const color2 = hexToRgb(colors[upperIndex]);
  
  if (!color1 || !color2) return colors[lowerIndex];
  
  const r = Math.round(color1.r + (color2.r - color1.r) * t);
  const g = Math.round(color1.g + (color2.g - color1.g) * t);
  const b = Math.round(color1.b + (color2.b - color1.b) * t);
  
  return `rgb(${r},${g},${b})`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

/**
 * Skapa canvas-baserat rasterlager enligt guidens metod
 * Implementerar spatial interpolation för att fylla rutnätet
 */
function createRasterCanvas(
  data: RasterData[],
  bounds: { minLon: number; maxLon: number; minLat: number; maxLat: number },
  resolution: { width: number; height: number },
  scale: ColorScale
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = resolution.width;
  canvas.height = resolution.height;
  const ctx = canvas.getContext('2d');
  
  if (!ctx) throw new Error('Could not get canvas context');
  
  // Skapa en spatial index för snabb lookup
  const gridSize = Math.max(resolution.width, resolution.height) / 50;
  const spatialIndex: Record<string, RasterData[]> = {};
  
  data.forEach((point: RasterData) => {
    const gridX = Math.floor((point.lon - bounds.minLon) / (bounds.maxLon - bounds.minLon) * gridSize);
    const gridY = Math.floor((point.lat - bounds.minLat) / (bounds.maxLat - bounds.minLat) * gridSize);
    const key = `${gridX},${gridY}`;
    
    if (!spatialIndex[key]) {
      spatialIndex[key] = [];
    }
    spatialIndex[key].push(point);
  });
  
  // Rita raster pixel för pixel enligt guiden
  for (let y = 0; y < resolution.height; y++) {
    for (let x = 0; x < resolution.width; x++) {
      const lon = bounds.minLon + (x / resolution.width) * (bounds.maxLon - bounds.minLon);
      const lat = bounds.maxLat - (y / resolution.height) * (bounds.maxLat - bounds.minLat);
      
      // Hitta närmaste datapunkt (enkel spatial interpolation)
      let nearestValue: number | null = null;
      let minDistance = Infinity;
      
      // Kolla närliggande grid-celler
      const gridX = Math.floor((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon) * gridSize);
      const gridY = Math.floor((lat - bounds.minLat) / (bounds.maxLat - bounds.minLat) * gridSize);
      
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const key = `${gridX + dx},${gridY + dy}`;
          const points = spatialIndex[key] || [];
          
          points.forEach((point: RasterData) => {
            const distance = Math.sqrt(
              Math.pow(point.lon - lon, 2) + Math.pow(point.lat - lat, 2)
            );
            
            if (distance < minDistance) {
              minDistance = distance;
              nearestValue = point.value;
            }
          });
        }
      }
      
      // Fallback till global sökning om inget hittas lokalt
      if (nearestValue === null && data.length > 0) {
        data.forEach(point => {
          const distance = Math.sqrt(
            Math.pow(point.lon - lon, 2) + Math.pow(point.lat - lat, 2)
          );
          
          if (distance < minDistance) {
            minDistance = distance;
            nearestValue = point.value;
          }
        });
      }
      
      const color = valueToColor(nearestValue, scale);
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  
  return canvas;
}

export default function RasterOverlay({
  map,
  data,
  parameter,
  opacity = 0.7,
  minValue,
  maxValue
}: RasterOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceId = `raster-${parameter}`;
  const layerId = `raster-layer-${parameter}`;
  
  useEffect(() => {
    if (!map || !data.length) return;
    
    // Beräkna data bounds
    const lons = data.map(d => d.lon);
    const lats = data.map(d => d.lat);
    const bounds = {
      minLon: Math.min(...lons),
      maxLon: Math.max(...lons),
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats)
    };
    
    // Justera färgskala om anpassade värden ges
    const scale = { ...COLOR_SCALES[parameter] };
    if (minValue !== undefined) scale.min = minValue;
    if (maxValue !== undefined) scale.max = maxValue;
    
    try {
      // Skapa canvas enligt guidens metod
      const canvas = createRasterCanvas(
        data,
        bounds,
        { width: 200, height: 150 }, // Måttlig upplösning för prestanda
        scale
      );
      
      canvasRef.current = canvas;
      
      // Ta bort befintligt lager om det finns
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
      if (map.getSource(sourceId)) {
        map.removeSource(sourceId);
      }
      
      // Lägg till canvas-källa enligt guiden
      map.addSource(sourceId, {
        type: 'canvas',
        canvas: canvas,
        coordinates: [
          [bounds.minLon, bounds.maxLat], // nordväst
          [bounds.maxLon, bounds.maxLat], // nordöst  
          [bounds.maxLon, bounds.minLat], // sydöst
          [bounds.minLon, bounds.minLat]  // sydväst
        ],
        animate: false
      });
      
      // Lägg till rasterlager
      map.addLayer({
        id: layerId,
        type: 'raster',
        source: sourceId,
        paint: {
          'raster-opacity': opacity
        }
      });
      
      console.log(`🎨 Added raster layer for ${parameter}: ${data.length} points`);
      
    } catch (error) {
      console.error(`Failed to create raster overlay for ${parameter}:`, error);
    }
    
    // Cleanup funktion
    return () => {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
      if (map.getSource(sourceId)) {
        map.removeSource(sourceId);
      }
    };
  }, [map, data, parameter, opacity, minValue, maxValue, layerId, sourceId]);
  
  return null; // Denna komponent renderar direkt på kartan
}

// Export av hjälpfunktioner för användning i legend
export { COLOR_SCALES, valueToColor }; 