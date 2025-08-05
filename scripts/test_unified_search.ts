#!/usr/bin/env ts-node

/**
 * Test Script för Unified Water Search
 * 
 * Testar att sökfunktionen fungerar korrekt:
 * - "Höje å lun" → "Höje å (Lund)"
 * - "Svartån kumla" → "Svartån (Kumla)"
 * - Klick-funktionalitet på sammansatta vattendrag
 * - VISS-kompatibilitet
 */

// Ladda environment variabler från .env.local för script
import * as fs from 'fs';
import * as path from 'path';

// Läs .env.local om den finns
const envLocalPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
    const envLocal = fs.readFileSync(envLocalPath, 'utf8');
    const envVars = envLocal.split('\n').filter(line => line.includes('='));
    
    envVars.forEach(line => {
        const [key, ...valueParts] = line.split('=');
        const value = valueParts.join('=');
        if (key && value && !process.env[key.trim()]) {
            process.env[key.trim()] = value.trim();
        }
    });
}

import { searchUnifiedWaterBodies, getUnifiedWaterBodyAtCoordinates, getUnifiedWaterBodyDetails } from '../src/lib/unifiedWaterService';

interface TestCase {
    name: string;
    searchTerm: string;
    expectedResults: string[];
    shouldFind: boolean;
}

const testCases: TestCase[] = [
    {
        name: 'Grundläggande sökning',
        searchTerm: 'Höje',
        expectedResults: ['Höje å'],
        shouldFind: true
    },
    {
        name: 'Disambiguation sökning',
        searchTerm: 'Höje å lun',
        expectedResults: ['Höje å (Lund)'],
        shouldFind: true
    },
    {
        name: 'Partiell kommun-matchning',
        searchTerm: 'Svartån kumla',
        expectedResults: ['Svartån (Kumla)'],
        shouldFind: true
    },
    {
        name: 'Case-insensitive sökning',
        searchTerm: 'VOMBSJÖN',
        expectedResults: ['Vombsjön'],
        shouldFind: true
    },
    {
        name: 'Fuzzy matching',
        searchTerm: 'Storsjö',
        expectedResults: ['Storsjön'],
        shouldFind: true
    }
];

/**
 * Kör söktest
 */
async function runSearchTests(): Promise<void> {
    console.log('🔍 TESTAR UNIFIED SEARCH FUNKTIONALITET');
    console.log('=' * 50);
    
    let passedTests = 0;
    let totalTests = testCases.length;
    
    for (const testCase of testCases) {
        console.log(`\n📋 Test: ${testCase.name}`);
        console.log(`   Söker: "${testCase.searchTerm}"`);
        
        try {
            const results = await searchUnifiedWaterBodies(testCase.searchTerm, 10);
            
            if (testCase.shouldFind && results.length === 0) {
                console.log(`   ❌ FAIL: Inga resultat hittades`);
                continue;
            }
            
            if (!testCase.shouldFind && results.length > 0) {
                console.log(`   ❌ FAIL: Inga resultat förväntades`);
                continue;
            }
            
            if (results.length > 0) {
                console.log(`   ✅ Hittade ${results.length} resultat:`);
                results.slice(0, 3).forEach(result => {
                    console.log(`      • ${result.display_name} (${result.original_segment_count} segment)`);
                });
                
                // Kontrollera om förväntade resultat finns
                const foundExpected = testCase.expectedResults.some(expected =>
                    results.some(result => 
                        result.display_name.toLowerCase().includes(expected.toLowerCase()) ||
                        result.name.toLowerCase().includes(expected.toLowerCase())
                    )
                );
                
                if (foundExpected) {
                    console.log(`   ✅ PASS: Förväntade resultat hittades`);
                    passedTests++;
                } else {
                    console.log(`   ❌ FAIL: Förväntade resultat saknades`);
                }
            } else {
                console.log(`   ✅ PASS: Inga resultat (som förväntat)`);
                passedTests++;
            }
            
        } catch (error) {
            console.log(`   ❌ FAIL: Error - ${error}`);
        }
    }
    
    console.log(`\n📊 TESTRESULTAT: ${passedTests}/${totalTests} lyckades`);
    
    if (passedTests === totalTests) {
        console.log('🎉 Alla söktester lyckades!');
    } else {
        console.log('⚠️ Vissa söktester misslyckades');
    }
}

/**
 * Testa klick-funktionalitet
 */
