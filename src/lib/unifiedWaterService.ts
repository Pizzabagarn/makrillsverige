/**
 * Unified Water Service - Smart växling mellan gamla och nya systemet
 * 
 * FUNKTIONER:
 * - Feature flag för enkel switch mellan system
 * - Exakt samma API som nuvarande system
 * - Smart sökning: "Höje å lun" → "Höje å (Lund)"
 * - Klickbart på vilken del som helst av sammansatt vattendrag
 * - VISS-kompatibilitet bevarad
 */

import { supabase } from './supabase';
import { WaterBodyDataFetcher, WaterBodyData } from './waterBodyDataFetcher';

// Import existing services for fallback
import { 
    searchSMHIWaterBodies, 
    getSMHIWaterBodyAtCoordinates,
    getSMHIWaterBodiesInBounds,
    getSMHIWaterBodyDetails,
    SMHIWaterBody,
    SMHIWaterBodySearchResult
} from './smhiWaterService';

// Use centralized Supabase client to avoid multiple GoTrueClient instances

// FEATURE FLAG - Du kan ändra detta för att switcha system
const USE_UNIFIED_SYSTEM = false; // <-- Sätt till true när redo att testa

// Interfaces för unified system
export interface UnifiedWaterBody {
    id: string;
    name: string; // Originalnamn för VISS-kompatibilitet
    display_name: string; // "Höje å (Lund)" för UI
    water_type: 'lake' | 'river' | 'stream' | 'reservoir' | 'canal';
    country: 'SE' | 'NO' | 'DK' | 'FI';
    coordinates: [number, number];
    bounds?: [[number, number], [number, number]];
    area_km2?: number;
    total_length_km?: number;
    
    // Sammanslagning metadata
    original_segment_count: number;
    unification_method?: string;
    municipality?: string;
    
    // SMHI-specific data (lakes)
    depth_mean?: number;
    depth_max?: number;
    volume_m3?: number;
    ecological_status?: string;
    
    // OSM-specific data (rivers/streams)
    fishing_regulations?: any;
    water_quality_status?: string;
    water_district?: string;
    
    // Source metadata
    data_source: 'SMHI' | 'OSM' | 'HYBRID';
    source_priority: number;
    
    has_chart?: boolean;
    geometry?: any;
}

export interface UnifiedWaterBodySearchResult {
    waterBody: UnifiedWaterBody;
    vissData?: WaterBodyData | null;
}

/**
 * Konvertera unified database record till UnifiedWaterBody
 */
function convertToUnifiedWaterBody(water: any): UnifiedWaterBody {
    const lat = water.center_lat || water.lat || 60.0;
    const lon = water.center_lon || water.lon || 15.0;
    
    return {
        id: water.id.toString(),
        name: water.name,
        display_name: water.display_name,
        water_type: mapWaterType(water.water_type),
        country: getCountryFromCoordinates(lat, lon),
        coordinates: [lat, lon],
        area_km2: water.total_area_km2,
        total_length_km: water.total_length_km,
        original_segment_count: water.original_segment_count || 1,
        unification_method: water.unification_method,
        municipality: water.municipality,
        depth_mean: water.depth_mean,
        depth_max: water.depth_max,
        volume_m3: water.volume_m3,
        ecological_status: water.ecological_status,
        fishing_regulations: water.fishing_regulations,
        water_quality_status: water.water_quality_status,
        water_district: water.water_district,
        data_source: water.data_source as 'SMHI' | 'OSM' | 'HYBRID',
        source_priority: water.source_priority || 1,
        has_chart: false, // TODO: Implementera chart-logik
        geometry: water.geometry
    };
}

/**
 * SMART SÖKNING - Fungerar med disambiguation
 * "Höje å lun" → "Höje å (Lund)"
 */
export async function searchUnifiedWaterBodies(
    searchTerm: string,
    limit: number = 20,
    centerPoint?: { lat: number; lon: number },
    maxDistance?: number
): Promise<UnifiedWaterBody[]> {
    
    // Feature flag check
    if (!USE_UNIFIED_SYSTEM) {
        // Fallback till gamla systemet
        const smhiResults = await searchSMHIWaterBodies(searchTerm, limit, centerPoint, maxDistance);
        return smhiResults.map(convertSMHIToUnified);
    }
    
    if (!searchTerm || searchTerm.length < 2) return [];
    
    try {
        let query = supabase
            .from('water_bodies_unified_fast_lookup')
            .select('*');
        
        // SAMMA geografisk filtrering som nuvarande system
        if (centerPoint && maxDistance) {
            const searchRadius = maxDistance * 0.009; // EXAKT samma som nu
            query = query
                .gte('center_lat', centerPoint.lat - searchRadius)
                .lte('center_lat', centerPoint.lat + searchRadius)
                .gte('center_lon', centerPoint.lon - searchRadius)
                .lte('center_lon', centerPoint.lon + searchRadius);
        }
        
        // Smart text-matching - stödjer "Höje å lun" → "Höje å (Lund)"
        const { data, error } = await query
            .or(`display_name.ilike.%${searchTerm}%,search_terms.fts(swedish).${searchTerm}`)
            .order('popularity_score', { ascending: false })
            .order('total_area_km2', { ascending: false })
            .limit(limit);
        
        if (error) {
            console.error('Unified search error:', error);
            return [];
        }
        
        return data?.map(convertToUnifiedWaterBody) || [];
        
    } catch (error) {
        console.error('Unified search failed:', error);
        return [];
    }
}

