import { createClient } from '@supabase/supabase-js';
import { getWaterBodyWithPlacesAtCoordinates, getWaterBodyWithPlacesDetails } from '../src/lib/waterBodiesWithPlacesService';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function debugVissIssue() {
  console.log('🔍 DEBUG: VISS-PROBLEM MED NYA TABELLER\n');

  // 1. Testa klick på Vänern
  console.log('1. 🎯 KLICK PÅ VÄNERN (58.9, 13.1):');
  try {
    const clickResult = await getWaterBodyWithPlacesAtCoordinates(58.9, 13.1, 2);
    if (clickResult) {
      console.log(`   ✅ Klick OK: ${clickResult.name} (ID: ${clickResult.id})`);
      console.log(`   📍 Land: ${clickResult.country}, Typ: ${clickResult.water_type}`);
      
      // 2. Testa VISS-hämtning med detta ID
      console.log('\n2. 🔍 VISS-HÄMTNING MED DETTA ID:');
      const vissResult = await getWaterBodyWithPlacesDetails(clickResult.id.toString());
      if (vissResult) {
        console.log(`   ✅ VISS OK: ${vissResult.waterBody.name}`);
        console.log(`   📊 VISS-data: ${vissResult.vissData ? 'JA' : 'NEJ'}`);
        if (vissResult.vissData) {
          console.log(`   🎯 VISS info: ${vissResult.vissData.waterBodyName}`);
        }
      } else {
        console.log('   ❌ VISS-hämtning misslyckades');
      }
    } else {
      console.log('   ❌ Ingen klick-träff på Vänern');
    }
  } catch (error) {
    console.log(`   ❌ Klick-fel: ${error}`);
  }

  // 3. Direkt test av VISS-funktion
  console.log('\n3. 🧪 DIREKT VISS-TEST PÅ KÄNT ID (26117):');
  try {
    const directViss = await getWaterBodyWithPlacesDetails('26117');
    if (directViss) {
      console.log(`   ✅ Direkt VISS OK: ${directViss.waterBody.name}`);
      console.log(`   🇸🇪 Land: ${directViss.waterBody.country}`);
      console.log(`   📊 VISS-data: ${directViss.vissData ? 'JA' : 'NEJ'}`);
    } else {
      console.log('   ❌ Direkt VISS misslyckades');
    }
  } catch (error) {
    console.log(`   ❌ Direkt VISS-fel: ${error}`);
  }

  console.log('\n🎯 SLUTSATS: Nu ser vi var VISS-kedjan bryts!');
}

debugVissIssue().catch(console.error);
import { getWaterBodyWithPlacesAtCoordinates, getWaterBodyWithPlacesDetails } from '../src/lib/waterBodiesWithPlacesService';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function debugVissIssue() {
  console.log('🔍 DEBUG: VISS-PROBLEM MED NYA TABELLER\n');

  // 1. Testa klick på Vänern
  console.log('1. 🎯 KLICK PÅ VÄNERN (58.9, 13.1):');
  try {
    const clickResult = await getWaterBodyWithPlacesAtCoordinates(58.9, 13.1, 2);
    if (clickResult) {
      console.log(`   ✅ Klick OK: ${clickResult.name} (ID: ${clickResult.id})`);
      console.log(`   📍 Land: ${clickResult.country}, Typ: ${clickResult.water_type}`);
      
      // 2. Testa VISS-hämtning med detta ID
      console.log('\n2. 🔍 VISS-HÄMTNING MED DETTA ID:');
      const vissResult = await getWaterBodyWithPlacesDetails(clickResult.id.toString());
      if (vissResult) {
        console.log(`   ✅ VISS OK: ${vissResult.waterBody.name}`);
        console.log(`   📊 VISS-data: ${vissResult.vissData ? 'JA' : 'NEJ'}`);
        if (vissResult.vissData) {
          console.log(`   🎯 VISS info: ${vissResult.vissData.waterBodyName}`);
        }
      } else {
        console.log('   ❌ VISS-hämtning misslyckades');
      }
    } else {
      console.log('   ❌ Ingen klick-träff på Vänern');
    }
  } catch (error) {
    console.log(`   ❌ Klick-fel: ${error}`);
  }

  // 3. Direkt test av VISS-funktion
  console.log('\n3. 🧪 DIREKT VISS-TEST PÅ KÄNT ID (26117):');
  try {
    const directViss = await getWaterBodyWithPlacesDetails('26117');
    if (directViss) {
      console.log(`   ✅ Direkt VISS OK: ${directViss.waterBody.name}`);
      console.log(`   🇸🇪 Land: ${directViss.waterBody.country}`);
      console.log(`   📊 VISS-data: ${directViss.vissData ? 'JA' : 'NEJ'}`);
    } else {
      console.log('   ❌ Direkt VISS misslyckades');
    }
  } catch (error) {
    console.log(`   ❌ Direkt VISS-fel: ${error}`);
  }

  console.log('\n🎯 SLUTSATS: Nu ser vi var VISS-kedjan bryts!');
}

debugVissIssue().catch(console.error);