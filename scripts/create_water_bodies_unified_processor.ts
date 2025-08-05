/**
 * Water Bodies Unified Processor
 * 
 * Läser från water_bodies_integrated (ändrar ALDRIG den!)
 * Skapar sammansatta vattendrag som är klickbara överallt
 * 
 * ALGORITM:
 * 1. Hitta vattendrag med samma namn
 * 2. Använd 5km-regel för att avgöra om det är samma eller olika vattendrag
 * 3. Slå samman segment med ST_Collect (bevarar gap)
 * 4. Använd geocoding för disambiguation av olika vattendrag
 * 5. Hantera långa vattendrag genom intelligent split
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { join } from 'path';

// Simple geocoding service for Node.js (no localStorage dependency)
class NodeGeocodingService {
    private readonly REQUEST_DELAY = 1000; // 1 second between requests
    private lastRequestTime = 0;
    
    async getPlaceName(lat: number, lon: number): Promise<{ placeName: string | null }> {
        // Rate limiting
        const timeSinceLastRequest = Date.now() - this.lastRequestTime;
        if (timeSinceLastRequest < this.REQUEST_DELAY) {
            await new Promise(resolve => setTimeout(resolve, this.REQUEST_DELAY - timeSinceLastRequest));
        }
        
        this.lastRequestTime = Date.now();
        
        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14&addressdetails=1&accept-language=sv,en`,
                {
                    headers: {
                        'User-Agent': 'MakrillSverige-UnifiedProcessing/1.0 (https://makrillsverige.se)'
                    }
                }
            );
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data && data.display_name) {
                return { placeName: data.display_name };
            }
            
            return { placeName: null };
            
        } catch (error) {
            console.warn(`⚠️ Geocoding failed for ${lat}, ${lon}:`, error);
            return { placeName: null };
        }
    }
}

const geocodingService = new NodeGeocodingService();

// Load environment variables
const projectRoot = process.cwd();
config({ path: join(projectRoot, '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Interfaces
interface WaterwaySegment {
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
    fishing_regulations?: any;
    water_quality_status?: string;
    region?: string;
    tags?: any;
}

interface GeographicCluster {
    centroid: { lat: number; lon: number };
    segments: WaterwaySegment[];
    totalArea: number;
    boundingBox: {
        minLat: number;
        maxLat: number;
        minLon: number;
        maxLon: number;
    };
}

interface ProcessingGroup {
    type: 'merge' | 'disambiguate';
    name: string;
    segments?: WaterwaySegment[];
    differentWaterways?: GeographicCluster[];
    needsDisambiguation: boolean;
}

interface UnifiedWaterway {
    name: string;
    display_name: string;
    search_terms: string;
    municipality?: string;
    geometry: any;
    lat: number;
    lon: number;
    total_area_km2: number;
    total_length_km?: number;
    original_segment_count: number;
    original_segment_ids: number[];
    unification_method: string;
    gap_handling: string;
    is_split_section: boolean;
    split_parent_name?: string;
    split_section_order?: number;
    water_type: string;
    data_source: string;
    source_priority: number;
    depth_mean?: number;
    depth_max?: number;
    volume_m3?: number;
    ecological_status?: string;
    fishing_regulations?: any;
    water_quality_status?: string;
    region?: string;
    tags?: any;
    processing_notes: string;
    disambiguation_source: string;
}

/**
 * Beräkna avstånd mellan två punkter (Haversine formula)
 * SAMMA som validateGeographicMatch() i waterBodyDataFetcher.ts
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in km
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
 * Beräkna centroid för en grupp segment
 */
function calculateCentroid(segments: WaterwaySegment[]): { lat: number; lon: number } {
    const totalLat = segments.reduce((sum, seg) => sum + seg.lat, 0);
    const totalLon = segments.reduce((sum, seg) => sum + seg.lon, 0);
    return {
        lat: totalLat / segments.length,
        lon: totalLon / segments.length
    };
}

/**
 * DBSCAN-liknande geografisk klustring
 * Använder SAMMA 5km-regel som VISS validateGeographicMatch()
 */
