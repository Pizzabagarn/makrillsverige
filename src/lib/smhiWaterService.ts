/**
 * SMHI Water Service - Using smart clustered SMHI data instead of OSM
 * Same API as scandinavianWaterService but with much better geometries!
 */

import { createClient } from '@supabase/supabase-js';
import { WaterBodyData, WaterBodyDataFetcher } from './waterBodyDataFetcher';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export interface SMHIWaterBody {
  id: string;
  name: string;
  water_type: 'lake' | 'river' | 'stream' | 'reservoir' | 'canal';
  country: 'SE' | 'NO' | 'DK';
  coordinates: [number, number];
  bounds?: [[number, number], [number, number]];
  area_km2?: number;
  depth_mean?: number;
  depth_max?: number;
  volume_m3?: number;
  ecological_status?: string;
  segment_count: number;
  has_chart?: boolean;
  geometry?: any;
}

export interface SMHIWaterBodySearchResult {
  waterBody: SMHIWaterBody;
  distance?: number; // km från sökpunkt
  vissData?: WaterBodyData | null; // VISS-data för svenska sjöar
}

/**
 * Sök SMHI-vattendrag från optimerade tabellen
 * ULTRASNABB: Använder lat/lon index precis som OSM-versionen
 */
export async function searchSMHIWaterBodies(
  query: string,
  limit: number = 50,
  centerPoint?: { lat: number; lon: number },
  maxDistance?: number // km
): Promise<SMHIWaterBody[]> {
  
  if (!query || query.length < 2) return [];
  
  try {
    let results, error;

    // Geografisk filtrering om centrum och avstånd angivs
    if (centerPoint && maxDistance) {
      const searchRadius = maxDistance * 0.009; // ~1km = 0.009 grader
      
      const dbResult = await supabase
        .from('smhi_water_bodies_lake_unified')
        .select('id, name, water_type, geometry, lat, lon, area_km2, depth_mean, depth_max, volume_m3, ecological_status, cluster_size, cluster_method')
        // SNABB bounding box-filter (använder index)
        .gte('lat', centerPoint.lat - searchRadius)
        .lte('lat', centerPoint.lat + searchRadius) 
        .gte('lon', centerPoint.lon - searchRadius)
        .lte('lon', centerPoint.lon + searchRadius)
        .not('name', 'is', null)
        .not('geometry', 'is', null)
        .ilike('name', `%${query}%`)
        .order('area_km2', { ascending: false })
        .limit(limit);
      
      results = dbResult.data;
      error = dbResult.error;
    } else {
      // Vanlig sökning utan geografisk filtrering
      const dbResult = await supabase
        .from('smhi_water_bodies_lake_unified')
        .select('id, name, water_type, geometry, lat, lon, area_km2, depth_mean, depth_max, volume_m3, ecological_status, cluster_size, cluster_method')
        .not('name', 'is', null)
        .not('geometry', 'is', null)
        .ilike('name', `%${query}%`)
        .order('area_km2', { ascending: false })
        .limit(limit);
      
      results = dbResult.data;
      error = dbResult.error;
    }

    if (error) {
      console.warn('SMHI-databasfel vid vattendrags-sökning:', error);
      return [];
    }

    if (!results || results.length === 0) {
      return [];
    }

    return results.map((water: any) => convertToSMHIWaterBody(water));
    
  } catch (error) {
    console.error('Fel vid SMHI-sökning av vattendrag:', error);
    return [];
  }
}

/**
 * Hämta SMHI-vattendrag inom ett geografiskt område
 * OPTIMERAD: Samma prestanda som OSM med lat/lon index
 */
export async function getSMHIWaterBodiesInBounds(
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  },
  limit: number = 100
): Promise<SMHIWaterBody[]> {
  
  try {
    const { data: results, error } = await supabase
      .from('smhi_water_bodies_lake_unified')
      .select('id, name, water_type, geometry, lat, lon, area_km2, depth_mean, depth_max, volume_m3, ecological_status, cluster_size, cluster_method')
      .gte('lat', bounds.south)
      .lte('lat', bounds.north)
      .gte('lon', bounds.west)
      .lte('lon', bounds.east)
      .not('name', 'is', null)
      .not('geometry', 'is', null)
      .order('area_km2', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('SMHI spatial query error:', error);
      return [];
    }

    return (results || []).map((water: any) => convertToSMHIWaterBody(water));
    
  } catch (error) {
    console.error('Fel vid SMHI hämtning av vattendrag i område:', error);
    return [];
  }
}

/**
 * Hitta närmaste SMHI-vattendrag vid exakta koordinater (för kartklick)
 * ULTRASNABB: Samma strategi som OSM-versionen
 */
