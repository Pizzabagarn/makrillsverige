// src/components/CurrentVectorsLayer.tsx
'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useMap } from 'react-map-gl/maplibre';
import { Source, Layer } from 'react-map-gl/maplibre';
import React from 'react';
import chroma from 'chroma-js';
import { useTimeSlider } from '../context/TimeSliderContext';
import { useAreaParameters } from '../context/AreaParametersContext';
import { useHeavyThrottle, useDraggingDetection } from '../../lib/throttleHooks';
import { DMI_GRID_POINTS } from '../../lib/points';
import type { GeoJSON } from 'geojson';

interface CurrentVector { u: number; v: number; time: string }
interface GridPoint { lat: number; lon: number; vectors: CurrentVector[] }

// Calculate rotation angle from u,v components
function calculateRotation(u: number, v: number): number {
  const angleRad = Math.atan2(v, u);
  const angleDeg = (angleRad * 180) / Math.PI;
  return (90 - angleDeg) % 360;
}

// Check if a point is a FIXED Öresund point (those without IDs)
function isFixedOresundPoint(lat: number, lon: number): boolean {
  // Öresund-punkter är de som saknar ID (första 11 punkterna i DMI_GRID_POINTS)
  const oresundPoints = DMI_GRID_POINTS.filter(point => !point.id && point.name.includes('Öresund'));
  
  return oresundPoints.some(point => 
    Math.abs(point.lat - lat) < 0.001 && Math.abs(point.lon - lon) < 0.001
  );
}

// Check if a point is a USER-ADDED manual point (has ID starting with "manual_")
function isUserAddedManualPoint(lat: number, lon: number): boolean {
  const manualPoints = DMI_GRID_POINTS.filter(point => point.id && point.id.startsWith('manual_'));
  
  return manualPoints.some(point => 
    Math.abs(point.lat - lat) < 0.001 && Math.abs(point.lon - lon) < 0.001
  );
}

// Simple haversine distance function
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + 
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

// Removed local throttling hooks - using optimized ones from throttleHooks.ts

interface CurrentVectorsLayerProps {
  visible?: boolean;
}

