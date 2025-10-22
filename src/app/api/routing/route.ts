// src/app/api/routing/route.ts
// Server-side API route för att hantera OpenRouteService requests
// Detta håller API-nyckeln säker på servern

import { NextRequest, NextResponse } from 'next/server';

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
      // 1. Först: Hitta närmaste körbara punkt till sjön
      const vehicleUrl = `https://api.openrouteservice.org/v2/directions/${transportMode}/json`;
      const vehicleBody = {
        coordinates: [start, end],
        instructions: true,
        radiuses: [-1, 10000] // 10km radius för att hitta närmaste väg
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
            language: 'sv'
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
        const walkUrl = 'https://api.openrouteservice.org/v2/directions/foot-walking/json';
        const walkBody = {
          coordinates: [vehicleEndPoint, end],
          instructions: true,
          language: 'sv'
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
              duration: vehicleRoute.summary.duration + walkRoute.summary.duration
            },
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
          // Om gång-rutten misslyckas, returnera bara bil-rutten
          console.log('⚠️ Walk route failed, returning vehicle-only route');
          // Normalisera bil/cykel-rutten innan vi returnerar
          const normalizedVehicle = { ...vehicleRoute, geometry: vehicleGeom };
          return NextResponse.json({ routes: [normalizedVehicle], metadata: vehicleData.metadata });
        }
      } else {
        const errorText = await vehicleResponse.text();
        console.log('⚠️ Vehicle routing failed, trying walking instead:', errorText);
        
        // Fallback: Om bil inte funkar alls, prova bara gång
        const walkUrl = 'https://api.openrouteservice.org/v2/directions/foot-walking/json';
        const walkBody = {
          coordinates: [start, end],
          instructions: true,
          language: 'sv'
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
          console.log('✅ Walking route found instead');
          return NextResponse.json(walkData);
        } else {
          const walkError = await walkResponse.text();
          return NextResponse.json(
            { error: 'Kunde inte hitta någon rutt', vehicleError: errorText, walkError },
            { status: 404 }
          );
        }
      }
    }
    
    // För GÅNG: enkel direktrutt
    const url = `https://api.openrouteservice.org/v2/directions/${transportMode}/json`;
    const body = {
      coordinates: [start, end],
      instructions: true
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
      return NextResponse.json(
        { 
          error: 'Kunde inte hämta rutt', 
          details: errorText,
          status: response.status,
          statusText: response.statusText
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('Routing success:', { distance: data.routes?.[0]?.summary?.distance });

    // Normalisera geometri till GeoJSON så frontend alltid kan rita linjer
    if (data?.routes?.[0]) {
      const route = data.routes[0];
      const geometry = normalizeRouteGeometry(route);
      const normalized = { ...route, geometry };
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

