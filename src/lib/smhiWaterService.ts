/**
 * Hybrid Water Service - SMHI + OSM Integration
 * Uses water_bodies_integrated for best of both worlds:
 * - SMHI lakes (unified segments, depth/volume data)
 * - OSM rivers/streams (complete coverage, fishing data)
 * - Smart geographic prioritization
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
  country: 'SE' | 'NO' | 'DK' | 'FI';
  coordinates: [number, number];
  bounds?: [[number, number], [number, number]];
  area_km2?: number;
  
  // SMHI-specific data (lakes)
  depth_mean?: number;
  depth_max?: number;
  volume_m3?: number;
  ecological_status?: string;
  segment_count: number;
  unification_method?: string;
  
  // OSM-specific data (rivers/streams)
  fishing_regulations?: any;
  water_quality_status?: string;
  water_district?: string;
  
  // Source metadata
  data_source: 'SMHI' | 'OSM';
  source_priority: number;
  
  has_chart?: boolean;
  geometry?: any;
}

export interface SMHIWaterBodySearchResult {
  waterBody: SMHIWaterBody;
  distance?: number; // km från sökpunkt
  vissData?: WaterBodyData | null; // VISS-data för svenska sjöar
}

/**
 * Sök hybrid vattendrag (SMHI + OSM) från integrerade tabellen
 * SMART PRIORITERING: SMHI lakes först, sedan OSM fallback
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
        .from('water_bodies_integrated')
        .select(`id, name, water_type, geometry, lat, lon, area_km2,
          data_source, source_priority,
          depth_mean, depth_max, volume_m3, ecological_status, segment_count, unification_method,
          fishing_regulations, water_quality_status, water_district`)
        // SNABB bounding box-filter (använder index)
        .gte('lat', centerPoint.lat - searchRadius)
        .lte('lat', centerPoint.lat + searchRadius) 
        .gte('lon', centerPoint.lon - searchRadius)
        .lte('lon', centerPoint.lon + searchRadius)
        .not('name', 'is', null)
        .not('geometry', 'is', null)
        .ilike('name', `%${query}%`)
        .order('data_source', { ascending: true }) // SMHI först (SMHI < OSM alfabetiskt)
        .order('area_km2', { ascending: false })
        .limit(limit);
      
      results = dbResult.data;
      error = dbResult.error;
    } else {
      // Vanlig sökning utan geografisk filtrering
      const dbResult = await supabase
        .from('water_bodies_integrated')
        .select(`id, name, water_type, geometry, lat, lon, area_km2,
          data_source, source_priority,
          depth_mean, depth_max, volume_m3, ecological_status, segment_count, unification_method,
          fishing_regulations, water_quality_status, water_district`)
        .not('name', 'is', null)
        .not('geometry', 'is', null)
        .ilike('name', `%${query}%`)
        .order('data_source', { ascending: true }) // SMHI först (SMHI < OSM alfabetiskt)
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
      .from('water_bodies_integrated')
      .select(`id, name, water_type, geometry, lat, lon, area_km2,
          data_source, source_priority,
          depth_mean, depth_max, volume_m3, ecological_status, segment_count, unification_method,
          fishing_regulations, water_quality_status, water_district`)
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
    
    // HYBRID ST_Contains för både SMHI och OSM data
    const { data: results, error } = await supabase
      .rpc('find_hybrid_water_body_containing_point', {
        click_lat: lat,
        click_lon: lon,
        search_radius_deg: largeRadius
      });

    if (error) {
      console.warn('ST_Contains sökning misslyckades, använder fallback:', error);
      return null;
    }

    if (results && results.length > 0) {
      // Hybrid prioritering: SMHI lakes > OSM lakes > rivers > streams
      const smhiLakes = results.filter((r: any) => r.data_source === 'SMHI' && r.water_type === 'lake');
      const osmLakes = results.filter((r: any) => r.data_source === 'OSM' && r.water_type === 'lake');
      const rivers = results.filter((r: any) => r.water_type === 'river');
      
      const bestMatch = smhiLakes.length > 0 ? smhiLakes[0] : 
                       osmLakes.length > 0 ? osmLakes[0] :
                       rivers.length > 0 ? rivers[0] : results[0];
      
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
      .from('water_bodies_integrated')
      .select(`id, name, water_type, geometry, lat, lon, area_km2,
          data_source, source_priority,
          depth_mean, depth_max, volume_m3, ecological_status, segment_count, unification_method,
          fishing_regulations, water_quality_status, water_district`)
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
        
        // HYBRID SMART POÄNG-SYSTEM: SMHI prioriterat!
        let score = 0;
        
        // 1. DATA-KÄLLA PRIORITERING (SMHI först!)
        if (water.data_source === 'SMHI') {
          score += 2000; // SMHI får högst prioritet
        } else if (water.data_source === 'OSM') {
          score += 500;  // OSM som fallback
        }
        
        // 2. VATTENTYP-PRIORITERING 
        if (water.water_type === 'lake') {
          score += 1000; // Sjöar har högsta prioritet
          
          // EXTRA BONUS för stora sjöar
          if (water.area_km2 > 1000) {
            score += 3000; // Stor bonus för sjöar >1000 km²
          } else if (water.area_km2 > 500) {
            score += 1500; // Medium bonus för sjöar >500 km²
          }
        } else if (water.water_type === 'river') {
          score += 500;  // Åar/floder
        } else if (water.water_type === 'stream') {
          score += 100;  // Bäckar lägst prioritet
        } else {
          score += 300;  // Övriga vattentyper
        }
        
        // 3. SEGMENT-STORLEK BONUS (unified segments = bättre)
        const segmentCount = water.segment_count || 1;
        if (segmentCount > 1) {
          score += segmentCount * 30; // Bonus för unified lakes
        }
        
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
      .from('water_bodies_integrated')
      .select('*')
      .eq('id', waterBodyId)
      .single();

    if (error || !waterBody) {
      console.warn('SMHI vattendrag inte hittat:', waterBodyId, error);
      return null;
    }

    const smhiWaterBody = convertToSMHIWaterBody(waterBody);
    
    // Hämta komplett VISS/SMHI-data för svenska sjöar med geografisk validering
    let vissData: WaterBodyData | null = null;
    if (smhiWaterBody.country === 'SE' && smhiWaterBody.name) {
      try {
        const fetcher = new WaterBodyDataFetcher();
        // Använd validerad hämtning med SMHI-koordinater som referens
        vissData = await fetcher.fetchWaterBodyDataWithValidation(
          smhiWaterBody.name,
          smhiWaterBody.coordinates ? 
            { lat: smhiWaterBody.coordinates[0], lon: smhiWaterBody.coordinates[1] } : 
            undefined
        );
    
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
 * Konvertera hybrid databaspost (SMHI + OSM) till SMHIWaterBody
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
    
    // SMHI-specific data (for lakes)
    depth_mean: water.depth_mean,
    depth_max: water.depth_max,
    volume_m3: water.volume_m3,
    ecological_status: water.ecological_status,
    segment_count: water.segment_count || 1,
    unification_method: water.unification_method,
    
    // OSM-specific data (for rivers/streams)
    fishing_regulations: water.fishing_regulations,
    water_quality_status: water.water_quality_status,
    water_district: water.water_district,
    
    // Source metadata
    data_source: water.data_source,
    source_priority: water.source_priority,
    
    has_chart: country === 'SE' && water.area_km2 > 0.5, // Svenska sjöar > 0.5 km² har ofta sjökartor
    geometry: water.geometry
  };
}

/**
 * Bestämma land baserat på koordinater (inkluderar Finland)
 */
function getCountryFromCoordinates(lat: number, lon: number): 'SE' | 'NO' | 'DK' | 'FI' {
  // FINLAND - östliga koordinater
  if (lon >= 20.0 && lon <= 32.0 && lat >= 59.5 && lat <= 70.5) {
    return 'FI';
  }
  
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