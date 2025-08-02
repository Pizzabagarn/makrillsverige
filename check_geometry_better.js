import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkGeometryBetter() {
  console.log('🗺️ KOLLAR GEOMETRY-DATA BÄTTRE:\n');
  
  // Test 1: Kolla raw geometry objekt
  const { data: rawData } = await supabase
    .from('water_bodies')
    .select('id, name, water_type, osm_id, geometry')
    .limit(3);
  
  console.log('📋 RAW GEOMETRY-OBJEKT:');
  rawData.forEach((w, i) => {
    console.log(`${i+1}. ID ${w.id}: "${w.name || 'NULL'}" (${w.water_type})`);
    console.log(`   Geometry type: ${typeof w.geometry}`);
    console.log(`   Geometry: ${JSON.stringify(w.geometry).slice(0, 200)}...`);
    console.log('');
  });
  
  // Test 2: Använd SQL för att få koordinater
  try {
    const { data: coordData } = await supabase.rpc('sql', {
      query: `
        SELECT 
          id, 
          name, 
          water_type,
          ST_X(ST_Centroid(geometry)) as longitude,
          ST_Y(ST_Centroid(geometry)) as latitude,
          ST_GeometryType(geometry) as geom_type
        FROM water_bodies 
        WHERE geometry IS NOT NULL 
        LIMIT 5
      `
    });
    
    console.log('🎯 KOORDINATER UR GEOMETRY:');
    coordData.forEach((w, i) => {
      console.log(`${i+1}. "${w.name || 'NULL'}" (${w.water_type})`);
      console.log(`   Koordinater: ${w.longitude?.toFixed(4)}, ${w.latitude?.toFixed(4)}`);
      console.log(`   Geometry-typ: ${w.geom_type}`);
    });
    
  } catch (error) {
    console.log('❌ SQL query misslyckades:', error.message);
    
    // Alternativ: Testa ett specific vatten
    console.log('\n🔍 ALTERNATIV TEST - VOMBSJÖN:');
    const { data: vombData } = await supabase
      .from('water_bodies')
      .select('id, name, water_type, geometry')
      .ilike('name', '%Vomb%')
      .limit(1);
    
    if (vombData && vombData.length > 0) {
      const vomb = vombData[0];
      console.log(`Vombsjön data:`);
      console.log(`  Namn: ${vomb.name}`);
      console.log(`  Typ: ${vomb.water_type}`);
      console.log(`  Geometry finns: ${vomb.geometry ? 'JA' : 'NEJ'}`);
      if (vomb.geometry) {
        console.log(`  Geometry innehåll: ${JSON.stringify(vomb.geometry).slice(0, 300)}...`);
      }
    } else {
      console.log('Hittade inte Vombsjön');
    }
  }
  
  // Test 3: Enkel räkning
  const { data: countData } = await supabase
    .from('water_bodies')
    .select('id')
    .limit(5);
  
  console.log(`\n📊 GRUNDLÄGGANDE TEST:`);
  console.log(`   Kan hämta poster: ${countData ? 'JA' : 'NEJ'}`);
  console.log(`   Antal hämtade: ${countData?.length || 0}`);
  
  // Test 4: Kolla om geometry-kolumnen existerar
  const { data: schemaData } = await supabase
    .from('water_bodies')
    .select('*')
    .limit(1);
  
  if (schemaData && schemaData.length > 0) {
    const columns = Object.keys(schemaData[0]);
    console.log(`   Kolumner i tabellen: ${columns.join(', ')}`);
    console.log(`   Geometry-kolumn finns: ${columns.includes('geometry') ? 'JA' : 'NEJ'}`);
  }
}

checkGeometryBetter().catch(console.error); 