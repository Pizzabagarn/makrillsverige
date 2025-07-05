//src/app/components/Map.tsx

// src/app/components/Map.tsx

'use client';

import React from 'react';
import { Map, NavigationControl, MapRef } from 'react-map-gl/maplibre';
import { useEffect, useState, useCallback, useRef } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import AreaParametersLayer from './AreaParametersLayer';
import CurrentMagnitudeLayer from './CurrentMagnitudeLayer';
import TemperatureLayer from './TemperatureLayer';
import SalinityLayer from './SalinityLayer';
import CurrentVectorsLayer from './CurrentVectorsLayer';
import CurrentMagnitudeLegend from './CurrentMagnitudeLegend';
import TemperatureLegend from './TemperatureLegend';
import SalinityLegend from './SalinityLegend';
import OffsetDebugger from './OffsetDebugger';
import ParameterPopup from './ParameterPopup';
import { useLayerVisibility } from '../context/LayerContext';
import { useImageLayer } from '../context/ImageLayerContext';
import { useAreaParameters } from '../context/AreaParametersContext';
import { useTimeSlider } from '../context/TimeSliderContext';
import { interpolateParametersAtPosition } from '../../lib/spatialInterpolation';
import { useHeavyThrottle, useDraggingDetection } from '../../lib/throttleHooks';

interface MapViewProps {
  showZoom?: boolean;
  // Layer visibility controls - removed showCurrentMagnitude since it's managed by ImageLayerContext
  showCurrentVectors?: boolean;
}

interface PopupData {
  coordinates: {
    lat: number;
    lon: number;
  };
  values: {
    current?: {
      magnitude: number;
      direction: number;
      u: number;
      v: number;
      unit: string;
    };
    temperature?: {
      value: number;
      unit: string;
    };
    salinity?: {
      value: number;
      unit: string;
    };
  };
  dataType: 'interpolated' | 'actual' | 'no_data';
  nearestPointDistance: number;
  timestamp: string;
}