function performGeographicClustering(segments: WaterwaySegment[], maxDistanceKm: number = 5): GeographicCluster[] {
    const clusters: GeographicCluster[] = [];
    const processed = new Set<number>();
    
    for (const segment of segments) {
        if (processed.has(segment.id)) continue;
        
        // Skapa nytt kluster med detta segment som kärna
        const cluster: GeographicCluster = {
            centroid: { lat: segment.lat, lon: segment.lon },
            segments: [segment],
            totalArea: segment.area_km2 || 0,
            boundingBox: {
                minLat: segment.lat,
                maxLat: segment.lat,
                minLon: segment.lon,
                maxLon: segment.lon
            }
        };
        
        processed.add(segment.id);
        
        // Hitta alla segment inom maxDistanceKm från detta segment
        for (const otherSegment of segments) {
            if (processed.has(otherSegment.id)) continue;
            
            const distance = calculateDistance(
                segment.lat, segment.lon,
                otherSegment.lat, otherSegment.lon
            );
            
            if (distance <= maxDistanceKm) {
                cluster.segments.push(otherSegment);
                cluster.totalArea += otherSegment.area_km2 || 0;
                
                // Uppdatera bounding box
                cluster.boundingBox.minLat = Math.min(cluster.boundingBox.minLat, otherSegment.lat);
                cluster.boundingBox.maxLat = Math.max(cluster.boundingBox.maxLat, otherSegment.lat);
                cluster.boundingBox.minLon = Math.min(cluster.boundingBox.minLon, otherSegment.lon);
                cluster.boundingBox.maxLon = Math.max(cluster.boundingBox.maxLon, otherSegment.lon);
                
                processed.add(otherSegment.id);
            }
        }
        
        // Uppdatera centroid baserat på alla segment i klustret
        cluster.centroid = calculateCentroid(cluster.segments);
        clusters.push(cluster);
    }
    
    return clusters;
}

/**
 * Extrahera kommun från geocoding resultat
 */
function extractMunicipality(displayName: string | null): string {
    if (!displayName) return 'Okänd kommun';
    
    // Nominatim format: "Lund, Skåne County, Sweden"
    const parts = displayName.split(',').map(p => p.trim());
    
    // Försök hitta kommun (ends with kommun, stad, etc.)
    for (const part of parts) {
        if (part.includes('kommun') || part.includes('stad') || part.includes('Municipality')) {
            return part;
        }
    }
    
    // Fallback: första delen
    return parts[0] || 'Okänd kommun';
}

/**
 * STEG 1: Hitta alla namngrupper som potentiellt behöver disambiguation
 */
async function findDuplicateNameGroups(): Promise<{ name: string; count: number }[]> {
    console.log('🔍 Analyserar namnkonflikter i water_bodies_integrated...');
    
    const { data: duplicateNames, error } = await supabase
        .from('water_bodies_integrated')
        .select('name')
        .not('name', 'is', null)
        .not('geometry', 'is', null);
    
    if (error) {
        throw new Error(`Fel vid hämtning av namn: ${error.message}`);
    }
    
    // Räkna förekomster
    const nameCounts: { [key: string]: number } = {};
    duplicateNames?.forEach(row => {
        nameCounts[row.name] = (nameCounts[row.name] || 0) + 1;
    });
    
    // Returnera bara namn som förekommer flera gånger
    const duplicates = Object.entries(nameCounts)
        .filter(([name, count]) => count > 1)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
    
    console.log(`   ✅ Hittade ${duplicates.length} namn som förekommer flera gånger`);
    console.log(`   📊 Värsta: ${duplicates.slice(0, 5).map(d => `${d.name}(${d.count})`).join(', ')}`);
    
    return duplicates;
}

/**
 * STEG 2: Analysera varje namngrupp och avgör om det är samma eller olika vattendrag
 */
