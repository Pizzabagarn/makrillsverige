#!/usr/bin/env node

// VERIFIERAR att våra bounding boxes stämmer för svenska landskap
// Kontrollerar mot kända städer i varje landskap

const SWEDEN_REGIONS = [
  // GÖTALAND
  { name: 'Skåne', bbox: '55.3,12.4,56.5,14.6' },
  { name: 'Halland', bbox: '56.0,12.0,57.5,13.5' },
  { name: 'Blekinge', bbox: '56.0,14.2,56.7,15.8' },
  { name: 'Småland', bbox: '56.5,13.5,58.0,16.5' },
  { name: 'Öland', bbox: '56.1,16.3,57.4,17.1' },
  { name: 'Gotland', bbox: '56.9,18.1,57.9,19.4' },
  { name: 'Västergötland', bbox: '57.5,12.0,59.0,14.5' },
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

// Kända städer i varje landskap för verifiering
const KNOWN_CITIES = {
  'Skåne': [
    { name: 'Malmö', lat: 55.6050, lon: 13.0038 },
    { name: 'Lund', lat: 55.7058, lon: 13.1932 },
    { name: 'Helsingborg', lat: 56.0421, lon: 12.6945 }
  ],
  'Halland': [
    { name: 'Halmstad', lat: 56.6740, lon: 12.8571 },
    { name: 'Varberg', lat: 57.1057, lon: 12.2504 }
  ],
  'Blekinge': [
    { name: 'Karlskrona', lat: 56.1612, lon: 15.5869 },
    { name: 'Ronneby', lat: 56.2112, lon: 15.2776 }
  ],
  'Småland': [
    { name: 'Växjö', lat: 56.8777, lon: 14.8091 },
    { name: 'Kalmar', lat: 56.6634, lon: 16.3567 },
    { name: 'Jönköping', lat: 57.7815, lon: 14.1562 }
  ],
  'Västergötland': [
    { name: 'Göteborg', lat: 57.7089, lon: 11.9746 },
    { name: 'Borås', lat: 57.7210, lon: 12.9401 },
    { name: 'Skövde', lat: 58.3912, lon: 13.8453 }
  ],
  'Östergötland': [
    { name: 'Linköping', lat: 58.4108, lon: 15.6214 },
    { name: 'Norrköping', lat: 58.5877, lon: 16.1924 }
  ],
  'Stockholms län': [
    { name: 'Stockholm', lat: 59.3293, lon: 18.0686 },
    { name: 'Södertälje', lat: 59.1955, lon: 17.6253 }
  ],
  'Värmland': [
    { name: 'Karlstad', lat: 59.3793, lon: 13.5036 },
    { name: 'Arvika', lat: 59.6556, lon: 12.5859 }
  ],
  'Dalarna': [
    { name: 'Falun', lat: 60.6089, lon: 15.6254 },
    { name: 'Borlänge', lat: 60.4858, lon: 15.4362 },
    { name: 'Mora', lat: 61.0058, lon: 14.5420 }
  ]
};

function parseBbox(bboxStr: string) {
  const [south, west, north, east] = bboxStr.split(',').map(Number);
  return { south, west, north, east };
}

function isPointInBbox(lat: number, lon: number, bbox: any) {
  return lat >= bbox.south && lat <= bbox.north && 
         lon >= bbox.west && lon <= bbox.east;
}

console.log('🔍 VERIFIERAR SVENSKA LANDSKAP BOUNDING BOXES\n');

let errors = 0;

for (const region of SWEDEN_REGIONS) {
  console.log(`📍 ${region.name}:`);
  const bbox = parseBbox(region.bbox);
  console.log(`   Bbox: S${bbox.south} W${bbox.west} N${bbox.north} E${bbox.east}`);
  
  const cities = (KNOWN_CITIES as any)[region.name];
  if (!cities) {
    console.log(`   ⚠️  Inga teststäder för ${region.name} - kan inte verifiera`);
    continue;
  }
  
  let allCitiesInside = true;
  for (const city of cities) {
    const inside = isPointInBbox(city.lat, city.lon, bbox);
    if (inside) {
      console.log(`   ✅ ${city.name} (${city.lat}, ${city.lon}) är inuti`);
    } else {
      console.log(`   ❌ ${city.name} (${city.lat}, ${city.lon}) är UTANFÖR!`);
      allCitiesInside = false;
      errors++;
    }
  }
  
  if (!allCitiesInside) {
    console.log(`   🚨 FELAKTIG BBOX för ${region.name}!`);
  }
  console.log('');
}

if (errors > 0) {
  console.log(`\n🚨 ${errors} FEL HITTADE! Bbox-koordinater behöver fixas.`);
  console.log('💡 Förslag: Använd större/bredare koordinater för problemregioner.');
} else {
  console.log('\n✅ Alla bounding boxes verkar korrekta!');
}

console.log('\n🗺️ TOTALT: ' + SWEDEN_REGIONS.length + ' regioner kontrollerade'); 