const MapView = React.memo(function MapView({ 
  showZoom = true,
  showCurrentVectors = true
}: MapViewProps) {
  const { showCurrentVectors: contextShowCurrentVectors } = useLayerVisibility();
  const { activeLayer } = useImageLayer();
  const { data: areaData } = useAreaParameters();
  const { selectedHour, baseTime } = useTimeSlider();
  
  // Samma throttling-logik som CurrentMagnitudeLayer för synkronisering
  const isDragging = useDraggingDetection(selectedHour);
  const lightThrottledHour = useHeavyThrottle(selectedHour, 100);   // Faster when not dragging
  const heavyThrottledHour = useHeavyThrottle(selectedHour, 500);   // Slower when dragging
  const effectiveSelectedHour = isDragging ? heavyThrottledHour : lightThrottledHour;
  
  const mapRef = useRef<MapRef | null>(null);
  const [isDesktop, setIsDesktop] = useState(true);
  const [showOffsetDebugger, setShowOffsetDebugger] = useState(false);
  
  // Popup state
  const [popupData, setPopupData] = useState<PopupData | null>(null);
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
  const [showPopup, setShowPopup] = useState(false);
  const [hasUsedPopup, setHasUsedPopup] = useState(false);
  
  // Click detection för att skilja mellan klick och drag
  const mouseDownRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const isDraggingRef = useRef(false);
  
  useEffect(() => {
    const check = () => setIsDesktop(window.matchMedia('(min-width: 768px)').matches);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Keyboard shortcut för offset debugger (Ctrl+Shift+O)
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'O') {
        e.preventDefault();
        setShowOffsetDebugger(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  // Beräkna aktuell timestamp - SYNKRONISERAD med bakgrundsbilden via effectiveSelectedHour
  const currentTimestamp = useCallback(() => {
    if (!baseTime || !areaData?.metadata?.timestamps) return '';
    
    const targetTime = new Date(baseTime + effectiveSelectedHour * 3600_000);
    const availableTimestamps = areaData.metadata.timestamps;
    let closestTimestamp = availableTimestamps[0];
    let minDiff = Math.abs(new Date(availableTimestamps[0]).getTime() - targetTime.getTime());
    
    for (const timestamp of availableTimestamps) {
      const diff = Math.abs(new Date(timestamp).getTime() - targetTime.getTime());
      if (diff < minDiff) {
        minDiff = diff;
        closestTimestamp = timestamp;
      }
    }
    
    return closestTimestamp;
  }, [baseTime, effectiveSelectedHour, areaData?.metadata?.timestamps]);

  // Mouse down handler - start click detection
  const handleMouseDown = useCallback((event: any) => {
    mouseDownRef.current = {
      x: event.point.x,
      y: event.point.y,
      time: Date.now()
    };
    isDraggingRef.current = false;
  }, []);

  // Mouse move handler - detect if dragging
  const handleMouseMove = useCallback((event: any) => {
    if (!mouseDownRef.current) return;
    
    const deltaX = Math.abs(event.point.x - mouseDownRef.current.x);
    const deltaY = Math.abs(event.point.y - mouseDownRef.current.y);
    
    // Om musen rört sig mer än 5px, betrakta som drag
    if (deltaX > 5 || deltaY > 5) {
      isDraggingRef.current = true;
    }
  }, []);

  // Mouse up handler - detect click vs drag
  const handleMouseUp = useCallback((event: any) => {
    if (!mouseDownRef.current || !areaData?.points || !event.lngLat) {
      mouseDownRef.current = null;
      return;
    }
    
    const timeDiff = Date.now() - mouseDownRef.current.time;
    const deltaX = Math.abs(event.point.x - mouseDownRef.current.x);
    const deltaY = Math.abs(event.point.y - mouseDownRef.current.y);
    
    // Klick = tid < 300ms och rörelse < 5px
    const isClick = timeDiff < 300 && deltaX < 5 && deltaY < 5 && !isDraggingRef.current;
    
    if (isClick) {
      // Uppdatera popup för klick
      setPopupPosition({
        x: event.point.x,
        y: event.point.y
      });
      
      updatePopupData(event.lngLat.lng, event.lngLat.lat);
      setShowPopup(true);
      setHasUsedPopup(true); // Dölj instruktion efter första användningen
    }
    
    mouseDownRef.current = null;
    isDraggingRef.current = false;
  }, [areaData?.points, currentTimestamp]);

  // Uppdatera popup-data med optimering
  const updatePopupData = useCallback((lng: number, lat: number) => {
    if (!areaData?.points) return;
    
    const timestamp = currentTimestamp();
    if (!timestamp) return;
    
    // Använd setTimeout för att undvika blocking UI under interpolation
    setTimeout(() => {
      const interpolatedData = interpolateParametersAtPosition(
        lat,
        lng,
        areaData.points,
        timestamp
      );
      
      setPopupData(interpolatedData);
    }, 0);
  }, [areaData?.points, currentTimestamp]);

  // Close popup handler
  const closePopup = useCallback(() => {
    setShowPopup(false);
    setPopupData(null);
  }, []);

  // Keyboard handler for closing popup with Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showPopup) {
        closePopup();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showPopup, closePopup]);

  // Sätt upp event listeners för kartan
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    
    map.on('mousedown', handleMouseDown);
    map.on('mousemove', handleMouseMove);
    map.on('mouseup', handleMouseUp);
    
    return () => {
      map.off('mousedown', handleMouseDown);
      map.off('mousemove', handleMouseMove);
      map.off('mouseup', handleMouseUp);
    };
  }, [mapRef.current, handleMouseDown, handleMouseMove, handleMouseUp]);
  
  // Beräkna maximal utzoomning för att visa hela maxBounds-området
  const getInitialZoom = () => {
    if (typeof window === 'undefined') return 6; // Server-side fallback
    
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    // MaxBounds: [10.3, 54.9] till [16.6, 59.6]
    // Longitude span: 6.3 grader, Latitude span: 4.7 grader
    
    // Beräkna lägsta zoom som fortfarande visar hela det begränsade området
    const lonSpan = 6.3; // 16.6 - 10.3
    const latSpan = 4.7; // 59.6 - 54.9
    const aspectRatio = width / height;
    
    // Maximal utzoomning (lägsta zoom-värde) som visar hela området
    let zoom;
    if (aspectRatio > 1.4) {
      // Bred skärm: latitude bestämmer zoom
      zoom = Math.max(6.0, 6.5 - Math.log2(height / 600));
    } else {
      // Smal skärm: longitude bestämmer zoom  
      zoom = Math.max(6.0, 6.2 - Math.log2(width / 400));
    }
    
    // Begränsa till giltiga värden - prioritera lägre zoom (mer utzoomad)
    return Math.max(6.0, Math.min(6.8, zoom));
  };
  
  const showNavigation = showZoom && isDesktop;

  return (
    <div className="relative w-full h-full">
      <Map
        ref={mapRef}
        initialViewState={{
          longitude: 10.8, // Nära sydvästra hörnet (med lite marginal från kanten)
          latitude: 55.913158,  // Nära sydvästra hörnet (med lite marginal från kanten)
          zoom: getInitialZoom()
        }}
        maxBounds={[
          [10.3, 54.9], // sydväst (lon_min, lat_min)
          [16.6, 59.6]  // nordöst (lon_max, lat_max)
        ]}
        minZoom={6}
        maxZoom={12}
        style={{ width: '100%', height: '100%', cursor: 'crosshair' }}
        mapStyle={{
          version: 8,
          sources: {
            'esri-world-imagery': {
              type: 'raster',
              tiles: [
                'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
              ],
              tileSize: 256,
              attribution: '&copy; Esri, Maxar, Earthstar Geographics'
            }
          },
          layers: [
            {
              id: 'esri-world-imagery',
              type: 'raster',
              source: 'esri-world-imagery'
            }
          ]
        }}
        scrollZoom={true}
        interactiveLayerIds={[]} // Behövs för att mousemove ska fungera
      >
        {showNavigation && <NavigationControl position="top-right" />}
        
        {/* Grundlager */}
        <AreaParametersLayer />
        
        {/* Bildlager - bara ett kan vara aktivt åt gången */}
        <CurrentMagnitudeLayer 
          visible={activeLayer === 'current'}
          opacity={1.0}
        />
        
        <TemperatureLayer 
          visible={activeLayer === 'temperature'}
          opacity={1.0}
        />
        
        <SalinityLayer 
          visible={activeLayer === 'salinity'}
          opacity={1.0}
        />
        
        {/* PILAR MÅSTE RENDERAS EFTER BILDLAGER FÖR ATT VARA OVANPÅ */}
        <CurrentVectorsLayer 
          visible={contextShowCurrentVectors}
        />
      </Map>
      
      {/* Legender - bara en synlig åt gången baserat på aktivt lager */}
      <CurrentMagnitudeLegend 
        visible={activeLayer === 'current'}
        className="absolute top-4 right-4 z-10"
      />
      
      <TemperatureLegend 
        visible={activeLayer === 'temperature'}
        className="absolute top-4 right-4 z-10"
      />
      
      <SalinityLegend 
        visible={activeLayer === 'salinity'}
        className="absolute top-4 right-4 z-10"
      />

      {/* Offset Debugger - aktiveras med Ctrl+Shift+O */}
      <OffsetDebugger 
        visible={showOffsetDebugger}
        className="absolute bottom-4 left-4 z-20 max-w-md"
      />

      {/* Instruktion för klick-funktionalitet - bara första gången */}
      {!showPopup && !hasUsedPopup && (
        <div className="absolute bottom-4 right-4 z-10 bg-black/50 backdrop-blur-sm border border-white/20 rounded-lg px-3 py-2 pointer-events-none animate-pulse">
          <div className="text-white/80 text-sm flex items-center space-x-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M6.672 1.911a1 1 0 10-1.932.518l.259.966a1 1 0 001.932-.518l-.26-.966zM2.429 4.74a1 1 0 10-.517 1.932l.966.259a1 1 0 00.517-1.932l-.966-.26zm8.814-.569a1 1 0 00-1.415-1.414l-.707.707a1 1 0 101.415 1.415l.707-.708zm-7.071 7.072l.707-.707A1 1 0 003.465 9.12l-.708.707a1 1 0 001.415 1.415zm3.2-5.171a1 1 0 00-1.3 1.3l4 10a1 1 0 001.823.075l1.38-2.759 3.018 3.02a1 1 0 001.414-1.415l-3.019-3.02 2.76-1.379a1 1 0 00-.076-1.822l-10-4z" clipRule="evenodd" />
            </svg>
            <span>Klicka för att visa oceandata</span>
          </div>
        </div>
      )}

      {/* Parameter Popup - visar interpolerade värden */}
      <ParameterPopup
        data={popupData}
        position={popupPosition}
        visible={showPopup}
        onClose={closePopup}
      />
    </div>
  );
});

export default MapView;