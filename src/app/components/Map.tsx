//src/app/components/Map.tsx

// src/app/components/Map.tsx

'use client';

import { Map, NavigationControl } from 'react-map-gl/maplibre';
import { useEffect, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import AreaParametersLayer from './AreaParametersLayer';
import CurrentMagnitudeLayerMercator from './CurrentMagnitudeLayerMercator';
import TemperatureLayerMercator from './TemperatureLayerMercator';
import SalinityLayerMercator from './SalinityLayerMercator';
import MackerelProbabilityLayer from './MackerelProbabilityLayer';
import CurrentVectorsLayer from './CurrentVectorsLayer';
import MapPin from './MapPin';
import CurrentMagnitudeLegend from './CurrentMagnitudeLegend';
import TemperatureLegend from './TemperatureLegend';
import SalinityLegend from './SalinityLegend';
import MackerelLegend from './MackerelLegend';
import OffsetDebugger from './OffsetDebugger';
import MapContextMenu from './MapContextMenu';
import FishingDataForm from './FishingDataForm';
import FishingValidationDashboard from './FishingValidationDashboard';
import { useLayerVisibility } from '../context/LayerContext';
import { useImageLayer } from '../context/ImageLayerContext';

interface MapViewProps {
  showZoom?: boolean;
  // Layer visibility controls - removed showCurrentMagnitude since it's managed by ImageLayerContext
  showCurrentVectors?: boolean;
  showPin?: boolean;
}

export default function MapView({ 
  showZoom = true,
  showCurrentVectors = true,
  showPin = true
}: MapViewProps) {
  const { showCurrentVectors: contextShowCurrentVectors } = useLayerVisibility();
  const { activeLayer } = useImageLayer();
  
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [isDesktop, setIsDesktop] = useState(true);
  const [showOffsetDebugger, setShowOffsetDebugger] = useState(false);
  
  // Context menu and fishing data form state
  const [contextMenuState, setContextMenuState] = useState({
    isOpen: false,
    position: { x: 0, y: 0 },
    coordinates: { lat: 0, lng: 0 }
  });
  const [fishingFormState, setFishingFormState] = useState({
    isOpen: false,
    location: { lat: 0, lng: 0 }
  });
  const [validationDashboardOpen, setValidationDashboardOpen] = useState(false);
  
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

  // Handle right-click to show context menu
  const handleMapContextMenu = (e: maplibregl.MapMouseEvent) => {
    e.preventDefault();
    
    const { lngLat, point } = e;
    setContextMenuState({
      isOpen: true,
      position: { x: point.x, y: point.y },
      coordinates: { lat: lngLat.lat, lng: lngLat.lng }
    });
  };

  // Handle context menu close
  const handleContextMenuClose = () => {
    setContextMenuState(prev => ({ ...prev, isOpen: false }));
  };

  // Handle map click - close context menu but prevent other popups when fishing UI is active
  const handleMapClick = (e: maplibregl.MapMouseEvent) => {
    // Always close context menu on click
    if (contextMenuState.isOpen) {
      handleContextMenuClose();
      return; // Don't propagate click if we're closing context menu
    }
    
    // Don't show other popups if fishing form is open
    if (fishingFormState.isOpen) {
      return;
    }
    
    // Allow normal map click behavior for other popups
    // (this is where other click handlers would go)
  };

  // Handle fishing data registration
  const handleRegisterFishingData = () => {
    setFishingFormState({
      isOpen: true,
      location: contextMenuState.coordinates
    });
  };

  // Handle fishing form close
  const handleFishingFormClose = () => {
    setFishingFormState(prev => ({ ...prev, isOpen: false }));
  };

  // Handle fishing data save
  const handleFishingDataSave = (report: any) => {
    console.log('Fishing data saved:', report);
    // TODO: Add any additional handling after save
  };

  // Handle validation dashboard
  const handleOpenValidation = () => {
    setValidationDashboardOpen(true);
  };

  const handleCloseValidation = () => {
    setValidationDashboardOpen(false);
  };

  return (
    <div className="relative w-full h-full">
      <Map
        initialViewState={{
          longitude: 10.8, // Nära sydvästra hörnet (med lite marginal från kanten)
          latitude: 55.913158,  // Nära sydvästra hörnet (med lite marginal från kanten)
          zoom: getInitialZoom()
        }}
        onContextMenu={handleMapContextMenu}
        onClick={handleMapClick}
        maxBounds={[
          [10.3, 54.9], // sydväst (lon_min, lat_min)
          [16.6, 59.6]  // nordöst (lon_max, lat_max)
        ]}
        minZoom={6}
        maxZoom={12}
        style={{ width: '100%', height: '100%' }}
        cursor="default"
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
      >
        {showNavigation && <NavigationControl position="top-right" />}
        
        {/* Grundlager */}
        <AreaParametersLayer />
        
        {/* Bildlager - bara ett kan vara aktivt åt gången */}
        <CurrentMagnitudeLayerMercator 
          visible={activeLayer === 'current'}
          opacity={1.0}
        />
        
        <TemperatureLayerMercator 
          visible={activeLayer === 'temperature'}
          opacity={1.0}
        />
        
        <SalinityLayerMercator 
          visible={activeLayer === 'salinity'}
          opacity={1.0}
        />
        
        <MackerelProbabilityLayer 
          visible={activeLayer === 'mackerel'}
          opacity={1.0}
        />
        
        {/* PILAR MÅSTE RENDERAS EFTER BILDLAGER FÖR ATT VARA OVANPÅ */}
        <CurrentVectorsLayer 
          visible={contextShowCurrentVectors}
        />
        
        {/* PIN KOMPONENT - RENDERAS SIST FÖR ATT VARA OVANPÅ ALLT */}
        <MapPin visible={showPin} />
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
      
      <MackerelLegend 
        visible={activeLayer === 'mackerel'}
        className="absolute top-4 right-4 z-10"
      />

      {/* Offset Debugger - aktiveras med Ctrl+Shift+O */}
      <OffsetDebugger 
        visible={showOffsetDebugger}
        className="absolute bottom-4 left-4 z-20 max-w-md"
      />

      {/* Context Menu för fiskdata */}
      <MapContextMenu
        isOpen={contextMenuState.isOpen}
        position={contextMenuState.position}
        onClose={handleContextMenuClose}
        onRegisterFishingData={handleRegisterFishingData}
        onOpenValidation={handleOpenValidation}
      />

      {/* Fishing Data Form */}
      <FishingDataForm
        isOpen={fishingFormState.isOpen}
        onClose={handleFishingFormClose}
        initialLocation={fishingFormState.location}
        onSave={handleFishingDataSave}
      />

      {/* Validation Dashboard */}
      <FishingValidationDashboard
        isOpen={validationDashboardOpen}
        onClose={handleCloseValidation}
      />
    </div>
  );
}