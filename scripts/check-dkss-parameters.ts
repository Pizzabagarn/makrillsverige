import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env.local') });

const API_KEY = process.env.DMI_API_KEY;
if (!API_KEY) throw new Error('DMI_API_KEY saknas i .env.local');

// 🔍 Kolla parametrar för dkss_idw
async function checkDKSSParameters() {
  console.log('🔍 Kollar parametrar för dkss_idw...');
  
  const url = `https://dmigw.govcloud.dk/v1/forecastedr/collections/dkss_idw?api-key=${API_KEY}`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`❌ Fel: ${res.status} - ${res.statusText}`);
      return;
    }
    
    const data = await res.json() as any;
    
    console.log(`📋 Collection: ${data.id}`);
    console.log(`📝 Titel: ${data.title}`);
    console.log(`🌍 Område: ${JSON.stringify(data.extent?.spatial?.bbox)}`);
    
    if (data.parameter_names?.length > 0) {
      console.log(`\n📊 Tillgängliga parametrar (${data.parameter_names.length}):`);
      data.parameter_names.forEach((param: string, i: number) => {
        console.log(`  ${i + 1}. ${param}`);
      });
      
      // Kolla vilka av våra önskade parametrar som finns
      const desiredParams = ['current-u', 'current-v', 'water-temperature', 'salinity', 'seaLevel'];
      console.log('\n🎯 Status för önskade parametrar:');
      desiredParams.forEach(param => {
        const exists = data.parameter_names.includes(param);
        console.log(`  ${exists ? '✅' : '❌'} ${param}`);
      });
    } else {
      console.log('❌ Inga parametrar hittades');
    }
    
  } catch (error) {
    console.error('❌ Fel vid hämtning:', error);
  }
}

checkDKSSParameters(); 