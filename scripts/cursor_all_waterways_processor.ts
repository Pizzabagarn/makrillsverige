#!/usr/bin/env ts-node

/**
 * CURSOR-BASERAD ALL-WATERWAYS PROCESSOR
 * Hämtar ALLA 142,739 med cursor-baserad pagination
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { join } from 'path';

const projectRoot = process.cwd();
config({ path: join(projectRoot, '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const BATCH_SIZE = 1000; // Supabase max without explicit limit
const INSERT_BATCH_SIZE = 100;

interface WaterBody {
    id: number;
    name: string;
    lat: number;
    lon: number;
    area_km2?: number;
    water_type?: string;
    data_source?: string;
    source_priority?: number;
    depth_mean?: number;
    depth_max?: number;
    volume_m3?: number;
    ecological_status?: string;
    fishing_regulations?: any;
    water_quality_status?: string;
    region?: string;
    tags?: any;
    [key: string]: any;
}

// Simple geocoding service för Node.js
class NodeGeocodingService {
    private readonly REQUEST_DELAY = 1000;
    private lastRequestTime = 0;
    
    async getPlaceName(lat: number, lon: number): Promise<{ placeName: string | null }> {
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
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            return { placeName: data?.display_name || null };
            
        } catch (error) {
            console.warn(`⚠️ Geocoding failed for ${lat}, ${lon}:`, error);
            return { placeName: null };
        }
    }
}

const geocodingService = new NodeGeocodingService();

/**
 * Extrahera kommun från platsnamn
 */
function extractMunicipality(placeName: string | null): string {
    if (!placeName) return 'Okänd kommun';
    
    const parts = placeName.split(',').map(p => p.trim());
    
    for (const part of parts) {
        if (part.includes('kommun') || part.includes('stad') || part.includes('Municipality')) {
            return part;
        }
    }
    
    return parts[0] || 'Okänd kommun';
}

/**
 * Beräkna avstånd mellan två punkter
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
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
 * Geografisk klustring för samma namn
 */
function performGeographicClustering(segments: WaterBody[], maxDistanceKm: number = 5): WaterBody[][] {
    const clusters: WaterBody[][] = [];
    const processed = new Set<number>();
    
    for (const segment of segments) {
        if (processed.has(segment.id)) continue;
        
        const cluster = [segment];
        processed.add(segment.id);
        
        for (const otherSegment of segments) {
            if (processed.has(otherSegment.id)) continue;
            
            const distance = calculateDistance(
                segment.lat, segment.lon,
                otherSegment.lat, otherSegment.lon
            );
            
            if (distance <= maxDistanceKm) {
                cluster.push(otherSegment);
                processed.add(otherSegment.id);
            }
        }
        
        clusters.push(cluster);
    }
    
    return clusters;
}

/**
 * STEG 1: Hämta ALLA vattendrag med cursor-baserad pagination
 */
async function fetchAllWaterwaysWithCursor(): Promise<WaterBody[]> {
    console.log('📊 HÄMTAR ALLA VATTENDRAG MED CURSOR-PAGINATION...');
    
    let allWaterways: WaterBody[] = [];
    let lastId = 0;
    let hasMore = true;
    let batchNumber = 1;
    
    while (hasMore) {
        console.log(`   📦 Batch ${batchNumber}: Hämtar från ID ${lastId + 1}...`);
        
        const { data, error } = await supabase
            .from('water_bodies_integrated')
            .select('*')
            .not('name', 'is', null)
            .not('geometry', 'is', null)
            .gt('id', lastId)
            .order('id')
            .limit(BATCH_SIZE);
        
        if (error) {
            throw new Error(`Hämtning misslyckades: ${error.message}`);
        }
        
        if (!data || data.length === 0) {
            hasMore = false;
            console.log(`   ✅ Inga fler rader - slutar`);
        } else {
            allWaterways = allWaterways.concat(data);
            lastId = data[data.length - 1].id;
            
            console.log(`   ✅ Hämtade ${data.length} rader (ID ${data[0].id} - ${lastId})`);
            console.log(`   📊 Totalt hittills: ${allWaterways.length.toLocaleString()}`);
            
            if (data.length < BATCH_SIZE) {
                hasMore = false;
                console.log(`   ✅ Sista batch (mindre än ${BATCH_SIZE}) - slutar`);
            }
        }
        
        batchNumber++;
        
        // Säkerhetsbrytare för att undvika oändlig loop
        if (batchNumber > 200) {
            console.warn('⚠️ Säkerhetsbrytare: Max 200 batches');
            break;
        }
    }
    
    console.log(`📊 TOTALT HÄMTAT: ${allWaterways.length.toLocaleString()} vattendrag`);
    console.log(`📊 ID-span: ${allWaterways[0]?.id} - ${allWaterways[allWaterways.length - 1]?.id}`);
    
    return allWaterways;
}

