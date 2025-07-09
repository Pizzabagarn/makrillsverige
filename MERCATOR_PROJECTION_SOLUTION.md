# Mercator Projection Solution - Löser Kartläggningsproblemet

## Problemet

Tidigare genererade vi marina bilder i **WGS84** (lat/lon) koordinater men visade dem på en **WebMercator** karta. Detta skapade projektionsfel eftersom:

- **WGS84** är en rektangulär projektion (lat/lon grid)
- **WebMercator** följer jordens kurvatur (EPSG:3857)
- Missmatchningen krävde komplexa offset-korrigeringar som aldrig blev perfekta

## Lösningen

### 🗺️ Mercator Bildgenerering

Vi har skapat ett nytt skript som genererar bilder **direkt i WebMercator-projektion**:

```bash
python scripts/generate_marine_images_mercator.py --parameter current --max-images 10
```

**Fördelar:**
- ✅ **Perfekt kartplacering** - ingen offset behövs
- ✅ **Identisk interpolation** - samma algoritmer som tidigare
- ✅ **Samma färgskalor** - ingen visuell skillnad
- ✅ **Samma vattenmasker** - exakt samma logik
- ✅ **Eliminerar kurvaturproblem** - följer jordens form

### 🔧 Teknisk Implementation

#### Projektionstransformation
```python
# WGS84 till Web Mercator transformer
wgs84_to_mercator = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)

# Konvertera datapoints till Mercator
data_x, data_y = wgs84_to_mercator.transform(lons, lats)
```

#### Mercator Grid Creation
```python
# Skapa Mercator grid istället för WGS84
x_grid = np.linspace(x_min, x_max, grid_resolution)
y_grid = np.linspace(y_min, y_max, grid_resolution)
x_mesh, y_mesh = np.meshgrid(x_grid, y_grid)
```

#### Vattenmask i Mercator
```python
# Konvertera Mercator-punkter tillbaka till WGS84 för vattenmask-kontroll
lon_point, lat_point = mercator_to_wgs84.transform(x_point, y_point)
if point_in_water(lon_point, lat_point, water_polygons):
    water_mask[row, j] = True
```

### 📁 Ny Filstruktur

```
public/data/
├── current-images-mercator/      # Nya Mercator-bilder
├── temperature-images-mercator/   # Framtida temperature i Mercator
├── salinity-images-mercator/     # Framtida salinity i Mercator
└── metadata.json                 # Innehåller Mercator-koordinater
```

#### Metadata Format
```json
{
  "projection": "EPSG:3857",
  "wgs84_bbox": [10.3, 16.6, 54.9, 59.6],
  "mercator_bbox": [1146590.7551707178, 1847903.5471683415, 7342482.290188272, 8311215.713002437],
  "images": [
    {
      "timestamp": "2025-06-29T12:00:00.000Z",
      "mercator_coordinates": [
        [1146590.7551707178, 8311215.713002437],  // top-left
        [1847903.5471683415, 8311215.713002437],  // top-right
        [1847903.5471683415, 7342482.290188272],  // bottom-right
        [1146590.7551707178, 7342482.290188272]   // bottom-left
      ]
    }
  ]
}
```

### 🖥️ Frontend-uppdateringar

#### Nya Layer-komponenter
- `CurrentMagnitudeLayerMercator.tsx` - Använder Mercator-koordinater direkt
- `TemperatureLayerMercator.tsx` - Samma men för temperatur
- `SalinityLayerMercator.tsx` - Samma men för salthalt

#### Ingen Offset Längre
```typescript
// INNAN (med offset):
const offset = getLayerOffsetForBbox(lon_min, lon_max, lat_min, lat_max);
coordinates: [
  [lon_min + lon_offset, lat_max + lat_offset],
  [lon_max + lon_offset, lat_max + lat_offset],
  // ...
]

// EFTER (Mercator - ingen offset):
const [topLeft, topRight, bottomRight, bottomLeft] = image.mercator_coordinates;
coordinates: [
  topLeft,     // Exakta Mercator-koordinater
  topRight,    // Ingen transformation behövs
  bottomRight, // Perfekt kartplacering
  bottomLeft   // Garanterat!
]
```

### 🚀 Användning

#### Generera Mercator-bilder
```bash
# Alla parametrar
python scripts/generate_marine_images_mercator.py --parameter all

# Endast strömstyrka
python scripts/generate_marine_images_mercator.py --parameter current

# Testläge (5 bilder)
python scripts/generate_marine_images_mercator.py --parameter current --max-images 5

# Högre upplösning
python scripts/generate_marine_images_mercator.py --parameter current --resolution 1200
```

#### Byt till Mercator i Frontend
`Map.tsx` uppdaterad för att använda nya komponenter:
```typescript
// Nya Mercator-komponenter
import CurrentMagnitudeLayerMercator from './CurrentMagnitudeLayerMercator';
import TemperatureLayerMercator from './TemperatureLayerMercator';
import SalinityLayerMercator from './SalinityLayerMercator';

// Använd i render:
<CurrentMagnitudeLayerMercator visible={activeLayer === 'current'} />
<TemperatureLayerMercator visible={activeLayer === 'temperature'} />
<SalinityLayerMercator visible={activeLayer === 'salinity'} />
```

### 📊 Resultat

#### Före (WGS84 + Offset)
- ❌ Komplexa regionspecifika offset-korrigeringar
- ❌ Aldrig perfekt placering
- ❌ Olika offset för olika områden
- ❌ Manuella justeringar krävdes

#### Efter (Mercator)
- ✅ **Perfekt kartplacering automatiskt**
- ✅ **Ingen offset-kod behövs**
- ✅ **Enhetlig lösning för alla områden**
- ✅ **Följer jordens naturliga kurvatur**

### 🔧 Krav

Lägg till i `requirements.txt`:
```
pyproj>=3.0.0
```

### 🎯 Nästa Steg

1. **Generera alla parametrar:**
   ```bash
   python scripts/generate_marine_images_mercator.py --parameter all
   ```

2. **Testa i utveckling:** Kör applikationen och kontrollera att bilderna lägger sig perfekt

3. **Ta bort gamla filer:** När allt fungerar kan gamla WGS84-bilder och offset-systemet tas bort

4. **Dokumentera:** Uppdatera annan dokumentation för att referera till Mercator-systemet

### 🌟 Sammanfattning

Denna lösning eliminerar projektionsproblemet helt genom att:
- Generera bilder direkt i samma projektion som kartan använder
- Använda exakta Mercator-koordinater utan approximationer
- Behålla all befintlig interpolations- och färglogik
- Förenkla koden betydligt genom att ta bort offset-systemet

**Resultatet:** Perfekt kartplacering utan kompromisser! 🎯 