const CurrentVectorsLayer = React.memo<CurrentVectorsLayerProps>(({ 
  visible = true 
}) => {
  const { current: map } = useMap();
  const { selectedHour, displayHour, baseTime } = useTimeSlider();
  const { data: areaData, isLoading: areaDataLoading } = useAreaParameters();
  
  const [arrowImageLoaded, setArrowImageLoaded] = useState(false);
  const [dotImageLoaded, setDotImageLoaded] = useState(false);
  const [gridData, setGridData] = useState<GridPoint[]>([]);
  const [arrowsGeoJSON, setArrowsGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(8);
  const imageLoadAttempted = useRef(false);
  
  // Performance optimizations - same as CurrentMagnitudeLayer
  const isDragging = useDraggingDetection(selectedHour);
  const lightThrottledHour = useHeavyThrottle(displayHour, 10);   // Very fast when not dragging
  const heavyThrottledHour = useHeavyThrottle(displayHour, 50);   // Still fast when dragging
  const effectiveSelectedHour = isDragging ? heavyThrottledHour : lightThrottledHour;
  
  // Simple color scale
  const colorScale = useMemo(() => {
    return chroma.scale(['#0000ff','#00ffff','#00ff00','#ffff00','#ff0000']).domain([0,0.7]);
  }, []);

  // Current timestamp
  const timestampPrefix = useMemo(() => {
    if (!baseTime) return '';
    return new Date(baseTime + effectiveSelectedHour * 3600_000).toISOString().slice(0, 13);
  }, [effectiveSelectedHour, baseTime]);

  // Track zoom level for performance optimizations
  useEffect(() => {
    if (!map) return;
    
    const handleZoomEnd = () => {
      setZoomLevel(map.getZoom());
    };
    
    map.on('zoomend', handleZoomEnd);
    setZoomLevel(map.getZoom());
    
    return () => {
      map.off('zoomend', handleZoomEnd);
    };
  }, [map]);

  // Process grid data from context
  useEffect(() => {
    if (areaDataLoading || !areaData) return;
    
    try {
      if (areaData.points) {
        const gridPoints: GridPoint[] = areaData.points.map((point: any) => ({
          lat: point.lat,
          lon: point.lon,
          vectors: point.data ? point.data.map((timeData: any) => ({
            time: timeData.time,
            u: timeData.current?.u || null,
            v: timeData.current?.v || null
          })).filter((v: any) => v.u !== null && v.v !== null) : []
        }));
        
        // console.log(`🌊 CurrentVectors: Processed ${gridPoints.length} grid points from context`);
        setGridData(gridPoints);
      }
    } catch (error) {
      // console.error('❌ Could not process grid data:', error);
    }
  }, [areaData, areaDataLoading]);

  // Load arrow image - IMPROVED VERSION with AbortController
  useEffect(() => {
    if (!map || imageLoadAttempted.current) return;
    
    const abortController = new AbortController();
    
    const loadArrowImage = async () => {
      imageLoadAttempted.current = true;
      
      try {
        // Method 1: Try loading arrow directly from public path
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        img.onload = () => {
          try {
            if (map.hasImage('arrow')) {
              map.removeImage('arrow');
            }
            map.addImage('arrow', img);
            setArrowImageLoaded(true);
          } catch (error) {
            // console.error('❌ Failed to add image to map:', error);
          }
        };
        
        img.onerror = (error) => {
          // console.error('❌ Failed to load arrow image:', error);
          // Try alternative method
          loadImageAlternative(abortController.signal);
        };
        
        img.src = '/images/arrow.png';
        
      } catch (error) {
        // console.error('❌ Image loading error:', error);
        loadImageAlternative(abortController.signal);
      }
    };
    
    const loadDotImage = async () => {
      try {
        // Method 1: Try loading dot directly from public path
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        img.onload = () => {
          try {
            if (map.hasImage('dot')) {
              map.removeImage('dot');
            }
            map.addImage('dot', img);
            setDotImageLoaded(true);
          } catch (error) {
            // console.error('❌ Failed to add dot image to map:', error);
          }
        };
        
        img.onerror = (error) => {
          // console.error('❌ Failed to load dot image:', error);
          // Try alternative method
          loadDotImageAlternative(abortController.signal);
        };
        
        img.src = '/images/dot.png';
        
      } catch (error) {
        // console.error('❌ Dot image loading error:', error);
        loadDotImageAlternative(abortController.signal);
      }
    };
    
    const loadImageAlternative = async (signal?: AbortSignal) => {
      try {
        const response = await fetch('/images/arrow.png', { signal });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const blob = await response.blob();
        const imageUrl = URL.createObjectURL(blob);
        
        const img = new Image();
        img.onload = () => {
          try {
            if (map.hasImage('arrow')) {
              map.removeImage('arrow');
            }
            map.addImage('arrow', img);
            setArrowImageLoaded(true);
          } catch (error) {
            // console.error('❌ Failed to add blob image to map:', error);
          }
          URL.revokeObjectURL(imageUrl);
        };
        
        img.onerror = (error) => {
          // console.error('❌ Failed to load arrow image via blob:', error);
          URL.revokeObjectURL(imageUrl);
        };
        
        img.src = imageUrl;
        
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          // console.error('❌ Alternative image loading failed:', error);
        }
      }
    };
    
    const loadDotImageAlternative = async (signal?: AbortSignal) => {
      try {
        const response = await fetch('/images/dot.png', { signal });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const blob = await response.blob();
        const imageUrl = URL.createObjectURL(blob);
        
        const img = new Image();
        img.onload = () => {
          try {
            if (map.hasImage('dot')) {
              map.removeImage('dot');
            }
            map.addImage('dot', img);
            setDotImageLoaded(true);
          } catch (error) {
            // console.error('❌ Failed to add blob dot image to map:', error);
          }
          URL.revokeObjectURL(imageUrl);
        };
        
        img.onerror = (error) => {
          // console.error('❌ Failed to load dot image via blob:', error);
          URL.revokeObjectURL(imageUrl);
        };
        
        img.src = imageUrl;
        
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          // console.error('❌ Alternative dot image loading failed:', error);
        }
      }
    };
    
    loadArrowImage();
    loadDotImage();
    
    return () => {
      abortController.abort();
    };
  }, [map]);

  // Generate arrows with simplified logic (no performance mode needed)
  const generateArrows = useCallback((performanceMode: boolean = false) => {
    if (!gridData.length || !timestampPrefix) return null;
    
    const arrowsFeatures: GeoJSON.Feature[] = [];
    const stillPointsFeatures: GeoJSON.Feature[] = [];
    
    // Detect mobile devices
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    
    for (const pt of gridData) {
      // UTESLUT bara de fasta Öresund-punkterna (alla andra pilar ska visas)
      const isOresundPoint = isFixedOresundPoint(pt.lat, pt.lon);
      
      // Hoppa över fasta Öresund-punkter
      if (isOresundPoint) {
        continue;
      }
      
      // Kontrollera om det är en manuell punkt från UI:et
      const isManualPoint = isUserAddedManualPoint(pt.lat, pt.lon);
      
      // Manuella punkter visas bara på höga zoom-nivåer (>11)
      if (isManualPoint && zoomLevel <= 11) {
        continue;
      }
      
      const v = pt.vectors.find(v => v.time.startsWith(timestampPrefix));
      if (!v || v.u == null || v.v == null) {
        continue;
      }

      const mag = Math.hypot(v.u, v.v);
      
      // Generate arrow or dot based on magnitude
      if (mag < 0.01) {
        // Stillastående punkt
        let dotSize = 0.015;
        if (isMobile) {
          dotSize = 0.012;
        }
        
        const stillPointFeature: GeoJSON.Feature = {
          type: 'Feature',
          properties: {
            magnitude: mag,
            opacity: 0.8,
            size: dotSize,
            symbolType: 'dot',
            color: 'white'
          },
          geometry: {
            type: 'Point',
            coordinates: [pt.lon, pt.lat]
          }
        };
        stillPointsFeatures.push(stillPointFeature);
      } else {
        // Strömmpil
        const color = colorScale(mag).toString();
        const rotation = calculateRotation(v.u, v.v);
        
        // Adjust arrow size based on device
        let baseSize = 0.03;
        if (isMobile) {
          if (zoomLevel < 6) {
            baseSize = 0.010;
          } else if (zoomLevel < 7) {
            baseSize = 0.013;
          } else {
            baseSize = 0.016;
          }
        } else {
          baseSize = 0.025;
        }
        
        const arrowFeature: GeoJSON.Feature = {
          type: 'Feature',
          properties: {
            color: color,
            magnitude: mag,
            opacity: 1,
            rotation: rotation,
            size: baseSize,
            symbolType: 'arrow'
          },
          geometry: {
            type: 'Point',
            coordinates: [pt.lon, pt.lat]
          }
        };
        arrowsFeatures.push(arrowFeature);
      }
    }

    // Kombinera alla features
    const allFeatures = [...arrowsFeatures, ...stillPointsFeatures];

    return {
      type: 'FeatureCollection' as const,
      features: allFeatures
    };
  }, [gridData, timestampPrefix, colorScale, zoomLevel]);

  // Smart arrow generation - hide arrows completely during dragging
  useEffect(() => {
    // HELT ENKELT: Dölj alla pilar under dragging, visa alla när man slutar
    if (!visible || !timestampPrefix || gridData.length === 0 || isDragging) {
      setArrowsGeoJSON(null);
      return;
    }

    // Generate arrows normally when not dragging (no performance mode needed)
    const newGeoJSON = generateArrows(false); // Always false since we hide during dragging
    
    // Only update if valid and actually different (reduce unnecessary re-renders)
    if (newGeoJSON) {
      setArrowsGeoJSON(prevGeoJSON => {
        if (!prevGeoJSON || prevGeoJSON.features.length !== newGeoJSON.features.length) {
          return newGeoJSON;
        }
        return newGeoJSON;
      });
    }

  }, [visible, generateArrows, isDragging, timestampPrefix, zoomLevel, gridData.length]);

  // FORCE ARROWS TO TOP - guarantees arrows are always above everything
  useEffect(() => {
    if (!map || !arrowsGeoJSON || !arrowImageLoaded || !dotImageLoaded || !visible) return;
    
    const forceArrowsToTop = () => {
      try {
        // Get all layers in the map
        const layers = map.getStyle().layers || [];
        
        // Check if our arrow layer exists
        const arrowLayerExists = layers.some(layer => layer.id === 'current-arrows-layer');
        
        if (arrowLayerExists) {
          // Move arrows layer to the very top (no beforeId = top)
          map.moveLayer('current-arrows-layer');
          // console.log('🏹 Arrows forced to TOP of all layers');
        }
      } catch (error) {
        // Ignore errors if layer doesn't exist yet
      }
    };
    
    // Force to top immediately
    setTimeout(forceArrowsToTop, 100);
    
    // Also force to top whenever any new layer is added
    const handleDataChange = () => {
      setTimeout(forceArrowsToTop, 50);
    };
    
    map.on('data', handleDataChange);
    map.on('styledata', handleDataChange);
    
    return () => {
      map.off('data', handleDataChange);
      map.off('styledata', handleDataChange);
    };
  }, [map, arrowsGeoJSON, arrowImageLoaded, dotImageLoaded, visible]);

  // Don't render anything if not visible
  if (!visible) {
    return null;
  }

  // Don't render if no data or images not loaded
  if (!arrowsGeoJSON || !arrowImageLoaded || !dotImageLoaded) {
    return null;
  }

  return (
    <Source 
      id="current-arrows" 
      type="geojson" 
      data={arrowsGeoJSON}
    >
      <Layer
        id="current-arrows-layer"
        type="symbol"
        layout={{
          'icon-image': [
            'case',
            ['==', ['get', 'symbolType'], 'arrow'],
            'arrow',
            'dot'
          ],
          'icon-size': ['get', 'size'],
          'icon-rotate': [
            'case',
            ['==', ['get', 'symbolType'], 'arrow'],
            ['get', 'rotation'],
            0
          ],
          'icon-rotation-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true
        }}
        paint={{
          'icon-color': [
            'case',
            ['==', ['get', 'symbolType'], 'arrow'],
            ['get', 'color'],
            'white'
          ],
          'icon-opacity': ['get', 'opacity']
        }}
      />
    </Source>
  );
});

CurrentVectorsLayer.displayName = 'CurrentVectorsLayer';

export default CurrentVectorsLayer;
