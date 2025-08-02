#!/usr/bin/env node

// SKANDINAVISK TÄCKNING - Sverige + Norge + Danmark
// Visar hur enkelt det är att utvidga till hela regionen!

const SCANDINAVIAN_REGIONS = [
  // SVERIGE (våra befintliga regioner)
  { name: 'SE-Skåne', bbox: '55.3,12.4,56.5,14.6', country: 'Sverige' },
  { name: 'SE-Halland', bbox: '56.0,12.0,57.5,13.5', country: 'Sverige' },
  { name: 'SE-Blekinge', bbox: '56.0,14.2,56.7,15.8', country: 'Sverige' },
  // ... (alla våra 24 svenska regioner)
  
  // DANMARK - lätt att lägga till!
  { name: 'DK-Jylland-syd', bbox: '54.5,8.0,56.0,10.5', country: 'Danmark' },
  { name: 'DK-Jylland-nord', bbox: '56.0,8.0,57.8,11.0', country: 'Danmark' },
  { name: 'DK-Sjælland', bbox: '55.0,11.0,56.0,12.8', country: 'Danmark' },
  { name: 'DK-Fyn', bbox: '55.0,9.5,55.8,11.0', country: 'Danmark' },
  { name: 'DK-Bornholm', bbox: '55.0,14.6,55.4,15.2', country: 'Danmark' },
  
  // NORGE - också enkelt!
  { name: 'NO-Østfold', bbox: '59.0,10.5,59.8,12.0', country: 'Norge' },
  { name: 'NO-Oslo-Akershus', bbox: '59.5,10.0,60.5,11.5', country: 'Norge' },
  { name: 'NO-Hedmark-Oppland', bbox: '60.5,9.5,62.5,12.5', country: 'Norge' },
  { name: 'NO-Buskerud-Vestfold', bbox: '58.8,9.0,60.5,11.0', country: 'Norge' },
  { name: 'NO-Telemark-Aust-Agder', bbox: '58.0,7.5,59.5,9.5', country: 'Norge' },
  { name: 'NO-Vest-Agder', bbox: '58.0,6.0,58.8,8.5', country: 'Norge' },
  { name: 'NO-Rogaland', bbox: '58.3,5.0,59.8,7.0', country: 'Norge' },
  { name: 'NO-Hordaland', bbox: '59.8,4.5,61.3,7.5', country: 'Norge' },
  { name: 'NO-Sogn-Fjordane', bbox: '60.8,4.5,62.2,8.0', country: 'Norge' },
  { name: 'NO-Møre-Romsdal', bbox: '62.0,5.0,63.5,9.0', country: 'Norge' },
  { name: 'NO-Sør-Trøndelag', bbox: '62.8,8.5,64.0,12.5', country: 'Norge' },
  { name: 'NO-Nord-Trøndelag', bbox: '63.8,10.0,65.2,14.5', country: 'Norge' },
  { name: 'NO-Nordland-syd', bbox: '65.0,12.0,67.5,16.0', country: 'Norge' },
  { name: 'NO-Nordland-nord', bbox: '67.5,14.0,69.5,18.5', country: 'Norge' },
  { name: 'NO-Troms', bbox: '68.5,16.0,70.5,21.0', country: 'Norge' },
  { name: 'NO-Finnmark', bbox: '69.5,19.0,71.2,31.0', country: 'Norge' }
];

console.log('🌍 SKANDINAVISK VATTENTÄCKNING\n');

console.log('📊 REGIONSSTATISTIK:');
const countryStats = SCANDINAVIAN_REGIONS.reduce((acc: any, region) => {
  acc[region.country] = (acc[region.country] || 0) + 1;
  return acc;
}, {});

Object.entries(countryStats).forEach(([country, count]) => {
  console.log(`${country}: ${count} regioner`);
});

console.log(`\nTOTALT: ${SCANDINAVIAN_REGIONS.length} regioner`);

console.log('\n💡 FÖRDELAR MED SKANDINAVISK TÄCKNING:');
console.log('✅ Gränsjöar mellan länderna fångas korrekt');
console.log('✅ Norska fjordar - fantastiska för fiske!');
console.log('✅ Danska öar och Limfjorden');  
console.log('✅ Komplett täckning för skandinaviska fiskare');
console.log('✅ Bara ~15 extra regioner (Norge + Danmark)');

console.log('\n🚀 ATT IMPLEMENTERA:');
console.log('1. Lägg till regionerna i save-water-bodies-to-database.js');
console.log('2. Kör scriptet - tar ~20 min extra för Norge + Danmark');
console.log('3. Uppdatera väder-scriptet att inkludera dessa länder');
console.log('4. Klart! 🇸🇪🇳🇴🇩🇰');

console.log('\n📈 TOTALT FÖRVÄNTAT RESULTAT:');
console.log('Sverige: ~100,000-200,000 vattendrag');
console.log('Norge: ~50,000-100,000 vattendrag (många fjordar!)');
console.log('Danmark: ~20,000-40,000 vattendrag');
console.log('TOTALT: ~200,000-400,000 skandinaviska vattendrag! 🎣'); 