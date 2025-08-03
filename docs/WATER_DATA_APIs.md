# 🌊 Svenska Vattendrags-API:er - Komplett Guide

En omfattande guide för att hämta all tillgänglig data om svenska vattendrag för fiskeapplikationer.

## 📋 Innehållsförteckning

- [Översikt](#översikt)
- [VISS - Vatteninformationssystem Sverige](#viss)
- [SMHI - Sveriges meteorologiska och hydrologiska institut](#smhi)
- [SvenskaFiskekartan & Fiskeregler](#fiskdata)
- [Användning](#användning)
- [API-endpoints](#api-endpoints)
- [Dataformat](#dataformat)
- [Exempel](#exempel)
- [Begränsningar](#begränsningar)
- [Felsökning](#felsökning)

---

## 🎯 Översikt

Detta system kombinerar data från tre huvudkällor för att ge komplett information om svenska vattendrag:

| Datakälla | Typ | Kostnad | Uppdateringsfrekvens | Användning |
|-----------|-----|---------|---------------------|------------|
| **VISS** | Vattenkvalitet & Miljöstatus | Gratis | Var 6:e år (förvaltningscykler) | Långsiktig vattenkvalitet |
| **SMHI** | Väder & Hydrologisk data | Gratis | Daglig | Realtidsförhållanden |
| **SvenskaFiskekartan** | Fiskarter & Regleringar | Gratis | Varierar | Fiskeinformation |

---

## 🌊 VISS - Vatteninformationssystem Sverige

### Bakgrund
VISS är Sveriges officiella system för rapportering enligt EU:s ramdirektiv för vatten. Drivs av Länsstyrelserna, Havs- och vattenmyndigheten och Vattenmyndigheterna.

### Teknisk Implementation
- **Teknik:** ArcGIS REST Services
- **Bas-URL:** `https://ext-geodata-applikationer.lansstyrelsen.se/arcgis/rest/services`
- **Autentisering:** Ingen (öppna tjänster)
- **Format:** JSON
- **Koordinatsystem:** SWEREF99 (konverteras till WGS84)

### Tillgängliga Tjänster

#### 🗺️ Vattenförekomster
```
VISS/lst_viss_api/MapServer/
├── Layer 55: Vattendrag
├── Layer 56: Sjöar  
├── Layer 57: Kustvatten
└── Layer 58: Grundvatten
```

#### 🧪 Fysikalisk-kemisk Status (2017-2021)
```
VISS/lst_viss_status_fys_kem_2017_2021/MapServer/
├── Layer 87: Syrgasförhållanden (sjöar)
├── Layer 78: Näringsämnen (sjöar)
├── Layer 85: Ljusförhållanden (sjöar)
├── Layer 83: Försurning (sjöar)
└── [53 layers totalt]
```

#### 🐟 Biologisk Status (2017-2021)
```
VISS/lst_viss_status_biologi_2017_2021/MapServer/
├── Layer 72: Fisk (sjöar)
├── Layer 71: Fisk (vattendrag)
├── Layer 21: Fisk i sjöar (EQR8)
└── [många fler layers]
```

### Viktiga Parametrar

#### Vattenkvalitetsparametrar
| Parameter | VISS-fält | Värden | Betydelse |
|-----------|-----------|--------|-----------|
| **Syrgasförhållanden** | `OXYGEN_CON` | H/G/M/B/P | Syrets tillgänglighet |
| **Näringsämnen** | `NUTRIENTS` | H/G/M/B/P | Övergödningsrisk |
| **Klorofyll** | `CHLOROPH` | H/G/M/B/P | Algförekomst |
| **pH/Försurning** | `ACID_NEUT` | H/G/M/B/P | Surhetsnivå |
| **Ljusförhållanden** | `TRANSP` | H/G/M/B/P | Siktdjup/klarhet |

#### Statuskoder
- **H** = Hög/Bra
- **G** = God  
- **M** = Måttlig
- **B** = Bra
- **P** = Dålig/Risk

#### Fiskparametrar
| Parameter | Fält | Beskrivning |
|-----------|------|-------------|
| **Fisksamhälle** | `FISH` | Övergripande fiskstatus |
| **EQR8** | `FISH_EQR8` | Ekologisk kvalitetskvot |
| **AindexW3** | `FISK_AINDW3` | Artdiversitetsindex |
| **AindexW5** | `FISK_AINDW5` | Artdiversitetsindex |

### Exempel API-anrop

#### Hitta vattenförekomst
```javascript
const url = `https://ext-geodata-applikationer.lansstyrelsen.se/arcgis/rest/services/VISS/lst_viss_api/MapServer/56/query`;
const params = new URLSearchParams({
  'where': "UPPER(SJONAMN) LIKE UPPER('%Vombsjön%')",
  'f': 'json',
  'maxRecordCount': '5',
  'outFields': '*',
  'returnGeometry': 'true'
});

const response = await fetch(`${url}?${params}`);
const data = await response.json();
```

#### Hämta vattenkvalitet
```javascript
const euCode = 'SE617666-135851'; // Vombsjöns EU-kod
const url = `https://ext-geodata-applikationer.lansstyrelsen.se/arcgis/rest/services/VISS/lst_viss_status_fys_kem_2017_2021/MapServer/87/query`;
const params = new URLSearchParams({
  'where': `EU_CD='${euCode}'`,
  'f': 'json',
  'outFields': '*',
  'returnGeometry': 'false'
});
```

---

## 🌡️ SMHI - Sveriges meteorologiska och hydrologiska institut

### Bakgrund
SMHI erbjuder gratis väder- och vattendata via öppna API:er med Creative Commons-licens.

### Tekniska Detaljer
- **Bas-URL:** `https://opendata-download-metobs.smhi.se/api/version/latest`
- **Licens:** Creative Commons Erkännande 4.0 SE
- **Autentisering:** Ingen
- **Format:** JSON/CSV
- **Kostnad:** Helt gratis

### Vattenrelaterade Parametrar

#### 🌊 Parameter 22: Vattentemperatur
```javascript
// Hämta alla vattentemperatur-stationer
const url = 'https://opendata-download-metobs.smhi.se/api/version/latest/parameter/22.json';

// Hämta data från specifik station
const stationUrl = 'https://opendata-download-metobs.smhi.se/api/version/latest/parameter/22/station/{STATION_ID}/period/latest-day/data.json';
```

#### 📊 Tillgängliga Perioder
- `latest-hour` - Senaste timmen
- `latest-day` - Senaste dygnet  
- `latest-months` - Senaste månaderna
- `corrected-archive` - Korrigerat arkiv

### S-HYPE Hydrologisk Modell

#### 🏞️ SMHI Vattenwebb
- **URL:** `http://vattenweb.smhi.se/modelarea/`
- **Data:** Simulerad vattentemperatur, vattenföring, närsingsämnen
- **Täckning:** Hela Sverige
- **Upplösning:** Daglig data + 10-dagars prognos

#### Tillgängliga Parametrar
| Parameter | Enhet | Beskrivning |
|-----------|-------|-------------|
| Vattentemperatur | °C | Simulerad/observerad |
| Vattenföring | m³/s | Beräknad flöde |
| Salthalt | PSU | För kustvatten |
| Syre | mg/l | Syrgaskoncentration |
| Kvävetransport | kg | Näringsämnen |
| Fosfortransport | kg | Näringsämnen |

### Exempel: Hitta Närmaste Station

```javascript
async function findNearestWaterTempStation(lat, lon) {
  const response = await fetch('https://opendata-download-metobs.smhi.se/api/version/latest/parameter/22.json');
  const data = await response.json();
  
  let nearestStation = null;
  let minDistance = Infinity;
  
  for (const station of data.station) {
    if (!station.active) continue;
    
    const distance = calculateDistance(lat, lon, station.latitude, station.longitude);
    if (distance < minDistance) {
      minDistance = distance;
      nearestStation = station;
    }
  }
  
  return nearestStation;
}
```

---

## 🐟 Fiskdata - SvenskaFiskekartan & Fiskeregler

### Bakgrund
Nationella register över fiskarter och fiskeregler, tillgängliga via ArcGIS REST Services.

### Tekniska Detaljer
- **Bas-URL:** `https://ext-geodata-applikationer.lansstyrelsen.se/arcgis/rest/services`
- **Tjänster:** 
  - `SvenskaFiskekartan/lst_svenskafiskekartan/MapServer`
  - `SvenskaFiskeregler/lst_svenskafiskeregler/MapServer`

### SvenskaFiskekartan

#### Spatial Sökning
```javascript
// Konvertera WGS84 till SWEREF99
const swerefX = wgs84ToSwerefX(longitude);
const swerefY = wgs84ToSwerefY(latitude);

const url = `${BASE_URL}/SvenskaFiskekartan/lst_svenskafiskekartan/MapServer/0/query`;
const params = new URLSearchParams({
  'geometry': `${swerefX},${swerefY}`,
  'geometryType': 'esriGeometryPoint',
  'spatialRel': 'esriSpatialRelIntersects',
  'f': 'json',
  'outFields': '*'
});
```

#### Förväntade Fält
| Fält | Beskrivning |
|------|-------------|
| `ARTNAMN` | Svenskt artnamn |
| `SCIENTIFIC_NAME` | Vetenskapligt namn |
| `STATUS` | Artens status |
| `ABUNDANCE` | Förekomstfrekvens |

### SvenskaFiskeregler

#### Regleringstyper
- **Fredningstider** - När fiske är förbjudet
- **Minimimått** - Minimistorlek per art
- **Fångstbegränsningar** - Max antal per dag/person
- **Områdesspecifika regler** - Lokala bestämmelser

---

## 🚀 Användning

### Installation
```bash
# Kopiera water body data fetcher
cp src/lib/waterBodyDataFetcher.ts your-project/src/lib/

# Installera beroenden om nödvändigt
npm install # (inga externa beroenden krävs)
```

### Grundläggande Användning

```typescript
import { getWaterBodyData } from './lib/waterBodyDataFetcher';

async function example() {
  // Hämta komplett data för Vombsjön
  const data = await getWaterBodyData('Vombsjön');
  
  if (data) {
    console.log(`Vattentemperatur: ${data.currentConditions.water_temperature?.value}°C`);
    console.log(`Syrgasförhållanden: ${data.waterQuality.oxygen.status}`);
    console.log(`Fisksamhälle: ${data.fishData.fish_community_status}`);
    console.log(`Antal fiskarter: ${data.fishData.species?.length || 0}`);
  }
}
```

### Avancerad Användning

```typescript
import { WaterBodyDataFetcher } from './lib/waterBodyDataFetcher';

const fetcher = new WaterBodyDataFetcher();

// Anpassad datahämtning
async function customSearch() {
  // Sök först vattenförekomst
  const basicInfo = await fetcher.findWaterBody('Mälaren');
  
  if (basicInfo) {
    // Hämta endast specifik data
    const waterQuality = await fetcher.fetchWaterQuality(
      basicInfo.eu_cd, 
      basicInfo.ms_cd
    );
    
    const temperature = await fetcher.fetchWaterTemperature(
      basicInfo.coordinates
    );
  }
}
```

---

## 📡 API-endpoints Sammanfattning

### VISS Endpoints
```
# Vattenförekomster
GET /VISS/lst_viss_api/MapServer/{LAYER_ID}/query

# Vattenkvalitet
GET /VISS/lst_viss_status_fys_kem_2017_2021/MapServer/{LAYER_ID}/query

# Biologisk status  
GET /VISS/lst_viss_status_biologi_2017_2021/MapServer/{LAYER_ID}/query

# Övervakningsstationer
GET /VISS/lst_viss_overvakning_stationer/MapServer/0/query
```

### SMHI Endpoints
```
# Parameterinformation
GET /parameter/{PARAMETER_ID}.json

# Stationsdata
GET /parameter/{PARAMETER_ID}/station/{STATION_ID}/period/{PERIOD}/data.json

# Vattentemperatur (Parameter 22)
GET /parameter/22.json
GET /parameter/22/station/{STATION_ID}/period/latest-day/data.json
```

### Fiskdata Endpoints
```
# SvenskaFiskekartan
GET /SvenskaFiskekartan/lst_svenskafiskekartan/MapServer/0/query

# SvenskaFiskeregler  
GET /SvenskaFiskeregler/lst_svenskafiskeregler/MapServer/0/query
```

---

## 📊 Dataformat

### WaterBodyData Interface
```typescript
interface WaterBodyData {
  basic: {
    name: string;
    eu_cd: string;
    type: 'lake' | 'river' | 'coastal' | 'groundwater';
    coordinates: { lat: number; lon: number };
    // ...
  };
  
  waterQuality: {
    oxygen: { status: string; conditions: string };
    nutrients: { status: string; chlorophyll: string };
    // ...
  };
  
  fishData: {
    fish_community_status: string;
    species?: Array<{ name: string; scientific_name?: string }>;
    // ...
  };
  
  currentConditions: {
    water_temperature?: { value: number; unit: string; date: string };
    // ...
  };
  
  metadata: {
    completeness_score: number; // 0-100%
    data_sources: string[];
    // ...
  };
}
```

---

## 🔧 Exempel

### Komplett Datahämtning
```bash
# Kör testscript
npm run tsx scripts/test-complete-water-data.ts

# Eller lägg till i package.json
"test-water-data": "tsx scripts/test-complete-water-data.ts"
```

### Output Exempel
```
🔍 TESTAR: Vombsjön
✅ DATA HÄMTAD FÖR: VOMBSJÖN

📍 GRUNDLÄGGANDE INFORMATION:
   Namn: Vombsjön
   EU-kod: SE617666-135851
   Koordinater: 55.6844, 13.3721
   Yta: 9.2 hektar

🧪 VATTENKVALITET:
   🫧 Syrgasförhållanden: Måttlig
   🌱 Näringsämnen: Bra
   🌿 Klorofyll: Bra
   📊 Ekologisk status: Dålig/Risk

🐟 FISKDATA:
   🏆 Fisksamhällestatus: Måttlig
   🎣 Fiskarter (5):
      • Gädda (Esox lucius)
      • Abborre (Perca fluviatilis)
      • Karpfisk

🌡️ AKTUELLA FÖRHÅLLANDEN:
   🌊 Vattentemperatur: 15.2°C
   📍 Station: Malmö (12km bort)

🟡 DATAKVALITET: Medel (75% komplett)
```

---

## ⚠️ Begränsningar & Viktiga Noteringar

### VISS-data
- **Uppdateringsfrekvens:** Var 6:e år (förvaltningscykler)  
- **Nuvarande data:** 2017-2021 cykel
- **Nästa uppdatering:** 2027
- **Geografisk täckning:** Representerar hela vattenförekomsten, inte punktmätningar

### SMHI-data
- **Rate limiting:** Ingen officiell gräns, men var schysst
- **Stationstäckning:** Inte alla vattendrag har temperaturstationer
- **Dataaktualitet:** Varierar per station (timmar till dagar)

### Fiskdata
- **Komplethet:** Varierar kraftigt mellan områden
- **Uppdateringsfrekvens:** Oregelbunden
- **Regleraccuracy:** Kontrollera alltid med lokala myndigheter

### Tekniska Begränsningar
- **Koordinatkonvertering:** Approximativ (använd proj4js för production)
- **Error handling:** Grundläggande (förbättra för production)
- **Caching:** Inte implementerat (rekommenderas för production)

---

## 🐛 Felsökning

### Vanliga Problem

#### "Inga resultat hittades"
```javascript
// Kontrollera stavning och svenska tecken
❌ "Malaren"     
✅ "Mälaren"

// Prova partiella sökningar
❌ "Stora Ensjön"
✅ "Ensjön"
```

#### "Invalid Token" (VISS)
- VISS ArcGIS-tjänsterna kräver ibland token för vissa layers
- De flesta grundläggande tjänsterna fungerar utan autentisering
- Prova andra layers om en inte fungerar

#### "No stations nearby" (SMHI)
```javascript
// Öka sökradien
const MAX_DISTANCE_KM = 50; // Istället för 20

// Eller fallback till modelldata
if (!observedTemp) {
  const modeledTemp = await getHypeModelTemperature(coordinates);
}
```

#### Koordinatproblem
```javascript
// SWEREF99 vs WGS84 konvertering
// Använd bibliotek som proj4js för precision
import proj4 from 'proj4';

const sweref99 = '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';
const wgs84 = '+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs';

const [lon, lat] = proj4(sweref99, wgs84, [swerefX, swerefY]);
```

### Debug-tips
```javascript
// Aktivera detaljerad loggning
const fetcher = new WaterBodyDataFetcher();
fetcher.debug = true; // Om implementerat

// Manuell API-testning
const testUrl = 'https://ext-geodata-applikationer.lansstyrelsen.se/arcgis/rest/services/VISS/lst_viss_api/MapServer?f=json';
console.log(await fetch(testUrl).then(r => r.json()));
```

---

## 📞 Support & Kontakt

### VISS Support
- **Email:** viss-support@lansstyrelsen.se
- **Telefon:** 010-223 60 00

### SMHI Support  
- **Email:** kundtjanst@smhi.se
- **Telefon:** 011-495 82 00
- **Kund- och supportforum:** Länk från smhi.se

### Utvecklingssupport
- Tekniska frågor: Öppna issue i detta repo
- API-dokumentation: Se respektive myndighets webbplats

---

## 📝 Licens & Attribution

### VISS Data
- Öppna data från svenska myndigheter
- Ange källa: "Data från VISS (Vatteninformationssystem Sverige)"

### SMHI Data
- **Licens:** Creative Commons Erkännande 4.0 SE
- **Attribution:** "Väderdata från SMHI"
- **Länk:** https://www.smhi.se/data/oppna-data/villkor-for-anvandning-1.30622

### Denna Implementation
- Open source - använd fritt
- Attribution uppskattas men inte krävet

---

*Senast uppdaterad: 2025-01-03*  
*Version: 1.0.0*