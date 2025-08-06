import { createClient } from '@supabase/supabase-js';
import { getWaterBodyWithPlacesAtCoordinates } from '../src/lib/waterBodiesWithPlacesService';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function testHybridClick() {
  console.log('🧪 TESTAR HYBRID KLICK-PRECISION\n');

  // Test 1: Klick på stor sjö (ska använda centroid-optimering)
  console.log('1. 🏞️ STOR SJÖ (Vänern) - ska vara snabb');
  const lake = await getWaterBodyWithPlacesAtCoordinates(58.9, 13.1, 2);
  console.log(`   Resultat: ${lake ? lake.name + ' (' + lake.water_type + ')' : 'Ingen träff'}\n`);

  // Test 2: Klick på å (ska använda exakt geometri)
  console.log('2. 🌊 Å/FLOD - ska ha bättre precision nu');
  const river = await getWaterBodyWithPlacesAtCoordinates(59.3, 18.0, 1);
  console.log(`   Resultat: ${river ? river.name + ' (' + river.water_type + ')' : 'Ingen träff'}\n`);

  // Test 3: Klick på bäck (ska använda exakt geometri)
  console.log('3. 🏞️ BÄCK/STREAM - ska ha mycket bättre precision');
  const stream = await getWaterBodyWithPlacesAtCoordinates(60.1, 16.5, 1);
  console.log(`   Resultat: ${stream ? stream.name + ' (' + stream.water_type + ')' : 'Ingen träff'}\n`);

  console.log('✅ Hybrid-test klart! Sjöar ska vara lika snabba, åar/bäckar mer precisa.');
}

testHybridClick().catch(console.error);
import { getWaterBodyWithPlacesAtCoordinates } from '../src/lib/waterBodiesWithPlacesService';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function testHybridClick() {
  console.log('🧪 TESTAR HYBRID KLICK-PRECISION\n');

  // Test 1: Klick på stor sjö (ska använda centroid-optimering)
  console.log('1. 🏞️ STOR SJÖ (Vänern) - ska vara snabb');
  const lake = await getWaterBodyWithPlacesAtCoordinates(58.9, 13.1, 2);
  console.log(`   Resultat: ${lake ? lake.name + ' (' + lake.water_type + ')' : 'Ingen träff'}\n`);

  // Test 2: Klick på å (ska använda exakt geometri)
  console.log('2. 🌊 Å/FLOD - ska ha bättre precision nu');
  const river = await getWaterBodyWithPlacesAtCoordinates(59.3, 18.0, 1);
  console.log(`   Resultat: ${river ? river.name + ' (' + river.water_type + ')' : 'Ingen träff'}\n`);

  // Test 3: Klick på bäck (ska använda exakt geometri)
  console.log('3. 🏞️ BÄCK/STREAM - ska ha mycket bättre precision');
  const stream = await getWaterBodyWithPlacesAtCoordinates(60.1, 16.5, 1);
  console.log(`   Resultat: ${stream ? stream.name + ' (' + stream.water_type + ')' : 'Ingen träff'}\n`);

  console.log('✅ Hybrid-test klart! Sjöar ska vara lika snabba, åar/bäckar mer precisa.');
}

testHybridClick().catch(console.error);