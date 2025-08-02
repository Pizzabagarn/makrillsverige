# Makrill Sverige - Advanced Fishing Intelligence System

Ett avancerat fiskesystem som kombinerar väderdata, havsparametrar och AI-driven makrillannolikhet för optimal fiskestrategi längs svenska kusten.

## 🌊 Funktioner

### Väderprognos
- **Yr/MET Weather API**: Professionell väderdata från Meteorologisk institutt (Norge)
- **240-timmars prognos**: Fullständig 10-dagars väderprognos
- **Hög noggrannhet**: MEPS 2.5km-modell (0-60h), ECMWF 9km (60-240h)
- **Fiskerelevanta parametrar**: Temperatur, vind, vindbyar, nederbörd, lufttryck, fuktighet
- **Attribution**: CC BY 4.0-kompatibel med korrekt källhänvisning

### Havsdata & Makrillprognos  
- **Strömdata**: Real-time havsströmmar från DMI
- **Vattentemperatur**: Précis temperaturkartläggning
- **Salinitet**: Salthaltnivåer för fiskeoptimering
- **Makrillsannolikhet**: AI-baserad sannolikhetsmodell för makrillfångst

### Interaktiv Karta
- **Mercator-projektion**: Optimerad för svenska vatten
- **Realtidsdata**: Live-uppdatering av alla parametrar
- **WebGL-acceleration**: Smooth 60fps-rendering
- **Responsiv design**: Fungerar på desktop och mobil

## 🚀 Installation

### Förutsättningar
- Node.js 18+
- Python 3.8+ (för kartgenerering)
- Supabase-konto för datalagring

### Snabbstart
```bash
git clone https://github.com/user/makrillsverige.git
cd makrillsverige
npm install
cp .env.example .env.local
```

### Miljövariabler
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_key

# DMI API (för havsdata)
DMI_API_KEY=your_dmi_key

# YR Weather behöver ingen API-nyckel, bara korrekt User-Agent
```

### Utvecklingsserver
```bash
npm run dev
```

### Generera väderdata
```bash
# Hämta väderdata från Yr
npm run fetch-weather-yr

# Generera marine bilder  
python scripts/generate_marine_images_mercator.py
```

## 📊 API Endpoints

### Väder (Yr)
- `GET /api/weather?lat={lat}&lon={lon}` - Punktspecifik väderprognos
- Returnerar alla 240h prognostider
- Automatisk enheetskonvertering
- Felfallback med retry-logik

### Havsdata (DMI)
- `GET /api/dmi/current?lat={lat}&lon={lon}` - Strömdata  
- `GET /api/area-parameters` - Kompletta havsparametrar
- Cachad och komprimerad data för snabb leverans

## 🔧 Utveckling

### Projekt-struktur
```
src/
├── app/
│   ├── api/          # Backend API routes
│   ├── components/   # React komponenter
│   └── weather/      # Väder-sida
├── lib/
│   ├── yrWeatherService.ts    # Yr API integration
│   └── colormap-utils.ts      # Färgkartor
└── scripts/
    ├── fetchWeatherDataYr.ts      # Yr data-hämtare
    └── generate_marine_images_mercator.py  # Kartgenerering
```

### Attribution & Licenser
- **Väderdata**: Meteorologisk institutt (MET Norway) - CC BY 4.0
- **Havsdata**: Danmarks Meteorologiske Institut (DMI)
- **Kod**: MIT License
- **Ikoner**: Weather Icons (CC BY 4.0)

### API-användning
- **Yr API**: Max 4 requests/dygn per punkt, korrekt User-Agent krävs
- **DMI API**: API-nyckel krävs för havsdata
- **Supabase**: För användardata och fiskeinformation

## 🌍 Datakällor

### Väder: Yr/MET Norway
- MEPS 2.5km-modell för kortsiktiga prognoser (0-60h)
- ECMWF 9km-modell för långsiktiga prognoser (60-240h)  
- Uppdateras 4 gånger dagligen (00, 06, 12, 18 UTC)
- Högt detaljerad temperatur, vind, nederbörd

### Havsdata: DMI HARMONIE
- DKSS (Danish Seas and Straits) för strömmar
- Närliggande havsområden med 2km-upplösning
- Realtidsuppdatering av vattenparametrar

## 🐟 Fiskefunktioner

### Interaktiv Användning
- **Högerklick i sidebar**: Öppna fiskeinformationsformulär
- **Standard-koordinater**: 57.0°N, 12.0°E (Skagerrak)
- **Mobil-kompatibel**: Fungerar i hamburger-menyn

### AI-Makrillmodell  
- Tränad på historiska fångstdata
- Använder vattentemperatur, salinitet, strömmar
- Probabilistisk utdata (0-100% sannolikhet)
- Kalibrerad för svenska vatten

## 🛠️ Bidrag

### Utveckling
1. Fork projektet
2. Skapa feature-branch (`git checkout -b feature/AmazingFeature`)
3. Commita changes (`git commit -m 'Add AmazingFeature'`)
4. Push till branch (`git push origin feature/AmazingFeature`)
5. Öppna Pull Request

### Buggrapportering
- Använd GitHub Issues
- Inkludera steg för reproduktion
- Bifoga skärmdumpar om relevant

---

**Kontakt**: kontakt@makrillsverige.se  
**Licens**: MIT  
**Väderdata**: CC BY 4.0 (MET Norway)
