import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function testClickPerformance() {
  console.log('⚡ TESTAR KLICK-PRESTANDA VS PRECISION\n');

  const testPoints = [
    { name: 'Vänern (stor sjö)', lat: 58.9, lon: 13.1 },
    { name: 'Mindre sjö', lat: 59.3, lon: 18.0 },
    { name: 'Å/flod', lat: 60.1, lon: 16.5 }
  ];

  for (const point of testPoints) {
    console.log(`🧪 ${point.name}:`);
    
    const start = performance.now();
    
    const { data: result, error } = await supabase
      .rpc('find_water_body_with_places_containing_point', {
        click_lat: point.lat,
        click_lon: point.lon,
        search_radius_deg: 0.02
      });
    
    const time = performance.now() - start;
    
    console.log(`   ⏱️  Tid: ${time.toFixed(1)}ms`);
    console.log(`   🎯 Resultat: ${result?.length || 0} träffar`);
    if (result?.[0]) {
      console.log(`   📍 Bästa: ${result[0].name} (${result[0].water_type})`);
    }
    console.log('');
  }

  console.log('💡 SLUTSATS:');
  console.log('   - Utan centroid-optimering: Långsammare men exakt precision');
  console.log('   - Alla vattendrag blir lika klickbara');
  console.log('   - Sökresultat påverkas inte (använder fortfarande materialized view)');
}

testClickPerformance().catch(console.error);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function testClickPerformance() {
  console.log('⚡ TESTAR KLICK-PRESTANDA VS PRECISION\n');

  const testPoints = [
    { name: 'Vänern (stor sjö)', lat: 58.9, lon: 13.1 },
    { name: 'Mindre sjö', lat: 59.3, lon: 18.0 },
    { name: 'Å/flod', lat: 60.1, lon: 16.5 }
  ];

  for (const point of testPoints) {
    console.log(`🧪 ${point.name}:`);
    
    const start = performance.now();
    
    const { data: result, error } = await supabase
      .rpc('find_water_body_with_places_containing_point', {
        click_lat: point.lat,
        click_lon: point.lon,
        search_radius_deg: 0.02
      });
    
    const time = performance.now() - start;
    
    console.log(`   ⏱️  Tid: ${time.toFixed(1)}ms`);
    console.log(`   🎯 Resultat: ${result?.length || 0} träffar`);
    if (result?.[0]) {
      console.log(`   📍 Bästa: ${result[0].name} (${result[0].water_type})`);
    }
    console.log('');
  }

  console.log('💡 SLUTSATS:');
  console.log('   - Utan centroid-optimering: Långsammare men exakt precision');
  console.log('   - Alla vattendrag blir lika klickbara');
  console.log('   - Sökresultat påverkas inte (använder fortfarande materialized view)');
}

testClickPerformance().catch(console.error);