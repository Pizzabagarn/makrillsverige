import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkTables() {
  console.log('🔍 KONTROLLERAR SAMMANSLAGDA TABELLER...\n');
  
  // Check merged tables
  const tables = ['water_bodies_with_places_merged', 'water_bodies_merged_fast_lookup'];
  
  for (const table of tables) {
    try {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });
      
      if (error) {
        console.log(`❌ ${table}: ${error.message}`);
      } else {
        console.log(`✅ ${table}: ${count?.toLocaleString()} rader`);
      }
    } catch (err) {
      console.log(`❌ ${table}: ${err.message}`);
    }
  }
  
  // Test function
  console.log('\n🔧 TESTAR PostGIS-FUNKTION...');
  try {
    const { data, error } = await supabase.rpc('find_merged_water_body_containing_point', {
      click_lat: 58.9,
      click_lon: 13.1,
      search_radius_deg: 0.02
    });
    
    if (error) {
      console.log(`❌ PostGIS-funktion: ${error.message}`);
    } else {
      console.log(`✅ PostGIS-funktion: ${data?.length || 0} resultat`);
      if (data && data.length > 0) {
        console.log(`   📍 Första träff: ${data[0].name} (ID: ${data[0].id})`);
      }
    }
  } catch (err) {
    console.log(`❌ PostGIS-funktion: ${err.message}`);
  }
  
  // Test VISS data retrieval
  console.log('\n🐟 TESTAR VISS-HÄMTNING...');
  try {
    const { getWaterBodyWithPlacesDetails } = await import('./src/lib/waterBodiesWithPlacesService.js');
    const result = await getWaterBodyWithPlacesDetails('26117'); // Vänern
    
    if (result) {
      console.log(`✅ VISS-test: ${result.waterBody.name}`);
      console.log(`   📊 VISS-data: ${result.vissData ? 'JA' : 'NEJ'}`);
    } else {
      console.log('❌ VISS-test: Ingen data');
    }
  } catch (err) {
    console.log(`❌ VISS-test: ${err.message}`);
  }
}

checkTables().catch(console.error);