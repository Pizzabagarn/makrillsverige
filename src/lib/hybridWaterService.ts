/**
 * Hybrid Water Service - OSM + SMHI Integration
 * 
 * Combines the best of both datasets:
 * - SMHI: High quality lakes with unified segments, depth/volume data
 * - OSM: Complete coverage of rivers/streams, detailed metadata
 * 
 * This service maintains the same API interface as smhiWaterService.ts
 * for seamless migration while providing enhanced data quality.
 */

import { supabase } from '@/lib/supabase'

export interface HybridWaterBody {
  id: number
  name: string
  water_type: string
  geometry: any
  lat: number
  lon: number
  area_km2: number
  country: string // Derived from geometry or region
  
  // Source metadata
  data_source: 'SMHI' | 'OSM'
  source_priority: number
  
  // SMHI-specific fields (lakes)
  depth_mean?: number
  depth_max?: number
  volume_m3?: number
  ecological_status?: string
  segment_count?: number
  unification_method?: string
  cluster_size?: number
  
  // OSM-specific fields (rivers/streams)
  osm_id?: number
  fishing_regulations?: any
  water_quality_status?: string
  region?: string
  water_district?: string
  
  // Enhanced fields
  tags?: any
  metadata_source?: string
}

/**
 * Convert database record to HybridWaterBody interface
 */
function convertToHybridWaterBody(water: any): HybridWaterBody {
  return {
    id: water.id,
    name: water.name,
    water_type: water.water_type,
    geometry: water.geometry,
    lat: water.lat,
    lon: water.lon,
    area_km2: water.area_km2 || 0,
    country: deriveCountryFromRegion(water.region, water.lat, water.lon),
    
    // Source metadata
    data_source: water.data_source,
    source_priority: water.source_priority,
    
    // SMHI fields
    depth_mean: water.depth_mean,
    depth_max: water.depth_max,
    volume_m3: water.volume_m3,
    ecological_status: water.ecological_status,
    segment_count: water.segment_count || 1,
    unification_method: water.unification_method,
    cluster_size: water.cluster_size,
    
    // OSM fields
    osm_id: water.osm_id,
    fishing_regulations: water.fishing_regulations,
    water_quality_status: water.water_quality_status,
    region: water.region,
    water_district: water.water_district,
    
    // Enhanced
    tags: water.tags,
    metadata_source: water.metadata_source
  }
}

/**
 * Derive country from region or coordinates
 */
function deriveCountryFromRegion(region?: string, lat?: number, lon?: number): string {
  // For OSM data, use region field
  if (region) {
    if (region.toLowerCase().includes('sweden') || region.toLowerCase().includes('sverige')) return 'SE'
    if (region.toLowerCase().includes('norway') || region.toLowerCase().includes('norge')) return 'NO'
    if (region.toLowerCase().includes('denmark') || region.toLowerCase().includes('danmark')) return 'DK'
    if (region.toLowerCase().includes('finland') || region.toLowerCase().includes('suomi')) return 'FI'
  }
  
  // For SMHI data or fallback, use coordinates
  if (lat && lon) {
    // Simple coordinate-based country detection
    if (lat >= 55 && lat <= 69 && lon >= 10 && lon <= 25) {
      if (lon <= 12) return 'NO' // Western coordinates = Norway
      if (lon >= 20) return 'FI'  // Eastern coordinates = Finland
      return 'SE' // Sweden (most SMHI data)
    }
    if (lat >= 54 && lat <= 58 && lon >= 8 && lon <= 15) return 'DK' // Denmark
  }
  
  return 'SE' // Default to Sweden for SMHI data
}

/**
 * Get water bodies within map bounds (for map rendering)
 */