/**
 * KLICK-FUNKTION - Fungerar på vilken del som helst av sammansatt vattendrag
 * Samma prestanda som nuvarande system
 */
export async function getUnifiedWaterBodyAtCoordinates(
    lat: number,
    lon: number,
    maxDistanceKm: number = 1
): Promise<UnifiedWaterBody | null> {
    
    // Feature flag check
    if (!USE_UNIFIED_SYSTEM) {
        // Fallback till gamla systemet
        const smhiResult = await getSMHIWaterBodyAtCoordinates(lat, lon, maxDistanceKm);
        return smhiResult ? convertSMHIToUnified(smhiResult) : null;
    }
    
    try {
        // *** ULTRASNABB STRATEGI: Samma metod som väder-sidan och gamla systemet! ***
        // Gör en enkel bounding box-sökning istället för komplexa PostGIS-queries
        
        const expandedDistanceKm = Math.max(maxDistanceKm, 3); // Minst 3km för stora sjöar
        const searchRadius = expandedDistanceKm * 0.009; // ~1km = 0.009 grader
        
        const { data: results, error } = await supabase
            .from('water_bodies_unified_fast_lookup')
            .select('*')
            // SNABB bounding box-filter (använder vanliga numeriska index)
            .gte('center_lat', lat - searchRadius)
            .lte('center_lat', lat + searchRadius) 
            .gte('center_lon', lon - searchRadius)
            .lte('center_lon', lon + searchRadius)
            .not('name', 'is', null)
            .not('geometry', 'is', null)
            .order('popularity_score', { ascending: false })
            .order('total_area_km2', { ascending: false })
            .limit(20); // Hämta flera kandidater för JavaScript-filtrering

        if (error) {
            console.error('Unified bounding box search failed:', error);
            return null;
        }

        if (!results || results.length === 0) {
            return null;
        }

        // HYBRID STRATEGI: JavaScript först (snabbt), ST_Contains för sammansatta (säkert)
        
        // STEG 1: JavaScript-filtrering för alla vatten (samma som gamla systemet)
        let bestMatch: any = null;
        let shortestDistance = Infinity;

        for (const water of results) {
            const distance = Math.sqrt(
                Math.pow(water.center_lat - lat, 2) + Math.pow(water.center_lon - lon, 2)
            );

            if (distance <= expandedDistanceKm * 0.009 && distance < shortestDistance) {
                shortestDistance = distance;
                bestMatch = water;
            }
        }

        // STEG 2: Om ingen träff och vi har sammansatta vattendrag - använd ST_Contains
        if (!bestMatch) {
            const hasMergedWaterBodies = results.some(w => w.original_segment_count > 1);
            
            if (hasMergedWaterBodies) {
                try {
                    const { data: exactResults, error: exactError } = await supabase
                        .rpc('find_unified_water_body_containing_point', {
                            click_lat: lat,
                            click_lon: lon,
                            search_radius_deg: searchRadius
                        });

                    if (!exactError && exactResults && exactResults.length > 0) {
                        // Prioritera sammansatta vattendrag
                        const mergedResult = exactResults.find(r => r.original_segment_count > 1);
                        bestMatch = mergedResult || exactResults[0];
                    }
                } catch (stError) {
                    console.warn('ST_Contains fallback failed:', stError);
                }
            }
        }

        return bestMatch ? convertToUnifiedWaterBody(bestMatch) : null;
        
    } catch (error) {
        console.error('Unified click failed:', error);
        return null;
    }
}



/**
 * BOUNDS-SÖKNING - För kartvisning
 */
export async function getUnifiedWaterBodiesInBounds(
    bounds: { north: number; south: number; east: number; west: number },
    limit: number = 100
): Promise<UnifiedWaterBody[]> {
    
    // Feature flag check
    if (!USE_UNIFIED_SYSTEM) {
        // Fallback till gamla systemet
        const smhiResults = await getSMHIWaterBodiesInBounds(bounds, limit);
        return smhiResults.map(convertSMHIToUnified);
    }
    
    try {
        const { data, error } = await supabase
            .from('water_bodies_unified_fast_lookup')
            .select('*')
            .gte('center_lat', bounds.south)
            .lte('center_lat', bounds.north)
            .gte('center_lon', bounds.west)
            .lte('center_lon', bounds.east)
            .order('popularity_score', { ascending: false })
            .order('total_area_km2', { ascending: false })
            .limit(limit);
        
        if (error) {
            console.error('Unified bounds error:', error);
            return [];
        }
        
        return data?.map(convertToUnifiedWaterBody) || [];
        
    } catch (error) {
        console.error('Unified bounds failed:', error);
        return [];
    }
}

