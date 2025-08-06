import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function analyzeWaterwaySegments() {
  console.log('🔍 ANALYS: Vattendrag-segment som kan slås ihop\n');

  // 1. Kolla hur många segment olika vattendrag har
  console.log('📊 VATTENDRAG MED FLEST SEGMENT:');
  const { data: segments } = await supabase
    .from('water_bodies_with_places_fast_lookup')
    .select('name, water_type, count(*)')
    .in('water_type', ['river', 'stream'])
    .not('name', 'is', null)
    .group('name, water_type')
    .order('count', { ascending: false })
    .limit(20);

  segments?.forEach(s => {
    console.log(`   ${s.name} (${s.water_type}): ${s.count} segment`);
  });

  console.log('\n📍 EXEMPEL: Höje å segment:');
  const { data: hojeSegments } = await supabase
    .from('water_bodies_with_places_fast_lookup')
    .select('name, municipality, lat, lon, area_km2')
    .ilike('name', '%höje%')
    .eq('water_type', 'river')
    .order('municipality');

  hojeSegments?.forEach(s => {
    console.log(`   ${s.name} i ${s.municipality}: ${s.lat?.toFixed(3)}, ${s.lon?.toFixed(3)} (${s.area_km2} km²)`);
  });

  console.log('\n🎯 SAMMANSLAGNINGS-STRATEGI:');
  console.log('1. Gruppera per namn + vattentyp');
  console.log('2. Beräkna avstånd mellan segment');
  console.log('3. Segment inom 5km = samma vattendrag');
  console.log('4. Skapa grupper: "Vattennamn (Kommun)"');
  console.log('5. Slå ihop geometrier med ST_Collect');
  
  console.log('\n💡 FÖRDELAR:');
  console.log('✅ Mindre segment att klicka på');
  console.log('✅ Tydligare namngivning per område');
  console.log('✅ Lättare att hitta rätt vattendrag');
  console.log('✅ Behåller precision för olika sektioner');
}

analyzeWaterwaySegments().catch(console.error);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function analyzeWaterwaySegments() {
  console.log('🔍 ANALYS: Vattendrag-segment som kan slås ihop\n');

  // 1. Kolla hur många segment olika vattendrag har
  console.log('📊 VATTENDRAG MED FLEST SEGMENT:');
  const { data: segments } = await supabase
    .from('water_bodies_with_places_fast_lookup')
    .select('name, water_type, count(*)')
    .in('water_type', ['river', 'stream'])
    .not('name', 'is', null)
    .group('name, water_type')
    .order('count', { ascending: false })
    .limit(20);

  segments?.forEach(s => {
    console.log(`   ${s.name} (${s.water_type}): ${s.count} segment`);
  });

  console.log('\n📍 EXEMPEL: Höje å segment:');
  const { data: hojeSegments } = await supabase
    .from('water_bodies_with_places_fast_lookup')
    .select('name, municipality, lat, lon, area_km2')
    .ilike('name', '%höje%')
    .eq('water_type', 'river')
    .order('municipality');

  hojeSegments?.forEach(s => {
    console.log(`   ${s.name} i ${s.municipality}: ${s.lat?.toFixed(3)}, ${s.lon?.toFixed(3)} (${s.area_km2} km²)`);
  });

  console.log('\n🎯 SAMMANSLAGNINGS-STRATEGI:');
  console.log('1. Gruppera per namn + vattentyp');
  console.log('2. Beräkna avstånd mellan segment');
  console.log('3. Segment inom 5km = samma vattendrag');
  console.log('4. Skapa grupper: "Vattennamn (Kommun)"');
  console.log('5. Slå ihop geometrier med ST_Collect');
  
  console.log('\n💡 FÖRDELAR:');
  console.log('✅ Mindre segment att klicka på');
  console.log('✅ Tydligare namngivning per område');
  console.log('✅ Lättare att hitta rätt vattendrag');
  console.log('✅ Behåller precision för olika sektioner');
}

analyzeWaterwaySegments().catch(console.error);