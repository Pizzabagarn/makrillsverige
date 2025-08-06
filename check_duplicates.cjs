const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkDuplicates() {
  console.log('🔍 KOLLAR DUBBLETTER I SAMMANSLAGDA TABELLER...\n');
  
  // Check ID 26117 specifically
  const { data: duplicates, error } = await supabase
    .from('water_bodies_merged_fast_lookup')
    .select('id, name, data_source, area_km2, municipality')
    .eq('id', 26117);
  
  if (error) {
    console.log('❌ Fel:', error.message);
  } else {
    console.log(`📊 Antal rader med ID 26117: ${duplicates?.length || 0}`);
    if (duplicates && duplicates.length > 0) {
      console.log('📋 Detaljer:');
      duplicates.forEach((row, i) => {
        console.log(`   ${i+1}. ${row.name} (${row.data_source}, ${row.area_km2} km²) - ${row.municipality || 'N/A'}`);
      });
    }
  }
  
  // Check for other duplicates - simplified query
  console.log('\n🔍 KOLLAR ANDRA DUBBLETTER...');
  const { data: allData, error: allError } = await supabase
    .from('water_bodies_merged_fast_lookup')
    .select('id, name')
    .limit(1000);
    
  if (allError) {
    console.log('❌ Fel vid hämtning:', allError.message);
  } else {
    // Count duplicates in JavaScript
    const idCounts = {};
    allData?.forEach(row => {
      idCounts[row.id] = (idCounts[row.id] || 0) + 1;
    });
    
    const duplicateIds = Object.entries(idCounts)
      .filter(([id, count]) => count > 1)
      .slice(0, 10);
      
    console.log(`📊 Antal dubbletter (första 1000): ${duplicateIds.length}`);
    if (duplicateIds.length > 0) {
      console.log('🔢 Första 10 dubletter:');
      duplicateIds.forEach(([id, count]) => {
        console.log(`   ID ${id}: ${count} rader`);
      });
    }
  }
}

checkDuplicates().catch(console.error);