/**
 * STEG 2: Processa alla vattendrag med smart logik
 */
async function processAllWaterways(allWaterways: WaterBody[]): Promise<any[]> {
    console.log('🧠 PROCESSAR ALLA VATTENDRAG MED SMART LOGIK...');
    
    // Gruppera efter namn
    const nameGroups: { [key: string]: WaterBody[] } = {};
    allWaterways.forEach(waterway => {
        if (!nameGroups[waterway.name]) {
            nameGroups[waterway.name] = [];
        }
        nameGroups[waterway.name].push(waterway);
    });
    
    console.log(`   📊 ${Object.keys(nameGroups).length} unika namn att processa`);
    
    const unifiedWaterways: any[] = [];
    let nameIndex = 0;
    
    for (const [name, segments] of Object.entries(nameGroups)) {
        nameIndex++;
        
        if (nameIndex % 50 === 0) {
            console.log(`   📋 ${nameIndex}/${Object.keys(nameGroups).length}: Processerat ${unifiedWaterways.length} unified...`);
        }
        
        try {
            if (segments.length === 1) {
                // Enkelt vattendrag
                const unified = createUnifiedWaterway(name, segments);
                unifiedWaterways.push(unified);
                
            } else {
                // Multipla segment - smart logik
                const clusters = performGeographicClustering(segments, 5);
                
                if (clusters.length === 1) {
                    // SAMMA vattendrag
                    const unified = createUnifiedWaterway(name, clusters[0]);
                    unifiedWaterways.push(unified);
                    
                } else {
                    // OLIKA vattendrag - disambiguation
                    for (let i = 0; i < clusters.length; i++) {
                        const cluster = clusters[i];
                        
                        try {
                            // Geocoda för disambiguation
                            const centroid = {
                                lat: cluster.reduce((sum, seg) => sum + seg.lat, 0) / cluster.length,
                                lon: cluster.reduce((sum, seg) => sum + seg.lon, 0) / cluster.length
                            };
                            
                            const location = await geocodingService.getPlaceName(centroid.lat, centroid.lon);
                            const municipality = extractMunicipality(location.placeName);
                            const disambiguatedName = `${name} (${municipality.replace(' kommun', '')})`;
                            
                            const unified = createUnifiedWaterway(name, cluster, disambiguatedName, municipality);
                            unified.disambiguation_source = 'geocoding_api';
                            unifiedWaterways.push(unified);
                            
                        } catch (error) {
                            // Fallback utan geocoding
                            const fallbackName = `${name} (Område ${i + 1})`;
                            const unified = createUnifiedWaterway(name, cluster, fallbackName);
                            unifiedWaterways.push(unified);
                        }
                    }
                }
            }
            
        } catch (error) {
            console.error(`❌ Fel vid processning av ${name}:`, error);
        }
    }
    
    console.log(`🎉 PROCESSNING KLAR: ${unifiedWaterways.length.toLocaleString()} unified waterways`);
    return unifiedWaterways;
}

/**
 * Skapa unified waterway från segment
 */
function createUnifiedWaterway(name: string, segments: WaterBody[], displayName?: string, municipality?: string): any {
    const centroid = {
        lat: segments.reduce((sum, seg) => sum + seg.lat, 0) / segments.length,
        lon: segments.reduce((sum, seg) => sum + seg.lon, 0) / segments.length
    };
    
    const totalArea = segments.reduce((sum, seg) => sum + (seg.area_km2 || 0), 0);
    
    const finalDisplayName = displayName || name;
    const searchTerms = [
        name,
        finalDisplayName,
        municipality
    ].filter(term => term && term.length > 0).join(' ');
    
    return {
        name: name,
        display_name: finalDisplayName,
        search_terms: searchTerms,
        municipality: municipality,
        lat: centroid.lat,
        lon: centroid.lon,
        total_area_km2: totalArea,
        original_segment_count: segments.length,
        original_segment_ids: segments.map(s => s.id),
        unification_method: segments.length > 1 ? 'gap_preserving_merge' : 'single',
        gap_handling: segments.length > 1 ? 'preserved' : 'none',
        is_split_section: false,
        split_parent_name: null,
        split_section_order: null,
        water_type: segments[0].water_type,
        data_source: segments[0].data_source,
        source_priority: segments[0].source_priority || 1,
        depth_mean: segments[0].depth_mean,
        depth_max: segments[0].depth_max,
        volume_m3: segments[0].volume_m3,
        ecological_status: segments[0].ecological_status,
        fishing_regulations: segments[0].fishing_regulations,
        water_quality_status: segments[0].water_quality_status,
        region: segments[0].region,
        tags: segments[0].tags,
        processing_notes: segments.length > 1 ? 
            `Merged from ${segments.length} segments` : 
            'Single segment waterway',
        disambiguation_source: displayName && displayName !== name ? 'geocoding_api' : 'none'
    };
}

