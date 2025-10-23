// src/app/api/routing/route.ts
// Server-side API route för att hantera OpenRouteService requests
// Detta håller API-nyckeln säker på servern

import { NextRequest, NextResponse } from 'next/server';
import { calculateElevationAdjustedTime } from '@/lib/smartRoutingService';

// Minimal polyline decoder supporting precision 5 or 6 (ORS default is 5)
function decodeEncodedPolyline(encoded: string, precision: 5 | 6 = 5): [number, number][] {
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;
  const coordinates: [number, number][] = [];
  const factor = Math.pow(10, precision);

  while (index < len) {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += dlat;

    result = 0;
    shift = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += dlng;

    const latitude = lat / factor;
    const longitude = lng / factor;
    // Return as [lng, lat] for MapLibre
    coordinates.push([longitude, latitude]);
  }

  return coordinates;
}

function normalizeRouteGeometry(route: any): { type: 'LineString'; coordinates: [number, number][] } {
  const geom = route.geometry;
  if (!geom) {
    return { type: 'LineString', coordinates: [] };
  }
  if (typeof geom === 'string') {
    // Try precision 5 first (ORS default), fallback to 6 if path looks degenerate
    let coords = decodeEncodedPolyline(geom, 5);
    // Heuristic: if bbox width/height is unrealistically tiny, retry with 6
    const [minLng, minLat, maxLng, maxLat] = (function () {
      let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
      for (const [lng, lat] of coords) {
        if (lng < minLng) minLng = lng;
        if (lat < minLat) minLat = lat;
        if (lng > maxLng) maxLng = lng;
        if (lat > maxLat) maxLat = lat;
      }
      return [minLng, minLat, maxLng, maxLat] as [number, number, number, number];
    })();
    const spanLng = Math.abs(maxLng - minLng);
    const spanLat = Math.abs(maxLat - minLat);
    if ((spanLng < 0.0001 && spanLat < 0.0001) || coords.length < 2) {
      coords = decodeEncodedPolyline(geom, 6);
    }
    return { type: 'LineString', coordinates: coords };
  }
  if (geom.type === 'LineString' && Array.isArray(geom.coordinates)) {
    return { type: 'LineString', coordinates: geom.coordinates };
  }
  // Fallback
  return { type: 'LineString', coordinates: [] };
}

/**
 * PROFESSIONELL LÖSNING: Använd Overpass API (OpenStreetMap) för att hitta närmaste väg/stig
 * Mycket snabbare och mer exakt än att testa olika riktningar
 * @param includeFootpaths - Om true, inkludera även gång/cykelvägar och stigar
 */