export async function getSMHIWaterBodyAtCoordinates(
  lat: number,
  lon: number,
  maxDistanceKm: number = 1
): Promise<SMHIWaterBody | null> {
  
  try {
    // UTÖKAD SÖKRADIE för stora sjöar som är svåra att klicka
    const expandedDistanceKm = Math.max(maxDistanceKm, 3); // Minst 3km för stora sjöar
    
    // STRATEGI 1: Först kolla ST_Contains för exakt träff (OM användaren klickar INUTI en geometri)
    const exactMatch = await getSMHIWaterBodyByGeometryContains(lat, lon, expandedDistanceKm);
    if (exactMatch) {
      return exactMatch;
    }

    // STRATEGI 2: Smart poäng-baserad närhet med stor tolerans för stora sjöar
    return getSMHIWaterBodyBySmartProximity(lat, lon, expandedDistanceKm);
    
  } catch (error) {
    console.error('Fel vid SMHI koordinat-sökning:', error);
    return null;
  }
}

/**
 * STRATEGI 1: Exakt geometri-träff med ST_Contains (prioriterar sjöar som användaren klickar INUTI)
 */
async function getSMHIWaterBodyByGeometryContains(
  lat: number,
  lon: number,
  maxDistanceKm: number
): Promise<SMHIWaterBody | null> {
  
  try {
    // SMART STRATEGI: Större tolerans för stora sjöar
    const baseRadius = maxDistanceKm * 0.02;
    const largeRadius = maxDistanceKm * 0.05; // Större radius för stora sjöar
    
    // FÖRST: Testa med ST_DWithin för stora sjöar (mer tolerant än ST_Contains)
    const { data: nearbyLakes, error: nearbyError } = await supabase
      .rpc('find_large_lakes_near_point', {
        click_lat: lat,
        click_lon: lon,
        search_radius_deg: largeRadius
      });

    if (!nearbyError && nearbyLakes && nearbyLakes.length > 0) {
      // Prioritera största sjön inom rimligt avstånd
      const bestLake = nearbyLakes[0]; // Redan sorterad efter area i PostGIS-funktionen
      return convertToSMHIWaterBody(bestLake);
    }

    // SEDAN: Traditionell ST_Contains för mindre vattenområden
    const { data: results, error } = await supabase
      .rpc('find_water_body_containing_point', {
        click_lat: lat,
        click_lon: lon,
        search_radius_deg: baseRadius
      });

    if (error) {
      console.warn('ST_Contains sökning misslyckades, använder fallback:', error);
      return null;
    }

    if (results && results.length > 0) {
      // Prioritera sjöar över bäckar
      const lakes = results.filter((r: any) => r.water_type === 'lake');
      const bestMatch = lakes.length > 0 ? lakes[0] : results[0];
      
      return convertToSMHIWaterBody(bestMatch);
    }

    return null;
    
  } catch (error) {
    console.warn('Geometri-sökning misslyckades:', error);
    return null;
  }
}

/**
 * STRATEGI 2: Smart poäng-baserad närhet (samma som tidigare, men som fallback)
 */
async function getSMHIWaterBodyBySmartProximity(
  lat: number,
  lon: number,
  maxDistanceKm: number
): Promise<SMHIWaterBody | null> {
  
  try {
    // SMART: Större sökradie för att hitta stora sjöar som är svåra att klicka
    const baseRadius = maxDistanceKm * 0.009; // ~1km = 0.009 grader
    const expandedRadius = maxDistanceKm * 0.02; // ~2km för stora sjöar
    
    const { data: results, error } = await supabase
      .from('smhi_water_bodies_lake_unified')
      .select('id, name, water_type, geometry, lat, lon, area_km2, depth_mean, depth_max, volume_m3, ecological_status, cluster_size, cluster_method')
      // UTÖKAD bounding box för att hitta stora sjöar (mer tolerant)
      .gte('lat', lat - expandedRadius)
      .lte('lat', lat + expandedRadius) 
      .gte('lon', lon - expandedRadius)
      .lte('lon', lon + expandedRadius)
      .not('name', 'is', null)
      .not('geometry', 'is', null)
      .order('area_km2', { ascending: false })
      .limit(30); // Fler kandidater för bättre stora-sjö-detektion

    if (error) {
      console.warn('⚠️ SMHI bounding box-sökning misslyckades:', error);
      return null;
    }

    if (!results || results.length === 0) {
      return null;
    }

    // SMART prioritering: Stora sjöar före små bäckar!
    let bestMatch: any = null;
    let bestScore = -1;

    for (const water of results) {
      const waterLat = water.lat;
      const waterLon = water.lon;
      
      if (!waterLat || !waterLon) continue;

      // Beräkna avstånd
      const distance = Math.sqrt(
        Math.pow(waterLat - lat, 2) + Math.pow(waterLon - lon, 2)
      );

      // SMART AVSTÅNDSKONTROLL: Mer tolerant för stora sjöar
      const isLargeLake = water.water_type === 'lake' && water.area_km2 > 500;
      const distanceThreshold = isLargeLake 
        ? maxDistanceKm * 0.02  // 2x mer tolerant för stora sjöar
        : maxDistanceKm * 0.009; // Vanlig tolerans för andra
      
      if (distance <= distanceThreshold) {
        
        // SMART POÄNG-SYSTEM: Extra bonus för stora sjöar!
        let score = 0;
        
        // 1. VATTENTYP-PRIORITERING (lakes före streams!)
        if (water.water_type === 'lake') {
          score += 1000; // Sjöar har högsta prioritet
          
          // EXTRA BONUS för stora sjöar (de som är svåra att klicka)
          if (water.area_km2 > 1000) {
            score += 2000; // Stor bonus för sjöar >1000 km²
          } else if (water.area_km2 > 500) {
            score += 1000; // Medium bonus för sjöar >500 km²
          }
        } else if (water.water_type === 'river') {
          score += 500;  // Åar/floder näst högst
        } else if (water.water_type === 'stream') {
          score += 100;  // Bäckar lägst prioritet
        } else {
          score += 300;  // Övriga vattentyper
        }
        
        // 2. CLUSTER-STORLEK BONUS (större kluster = viktigare vattenområde)
        const clusterSize = water.cluster_size || 1;
        score += clusterSize * 50;
        
        // 3. NÄRHET-BONUS (närmare = bättre, men inte dominerande)
        const proximityBonus = (1 / (distance + 0.001)) * 100;
        score += proximityBonus;
        
        // 4. PRECISION-BONUS för mycket nära klick
        if (distance < 0.002) {
          score += 500; // Stark bonus för precisa klick
        } else if (distance < 0.005 && isLargeLake) {
          score += 300; // Medium bonus för stora sjöar inom 500m
        }
        
        // Välj det med högst poäng
        if (score > bestScore) {
          bestScore = score;
          bestMatch = water;
        }
      }
    }

    return bestMatch ? convertToSMHIWaterBody(bestMatch) : null;
    
  } catch (error) {
    console.error('Fel vid SMHI snabb vattendrags-sökning:', error);
    return null;
  }
}

