# Fish Behavior Data API Dokumentation

## Översikt
Fish behavior JSON-filen innehåller strukturerad data om svenska fiskarters beteenden för interaktiva visualiseringar.

## Root-objekt
```json
{
  "enums": { … },
  "common_activity_params": [ … ],
  "species": [ … ]
}
```

| Nyckel | Typ | Beskrivning |
|--------|-----|-------------|
| `enums` | Objekt | Lista över återkommande kategoriska värden (tid, väder, mm) |
| `common_activity_params` | Array[Objekt] | Parametrar som kan återanvändas mellan arter (t.ex. lufttryck) |
| `species` | Array[Objekt] | Huvudlista med alla fiskarter och deras data |

## 1. enums
Definierar giltiga värden för kategoriska parametrar.

```json
"enums": {
  "time_of_day": [ "dawn", "day", "dusk", "night" ],
  "weather": [ "clear", "sunny", "overcast", "light_rain", "rain" ],
  "moon_phase": [ "new_moon", "waxing_crescent", "first_quarter", "waxing_gibbous", "full_moon", "waning_gibbous", "last_quarter", "waning_crescent" ],
  "season": [ "spring", "summer", "autumn", "winter" ],
  "habitat": [ "river", "lake", "coastal", "open_sea" ]
}
```

**Användning:** Validera eller rendera dropdowns för parametrar som dygnstid, väder eller säsong.

## 2. common_activity_params
Återanvändbara aktivitetsparametrar.

```json
"common_activity_params": [
  {
    "id": "air_pressure_change",
    "parameter": "air_pressure_change",
    "range": { "type": "numeric", "min": -5, "max": 5, "unit": "hPa/12h" },
    "activity_index": { "low": 0.8, "high": 1.0 },
    "notes": "Fallande barometer utlöser ofta ökad huggaktivitet"
  }
]
```

| Fält | Typ | Beskrivning |
|------|-----|-------------|
| `id` | String | Unik identifier för parametern |
| `parameter` | String | Namnet på parametern (samma som id) |
| `range` | Objekt | Beskriver giltigt spann (min/max) och enhet |
| `activity_index` | Objekt | Relativ aktivitetsnivå (low–high) vid detta spann |
| `notes` | String | Fria anteckningar och förklaringar |

## 3. species - Fiskarter
Array med objekt, ett per fiskart:

```json
{
  "id": "perca_fluviatilis",
  "svenskt_namn": "Abborre",
  "latinskt_namn": "Perca fluviatilis",
  "activity": [ … ],
  "diet_preferences": [ … ],
  "recommended_methods": [ … ],
  "spatial_distribution": [ … ],
  "fishing_tactics": [ … ],
  "source": "FishBase 2025",
  "confidence": "high",
  "last_updated": "2025-07-26",
  "regulations": { … }
}
```

### 3.1 Grundläggande metadata
| Fält | Typ | Beskrivning |
|------|-----|-------------|
| `id` | String | Unikt ID (används t.ex. i URL) |
| `svenskt_namn` | String | Artens svenska namn |
| `latinskt_namn` | String | Artens latinska namn |
| `source` | String | Datakälla |
| `confidence` | String | Hur pålitlig datan är (t.ex. "high") |
| `last_updated` | Date | Senaste uppdateringsdatum (YYYY-MM-DD) |

### 3.2 activity (Array)
Lista av parametrar som påverkar artens aktivitet.

```json
"activity": [
  {
    "parameter": "water_temperature",
    "range": { "type": "numeric", "min": 8, "max": 20, "unit": "°C" },
    "activity_index": { "low": 0.2, "high": 1.0 },
    "notes": "Optimal runt 15°C för maximal aktivitet",
    "refs": [0]
  },
  {
    "parameter": "time_of_day",
    "range": { "type": "categorical", "values": ["dawn", "dusk"] },
    "activity_index": { "low": 0.5, "high": 1.0 },
    "notes": "Gryning/skymning ger högre aktivitet än mitt på dagen"
  }
]
```

| Fält | Typ | Beskrivning |
|------|-----|-------------|
| `parameter` | String | Parameternamn (matchar antingen common_activity_params eller egen parameter) |
| `range` | Objekt | Spann: type ("numeric"/"categorical"), min/max eller values |
| `activity_index` | Objekt | Relativ intensitet låg–hög (0.0–1.0) |
| `notes` | String | Fria anteckningar om tolkning |
| `refs` | Array[Int] | Referenser till källor |
| `ref` | String | Pekar på id i common_activity_params |

**Tips:** För sliders - filtrera activity där `range.type === "numeric"`.

### 3.3 diet_preferences (Array) - VIKTIGT: Förklaring av dietproportioner

```json
"diet_preferences": [
  {
    "parameter": "water_temperature",
    "range": { "type": "numeric", "min": 10, "max": 14, "unit": "°C" },
    "diet": {
      "plankton": 0.8,
      "insects": 0.2
    },
    "notes": "Vid ~12°C utgörs födan mest av djurplankton (vårblomning)"
  }
]
```

#### 🔍 **Vad betyder diet-värdena?**

