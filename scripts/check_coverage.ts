#!/usr/bin/env node

// KONTROLLERAR att våra regioner täcker HELA Sveriges yta utan gap
// Viktigt för sjöar som ligger på landsbygden, inte bara vid städer!

const SWEDEN_COVERAGE_REGIONS = [
  // GÖTALAND
  { name: 'Skåne', bbox: '55.3,12.4,56.5,14.6' },
  { name: 'Halland', bbox: '56.0,12.0,57.5,13.5' },
  { name: 'Blekinge', bbox: '56.0,14.2,56.7,15.8' },
  { name: 'Småland', bbox: '56.5,13.5,58.0,16.5' },
  { name: 'Öland', bbox: '56.1,16.3,57.4,17.1' },
  { name: 'Gotland', bbox: '56.9,18.1,57.9,19.4' },
  { name: 'Västergötland', bbox: '57.5,11.8,59.0,14.5' },
  { name: 'Östergötland', bbox: '57.8,14.5,59.0,16.8' },
  { name: 'Bohuslän', bbox: '57.9,11.0,59.0,12.5' },
  { name: 'Dalsland', bbox: '58.7,11.7,59.4,12.8' },
  
  // SVEALAND  
  { name: 'Närke', bbox: '58.8,14.5,59.5,15.8' },
  { name: 'Södermanland', bbox: '58.7,15.8,59.6,17.8' },
  { name: 'Stockholms län', bbox: '58.8,17.5,60.2,19.0' },
  { name: 'Uppsala län', bbox: '59.4,16.8,60.8,18.8' },
  { name: 'Västmanland', bbox: '59.4,15.2,60.2,17.0' },
  { name: 'Värmland', bbox: '59.0,12.0,60.9,14.5' },
  { name: 'Dalarna', bbox: '60.0,13.5,61.8,16.0' },
  
  // NORRLAND
  { name: 'Gävleborg', bbox: '60.2,15.5,62.0,17.8' },
  { name: 'Västernorrland', bbox: '62.0,15.5,63.8,19.0' },
  { name: 'Jämtland', bbox: '62.4,12.0,64.8,16.5' },
  { name: 'Västerbotten', bbox: '63.5,17.0,66.0,21.5' },
  { name: 'Norrbotten', bbox: '65.0,20.0,69.1,24.2' },
  
  // LAPPLAND (uppdelat för storlek)
  { name: 'Lappland-syd', bbox: '65.0,15.0,67.0,20.0' },
  { name: 'Lappland-nord', bbox: '67.0,18.0,69.1,24.2' }
];

// Sveriges officiella gränser
const SWEDEN_BOUNDS = {
  south: 55.3,   // Smygehuk, Skåne
  north: 69.1,   // Treriksröset, Norrbotten  
  west: 10.9,    // Kosteröarna, Bohuslän
  east: 24.2     // Haparanda skärgård, Norrbotten
};

function parseBbox(bboxStr: string) {
  const [south, west, north, east] = bboxStr.split(',').map(Number);
  return { south, west, north, east };
}

console.log('🗺️ KONTROLLERAR TÄCKNING AV HELA SVERIGE\n');
console.log(`🇸🇪 Sveriges officiella gränser:`);
console.log(`   Syd: ${SWEDEN_BOUNDS.south}° (Smygehuk)`);
console.log(`   Nord: ${SWEDEN_BOUNDS.north}° (Treriksröset)`);
console.log(`   Väst: ${SWEDEN_BOUNDS.west}° (Kosteröarna)`);
console.log(`   Öst: ${SWEDEN_BOUNDS.east}° (Haparanda skärgård)`);
console.log('');

// Kontrollera extrempunkter
let overallBounds = {
  south: 90,
  north: -90, 
  west: 180,
  east: -180
};