async function findNearestRoadViaOverpass(
  coord: [number, number], // [lng, lat]
  maxRadiusKm: number = 50,
  includeFootpaths: boolean = false
): Promise<{ point: [number, number]; distance: number; wayType: string } | null> {
  
  const [lng, lat] = coord;
  
  // Testa progressivt större radier tills vi hittar en väg
  const radii = [2, 5, 10, 20, 50];
  
  for (const radiusKm of radii) {
    const pathType = includeFootpaths ? 'vägar/stigar' : 'vägar';
    console.log(`🗺️  Söker ${pathType} i OSM inom ${radiusKm}km radie...`);
    
    // Beräkna bounding box
    const latDegPerKm = 1 / 110.574;
    const lngDegPerKm = 1 / (111.320 * Math.cos(lat * Math.PI / 180));
    
    const latRadius = radiusKm * latDegPerKm;
    const lngRadius = radiusKm * lngDegPerKm;
    
    const bbox = {
      south: lat - latRadius,
      north: lat + latRadius,
      west: lng - lngRadius,
      east: lng + lngRadius
    };
    
    // Overpass QL query - hitta körbar väg (highway) eller gångstig
    // För gång: inkludera footway, path, track, cycleway
    // För bil: endast körbar väg
    const highwayTypes = includeFootpaths
      ? "motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|footway|path|track|cycleway|steps"
      : "motorway|trunk|primary|secondary|tertiary|unclassified|residential|service";
    
    const query = `
      [out:json][timeout:10];
      (
        way["highway"~"^(${highwayTypes})$"]
           (${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      );
      out geom;
    `;
    
    try {
      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`
      });
      
      if (!response.ok) {
        console.warn(`Overpass API error: ${response.status}`);
        continue;
      }
      
      const data = await response.json();
      
      if (!data.elements || data.elements.length === 0) {
        console.log(`Inga ${pathType} hittades inom ${radiusKm}km`);
        continue;
      }
      
      console.log(`✅ Hittade ${data.elements.length} vägsegment i OSM`);
      
      // Hitta närmaste punkt på alla vägsegment
      let nearestPoint: [number, number] | null = null;
      let shortestDistance = Infinity;
      let bestWayType = 'unknown';
      
      for (const element of data.elements) {
        if (element.type !== 'way' || !element.geometry) continue;
        
        const wayType = element.tags?.highway || 'unknown';
        
        // Gå igenom alla punkter i vägsegmentet
        for (const node of element.geometry) {
          const nodeLng = node.lon;
          const nodeLat = node.lat;
          const distance = haversineDistanceMeters(coord, [nodeLng, nodeLat]);
          
          if (distance < shortestDistance) {
            shortestDistance = distance;
            nearestPoint = [nodeLng, nodeLat];
            bestWayType = wayType;
          }
        }
      }
      
      if (nearestPoint) {
        console.log(`✅ Närmaste ${includeFootpaths ? 'väg/stig' : 'väg'}: ${Math.round(shortestDistance / 1000)}km (${bestWayType})`);
        return {
          point: nearestPoint,
          distance: shortestDistance,
          wayType: bestWayType
        };
      }
      
    } catch (error) {
      console.error(`Overpass API fel vid ${radiusKm}km radie:`, error);
      continue;
    }
  }
  
  console.log(`❌ Kunde inte hitta någon ${includeFootpaths ? 'väg/stig' : 'väg'} via Overpass inom 50km`);
  return null;
}

/**
 * Routing till den punkt vi hittade via Overpass
 */
async function routeToOverpassPoint(
  profile: string,
  start: [number, number],
  roadPoint: [number, number],
  apiKey: string
): Promise<any | null> {
  
  try {
    const url = `https://api.openrouteservice.org/v2/directions/${profile}/json`;
    const body = {
      coordinates: [start, roadPoint],
      instructions: true,
      radiuses: [-1, -1]
    };
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      console.error('ORS routing till Overpass-punkt misslyckades:', response.status);
      return null;
    }
    
    const data = await response.json();
    return data.routes?.[0] || null;
    
  } catch (error) {
    console.error('Fel vid routing till Overpass-punkt:', error);
    return null;
  }
}

function haversineDistanceMeters(a: [number, number], b: [number, number]): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371000; // meters
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

function computeBboxFromCoords(coords: [number, number][]): [number, number, number, number] {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLng, minLat, maxLng, maxLat];
}

async function enrichElevationAndComputeTerrain(
  line: { type: 'LineString'; coordinates: [number, number][] },
  apiKey: string
): Promise<{ elevationGainMeters: number; elevationLossMeters: number } | null> {
  try {
    if (!line.coordinates || line.coordinates.length < 2) return null;
    const url = 'https://api.openrouteservice.org/elevation/line';
    const body = {
      format_in: 'geojson',
      format_out: 'geojson',
      geometry: line
    } as any;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) return null;
    const data = await res.json();
    const coords = data?.geometry?.coordinates as number[][] | undefined;
    if (!coords || coords.length < 2) return null;
    let gain = 0;
    let loss = 0;
    for (let i = 1; i < coords.length; i++) {
      const prev = coords[i - 1];
      const curr = coords[i];
      const dz = (curr[2] ?? 0) - (prev[2] ?? 0);
      if (dz > 0) gain += dz; else loss += -dz;
    }
    return { elevationGainMeters: gain, elevationLossMeters: loss };
  } catch {
    return null;
  }
}

function createStraightWalkSegment(start: [number, number], end: [number, number]) {
  const distance = haversineDistanceMeters(start, end);
  const walkingSpeedMps = 1.4; // ~5 km/h
  const duration = distance / walkingSpeedMps;
  return {
    geometry: { type: 'LineString' as const, coordinates: [start, end] as [number, number][] },
    segment: { distance, duration, steps: [{ instruction: 'Walk to destination', distance, duration, type: 0, name: '' }] }
  };
}

