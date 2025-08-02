#!/usr/bin/env node

// Enkelt testscript för Yr Weather API integration
// Testar att API:et fungerar och returnerar förväntad data

import { yrWeatherService } from '../src/lib/yrWeatherService.js';

console.log('🧪 Testar Yr Weather API integration...\n');

async function testYrApi() {
  // Testpunkter i svenska vatten
  const testPoints = [
    { lat: 57.7089, lon: 11.9746, name: 'Göteborg' },
    { lat: 59.3293, lon: 18.0686, name: 'Stockholm' },
    { lat: 58.2459, lon: 12.3217, name: 'Lysekil' }
  ];

  console.log('📍 Testpunkter:');
  testPoints.forEach(point => {
    console.log(`   • ${point.name}: ${point.lat}°N, ${point.lon}°E`);
  });
  console.log('');

  // Visa API-information
  const apiInfo = yrWeatherService.getApiInfo();
  console.log('ℹ️  API Information:');
  console.log(`   • Provider: ${apiInfo.provider}`);
  console.log(`   • Licens: ${apiInfo.license}`);
  console.log(`   • Upplösning: ${apiInfo.resolution}`);
  console.log(`   • Max prognostimmar: ${apiInfo.maxForecastHours}h`);
  console.log(`   • User-Agent: ${apiInfo.userAgent}`);
  console.log('');

  // Testa varje punkt
  for (const point of testPoints) {
    try {
      console.log(`🔄 Testar ${point.name}...`);
      const startTime = Date.now();
      
      const weatherData = await yrWeatherService.fetchPointWeather(point.lat, point.lon);
      
      const duration = Date.now() - startTime;
      
      if (weatherData && weatherData.length > 0) {
        console.log(`✅ ${point.name} - OK (${duration}ms)`);
        console.log(`   • Prognostider: ${weatherData.length} st`);
        console.log(`   • Första prognos: ${weatherData[0].time}`);
        console.log(`   • Sista prognos: ${weatherData[weatherData.length - 1].time}`);
        
        // Visa exempel på första datapunkten
        const first = weatherData[0];
        console.log(`   • Temperatur: ${first.temperature}°C`);
        console.log(`   • Vindhastighet: ${first.windSpeed} m/s`);
        console.log(`   • Vindbyar: ${first.windGust} m/s`);
        console.log(`   • Nederbörd: ${first.precipitation} mm`);
        console.log('');
      } else {
        console.log(`❌ ${point.name} - Ingen data returnerad`);
      }
      
    } catch (error) {
      console.log(`❌ ${point.name} - Fel: ${error instanceof Error ? error.message : 'Okänt fel'}`);
      console.log('');
    }
    
    // Paus mellan requests för att vara snäll mot API:et
    if (point !== testPoints[testPoints.length - 1]) {
      console.log('⏳ Väntar 1s...\n');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

async function main() {
  try {
    await testYrApi();
    console.log('✅ Yr API-test slutfört!');
    console.log('\n🎯 Attribution:');
    console.log('   Data från Meteorologisk institutt (MET Norway)');
    console.log('   Licens: CC BY 4.0');
    console.log('   https://www.met.no/');
    
  } catch (error) {
    console.error('❌ Testfel:', error);
    process.exit(1);
  }
}

// Kör test om scriptet körs direkt
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
} 