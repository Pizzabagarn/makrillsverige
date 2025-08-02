#!/usr/bin/env node

// SNABB TEST: Finns det NÅGON data i Skåne?

async function quickSkaneTest() {
  console.log('⚡ SNABB SKÅNE-TEST\n');
  
  // Enkel query för bara några få vattendrag i Skåne
  const simpleQuery = `
[out:json][timeout:60];
(
  way["natural"="water"](55.3,12.4,56.5,14.6);
  way["water"="lake"](55.3,12.4,56.5,14.6);
);
out geom 10;
`;
  
  try {
    console.log('🔄 Testar Overpass API för Skåne...');
    
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: simpleQuery,
      signal: AbortSignal.timeout(60000) // 60s timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`✅ Svar: ${data.elements?.length || 0} elements`);
    
    if (data.elements && data.elements.length > 0) {
      console.log('\n📍 EXEMPEL från Skåne:');
      data.elements.slice(0, 5).forEach(element => {
        const name = element.tags?.name || 'unnamed';
        const type = element.tags?.natural || element.tags?.water || 'unknown';
        const firstCoord = element.geometry?.[0];
        if (firstCoord) {
          console.log(`  ${name} (${type}) - ${firstCoord.lat.toFixed(4)}, ${firstCoord.lon.toFixed(4)}`);
        }
      });
      
      console.log('\n🎉 SKÅNE HAR DATA I OPENSTREETMAP!');
      console.log('❓ Problem måste vara i vår import-process...');
    } else {
      console.log('\n❌ INGET i Skåne från OpenStreetMap');
      console.log('🤔 Antingen finns det verkligen inga vattendrag, eller fel bbox');
    }
    
  } catch (error) {
    console.error('❌ Fel:', error.message);
  }
}

quickSkaneTest(); 