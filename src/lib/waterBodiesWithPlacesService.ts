/**
 * Water Bodies with Places Service
 * Uses water_bodies_with_places table with disambiguation for best user experience
 * Same performance as existing system but with proper place names
 */

import { supabase } from './supabase';
import { WaterBodyData, WaterBodyDataFetcher } from './waterBodyDataFetcher';
import { vissCache } from './vissCache';

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

export interface WaterBodyWithPlacesSearchResult {
  waterBody: WaterBodyWithPlaces;
  vissData: WaterBodyData | null;
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
            .from('water_bodies_merged_fast_lookup')
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
            .from('water_bodies_merged_fast_lookup')
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
    // HYBRID STRATEGY: Different tolerance for different water types
    // Larger tolerance for rivers/streams to make them easier to click
    const largeRadius = maxDistanceKm * 0.02; // Tolerance for lakes and general use
    
    // Use our new PostGIS function with place names
    const { data: results, error } = await supabase
      .rpc('find_merged_water_body_containing_point', {
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
      .from('water_bodies_merged_fast_lookup')
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
 * GET DETAILED DATA WITH VISS - Same as SMHI system but for water_bodies_with_places
 */
export async function getWaterBodyWithPlacesDetails(
  waterBodyId: string
): Promise<WaterBodyWithPlacesSearchResult | null> {
  
  try {
    const { data: waterBody, error } = await supabase
      .from('water_bodies_merged_fast_lookup')
      .select('*')
      .eq('id', waterBodyId)
      .single();

    if (error || !waterBody) {
      console.warn('Water body with places not found:', waterBodyId, error);
      return null;
    }

    // ANVÄND CACHAD VISS-DATA istället för live API-anrop (SNABBT!)
    let vissData: WaterBodyData | null = null;
    if (waterBody.country === 'SE' && waterBody.name) {
      // Kolla om vi har cachad VISS-data
      if (waterBody.ecological_status || waterBody.water_quality_status || waterBody.fishing_regulations || waterBody.cached_viss_data) {
        // Skapa VISS-data från cache (OMEDELBART!)
        
        // Använd cached_viss_data om det finns, annars bygg från grundfält
        if (waterBody.cached_viss_data) {
          // Komplett cachad VISS-data
          vissData = waterBody.cached_viss_data;
        } else {
          // Bygg från grundläggande cachade fält
          vissData = {
            basic: {
              name: waterBody.name,
              eu_cd: '',
              ms_cd: '',
              type: waterBody.water_type === 'lake' ? 'lake' : 'river',
              coordinates: { lat: waterBody.lat || 0, lon: waterBody.lon || 0 },
              area_m2: waterBody.volume_m3 ? Math.sqrt(waterBody.volume_m3) * 1000 : undefined,
              county: waterBody.county || '',
              district: waterBody.water_district || '',
              viss_url: ''
            },
            waterQuality: waterBody.ecological_status ? {
              oxygen: { status: 'Unknown', conditions: 'Unknown' },
              nutrients: { status: 'Unknown', chlorophyll: 'Unknown' },
              acidity: { ph_status: 'Unknown', acid_neutralizing: 'Unknown' },
              transparency: { light_conditions: 'Unknown', visibility: 'Unknown' },
              ecological_status: waterBody.ecological_status,
              chemical_status: waterBody.water_quality_status || 'Unknown',
              overall_risk: 'Unknown'
            } : null,
            fishData: waterBody.fishing_regulations || waterBody.depth_mean ? {
              fish_community_status: 'Unknown',
              fish_indices: {},
              fishing_regulations: waterBody.fishing_regulations ? {
                general_info: waterBody.fishing_regulations
              } : undefined
            } : null,
            currentConditions: {},
            metadata: {
              last_updated: waterBody.viss_last_updated || new Date().toISOString(),
              data_sources: ['VISS_CACHE'],
              quality_assessment: {
                viss_data_age: 'cached',
                smhi_data_freshness: 'cached',
                completeness_score: 75
              }
            }
          };
        }
      } else {
        // Fallback till live hämtning bara om ingen cache finns
        try {
          // ANVÄND NAMNET för VISS-sökning (original_id är ett ID-nummer, inte ett namn!)
          const searchName = waterBody.name;
          
          // SÄKERHETSKOLL: Se till att vi har ett giltigt namn
          if (!searchName || typeof searchName !== 'string') {
    
            vissData = null;
          } else {
            const coordinates = waterBody.lat && waterBody.lon ? 
              { lat: waterBody.lat, lon: waterBody.lon } : undefined;
            
            // MULTI-LEVEL CACHE: localStorage → CDN → VISS API
            
            // Level 1: localStorage cache (snabbast)
            vissData = vissCache.get(searchName, coordinates);
          
            if (!vissData) {
              // Level 2: CDN cache (snabbt + global)
              vissData = await vissCache.fetchFromCDN(searchName, coordinates);
              
              if (vissData) {
                // Spara i localStorage för nästa gång
                vissCache.set(searchName, vissData, coordinates);
              } else {
                // Level 3: Direct VISS API (långsammast, sista utväg)
                const fetcher = new WaterBodyDataFetcher();
                vissData = await fetcher.fetchWaterBodyDataWithValidation(searchName, coordinates);
                
                if (vissData) {
                  vissCache.set(searchName, vissData, coordinates);
                }
              }
            }
          }
        } catch (error) {
          console.warn('❌ Kunde inte hämta VISS-data för:', waterBody.name, error);
        }
      }
    }

    return {
      waterBody: waterBody as WaterBodyWithPlaces,
      vissData
    };
    
  } catch (error) {
    console.error('Fel vid hämtning av water body with places details:', error);
    return null;
  }
}

/**
 * COMPATIBILITY: Convert to SMHIWaterBody format for existing components
 */
export function convertToSMHIFormat(waterBody: WaterBodyWithPlaces): any {
  const lat = waterBody.lat || 60.0;
  const lon = waterBody.lon || 15.0;
  
  // FINLAND-FIX: Om country inte är satt (null/undefined), sätt till Finland
  const country = waterBody.country || 'FI';
  
  return {
    id: waterBody.id.toString(),
    name: waterBody.display_name || waterBody.name, // Use display_name if available!
    water_type: waterBody.water_type,
    country: country,
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