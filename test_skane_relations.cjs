// Importerar funktionerna från main script
const fs = require('fs');

// Läs in main script som string och eval:a för att få funktionerna
const mainScript = fs.readFileSync('clean_nordic_import.js', 'utf8');

// Extrahera bara funktionerna vi behöver
eval(mainScript.split('// MAIN EXECUTION')[0]);

async function testSkaneRelations() {
  console.log('🧪 TESTAR SKÅNE RELATIONS...\n');
  
  const skaneRegions = [
    { name: 'SE-Skåne-Sydväst', bbox: '55.3,12.5,55.8,13.3', country: 'Sweden' },
    { name: 'SE-Skåne-Sydöst', bbox: '55.3,13.3,55.8,14.4', country: 'Sweden' },
    { name: 'SE-Skåne-Central', bbox: '55.8,12.5,56.3,14.4', country: 'Sweden' },
    { name: 'SE-Skåne-Nord', bbox: '56.3,12.5,56.6,14.4', country: 'Sweden' }
  ];
  
  for (const region of skaneRegions) {
    console.log(`\n🗺️ ${region.name}`);
    
    try {
      const osmData = await fetchSmartWaterData(region.bbox);
      console.log(`📦 Fetched ${osmData.elements.length} elements`);
      
      const relationCount = osmData.elements.filter(e => e.type === 'relation').length;
      const wayCount = osmData.elements.filter(e => e.type === 'way').length;
      
      console.log(`  Relations: ${relationCount}, Ways: ${wayCount}`);
      
      if (relationCount > 0) {
        console.log('  Relations found:');
        osmData.elements.filter(e => e.type === 'relation').forEach(rel => {
          console.log(`    - ${rel.tags.name} (ID: ${rel.id})`);
        });
      }
      
      // Processa data
      const processedData = processSmartWaterData(osmData, region);
      console.log(`✅ Processed: ${processedData.length} quality waters`);
      
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    }
  }
}

testSkaneRelations(); 