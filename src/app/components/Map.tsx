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
import PlaceNamesLayer from './PlaceNamesLayer';
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
import ManualPointsIndicator from './ManualPointsIndicator';
import ManualPointsLayer from './ManualPointsLayer';
import ManualPointPopup from './ManualPointPopup';
import DeletePointPopup from './DeletePointPopup';
import { useLayerVisibility } from '../context/LayerContext';
import { useImageLayer } from '../context/ImageLayerContext';
import { useManualPoints } from '../context/ManualPointsContext';
import { useSimulationLayer } from '../context/SimulationContext';
import { ManualGridPoint } from '@/lib/points';

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
  const { simulationLayer } = useSimulationLayer();
  const { 
    isManualPointMode, 
    addManualPoint, 
    removeManualPoint,
    hasPointAt, 
    checkDataAvailability,
    manualPoints 
  } = useManualPoints();
  
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
  const [manualPointPopupState, setManualPointPopupState] = useState<{
    isOpen: boolean;
    coordinates: { lat: number; lng: number };
  }>({ isOpen: false, coordinates: { lat: 0, lng: 0 } });
  const [deletePointPopupState, setDeletePointPopupState] = useState<{
    isOpen: boolean;
    point: ManualGridPoint | null;
  }>({ isOpen: false, point: null });
  
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

  // Stäng manual point popup när man lämnar manual point mode
  useEffect(() => {
    if (!isManualPointMode && manualPointPopupState.isOpen) {
      setManualPointPopupState(prev => ({ ...prev, isOpen: false }));
    }
    if (!isManualPointMode && deletePointPopupState.isOpen) {
      setDeletePointPopupState(prev => ({ ...prev, isOpen: false }));
    }
  }, [isManualPointMode, manualPointPopupState.isOpen, deletePointPopupState.isOpen]);
  
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
    
    // Don't show context menu in manual point mode
    if (isManualPointMode) {
      return;
    }
    
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
  const handleMapClick = async (e: maplibregl.MapMouseEvent) => {
    try {
      // Always close context menu on click
      if (contextMenuState.isOpen) {
        handleContextMenuClose();
        return; // Don't propagate click if we're closing context menu
      }
      
      // Don't show other popups if fishing form is open
      if (fishingFormState.isOpen) {
        return;
      }
      
      // Handle manual point mode
      if (isManualPointMode) {
        // If any popup is open, close it
        if (manualPointPopupState.isOpen) {
          setManualPointPopupState(prev => ({ ...prev, isOpen: false }));
          return;
        }
        if (deletePointPopupState.isOpen) {
          setDeletePointPopupState(prev => ({ ...prev, isOpen: false }));
          return;
        }
        
        const { lngLat } = e;
        const lat = lngLat.lat;
        const lon = lngLat.lng;
        
        // Check if point already exists at this location - with error handling
        let pointExists = false;
        let existingPoint = null;
        try {
          pointExists = hasPointAt(lat, lon);
          if (pointExists) {
            // Find the existing point to show its coordinates
            existingPoint = manualPoints.find((point: any) => 
              Math.abs(point.lat - lat) < 0.001 && 
              Math.abs(point.lon - lon) < 0.001
            );
          }
        } catch (error) {
          console.error('Error checking point existence:', error);
          pointExists = false;
        }
        
        if (pointExists && existingPoint) {
          return;
        }
        
        // Show manual point popup
        setManualPointPopupState({
          isOpen: true,
          coordinates: { lat, lng: lon }
        });
        
        return; // Don't propagate click further in manual point mode
      }
      
      // Allow normal map click behavior for other popups
      // (this is where other click handlers would go)
    } catch (error) {
      console.error('Error in handleMapClick:', error);
      // Don't let click errors crash the app
    }
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
    
    // TODO: Add any additional handling after save
  };

  // Handle validation dashboard
  const handleOpenValidation = () => {
    setValidationDashboardOpen(true);
  };

  const handleCloseValidation = () => {
    setValidationDashboardOpen(false);
  };

  const handleManualPointPopupClose = () => {
    setManualPointPopupState(prev => ({ ...prev, isOpen: false }));
  };

  const handleManualPointConfirm = (lat: number, lon: number) => {
    try {
      if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) {
        console.error('Invalid coordinates for manual point:', { lat, lon });
        return;
      }
      
      addManualPoint(lat, lon);
  
    } catch (error) {
      console.error('Error in handleManualPointConfirm:', error);
    }
  };

  const handlePointClick = (point: ManualGridPoint) => {
    try {
      // Close any existing popups
      setManualPointPopupState(prev => ({ ...prev, isOpen: false }));
      
      // Open delete popup
      setDeletePointPopupState({
        isOpen: true,
        point: point
      });
    } catch (error) {
      console.error('Error in handlePointClick:', error);
    }
  };

  const handleDeletePointConfirm = (id: string) => {
    try {
      removeManualPoint(id);
  
    } catch (error) {
      console.error('Error in handleDeletePointConfirm:', error);
    }
  };

  const handleDeletePointPopupClose = () => {
    setDeletePointPopupState(prev => ({ ...prev, isOpen: false }));
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
        onLoad={(e) => {
          try {
            setMap(e.target);
          } catch (error) {
            console.error('Error setting map reference:', error);
          }
        }}
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
        
        {/* PLATSNAMNLAGER - RENDERAS EFTER PARAMETERBILDER FÖR ATT VARA OVANPÅ */}
        <PlaceNamesLayer visible={true} opacity={0.9} />
        
        {/* PILAR MÅSTE RENDERAS EFTER BILDLAGER FÖR ATT VARA OVANPÅ */}
        <CurrentVectorsLayer 
          visible={contextShowCurrentVectors && !simulationLayer}
        />
        
        {/* MANUELLA PUNKTER - RENDERAS EFTER PILAR */}
        <ManualPointsLayer visible={isManualPointMode} onPointClick={handlePointClick} />
        
        {/* PIN KOMPONENT - RENDERAS SIST FÖR ATT VARA OVANPÅ ALLT */}
        {!isManualPointMode && <MapPin visible={showPin} />}
        
        {/* Manual Point Popup */}
        {manualPointPopupState.isOpen && (
          <ManualPointPopup
            longitude={manualPointPopupState.coordinates.lng}
            latitude={manualPointPopupState.coordinates.lat}
            onClose={handleManualPointPopupClose}
            onConfirm={handleManualPointConfirm}
          />
        )}
        
        {/* Delete Point Popup */}
        {deletePointPopupState.isOpen && deletePointPopupState.point && (
          <DeletePointPopup
            point={deletePointPopupState.point}
            onClose={handleDeletePointPopupClose}
            onConfirm={handleDeletePointConfirm}
          />
        )}
        

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

      {/* Manual Points Indicator */}
      <ManualPointsIndicator />
    </div>
  );
}