export async function POST(request: NextRequest) {
  try {
    const { start, end, mode } = await request.json();

    if (!start || !end || !Array.isArray(start) || !Array.isArray(end)) {
      return NextResponse.json(
        { error: 'Ogiltiga koordinater' },
        { status: 400 }
      );
    }

    const apiKey = process.env.ORS_API_KEY;
    
    if (!apiKey) {
      console.error('ORS_API_KEY saknas i .env.local');
      return NextResponse.json(
        { error: 'API-nyckel saknas' },
        { status: 500 }
      );
    }

    const transportMode = mode || 'driving-car';
    
    // För BIL/CYKEL: hitta närmaste väg, sen beräkna gång-sträcka automatiskt
    // För GÅNG: direkt till destinationen
    const isVehicle = transportMode === 'driving-car' || transportMode === 'cycling-regular';
    
    if (isVehicle) {
      // MULTIMODAL: Bil/cykel + gång
      // 1. Försök normal ORS routing först
      const vehicleUrl = `https://api.openrouteservice.org/v2/directions/${transportMode}/json`;
      const vehicleBody = {
        coordinates: [start, end],
        instructions: true,
        radiuses: [-1, -1] // Ingen snapping
      };

      console.log('🚗 Försöker normal ORS vehicle routing...');
      
      const vehicleResponse = await fetch(vehicleUrl, {
        method: 'POST',
        headers: {
          'Authorization': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(vehicleBody)
      });

      let vehicleRoute = null;
      let usedOverpass = false;

      if (vehicleResponse.ok) {
        const vehicleData = await vehicleResponse.json();
        vehicleRoute = vehicleData.routes?.[0];
        console.log('✅ ORS vehicle routing lyckades');
      } else {
        // ORS misslyckades - försök med Overpass
        const errorText = await vehicleResponse.text();
        console.log('⚠️ ORS vehicle routing misslyckades:', errorText);
        
        if (errorText.includes('Could not find routable point')) {
          console.log('🗺️  Använder Overpass API som fallback...');
          const roadPoint = await findNearestRoadViaOverpass(end as [number, number], 50);
          
          if (roadPoint) {
            console.log(`✅ OSM: ${roadPoint.wayType} ${Math.round(roadPoint.distance / 1000)}km från sjön`);
            vehicleRoute = await routeToOverpassPoint(transportMode, start as [number, number], roadPoint.point, apiKey);
            usedOverpass = true;
          }
        }
      }
      
      if (!vehicleRoute) {
        console.log('❌ Kunde inte hitta fordonväg - fallback till gång');
        // Fallback till pure walking
        const walkUrl = 'https://api.openrouteservice.org/v2/directions/foot-walking/json';
        const walkBody = {
          coordinates: [start, end],
          instructions: true,
          language: 'sv',
          radiuses: [-1, -1],
          elevation: true
        };

        const walkResponse = await fetch(walkUrl, {
          method: 'POST',
          headers: {
            'Authorization': apiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(walkBody)
        });
        
        if (walkResponse.ok) {
          const walkData = await walkResponse.json();
          const wr = walkData.routes?.[0];
          if (wr) {
            const geometry = normalizeRouteGeometry(wr);
            const terrain = await enrichElevationAndComputeTerrain(geometry, apiKey);
            
            let adjustedDuration = wr.summary?.duration || 0;
            if (terrain) {
              adjustedDuration = calculateElevationAdjustedTime(
                wr.summary?.duration || 0,
                terrain.elevationGainMeters,
                terrain.elevationLossMeters
              );
            }
            
            const enriched = {
              ...wr,
              geometry,
              summary: {
                distance: wr.summary?.distance || 0,
                duration: adjustedDuration
              },
              distanceRoadToWaterMeters: wr.summary?.distance,
              walkDurationSeconds: adjustedDuration,
              terrain
            } as any;
            return NextResponse.json({ routes: [enriched], metadata: walkData.metadata });
          }
        }
        
        // Ultimate fallback: straight line with elevation
        const { geometry: straightGeom, segment } = createStraightWalkSegment(start as [number, number], end as [number, number]);
        const terrain = await enrichElevationAndComputeTerrain(straightGeom, apiKey);
        let adjustedDuration = segment.duration;
        if (terrain) {
          adjustedDuration = calculateElevationAdjustedTime(segment.duration, terrain.elevationGainMeters, terrain.elevationLossMeters);
        }
        
        const bbox = computeBboxFromCoords(straightGeom.coordinates);
        return NextResponse.json({ 
          routes: [{
            geometry: straightGeom,
            segments: [{ distance: segment.distance, duration: adjustedDuration, steps: segment.steps }],
            summary: { distance: segment.distance, duration: adjustedDuration },
            distanceRoadToWaterMeters: segment.distance,
            walkDurationSeconds: adjustedDuration,
            terrain,
            bbox
          }], 
          metadata: {} 
        });
      }
      
      // Nu har vi en vehicleRoute (antingen från ORS eller via Overpass)
      
      const vehicleGeom = normalizeRouteGeometry(vehicleRoute);
      console.log('🚗 Bilrutt klar, beräknar gång-sträcka...');

      // 2. Beräkna gång-sträcka från vägens slut till sjön
        const vehicleEndPoint = vehicleGeom.coordinates[vehicleGeom.coordinates.length - 1];
      
      // Direkt till målet utan snapping (stranden är redan rätt punkt)
        const walkUrl = 'https://api.openrouteservice.org/v2/directions/foot-walking/json';
        const walkBody = {
        coordinates: [vehicleEndPoint, end], // Gå direkt till stranden
          instructions: true,
          language: 'sv',
        radiuses: [-1, -1],
        elevation: true // Hämta elevation-data
        };

        console.log('🚶 Walking routing (steg 2):', { from: vehicleEndPoint, to: end });

        const walkResponse = await fetch(walkUrl, {
          method: 'POST',
          headers: {
            'Authorization': apiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(walkBody)
        });

        if (walkResponse.ok) {
          const walkData = await walkResponse.json();
          const walkRoute = walkData.routes[0];
          
          // 3. Kombinera båda rutterna
          const vehicleGeom = normalizeRouteGeometry(vehicleRoute);
          const walkGeom = normalizeRouteGeometry(walkRoute);

          // Terräng: ALLTID beräkna höjddata för gång-delen
          const terrain = await enrichElevationAndComputeTerrain(walkGeom, apiKey);
          
          // Adjust walking time based on elevation
          let adjustedWalkDuration = walkRoute.summary.duration;
          if (terrain && (terrain.elevationGainMeters > 0 || terrain.elevationLossMeters > 0)) {
            adjustedWalkDuration = calculateElevationAdjustedTime(
              walkRoute.summary.duration,
              terrain.elevationGainMeters,
              terrain.elevationLossMeters
            );
            console.log(`⛰️ Elevation-justerad gångtid: ${walkRoute.summary.duration}s → ${adjustedWalkDuration}s (${terrain.elevationGainMeters}m upp, ${terrain.elevationLossMeters}m ner)`);
          }

          const combinedRoute = {
            ...vehicleRoute,
            geometry: {
              type: 'LineString',
              coordinates: [
                ...vehicleGeom.coordinates,
                ...walkGeom.coordinates.slice(1) // Skippa första punkten (duplikat)
              ]
            },
            // Lägg in separata geometrier för rendering (bil/cykel solid, gång prickad)
            partialGeometries: {
              vehicle: vehicleGeom,
              walk: walkGeom
            },
            segments: [
              ...vehicleRoute.segments,
              ...walkRoute.segments
            ],
            summary: {
              distance: vehicleRoute.summary.distance + walkRoute.summary.distance,
                      duration: vehicleRoute.summary.duration + adjustedWalkDuration
            },
            distanceRoadToWaterMeters: walkRoute.summary?.distance || haversineDistanceMeters(vehicleEndPoint as [number, number], end as [number, number]),
                    walkDurationSeconds: adjustedWalkDuration,
            terrain,
            bbox: [
              Math.min(vehicleRoute.bbox[0], walkRoute.bbox[0]),
              Math.min(vehicleRoute.bbox[1], walkRoute.bbox[1]),
              Math.max(vehicleRoute.bbox[2], walkRoute.bbox[2]),
              Math.max(vehicleRoute.bbox[3], walkRoute.bbox[3])
            ]
          } as any;

          console.log('✅ Multimodal route:', {
            vehicleDistance: vehicleRoute.summary.distance,
            walkDistance: walkRoute.summary.distance,
            total: combinedRoute.summary.distance
          });

          return NextResponse.json({ routes: [combinedRoute], metadata: {} });
        } else {
          // Om gång-rutten misslyckas, skapa rak gång-linje sista biten MED elevation
          const vehicleGeom = normalizeRouteGeometry(vehicleRoute);
          const { geometry: straightWalkGeom, segment: straightWalkSeg } = createStraightWalkSegment(vehicleEndPoint as [number, number], end as [number, number]);
          
          // Försök hämta elevation även för rak linje
          const terrain = await enrichElevationAndComputeTerrain(straightWalkGeom, apiKey);
          let adjustedWalkDuration = straightWalkSeg.duration;
          if (terrain && (terrain.elevationGainMeters > 0 || terrain.elevationLossMeters > 0)) {
            adjustedWalkDuration = calculateElevationAdjustedTime(
              straightWalkSeg.duration,
              terrain.elevationGainMeters,
              terrain.elevationLossMeters
            );
            console.log(`⛰️ Straight walk elevation-justerad: ${straightWalkSeg.duration}s → ${adjustedWalkDuration}s`);
          }
          
          const combinedCoords = [...vehicleGeom.coordinates, ...straightWalkGeom.coordinates.slice(1)];
          const bbox = computeBboxFromCoords(combinedCoords);
          const combinedRoute: any = {
            ...vehicleRoute,
            geometry: { type: 'LineString', coordinates: combinedCoords },
            partialGeometries: {
              vehicle: vehicleGeom,
              walk: straightWalkGeom
            },
            segments: [
              ...((vehicleRoute.segments as any[]) || []),
              { distance: straightWalkSeg.distance, duration: adjustedWalkDuration, steps: straightWalkSeg.steps }
            ],
            summary: {
              distance: (vehicleRoute.summary?.distance || 0) + straightWalkSeg.distance,
              duration: (vehicleRoute.summary?.duration || 0) + adjustedWalkDuration
            },
            distanceRoadToWaterMeters: straightWalkSeg.distance,
            walkDurationSeconds: adjustedWalkDuration,
                    terrain,
            bbox
          };
          console.log('✅ Multimodal with straight walk fallback (with elevation)');
          return NextResponse.json({ routes: [combinedRoute], metadata: {} });
        }
    } // Slut på isVehicle
    
    // För GÅNG: EXAKT samma logik som bil/cykel
    // 1. Försök ORS routing
    const walkUrl = `https://api.openrouteservice.org/v2/directions/${transportMode}/json`;
    const walkBody = {
      coordinates: [start, end],
      instructions: true,
      radiuses: [-1, -1],
      elevation: true
    };

    console.log('🚶 Walking routing request...');

    const walkResponse = await fetch(walkUrl, {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(walkBody)
    });

    let walkRoute = null as any;

    if (walkResponse.ok) {
      const walkData = await walkResponse.json();
      walkRoute = walkData.routes?.[0];
      console.log('✅ ORS walking routing lyckades');

      // Sanity-koll: om ORS slutpunkt är långt från vår verkliga destination (strand)
      // så har ORS snappat till en felaktig punkt. Då gör vi Overpass-fallback.
      try {
        if (walkRoute) {
          const geom = normalizeRouteGeometry(walkRoute);
          const last = geom.coordinates[geom.coordinates.length - 1];
          const endPoint = end as [number, number];
          const endGap = haversineDistanceMeters(last, endPoint);
          const direct = haversineDistanceMeters(start as [number, number], endPoint);
          const orsDistance = walkRoute.summary?.distance || Infinity;

          const tooFarFromEnd = endGap > 2000; // >2 km från stranden betraktas som fel snapping
          const suspiciouslyLong = isFinite(orsDistance) && direct > 0 && (orsDistance / direct) > 5; // >5x fågelvägen

          if (tooFarFromEnd || suspiciouslyLong) {
            console.log(`⚠️ ORS walking slutpunkt ${Math.round(endGap)}m från mål eller misstänkt lång (${Math.round(orsDistance/1000)}km för ${Math.round(direct/1000)}km fågelvägen). Försöker Overpass...`);
            const pathPoint = await findNearestRoadViaOverpass(end as [number, number], 50, true);
            if (pathPoint) {
              const rerouted = await routeToOverpassPoint(transportMode, start as [number, number], pathPoint.point, apiKey);
              if (rerouted) {
                walkRoute = rerouted; // Ersätt rutt med säkert mål nära vattnet
              } else {
                // Vi låter walkRoute stå kvar och hanterar rak linje nedan
              }
            }
          }
        }
      } catch (e) {
        console.warn('Sanity-koll för gång misslyckades:', e);
      }
    } else {
      // ORS misslyckades - försök med Overpass (SAMMA SOM BIL/CYKEL)
      const errorText = await walkResponse.text();
      console.log('⚠️ ORS walking routing misslyckades:', errorText);
      
      if (errorText.includes('Could not find routable point')) {
        console.log('🗺️  Använder Overpass API för att hitta gångväg...');
        const pathPoint = await findNearestRoadViaOverpass(end as [number, number], 50, true); // includeFootpaths = true
        
        if (pathPoint) {
          console.log(`✅ OSM: ${pathPoint.wayType} ${Math.round(pathPoint.distance / 1000)}km från sjön`);
          walkRoute = await routeToOverpassPoint(transportMode, start as [number, number], pathPoint.point, apiKey);
        }
      }
    }
    
    if (!walkRoute) {
      console.log('❌ Kunde inte hitta gångväg - fallback till rak linje');
      const { geometry: straightGeom, segment } = createStraightWalkSegment(start as [number, number], end as [number, number]);
      const terrain = await enrichElevationAndComputeTerrain(straightGeom, apiKey);
      let adjustedDuration = segment.duration;
      if (terrain) {
        adjustedDuration = calculateElevationAdjustedTime(segment.duration, terrain.elevationGainMeters, terrain.elevationLossMeters);
      }
      const bbox = computeBboxFromCoords(straightGeom.coordinates);
      const route: any = {
        geometry: straightGeom,
        segments: [{ distance: segment.distance, duration: adjustedDuration, steps: segment.steps }],
        summary: { distance: segment.distance, duration: adjustedDuration },
        distanceRoadToWaterMeters: segment.distance,
        walkDurationSeconds: adjustedDuration,
        terrain,
        bbox,
        isDirectPath: true
      };
      return NextResponse.json({ routes: [route], metadata: {} });
    }
    
    // Nu har vi en walkRoute - lägg till sista biten till sjön (SAMMA SOM BIL/CYKEL)
    const walkGeom = normalizeRouteGeometry(walkRoute);
    const walkEndPoint = walkGeom.coordinates[walkGeom.coordinates.length - 1];
    
    // Sista biten: rak linje från vägens slut till sjön
    const { geometry: finalWalkGeom, segment: finalWalkSeg } = createStraightWalkSegment(walkEndPoint as [number, number], end as [number, number]);
    
    const pathTerrain = await enrichElevationAndComputeTerrain(walkGeom, apiKey);
    const finalTerrain = await enrichElevationAndComputeTerrain(finalWalkGeom, apiKey);
    
    let adjustedPathDuration = walkRoute.summary?.duration || 0;
    if (pathTerrain) {
      adjustedPathDuration = calculateElevationAdjustedTime(
        walkRoute.summary?.duration || 0,
        pathTerrain.elevationGainMeters,
        pathTerrain.elevationLossMeters
      );
    }
    
    let adjustedFinalDuration = finalWalkSeg.duration;
    if (finalTerrain) {
      adjustedFinalDuration = calculateElevationAdjustedTime(
        finalWalkSeg.duration,
        finalTerrain.elevationGainMeters,
        finalTerrain.elevationLossMeters
      );
    }
    
    const combinedGeom = {
      type: 'LineString' as const,
      coordinates: [...walkGeom.coordinates, ...finalWalkGeom.coordinates.slice(1)]
    };
    
    const combinedTerrain = {
      elevationGainMeters: (pathTerrain?.elevationGainMeters || 0) + (finalTerrain?.elevationGainMeters || 0),
      elevationLossMeters: (pathTerrain?.elevationLossMeters || 0) + (finalTerrain?.elevationLossMeters || 0)
    };
    
    const totalDuration = adjustedPathDuration + adjustedFinalDuration;
    const totalDistance = (walkRoute.summary?.distance || 0) + finalWalkSeg.distance;
    
    const bbox = computeBboxFromCoords(combinedGeom.coordinates);
    const combinedRoute: any = {
      geometry: combinedGeom,
      partialGeometries: {
        walk: walkGeom,
        walkFinal: finalWalkGeom
      },
      segments: [
        ...(walkRoute.segments || []),
        { distance: finalWalkSeg.distance, duration: adjustedFinalDuration, steps: finalWalkSeg.steps }
      ],
      summary: { distance: totalDistance, duration: totalDuration },
      distanceRoadToWaterMeters: finalWalkSeg.distance,
      walkDurationSeconds: adjustedFinalDuration,
      terrain: combinedTerrain,
      bbox
    };
    
    console.log('✅ Walking route with final segment:', {
      pathDistance: walkRoute.summary?.distance,
      finalDistance: finalWalkSeg.distance,
      total: totalDistance
    });
    
    return NextResponse.json({ routes: [combinedRoute], metadata: {} });
  } catch (error) {
    console.error('Routing API error:', error);
    return NextResponse.json(
      { error: 'Serverfel vid hämtning av rutt' },
      { status: 500 }
    );
  }
}

