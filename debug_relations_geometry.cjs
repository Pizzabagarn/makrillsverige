const https = require('https');

async function debugRelationGeometry() {
  console.log('🔍 DEBUGGAR RELATION GEOMETRI FÖR VOMBSJÖN...\n');
  
  const query = `
[out:json][timeout:60];
(
  relation["natural"="water"]["name"~"Vomb"](55.3,12.5,56.6,14.4);
);
out geom;
`;

  try {
    const data = await new Promise((resolve, reject) => {
      const postData = query;
      const options = {
        hostname: 'overpass-api.de',
        port: 443,
        path: '/api/interpreter',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(options, (res) => {
        let rawData = '';
        res.on('data', (chunk) => { rawData += chunk; });
        res.on('end', () => {
          try {
            const parsedData = JSON.parse(rawData);
            resolve(parsedData);
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', (e) => {
        reject(e);
      });

      req.write(postData);
      req.end();
    });
    
    console.log(`Elements found: ${data.elements.length}`);
    
    data.elements.forEach(element => {
      console.log(`\n=== ${element.tags.name} ===`);
      console.log(`Type: ${element.type}`);
      console.log(`ID: ${element.id}`);
      console.log(`Has geometry: ${!!element.geometry}`);
      console.log(`Has members: ${!!element.members}`);
      
      if (element.members) {
        console.log(`Members count: ${element.members.length}`);
        element.members.forEach((member, i) => {
          if (i < 3) { // Bara första 3
            console.log(`  Member ${i}: role="${member.role}", type="${member.type}", hasGeometry=${!!member.geometry}`);
            if (member.geometry && member.geometry.length > 0) {
              console.log(`    First coord: ${member.geometry[0].lat}, ${member.geometry[0].lon}`);
            }
          }
        });
      }
      
      if (element.geometry) {
        console.log(`Direct geometry points: ${element.geometry.length}`);
        if (element.geometry.length > 0) {
          console.log(`  First point: ${element.geometry[0].lat}, ${element.geometry[0].lon}`);
        }
      }
    });
    
  } catch (error) {
    console.log(`❌ Fel: ${error.message}`);
  }
}

debugRelationGeometry(); 