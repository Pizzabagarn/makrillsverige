/**
 * Service för att hämta skandinaviska vattendrag från databas
 * Integrerar med befintlig water_bodies tabell och VISS API
 */

import { createClient } from '@supabase/supabase-js';
import { WaterBodyData, WaterBodyDataFetcher } from './waterBodyDataFetcher';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export interface ScandinavianWaterBody {
  id: string;
  osm_id: number;
  name: string;
  water_type: 'lake' | 'river' | 'stream' | 'reservoir' | 'canal';
  country: 'SE' | 'NO' | 'DK';
  coordinates: [number, number];
  bounds?: [[number, number], [number, number]];
  area_km2?: number;
  max_depth?: number;
  has_chart?: boolean;
  tags?: any;
  geometry?: any;
}

export interface WaterBodySearchResult {
  waterBody: ScandinavianWaterBody;
  distance?: number; // km från sökpunkt
  vissData?: WaterBodyData | null; // Endast för svenska sjöar
}

/**
 * Sök vattendrag i Skandinavien från databas
 */
export async function searchScandinavianWaterBodies(
  query: string,
  limit: number = 50,
  centerPoint?: { lat: number; lon: number },
  maxDistance?: number // km
): Promise<ScandinavianWaterBody[]> {
  
  if (!query || query.length < 2) return [];
  
  try {
    let results, error;

    // Geografisk filtrering om centrum och avstånd angivs
    if (centerPoint && maxDistance) {
      // Använd PostGIS för att filtrera på avstånd
      const rpcResult = await supabase
        .rpc('water_bodies_within_distance', {
          center_lat: centerPoint.lat,
          center_lon: centerPoint.lon,
          max_distance_km: maxDistance
        })
        .limit(limit);
      
      results = rpcResult.data;
      error = rpcResult.error;
      
      // Filtrera på namnet efter RPC-anropet
      if (results && !error) {
        results = results.filter(water => 
          water.name && water.name.toLowerCase().includes(query.toLowerCase())
        );
      }
    } else {
      // Vanlig sökning utan geografisk filtrering
      const dbResult = await supabase
        .from('water_bodies')
        .select('id, osm_id, name, water_type, area_km2, tags, geometry')
        .not('name', 'is', null)
        .not('geometry', 'is', null)
        .ilike('name', `%${query}%`)
        .order('area_km2', { ascending: false, nullsLast: true })
        .limit(limit);
      
      results = dbResult.data;
      error = dbResult.error;
    }

    if (error) {
      console.warn('Databasfel vid vattendrags-sökning:', error);
      return [];
    }

    if (!results || results.length === 0) {
      return [];
    }

    return results.map(water => convertToScandinavianWaterBody(water));
    
  } catch (error) {
    console.error('Fel vid sökning av skandinaviska vattendrag:', error);
    return [];
  }
}

/**
 * Hämta vattendrag inom ett geografiskt område
 */
export async function getWaterBodiesInBounds(
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  },
  limit: number = 100
): Promise<ScandinavianWaterBody[]> {
  
  try {
    // Försök använda vår view med förberäknade centroider
    const { data: results, error } = await supabase
      .from('water_bodies_with_centroids')
      .select('id, osm_id, name, water_type, area_km2, tags, geometry, center_lat, center_lon')
      .gte('center_lat', bounds.south)
      .lte('center_lat', bounds.north)
      .gte('center_lon', bounds.west)
      .lte('center_lon', bounds.east)
      .order('area_km2', { ascending: false, nullsLast: true })
      .limit(limit);

    if (error) {
      console.warn('Spatial view misslyckades, använder fallback:', error);
      console.warn('⚠️ Kör sql/spatial_functions.sql i Supabase för bättre prestanda!');
      
      // Fallback: Använd direkt tabell utan spatial filtering
      const { data: fallbackResults, error: fallbackError } = await supabase
        .from('water_bodies')
        .select('id, osm_id, name, water_type, area_km2, tags, geometry')
        .not('name', 'is', null)
        .not('geometry', 'is', null)
        .order('area_km2', { ascending: false, nullsLast: true })
        .limit(Math.min(50, limit)); // Mindre limit för fallback
        
      if (fallbackError) {
        console.error('Även fallback misslyckades:', fallbackError);
        return [];
      }
      
      return (fallbackResults || []).map(water => convertToScandinavianWaterBody(water));
    }

    return (results || []).map(water => convertToScandinavianWaterBody(water));
    
  } catch (error) {
    console.error('Fel vid hämtning av vattendrag i område:', error);
    return [];
  }
}

