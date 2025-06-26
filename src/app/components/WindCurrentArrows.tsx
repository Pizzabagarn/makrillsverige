'use client';

import React, { useEffect, useRef } from 'react';
import { Map } from 'maplibre-gl';

interface VectorData {
  lat: number;
  lon: number;
  u: number; // Östlig komponent
  v: number; // Nordlig komponent
  magnitude?: number;
  direction?: number;
}

interface WindCurrentArrowsProps {
  map: Map | null;
  data: VectorData[];
  type: 'wind' | 'current';
  visible: boolean;
  minZoom?: number;
  maxSpeed?: number;
}

/**
 * Beräkna vindriktning från u/v komponenter enligt guidens specifikation
 * @param u Östlig hastighet (m/s)
 * @param v Nordlig hastighet (m/s)  
 * @returns Riktning i grader från norr, medurs (0° = nordlig)
 */
function calculateDirection(u: number, v: number): number {
  // Enligt guiden: bearing = (atan2(u, v) * 180/PI + 360) % 360
  // Detta ger gradtal med 0° = nordlig vind/ström
  const bearing = (Math.atan2(u, v) * 180 / Math.PI + 360) % 360;
  return bearing;
}

/**
 * Beräkna magnitud (hastighet) från u/v komponenter
 */
function calculateMagnitude(u: number, v: number): number {
  return Math.sqrt(u * u + v * v);
}

/**
 * Konvertera vektor-data till GeoJSON format för MapLibre
 */
function createArrowGeoJSON(data: VectorData[], type: string): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = data
    .filter(point => !isNaN(point.u) && !isNaN(point.v))
    .map(point => {
      const magnitude = point.magnitude ?? calculateMagnitude(point.u, point.v);
      const direction = point.direction ?? calculateDirection(point.u, point.v);
      
      // Skippa mycket svaga vektorer för bättre prestanda
      if (magnitude < 0.1) return null;
      
      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [point.lon, point.lat]
        },
        properties: {
          [`${type}Speed`]: magnitude,
          [`${type}Dir`]: direction,
          u: point.u,
          v: point.v
        }
      };
    })
    .filter(Boolean) as GeoJSON.Feature[];

  return {
    type: 'FeatureCollection',
    features
  };
}

/**
 * Få färg baserat på hastighet enligt guidens färgskala
 */
function getSpeedColorExpression(type: string, maxSpeed: number = 10) {
  const speedProperty = `${type}Speed`;
  
  return [
    'interpolate',
    ['linear'],
    ['get', speedProperty],
    0, '#3288bd',      // blå vid låga värden
    maxSpeed * 0.125, '#66c2a5',
    maxSpeed * 0.25,  '#abdda4', 
    maxSpeed * 0.375, '#e6f598',
    maxSpeed * 0.5,   '#fee08b',
    maxSpeed * 0.625, '#fdae61',
    maxSpeed * 0.75,  '#f46d43',
    maxSpeed,         '#d53e4f'   // röd vid mycket höga värden
  ];
}

export default function WindCurrentArrows({
  map,
  data,
  type,
  visible,
  minZoom = 6,
  maxSpeed = type === 'wind' ? 20 : 2
}: WindCurrentArrowsProps) {
  const sourceId = `${type}Points`;
  const layerId = `${type}-arrows`;
  const iconImageId = 'arrow-icon';
  
  // Ladda pilikon första gången
  useEffect(() => {
    if (!map) return;
    
    // Lägg till pilikon om den inte redan finns
    if (!map.hasImage(iconImageId)) {
      // Använd arrow.png från public/images/
      const img = new Image();
      img.onload = () => {
        if (map.hasImage(iconImageId)) return; // Undvik dubbel-adding
        map.addImage(iconImageId, img, { sdf: true }); // SDF för att kunna färga
      };
      img.crossOrigin = 'anonymous'; // För att undvika CORS-problem
      img.src = '/images/arrow.png';
    }
  }, [map, iconImageId]);

  // Hantera data och synlighet
  useEffect(() => {
    if (!map || !map.hasImage(iconImageId)) return;
    
    try {
      // Ta bort befintliga lager
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
      if (map.getSource(sourceId)) {
        map.removeSource(sourceId);
      }
      
      if (!visible || !data.length) return;
      
      // Skapa GeoJSON från vektordata
      const geoJson = createArrowGeoJSON(data, type);
      
      // Lägg till källa med clustering enligt guiden
      map.addSource(sourceId, {
        type: 'geojson',
        data: geoJson,
        cluster: true,
        clusterMaxZoom: 8, // Visa enskilda pilar vid zoom > 8
        clusterRadius: 30,
        clusterProperties: {
          // Aggregering för kluster - ta max hastighet och medel riktning
          [`${type}Speed`]: ['max', ['get', `${type}Speed`]],
          [`${type}Dir`]: ['get', `${type}Dir`] // Förenklad - ta en representativ riktning
        }
      });
      
      // Lägg till symbol-lager med roterbara pilar enligt guiden
      map.addLayer({
        id: layerId,
        type: 'symbol',
        source: sourceId,
        minzoom: minZoom,
        layout: {
          'icon-image': iconImageId,
          'icon-size': [
            'interpolate',
            ['linear'],
            ['get', `${type}Speed`],
            0, 0.4,     // Minsta storlek (ökning från 0.3)
            maxSpeed, 0.8  // Maxstorlek (minskning från 1.2 för bättre balans)
          ],
          'icon-rotate': ['get', `${type}Dir`], // Rotera enligt riktning
          'icon-rotation-alignment': 'map',     // Rotation relativt kartan
          'icon-anchor': 'center',              // Ankra i centrum
          'icon-allow-overlap': true,           // Tillåt överlappning för tätare data
          'icon-ignore-placement': true
        },
                 paint: {
           'icon-color': getSpeedColorExpression(type, maxSpeed) as any,
          'icon-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            minZoom, 0.6,
            minZoom + 2, 0.9
          ]
        },
        filter: ['!', ['has', 'point_count']] // Visa endast icke-klustrade punkter
      });
      
      // Lägg till kluster-cirklar (valfritt)
      map.addLayer({
        id: `${layerId}-clusters`,
        type: 'circle',
        source: sourceId,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'step',
            ['get', 'point_count'],
            '#51bbd6',
            100, '#f1f075',
            750, '#f28cb1'
          ],
          'circle-radius': [
            'step',
            ['get', 'point_count'],
            20,
            100, 30,
            750, 40
          ],
          'circle-opacity': 0.7
        }
      });
      
      // Lägg till kluster-antal som text
      map.addLayer({
        id: `${layerId}-cluster-count`,
        type: 'symbol',
        source: sourceId,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
          'text-size': 12
        },
        paint: {
          'text-color': '#ffffff'
        }
      });
      
      console.log(`🏹 Added ${type} arrows: ${geoJson.features.length} vectors`);
      
    } catch (error) {
      console.error(`Failed to add ${type} arrows:`, error);
    }
    
    // Cleanup
    return () => {
      if (!map) return;
      [`${layerId}-cluster-count`, `${layerId}-clusters`, layerId].forEach(id => {
        if (map.getLayer(id)) {
          map.removeLayer(id);
        }
      });
      if (map.getSource(sourceId)) {
        map.removeSource(sourceId);
      }
    };
  }, [map, data, type, visible, minZoom, maxSpeed, sourceId, layerId, iconImageId]);
  
  return null; // Denna komponent renderar direkt på kartan
} 