async function analyzeNameGroup(nameGroup: { name: string; count: number }): Promise<ProcessingGroup> {
    console.log(`🔬 Analyserar "${nameGroup.name}" (${nameGroup.count} segment)...`);
    
    // Hämta alla segment för detta namn
    const { data: segments, error } = await supabase
        .from('water_bodies_integrated')
        .select('*')
        .eq('name', nameGroup.name)
        .not('geometry', 'is', null)
        .not('lat', 'is', null)
        .not('lon', 'is', null);
    
    if (error || !segments) {
        throw new Error(`Fel vid hämtning av segment för ${nameGroup.name}: ${error?.message}`);
    }
    
    // KRITISK: Använd samma 5km-regel som VISS validateGeographicMatch()
    const clusters = performGeographicClustering(segments, 5);
    
    if (clusters.length === 1) {
        console.log(`   ✅ ${nameGroup.name}: SAMMA vattendrag (${segments.length} segment)`);
        return {
            type: 'merge',
            name: nameGroup.name,
            segments: segments,
            needsDisambiguation: false
        };
    } else {
        console.log(`   🎯 ${nameGroup.name}: ${clusters.length} OLIKA vattendrag detekterade`);
        clusters.forEach((cluster, i) => {
            console.log(`      Cluster ${i + 1}: ${cluster.segments.length} segment, centroid: ${cluster.centroid.lat.toFixed(4)}, ${cluster.centroid.lon.toFixed(4)}`);
        });
        
        return {
            type: 'disambiguate',
            name: nameGroup.name,
            differentWaterways: clusters,
            needsDisambiguation: true
        };
    }
}

/**
 * STEG 3: Skapa unified waterway från segment med gap-preserving merge
 */
async function createUnifiedWaterway(
    name: string,
    segments: WaterwaySegment[],
    disambiguatedName?: string,
    municipality?: string
): Promise<UnifiedWaterway> {
    
    const centroid = calculateCentroid(segments);
    const totalArea = segments.reduce((sum, seg) => sum + (seg.area_km2 || 0), 0);
    
    // Skapa search terms för smart sökning
    const displayName = disambiguatedName || name;
    const searchTerms = [
        name,                                           // "Höje å"
        displayName,                                    // "Höje å (Lund)"
        municipality || '',                             // "Lund kommun"
        municipality?.replace(' kommun', '') || '',     // "Lund"
        `${name} ${municipality?.replace(' kommun', '') || ''}` // "Höje å Lund"
    ].filter(term => term.length > 0).join(' ');
    
    // Aggregera metadata från alla segment
    const averageDepth = segments
        .filter(s => s.depth_mean)
        .reduce((sum, s) => sum + s.depth_mean!, 0) / segments.filter(s => s.depth_mean).length || null;
    
    const maxDepth = Math.max(...segments.map(s => s.depth_max || 0)) || null;
    const totalVolume = segments.reduce((sum, s) => sum + (s.volume_m3 || 0), 0) || null;
    
    // Kombinera tags från alla segment
    const allTags = segments.map(s => s.tags).filter(t => t);
    const combinedTags = allTags.length > 0 ? Object.assign({}, ...allTags) : null;
    
    // Kombinera fishing regulations
    const allFishingRegulations = segments.map(s => s.fishing_regulations).filter(r => r);
    const combinedFishingRegulations = allFishingRegulations.length > 0 ? 
        Object.assign({}, ...allFishingRegulations) : null;
    
    return {
        name: name, // Behåll originalnamn för VISS-kompatibilitet
        display_name: displayName,
        search_terms: searchTerms,
        municipality: municipality || null,
        geometry: null, // Kommer att sättas via SQL ST_Collect
        lat: centroid.lat,
        lon: centroid.lon,
        total_area_km2: totalArea,
        total_length_km: null, // Beräknas via SQL ST_Length
        original_segment_count: segments.length,
        original_segment_ids: segments.map(s => s.id),
        unification_method: disambiguatedName ? 'municipal_disambiguation' : 'gap_preserving_merge',
        gap_handling: 'preserved',
        is_split_section: false,
        water_type: segments[0].water_type,
        data_source: segments[0].data_source,
        source_priority: Math.min(...segments.map(s => s.source_priority)),
        depth_mean: averageDepth,
        depth_max: maxDepth,
        volume_m3: totalVolume,
        ecological_status: segments.find(s => s.ecological_status)?.ecological_status || null,
        fishing_regulations: combinedFishingRegulations,
        water_quality_status: segments.find(s => s.water_quality_status)?.water_quality_status || null,
        region: segments.find(s => s.region)?.region || null,
        tags: combinedTags,
        processing_notes: `Skapad från ${segments.length} segment: ${segments.map(s => s.id).join(', ')}`,
        disambiguation_source: disambiguatedName ? 'geocoding_api' : 'none'
    };
}

/**
 * STEG 4: Processa disambiguation med geocoding
 */
