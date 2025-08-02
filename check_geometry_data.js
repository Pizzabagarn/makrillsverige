import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkGeometryData() {
  console.log('🗺️ KOLLAR VERKLIG GEOMETRY-DATA:\n');
  
  // Hämta några poster med alla kolumner
  const { data: waters } = await supabase
    .from('water_bodies')
    .select('id, name, water_type, osm_id, geometry')
    .limit(5);
  
  console.log('📋 FÖRSTA 5 POSTER:');
  waters.forEach((w, i) => {
    console.log(`${i+1}. ID ${w.id} (OSM ${w.osm_id})`);
    console.log(`   Namn: ${w.name || 'NULL'}`);
    console.log(`   Typ: ${w.water_type}`);
    console.log(`   Geometry: ${w.geometry ? w.geometry.toString().slice(0, 100) + '...' : 'VERKLIGEN NULL'}`);
    console.log('');
  });
  
  // Kolla specifik geometri som text
  console.log('🔍 GEOMETRY SOM TEXT (ST_AsText):\n');
  
  // Använd raw SQL för att få geometry som läsbar text
  const { data: geoText, error } = await supabase
    .rpc('get_geometry_as_text')
    .limit(3);
  
  if (error) {
    console.log('❌ ST_AsText funktion saknas, försöker direkt query...');
    
    // Alternativ metod
    const { data: directGeo } = await supabase
      .from('water_bodies')
      .select('id, name, water_type, osm_id')
      .not('geometry', 'is', null)
      .limit(3);
    
    console.log('📊 POSTER MED GEOMETRY (inte null):');
    directGeo.forEach((w, i) => {
      console.log(`${i+1}. ID ${w.id}: "${w.name}" (${w.water_type})`);
      console.log(`   OSM: ${w.osm_id}`);
      console.log(`   ✅ HAR geometry-data (Supabase visar bara "NULL" i UI)`);
    });
  } else {
    geoText.forEach((row, i) => {
      console.log(`${i+1}. ${row.name || 'Unnamed'}: ${row.geometry_text}`);
    });
  }
  
  // Räkna verkliga null vs icke-null geometry
  console.log('\n📊 GEOMETRY STATISTIK:');
  
  const { count: totalCount } = await supabase
    .from('water_bodies')
    .select('*', { count: 'exact', head: true });
  
  const { count: hasGeometry } = await supabase
    .from('water_bodies')
    .select('*', { count: 'exact', head: true })
    .not('geometry', 'is', null);
  
  const { count: nullGeometry } = await supabase
    .from('water_bodies')
    .select('*', { count: 'exact', head: true })
    .is('geometry', null);
  
  console.log(`   Totalt: ${totalCount} poster`);
  console.log(`   Med geometry: ${hasGeometry} poster (${Math.round(hasGeometry/totalCount*100)}%)`);
  console.log(`   Utan geometry: ${nullGeometry} poster (${Math.round(nullGeometry/totalCount*100)}%)`);
  
  if (hasGeometry > 0) {
    console.log('\n✅ SLUTSATS: Geometry-data FINNS, men Supabase UI visar "NULL"');
    console.log('   Detta är normalt för PostGIS geometry-kolumner');
    console.log('   Dina vatten HAR koordinater för väderdata! 🎯');
  } else {
    console.log('\n❌ PROBLEM: Ingen geometry-data hittades!');
  }
}

checkGeometryData().catch(console.error); 