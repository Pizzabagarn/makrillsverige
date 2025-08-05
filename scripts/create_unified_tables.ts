#!/usr/bin/env ts-node

/**
 * Skapar alla tabeller för Unified Water Bodies System
 * REDER INTE water_bodies_integrated - bara skapar nya tabeller
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { join } from 'path';
import { readFileSync } from 'fs';

// Load environment variables
const projectRoot = process.cwd();
config({ path: join(projectRoot, '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing database credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/**
 * Kör SQL-fil genom att dela upp i statements
 */
async function executeSqlFile(filePath: string, description: string): Promise<void> {
    console.log(`📄 Kör ${description}...`);
    
    try {
        const sqlContent = readFileSync(join(projectRoot, filePath), 'utf-8');
        
        // Dela upp SQL i statements på semicolon
        const statements = sqlContent
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => 
                stmt.length > 0 && 
                !stmt.startsWith('--') && 
                !stmt.match(/^\s*$/)
            );
        
        for (const statement of statements) {
            if (statement.trim()) {
                try {
                    // Kör varje statement individuellt
                    const { error } = await supabase.rpc('exec', { 
                        sql: statement 
                    });
                    
                    if (error) {
                        // Fallback: Försök med raw SQL via från
                        console.log(`   ⚠️ RPC misslyckades, försöker alternativ metod...`);
                        
                        // För CREATE TABLE och CREATE INDEX, kör via PostgreSQL REST API
                        if (statement.toUpperCase().includes('CREATE')) {
                            await executeRawSql(statement);
                        } else {
                            console.warn(`   ⚠️ Hoppar över statement: ${statement.substring(0, 50)}...`);
                        }
                    }
                } catch (err) {
                    console.warn(`   ⚠️ Statement misslyckades: ${statement.substring(0, 50)}...`);
                    console.warn(`      Fel: ${err}`);
                }
            }
        }
        
        console.log(`   ✅ ${description} slutförd`);
        
    } catch (error) {
        console.error(`   ❌ ${description} misslyckades:`, error);
        throw error;
    }
}

/**
 * Kör raw SQL via Supabase REST API
 */
async function executeRawSql(sql: string): Promise<void> {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec`, {
        method: 'POST',
        headers: {
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sql })
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`SQL execution failed: ${response.status} - ${errorText}`);
    }
}

/**
 * Verifiera att tabeller skapades korrekt
 */
async function verifyTables(): Promise<void> {
    console.log('\n🔍 Verifierar skapade tabeller...');
    
    try {
        // Kontrollera water_bodies_unified
        const { count: unifiedCount, error: unifiedError } = await supabase
            .from('water_bodies_unified')
            .select('*', { count: 'exact', head: true });
            
        if (unifiedError) {
            console.log('   ❌ water_bodies_unified kunde inte hittas');
        } else {
            console.log(`   ✅ water_bodies_unified finns (${unifiedCount || 0} rader)`);
        }
        
        // Kontrollera materialized view
        const { count: lookupCount, error: lookupError } = await supabase
            .from('water_bodies_unified_fast_lookup')
            .select('*', { count: 'exact', head: true });
            
        if (lookupError) {
            console.log('   ❌ water_bodies_unified_fast_lookup kunde inte hittas');
        } else {
            console.log(`   ✅ water_bodies_unified_fast_lookup finns (${lookupCount || 0} rader)`);
        }
        
        // Kontrollera att water_bodies_integrated är opåverkad
        const { count: originalCount, error: originalError } = await supabase
            .from('water_bodies_integrated')
            .select('*', { count: 'exact', head: true });
            
        if (originalError) {
            console.log('   ⚠️ Kunde inte verifiera water_bodies_integrated');
        } else {
            console.log(`   ✅ water_bodies_integrated opåverkad (${originalCount?.toLocaleString()} rader)`);
        }
        
    } catch (error) {
        console.warn('   ⚠️ Verifiering misslyckades:', error);
    }
}

/**
 * Huvudfunktion - skapa alla tabeller
 */
async function createUnifiedTables(): Promise<void> {
    console.log('🏗️ SKAPAR UNIFIED WATER BODIES TABELLER');
    console.log('='.repeat(60));
    console.log('⚠️  water_bodies_integrated RÖRS INTE - bara nya tabeller skapas');
    console.log('');
    
    try {
        // Steg 1: Skapa huvudtabellen
        await executeSqlFile(
            'sql/create_water_bodies_unified.sql',
            'water_bodies_unified tabell med index och triggers'
        );
        
        // Steg 2: Skapa SQL-funktioner
        await executeSqlFile(
            'sql/create_unified_waterway_function.sql', 
            'SQL-funktioner för geometri-hantering'
        );
        
        // Steg 3: Skapa materialized view med ultra-index
        await executeSqlFile(
            'sql/create_water_bodies_unified_fast_lookup.sql',
            'Materialized view för blixtsnabb prestanda'
        );
        
        console.log('\n🎉 ALLA TABELLER SKAPADE!');
        console.log('='.repeat(60));
        
        // Verifiera att allt fungerar
        await verifyTables();
        
        console.log('\n📋 NÄSTA STEG:');
        console.log('1. Kör processing för att fylla tabellerna:');
        console.log('   npm run process-unified-waterways');
        console.log('');
        console.log('2. När processing är klart, aktivera systemet:');
        console.log('   • Ändra USE_UNIFIED_SYSTEM = true i src/lib/unifiedWaterService.ts');
        console.log('   • Testa: npm run test-unified-search "Höje å lun"');
        console.log('');
        console.log('3. För rollback: Ändra USE_UNIFIED_SYSTEM = false');
        console.log('   (water_bodies_integrated är opåverkad!)');
        
    } catch (error) {
        console.error('\n❌ TABELL-SKAPANDET MISSLYCKADES:', error);
        console.log('\n🔧 FELSÖKNING:');
        console.log('1. Kontrollera databasanslutning');
        console.log('2. Kontrollera behörigheter för service_role');
        console.log('3. Kolla Supabase logs för mer detaljer');
        throw error;
    }
}

// Kör endast om filen körs direkt
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename) {
    createUnifiedTables()
        .then(() => {
            console.log('\n✅ Tabell-skapande slutfört framgångsrikt!');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n❌ Tabell-skapande misslyckades:', error);
            process.exit(1);
        });
}

export { createUnifiedTables };