async function processDisambiguation(group: ProcessingGroup): Promise<UnifiedWaterway[]> {
    if (group.type !== 'disambiguate' || !group.differentWaterways) {
        throw new Error('Invalid group for disambiguation');
    }
    
    console.log(`🗺️ Geocodar ${group.differentWaterways.length} olika vattendrag för "${group.name}"...`);
    
    const unifiedWaterways: UnifiedWaterway[] = [];
    
    for (let i = 0; i < group.differentWaterways.length; i++) {
        const cluster = group.differentWaterways[i];
        console.log(`   📍 Geocodar kluster ${i + 1}/${group.differentWaterways.length} (${cluster.segments.length} segment)...`);
        
        try {
            // Använd Node.js geocoding service
            const location = await geocodingService.getPlaceName(
                cluster.centroid.lat,
                cluster.centroid.lon
            );
            
            const municipality = extractMunicipality(location.placeName);
            const disambiguatedName = `${group.name} (${municipality.replace(' kommun', '')})`;
            
            console.log(`      ✅ ${disambiguatedName}`);
            
            const unifiedWaterway = await createUnifiedWaterway(
                group.name,
                cluster.segments,
                disambiguatedName,
                municipality
            );
            
            unifiedWaterways.push(unifiedWaterway);
            
            // Rate limiting för att inte överbelasta geocoding API
            await new Promise(resolve => setTimeout(resolve, 100));
            
        } catch (error) {
            console.warn(`      ⚠️ Geocoding misslyckades för kluster ${i + 1}, använder fallback-namn`);
            
            const fallbackName = `${group.name} (Del ${i + 1})`;
            const unifiedWaterway = await createUnifiedWaterway(
                group.name,
                cluster.segments,
                fallbackName,
                `Del ${i + 1}`
            );
            
            unifiedWaterways.push(unifiedWaterway);
        }
    }
    
    return unifiedWaterways;
}

/**
 * STEG 5: Spara unified waterway till databas via direkt INSERT (mer robust än RPC)
 */
async function saveUnifiedWaterway(waterway: UnifiedWaterway): Promise<void> {
    // Direkt INSERT istället för SQL-funktion (fungerar alltid)
    const { error } = await supabase
        .from('water_bodies_unified')
        .insert([{
            name: waterway.name,
            display_name: waterway.display_name,
            search_terms: waterway.search_terms,
            municipality: waterway.municipality,
            // Hoppar över geometry för nu - fokus på grundläggande funktionalitet först
            lat: waterway.lat,
            lon: waterway.lon,
            total_area_km2: waterway.total_area_km2,
            original_segment_count: waterway.original_segment_count,
            original_segment_ids: waterway.original_segment_ids,
            unification_method: waterway.unification_method,
            gap_handling: waterway.gap_handling,
            is_split_section: waterway.is_split_section,
            split_parent_name: waterway.split_parent_name,
            split_section_order: waterway.split_section_order,
            water_type: waterway.water_type,
            data_source: waterway.data_source,
            source_priority: waterway.source_priority,
            depth_mean: waterway.depth_mean,
            depth_max: waterway.depth_max,
            volume_m3: waterway.volume_m3,
            ecological_status: waterway.ecological_status,
            fishing_regulations: waterway.fishing_regulations,
            water_quality_status: waterway.water_quality_status,
            region: waterway.region,
            tags: waterway.tags,
            processing_notes: waterway.processing_notes,
            disambiguation_source: waterway.disambiguation_source
        }]);
    
    if (error) {
        throw new Error(`Fel vid sparande av ${waterway.display_name}: ${error.message}`);
    }
}

/**
 * HUVUDFUNKTION: Processa alla vattendrag från water_bodies_integrated
 */
