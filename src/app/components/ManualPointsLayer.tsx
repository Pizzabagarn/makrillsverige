'use client';

import React, { useMemo, useEffect } from 'react';
import { Source, Layer, useMap } from 'react-map-gl/maplibre';
import { useManualPoints } from '../context/ManualPointsContext';
import { ManualGridPoint } from '@/lib/points';

interface ManualPointsLayerProps {
  visible?: boolean;
  onPointClick?: (point: ManualGridPoint) => void;
}

const ManualPointsLayer: React.FC<ManualPointsLayerProps> = ({ 
  visible = true,
  onPointClick
}) => {
  const { manualPoints } = useManualPoints();
  const { current: map } = useMap();

  // Create GeoJSON for manual points
  const pointsGeoJSON = useMemo(() => {
    if (!visible || manualPoints.length === 0) return null;

    return {
      type: 'FeatureCollection' as const,
      features: manualPoints.map(point => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [point.lon, point.lat] as [number, number]
        },
        properties: {
          id: point.id,
          name: point.name,
          isManualPoint: true,
          createdAt: point.createdAt
        }
      }))
    };
  }, [manualPoints, visible]);

  // Handle clicks on manual points
  useEffect(() => {
    if (!map || !visible || !onPointClick) return;

    const handlePointClick = (e: maplibregl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: ['manual-points-outer', 'manual-points-inner', 'manual-points-pulse']
      });

      if (features.length > 0) {
        const feature = features[0];
        const pointId = feature.properties?.id;
        
        if (pointId) {
          const point = manualPoints.find(p => p.id === pointId);
          if (point) {
            // Stop event propagation to prevent map click
            e.originalEvent.stopPropagation();
            onPointClick(point);
          }
        }
      }
    };

    map.on('click', handlePointClick);

    return () => {
      map.off('click', handlePointClick);
    };
  }, [map, visible, onPointClick, manualPoints]);

  if (!visible || !pointsGeoJSON) {
    return null;
  }

  return (
    <Source
      id="manual-points-source"
      type="geojson"
      data={pointsGeoJSON}
    >
      {/* Outer ring for visibility */}
      <Layer
        id="manual-points-outer"
        type="circle"
        paint={{
          'circle-radius': 8,
          'circle-color': '#ffffff',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#f97316', // orange-500
          'circle-opacity': 0.9
        }}
      />
      
      {/* Inner point */}
      <Layer
        id="manual-points-inner"
        type="circle"
        paint={{
          'circle-radius': 4,
          'circle-color': '#f97316', // orange-500
          'circle-opacity': 1
        }}
      />
      
      {/* Pulse animation layer */}
      <Layer
        id="manual-points-pulse"
        type="circle"
        paint={{
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            6, 12,
            12, 20
          ],
          'circle-color': '#f97316', // orange-500
          'circle-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            6, 0.3,
            12, 0.1
          ],
          'circle-stroke-width': 0
        }}
      />
    </Source>
  );
};

export default ManualPointsLayer; 