/**
 * DETALJER MED VISS-DATA - Behåller VISS-kompatibilitet
 */
export async function getUnifiedWaterBodyDetails(
    waterBodyId: string
): Promise<UnifiedWaterBodySearchResult | null> {
    
    // Feature flag check
    if (!USE_UNIFIED_SYSTEM) {
        // Fallback till gamla systemet
        const smhiResult = await getSMHIWaterBodyDetails(waterBodyId);
        if (!smhiResult) return null;
        
        return {
            waterBody: convertSMHIToUnified(smhiResult.waterBody),
            vissData: smhiResult.vissData
        };
    }
    
    try {
        const { data: waterBody, error } = await supabase
            .from('water_bodies_unified')
            .select('*')
            .eq('id', waterBodyId)
            .single();
        
        if (error || !waterBody) {
            console.warn('Unified waterBody not found:', waterBodyId, error);
            return null;
        }
        
        const unifiedWaterBody = convertToUnifiedWaterBody(waterBody);
        
        // VISS-data med geografisk validering (SAMMA som innan)
        let vissData: WaterBodyData | null = null;
        if (unifiedWaterBody.country === 'SE' && unifiedWaterBody.name) {
            try {
                const fetcher = new WaterBodyDataFetcher();
                // KRITISKT: Använd originalnamn för VISS-kompatibilitet
                vissData = await fetcher.fetchWaterBodyDataWithValidation(
                    unifiedWaterBody.name, // Originalnamn, INTE display_name
                    unifiedWaterBody.coordinates ? 
                        { lat: unifiedWaterBody.coordinates[0], lon: unifiedWaterBody.coordinates[1] } : 
                        undefined
                );
            } catch (error) {
                console.warn('❌ VISS data failed for:', unifiedWaterBody.display_name, error);
            }
        }
        
        return {
            waterBody: unifiedWaterBody,
            vissData
        };
        
    } catch (error) {
        console.error('Unified details failed:', error);
        return null;
    }
}

/**
 * Hjälpfunktioner
 */
function convertSMHIToUnified(smhi: SMHIWaterBody): UnifiedWaterBody {
    return {
        id: smhi.id,
        name: smhi.name,
        display_name: smhi.name, // SMHI har inga disambiguerade namn
        water_type: smhi.water_type,
        country: smhi.country,
        coordinates: smhi.coordinates,
        bounds: smhi.bounds,
        area_km2: smhi.area_km2,
        original_segment_count: smhi.segment_count,
        depth_mean: smhi.depth_mean,
        depth_max: smhi.depth_max,
        volume_m3: smhi.volume_m3,
        ecological_status: smhi.ecological_status,
        fishing_regulations: smhi.fishing_regulations,
        water_quality_status: smhi.water_quality_status,
        water_district: smhi.water_district,
        data_source: smhi.data_source,
        source_priority: smhi.source_priority,
        has_chart: smhi.has_chart,
        geometry: smhi.geometry
    };
}

function mapWaterType(smhiType: string): 'lake' | 'river' | 'stream' | 'reservoir' | 'canal' {
    switch (smhiType?.toLowerCase()) {
        case 'lake': return 'lake';
        case 'river': return 'river';
        case 'stream': return 'stream';
        case 'reservoir': return 'reservoir';
        case 'canal': return 'canal';
        default: return 'lake';
    }
}

function getCountryFromCoordinates(lat: number, lon: number): 'SE' | 'NO' | 'DK' | 'FI' {
    // SAMMA logik som nuvarande system
    if (lat >= 65.0 && lon >= 4.5 && lon <= 15.0) return 'NO';
    if (lat >= 60.0 && lon >= 4.5 && lon <= 12.0) return 'NO';
    if (lat >= 57.8 && lon >= 4.5 && lon <= 11.0) return 'NO';
    if (lon >= 11.0 && lon <= 24.5 && lat >= 55.0 && lat <= 69.5) return 'SE';
    if (lon >= 8.0 && lon <= 12.5 && lat >= 54.5 && lat <= 57.0) return 'DK';
    return 'SE';
}

/**
 * UTILITY: Byt system dynamiskt (för testning)
 */
export function getSystemStatus(): { 
    unified: boolean; 
    fallback: boolean; 
    description: string;
} {
    return {
        unified: USE_UNIFIED_SYSTEM,
        fallback: !USE_UNIFIED_SYSTEM,
        description: USE_UNIFIED_SYSTEM 
            ? 'Använder unified system med sammansatta vattendrag'
            : 'Använder klassiskt SMHI system som fallback'
    };
}

/**
 * UTILITY: Skapa bounds runt en punkt (samma som gamla systemet)
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

// Export compatibility types
export type { SMHIWaterBody as UnifiedWaterBodyCompat };
export type { SMHIWaterBodySearchResult as UnifiedWaterBodySearchResultCompat };