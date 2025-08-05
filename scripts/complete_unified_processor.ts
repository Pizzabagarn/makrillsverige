#!/usr/bin/env ts-node

/**
 * KOMPLETT UNIFIED PROCESSOR
 * Kombinerar: ALLA 142,739 vattendrag + Smart disambiguation + Smart sammanslagning
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { join } from 'path';

const projectRoot = process.cwd();
config({ path: join(projectRoot, '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

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
function performGeographicClustering(segments: any[], maxDistanceKm: number = 5): any[] {
    const clusters: any[] = [];
    const processed = new Set<number>();
    
    for (const segment of segments) {
        if (processed.has(segment.id)) continue;
        
        const cluster = {
            segments: [segment],
            centroid: { lat: segment.lat, lon: segment.lon }
        };
        processed.add(segment.id);
        
        for (const otherSegment of segments) {
            if (processed.has(otherSegment.id)) continue;
            
            const distance = calculateDistance(
                segment.lat, segment.lon,
                otherSegment.lat, otherSegment.lon
            );
            
            if (distance <= maxDistanceKm) {
                cluster.segments.push(otherSegment);
                processed.add(otherSegment.id);
            }
        }
        
        // Beräkna centroid för klustret
        const totalLat = cluster.segments.reduce((sum, seg) => sum + seg.lat, 0);
        const totalLon = cluster.segments.reduce((sum, seg) => sum + seg.lon, 0);
        cluster.centroid = {
            lat: totalLat / cluster.segments.length,
            lon: totalLon / cluster.segments.length
        };
        
        clusters.push(cluster);
    }
    
    return clusters;
}

/**
 * Skapa unified waterway från segment
 */
