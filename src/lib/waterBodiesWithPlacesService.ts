/**
 * Water Bodies with Places Service
 * Uses water_bodies_with_places table with disambiguation for best user experience
 * Same performance as existing system but with proper place names
 */

import { createClient } from '@supabase/supabase-js';

// Use same configuration as other services
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface WaterBodyWithPlaces {
  id: number;
  name: string;
  water_type: string;
  geometry: any;
  lat: number;
  lon: number;
  area_km2: number;
  data_source: string;
  source_priority: number;
  original_id: number;
  depth_mean?: number;
  depth_max?: number;
  volume_m3?: number;
  ecological_status?: string;
  segment_count?: number;
  unification_method?: string;
  cluster_size?: number;
  cluster_method?: string;
  osm_id?: number;
  osm_type?: string;
  fishing_regulations?: any;
  water_quality_status?: string;
  region?: string;
  water_district?: string;
  tags?: any;
  metadata_source?: string;
  // NEW PLACE NAME COLUMNS
  municipality?: string;
  municipality_type?: string;
  county?: string;
  country?: string;
  display_name?: string;
  name_conflicts?: number;
  disambiguation_method?: string;
  administrative_source?: string;
}

export interface WaterBodySearchResult {
  results: WaterBodyWithPlaces[];
  total_count: number;
}

/**
 * SEARCH FUNCTION - EXACT SAME LOGIC AS ORIGINAL but with water_bodies_with_places
 */
export async function searchWaterBodiesWithPlaces(
  query: string,
  limit: number = 50,
  centerPoint?: { lat: number; lon: number },
  maxDistance?: number // km
): Promise<WaterBodyWithPlaces[]> {
  
  if (!query || query.length < 2) return [];
  
  try {
    let results, error;

    // Geografisk filtrering om centrum och avstånd angivs
            if (centerPoint && maxDistance) {
          const searchRadius = maxDistance * 0.009; // ~1km = 0.009 grader
          
          const dbResult = await supabase
            .from('water_bodies_with_places')
            .select(`id, name, water_type, geometry, lat, lon, area_km2,
              data_source, source_priority, original_id,
              depth_mean, depth_max, volume_m3, ecological_status, segment_count, unification_method,
              cluster_size, cluster_method, osm_id, osm_type,
              fishing_regulations, water_quality_status, region, water_district,
              tags, metadata_source,
              municipality, municipality_type, county, country, display_name,
              name_conflicts, disambiguation_method, administrative_source`)
            // SNABB bounding box-filter (använder index) - EXAKT som gamla systemet
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
          // Vanlig sökning utan geografisk filtrering - EXAKT som gamla systemet!
          const dbResult = await supabase
            .from('water_bodies_with_places')
            .select(`id, name, water_type, geometry, lat, lon, area_km2,
              data_source, source_priority, original_id,
              depth_mean, depth_max, volume_m3, ecological_status, segment_count, unification_method,
              cluster_size, cluster_method, osm_id, osm_type,
              fishing_regulations, water_quality_status, region, water_district,
              tags, metadata_source,
              municipality, municipality_type, county, country, display_name,
              name_conflicts, disambiguation_method, administrative_source`)
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
      console.warn('Places-databasfel vid vattendrags-sökning:', error);
      return [];
    }

    if (!results || results.length === 0) {
      return [];
    }

    return results;
    
  } catch (error) {
    console.error('Fel vid Places-sökning av vattendrag:', error);
    return [];
  }
}

/**
 * CLICK FUNCTION - Same performance and logic as existing system
 * Uses the new find_water_body_with_places_containing_point function
 */
export async function getWaterBodyWithPlacesAtCoordinates(
  lat: number,
  lon: number,
  maxDistanceKm: number = 1
): Promise<WaterBodyWithPlaces | null> {
  
  try {
    // ANVÄND NY KLUSTRAD MATERIALIZED VIEW för både snabbhet OCH klustring!
    const searchRadius = maxDistanceKm * 0.009; // ~1km = 0.009 grader
    
    // ANVÄND SAMMA STRATEGI som det fungerande gamla systemet!
    const expandedDistanceKm = Math.max(maxDistanceKm, 3); // At least 3km for large lakes
    
    // STRATEGY 1: Exact geometry hit with ST_Contains (prioritizes lakes user clicks INSIDE)
    const exactMatch = await getWaterBodyByGeometryContains(lat, lon, expandedDistanceKm);
    if (exactMatch) {
      return exactMatch;
    }

    // STRATEGY 2: Smart proximity-based search with large tolerance for big lakes
    return getWaterBodyBySmartProximity(lat, lon, expandedDistanceKm);
    
  } catch (error) {
    console.error('Fel vid Places-koordinat-lookup:', error);
    return null;
  }
}

