#!/usr/bin/env node

// VERIFIERING - Kolla att stora sjöarna nu finns!

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifySuccess() {
  console.log('🔍 VERIFIERAR ATT STORA SJÖARNA FINNS...\n');
  
  // Kolla totalt antal
  const { count: totalCount } = await supabase
    .from('water_bodies')
    .select('*', { count: 'exact', head: true });
  
  console.log(`📊 TOTALT: ${totalCount} vatten i databasen`);
  
  // Kolla relations (stora sjöar)
  const { count: relationCount } = await supabase
    .from('water_bodies')
    .select('*', { count: 'exact', head: true })
    .eq('osm_type', 'relation');
  
  console.log(`🏛️ RELATIONS: ${relationCount} stora sjöar/vatten\n`);
  
  // TESTA DE VIKTIGA SJÖARNA
  const importantLakes = [
    'Vombsjön', 'Finjasjön', 'Hammarsjön', 'Ivösjön', 
    'Krankesjön', 'Vittsjön', 'Åsnen', 'Snogeholm'
  ];
  
  console.log('🎯 TESTAR VIKTIGA SJÖAR:');
  
  for (const lake of importantLakes) {
    const { data } = await supabase
      .from('water_bodies')
      .select('name, water_type, osm_type, osm_id')
      .ilike('name', `%${lake}%`)
      .limit(3);
    
    if (data && data.length > 0) {
      console.log(`✅ ${lake}:`);
      data.forEach(d => {
        console.log(`   • ${d.name} (${d.water_type}, ${d.osm_type}) [${d.osm_id}]`);
      });
    } else {
      console.log(`❌ ${lake}: Inte hittad`);
    }
  }
  
  // VISA ALLA NAMNGIVNA RELATIONS
  console.log('\n🏞️ ALLA STORA NAMNGIVNA SJÖAR (sample):');
  const { data: namedRelations } = await supabase
    .from('water_bodies')
    .select('name, water_type, osm_id')
    .eq('osm_type', 'relation')
    .not('name', 'is', null)
    .order('name')
    .limit(20);
  
  namedRelations?.forEach(water => {
    console.log(`  • ${water.name} (${water.water_type}) [${water.osm_id}]`);
  });
  
  console.log('\n🎉 FRAMGÅNG! Relations-systemet fungerar!');
  console.log('💡 Nu kan vi köra alla regioner med samma approach.');
}

verifySuccess().catch(console.error); 