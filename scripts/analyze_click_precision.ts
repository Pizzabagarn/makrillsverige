/**
 * ANALYS: Varför klick-precision blivit sämre på åar och bäckar
 */

console.log('🔍 ANALYS: KLICK-PRECISION PROBLEM\n');

console.log('📋 POTENTIELLA ORSAKER TILL SÄMRE PRECISION:\n');

console.log('1. 🎯 FÖRBERÄKNADE CENTROIDER (center_lat, center_lon)');
console.log('   Problem: Materialized view använder ST_PointOnSurface(geometry)');
console.log('   • För sjöar: Funkar bra (punkt i mitten av sjön)');
console.log('   • För åar/bäckar: Centroiden kan vara långt från där du klickar');
console.log('   • En lång å kan ha centroiden mitt i ån, men du klickar vid kanten');
console.log('   Resultat: Mindre precision för smala vattendrag\n');

console.log('2. 🗂️ BOUNDING BOX FILTRERING FÖRST');
console.log('   Problem: center_lat/center_lon används för första filtreringen');
console.log('   • Gamla systemet: Använde lat/lon från faktiska geometri-punkter');
console.log('   • Nya systemet: Använder beräknade centroider');
console.log('   • För långa åar: Centroiden kanske inte är nära klick-punkten');
console.log('   Resultat: Åar kan missas i första filtreringen\n');

console.log('3. 🎲 PRIORITERING AV STORA VATTENDRAG');
console.log('   Problem: Sortering prioriterar area_km2 DESC');
console.log('   • Stora sjöar får högre prioritet än små bäckar');
console.log('   • Om du klickar nära både sjö och bäck → sjön väljs');
console.log('   • Gamla systemet hade kanske annan prioritering');
console.log('   Resultat: Små åar/bäckar "förlorar" mot större vattendrag\n');

console.log('4. 🔍 ST_Contains VS PROXIMITY');
console.log('   Problem: ST_Contains kräver exakt träff INOM geometrin');
console.log('   • För sjöar: Lätt att klicka "inuti" sjön');
console.log('   • För smala åar: Svårt att klicka exakt på ån (pixelbredd)');
console.log('   • Gamla systemet: Hade kanske mer tolerant proximity-sökning');
console.log('   Resultat: Åar kräver mer exakt klick\n');

console.log('5. 📊 MATERIALIZED VIEW OPTIMERING');
console.log('   Problem: Optimerad för prestanda, inte precision');
console.log('   • Förberäknade värden kan vara mindre exakta');
console.log('   • Index optimerade för snabbhet, inte precision');
console.log('   • Geometry-index kanske inte lika bra för smala former');
console.log('   Resultat: Trade-off mellan hastighet och precision\n');

console.log('📋 SPECIFIKA SKILLNADER:\n');

console.log('GAMLA SYSTEMET (mer precist):');
console.log('   • Använde faktiska lat/lon från geometri-punkter');
console.log('   • Proximity-baserad sökning med tolerans');
console.log('   • Kanske mindre optimerad prioritering');
console.log('   • Direktaccess till original geometri\n');

console.log('NYA SYSTEMET (snabbare men mindre precist):');
console.log('   • Använder förberäknade centroider (center_lat/center_lon)');
console.log('   • ST_Contains kräver exakt träff');
console.log('   • Stark prioritering av stora vattendrag');
console.log('   • Materialized view med optimeringar\n');

console.log('🎯 SLUTSATS:');
console.log('   Klick-precisionen har blivit sämre för åar/bäckar eftersom:');
console.log('   1. Centroider används istället för faktiska geometri-punkter');
console.log('   2. ST_Contains är mindre tolerant än proximity-sökning');
console.log('   3. Prioritering gynnar stora vattendrag över små');
console.log('   4. Prestanda-optimeringar påverkar precision negativt\n');

console.log('💡 MÖJLIGA LÖSNINGAR (utan att ändra):');
console.log('   1. Öka tolerans för proximity-sökning på åar/bäckar');
console.log('   2. Använd ST_DWithin istället för ST_Contains för smala vattendrag');
console.log('   3. Justera prioritering för att gynna närhet över storlek');
console.log('   4. Fallback till original geometri-sökning för små vattendrag');

