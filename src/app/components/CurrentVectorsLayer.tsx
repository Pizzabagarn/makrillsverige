// src/components/CurrentVectorsLayer.tsx
'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useMap } from 'react-map-gl/maplibre';
import { Source, Layer } from 'react-map-gl/maplibre';
import React from 'react';
import chroma from 'chroma-js';
import { useTimeSlider } from '../context/TimeSliderContext';
import type { GeoJSON } from 'geojson';

interface CurrentVector { u: number; v: number; time: string }
interface GridPoint { lat: number; lon: number; vectors: CurrentVector[] }

// Calculate rotation angle from u,v components
function calculateRotation(u: number, v: number): number {
  const angleRad = Math.atan2(v, u);
  const angleDeg = (angleRad * 180) / Math.PI;
  return (90 - angleDeg) % 360;
}

interface CurrentVectorsLayerProps {
  visible?: boolean;
}

const CurrentVectorsLayer = React.memo<CurrentVectorsLayerProps>(({ 
  visible = true 
}) => {
  console.log('🏹 CurrentVectorsLayer render with visible:', visible);
  
  const { current: map } = useMap();
  const { selectedHour, baseTime } = useTimeSlider();
  
  const [arrowImageLoaded, setArrowImageLoaded] = useState(false);
  const [gridData, setGridData] = useState<GridPoint[]>([]);
  const [arrowsGeoJSON, setArrowsGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);
  
  // Simple color scale
  const colorScale = useMemo(() => {
    return chroma.scale(['#0000ff','#00ffff','#00ff00','#ffff00','#ff0000']).domain([0,0.7]);
  }, []);

  // Current timestamp
  const timestampPrefix = useMemo(() => {
    if (!baseTime) return '';
    return new Date(baseTime + selectedHour * 3600_000).toISOString().slice(0, 13);
  }, [selectedHour, baseTime]);

  // Load grid data
  useEffect(() => {
    const loadGridData = async () => {
      try {
        const response = await fetch('/api/area-parameters');
        if (!response.ok) return;
        
        const data = await response.json();
        if (data.points) {
          const gridPoints: GridPoint[] = data.points.map((point: any) => ({
            lat: point.lat,
            lon: point.lon,
            vectors: point.data ? point.data.map((timeData: any) => ({
              time: timeData.time,
              u: timeData.current?.u || null,
              v: timeData.current?.v || null
            })).filter((v: any) => v.u !== null && v.v !== null) : []
          }));
          
          setGridData(gridPoints);
          console.log(`✅ Grid data loaded: ${gridPoints.length} points`);
        }
      } catch (error) {
        console.error('❌ Could not load grid data:', error);
      }
    };
    
    loadGridData();
  }, []);

  // Load arrow image
  useEffect(() => {
    if (!map) return;
    
    const loadArrowImage = async () => {
      try {
        const response = await fetch('/images/arrow.png');
        const blob = await response.blob();
        const imageUrl = URL.createObjectURL(blob);
        
        const img = new Image();
        img.onload = () => {
          if (!map.hasImage('arrow')) {
            map.addImage('arrow', img);
            setArrowImageLoaded(true);
          }
          URL.revokeObjectURL(imageUrl);
        };
        img.src = imageUrl;
      } catch (error) {
        console.error('Failed to load arrow image:', error);
      }
    };
    
    loadArrowImage();
  }, [map]);

  // Generate arrows - SIMPLE, NO CACHING
  useEffect(() => {
    if (!gridData.length || !timestampPrefix || !visible) {
      setArrowsGeoJSON(null);
      return;
    }

    console.log('🔄 Generating arrows for timestamp:', timestampPrefix, 'visible:', visible);
    
    const arrowsFeatures: GeoJSON.Feature[] = [];
    
    for (const pt of gridData) {
      const v = pt.vectors.find(v => v.time.startsWith(timestampPrefix));
      if (!v || v.u == null || v.v == null) continue;

      const mag = Math.hypot(v.u, v.v);
      if (mag < 0.01) continue;
      
      const color = colorScale(mag).toString();
      const rotation = calculateRotation(v.u, v.v);
      
      const arrowFeature: GeoJSON.Feature = {
        type: 'Feature',
        properties: {
          color: color,
          magnitude: mag,
          opacity: 1,
          rotation: rotation,
          size: 0.03
        },
        geometry: {
          type: 'Point',
          coordinates: [pt.lon, pt.lat]
        }
      };
      arrowsFeatures.push(arrowFeature);
    }

    const geoJSON = {
      type: 'FeatureCollection' as const,
      features: arrowsFeatures
    };

    setArrowsGeoJSON(geoJSON);
    console.log('✅ Generated', arrowsFeatures.length, 'arrows');

  }, [gridData, timestampPrefix, visible, colorScale]);

  // Don't render anything if not visible or no data
  if (!visible || !arrowsGeoJSON || !arrowImageLoaded) {
    console.log('🚫 Not rendering arrows:', { visible, hasGeoJSON: !!arrowsGeoJSON, arrowImageLoaded });
    return null;
  }

  console.log('✅ Rendering', arrowsGeoJSON.features.length, 'arrows');

  return (
    <>
      <Source id="current-arrows" type="geojson" data={arrowsGeoJSON}>
        <Layer
          id="current-arrows-layer"
          type="symbol"
          layout={{
            'icon-image': 'arrow',
            'icon-size': ['get', 'size'],
            'icon-rotate': ['get', 'rotation'],
            'icon-rotation-alignment': 'map',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true
          }}
          paint={{
            'icon-color': ['get', 'color'],
            'icon-opacity': ['get', 'opacity']
          }}
        />
      </Source>
    </>
  );
});

CurrentVectorsLayer.displayName = 'CurrentVectorsLayer';

export default CurrentVectorsLayer;