async function createUnifiedWaterway(name: string, segments: any[], displayName?: string, municipality?: string): Promise<any> {
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
 * Spara unified waterway
 */
async function saveUnifiedWaterway(waterway: any): Promise<void> {
    const { error } = await supabase
        .from('water_bodies_unified')
        .insert([waterway]);
    
    if (error) {
        throw new Error(`Fel vid sparande: ${error.message}`);
    }
}

/**
 * KOMPLETT PROCESSOR - Smart logik för ALLA vattendrag
 */
async function processAllWaterwaysWithSmartLogic(): Promise<void> {
    console.log('🚀 KOMPLETT UNIFIED PROCESSOR - SMART LOGIK FÖR ALLA VATTENDRAG');
    console.log('='.repeat(70));
    
    try {
        // Rensa befintlig data
        console.log('🗑️ Rensar befintlig data...');
        const { error: clearError } = await supabase
            .from('water_bodies_unified')
            .delete()
            .neq('id', 0);
        
        if (clearError) {
            throw new Error(`Rensning misslyckades: ${clearError.message}`);
        }
        
        // STEG 1: Gruppera alla vattendrag efter namn
        console.log('📊 Grupperar alla vattendrag efter namn...');
        
        const { data: allWaterways, error: fetchError } = await supabase
            .from('water_bodies_integrated')
            .select('*')
            .not('name', 'is', null)
            .not('geometry', 'is', null)
            .order('name');
        
        if (fetchError) {
            throw new Error(`Hämtning misslyckades: ${fetchError.message}`);
        }
        
        // Gruppera efter namn
        const nameGroups: { [key: string]: any[] } = {};
        allWaterways?.forEach(waterway => {
            if (!nameGroups[waterway.name]) {
                nameGroups[waterway.name] = [];
            }
            nameGroups[waterway.name].push(waterway);
        });
        
        console.log(`   ✅ Hittade ${Object.keys(nameGroups).length} unika namn`);
        console.log(`   📊 Totalt ${allWaterways?.length} vattendrag att processa`);
        
        let totalProcessed = 0;
        let nameIndex = 0;
        
        // STEG 2: Processa varje namngrupp med smart logik
        for (const [name, segments] of Object.entries(nameGroups)) {
            nameIndex++;
            
            try {
                console.log(`\n📋 ${nameIndex}/${Object.keys(nameGroups).length}: ${name} (${segments.length} segment)`);
                
                if (segments.length === 1) {
                    // Enkelt vattendrag - bara skapa unified
                    const unified = await createUnifiedWaterway(name, segments);
                    await saveUnifiedWaterway(unified);
                    totalProcessed++;
                    
                    if (totalProcessed % 100 === 0) {
                        console.log(`   📊 ${totalProcessed} vattendrag processade...`);
                    }
                    
                } else {
                    // Multipla segment - använd smart logik
                    console.log(`   🔬 Analyserar ${segments.length} segment för geografisk klustring...`);
                    
                    const clusters = performGeographicClustering(segments, 5);
                    
                    if (clusters.length === 1) {
                        // SAMMA vattendrag - slå samman alla segment
                        console.log(`   ✅ SAMMA vattendrag - skapar sammansatt (${segments.length} segment)`);
                        const unified = await createUnifiedWaterway(name, segments);
                        await saveUnifiedWaterway(unified);
                        totalProcessed++;
                        
                    } else {
                        // OLIKA vattendrag - disambiguation med geocoding
                        console.log(`   🎯 ${clusters.length} OLIKA vattendrag - använder disambiguation`);
                        
                        for (let i = 0; i < clusters.length; i++) {
                            const cluster = clusters[i];
                            
                            try {
                                // Geocoda för att få platsnamn
                                const location = await geocodingService.getPlaceName(
                                    cluster.centroid.lat,
                                    cluster.centroid.lon
                                );
                                
                                const municipality = extractMunicipality(location.placeName);
                                const disambiguatedName = `${name} (${municipality.replace(' kommun', '')})`;
                                
                                const unified = await createUnifiedWaterway(
                                    name,
                                    cluster.segments,
                                    disambiguatedName,
                                    municipality
                                );
                                unified.disambiguation_source = 'geocoding_api';
                                
                                await saveUnifiedWaterway(unified);
                                totalProcessed++;
                                
                                console.log(`      ✅ ${disambiguatedName} (${cluster.segments.length} segment)`);
                                
                            } catch (error) {
                                console.warn(`   ⚠️ Geocoding fel för kluster ${i + 1}:`, error);
                                
                                // Fallback utan geocoding
                                const fallbackName = `${name} (Område ${i + 1})`;
                                const unified = await createUnifiedWaterway(name, cluster.segments, fallbackName);
                                await saveUnifiedWaterway(unified);
                                totalProcessed++;
                            }
                        }
                    }
                }
                
            } catch (error) {
                console.error(`❌ Fel vid processning av ${name}:`, error);
                // Fortsätt med nästa namn
            }
        }
        
        console.log('\n🎉 PROCESSING SLUTFÖRD!');
        console.log(`📊 Totalt processade: ${totalProcessed.toLocaleString()} unified vattendrag`);
        
        // Verifiera resultat
        const { count: finalCount } = await supabase
            .from('water_bodies_unified')
            .select('*', { count: 'exact', head: true });
            
        console.log(`✅ Verifiering: ${finalCount?.toLocaleString()} unified vattendrag i databas`);
        
        if (finalCount && finalCount >= 140000) {
            console.log('\n🎉 SUCCESS! Alla vattendrag processerade med smart logik!');
            console.log('✅ Smart disambiguation aktiverad');
            console.log('✅ Smart sammanslagning aktiverad');
            console.log('✅ Alla 142k+ vattendrag inkluderade');
        } else {
            console.log(`\n⚠️ Varning: Förväntade ~142k, fick ${finalCount?.toLocaleString()}`);
        }
        
    } catch (error) {
        console.error('❌ PROCESSING MISSLYCKADES:', error);
        throw error;
    }
}

// Kör processing
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename) {
    processAllWaterwaysWithSmartLogic()
        .then(() => {
            console.log('\n✅ Komplett processing slutförd framgångsrikt!');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n❌ Komplett processing misslyckades:', error);
            process.exit(1);
        });
}

export { processAllWaterwaysWithSmartLogic };