export {};
 * ANALYS: Varför klick-precision blivit sämre på åar och bäckar
 */

console.log('🔍 ANALYS: KLICK-PRECISION PROBLEM\n');

console.log('📋 POTENTIELLA ORSAKER TILL SÄMRE PRECISION:\n');

console.log('1. 🎯 FÖRBERÄKNADE CENTROIDER (center_lat, center_lon)');
console.log('   Problem: Materialized view använder ST_PointOnSurface(geometry)');
console.log('   • För sjöar: Funkar bra (punkt i mitten av sjön)');
console.log('   • För åar/bäckar: Centroiden kan vara långt från där du klickar');
console.log('   • En lång å kan ha centroiden mitt i ån, men du klickar vid kanten');
console.log('   Resultat: Mindre precision för smala vattendrag\n');

console.log('2. 🗂️ BOUNDING BOX FILTRERING FÖRST');
console.log('   Problem: center_lat/center_lon används för första filtreringen');
console.log('   • Gamla systemet: Använde lat/lon från faktiska geometri-punkter');
console.log('   • Nya systemet: Använder beräknade centroider');
console.log('   • För långa åar: Centroiden kanske inte är nära klick-punkten');
console.log('   Resultat: Åar kan missas i första filtreringen\n');

console.log('3. 🎲 PRIORITERING AV STORA VATTENDRAG');
console.log('   Problem: Sortering prioriterar area_km2 DESC');
console.log('   • Stora sjöar får högre prioritet än små bäckar');
console.log('   • Om du klickar nära både sjö och bäck → sjön väljs');
console.log('   • Gamla systemet hade kanske annan prioritering');
console.log('   Resultat: Små åar/bäckar "förlorar" mot större vattendrag\n');

console.log('4. 🔍 ST_Contains VS PROXIMITY');
console.log('   Problem: ST_Contains kräver exakt träff INOM geometrin');
console.log('   • För sjöar: Lätt att klicka "inuti" sjön');
console.log('   • För smala åar: Svårt att klicka exakt på ån (pixelbredd)');
console.log('   • Gamla systemet: Hade kanske mer tolerant proximity-sökning');
console.log('   Resultat: Åar kräver mer exakt klick\n');

console.log('5. 📊 MATERIALIZED VIEW OPTIMERING');
console.log('   Problem: Optimerad för prestanda, inte precision');
console.log('   • Förberäknade värden kan vara mindre exakta');
console.log('   • Index optimerade för snabbhet, inte precision');
console.log('   • Geometry-index kanske inte lika bra för smala former');
console.log('   Resultat: Trade-off mellan hastighet och precision\n');

console.log('📋 SPECIFIKA SKILLNADER:\n');

console.log('GAMLA SYSTEMET (mer precist):');
console.log('   • Använde faktiska lat/lon från geometri-punkter');
console.log('   • Proximity-baserad sökning med tolerans');
console.log('   • Kanske mindre optimerad prioritering');
console.log('   • Direktaccess till original geometri\n');

console.log('NYA SYSTEMET (snabbare men mindre precist):');
console.log('   • Använder förberäknade centroider (center_lat/center_lon)');
console.log('   • ST_Contains kräver exakt träff');
console.log('   • Stark prioritering av stora vattendrag');
console.log('   • Materialized view med optimeringar\n');

console.log('🎯 SLUTSATS:');
console.log('   Klick-precisionen har blivit sämre för åar/bäckar eftersom:');
console.log('   1. Centroider används istället för faktiska geometri-punkter');
console.log('   2. ST_Contains är mindre tolerant än proximity-sökning');
console.log('   3. Prioritering gynnar stora vattendrag över små');
console.log('   4. Prestanda-optimeringar påverkar precision negativt\n');

console.log('💡 MÖJLIGA LÖSNINGAR (utan att ändra):');
console.log('   1. Öka tolerans för proximity-sökning på åar/bäckar');
console.log('   2. Använd ST_DWithin istället för ST_Contains för smala vattendrag');
console.log('   3. Justera prioritering för att gynna närhet över storlek');
console.log('   4. Fallback till original geometri-sökning för små vattendrag');

export {};