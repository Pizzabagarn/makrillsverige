'use client';

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as turf from '@turf/turf';
import { X, ExternalLink, Download, Thermometer } from 'lucide-react';
import { WaterBodyData } from '@/lib/waterBodyDataFetcher';
import { 
  ScandinavianWaterBody, 
  getWaterBodiesInBounds,
  getWaterBodyDetails,
  getPopularFishingWaters,
  getWaterBodyAtCoordinates
} from '@/lib/scandinavianWaterService';

interface WaterBodyInfoPanelProps {
  waterBody: ScandinavianWaterBody | null;
  waterData: WaterBodyData | null;
  loading: boolean;
  onClose: () => void;
}

function WaterBodyInfoPanel({ waterBody, waterData, loading, onClose }: WaterBodyInfoPanelProps) {
  if (!waterBody) return null;

  const countryFlags = {
    'SE': '🇸🇪 Sverige',
    'NO': '🇳🇴 Norge', 
    'DK': '🇩🇰 Danmark'
  };

  const typeLabels = {
    'lake': 'Sjö',
    'river': 'Å/Flod',
    'stream': 'Bäck',
    'reservoir': 'Reservoar',
    'canal': 'Kanal'
  };

  return (
    <div className="absolute top-4 right-4 w-96 bg-gradient-to-br from-slate-900/98 to-slate-800/98 backdrop-blur-xl rounded-2xl border border-slate-600/50 shadow-2xl z-[1000] max-h-[85vh] overflow-y-auto">
      {/* Header */}
      <div className="flex justify-between items-center p-6 border-b border-slate-600/50 bg-gradient-to-r from-slate-800/50 to-slate-700/50">
        <div>
          <h3 className="text-xl font-bold text-white mb-1">{waterBody.name}</h3>
          <p className="text-sm text-slate-300 font-medium">
            {typeLabels[waterBody.water_type]} • {countryFlags[waterBody.country]}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-600/50 transition-all duration-200"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="p-6 space-y-6">
        {/* Basic Info */}
        <div>
          <h4 className="font-semibold text-white mb-4 flex items-center text-lg">
            📊 Grundläggande information
          </h4>
          <div className="grid grid-cols-2 gap-4">
            {waterBody.area_km2 && (
              <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/20 border border-blue-700/30 rounded-xl p-4">
                <div className="text-blue-300 text-sm font-medium mb-1">Yta</div>
                <div className="text-white font-bold text-lg">{waterBody.area_km2} km²</div>
              </div>
            )}
            <div className="bg-gradient-to-br from-slate-700/30 to-slate-600/20 border border-slate-600/30 rounded-xl p-4">
              <div className="text-slate-300 text-sm font-medium mb-1">Koordinater</div>
              <div className="text-white font-mono text-sm">
                {waterBody.coordinates[0].toFixed(4)}, {waterBody.coordinates[1].toFixed(4)}
              </div>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
            <span className="ml-3 text-sm text-slate-300">Hämtar vattendata...</span>
          </div>
        )}

        {/* Water Quality Data (VISS) - Only show if actual data exists */}
        {waterBody.country === 'SE' && waterData?.waterQuality && (() => {
          // Check if there's any real data (not just "Okänt")
          const hasOxygenData = waterData.waterQuality.oxygen?.status && waterData.waterQuality.oxygen.status !== 'Okänt';
          const hasNutrientsData = waterData.waterQuality.nutrients?.status && waterData.waterQuality.nutrients.status !== 'Okänt';
          const hasTransparencyData = waterData.waterQuality.transparency?.light_conditions && waterData.waterQuality.transparency.light_conditions !== 'Okänt';
          const hasAcidityData = waterData.waterQuality.acidity?.ph_status && waterData.waterQuality.acidity.ph_status !== 'Okänt';
          const hasEcologicalData = waterData.waterQuality.ecological_status && waterData.waterQuality.ecological_status !== 'Okänt';
          
          const hasAnyData = hasOxygenData || hasNutrientsData || hasTransparencyData || hasAcidityData || hasEcologicalData;
          
          return hasAnyData;
        })() && (
          <div>
            <h4 className="font-semibold text-white mb-4 flex items-center text-lg">
              🧪 Vattenkvalitet (VISS)
            </h4>
            
            <div className="grid grid-cols-2 gap-4">
              {/* Oxygen - only if real data */}
              {waterData.waterQuality.oxygen?.status && waterData.waterQuality.oxygen.status !== 'Okänt' && (
                <div className="bg-gradient-to-br from-cyan-900/30 to-cyan-800/20 border border-cyan-700/30 rounded-xl p-4">
                  <div className="text-cyan-300 text-sm font-medium mb-1">Syrgasförhållanden</div>
                  <div className="text-white font-bold text-lg">
                    {waterData.waterQuality.oxygen.status}
                  </div>
                  {waterData.waterQuality.oxygen.conditions && waterData.waterQuality.oxygen.conditions !== 'Okänt' && (
                    <div className="text-cyan-400 text-xs">{waterData.waterQuality.oxygen.conditions}</div>
                  )}
                </div>
              )}

              {/* Nutrients - only if real data */}
              {waterData.waterQuality.nutrients?.status && waterData.waterQuality.nutrients.status !== 'Okänt' && (
                <div className="bg-gradient-to-br from-green-900/30 to-green-800/20 border border-green-700/30 rounded-xl p-4">
                  <div className="text-green-300 text-sm font-medium mb-1">Näringsämnen</div>
                  <div className="text-white font-bold text-lg">
                    {waterData.waterQuality.nutrients.status}
                  </div>
                  {waterData.waterQuality.nutrients.chlorophyll && waterData.waterQuality.nutrients.chlorophyll !== 'Okänt' && (
                    <div className="text-green-400 text-xs">Klorofyll: {waterData.waterQuality.nutrients.chlorophyll}</div>
                  )}
                </div>
              )}

              {/* Transparency - only if real data */}
              {waterData.waterQuality.transparency?.light_conditions && waterData.waterQuality.transparency.light_conditions !== 'Okänt' && (
                <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/20 border border-blue-700/30 rounded-xl p-4">
                  <div className="text-blue-300 text-sm font-medium mb-1">Ljusförhållanden</div>
                  <div className="text-white font-bold text-lg">
                    {waterData.waterQuality.transparency.light_conditions}
                  </div>
                  {waterData.waterQuality.transparency.visibility && waterData.waterQuality.transparency.visibility !== 'Okänt' && (
                    <div className="text-blue-400 text-xs">Sikt: {waterData.waterQuality.transparency.visibility}</div>
                  )}
                </div>
              )}

              {/* Acidity - only if real data */}
              {waterData.waterQuality.acidity?.ph_status && waterData.waterQuality.acidity.ph_status !== 'Okänt' && (
                <div className="bg-gradient-to-br from-yellow-900/30 to-yellow-800/20 border border-yellow-700/30 rounded-xl p-4">
                  <div className="text-yellow-300 text-sm font-medium mb-1">Försurning</div>
                  <div className="text-white font-bold text-lg">
                    {waterData.waterQuality.acidity.ph_status}
                  </div>
                </div>
              )}

              {/* Ecological Status - only if real data */}
              {waterData.waterQuality.ecological_status && waterData.waterQuality.ecological_status !== 'Okänt' && (
                <div className="col-span-2 bg-gradient-to-br from-purple-900/30 to-purple-800/20 border border-purple-700/30 rounded-xl p-4">
                  <div className="text-purple-300 text-sm font-medium mb-1">Ekologisk status</div>
                  <div className="text-white font-bold text-lg">
                    {waterData.waterQuality.ecological_status}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}







        {/* Norwegian/Danish waters message */}
        {waterBody.country !== 'SE' && (
          <div className="bg-blue-900/20 border border-blue-800/50 p-3 rounded-lg">
            <p className="text-blue-300 text-sm">
              {waterBody.country === 'NO' ? '🇳🇴 Norska' : '🇩🇰 Danska'} vattendrag. 
              VISS-data finns endast för svenska vatten.
            </p>
          </div>
        )}

        {/* Actions */}
        {waterBody.has_chart && (
          <div className="border-t border-slate-600/50 pt-6">
            <button className="w-full bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-700 hover:to-cyan-800 text-white px-6 py-4 rounded-xl transition-all duration-200 text-sm font-semibold flex items-center justify-center shadow-lg">
              <Download className="w-4 h-4 mr-2" />
              Ladda ner sjökarta
            </button>
          </div>
        )}


      </div>
    </div>
  );
}

interface MapRef {
  focusOnWaterBody: (waterBody: ScandinavianWaterBody) => void;
}

interface Props {
  searchTerm?: string;
  onWaterBodySelect?: (waterBody: ScandinavianWaterBody) => void;
}

const ScandinavianWaterMapGL = forwardRef<MapRef, Props>(({ searchTerm, onWaterBodySelect }, ref) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  
  // REF för synkron state tracking (löser React async state problem)
  const selectedWaterBodyRef = useRef<ScandinavianWaterBody | null>(null);
  
  const [selectedWaterBody, setSelectedWaterBody] = useState<ScandinavianWaterBody | null>(null);
  const [waterData, setWaterData] = useState<WaterBodyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [visibleWaterBodies, setVisibleWaterBodies] = useState<ScandinavianWaterBody[]>([]);

  useImperativeHandle(ref, () => ({
    focusOnWaterBody: (waterBody: ScandinavianWaterBody) => {
      if (mapRef.current) {
        mapRef.current.flyTo({
          center: [waterBody.coordinates[1], waterBody.coordinates[0]],
          zoom: 12,
          duration: 2000
        });
        handleWaterBodyClick(waterBody);
      }
    }
  }));

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    // Initialize MapLibre GL map with satellite imagery (same as main map)
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf', // Fix för text-labels
        sources: {
          'esri-world-imagery': {
            type: 'raster',
            tiles: [
              'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
            ],
            tileSize: 256,
            attribution: '&copy; Esri, Maxar, Earthstar Geographics'
          },
          'place-names': {
            type: 'raster',
            tiles: [
              'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
            ],
            tileSize: 256,
            attribution: '&copy; Esri'
          }
        },
        layers: [
          {
            id: 'background',
            type: 'background',
            paint: {
              'background-color': '#0f172a'
            }
          },
          {
            id: 'esri-world-imagery',
            type: 'raster',
            source: 'esri-world-imagery'
          },
          {
            id: 'place-names',
            type: 'raster',
            source: 'place-names',
            paint: {
              'raster-opacity': 0.8
            }
          }
        ]
      },
      center: [15.0, 62.0],
      zoom: 5,
      maxZoom: 18,
      minZoom: 3
    });

    // Sätt vanlig cursor över hela kartan
    map.getCanvas().style.cursor = 'default';

    mapRef.current = map;

    // Wait for map to load
    map.on('load', async () => {
      // Cache populära vattendrag i bakgrunden för snabbare lookup
      loadPopularFishingWaters();
      
      // Cache vattendrag för aktuell vy också
      const bounds = map.getBounds();
      if (bounds) {
        handleMapMove();
      }
      
      // Add event listeners
      map.on('moveend', handleMapMove); // För preloading av detaljer
      
      // SMART KLICK-HANTERING: Klicka ut först, sedan välj nytt
      map.on('click', handleSmartMapClick);
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // BORTTAGET: Glow-effekt (på användarens begäran)

  const loadPopularFishingWaters = async () => {
    try {
      // Ladda populära vattendrag för cache (inga prickar behövs längre)
      const popularWaters = await getPopularFishingWaters('ALL', 500);
      setVisibleWaterBodies(popularWaters);
      // addWaterBodiesToMap(popularWaters); // BORTTAGET - vi har glow-overlay istället
    } catch (error) {
      console.error('Fel vid laddning av populära fiskevatten:', error);
    }
  };

  const handleMapMove = async () => {
    if (!mapRef.current) return;

    const map = mapRef.current;
    const bounds = map.getBounds();
    const zoom = map.getZoom();

    // Minska zoom-begränsningen kraftigt för att alla sjöar ska vara klickbara
    if (zoom < 4) return;

    try {
      const waterBodies = await getWaterBodiesInBounds({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest()
      }, 300); // Öka limit för fler vattendrag

      const newBodies = waterBodies.filter(wb => 
        !visibleWaterBodies.some(vwb => vwb.id === wb.id)
      );
      
      if (newBodies.length > 0) {
        // Cache för snabbare lookup
        setVisibleWaterBodies(prev => [...prev, ...newBodies].slice(0, 1000));
      }
    } catch (error) {
      console.error('Fel vid laddning av vattendrag:', error);
    }
  };

  // BORTTAGET: updateGlowOverlay (glow-effekten togs bort)

  const addWaterBodiesToMap = (waterBodies: ScandinavianWaterBody[]) => {
    if (!mapRef.current || waterBodies.length === 0) return;

    const map = mapRef.current;

    const features = waterBodies.map(wb => ({
      type: 'Feature' as const,
      properties: {
        id: wb.id,
        name: wb.name,
        water_type: wb.water_type,
        country: wb.country,
        area_km2: wb.area_km2,
        has_chart: wb.has_chart
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [wb.coordinates[1], wb.coordinates[0]]
      }
    }));

    if (map.getSource('water-bodies')) {
      const source = map.getSource('water-bodies') as maplibregl.GeoJSONSource;
      const existingData = source._data as any;
      
      const allFeatures = [
        ...(existingData?.features || []),
        ...features
      ];
      
      const uniqueFeatures = allFeatures.filter((feature, index, self) => 
        index === self.findIndex(f => f.properties.id === feature.properties.id)
      );

      source.setData({
        type: 'FeatureCollection',
        features: uniqueFeatures
      });
    } else {
      map.addSource('water-bodies', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features
        }
      });

      // Add circles layer - Professional design with glow effect
      map.addLayer({
        id: 'water-bodies-layer',
        type: 'circle',
        source: 'water-bodies',
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            5, 4,
            10, 8,
            15, 16
          ],
          'circle-color': [
            'case',
            ['==', ['get', 'country'], 'SE'], '#06b6d4', // Swedish cyan
            ['==', ['get', 'country'], 'NO'], '#ef4444', // Norwegian red  
            ['==', ['get', 'country'], 'DK'], '#f59e0b', // Danish amber
            '#64748b' // Default slate
          ],
          'circle-stroke-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            5, 1,
            10, 2,
            15, 3
          ],
          'circle-stroke-color': '#ffffff',
          'circle-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            5, 0.7,
            10, 0.8,
            15, 0.9
          ],
          'circle-stroke-opacity': 0.9
        }
      });

      // Add inner glow layer for more professional look
      map.addLayer({
        id: 'water-bodies-glow',
        type: 'circle',
        source: 'water-bodies',
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            5, 6,
            10, 12,
            15, 24
          ],
          'circle-color': [
            'case',
            ['==', ['get', 'country'], 'SE'], '#06b6d4',
            ['==', ['get', 'country'], 'NO'], '#ef4444',
            ['==', ['get', 'country'], 'DK'], '#f59e0b', 
            '#64748b'
          ],
          'circle-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            5, 0.1,
            10, 0.15,
            15, 0.2
          ]
        }
      }, 'water-bodies-layer'); // Add glow behind main circles

      // Add labels layer - med fallback font
      map.addLayer({
        id: 'water-bodies-labels',
        type: 'symbol',
        source: 'water-bodies',
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular', 'Arial Unicode MS Regular'], // Fallback fonts
          'text-offset': [0, 2],
          'text-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            8, 10,
            12, 12,
            16, 16
          ],
          'text-max-width': 15,
          'text-allow-overlap': false,
          'text-ignore-placement': false
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#000000',
          'text-halo-width': 3
        },
        minzoom: 8
      });
    }
  };

  // GAMMAL handleMapClick BORTTAGEN - vi använder bara handleUniversalMapClick nu

  // SMART KLICK-HANTERING: Klicka ut först, sedan välj nytt
  const handleSmartMapClick = async (e: maplibregl.MapMouseEvent) => {
    // Om klicket redan hanterades av en specifik layer, skippa
    if (e.originalEvent.defaultPrevented) {
      return;
    }

    // VIKTIGT: Använd REF istället för state för synkron kontroll
    if (selectedWaterBodyRef.current) {
      e.originalEvent.preventDefault(); // Förhindra andra handlers
      clearSelection();
      return;
    }

    const { lng, lat } = e.lngLat;
    
    try {
      // Förbättrad sökning med större tolerans för små geometrier
      const waterBody = await getWaterBodyAtCoordinatesImproved(lat, lng);
      
      if (waterBody) {
        // Markera att vi hanterat klicket
        e.originalEvent.preventDefault();
        
        handleWaterBodyClick(waterBody);
      }
      
    } catch (error) {
      console.error('Fel vid smart map click:', error);
    }
  };

  // FÖRBÄTTRAD geometri-sökning med flera strategier
  const getWaterBodyAtCoordinatesImproved = async (lat: number, lng: number): Promise<ScandinavianWaterBody | null> => {
    // Strategi 1: Försök med standard sökning (1km)
    let waterBody = await getWaterBodyAtCoordinates(lat, lng, 1);
    if (waterBody) return waterBody;
    
    // Strategi 2: Öka sök-radien för små geometrier (3km)
    waterBody = await getWaterBodyAtCoordinates(lat, lng, 3);
    if (waterBody) return waterBody;
    
    // Strategi 3: Sök i cache bland synliga vattendrag för snabbhet
    const cachedMatch = findInCachedWaterBodies(lat, lng);
    if (cachedMatch) return cachedMatch;
    
    // Strategi 4: Bred databas-sökning med stora toleranser (5km)
    waterBody = await getWaterBodyAtCoordinates(lat, lng, 5);
    return waterBody;
  };

  // Hjälpfunktion: Sök i cachade vattendrag för snabb matchning
  const findInCachedWaterBodies = (lat: number, lng: number): ScandinavianWaterBody | null => {
    const tolerance = 0.05; // ~5km tolerans i grader
    
    for (const wb of visibleWaterBodies) {
      const [wbLat, wbLng] = wb.coordinates;
      const distance = Math.sqrt(
        Math.pow(lat - wbLat, 2) + Math.pow(lng - wbLng, 2)
      );
      
      if (distance < tolerance) {
        return wb;
      }
    }
    
    return null;
  };

  const clearSelection = () => {
    // Uppdatera både state och ref synkront
    selectedWaterBodyRef.current = null;
    setSelectedWaterBody(null);
    setWaterData(null);
    
    if (mapRef.current) {
      const map = mapRef.current;
      // Remove all highlight layers
      ['selected-water-polygon', 'selected-water-outline', 'highlight-circle'].forEach(layerId => {
        if (map.getLayer(layerId)) {
          map.removeLayer(layerId);
        }
      });
      ['selected-water-source', 'highlight-source'].forEach(sourceId => {
        if (map.getSource(sourceId)) {
          map.removeSource(sourceId);
        }
      });
    }
  };

  // HJÄLPFUNKTIONER för geometri-highlighting
  const isValidGeometryForHighlighting = (geometry: any): boolean => {
    if (!geometry) return false;
    
    const validTypes = ['Polygon', 'MultiPolygon', 'GeometryCollection', 'LineString', 'MultiLineString'];
    return validTypes.includes(geometry.type);
  };

  const prepareGeometryForHighlighting = (waterBody: ScandinavianWaterBody) => {
    const { geometry } = waterBody;
    
    // Om det är en GeometryCollection (flera segment), skapa FeatureCollection
    if (geometry.type === 'GeometryCollection') {
      return {
        type: 'FeatureCollection',
        features: geometry.geometries.map((geom: any, index: number) => ({
          type: 'Feature',
          properties: { 
            name: waterBody.name,
            segment: index + 1,
            total_segments: geometry.geometries.length,
            geometry_type: geom.type // För att avgöra highlighting-typ
          },
          geometry: geom
        }))
      };
    }
    
    // Vanlig geometri
    return {
      type: 'Feature',
      geometry: geometry,
      properties: { 
        name: waterBody.name,
        geometry_type: geometry.type
      }
    };
  };

  // Avgör om geometrin borde fyllas (polygoner) eller bara ha linje (åar/floder)
  const shouldUsePolygonFill = (geometry: any): boolean => {
    if (!geometry) return false;
    
    if (geometry.type === 'GeometryCollection') {
      // Om GeometryCollection innehåller bara LineString/MultiLineString → ingen fill
      return geometry.geometries.some((geom: any) => 
        geom.type === 'Polygon' || geom.type === 'MultiPolygon'
      );
    }
    
    // Bara polygoner får fill, linjer får bara outline
    return geometry.type === 'Polygon' || geometry.type === 'MultiPolygon';
  };

  const handleWaterBodyClick = async (waterBody: ScandinavianWaterBody) => {
    // Uppdatera både state och ref synkront
    selectedWaterBodyRef.current = waterBody;
    setSelectedWaterBody(waterBody);
    setWaterData(null);
    setLoading(true);

    if (onWaterBodySelect) {
      onWaterBodySelect(waterBody);
    }

    // Fetch detailed data for ALL water bodies now (including full geometry)
    try {
      const details = await getWaterBodyDetails(waterBody.id);
      if (details) {
        setWaterData(details.vissData);
        
        // Update the water body with complete geometry data
        if (details.waterBody.geometry) {
          waterBody.geometry = details.waterBody.geometry;
        }
      }
    } catch (error) {
      console.error('Fel vid hämtning av vattendrags-detaljer:', error);
    }
    
    setLoading(false);

    // Add polygon highlight (if geometry available) or circle fallback
    if (mapRef.current) {
      const map = mapRef.current;
      
      // Remove existing highlight layers
      ['selected-water-polygon', 'selected-water-outline', 'highlight-circle'].forEach(layerId => {
        if (map.getLayer(layerId)) {
          map.removeLayer(layerId);
        }
      });
      ['selected-water-source', 'highlight-source'].forEach(sourceId => {
        if (map.getSource(sourceId)) {
          map.removeSource(sourceId);
        }
      });

      // Show geometry if available - stöder nu även GeometryCollection
      if (waterBody.geometry && isValidGeometryForHighlighting(waterBody.geometry)) {
        
        // Skapa GeoJSON data för highlighting
        const highlightData = prepareGeometryForHighlighting(waterBody);
        
        // Add geometry source
        map.addSource('selected-water-source', {
          type: 'geojson',
          data: highlightData
        });

        // Bara lägg till fill för polygoner (sjöar), inte för åar/floder
        if (shouldUsePolygonFill(waterBody.geometry)) {
          map.addLayer({
            id: 'selected-water-polygon',
            type: 'fill',
            source: 'selected-water-source',
            paint: {
              'fill-color': '#0ea5e9',
              'fill-opacity': 0.15
            }
          });
        }

        // Add outline - fungerar för alla geometrityper (både sjöar och åar)
        map.addLayer({
          id: 'selected-water-outline',
          type: 'line',
          source: 'selected-water-source',
          paint: {
            'line-color': '#0ea5e9',
            'line-width': shouldUsePolygonFill(waterBody.geometry) ? 2 : 3, // Tjockare linje för åar
            'line-opacity': 0.8
          }
        });

        // Fit map to geometry bounds
        try {
          const bbox = turf.bbox(waterBody.geometry);
          map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], {
            padding: 50,
            maxZoom: 14
          });
        } catch (e) {
          console.warn('Could not fit bounds to geometry:', e);
        }

      } else {
        // Fallback to circle highlight
        const center = [waterBody.coordinates[1], waterBody.coordinates[0]];
        const radius = Math.max(100, (waterBody.area_km2 || 1) * 100);
        
        map.addSource('highlight-source', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: center
            }
          }
        });

        map.addLayer({
          id: 'highlight-circle',
          type: 'circle',
          source: 'highlight-source',
          paint: {
            'circle-radius': radius / (Math.pow(2, map.getZoom() - 10)),
            'circle-color': '#0ea5e9',
            'circle-opacity': 0.1,
            'circle-stroke-color': '#0ea5e9',
            'circle-stroke-width': 2,
            'circle-stroke-opacity': 0.8
          }
        });
      }

      // Highlight stannar kvar tills användaren klickar någon annanstans
    }
  };

  return (
    <div className="relative w-full h-full">
      {/* Map Container */}
      <div ref={mapContainer} className="w-full h-full" />

      {/* Info Panel */}
      <WaterBodyInfoPanel
        waterBody={selectedWaterBody}
        waterData={waterData}
        loading={loading}
        onClose={clearSelection}
      />
    </div>
  );
});

ScandinavianWaterMapGL.displayName = 'ScandinavianWaterMapGL';

export default ScandinavianWaterMapGL;