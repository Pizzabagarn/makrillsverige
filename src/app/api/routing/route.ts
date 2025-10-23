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

async function snapToNetwork(
  profile: string,
  coord: [number, number],
  apiKey: string,
  radiusMeters = 30000
): Promise<[number, number] | null> {
  try {
    const url = `https://api.openrouteservice.org/v2/snap/${profile}/json`;
    const body = {
      locations: [coord],
      radius: [radiusMeters]
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
    // Try several possible result shapes
    if (Array.isArray(data?.locations) && data.locations[0]?.location) {
      const [lng, lat] = data.locations[0].location;
      return [lng, lat];
    }
    if (Array.isArray(data?.snapped) && data.snapped[0]?.location) {
      const [lng, lat] = data.snapped[0].location;
      return [lng, lat];
    }
    if (Array.isArray(data?.features) && data.features[0]?.geometry?.coordinates) {
      const [lng, lat] = data.features[0].geometry.coordinates;
      return [lng, lat];
    }
    return null;
  } catch {
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
      // 0. Snappa destinationen till närmaste väg för valt profil
      const snappedEnd = await snapToNetwork(transportMode, end as [number, number], apiKey, 30000);
      const vehicleTarget = snappedEnd || end;
      // 1. Försök rutt till snappad punkt (eller end om snappning saknas)
      const vehicleUrl = `https://api.openrouteservice.org/v2/directions/${transportMode}/json`;
      const vehicleBody = {
        coordinates: [start, vehicleTarget],
        instructions: true,
        radiuses: [-1, 30000]
      };

      console.log('🚗 Vehicle routing (steg 1):', { url: vehicleUrl, mode: transportMode });

      const vehicleResponse = await fetch(vehicleUrl, {
        method: 'POST',
        headers: {
          'Authorization': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(vehicleBody)
      });

      if (vehicleResponse.ok) {
        const vehicleData = await vehicleResponse.json();

        // Normalisera rutt-geometri (ORS JSON ger oftast encoded polyline)
        const vehicleRoute = vehicleData.routes?.[0];
        const vehicleGeom = vehicleRoute ? normalizeRouteGeometry(vehicleRoute) : { type: 'LineString', coordinates: [] as [number, number][] };

        // Kolla om vi fick en rutt med geometri
        if (!vehicleRoute || vehicleGeom.coordinates.length === 0) {
          console.log('⚠️ No vehicle route found, falling back to walking only');
          // Fallback: Försök bara gång
          const walkUrl = 'https://api.openrouteservice.org/v2/directions/foot-walking/json';
          const walkBody = {
            coordinates: [start, end],
            instructions: true,
            language: 'sv',
            radiuses: [-1, 20000]
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
            // Normalisera gång-rutten innan svar
            if (walkData?.routes?.[0]) {
              const wr = walkData.routes[0];
              const geometry = normalizeRouteGeometry(wr);
              return NextResponse.json({ routes: [{ ...wr, geometry }], metadata: walkData.metadata });
            }
            return NextResponse.json(walkData);
          } else {
            return NextResponse.json(
              { error: 'Kunde inte hitta någon rutt (varken bil eller gång)' },
              { status: 404 }
            );
          }
        }

        // 2. Sen: Beräkna gång-sträcka från vägens slut till sjön
        const vehicleEndPoint = vehicleGeom.coordinates[vehicleGeom.coordinates.length - 1];
        // Snappa gång-målet till gångnätet så ORS alltid kan hitta en rutt nära sjöns strand
        const snappedWalkEnd = await snapToNetwork('foot-walking', end as [number, number], apiKey, 50000);
        const walkingTarget = snappedWalkEnd || end;
        const walkUrl = 'https://api.openrouteservice.org/v2/directions/foot-walking/json';
        const walkBody = {
          coordinates: [vehicleEndPoint, walkingTarget],
          instructions: true,
          language: 'sv',
          radiuses: [-1, 20000]
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

          // Terräng: beräkna höjddata för gång-delen om möjligt
                  const terrain = await enrichElevationAndComputeTerrain(walkGeom, apiKey);
                  
                  // Adjust walking time based on elevation if terrain data available
                  let adjustedWalkDuration = walkRoute.summary.duration;
                  if (terrain) {
                    adjustedWalkDuration = calculateElevationAdjustedTime(
                      walkRoute.summary.duration,
                      terrain.elevationGainMeters,
                      terrain.elevationLossMeters
                    );
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

          return NextResponse.json({ routes: [combinedRoute], metadata: vehicleData.metadata });
        } else {
          // Om gång-rutten misslyckas, skapa rak gång-linje sista biten
          const vehicleGeom = normalizeRouteGeometry(vehicleRoute);
          const { geometry: straightWalkGeom, segment: straightWalkSeg } = createStraightWalkSegment(vehicleEndPoint as [number, number], end);
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
              { distance: straightWalkSeg.distance, duration: straightWalkSeg.duration, steps: straightWalkSeg.steps }
            ],
            summary: {
              distance: (vehicleRoute.summary?.distance || 0) + straightWalkSeg.distance,
              duration: (vehicleRoute.summary?.duration || 0) + straightWalkSeg.duration
            },
            distanceRoadToWaterMeters: straightWalkSeg.distance,
            bbox
          };
          console.log('✅ Multimodal with straight walk fallback');
          return NextResponse.json({ routes: [combinedRoute], metadata: vehicleData.metadata });
        }
      } else {
        const errorText = await vehicleResponse.text();
        console.log('⚠️ Vehicle routing failed, trying snapped target or walking instead:', errorText);
        // Second attempt: if we have a snapped end, try routing to that explicitly
        if (snappedEnd) {
          try {
            const retryRes = await fetch(vehicleUrl, {
              method: 'POST',
              headers: {
                'Authorization': apiKey,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              body: JSON.stringify({ coordinates: [start, snappedEnd], instructions: true, radiuses: [-1, 30000] })
            });
            if (retryRes.ok) {
              const vehicleData = await retryRes.json();
              const vehicleRoute = vehicleData.routes?.[0];
              if (vehicleRoute) {
                const vehicleGeom = normalizeRouteGeometry(vehicleRoute);
                const vehicleEndPoint = vehicleGeom.coordinates[vehicleGeom.coordinates.length - 1];
                // Try walking from road end to original end
                const snappedWalkEnd2 = await snapToNetwork('foot-walking', end as [number, number], apiKey, 50000);
                const walkingTarget2 = snappedWalkEnd2 || end;
                const walkUrl = 'https://api.openrouteservice.org/v2/directions/foot-walking/json';
                const walkBody = { coordinates: [vehicleEndPoint, walkingTarget2], instructions: true, language: 'sv', radiuses: [-1, 20000] } as any;
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
                  const walkGeom = normalizeRouteGeometry(walkRoute);
                  const terrain = await enrichElevationAndComputeTerrain(walkGeom, apiKey);
                  
                  // Adjust walking time based on elevation
                  let adjustedWalkDuration = walkRoute.summary?.duration || 0;
                  if (terrain) {
                    adjustedWalkDuration = calculateElevationAdjustedTime(
                      walkRoute.summary?.duration || 0,
                      terrain.elevationGainMeters,
                      terrain.elevationLossMeters
                    );
                  }
                  
                  const combinedRoute: any = {
                    ...vehicleRoute,
                    geometry: { type: 'LineString', coordinates: [...vehicleGeom.coordinates, ...walkGeom.coordinates.slice(1)] },
                    partialGeometries: { vehicle: vehicleGeom, walk: walkGeom },
                    segments: [...((vehicleRoute.segments as any[]) || []), ...((walkRoute.segments as any[]) || [])],
                    summary: {
                      distance: (vehicleRoute.summary?.distance || 0) + (walkRoute.summary?.distance || 0),
                      duration: (vehicleRoute.summary?.duration || 0) + adjustedWalkDuration
                    },
                    distanceRoadToWaterMeters: walkRoute.summary?.distance || haversineDistanceMeters(vehicleEndPoint as [number, number], end as [number, number]),
                    walkDurationSeconds: adjustedWalkDuration,
                    terrain,
                    bbox: computeBboxFromCoords([...vehicleGeom.coordinates, ...walkGeom.coordinates])
                  };
                  return NextResponse.json({ routes: [combinedRoute], metadata: vehicleData.metadata });
                } else {
                  // Straight dotted last bit
                  const { geometry: straightWalkGeom, segment: straightWalkSeg } = createStraightWalkSegment(vehicleEndPoint as [number, number], end as [number, number]);
                  const combinedCoords = [...vehicleGeom.coordinates, ...straightWalkGeom.coordinates.slice(1)];
                  const bbox = computeBboxFromCoords(combinedCoords);
                  const combinedRoute: any = {
                    ...vehicleRoute,
                    geometry: { type: 'LineString', coordinates: combinedCoords },
                    partialGeometries: { vehicle: vehicleGeom, walk: straightWalkGeom },
                    segments: [...((vehicleRoute.segments as any[]) || []), { distance: straightWalkSeg.distance, duration: straightWalkSeg.duration, steps: straightWalkSeg.steps }],
                    summary: { distance: (vehicleRoute.summary?.distance || 0) + straightWalkSeg.distance, duration: (vehicleRoute.summary?.duration || 0) + straightWalkSeg.duration },
                    distanceRoadToWaterMeters: straightWalkSeg.distance,
                    bbox
                  };
                  return NextResponse.json({ routes: [combinedRoute], metadata: vehicleData.metadata });
                }
              }
            }
          } catch {}
        }
        
        // Fallback: Om bil inte funkar alls, prova bara gång
        const walkUrl = 'https://api.openrouteservice.org/v2/directions/foot-walking/json';
        const snappedEndFoot = await snapToNetwork('foot-walking', end as [number, number], apiKey, 50000);
        const walkBody = {
          coordinates: [start, snappedEndFoot || end],
          instructions: true,
          language: 'sv',
          radiuses: [-1, 20000]
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
          // Normalisera och beräkna extra metadata
          const wr = walkData.routes?.[0];
          if (wr) {
            const geometry = normalizeRouteGeometry(wr);
            const terrain = await enrichElevationAndComputeTerrain(geometry, apiKey);
            
            // Adjust walking time for elevation
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
              distanceRoadToWaterMeters: wr.summary?.distance || haversineDistanceMeters((start as [number, number]), (end as [number, number])),
              walkDurationSeconds: adjustedDuration,
              terrain
            } as any;
            return NextResponse.json({ routes: [enriched], metadata: walkData.metadata });
          }
          return NextResponse.json(walkData);
        } else {
          // Sista fallback: rak gång-linje från start till mål
          const { geometry: straightGeom, segment } = createStraightWalkSegment(start as [number, number], end as [number, number]);
          const bbox = computeBboxFromCoords(straightGeom.coordinates);
          const route: any = {
            geometry: straightGeom,
            segments: [{ distance: segment.distance, duration: segment.duration, steps: segment.steps }],
            summary: { distance: segment.distance, duration: segment.duration },
            distanceRoadToWaterMeters: segment.distance,
            bbox
          };
          console.log('✅ Straight walking fallback created');
          return NextResponse.json({ routes: [route], metadata: {} });
        }
      }
    }
    
    // För GÅNG: enkel direktrutt
    const url = `https://api.openrouteservice.org/v2/directions/${transportMode}/json`;
    // Snappa mål till gångnätet om walking, annars använd original
    const snappedEndForMode = transportMode === 'foot-walking' ? (await snapToNetwork('foot-walking', end as [number, number], apiKey, 50000)) : null;
    const body = {
      coordinates: [start, snappedEndForMode || end],
      instructions: true,
      radiuses: [-1, 20000]
    };

    console.log('🚗 Routing request:', { 
      url, 
      coordinates: body.coordinates, 
      mode: transportMode,
      apiKeyPrefix: apiKey.substring(0, 10) + '...'
    });

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
      const errorText = await response.text();
      console.error('OpenRouteService error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
        url,
        coordinates: [start, end]
      });
      // Fallback: snappa mål till närmsta foot-walking nät och räkna så långt det går,
      // annars rak sista biten – och snappa slutpunkt till sjökant hanteras i frontend.
      const snappedEnd = await snapToNetwork('foot-walking', end as [number, number], apiKey, 30000);
      if (snappedEnd) {
        try {
          const retry = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': apiKey, 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ coordinates: [start, snappedEnd], instructions: true, radiuses: [-1, 30000] })
          });
          if (retry.ok) {
            const data2 = await retry.json();
            if (data2?.routes?.[0]) {
              const route = data2.routes[0];
              const geometry = normalizeRouteGeometry(route);
              const normalized = { ...route, geometry };
              return NextResponse.json({ routes: [normalized], metadata: data2.metadata });
            }
          }
        } catch {}
      }
      const { geometry: straightGeom, segment } = createStraightWalkSegment(start as [number, number], end as [number, number]);
      const bbox = computeBboxFromCoords(straightGeom.coordinates);
      const route: any = {
        geometry: straightGeom,
        segments: [{ distance: segment.distance, duration: segment.duration, steps: segment.steps }],
        summary: { distance: segment.distance, duration: segment.duration },
        distanceRoadToWaterMeters: segment.distance,
        bbox
      };
      console.log('✅ Straight walking fallback created (direct walking mode)');
      return NextResponse.json({ routes: [route], metadata: {} });
    }

    const data = await response.json();
    console.log('Routing success:', { distance: data.routes?.[0]?.summary?.distance });

    // Normalisera geometri till GeoJSON så frontend alltid kan rita linjer
    if (data?.routes?.[0]) {
      const route = data.routes[0];
      const geometry = normalizeRouteGeometry(route);
      let normalized: any = { ...route, geometry };
      if (transportMode === 'foot-walking') {
        const terrain = await enrichElevationAndComputeTerrain(geometry, apiKey);
        
        // Adjust duration for elevation
        let adjustedDuration = route.summary?.duration || 0;
        if (terrain) {
          adjustedDuration = calculateElevationAdjustedTime(
            route.summary?.duration || 0,
            terrain.elevationGainMeters,
            terrain.elevationLossMeters
          );
        }
        
        normalized.summary = {
          distance: route.summary?.distance || 0,
          duration: adjustedDuration
        };
        normalized.distanceRoadToWaterMeters = route.summary?.distance;
        normalized.walkDurationSeconds = adjustedDuration;
        normalized.terrain = terrain || undefined;
      }
      return NextResponse.json({ routes: [normalized], metadata: data.metadata });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Routing API error:', error);
    return NextResponse.json(
      { error: 'Serverfel vid hämtning av rutt' },
      { status: 500 }
    );
  }
}