export async function getHybridWaterBodiesInBounds(
  bounds: { north: number; south: number; east: number; west: number }
): Promise<HybridWaterBody[]> {
  
  try {
    const { data: results, error } = await supabase
      .from('water_bodies_integrated')
      .select(`
        id, name, water_type, geometry, lat, lon, area_km2,
        data_source, source_priority,
        depth_mean, depth_max, volume_m3, ecological_status, segment_count, unification_method, cluster_size,
        osm_id, fishing_regulations, water_quality_status, region, water_district,
        tags, metadata_source
      `)
      // Efficient bounding box filter using lat/lon indexes
      .gte('lat', bounds.south)
      .lte('lat', bounds.north)
      .gte('lon', bounds.west)
      .lte('lon', bounds.east)
      .not('name', 'is', null)
      .not('geometry', 'is', null)
      // Prioritize high-quality sources and larger water bodies
      .order('source_priority', { ascending: true })
      .order('area_km2', { ascending: false })
      .limit(1000) // Reasonable limit for map performance

    if (error) {
      console.error('⚠️ Hybrid bounds sökning misslyckades:', error)
      return []
    }

    return (results || []).map(convertToHybridWaterBody)
    
  } catch (error) {
    console.error('Fel vid hybrid bounds-sökning:', error)
    return []
  }
}

/**
 * Find water body at specific coordinates (for map clicks)
 * Uses the same two-strategy approach as SMHI service: ST_Contains + Smart Proximity
 */
export async function getHybridWaterBodyAtCoordinates(
  lat: number,
  lon: number,
  maxDistanceKm: number = 1
): Promise<HybridWaterBody | null> {
  
  try {
    // Extended search radius for large lakes (especially SMHI unified lakes)
    const expandedDistanceKm = Math.max(maxDistanceKm, 3)
    
    // STRATEGY 1: Try exact geometry hit (ST_Contains) - prioritize this for unified lakes
    const exactMatch = await getHybridWaterBodyByGeometryContains(lat, lon, expandedDistanceKm)
    if (exactMatch) {
      return exactMatch
    }

    // STRATEGY 2: Smart proximity with source-aware prioritization
    return getHybridWaterBodyBySmartProximity(lat, lon, expandedDistanceKm)
    
  } catch (error) {
    console.error('Fel vid hybrid koordinat-sökning:', error)
    return null
  }
}

/**
 * STRATEGY 1: Exact geometry hit using PostGIS ST_Contains
 * Prioritizes SMHI unified lakes for better clicking on large water bodies
 */
async function getHybridWaterBodyByGeometryContains(
  lat: number,
  lon: number,
  maxDistanceKm: number
): Promise<HybridWaterBody | null> {
  
  try {
    const searchRadius = maxDistanceKm * 0.02
    
    // Use PostGIS function for exact geometry containment
    // Note: Will need to create this function for the hybrid table
    const { data: results, error } = await supabase
      .rpc('find_hybrid_water_body_containing_point', {
        click_lat: lat,
        click_lon: lon,
        search_radius_deg: searchRadius
      })

    if (error) {
      console.warn('ST_Contains sökning misslyckades, använder fallback:', error)
      return null
    }

    if (results && results.length > 0) {
      // Prioritize SMHI lakes over OSM, then by area
      const prioritized = results.sort((a: any, b: any) => {
        // 1. Data source priority (SMHI lakes first)
        if (a.data_source === 'SMHI' && a.water_type === 'lake' && 
            !(b.data_source === 'SMHI' && b.water_type === 'lake')) return -1
        if (b.data_source === 'SMHI' && b.water_type === 'lake' && 
            !(a.data_source === 'SMHI' && a.water_type === 'lake')) return 1
            
        // 2. Water type priority (lakes > rivers > streams)
        const typeOrder = { lake: 1, river: 2, stream: 3 }
        const aOrder = typeOrder[a.water_type as keyof typeof typeOrder] || 4
        const bOrder = typeOrder[b.water_type as keyof typeof typeOrder] || 4
        if (aOrder !== bOrder) return aOrder - bOrder
        
        // 3. Area size (larger first)
        return (b.area_km2 || 0) - (a.area_km2 || 0)
      })
      
      return convertToHybridWaterBody(prioritized[0])
    }

    return null
    
  } catch (error) {
    console.warn('Geometri-sökning misslyckades:', error)
    return null
  }
}

