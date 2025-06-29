# Strömstyrka Visualisering - Instruktioner

Den här implementeringen ger dig samma typ av strömstyrka-visualisering som FCOO Marine Forecast visar, med färgade zoner för strömstyrka och överlagrade pilar för strömriktning.

## 📋 Översikt

Du får:
- 🌊 **Interpolerad strömstyrka** som färgade zoner (liknande FCOO)
- 🧭 **Strömpilar** för riktning (din befintliga funktionalitet)
- ⏰ **Tidssynkronisering** med din ClockKnob
- 🎛️ **Toggle-kontroller** för att visa/dölja lager
- 🔧 **Transparenskontroll** för strömstyrka-lagret

## 🛠️ Steg 1: Installera Python Dependencies

```bash
# Installera Python-bibliotek för interpolation
pip install -r requirements.txt
```

## 🚀 Steg 2: Generera Strömstyrka-bilder

Kör Python-scriptet för att skapa interpolerade PNG-bilder:

```bash
# Grundläggande körning (genererar alla bilder i 1200x1200 upplösning)
python scripts/generate_current_magnitude_images.py

# Med begränsning för testning (bara första 10 bilderna)
python scripts/generate_current_magnitude_images.py --max-images 10

# Ultra-hög upplösning för extra mjuka strömlinjer
python scripts/generate_current_magnitude_images.py --resolution 1600 --max-images 5

# Snabbare körning med lägre upplösning för testning
python scripts/generate_current_magnitude_images.py --resolution 800 --max-images 10

# Anpassade sökvägar
python scripts/generate_current_magnitude_images.py \
  --input public/data/area-parameters-extended.json.gz \
  --water-mask public/data/scandinavian-waters.geojson \
  --output-dir public/data/current-magnitude-images \
  --resolution 1200
```

### Vad scriptet gör:
1. 📦 Läser din komprimerade area-parameters data
2. 🌊 Skapar cache för vattenpunkter (läser vattenmasken bara EN gång)
3. ⚡ Förberäknar högruppläst vattenmask-grid för snabb processing
4. 🔄 Interpolerar strömstyrka (√(u² + v²)) med scipy.griddata i 1200x1200 upplösning
5. 🎨 Skapar färgade PNG-bilder med FCOO-liknande färgskala
6. 💾 Sparar bilderna i `public/data/current-magnitude-images/`
7. 📋 Skapar metadata.json med bounding box och timestamps

**Prestanda-optimeringar:**
- Vattenmasken processas bara en gång (inte för varje bild)
- Vattenpunkt-cache för snabb filtrering
- Förcachad vattenmask-grid för instant masktillämpning
- Variabel upplösning för balans mellan kvalitet/hastighet

## 📁 Resultat

Efter körning får du:
```
public/data/current-magnitude-images/
├── metadata.json
├── current_magnitude_2025-06-27T18-00-00plus00-00.png
├── current_magnitude_2025-06-27T19-00-00plus00-00.png
├── current_magnitude_2025-06-27T20-00-00plus00-00.png
└── ... (en PNG per tidssteg)
```

## 🎮 Steg 3: Använd i Appen

Alla nya komponenter är redan integrerade:

### Nya Komponenter:
- `CurrentMagnitudeLayer.tsx` - Visar interpolerade PNG-bilder
- `LayerToggleControls.tsx` - Toggle-kontroller för lager
- Uppdaterad `Map.tsx` - Inkluderar båda lagren
- Uppdaterad `page.tsx` - Layer state management

### Funktioner:
- ✅ **Automatisk tidssynkronisering** - Bilderna följer din ClockKnob
- ✅ **Toggle on/off** - Visa/dölj strömstyrka och pilar separat
- ✅ **Transparenskontroll** - Justera strömstyrka-lagrets genomskinlighet
- ✅ **Prestanda-optimering** - Throttling under dragging
- ✅ **Responsive design** - Fungerar på desktop och mobil

## 🎨 Färgskala

Använder samma färgschema som FCOO:
- **0.0 knop**: Mörk blå `#000080`
- **0.25 knop**: Ljusare blå `#0080FF`
- **0.5 knop**: Grön `#00FF80`
- **0.75 knop**: Gul-grön `#80FF00`
- **1.0 knop**: Gul `#FFFF00`
- **1.25 knop**: Orange `#FF8000`
- **1.5 knop**: Röd-orange `#FF4000`
- **1.75 knop**: Röd `#FF0000`
- **2.0 knop**: Mörk röd `#800000`
- **2.5+ knop**: Mycket mörk röd `#400000`

## ⚙️ Konfiguration

### Anpassa interpolationsupplösning:
Via kommandorad:
```bash
# Ultra-hög kvalitet (smidigaste strömlinjer, långsammare)
python scripts/generate_current_magnitude_images.py --resolution 1600

# Standard kvalitet (bra balans)
python scripts/generate_current_magnitude_images.py --resolution 1200

# Snabb körning för testning
python scripts/generate_current_magnitude_images.py --resolution 800
```

### Anpassa transparens:
I `page.tsx`:
```typescript
const [currentMagnitudeOpacity, setCurrentMagnitudeOpacity] = useState(0.8);
```

### Anpassa throttling:
I `CurrentMagnitudeLayer.tsx`:
```typescript
const lightThrottledHour = useHeavyThrottle(selectedHour, 100);   // ms
const heavyThrottledHour = useHeavyThrottle(selectedHour, 500);   // ms
```

## 🔍 Felsökning

### "Ingen strömstyrka-bild för [timestamp]"
- Kontrollera att Python-scriptet körts för alla timestamps
- Kolla att filnamnen stämmer i `public/data/current-magnitude-images/`

### Bilder visas inte
- Kontrollera att `metadata.json` finns och innehåller rätt bounding box
- Verifiera att bildernas URL:er är korrekta i browser dev tools

### Prestanda-problem
- Minska `grid_resolution` i Python-scriptet
- Öka throttling-delays i React-komponenterna
- Använd färre bilder för testning (`--max-images`)

## 🚀 Produktions-tips

1. **Automatisering**: Skapa ett cron-job för att köra Python-scriptet när ny data kommer
2. **Cachning**: Använd CDN för PNG-bilderna
3. **Optimering**: Komprimera PNG-bilderna för mindre filstorlek med `pngquant` eller `optipng`
4. **Backup**: Behåll gamla bilder för fallback
5. **Minneshantering**: För stora datamängder, processa i batchar istället för hela datasetet
6. **Parallellisering**: Använd `multiprocessing` för att generera flera bilder samtidigt

## 🎯 Resultat

Du får nu exakt samma typ av visualisering som FCOO Marine Forecast:
- Färgade zoner för strömstyrka
- Överlagrade pilar för riktning
- Smidig tidsnavigering
- Toggle-kontroller för lager
- Responsiv design för alla enheter

Precis som i FCOO kan användare nu se både strömstyrka och riktning tillsammans, eller toggla mellan dem enligt behov! 