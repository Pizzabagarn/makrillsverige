const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');

async function monitorProgress() {
  console.log('🔍 MONITORING WEATHER SCRIPT PROGRESS...\n');
  
  setInterval(async () => {
    const timestamp = new Date().toLocaleTimeString('sv-SE');
    console.log(`\n📊 ${timestamp} - WEATHER SCRIPT STATUS:`);
    
    try {
      // Check weather data file
      const weatherFile = 'public/data/weather_data.json';
      if (fs.existsSync(weatherFile)) {
        const stats = fs.statSync(weatherFile);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(1);
        const lastModified = stats.mtime.toLocaleTimeString('sv-SE');
        console.log(`  📁 weather_data.json: ${sizeMB} MB (senast ändrad: ${lastModified})`);
        
        // Check if file is growing
        if (!global.lastSize) global.lastSize = stats.size;
        const growth = stats.size - global.lastSize;
        if (growth > 0) {
          console.log(`  📈 Växer: +${(growth / (1024 * 1024)).toFixed(2)} MB sedan senaste check`);
        } else {
          console.log(`  ⏸️  Ingen tillväxt sedan senaste check`);
        }
        global.lastSize = stats.size;
      } else {
        console.log(`  ❌ weather_data.json finns inte än`);
      }
      
      // Check node processes
      exec('tasklist | findstr node', (error, stdout) => {
        if (!error && stdout) {
          const processes = stdout.split('\n').filter(line => line.includes('node.exe')).length;
          console.log(`  🔄 Aktiva node-processer: ${processes}`);
        }
      });
      
      // Check if any temp files exist
      const publicData = 'public/data/';
      if (fs.existsSync(publicData)) {
        const files = fs.readdirSync(publicData);
        const weatherFiles = files.filter(f => f.includes('weather') || f.includes('temp'));
        if (weatherFiles.length > 1) {
          console.log(`  📂 Andra väderfiler: ${weatherFiles.join(', ')}`);
        }
      }
      
    } catch (err) {
      console.log(`  ❌ Error: ${err.message}`);
    }
    
    console.log('  ⏳ Väntar 10 sekunder till nästa uppdatering...');
  }, 10000);
}

console.log('🚀 Startar progress-monitoring för väderscriptet...');
console.log('💡 Tryck Ctrl+C för att stoppa monitoring\n');

monitorProgress(); 