/**
 * STRATEGY 2: Smart proximity-based search with hybrid source prioritization
 */
async function getHybridWaterBodyBySmartProximity(
  lat: number,
  lon: number,
  maxDistanceKm: number
): Promise<HybridWaterBody | null> {
  
  try {
    // Extended search radius for hybrid data
    const expandedRadius = maxDistanceKm * 0.02
    
    const { data: results, error } = await supabase
      .from('water_bodies_integrated')
      .select(`
        id, name, water_type, geometry, lat, lon, area_km2,
        data_source, source_priority,
        depth_mean, depth_max, volume_m3, ecological_status, segment_count, cluster_size,
        osm_id, fishing_regulations, water_quality_status, region, water_district,
        tags, metadata_source
      `)
      // Expanded bounding box for better large lake detection
      .gte('lat', lat - expandedRadius)
      .lte('lat', lat + expandedRadius) 
      .gte('lon', lon - expandedRadius)
      .lte('lon', lon + expandedRadius)
      .not('name', 'is', null)
      .not('geometry', 'is', null)
      // Prioritize by source and size
      .order('source_priority', { ascending: true })
      .order('area_km2', { ascending: false })
      .limit(30)

    if (error) {
      console.warn('⚠️ Hybrid proximity sökning misslyckades:', error)
      return null
    }

    if (!results || results.length === 0) {
      return null
    }

    // HYBRID SMART SCORING: Enhanced for combined datasets
    let bestMatch: any = null
    let bestScore = -1

    for (const water of results) {
      const waterLat = water.lat
      const waterLon = water.lon

      if (!waterLat || !waterLon) continue

      const distance = Math.sqrt(
        Math.pow(waterLat - lat, 2) + Math.pow(waterLon - lon, 2)
      )

      // Smart distance threshold based on source and size
      const isLargeLake = water.water_type === 'lake' && water.area_km2 > 500
      const isSMHILake = water.data_source === 'SMHI' && water.water_type === 'lake'
      
      const distanceThreshold = isLargeLake || isSMHILake
        ? maxDistanceKm * 0.03  // Extra tolerant for large/SMHI lakes
        : maxDistanceKm * 0.015 // Standard tolerance
      
      if (distance <= distanceThreshold) {
        let score = 0

        // 1. DATA SOURCE & TYPE PRIORITIZATION
        if (water.data_source === 'SMHI' && water.water_type === 'lake') {
          score += 2000 // SMHI lakes get highest priority
          
          // Extra bonus for large SMHI lakes (unified segments)
          if (water.area_km2 > 1000) {
            score += 3000 // Massive bonus for large unified lakes
          } else if (water.area_km2 > 500) {
            score += 1500 // Medium bonus
          }
        } else if (water.water_type === 'lake') {
          score += 1000 // Regular lakes
        } else if (water.water_type === 'river') {
          score += 500 // Rivers
        } else if (water.water_type === 'stream') {
          score += 100 // Streams
        }

        // 2. SEGMENT/CLUSTER BONUS (for SMHI unified data)
        if (water.cluster_size) {
          score += water.cluster_size * 30
        }
        if (water.segment_count && water.segment_count > 1) {
          score += water.segment_count * 20
        }

        // 3. PROXIMITY BONUS
        const proximityBonus = (1 / (distance + 0.001)) * 100
        score += proximityBonus

        // 4. PRECISION BONUS
        if (distance < 0.002) {
          score += 500 // Very precise click
        } else if (distance < 0.005 && (isLargeLake || isSMHILake)) {
          score += 300 // Good click on large/SMHI lake
        }

        // 5. SOURCE PRIORITY BONUS
        if (water.source_priority === 1) {
          score += 200 // Primary source bonus
        }

        if (score > bestScore) {
          bestScore = score
          bestMatch = water
        }
      }
    }

    return bestMatch ? convertToHybridWaterBody(bestMatch) : null
    
  } catch (error) {
    console.error('Hybrid proximity sökning misslyckades:', error)
    return null
  }  
}