**Nycklarna** (t.ex. "plankton", "insects") är **födokategorier**:
- `"plankton"` = djurplankton (mikroskopiska vattenlevande organismer)
- `"insects"` = insekter och larver (dagsländor, mygglarver etc.)
- `"small_fish"` = småfisk som äts av större rovfisk
- `"crustaceans"` = kräftdjur (räkor, märlkräftor etc.)
- `"worms"` = maskar (havsborstmaskar, daggmaskar etc.)
- `"mollusks"` = blötdjur (snäckor, musslor)
- `"benthic_invertebrates"` = bottenlevande ryggradslösa djur

**Värdena** (t.ex. `0.8`, `0.2`) är **proportioner/andelar** av dieten:
- `0.8` = **80%** av födan är plankton
- `0.2` = **20%** av födan är insekter
- **Summa ≈ 1.0** (100% av dieten)

#### Exempel på tolkning:
```json
"diet": { 
  "fish": 0.6, 
  "amphibians": 0.2, 
  "crustaceans": 0.2 
}
```
= **60% fisk, 20% grodor, 20% kräftdjur** under dessa förhållanden.

#### Kodexempel för diet-hantering:
```javascript
// Hämta diet för temperaturintervall 10-14°C
const dietObj = abborre.diet_preferences.find(d =>
  d.range.type === "numeric" &&
  d.range.min <= 12 && d.range.max >= 12  // 12°C ligger i spannet
).diet;

// Konvertera till cirkeldiagram-data
const pieData = Object.entries(dietObj).map(([category, proportion]) => ({
  name: translateFoodCategory(category),  // Översätt till svenska
  value: Math.round(proportion * 100)     // Konvertera till procent
}));
// Resultat: [{ name: "Plankton", value: 80 }, { name: "Insekter", value: 20 }]

// Hitta huvudföda
const primaryFood = Object.entries(dietObj)
  .sort((a, b) => b[1] - a[1])[0];  // Högsta proportionen
// primaryFood = ["plankton", 0.8]
```

### 3.4 recommended_methods (Array)
Fisketips och metoder.

```json
"recommended_methods": [
  {
    "method": "Spinnfiske (jigg)",
    "best_time": ["dawn", "dusk"],
    "notes": "Jigga nära vegetation under gryning och skymning för bästa resultat"
  },
  {
    "method": "Mete",
    "best_temp": { "min": 14, "max": 18, "unit": "°C" },
    "notes": "Bottenmete med mask är effektivt på grunt vatten när vattnet är 14–18°C"
  }
]
```

### 3.5 spatial_distribution (Array)
Var fisken håller till.

```json
"spatial_distribution": [
  {
    "parameter": "season",
    "range": ["summer"],
    "depth": { "min": 1, "max": 5, "unit": "m" },
    "zone": "inshore",
    "notes": "På sommaren står abborren ofta grunt (1–5 m) nära växtlighet"
  }
]
```

### 3.6 fishing_tactics (Array)
Taktiska variationer.

```json
"fishing_tactics": [
  {
    "parameter": "water_temperature",
    "range": { "min": 0, "max": 10, "unit": "°C" },
    "retrieve_speed": "slow",
    "notes": "I kallt vatten (<10°C) är abborren trög – fiska långsamt nära botten"
  }
]
```

## Praktiska kodexempel

### Hämta alla numeriska parametrar för sliders:
```javascript
const numericParams = fishData.activity
  .filter(a => a.range?.type === "numeric")
  .map(a => ({
    name: a.parameter,
    min: a.range.min,
    max: a.range.max,
    unit: a.range.unit,
    current: (a.range.min + a.range.max) / 2  // Standardvärde
  }));
```

### Hämta kategoriska parametrar för dropdowns:
```javascript
const categoricalParams = fishData.activity
  .filter(a => a.range?.type === "categorical")
  .map(a => ({
    name: a.parameter,
    options: a.range.values,
    current: a.range.values[0]  // Första som standard
  }));
```

### Beräkna aktivitet baserat på parametrar:
```javascript
function calculateActivity(fishData, currentParams) {
  let totalActivity = 0;
  let paramCount = 0;
  
  fishData.activity.forEach(activityParam => {
    const currentValue = currentParams[activityParam.parameter];
    if (currentValue !== undefined) {
      // Kontrollera om värdet ligger inom range
      if (activityParam.range.type === "numeric") {
        if (currentValue >= activityParam.range.min && 
            currentValue <= activityParam.range.max) {
          totalActivity += activityParam.activity_index.high;
        } else {
          totalActivity += activityParam.activity_index.low;
        }
      } else if (activityParam.range.type === "categorical") {
        if (activityParam.range.values.includes(currentValue)) {
          totalActivity += activityParam.activity_index.high;
        } else {
          totalActivity += activityParam.activity_index.low;
        }
      }
      paramCount++;
    }
  });
  
  return paramCount > 0 ? totalActivity / paramCount : 0.5;
}
```

Denna struktur möjliggör dynamiska, interaktiva visualiseringar där användaren kan justera parametrar och se hur de påverkar fiskens beteende i realtid! 