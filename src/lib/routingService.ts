// src/lib/routingService.ts
// OpenRouteService routing integration för navigering till vattendrag

export type TransportMode = 'driving-car' | 'cycling-regular' | 'foot-walking';

export interface RouteStep {
  instruction: string;
  distance: number; // meter
  duration: number; // sekunder
  type: number; // maneuver type
  name: string; // gatunamn
}

export interface RouteSegment {
  distance: number; // meter
  duration: number; // sekunder
  steps: RouteStep[];
}

export interface Route {
  geometry: {
    type: 'LineString';
    coordinates: [number, number][]; // [lng, lat]
  };
  // Om multimodal (bil/cykel + gång) fyller API:t detta för separat rendering
  partialGeometries?: {
    vehicle?: { type: 'LineString'; coordinates: [number, number][] };
    walk?: { type: 'LineString'; coordinates: [number, number][] };
    // Särskild sista rak gång-del till sjöns kant när gång används som huvudläge
    walkFinal?: { type: 'LineString'; coordinates: [number, number][] };
  };
  // Extra metadata från servern
  distanceRoadToWaterMeters?: number;
  walkDurationSeconds?: number; // Gångtid i sekunder (med elevation justerad)
  terrain?: {
    elevationGainMeters: number;
    elevationLossMeters: number;
    netAscentMeters?: number;
    maxGradePercent?: number;
    elevationSource?: 'ors' | 'eudem';
    isSteepTerrain?: boolean;
    profile?: { d: number; z: number; g: number }[];
  } | null;
  segments: RouteSegment[];
  summary: {
    distance: number; // meter
    duration: number; // sekunder
  };
  bbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  isDirectPath?: boolean; // True om detta är en direkt linje utan faktiska vägar
}

export interface RouteResponse {
  routes: Route[];
  metadata: {
    query: {
      coordinates: [number, number][];
      profile: string;
    };
  };
}

/**
 * Hämta rutt från användarens position till destinationen
 * Använder vår egna API route för att hålla API-nyckeln säker
 */
export async function getRoute(
  start: [number, number], // [lng, lat]
  end: [number, number],   // [lng, lat]
  mode: TransportMode = 'driving-car'
): Promise<Route | null> {
  try {
    const response = await fetch('/api/routing', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ start, end, mode })
    });

    if (!response.ok) {
      let errorDetails;
      try {
        const errorJson = await response.json();
        errorDetails = errorJson.error || errorJson;
      } catch {
        errorDetails = await response.text();
      }
      console.error('Routing API error:', {
        status: response.status,
        statusText: response.statusText,
        details: errorDetails
      });
      
      // Kasta fel med användarvänligt meddelande
      if (response.status === 404) {
        throw new Error('Ingen väg hittades. Området kan vara oåtkomligt.');
      }
      throw new Error(typeof errorDetails === 'string' ? errorDetails : 'Kunde inte beräkna rutt');
    }

    const data: RouteResponse = await response.json();
    
    if (!data.routes || data.routes.length === 0) {
      console.error('Ingen rutt hittades');
      throw new Error('Ingen rutt hittades');
    }

    return data.routes[0];
  } catch (error) {
    console.error('Fel vid hämtning av rutt:', error);
    // Re-throw så att frontend kan fånga det
    throw error;
  }
}

/**
 * Formatera distans till läsbar sträng
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Formatera tid till läsbar sträng
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours} tim ${minutes} min`;
  }
  return `${minutes} min`;
}

/**
 * Översätt transporttyp till svenska
 */
export function getTransportLabel(mode: TransportMode): string {
  const labels: Record<TransportMode, string> = {
    'driving-car': '🚗 Bil',
    'cycling-regular': '🚴 Cykel',
    'foot-walking': '🚶 Gång'
  };
  return labels[mode];
}

/**
 * Översätt maneuver-typer till svenska instruktioner
 */
export function translateInstruction(instruction: string, type: number): string {
  // OpenRouteService ger redan svenska instruktioner om language: 'sv'
  // Men vi kan förbättra dem lite
  return instruction
    .replace('Continue', 'Fortsätt')
    .replace('Turn left', 'Sväng vänster')
    .replace('Turn right', 'Sväng höger')
    .replace('Keep left', 'Håll till vänster')
    .replace('Keep right', 'Håll till höger')
    .replace('Arrive', 'Framme vid destination');
}

