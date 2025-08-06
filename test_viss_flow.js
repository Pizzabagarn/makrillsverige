import { getWaterBodyWithPlacesAtCoordinates, getWaterBodyWithPlacesDetails } from './src/lib/waterBodiesWithPlacesService.ts';

async function testVissFlow() {
  console.log('🐟 TESTAR VISS-HÄMTNING DIREKT...\n');
  
  try {
    // Test click function
    console.log('1. 🎯 TESTAR KLICK PÅ VÄNERN (58.9, 13.1):');
    const clickResult = await getWaterBodyWithPlacesAtCoordinates(58.9, 13.1, 2);
    
    if (clickResult) {
      console.log(`   ✅ Klick OK: ${clickResult.name} (ID: ${clickResult.id})`);
      console.log(`   📍 Land: ${clickResult.country}, Typ: ${clickResult.water_type}`);
      
      // Test VISS details
      console.log('\n2. 🔍 TESTAR VISS-HÄMTNING:');
      const detailsResult = await getWaterBodyWithPlacesDetails(clickResult.id.toString());
      
      if (detailsResult) {
        console.log(`   ✅ Detaljer OK: ${detailsResult.waterBody.name}`);
        console.log(`   📊 VISS-data: ${detailsResult.vissData ? 'JA' : 'NEJ'}`);
        if (detailsResult.vissData) {
          console.log(`   🎯 VISS namn: ${detailsResult.vissData.basic?.name || 'N/A'}`);
          console.log(`   🌊 Status: ${detailsResult.vissData.waterQuality?.ecological_status || 'N/A'}`);
        } else {
          console.log('   ❓ Ingen VISS-data hämtades - kollar varför...');
          console.log(`   🏷️ Sjönamn för VISS: "${clickResult.name}"`);
          console.log(`   🗺️ Koordinater: ${clickResult.lat}, ${clickResult.lon}`);
        }
      } else {
        console.log('   ❌ Kunde inte hämta detaljer');
      }
    } else {
      console.log('   ❌ Ingen träff på klick');
    }
    
    // Test with known ID
    console.log('\n3. 🧪 TESTAR MED KÄNT ID (26117):');
    const knownResult = await getWaterBodyWithPlacesDetails('26117');
    if (knownResult) {
      console.log(`   ✅ Känt ID OK: ${knownResult.waterBody.name}`);
      console.log(`   📊 VISS-data: ${knownResult.vissData ? 'JA' : 'NEJ'}`);
    } else {
      console.log('   ❌ Känt ID fungerar inte');
    }
    
  } catch (error) {
    console.error('❌ Fel:', error.message);
    console.error('Stack:', error.stack);
  }
}

testVissFlow().catch(console.error);