/**
 * STRATEGY 1: Exact geometry hit with ST_Contains (prioritizes lakes user clicks INSIDE)
 */
async function getWaterBodyByGeometryContains(
  lat: number,
  lon: number,
  maxDistanceKm: number
): Promise<WaterBodyWithPlaces | null> {
  
  try {
    // SMART STRATEGY: Larger tolerance for big lakes
    const largeRadius = maxDistanceKm * 0.05; // Larger radius for big lakes
    
    // Use our new PostGIS function with place names
    const { data: results, error } = await supabase
      .rpc('find_water_body_with_places_containing_point', {
        click_lat: lat,
        click_lon: lon,
        search_radius_deg: largeRadius
      });

    if (error) {
      console.error('PostGIS function error:', error);
      return null;
    }

    if (!results || results.length === 0) {
      return null;
    }

    // Return the best match (function already prioritizes SMHI lakes, area, etc.)
    return results[0];
    
  } catch (error) {
    console.error('Geometry contains search failed:', error);
    return null;
  }
}

/**
 * STRATEGY 2: Smart proximity-based search (fallback for clicks near but not inside geometries)
 */
async function getWaterBodyBySmartProximity(
  lat: number,
  lon: number,
  maxDistanceKm: number
): Promise<WaterBodyWithPlaces | null> {
  
  try {
    // SAME LOGIC as existing system
    const searchRadius = maxDistanceKm * 0.02; // ~1km = 0.009 degrees, scaled up
    
    const { data: results, error } = await supabase
      .from('water_bodies_with_places')
      .select('*')
      // Fast bounding box filter (uses regular numeric indexes)
      .gte('lat', lat - searchRadius)
      .lte('lat', lat + searchRadius) 
      .gte('lon', lon - searchRadius)
      .lte('lon', lon + searchRadius)
      .not('name', 'is', null)
      .not('geometry', 'is', null)
      .order('area_km2', { ascending: false })
      .limit(20); // Get multiple candidates for JavaScript filtering

    if (error) {
      console.error('Proximity search failed:', error);
      return null;
    }

    if (!results || results.length === 0) {
      return null;
    }

    // SAME LOGIC: JavaScript filtering for closest match
    let bestMatch: WaterBodyWithPlaces | null = null;
    let shortestDistance = Infinity;

    for (const waterBody of results) {
      // Calculate distance using Haversine formula (same as existing system)
      const distance = calculateDistance(lat, lon, waterBody.lat, waterBody.lon);
      
      if (distance < shortestDistance && distance <= maxDistanceKm) {
        shortestDistance = distance;
        bestMatch = waterBody;
      }
    }

    return bestMatch;
    
  } catch (error) {
    console.error('Smart proximity search failed:', error);
    return null;
  }
}

/**
 * Calculate distance between two points using Haversine formula
 * Same implementation as existing system
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * COMPATIBILITY: Convert to SMHIWaterBody format for existing components
 */
export function convertToSMHIFormat(waterBody: WaterBodyWithPlaces): any {
  const lat = waterBody.lat || 60.0;
  const lon = waterBody.lon || 15.0;
  
  return {
    id: waterBody.id.toString(),
    name: waterBody.display_name || waterBody.name, // Use display_name if available!
    water_type: waterBody.water_type,
    country: waterBody.country,
    coordinates: [lat, lon], // CRITICAL: This is what the component expects!
    geometry: waterBody.geometry,
    lat: lat,
    lon: lon,
    area_km2: waterBody.area_km2,
    data_source: waterBody.data_source,
    source_priority: waterBody.source_priority,
    original_id: waterBody.original_id,
    depth_mean: waterBody.depth_mean,
    depth_max: waterBody.depth_max,
    volume_m3: waterBody.volume_m3,
    ecological_status: waterBody.ecological_status,
    segment_count: waterBody.segment_count,
    unification_method: waterBody.unification_method,
    cluster_size: waterBody.cluster_size,
    cluster_method: waterBody.cluster_method,
    osm_id: waterBody.osm_id,
    osm_type: waterBody.osm_type,
    fishing_regulations: waterBody.fishing_regulations,
    water_quality_status: waterBody.water_quality_status,
    region: waterBody.region,
    water_district: waterBody.water_district,
    tags: waterBody.tags,
    metadata_source: waterBody.metadata_source,
    // Additional place info for enhanced UI
    municipality: waterBody.municipality,
    administrative_source: waterBody.administrative_source,
    // Add has_chart property (required by component)
    has_chart: false // Default value, can be enhanced later
  };
}