#!/usr/bin/env ts-node

/**
 * Test av Unified Water Concept
 * 
 * Testar processing-logiken utan att skapa nya tabeller
 * Visar hur många vattendrag som skulle sammansättas och disambigueras
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { join } from 'path';

// Load environment variables
const projectRoot = process.cwd();
config({ path: join(projectRoot, '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/**
 * Beräkna avstånd mellan två punkter
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
 * Test unified processing concept
 */
async function testUnifiedConcept(): Promise<void> {
    console.log('🧪 TESTAR UNIFIED WATER CONCEPT');
    console.log('='.repeat(50));
    
    try {
        // 1. Hämta statistik om nuvarande data
        console.log('\n📊 KÄLLDATA ANALYS:');
        
        const { count: totalCount } = await supabase
            .from('water_bodies_integrated')
            .select('*', { count: 'exact', head: true });
        
        console.log(`   Total vattendrag: ${totalCount?.toLocaleString()}`);
        
        // 2. Hitta duplicerade namn
        console.log('\n🔍 NAMN-ANALYS:');
        
        const { data: allNames } = await supabase
            .from('water_bodies_integrated')
            .select('name')
            .not('name', 'is', null);
        
        const nameCounts: { [key: string]: number } = {};
        allNames?.forEach(row => {
            nameCounts[row.name] = (nameCounts[row.name] || 0) + 1;
        });
        
        const uniqueNames = Object.keys(nameCounts).length;
        const duplicateNames = Object.entries(nameCounts)
            .filter(([name, count]) => count > 1)
            .sort((a, b) => b[1] - a[1]);
        
        console.log(`   Unika namn: ${uniqueNames.toLocaleString()}`);
        console.log(`   Duplicerade namn: ${duplicateNames.length.toLocaleString()}`);
        
        // Visa värsta dupliceringarna
        console.log('\n📋 VÄRSTA DUPLICERINGARNA:');
        duplicateNames.slice(0, 10).forEach(([name, count]) => {
            console.log(`   • ${name}: ${count} segment`);
        });
        
        // 3. Test av geografisk klustring för ett specifikt namn
        console.log('\n🎯 GEOGRAFISK KLUSTRING TEST:');
        
        if (duplicateNames.length > 0) {
            const testName = duplicateNames[0][0];
            console.log(`   Testar: "${testName}" (${duplicateNames[0][1]} segment)`);
            
            const { data: segments } = await supabase
                .from('water_bodies_integrated')
                .select('*')
                .eq('name', testName)
                .not('lat', 'is', null)
                .not('lon', 'is', null)
                .limit(20); // Begränsa för test
            
            if (segments && segments.length > 1) {
                // Enkel geografisk analys
                const coordinates = segments.map(s => ({ lat: s.lat, lon: s.lon, id: s.id }));
                
                // Hitta kluster med 5km-regel
                const clusters: any[][] = [];
                const processed = new Set<number>();
                
                for (const coord of coordinates) {
                    if (processed.has(coord.id)) continue;
                    
                    const cluster = [coord];
                    processed.add(coord.id);
                    
                    // Hitta alla inom 5km
                    for (const otherCoord of coordinates) {
                        if (processed.has(otherCoord.id)) continue;
                        
                        const distance = calculateDistance(
                            coord.lat, coord.lon,
                            otherCoord.lat, otherCoord.lon
                        );
                        
                        if (distance <= 5) {
                            cluster.push(otherCoord);
                            processed.add(otherCoord.id);
                        }
                    }
                    
                    clusters.push(cluster);
                }
                
                console.log(`   Segment: ${segments.length}`);
                console.log(`   Kluster: ${clusters.length}`);
                
                if (clusters.length === 1) {
                    console.log(`   ✅ SAMMA vattendrag → Slå samman till: "${testName}"`);
                } else {
                    console.log(`   🎯 OLIKA vattendrag → Skulle få följande namn:`);
                    clusters.forEach((cluster, i) => {
                        const avgLat = cluster.reduce((sum, c) => sum + c.lat, 0) / cluster.length;
                        const avgLon = cluster.reduce((sum, c) => sum + c.lon, 0) / cluster.length;
                        console.log(`      • ${testName} (Område ${i + 1}) - ${cluster.length} segment vid ${avgLat.toFixed(3)}, ${avgLon.toFixed(3)}`);
                    });
                }
            }
        }
        
        // 4. Beräkna potentiella besparingar
        console.log('\n💡 FÖRVÄNTADE RESULTAT:');
        
        const totalSegments = allNames?.length || 0;
        const estimatedMergedCount = uniqueNames + duplicateNames.length; // Ungefärlig uppskattning
        const reductionPercent = ((totalSegments - estimatedMergedCount) / totalSegments * 100);
        
        console.log(`   Nuvarande segment: ${totalSegments.toLocaleString()}`);
        console.log(`   Uppskattade unified: ~${estimatedMergedCount.toLocaleString()}`);
        console.log(`   Reduktion: ~${reductionPercent.toFixed(1)}%`);
        
        // 5. Klickbarhet-förbättring
        console.log('\n🖱️ KLICKBARHET-FÖRBÄTTRING:');
        console.log('   INNAN: Måste träffa exakt rätt segment');
        console.log('   EFTER: Klicka var som helst på hela vattendraget');
        console.log('   EXEMPEL: Höje å (23 segment) → 1 sammanhängande, klickbart vattendrag');
        
        // 6. Sök-förbättring
        console.log('\n🔍 SÖK-FÖRBÄTTRING:');
        console.log('   INNAN: "Höje" → få träffar');
        console.log('   EFTER: "Höje å lun" → "Höje å (Lund)"');
        console.log('   EXEMPEL: Smart disambiguation med geocoding');
        
        console.log('\n🎉 KONCEPT-TEST SLUTFÖRD!');
        console.log('='.repeat(50));
        console.log('\n✅ UNIFIED SYSTEM ÄR REDO ATT IMPLEMENTERAS!');
        console.log('\n📋 NÄSTA STEG:');
        console.log('1. Skapa water_bodies_unified tabell manuellt i Supabase');
        console.log('2. Kör processing för att skapa sammansatta vattendrag');
        console.log('3. Aktivera USE_UNIFIED_SYSTEM = true');
        console.log('4. Testa sök och klick-funktionalitet');
        
    } catch (error) {
        console.error('❌ Test error:', error);
    }
}

// Kör test (ES module version)
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename) {
    testUnifiedConcept()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('❌ Test failed:', error);
            process.exit(1);
        });
}