/**
 * Search water bodies by name (for search functionality)
 */
export async function searchHybridWaterBodies(
  searchTerm: string,
  limit: number = 20
): Promise<HybridWaterBody[]> {
  
  if (!searchTerm || searchTerm.trim().length < 2) {
    return []
  }

  try {
    const cleanedTerm = searchTerm.trim().toLowerCase()
    
    const { data: results, error } = await supabase
      .from('water_bodies_integrated')
      .select(`
        id, name, water_type, geometry, lat, lon, area_km2,
        data_source, source_priority,
        depth_mean, depth_max, volume_m3, ecological_status, segment_count,
        osm_id, fishing_regulations, water_quality_status, region, water_district,
        tags, metadata_source
      `)
      .ilike('name', `%${cleanedTerm}%`)
      .not('name', 'is', null)
      .not('geometry', 'is', null)
      // Prioritize: SMHI lakes first, then by size, then by source priority
      .order('data_source', { ascending: true }) // OSM before SMHI alphabetically, but we'll re-sort
      .order('area_km2', { ascending: false })
      .order('source_priority', { ascending: true })
      .limit(limit * 2) // Get more results for better sorting

    if (error) {
      console.error('⚠️ Hybrid search misslyckades:', error)
      return []
    }

    if (!results || results.length === 0) {
      return []
    }

    // Smart sorting for search results: SMHI lakes first, then by relevance
    const sorted = results.sort((a, b) => {
      // 1. Exact name match first
      const aExact = a.name.toLowerCase() === cleanedTerm
      const bExact = b.name.toLowerCase() === cleanedTerm
      if (aExact && !bExact) return -1
      if (bExact && !aExact) return 1
      
      // 2. Name starts with search term
      const aStarts = a.name.toLowerCase().startsWith(cleanedTerm)
      const bStarts = b.name.toLowerCase().startsWith(cleanedTerm)
      if (aStarts && !bStarts) return -1
      if (bStarts && !aStarts) return 1
      
      // 3. SMHI lakes prioritized
      const aSMHILake = a.data_source === 'SMHI' && a.water_type === 'lake'
      const bSMHILake = b.data_source === 'SMHI' && b.water_type === 'lake'
      if (aSMHILake && !bSMHILake) return -1
      if (bSMHILake && !aSMHILake) return 1
      
      // 4. Water type priority (lakes > rivers > streams)
      const typeOrder = { lake: 1, river: 2, stream: 3 }
      const aOrder = typeOrder[a.water_type as keyof typeof typeOrder] || 4
      const bOrder = typeOrder[b.water_type as keyof typeof typeOrder] || 4
      if (aOrder !== bOrder) return aOrder - bOrder
      
      // 5. Size (larger first)
      return (b.area_km2 || 0) - (a.area_km2 || 0)
    })

    return sorted.slice(0, limit).map(convertToHybridWaterBody)
    
  } catch (error) {
    console.error('Fel vid hybrid sökning:', error)
    return []
  }
}

/**
 * Get detailed information about a specific water body
 */
export async function getHybridWaterBodyDetails(id: number): Promise<HybridWaterBody | null> {
  
  try {
    const { data: result, error } = await supabase
      .from('water_bodies_integrated')
      .select(`
        id, name, water_type, geometry, lat, lon, area_km2,
        data_source, source_priority, original_id,
        depth_mean, depth_max, volume_m3, ecological_status, segment_count, unification_method, cluster_size, cluster_method,
        osm_id, osm_type, fishing_regulations, water_quality_status, region, water_district, main_catchment, sub_catchment,
        tags, metadata_source, created_at, updated_at
      `)
      .eq('id', id)
      .single()

    if (error) {
      console.error('⚠️ Hybrid details sökning misslyckades:', error)
      return null
    }

    return result ? convertToHybridWaterBody(result) : null
    
  } catch (error) {
    console.error('Fel vid hybrid details-sökning:', error)
    return null
  }
}

// Export type for compatibility
export type { HybridWaterBody as SMHIWaterBody } // For seamless migration