/**
 * Hämta detaljerade data för ett specifikt vattendrag
 */
export async function getWaterBodyDetails(
  waterBodyId: string
): Promise<WaterBodySearchResult | null> {
  
  try {
    const { data: waterBody, error } = await supabase
      .from('water_bodies')
      .select('*')
      .eq('id', waterBodyId)
      .single();

    if (error || !waterBody) {
      console.warn('Vattendrag inte hittat:', waterBodyId, error);
      return null;
    }

    const scandinavianWaterBody = convertToScandinavianWaterBody(waterBody);
    
    // Hämta komplett VISS/SMHI-data för svenska sjöar
    let vissData: WaterBodyData | null = null;
    if (scandinavianWaterBody.country === 'SE' && scandinavianWaterBody.name) {
      try {
        const fetcher = new WaterBodyDataFetcher();
        vissData = await fetcher.fetchWaterBodyData(scandinavianWaterBody.name);
    
      } catch (error) {
        console.warn('❌ Kunde inte hämta VISS/SMHI-data för:', scandinavianWaterBody.name, error);
      }
    }

    return {
      waterBody: scandinavianWaterBody,
      vissData
    };
    
  } catch (error) {
    console.error('Fel vid hämtning av vattendrags-detaljer:', error);
    return null;
  }
}

/**
 * Konvertera databaspost till ScandinavianWaterBody
 */
function convertToScandinavianWaterBody(water: any): ScandinavianWaterBody {
  const coords = extractCoordinatesFromGeometry(water.geometry);
  const country = getCountryFromCoordinates(coords.lat, coords.lon);
  
  return {
    id: water.id.toString(),
    osm_id: water.osm_id,
    name: water.name,
    water_type: mapWaterType(water.water_type),
    country,
    coordinates: [coords.lat, coords.lon],
    area_km2: water.area_km2,
    has_chart: country === 'SE' && water.area_km2 > 0.5, // Svenska sjökar > 0.5 km² har ofta sjökartor
    tags: water.tags,
    geometry: water.geometry
  };
}

/**
 * Extrahera koordinater från PostGIS/GeoJSON geometri
 */
function extractCoordinatesFromGeometry(geometry: any): { lat: number, lon: number } {
  if (!geometry) {
    return { lat: 60.0, lon: 15.0 }; // Default skandinavisk position
  }
  
  try {
    // GeoJSON geometri från PostGIS
    if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
      const coords = geometry.type === 'Polygon' 
        ? geometry.coordinates[0] 
        : geometry.coordinates[0][0];
      
      if (coords && coords.length > 0) {
        // Beräkna centroid (enkelt medelvärde)
        let sumLon = 0, sumLat = 0;
        for (const coord of coords) {
          sumLon += coord[0];
          sumLat += coord[1];
        }
        return {
          lon: sumLon / coords.length,
          lat: sumLat / coords.length
        };
      }
    }
    
    if (geometry.type === 'Point') {
      return {
        lon: geometry.coordinates[0],
        lat: geometry.coordinates[1]
      };
    }
    
  } catch (error) {
    console.warn('Fel vid extraktion av koordinater:', error);
  }
  
  return { lat: 60.0, lon: 15.0 };
}

/**
 * Bestämma land baserat på koordinater (korrekt indelning)
 */
function getCountryFromCoordinates(lat: number, lon: number): 'SE' | 'NO' | 'DK' {
  // NORGE - latitud-beroende gränser (smalare i söder, bredare i norr)
  if (lat >= 65.0 && lon >= 4.5 && lon <= 15.0) {
    // Norra Norge - inklusive Unkervatnet område (65.51°N, 14.20°E)
    return 'NO';
  } else if (lat >= 60.0 && lon >= 4.5 && lon <= 12.0) {
    // Mellersta Norge - smalare
    return 'NO';
  } else if (lat >= 57.8 && lon >= 4.5 && lon <= 11.0) {
    // Södra Norge - smalast
    return 'NO';
  }
  
  // SVERIGE - efter Norge-kontroll (inkluderar HELA Skåne)
  if (lon >= 11.0 && lon <= 24.5 && lat >= 55.0 && lat <= 69.5) {
    return 'SE';
  }
  
  // DANMARK - mer restriktiva gränser (INTE Skåne!)
  if (lon >= 8.0 && lon <= 12.5 && lat >= 54.5 && lat <= 57.0) {
    return 'DK';
  }
  
  // Fallback för okända områden
  return 'SE';
}

