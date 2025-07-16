'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useMap } from 'react-map-gl/maplibre';
import { Source, Layer } from 'react-map-gl/maplibre';
import React from 'react';
import { useTimeSlider } from '../context/TimeSliderContext';
import { useHeavyThrottle, useDraggingDetection } from '../../lib/throttleHooks';
import type { GeoJSON } from 'geojson';

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

interface MackerelProbabilityLayerProps {
  visible?: boolean;
  opacity?: number;
}

interface HotspotData {
  lat: number;
  lon: number;
  value: number;
  timestamp: string;
}

const MackerelProbabilityLayer = React.memo<MackerelProbabilityLayerProps>(({ 
  visible = true, 
  opacity = 0.8 
}) => {
  const { current: map } = useMap();
  const { selectedHour, baseTime } = useTimeSlider();
  
  // Detect if user is actively dragging
  const isDragging = useDraggingDetection(selectedHour);
  
  // Use different throttling based on dragging state  
  const lightThrottledHour = useHeavyThrottle(selectedHour, 100);   // Faster when not dragging
  const heavyThrottledHour = useHeavyThrottle(selectedHour, 500);   // Slower when dragging
  const effectiveSelectedHour = isDragging ? heavyThrottledHour : lightThrottledHour;
  
  const [metadata, setMetadata] = useState<MackerelProbabilityMetadata | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [preloadedImages, setPreloadedImages] = useState<Map<string, HTMLImageElement>>(new Map());
  const [hotspotData, setHotspotData] = useState<HotspotData[]>([]);
  const [hotspotGeoJSON, setHotspotGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);

  // Dynamisk upptäckt av tillgängliga bilder från metadata
  const availableImages = useMemo(() => {
    // Hantera både nytt format (images array) och gammalt format (timestamps)
    if (metadata?.images) {
      // Nytt format - använd filename direkt utan extra transformation
      return metadata.images.map(image => {
        // Extrahera filnamnet utan .png extension
        return image.filename.replace('.png', '').replace('mackerel_probability_', '');
      });
    } else if (metadata?.timestamps) {
      // Gammalt format - konvertera timestamps till safe filenames
      return metadata.timestamps.map(timestamp => 
        timestamp.replaceAll(':', '-').replaceAll('+', 'plus')
      );
    }
    return [];
  }, [metadata?.images, metadata?.timestamps]);

  // 1) Ladda metadata FÖRST, sedan preload bilder i bakgrunden - EAGER LOADING
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const response = await fetch('/data/mackerel-probability-images-mercator/metadata.json');
        
        if (!response.ok) {
          console.warn('⚠️ Makrill metadata inte tillgänglig än - kör generate_mackerel_probability.py först');
          return;
        }
        
        const data = await response.json();
        setMetadata(data);
        console.log('✅ Makrill metadata laddad (eager):', data);
        
      } catch (error) {
        console.warn('⚠️ Kunde inte ladda makrill metadata:', error);
      }
    };
    
    // Ladda metadata direkt vid komponentstart - ingen visible check
    loadMetadata();
  }, []);

  // 1.5) Preload bilder i bakgrunden EFTER metadata laddats - IMMEDIATE PRELOADING
  useEffect(() => {
    if (availableImages.length === 0) return;
    
    const preloadImages = async () => {
      console.log(`🐟 Bakgrundspreloading av ${availableImages.length} makrillbilder...`);
      const imageMap = new Map<string, HTMLImageElement>();
      let loadedCount = 0;
      
      // Preload bilder gradvis för att inte blockera UI
      for (const safeTimestamp of availableImages) {
        const img = new Image();
        const imageUrl = `/data/mackerel-probability-images-mercator/mackerel_probability_${safeTimestamp}.png`;
        
        img.onload = () => {
          imageMap.set(safeTimestamp, img);
          loadedCount++;
          if (loadedCount % 10 === 0) {
            console.log(`✅ Preloaded ${loadedCount}/${availableImages.length} makrillbilder`);
          }
          // Update preloaded images incrementally
          setPreloadedImages(prev => new Map([...prev, [safeTimestamp, img]]));
        };
        
        img.onerror = () => {
          console.log(`⚠️ Kunde inte preload makrill: ${safeTimestamp}`);
        };
        
        img.src = imageUrl;
        
        // Small delay to prevent blocking the UI
        await new Promise(resolve => setTimeout(resolve, 8));
      }
      
      console.log(`🎉 Alla ${loadedCount} makrillbilder preloadade!`);
    };
    
    // Start preloading immediately with small delay after current images
    setTimeout(preloadImages, 300);
  }, [availableImages]);

  // 2) Memoized timestamp prefix - DEFAULT till current time om baseTime saknas
  const timestampPrefix = useMemo(() => {
    // Om baseTime saknas, använd current time som fallback
    const currentTime = baseTime || Date.now();
    return new Date(currentTime + effectiveSelectedHour * 3600_000)
      .toISOString().slice(0, 13);
  }, [effectiveSelectedHour, baseTime]);

  // 2.5) Ladda initial bild direkt när metadata finns (inte vänta på interaction)
  useEffect(() => {
    if (!metadata || currentImageUrl) return;
    
    // Hitta närmaste tidsstämpel till nuvarande tid
    const now = new Date().toISOString().slice(0, 13);
    let initialImage = null;
    
    if (metadata.images) {
      // Nytt format
      initialImage = metadata.images.find(img => img.timestamp.startsWith(now)) || metadata.images[0];
    } else if (metadata.timestamps) {
      // Gammalt format
      const initialTimestamp = metadata.timestamps.find(ts => ts.startsWith(now)) || metadata.timestamps[0];
      initialImage = { timestamp: initialTimestamp, filename: `mackerel_probability_${initialTimestamp.replaceAll(':', '-').replaceAll('+', 'plus')}.png` };
    }
    
    if (initialImage) {
      const safeTimestamp = initialImage.filename.replace('.png', '').replace('mackerel_probability_', '');
      const imageUrl = `/data/mackerel-probability-images-mercator/mackerel_probability_${safeTimestamp}.png`;
      
      console.log('🎯 Laddar initial makrill bild:', safeTimestamp);
      setCurrentImageUrl(imageUrl);
      
      // Ladda bilden direkt även om den inte är preloaded
      const preloadedImg = preloadedImages.get(safeTimestamp);
      if (preloadedImg) {
        setImageLoaded(true);
      } else {
        // Ladda bilden manuellt om den inte är preloaded
        const img = new Image();
        img.onload = () => {
          setImageLoaded(true);
          console.log('✅ Initial makrill bild laddad');
        };
        img.onerror = () => {
          console.log('❌ Kunde inte ladda initial makrill bild');
        };
        img.src = imageUrl;
      }
    }
  }, [metadata, preloadedImages]);

  // 3) Hitta rätt bild för nuvarande tidsstämpel
  const findImageForTimestamp = useMemo(() => {
    return (prefix: string) => {
      if (!metadata) return null;
      
      let matchingImage = null;
      
      if (metadata.images) {
        // Nytt format - sök i images array
        matchingImage = metadata.images.find(img => 
          img.timestamp.startsWith(prefix)
        );
      } else if (metadata.timestamps) {
        // Gammalt format - sök i timestamps array
        const matchingTimestamp = metadata.timestamps.find(ts => 
          ts.startsWith(prefix)
        );
        if (matchingTimestamp) {
          matchingImage = { 
            timestamp: matchingTimestamp, 
            filename: `mackerel_probability_${matchingTimestamp.replaceAll(':', '-').replaceAll('+', 'plus')}.png` 
          };
        }
      }
      
      if (!matchingImage) {
        return null;
      }
      
      const safeTimestamp = matchingImage.filename.replace('.png', '').replace('mackerel_probability_', '');
      const imageUrl = `/data/mackerel-probability-images-mercator/mackerel_probability_${safeTimestamp}.png`;
      
      return imageUrl;
    };
  }, [metadata, availableImages]);

  // 4) Smart bildväxling - använd preloaded om tillgänglig, annars ladda direkt
  useEffect(() => {
    if (!timestampPrefix || !metadata) return;
    
    const imageUrl = findImageForTimestamp(timestampPrefix);
    
    if (imageUrl !== currentImageUrl) {
      setCurrentImageUrl(imageUrl);
      
      if (imageUrl) {
        // Extrahera filename från URL för att matcha preloadad bild
        const filename = imageUrl.split('/').pop();
        const safeTimestamp = filename?.replace('mackerel_probability_', '').replace('.png', '');
        
        const preloadedImg = preloadedImages.get(safeTimestamp || '');
        
        if (preloadedImg) {
          setImageLoaded(true); // INSTANT - bilden är redan laddad!
        } else {
          // Bilden är inte preloaded, ladda den direkt
          setImageLoaded(false);
          const img = new Image();
          img.onload = () => {
            // Dubbelkolla att detta fortfarande är rätt bild
            if (img.src === imageUrl) {
              setImageLoaded(true);
            }
          };
          img.onerror = () => {
            console.log('❌ Kunde inte ladda makrill bild:', safeTimestamp);
          };
          img.src = imageUrl;
        }
      } else {
        setImageLoaded(false);
      }
    }
  }, [timestampPrefix, metadata, findImageForTimestamp, preloadedImages, currentImageUrl]);

  // 5) Skapa MapLibre GL Source/Layer för raster
  const rasterSource = useMemo(() => {
    if (!currentImageUrl || !imageLoaded || !metadata) {
      return null;
    }
    
    // Använd wgs84_bbox för nya formatet, bbox för gamla formatet
    const bbox = metadata.wgs84_bbox || metadata.bbox;
    if (!bbox) {
      console.warn('⚠️ Ingen bbox hittad i makrill metadata');
      return null;
    }
    
    const [lon_min, lon_max, lat_min, lat_max] = bbox;
    
    // VIKTIGT: MapLibre förväntar sig WGS84-koordinater direkt!
    // Använd WGS84 bbox direkt utan offset-beräkningar (samma som andra mercator-lager)
    const wgs84Coordinates = [
      [lon_min, lat_max], // top-left
      [lon_max, lat_max], // top-right
      [lon_max, lat_min], // bottom-right
      [lon_min, lat_min]  // bottom-left
    ] as [[number, number], [number, number], [number, number], [number, number]];
    
    console.log('🐟 Makrill använder WGS84-koordinater:', {
      wgs84Coordinates,
      bbox
    });
    
    return {
      type: 'image' as const,
      url: currentImageUrl,
      coordinates: wgs84Coordinates
    };
  }, [currentImageUrl, imageLoaded, metadata]);

  // 6) Layer configuration
  const rasterLayer = useMemo(() => {
    if (!visible) return null;
    
    return {
      id: 'mackerel-probability-raster',
      type: 'raster' as const,
      paint: {
        'raster-opacity': opacity,
        'raster-fade-duration': 300, // Mjuk övergång mellan bilder
      }
    };
  }, [visible, opacity]);

  // Load hotspot data for current timestamp
  useEffect(() => {
    if (!visible || !effectiveSelectedHour) {
      setHotspotData([]);
      return;
    }

    const timestampISO = new Date(baseTime + effectiveSelectedHour * 3600_000).toISOString();
    const safeTimestamp = timestampISO.replace(/:/g, '-').replace(/\+/g, 'plus');
    
    // Load compressed mackerel values
    const loadHotspotData = async () => {
      try {
        const response = await fetch(`/data/mackerel-probability-images-mercator/mackerel-values/mackerel_values_${safeTimestamp}.json.gz`);
        
        if (!response.ok) {
          console.log(`📊 Ingen makrill-data för ${safeTimestamp}`);
          setHotspotData([]);
          return;
        }

        // Try to decompress gzip data if DecompressionStream is available
        let jsonText: string;
        try {
          if (typeof DecompressionStream !== 'undefined' && response.body) {
            const decompressed = await new Response(
              response.body.pipeThrough(new DecompressionStream('gzip'))
            ).text();
            jsonText = decompressed;
          } else {
            // Fallback: try to read as text directly (might not work for compressed data)
            console.log('⚠️ DecompressionStream not available, trying direct text read');
            jsonText = await response.text();
          }
        } catch (decompressionError) {
          console.log('⚠️ Decompression failed, trying direct text read:', decompressionError);
          jsonText = await response.text();
        }
        
        const data = JSON.parse(jsonText);
        
        // Filter for hotspots (≥90% probability)
        const hotspots = data.values.filter((point: any) => point.value >= 90.0);
        
        setHotspotData(hotspots);
        console.log(`🔥 Laddade ${hotspots.length} hotspots för ${safeTimestamp}`);
        
      } catch (error) {
        console.log(`⚠️ Kunde inte ladda makrill-värden: ${error}`);
        setHotspotData([]);
      }
    };

    loadHotspotData();
  }, [visible, effectiveSelectedHour, baseTime]);

  // Generate hotspot text GeoJSON
  useEffect(() => {
    if (!visible || !hotspotData.length) {
      setHotspotGeoJSON(null);
      return;
    }

    // Sample hotspots to avoid overcrowding (every 3rd point)
    const sampledHotspots = hotspotData.filter((_, index) => index % 3 === 0);
    
    const features: GeoJSON.Feature[] = sampledHotspots.map((hotspot, index) => ({
      type: 'Feature',
      properties: {
        id: `hotspot-${index}`,
        value: hotspot.value,
        text: 'HOT',
        textColor: '#FFD700',
        textHaloColor: '#000000',
        textHaloWidth: 2,
        textSize: 11
      },
      geometry: {
        type: 'Point',
        coordinates: [hotspot.lon, hotspot.lat]
      }
    }));

    setHotspotGeoJSON({
      type: 'FeatureCollection',
      features
    });
  }, [visible, hotspotData]);

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
          console.log('🔥 Hotspot text forced to TOP (above arrows)');
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
    if (metadata && currentImageUrl) {
      console.log('🐟 Makrill debug:', {
        parameter: metadata.parameter,
        total_images: metadata.total_images,
        current_image: currentImageUrl?.split('/').pop(),
        bbox: metadata.wgs84_bbox || metadata.bbox
      });
    }
  }, [metadata, currentImageUrl]);

  // Visa inget om inte synligt eller ingen data
  if (!visible || !rasterSource || !rasterLayer) {
    return null;
  }

  // Render both raster and hotspot text layers
  return (
    <>
      {/* Raster layer */}
      {visible && rasterSource && rasterLayer && (
        <Source id="mackerel-probability-source" {...rasterSource}>
          <Layer {...rasterLayer} />
        </Source>
      )}
      
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