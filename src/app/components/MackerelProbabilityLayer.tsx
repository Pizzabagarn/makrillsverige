'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useMap } from 'react-map-gl/maplibre';
import { Source, Layer } from 'react-map-gl/maplibre';
import React from 'react';
import { useTimeSlider } from '../context/TimeSliderContext';
import { useHeavyThrottle, useDraggingDetection } from '../../lib/throttleHooks';
import type { GeoJSON } from 'geojson';
import CanvasSource from './CanvasSource';

interface MackerelProbabilityMetadata {
  parameter: string;
  generated_at: string;
  resolution: string;
  wgs84_bbox?: [number, number, number, number]; // [lon_min, lon_max, lat_min, lat_max] - nytt format
  bbox?: [number, number, number, number]; // [lon_min, lon_max, lat_min, lat_max] - gammalt format
  mercator_bbox?: [number, number, number, number];
  projection?: string;
  unit?: string;
  range?: [number, number];
  colormap?: Array<[number, string]>;
  total_images: number;
  timestamps?: string[]; // Gammalt format
  images?: Array<{ // Nytt format
    timestamp: string;
    filename: string;
    data_points?: number;
    value_range?: [number, number];
    mercator_coordinates?: [[number, number], [number, number], [number, number], [number, number]];
  }>;
}

interface HotspotData {
  longitude: number;
  latitude: number;
  value: number;
  timestamp: string;
}

interface MackerelProbabilityLayerProps {
  visible?: boolean;
  opacity?: number;
}

const MackerelProbabilityLayer = React.memo<MackerelProbabilityLayerProps>(({ 
  visible = true, 
  opacity = 0.8 
}) => {
  const { current: map } = useMap();
  const { selectedHour, displayHour, baseTime } = useTimeSlider();
  
  // Detect if user is actively dragging
  const isDragging = useDraggingDetection(selectedHour);
  
  // Much faster throttling for smooth simulation effect - same as other layers
  const lightThrottledHour = useHeavyThrottle(displayHour, 10);   // Very fast when not dragging
  const heavyThrottledHour = useHeavyThrottle(displayHour, 50);   // Still fast when dragging
  const effectiveSelectedHour = isDragging ? heavyThrottledHour : lightThrottledHour;
  
  const [metadata, setMetadata] = useState<MackerelProbabilityMetadata | null>(null);
  const [hotspotData, setHotspotData] = useState<HotspotData[]>([]);
  const [hotspotGeoJSON, setHotspotGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);

  // Load metadata
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const response = await fetch('/data/mackerel-probability-images-mercator/metadata.json');
        
        if (!response.ok) {
          return;
        }
        
        const data = await response.json();
        setMetadata(data);
        
      } catch (error) {
        // Silent error handling
      }
    };
    
    loadMetadata();
  }, []);

  // Load hotspot data
  useEffect(() => {
    const loadHotspotData = async () => {
      try {
        const response = await fetch('/data/mackerel-probability-images-mercator/hotspot-data.json');
        
        if (!response.ok) {
          return;
        }
        
        const data = await response.json();
        setHotspotData(data.hotspots || []);
        
      } catch (error) {
        // Silent error handling
      }
    };
    
    loadHotspotData();
  }, []);

  // Timestamp prefix for current time - USE SAME LOGIC AS OTHER LAYERS
  const timestampPrefix = useMemo(() => {
    if (!baseTime) return '';
    return new Date(baseTime + displayHour * 3600_000).toISOString().slice(0, 13);
  }, [displayHour, baseTime]);

  // Update hotspot GeoJSON when time changes
  useEffect(() => {
    if (!hotspotData || hotspotData.length === 0 || !timestampPrefix) {
      setHotspotGeoJSON(null);
      return;
    }
    
    // Filter hotspots for current time
    const currentHotspots = hotspotData.filter(hotspot => 
      hotspot.timestamp.startsWith(timestampPrefix)
    );
    
    if (currentHotspots.length === 0) {
      setHotspotGeoJSON(null);
      return;
    }
    
    // Create GeoJSON for hotspots
    const geoJSON: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: currentHotspots.map(hotspot => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [hotspot.longitude, hotspot.latitude]
        },
        properties: {
          text: `${(hotspot.value * 100).toFixed(0)}%`,
          textSize: 14,
          textColor: '#FFFFFF',
          textHaloColor: '#000000',
          textHaloWidth: 2
        }
      }))
    };
    
    setHotspotGeoJSON(geoJSON);
  }, [hotspotData, timestampPrefix]);

  // Force hotspot text to render above arrows
  useEffect(() => {
    if (!map || !hotspotGeoJSON || !visible) return;
    
    const forceHotspotTextToTop = () => {
      try {
        // Get all layers in the map
        const layers = map.getStyle().layers || [];
        
        // Check if our hotspot text layer exists
        const hotspotLayerExists = layers.some(layer => layer.id === 'hotspot-text-layer');
        
        if (hotspotLayerExists) {
          // Move hotspot text layer to the very top (above arrows)
          map.moveLayer('hotspot-text-layer');
  
        }
      } catch (error) {
        // Ignore errors if layer doesn't exist yet
      }
    };
    
    // Force to top with slight delay
    setTimeout(forceHotspotTextToTop, 200);
    
    // Also force to top whenever any new layer is added
    const handleDataChange = () => {
      setTimeout(forceHotspotTextToTop, 100);
    };
    
    map.on('data', handleDataChange);
    map.on('styledata', handleDataChange);
    
    return () => {
      map.off('data', handleDataChange);
      map.off('styledata', handleDataChange);
    };
  }, [map, hotspotGeoJSON, visible]);

  // Debug info
  useEffect(() => {
    if (metadata && timestampPrefix) {

    }
  }, [metadata, timestampPrefix]);

  // Render both raster and hotspot text layers
  return (
    <>
      {/* Raster layer using CanvasSource */}
      <CanvasSource
        id="mackerel-probability"
        layerId="mackerel-probability-layer"
        visible={visible}
        opacity={opacity}
        metadataUrl="/data/mackerel-probability-images-mercator/metadata.json"
        imageUrlPattern="/data/mackerel-probability-images-mercator/{filename}"
        canvasSize={{ width: 1848, height: 2552 }}
      />
      
      {/* Hotspot text layer */}
      {visible && hotspotGeoJSON && (
        <Source 
          id="hotspot-text-source" 
          type="geojson" 
          data={hotspotGeoJSON}
        >
          <Layer
            id="hotspot-text-layer"
            type="symbol"
            layout={{
              'text-field': ['get', 'text'],
              'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
              'text-size': ['get', 'textSize'],
              'text-anchor': 'center',
              'text-allow-overlap': true,
              'text-ignore-placement': true,
              'symbol-sort-key': 999 // Highest priority
            }}
            paint={{
              'text-color': ['get', 'textColor'],
              'text-halo-color': ['get', 'textHaloColor'],
              'text-halo-width': ['get', 'textHaloWidth'],
              'text-opacity': 0.9
            }}
          />
        </Source>
      )}
    </>
  );
});

MackerelProbabilityLayer.displayName = 'MackerelProbabilityLayer';

export default MackerelProbabilityLayer; 