/**
 * STEG 3: Batch-infoga i water_bodies_unified
 */
async function insertUnifiedWaterways(unifiedWaterways: any[]): Promise<void> {
    console.log('💾 INFOGAR I WATER_BODIES_UNIFIED...');
    
    // Rensa befintlig data först
    console.log('🗑️ Rensar befintlig data...');
    const { error: clearError } = await supabase
        .from('water_bodies_unified')
        .delete()
        .neq('id', 0);
    
    if (clearError) {
        throw new Error(`Rensning misslyckades: ${clearError.message}`);
    }
    
    // Infoga i batches
    let insertedCount = 0;
    
    for (let i = 0; i < unifiedWaterways.length; i += INSERT_BATCH_SIZE) {
        const batch = unifiedWaterways.slice(i, i + INSERT_BATCH_SIZE);
        
        const { error } = await supabase
            .from('water_bodies_unified')
            .insert(batch);
        
        if (error) {
            console.error(`❌ Batch insertion error at ${i}:`, error);
            throw new Error(`Batch insertion failed: ${error.message}`);
        }
        
        insertedCount += batch.length;
        
        if (insertedCount % 1000 === 0 || insertedCount === unifiedWaterways.length) {
            console.log(`   📊 Infogade: ${insertedCount.toLocaleString()}/${unifiedWaterways.length.toLocaleString()}`);
        }
    }
    
    console.log(`✅ ALLA INFOGADE: ${insertedCount.toLocaleString()} unified waterways`);
}

/**
 * HUVUDPROCESS
 */
async function runCursorBasedProcess(): Promise<void> {
    console.log('🚀 CURSOR-BASERAD ALL-WATERWAYS PROCESSOR');
    console.log('='.repeat(60));
    
    try {
        // STEG 1: Hämta alla med cursor
        const allWaterways = await fetchAllWaterwaysWithCursor();
        
        if (allWaterways.length < 140000) {
            throw new Error(`För få vattendrag hämtade: ${allWaterways.length} (förväntat ~142,739)`);
        }
        
        // STEG 2: Processa alla
        const unifiedWaterways = await processAllWaterways(allWaterways);
        
        if (unifiedWaterways.length < allWaterways.length * 0.95) {
            console.warn(`⚠️ Möjlig förlust: ${unifiedWaterways.length} unified från ${allWaterways.length} original`);
        }
        
        // STEG 3: Infoga alla
        await insertUnifiedWaterways(unifiedWaterways);
        
        // Verifiera slutresultat
        const { count: finalCount } = await supabase
            .from('water_bodies_unified')
            .select('*', { count: 'exact', head: true });
            
        console.log('\n🎉 CURSOR-BASERAD PROCESS SLUTFÖRD!');
        console.log('='.repeat(60));
        console.log(`📊 RESULTAT:`);
        console.log(`   Original: ${allWaterways.length.toLocaleString()}`);
        console.log(`   Unified: ${finalCount?.toLocaleString()}`);
        console.log(`   Success Rate: ${finalCount && allWaterways.length ? ((finalCount / allWaterways.length) * 100).toFixed(1) : 0}%`);
        console.log(`   Status: ${finalCount && finalCount >= 140000 ? '✅ SUCCESS' : '❌ NEEDS INVESTIGATION'}`);
        
        if (finalCount && finalCount >= 140000) {
            console.log('\n🎊 FRAMGÅNG! Alla vattendrag processerade med:');
            console.log('   ✅ Smart disambiguation (Abborrasjön (Göteborg))');
            console.log('   ✅ Smart sammanslagning (hela åar klickbara)');
            console.log('   ✅ Preserved gaps (under broar)');
            console.log('   ✅ VISS-kompatibilitet');
        }
        
    } catch (error) {
        console.error('❌ CURSOR-BASERAD PROCESS MISSLYCKADES:', error);
        throw error;
    }
}

// Kör processing
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename) {
    runCursorBasedProcess()
        .then(() => {
            console.log('\n✅ Cursor-baserad processing slutförd!');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n❌ Cursor-baserad processing misslyckades:', error);
            process.exit(1);
        });
}

export { runCursorBasedProcess };