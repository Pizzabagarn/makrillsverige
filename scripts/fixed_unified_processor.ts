#!/usr/bin/env ts-node

/**
 * FIXAD Unified Processor - Processar ALLA 142,739 vattendrag individuellt
 * Inte bara namngrupper!
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { join } from 'path';

const projectRoot = process.cwd();
config({ path: join(projectRoot, '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/**
 * Skapa unified waterway från ett segment (enklaste fallet)
 */
async function createUnifiedFromSingle(segment: any): Promise<any> {
    return {
        name: segment.name || `Unnamed ${segment.water_type || 'water'}`,
        display_name: segment.name || `Unnamed ${segment.water_type || 'water'}`,
        search_terms: segment.name || `unnamed ${segment.water_type}`,
        municipality: null, // Ingen geocoding för enkla fall
        lat: segment.lat,
        lon: segment.lon,
        total_area_km2: segment.area_km2,
        original_segment_count: 1,
        original_segment_ids: [segment.id],
        unification_method: 'single',
        gap_handling: 'none',
        is_split_section: false,
        split_parent_name: null,
        split_section_order: null,
        water_type: segment.water_type,
        data_source: segment.data_source,
        source_priority: segment.source_priority || 1,
        depth_mean: segment.depth_mean,
        depth_max: segment.depth_max,
        volume_m3: segment.volume_m3,
        ecological_status: segment.ecological_status,
        fishing_regulations: segment.fishing_regulations,
        water_quality_status: segment.water_quality_status,
        region: segment.region,
        tags: segment.tags,
        processing_notes: 'Single segment waterway',
        disambiguation_source: 'none'
    };
}

/**
 * Spara unified waterway direkt till databas
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
 * KORREKT PROCESSOR - Alla 142,739 vattendrag individuellt
 */
async function processAllWaterwaysCorrectly(): Promise<void> {
    console.log('🚀 FIXAD UNIFIED PROCESSOR - ALLA VATTENDRAG');
    console.log('='.repeat(60));
    
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
        
        // Hämta ALLA vattendrag (inte bara namngrupper!)
        console.log('📊 Hämtar ALLA vattendrag från water_bodies_integrated...');
        
        let totalProcessed = 0;
        let batchSize = 1000;
        let offset = 0;
        
        while (true) {
            console.log(`   📊 Processar batch ${Math.floor(offset/batchSize) + 1} (från ${offset})...`);
            
            const { data: batch, error } = await supabase
                .from('water_bodies_integrated')
                .select('*')
                .range(offset, offset + batchSize - 1)
                .order('id');
            
            if (error) {
                throw new Error(`Batch-hämtning misslyckades: ${error.message}`);
            }
            
            if (!batch || batch.length === 0) {
                console.log('   ✅ Alla batches processade');
                break;
            }
            
            // Processa varje vattendrag individuellt
            for (const segment of batch) {
                try {
                    const unified = await createUnifiedFromSingle(segment);
                    await saveUnifiedWaterway(unified);
                    totalProcessed++;
                    
                    if (totalProcessed % 1000 === 0) {
                        console.log(`      📊 ${totalProcessed.toLocaleString()} vattendrag processade...`);
                    }
                    
                } catch (error) {
                    console.warn(`⚠️ Fel vid processning av segment ${segment.id}:`, error);
                }
            }
            
            offset += batchSize;
            
            // Säkerhets-break för att undvika oändliga loopar
            if (offset > 150000) {
                console.log('⚠️ Säkerhets-break vid 150k för att undvika problem');
                break;
            }
        }
        
        console.log('\n🎉 PROCESSING SLUTFÖRD!');
        console.log(`📊 Totalt processade: ${totalProcessed.toLocaleString()} vattendrag`);
        
        // Verifiera resultat
        const { count: finalCount } = await supabase
            .from('water_bodies_unified')
            .select('*', { count: 'exact', head: true });
            
        console.log(`✅ Verifiering: ${finalCount?.toLocaleString()} unified vattendrag i databas`);
        
        if (finalCount && finalCount >= 140000) {
            console.log('🎉 SUCCESS! Alla vattendrag processerade korrekt!');
        } else {
            console.log(`⚠️ Varning: Förväntade ~142k, fick ${finalCount?.toLocaleString()}`);
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
    processAllWaterwaysCorrectly()
        .then(() => {
            console.log('✅ Fixad processing slutförd framgångsrikt!');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Fixad processing misslyckades:', error);
            process.exit(1);
        });
}

export { processAllWaterwaysCorrectly };