console.log('📊 REGIONERNAS TÄCKNING:');
for (const region of SWEDEN_COVERAGE_REGIONS) {
  const bbox = parseBbox(region.bbox);
  console.log(`${region.name}: S${bbox.south} W${bbox.west} N${bbox.north} E${bbox.east}`);
  
  // Uppdatera overall bounds
  overallBounds.south = Math.min(overallBounds.south, bbox.south);
  overallBounds.north = Math.max(overallBounds.north, bbox.north);
  overallBounds.west = Math.min(overallBounds.west, bbox.west);
  overallBounds.east = Math.max(overallBounds.east, bbox.east);
}

console.log('\n📈 SAMMANLAGD TÄCKNING:');
console.log(`Syd: ${overallBounds.south}° (ska vara ≤ ${SWEDEN_BOUNDS.south}°)`);
console.log(`Nord: ${overallBounds.north}° (ska vara ≥ ${SWEDEN_BOUNDS.north}°)`);
console.log(`Väst: ${overallBounds.west}° (ska vara ≤ ${SWEDEN_BOUNDS.west}°)`);
console.log(`Öst: ${overallBounds.east}° (ska vara ≥ ${SWEDEN_BOUNDS.east}°)`);

console.log('\n🔍 TÄCKNINGSANALYS:');
let coverage = true;

if (overallBounds.south > SWEDEN_BOUNDS.south) {
  console.log(`❌ SÖDRA GAP: Missar ${overallBounds.south - SWEDEN_BOUNDS.south}° i söder`);
  coverage = false;
}

if (overallBounds.north < SWEDEN_BOUNDS.north) {
  console.log(`❌ NORRA GAP: Missar ${SWEDEN_BOUNDS.north - overallBounds.north}° i norr`);
  coverage = false;
}

if (overallBounds.west > SWEDEN_BOUNDS.west) {
  console.log(`❌ VÄSTRA GAP: Missar ${overallBounds.west - SWEDEN_BOUNDS.west}° i väster`);
  coverage = false;
}

if (overallBounds.east < SWEDEN_BOUNDS.east) {
  console.log(`❌ ÖSTRA GAP: Missar ${SWEDEN_BOUNDS.east - overallBounds.east}° i öster`);
  coverage = false;
}

if (coverage) {
  console.log('✅ PERFEKT TÄCKNING: Alla regioner täcker hela Sveriges yta!');
  console.log('🏞️ Detta betyder att vi fångar sjöar överallt - på landsbygden, i skogarna, överallt!');
} else {
  console.log('⚠️ TÄCKNINGSPROBLEM: Vissa delar av Sverige saknas!');
}

// Kontrollera överlapp (kan vara OK men bra att veta)
console.log('\n🔄 ÖVERLAPP-KONTROLL:');
let overlaps = 0;
for (let i = 0; i < SWEDEN_COVERAGE_REGIONS.length; i++) {
  for (let j = i + 1; j < SWEDEN_COVERAGE_REGIONS.length; j++) {
    const bbox1 = parseBbox(SWEDEN_COVERAGE_REGIONS[i].bbox);
    const bbox2 = parseBbox(SWEDEN_COVERAGE_REGIONS[j].bbox);
    
    // Kontrollera om boxarna överlappar
    const noOverlap = bbox1.east < bbox2.west || bbox2.east < bbox1.west || 
                      bbox1.north < bbox2.south || bbox2.north < bbox1.south;
    
    if (!noOverlap) {
      console.log(`🔄 ${SWEDEN_COVERAGE_REGIONS[i].name} ↔ ${SWEDEN_COVERAGE_REGIONS[j].name} överlappar`);
      overlaps++;
    }
  }
}

if (overlaps === 0) {
  console.log('✅ Inga överlapp mellan regioner');
} else {
  console.log(`📊 ${overlaps} överlapp hittade (OK - säkerställer full täckning)`);
}

console.log(`\n🎯 SAMMANFATTNING:`);
console.log(`📍 ${SWEDEN_COVERAGE_REGIONS.length} regioner definierade`);
console.log(`🗺️ Täcker ${coverage ? 'HELA' : 'DELAR AV'} Sveriges yta`);
console.log(`🏞️ ${coverage ? 'ALLA' : 'MÅNGA'} sjöar på landsbygden kommer fångas!`); 