/**
 * Hämta detaljerade data för ett specifikt SMHI-vattendrag
 */
export async function getSMHIWaterBodyDetails(
  waterBodyId: string
): Promise<SMHIWaterBodySearchResult | null> {
  
  try {
    const { data: waterBody, error } = await supabase
      .from('smhi_water_bodies_lake_unified')
      .select('*')
      .eq('id', waterBodyId)
      .single();

    if (error || !waterBody) {
      console.warn('SMHI vattendrag inte hittat:', waterBodyId, error);
      return null;
    }

    const smhiWaterBody = convertToSMHIWaterBody(waterBody);
    
    // Hämta komplett VISS/SMHI-data för svenska sjöar
    let vissData: WaterBodyData | null = null;
    if (smhiWaterBody.country === 'SE' && smhiWaterBody.name) {
      try {
        const fetcher = new WaterBodyDataFetcher();
        vissData = await fetcher.fetchWaterBodyData(smhiWaterBody.name);
    
      } catch (error) {
        console.warn('❌ Kunde inte hämta VISS/SMHI-data för:', smhiWaterBody.name, error);
      }
    }

    return {
      waterBody: smhiWaterBody,
      vissData
    };
    
  } catch (error) {
    console.error('Fel vid hämtning av SMHI vattendrags-detaljer:', error);
    return null;
  }
}

/**
 * Konvertera databaspost till SMHIWaterBody
 */
function convertToSMHIWaterBody(water: any): SMHIWaterBody {
  const lat = water.lat || 60.0;
  const lon = water.lon || 15.0;
  const country = getCountryFromCoordinates(lat, lon);
  
  return {
    id: water.id.toString(),
    name: water.name,
    water_type: mapWaterType(water.water_type),
    country,
    coordinates: [lat, lon],
    area_km2: water.area_km2,
    depth_mean: water.depth_mean,
    depth_max: water.depth_max,
    volume_m3: water.volume_m3,
    ecological_status: water.ecological_status,
    segment_count: water.cluster_size || 1, // Smart clustered segments
    has_chart: country === 'SE' && water.area_km2 > 0.5, // Svenska sjöar > 0.5 km² har ofta sjökartor
    geometry: water.geometry
  };
}

/**
 * Bestämma land baserat på koordinater (korrekt indelning)
 */
function getCountryFromCoordinates(lat: number, lon: number): 'SE' | 'NO' | 'DK' {
  // NORGE - latitud-beroende gränser (smalare i söder, bredare i norr)
  if (lat >= 65.0 && lon >= 4.5 && lon <= 15.0) {
    return 'NO';
  } else if (lat >= 60.0 && lon >= 4.5 && lon <= 12.0) {
    return 'NO';
  } else if (lat >= 57.8 && lon >= 4.5 && lon <= 11.0) {
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
 * Mappa vattentyper från SMHI till våra standardtyper
 */
function mapWaterType(smhiType: string): 'lake' | 'river' | 'stream' | 'reservoir' | 'canal' {
  const type = smhiType?.toLowerCase() || '';
  
  if (type.includes('lake') || type.includes('water')) return 'lake';
  if (type.includes('river')) return 'river';
  if (type.includes('stream')) return 'stream';
  if (type.includes('reservoir')) return 'reservoir';
  if (type.includes('canal')) return 'canal';
  
  return 'lake'; // Default
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