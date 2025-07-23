# Professionellt Bete-System för Makrillsverige

## Översikt

Detta system integrerar med **riktiga svenska fiskebutiker** för att visa aktuella produkter och priser för fiskebeten. Systemet använder web scraping och intelligent produktmatchning för att ge användarna relevant och uppdaterad information.

## 🚧 Aktuell Implementation

### Integrerade Butiker

1. **Sportfiskeprylar.se** - Sveriges största fiskebutik (40,000+ produkter)
2. **Utklasad.se** - Specialister på fiskespön och fiskedrag
3. **Fishline.se/Fishsports** - Stor flugfiskebutik

### Funktioner

#### ✅ Intelligent Produktmatchning
- Mappar fiskarter till relevanta beteskategorier
- Använder söktermer baserade på fiskeexpertis
- Scorar produkter baserat på relevans och tillgänglighet

#### ✅ Realtidsdata från Svenska Butiker
- Web scraping med respektfulla begränsningar (2s mellan requests)
- Parsar produktnamn, priser, lagerstatus
- Hanterar REA-priser och kampanjer

#### ✅ Affiliate-Tracking
- Spårar klick och konverteringar
- Genererar intäkter för plattformen
- Transparent för användaren

#### ✅ Smart Prishantering
- Jämför priser mellan butiker
- Visar ordinarie pris vs REA-pris
- Uppdaterar automatiskt (planerat)

## Teknisk Arkitektur

### Backend Components

```
src/lib/realBaitRetailer.ts          # Huvudservice för betrekommendationer
src/app/api/scrape-products/route.ts # Web scraping API
src/app/api/affiliate-tracking/      # Affiliate-spårning
```

### Fisk-till-Bete Mappning

```typescript
const fishToBaitMapping = {
  'Abborre': {
    searchTerms: ['abborre', 'perch', 'pimpel', 'jigg', 'spinnare'],
    categories: ['jiggar', 'spinnare', 'wobblers', 'mjukbeten'],
    techniques: ['jiggfiske', 'spinnfiske', 'vertikal'],
    waterTypes: ['insjö', 'skärgård', 'å']
  },
  'Gädda': {
    searchTerms: ['gädda', 'pike', 'jerkbait', 'trolling', 'swimbaits'],
    categories: ['jerkbaits', 'swimbaits', 'wobblers', 'skeddrag'],
    techniques: ['trolling', 'kastfiske', 'jerkbait'],
    waterTypes: ['insjö', 'å', 'skärgård']
  }
  // ... fler fiskarter
}
```

### Rate Limiting & Etisk Scraping

- 2 sekunder mellan requests per butik
- Respektfulla HTTP headers
- Timeout-hantering (10s)
- Felhantering och retry-logik

## Användargränssnitt

### Nya Funktioner i Fiskguiden

1. **Dynamisk Laddning** - Hämtar data när användaren väljer fisk
2. **Laddningsindikator** - Visar att data hämtas från butiker
3. **Produktkort** - Professionella produktvisningar med:
   - Produktnamn och beskrivning
   - Aktuellt pris (+ REA-pris om tillämpligt)
   - Lagerstatus (i lager/ej i lager)
   - Köp-knapp med affiliate-länk
   - Butikens namn

4. **Effektivitetsbetyg** - 1-5 stjärnor baserat på:
   - Produkttillgänglighet
   - Priskonkurrenskraft
   - Kategorirelevans

## Affiliate-System

### Tracking
```typescript
interface AffiliateClick {
  product_id: string;
  retailer: string;
  fish_species: string;
  timestamp: string;
  user_agent?: string;
  ip_address?: string;
}
```

### Intäktsmodell
- Affiliate-provision från varje köp
- Transparent för användaren
- Disclaimer om provision visas

## Utveckling & Testning

### Development Mode
- Använder mock-data för snabb utveckling
- Riktig scraping aktiveras i produktion

### Error Handling
- Graceful fallback vid scraping-fel
- Logging av fel för övervakning
- Användarvänliga felmeddelanden

## Kommande Förbättringar

### Kortsiktigt (1-2 månader)
1. **Automatiska Prisuppdateringar**
   - Daglig synkronisering av priser
   - Caching för bättre prestanda

2. **Fler Butiker**
   - Fiskegrossisten.com
   - Havsfiske.com
   - Moritz.se

3. **Bättre Produktmatchning**
   - Machine Learning för relevans
   - Användarfeedback för förbättring

### Långsiktigt (3-6 månader)
1. **API-Integrationer**
   - Direkta API:er med butiker som erbjuder det
   - Realtids lagerstatus

2. **Personalisering**
   - Användarspecifika rekommendationer
   - Prishistorik och alerts

3. **Mobiloptimering**
   - Förbättrad mobilupplevelse
   - Push-notifikationer för kampanjer

## Prestanda & Skalning

### Aktuell Kapacitet
- Hanterar ~50 samtidiga användare
- 3 butiker med ~100 produkter per fisk
- Response time: 2-5 sekunder

### Skalningsplan
- Caching-lager för populära sökningar
- CDN för statisk data
- Load balancing för högtrafik

## Juridiskt & Etiskt

### Compliance
- Följer butikernas robots.txt
- Respektfulla scraping-patterns
- GDPR-kompatibel data-hantering

### Transparens
- Tydlig information om affiliate-länkar
- Användarnas integritet respekteras
- Ingen manipulativ prissättning

## Support & Underhåll

### Monitoring
- Automatisk övervakning av scraping-status
- Felrapportering via logging
- Prestanda-metrics

### Uppdateringar
- Kontinuerlig förbättring av produktmatchning
- Regelbunden kontroll av butikernas ändringar
- Användarfeedback-integration

---

**Status:** 🟢 Aktivt system - Integrerat med riktiga svenska fiskebutiker  
**Lansering:** Januari 2025  
**Nästa Update:** Planerat för mars 2025 