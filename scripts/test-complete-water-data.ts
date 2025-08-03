import { WaterBodyDataFetcher, WaterBodyData } from '../src/lib/waterBodyDataFetcher';

/**
 * Testscript för att hämta komplett vattendrags-data
 * Testar integration av VISS, SMHI och fiskdata
 */

async function testCompleteWaterData() {
  console.log('🌊 KOMPLETT VATTENDRAGS-DATA TEST');
  console.log('=====================================\n');

  const fetcher = new WaterBodyDataFetcher();
  
  // Test med olika vattendrag
  const testWaterBodies = [
    'Vombsjön',
    'Ven',
    'Mälaren',
    'Siljan'
  ];

  for (const waterBody of testWaterBodies) {
    console.log(`\n🔍 TESTAR: ${waterBody}`);
    console.log('─'.repeat(50));
    
    try {
      const data = await fetcher.fetchWaterBodyData(waterBody);
      
      if (data) {
        displayWaterBodyData(data);
      } else {
        console.log('❌ Ingen data hittades');
      }
      
    } catch (error) {
      console.error('❌ Fel:', error instanceof Error ? error.message : 'Okänt fel');
    }
    
    // Vänta mellan anrop för att inte överbelasta API:erna
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

function displayWaterBodyData(data: WaterBodyData) {
  console.log(`✅ DATA HÄMTAD FÖR: ${data.basic.name.toUpperCase()}`);
  
  // Grundläggande information
  console.log('\n📍 GRUNDLÄGGANDE INFORMATION:');
  console.log(`   Namn: ${data.basic.name}`);
  console.log(`   Typ: ${data.basic.type}`);
  console.log(`   EU-kod: ${data.basic.eu_cd}`);
  console.log(`   Koordinater: ${data.basic.coordinates.lat.toFixed(4)}, ${data.basic.coordinates.lon.toFixed(4)}`);
  console.log(`   Län: ${data.basic.county}`);
  if (data.basic.area_m2) {
    console.log(`   Yta: ${(data.basic.area_m2 / 10000).toFixed(1)} hektar`);
  }
  console.log(`   VISS: ${data.basic.viss_url}`);

  // Vattenkvalitet
  console.log('\n🧪 VATTENKVALITET:');
  console.log(`   🫧 Syrgasförhållanden: ${data.waterQuality.oxygen.status}`);
  console.log(`   🌱 Näringsämnen: ${data.waterQuality.nutrients.status}`);
  console.log(`   🌿 Klorofyll: ${data.waterQuality.nutrients.chlorophyll}`);
  console.log(`   ⚗️ pH/Försurning: ${data.waterQuality.acidity.ph_status}`);
  console.log(`   💡 Ljusförhållanden: ${data.waterQuality.transparency.light_conditions}`);
  console.log(`   📊 Ekologisk status: ${data.waterQuality.ecological_status}`);
  console.log(`   ⚠️ Kemisk status: ${data.waterQuality.chemical_status}`);
  console.log(`   🎯 Övergripande risk: ${data.waterQuality.overall_risk}`);

  // Fiskdata
  console.log('\n🐟 FISKDATA:');
  console.log(`   🏆 Fisksamhällestatus: ${data.fishData.fish_community_status}`);
  if (data.fishData.fish_indices.eqr8) {
    console.log(`   📈 EQR8 Index: ${data.fishData.fish_indices.eqr8}`);
  }
  if (data.fishData.species && data.fishData.species.length > 0) {
    console.log(`   🎣 Fiskarter (${data.fishData.species.length}):`);
    data.fishData.species.slice(0, 5).forEach(species => {
      console.log(`      • ${species.name}${species.scientific_name ? ` (${species.scientific_name})` : ''}`);
    });
    if (data.fishData.species.length > 5) {
      console.log(`      ... och ${data.fishData.species.length - 5} till`);
    }
  } else {
    console.log('   📋 Inga artdata tillgängliga från SvenskaFiskekartan');
  }

  // Aktuella förhållanden
  console.log('\n🌡️ AKTUELLA FÖRHÅLLANDEN:');
  if (data.currentConditions.water_temperature) {
    const temp = data.currentConditions.water_temperature;
    console.log(`   🌊 Vattentemperatur: ${temp.value}${temp.unit}`);
    console.log(`   📍 Station: ${temp.station_name} (${temp.station_distance_km}km bort)`);
    console.log(`   📅 Mätdatum: ${new Date(temp.date).toLocaleDateString('sv-SE')}`);
  } else {
    console.log('   ❌ Ingen vattentemperatur tillgänglig');
  }

  if (data.currentConditions.weather) {
    const weather = data.currentConditions.weather;
    console.log(`   🌤️ Lufttemperatur: ${weather.air_temperature}°C`);
    console.log(`   💨 Vindhastighet: ${weather.wind_speed} m/s`);
    console.log(`   🌧️ Nederbörd: ${weather.precipitation} mm`);
  }

  if (data.currentConditions.hydrological) {
    const hydro = data.currentConditions.hydrological;
    console.log(`   🌊 Vattenföring: ${hydro.water_flow} m³/s`);
    if (hydro.forecast_10_days) {
      console.log(`   📈 10-dagars prognos tillgänglig`);
    }
  }

  // Metadata och kvalitetsbedömning
  console.log('\n📋 METADATA:');
  console.log(`   📅 Senast uppdaterad: ${new Date(data.metadata.last_updated).toLocaleString('sv-SE')}`);
  console.log(`   📊 Datakällor: ${data.metadata.data_sources.join(', ')}`);
  console.log(`   🎯 Kompletthetsgrad: ${data.metadata.quality_assessment.completeness_score}%`);
  console.log(`   ⏰ VISS-data ålder: ${data.metadata.quality_assessment.viss_data_age}`);
  console.log(`   🔄 SMHI-data aktualitet: ${data.metadata.quality_assessment.smhi_data_freshness}`);

  // Kvalitetsbedömning
  const completeness = data.metadata.quality_assessment.completeness_score;
  let qualityEmoji = '🔴';
  let qualityText = 'Låg';
  
  if (completeness >= 75) {
    qualityEmoji = '🟢';
    qualityText = 'Hög';
  } else if (completeness >= 50) {
    qualityEmoji = '🟡';
    qualityText = 'Medel';
  }
  
  console.log(`\n${qualityEmoji} DATAKVALITET: ${qualityText} (${completeness}% komplett)`);
}

// Kör testet
if (require.main === module) {
  testCompleteWaterData().catch(console.error);
}

export { testCompleteWaterData };