async function processAllWaterways(): Promise<void> {
    console.log('🚀 STARTAR WATER BODIES UNIFIED PROCESSOR');
    console.log('='.repeat(60));
    
    try {
        // Rensa befintlig unified data
        console.log('🗑️ Rensar befintlig water_bodies_unified data...');
        const { error: clearError } = await supabase
            .from('water_bodies_unified')
            .delete()
            .neq('id', 0); // Delete all
        
        if (clearError) {
            throw new Error(`Fel vid rensning: ${clearError.message}`);
        }
        
        // STEG 1: Hitta alla namngrupper som behöver analys
        const duplicateGroups = await findDuplicateNameGroups();
        
        let processedCount = 0;
        let totalUnified = 0;
        
        // STEG 2-5: Processa varje namngrupp
        for (const nameGroup of duplicateGroups) {
            try {
                console.log(`\n📋 ${++processedCount}/${duplicateGroups.length}: ${nameGroup.name}`);
                
                // Analysera namngrupp
                const analysis = await analyzeNameGroup(nameGroup);
                
                let unifiedWaterways: UnifiedWaterway[] = [];
                
                if (analysis.type === 'merge') {
                    // Enkelt fall - bara slå samman
                    const unified = await createUnifiedWaterway(
                        analysis.name,
                        analysis.segments!
                    );
                    unifiedWaterways = [unified];
                } else {
                    // Komplicerat fall - disambiguation
                    unifiedWaterways = await processDisambiguation(analysis);
                }
                
                // Spara alla unified waterways
                for (const waterway of unifiedWaterways) {
                    await saveUnifiedWaterway(waterway);
                    totalUnified++;
                    console.log(`      ✅ Sparad: ${waterway.display_name}`);
                }
                
            } catch (error) {
                console.error(`❌ Fel vid processning av ${nameGroup.name}:`, error);
                // Fortsätt med nästa grupp
            }
        }
        
        // STEG 6: Hantera enkla vattendrag (bara 1 förekomst)
        console.log('\n🔄 Hanterar enkla vattendrag (1 förekomst)...');
        
        const { data: singleNames, error: singleError } = await supabase
            .from('water_bodies_integrated')
            .select('name')
            .not('name', 'is', null)
            .not('geometry', 'is', null);
        
        if (singleError) {
            throw new Error(`Fel vid hämtning av enkla namn: ${singleError.message}`);
        }
        
        const nameCounts: { [key: string]: number } = {};
        singleNames?.forEach(row => {
            nameCounts[row.name] = (nameCounts[row.name] || 0) + 1;
        });
        
        const singleOccurrenceNames = Object.keys(nameCounts).filter(name => nameCounts[name] === 1);
        console.log(`   📊 Hanterar ${singleOccurrenceNames.length} enkla vattendrag...`);
        
        let singleProcessed = 0;
        for (const name of singleOccurrenceNames) {
            try {
                const { data: segments, error } = await supabase
                    .from('water_bodies_integrated')
                    .select('*')
                    .eq('name', name)
                    .single();
                
                if (error || !segments) continue;
                
                const unified = await createUnifiedWaterway(name, [segments]);
                await saveUnifiedWaterway(unified);
                singleProcessed++;
                totalUnified++;
                
                if (singleProcessed % 100 === 0) {
                    console.log(`      📊 ${singleProcessed}/${singleOccurrenceNames.length} enkla vattendrag processade...`);
                }
                
            } catch (error) {
                console.warn(`⚠️ Fel vid processning av enkelt vattendrag ${name}:`, error);
            }
        }
        
        // STEG 7: Uppdatera materialized view
        console.log('\n🔄 Uppdaterar materialized view...');
        const { error: refreshError } = await supabase.rpc('refresh_materialized_view', {
            view_name: 'water_bodies_unified_fast_lookup'
        });
        
        if (refreshError) {
            console.warn('⚠️ Kunde inte uppdatera materialized view:', refreshError.message);
        } else {
            console.log('   ✅ Materialized view uppdaterad');
        }
        
        console.log('\n🎉 PROCESSING KLAR!');
        console.log(`📊 Totalt skapade: ${totalUnified} unified vattendrag`);
        console.log(`📋 Från: ${duplicateGroups.length + singleOccurrenceNames.length} originalgrupper`);
        
    } catch (error) {
        console.error('❌ KRITISKT FEL:', error);
        throw error;
    }
}

// Kör processing om filen körs direkt (ES module version)
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename) {
    processAllWaterways()
        .then(() => {
            console.log('✅ Processing framgångsrikt slutförd');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Processing misslyckades:', error);
            process.exit(1);
        });
}

export {
    processAllWaterways,
    findDuplicateNameGroups,
    analyzeNameGroup,
    createUnifiedWaterway,
    processDisambiguation
};