/**
 * Mappa vattentyper från OSM till våra standardtyper
 */
function mapWaterType(osmType: string): 'lake' | 'river' | 'stream' | 'reservoir' | 'canal' {
  const type = osmType?.toLowerCase() || '';
  
  if (type.includes('lake') || type.includes('water')) return 'lake';
  if (type.includes('river')) return 'river';
  if (type.includes('stream')) return 'stream';
  if (type.includes('reservoir')) return 'reservoir';
  if (type.includes('canal')) return 'canal';
  
  return 'lake'; // Default
}

/**
 * Hämta populära fiskesjöar för varje land 
 */
export async function getPopularFishingWaters(
  country: 'SE' | 'NO' | 'DK' | 'ALL' = 'ALL',
  limit: number = 20
): Promise<ScandinavianWaterBody[]> {
  
  try {
    let countryBounds: { north: number, south: number, east: number, west: number };
    
    switch (country) {
      case 'SE':
        countryBounds = { north: 69.1, south: 55.3, east: 24.2, west: 10.8 };
        break;
      case 'NO':  
        countryBounds = { north: 71.2, south: 57.9, east: 31.1, west: 4.6 };
        break;
      case 'DK':
        countryBounds = { north: 57.8, south: 54.5, east: 15.2, west: 8.0 };
        break;
      default:
        // Hela Skandinavien
        countryBounds = { north: 71.2, south: 54.5, east: 31.1, west: 4.6 };
    }
    
    const { data: results, error } = await supabase
      .from('water_bodies')
      .select('id, osm_id, name, water_type, area_km2, tags, geometry')
      .not('name', 'is', null)
      .gte('area_km2', 0.05) // Minska minimumarea för att få fler små men viktiga sjöar
      .gte('ST_Y(ST_Centroid(geometry))', countryBounds.south)
      .lte('ST_Y(ST_Centroid(geometry))', countryBounds.north)  
      .gte('ST_X(ST_Centroid(geometry))', countryBounds.west)
      .lte('ST_X(ST_Centroid(geometry))', countryBounds.east)
      .order('area_km2', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('Databasfel vid hämtning av populära fiskevatten:', error);
      return [];
    }

    return (results || []).map(water => convertToScandinavianWaterBody(water));
    
  } catch (error) {
    console.error('Fel vid hämtning av populära fiskevatten:', error);
    return [];
  }
}

/**
 * Helper för att skapa bounding box runt en punkt
 */
export function createBoundsAroundPoint(
  lat: number, 
  lon: number, 
  radiusKm: number
): { north: number, south: number, east: number, west: number } {
  
  // Approximativ konvertering av km till grader
  const latDelta = radiusKm / 111.32; // 1 grad lat ≈ 111.32 km
  const lonDelta = radiusKm / (111.32 * Math.cos(lat * Math.PI / 180));
  
  return {
    north: lat + latDelta,
    south: lat - latDelta,
    east: lon + lonDelta,
    west: lon - lonDelta
  };
}

/**
 * Hitta närmaste vattendrag vid exakta koordinater (för kartklick)
 * FÖRBÄTTRAD: Hanterar multipla geometrier och aggregerar samma vattendrag
 */
