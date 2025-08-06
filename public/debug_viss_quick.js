// Quick VISS debug - kör med npm run dev och kolla i browser console

console.log('🔍 VISS DEBUG SCRIPT LOADED');

// Test function som du kan köra i browser console
window.debugVissIssue = async function() {
  console.log('🐟 TESTAR VISS-PROBLEM...');
  
  try {
    // Import the service (this will work in browser context)
    const { getWaterBodyWithPlacesAtCoordinates, getWaterBodyWithPlacesDetails } = 
      await import('/src/lib/waterBodiesWithPlacesService.ts');
    
    // Test click on Vänern
    console.log('1. 🎯 KLICKAR PÅ VÄNERN (58.9, 13.1):');
    const clickResult = await getWaterBodyWithPlacesAtCoordinates(58.9, 13.1, 2);
    
    if (clickResult) {
      console.log(`✅ Klick OK: ${clickResult.name} (ID: ${clickResult.id})`);
      console.log('📊 WaterBody data:', clickResult);
      
      // Test VISS details
      console.log('\n2. 🔍 HÄMTAR VISS-DETALJER:');
      const detailsResult = await getWaterBodyWithPlacesDetails(clickResult.id.toString());
      
      if (detailsResult) {
        console.log(`✅ Detaljer OK: ${detailsResult.waterBody.name}`);
        console.log(`📊 VISS-data: ${detailsResult.vissData ? 'JA' : 'NEJ'}`);
        
        if (detailsResult.vissData) {
          console.log('🎯 VISS data:', detailsResult.vissData);
        } else {
          console.log('❓ Ingen VISS-data - debuggar...');
          console.log(`🏷️ Sjönamn: "${clickResult.name}"`);
          console.log(`🗺️ Koordinater: ${clickResult.lat}, ${clickResult.lon}`);
          console.log(`🏁 Land: ${clickResult.country}`);
        }
      } else {
        console.log('❌ Kunde inte hämta detaljer');
      }
    } else {
      console.log('❌ Ingen träff på klick');
    }
  } catch (error) {
    console.error('❌ Fel:', error);
  }
};

console.log('💡 Kör debugVissIssue() i konsolen för att testa VISS-problem');