async function runClickTests(): Promise<void> {
    console.log('\n🖱️ TESTAR KLICK-FUNKTIONALITET');
    console.log('=' * 50);
    
    // Test-koordinater för kända platser
    const clickTests = [
        { name: 'Malmö (Höje å)', lat: 55.6050, lon: 13.0038 },
        { name: 'Lund centrum', lat: 55.7047, lon: 13.1910 },
        { name: 'Vombsjön', lat: 55.6844, lon: 13.3721 },
        { name: 'Stockholm (vatten)', lat: 59.3293, lon: 18.0686 },
        { name: 'Göteborg hamn', lat: 57.7089, lon: 11.9746 }
    ];
    
    let clickPassedTests = 0;
    
    for (const clickTest of clickTests) {
        console.log(`\n📍 Testar klick vid ${clickTest.name}`);
        console.log(`   Koordinater: ${clickTest.lat}, ${clickTest.lon}`);
        
        try {
            const result = await getUnifiedWaterBodyAtCoordinates(clickTest.lat, clickTest.lon, 5); // 5km tolerans
            
            if (result) {
                console.log(`   ✅ Hittade: ${result.display_name}`);
                console.log(`      Typ: ${result.water_type}`);
                console.log(`      Segment: ${result.original_segment_count}`);
                console.log(`      Källa: ${result.data_source}`);
                
                clickPassedTests++;
            } else {
                console.log(`   ⚠️ Inget vattendrag hittat (kan vara normalt)`);
            }
            
        } catch (error) {
            console.log(`   ❌ Klick-test error: ${error}`);
        }
    }
    
    console.log(`\n📊 KLICK-TESTRESULTAT: ${clickPassedTests}/${clickTests.length} hittade vatten`);
}

/**
 * Testa VISS-kompatibilitet
 */
async function runVISSCompatibilityTest(): Promise<void> {
    console.log('\n🧪 TESTAR VISS-KOMPATIBILITET');
    console.log('=' * 50);
    
    try {
        // Hitta ett svenskt vattendrag för VISS-test
        const searchResults = await searchUnifiedWaterBodies('Vombsjön', 1);
        
        if (searchResults.length === 0) {
            console.log('⚠️ Kunde inte hitta test-vattendrag för VISS-test');
            return;
        }
        
        const testWaterBody = searchResults[0];
        console.log(`🔬 Testar VISS-kompatibilitet för: ${testWaterBody.display_name}`);
        console.log(`   Original namn: ${testWaterBody.name}`);
        console.log(`   Land: ${testWaterBody.country}`);
        
        if (testWaterBody.country !== 'SE') {
            console.log('⚠️ Test-vattendrag är inte svenskt, hoppar över VISS-test');
            return;
        }
        
        const detailsResult = await getUnifiedWaterBodyDetails(testWaterBody.id);
        
        if (!detailsResult) {
            console.log('❌ Kunde inte hämta detaljer för test-vattendrag');
            return;
        }
        
        if (detailsResult.vissData) {
            console.log('✅ VISS-data hämtad framgångsrikt!');
            console.log(`   EU-kod: ${detailsResult.vissData.basic.eu_cd}`);
            console.log(`   Vattenkvalitet: ${detailsResult.vissData.waterQuality.overall_risk}`);
            console.log(`   Fiskdata: ${detailsResult.vissData.fishData.fish_community_status}`);
        } else {
            console.log('⚠️ Ingen VISS-data hittades (kan vara normalt för vissa vattendrag)');
        }
        
    } catch (error) {
        console.log(`❌ VISS-kompatibilitetstest error:`, error);
    }
}

/**
 * Kör specifik sökning från kommandorad
 */
async function runSpecificSearch(searchTerm: string): Promise<void> {
    console.log(`🔍 SÖKER: "${searchTerm}"`);
    console.log('=' * 50);
    
    try {
        const results = await searchUnifiedWaterBodies(searchTerm, 10);
        
        if (results.length === 0) {
            console.log('❌ Inga resultat hittades');
            return;
        }
        
        console.log(`✅ Hittade ${results.length} resultat:\n`);
        
        results.forEach((result, index) => {
            console.log(`${index + 1}. ${result.display_name}`);
            console.log(`   Typ: ${result.water_type}`);
            console.log(`   Segment: ${result.original_segment_count}`);
            if (result.municipality) {
                console.log(`   Kommun: ${result.municipality}`);
            }
            console.log(`   Källa: ${result.data_source}`);
            if (result.area_km2) {
                console.log(`   Area: ${result.area_km2.toFixed(2)} km²`);
            }
            console.log('');
        });
        
    } catch (error) {
        console.error('❌ Sökfel:', error);
    }
}

/**
 * Huvudfunktion
 */
async function main(): Promise<void> {
    const args = process.argv.slice(2);
    
    if (args.length > 0) {
        // Specifik sökning från kommandorad
        const searchTerm = args.join(' ');
        await runSpecificSearch(searchTerm);
    } else {
        // Kör alla tester
        await runSearchTests();
        await runClickTests();
        await runVISSCompatibilityTest();
        
        console.log('\n🎯 SLUTSATS');
        console.log('=' * 50);
        console.log('Om alla tester lyckades är unified system redo att aktiveras!');
        console.log('');
        console.log('För att aktivera:');
        console.log('1. Ändra USE_UNIFIED_SYSTEM till true i src/lib/unifiedWaterService.ts');
        console.log('2. Testa i UI att sökning och klick fungerar');
        console.log('3. Verifiera att VISS-data fortfarande visas korrekt');
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error('❌ Test error:', error);
        process.exit(1);
    });
}