export async function getWaterBodyAtCoordinates(
  lat: number,
  lon: number,
  maxDistanceKm: number = 1 // Max avstånd från klick-punkt
): Promise<ScandinavianWaterBody | null> {
  
  try {
    // Använd PostGIS för att hitta närmaste vattendrag - FLERA resultat för aggregering
    const { data: results, error } = await supabase
      .rpc('water_bodies_within_distance', {
        center_lat: lat,
        center_lon: lon,
        max_distance_km: maxDistanceKm
      })
      .limit(10); // Hämta flera för att hantera multipla geometrier

    if (error) {
      console.warn('⚠️ PostGIS-funktion saknas, använder fallback-sökning:', error.message);
      
      // Fallback: Använd water_bodies_with_centroids view om den finns
      try {
        const searchRadius = 0.01; // ~1km
        const { data: fallbackResults, error: fallbackError } = await supabase
          .from('water_bodies_with_centroids')
          .select('id, osm_id, name, water_type, area_km2, tags, geometry, center_lat, center_lon')
          .not('name', 'is', null)
          .gte('center_lat', lat - searchRadius)
          .lte('center_lat', lat + searchRadius)
          .gte('center_lon', lon - searchRadius)
          .lte('center_lon', lon + searchRadius)
          .order('area_km2', { ascending: false })
          .limit(1);
          
        if (!fallbackError && fallbackResults && fallbackResults.length > 0) {
          return convertToScandinavianWaterBody(fallbackResults[0]);
        }
      } catch (e) {
        console.warn('View fallback misslyckades också');
      }
      
      // Sista fallback: Vanlig tabell med spatial query
      try {
        const searchRadius = 0.005; // Mindre area för bättre prestanda
        const { data: finalResults, error: finalError } = await supabase
          .from('water_bodies')
          .select('id, osm_id, name, water_type, area_km2, tags, geometry')
          .not('name', 'is', null)
          .not('geometry', 'is', null)
          .order('area_km2', { ascending: false })
          .limit(10); // Hämta fler och filtrera i JavaScript
          
        if (finalError || !finalResults) {
          return null;
        }
        
        // Enkel avståndskontroll i JavaScript som fallback
        for (const water of finalResults) {
          const coords = extractCoordinatesFromGeometry(water.geometry);
          if (coords) {
            const distance = Math.sqrt(
              Math.pow(coords.lat - lat, 2) + Math.pow(coords.lon - lon, 2)
            );
            // Ungefär 1km i grader
            if (distance < 0.01) {
              return convertToScandinavianWaterBody(water);
            }
          }
        }
        
        return null;
      } catch (e) {
        console.error('Alla fallbacks misslyckades:', e);
        return null;
      }
    }

    if (!results || results.length === 0) {
      return null;
    }

    // FÖRBÄTTRING: Hantera multipla geometrier för samma vattendrag
    // Prioritera största/närmaste eller aggregera baserat på namn
    const bestMatch = findBestWaterBodyMatch(results, lat, lon);
    return convertToScandinavianWaterBody(bestMatch);
    
  } catch (error) {
    console.error('Fel vid sökning efter vattendrag på koordinater:', error);
    return null;
  }
}

/**
 * Hitta bästa match från multipla vattendrag-resultat
 * Hanterar flera geometrier för samma vattendrag (floder, stora sjöar etc.)
 */
function findBestWaterBodyMatch(results: any[], clickLat: number, clickLon: number): any {
  if (results.length === 1) return results[0];
  
  // Gruppera efter namn för att hantera multipla geometrier för samma vattendrag
  const byName = new Map<string, any[]>();
  
  for (const result of results) {
    const name = result.name;
    if (!byName.has(name)) {
      byName.set(name, []);
    }
    byName.get(name)!.push(result);
  }
  
  // Om samma namn förekommer flera gånger, välj den största geometrin
  const candidates: any[] = [];
  
  for (const [name, geometries] of byName.entries()) {
    if (geometries.length === 1) {
      candidates.push(geometries[0]);
    } else {
      // Flera geometrier för samma vattendrag - välj största
      const largest = geometries.reduce((largest, current) => 
        (current.area_km2 || 0) > (largest.area_km2 || 0) ? current : largest
      );
      
      candidates.push(largest);
    }
  }
  
  // Om vi fortfarande har flera kandidater, välj närmaste baserat på centroid
  if (candidates.length === 1) {
    return candidates[0];
  }
  
  let bestMatch = candidates[0];
  let bestDistance = Infinity;
  
  for (const candidate of candidates) {
    const coords = extractCoordinatesFromGeometry(candidate.geometry);
    const distance = Math.sqrt(
      Math.pow(clickLat - coords.lat, 2) + Math.pow(clickLon - coords.lon, 2)
    );
    
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = candidate;
    }
  }
  
  return bestMatch;
}