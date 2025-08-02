import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkNullNames() {
  console.log('🔍 VERKLIGA NULL-NAMN EXEMPEL:\n');
  
  // Exempel på vatten med och utan namn
  const { data: mixedWaters } = await supabase
    .from('water_bodies')
    .select('name, water_type, tags, osm_id')
    .limit(10);
  
  console.log('📋 FÖRSTA 10 VATTEN (blandade):');
  mixedWaters.forEach((w, i) => {
    console.log(`${i+1}. OSM ${w.osm_id}: "${w.name}" (${w.water_type})`);
    if (!w.name) {
      const tags = Object.keys(w.tags).join(', ');
      console.log(`   → NULL-NAMN! Tags: ${tags}`);
    }
  });
  
  console.log('\n🔍 DIREKTA NULL-KONTROLLER:\n');
  
  // Test olika sätt att hitta null
  const tests = [
    { name: 'is null', query: supabase.from('water_bodies').select('name, water_type, osm_id').is('name', null).limit(3) },
    { name: 'name = ""', query: supabase.from('water_bodies').select('name, water_type, osm_id').eq('name', '').limit(3) },
    { name: 'name saknas', query: supabase.from('water_bodies').select('name, water_type, osm_id').not('name', 'neq', null).limit(3) }
  ];
  
  for (const test of tests) {
    try {
      const { data } = await test.query;
      console.log(`${test.name}: ${data?.length || 0} resultat`);
      if (data && data.length > 0) {
        data.forEach(w => console.log(`  - OSM ${w.osm_id}: "${w.name}" (${w.water_type})`));
      }
    } catch (error) {
      console.log(`${test.name}: ERROR - ${error.message}`);
    }
    console.log('');
  }
  
  // Kolla några specifika poster
  console.log('🎯 SLUMPMÄSSIGA POSTER:\n');
  const { data: randomWaters } = await supabase
    .from('water_bodies')
    .select('name, water_type, osm_id, tags')
    .range(100, 110);
  
  randomWaters.forEach((w, i) => {
    const nameDisplay = w.name === null ? 'NULL' : w.name === '' ? 'TOM STRÄNG' : `"${w.name}"`;
    console.log(`${i+1}. OSM ${w.osm_id}: ${nameDisplay} (${w.water_type})`);
    
    if (w.name === null || w.name === '') {
      const interestingTags = ['amenity', 'place', 'landuse', 'description', 'note'];
      const relevantTags = interestingTags.filter(tag => w.tags[tag]).map(tag => `${tag}=${w.tags[tag]}`);
      if (relevantTags.length > 0) {
        console.log(`   → Extra info: ${relevantTags.join(', ')}`);
      }
    }
  });
}

checkNullNames().catch(console.error); 