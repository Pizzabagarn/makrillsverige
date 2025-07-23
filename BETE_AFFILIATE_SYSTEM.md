# Bet-Affiliate System för Makrillsverige

## Översikt

Systemet låter dig visa rekommenderade fiskebeten i fiskguiden med direktlänkar till återförsäljare, och spåra affiliate-intäkter från klick och försäljningar.

## Funktioner Implementerade

### 1. Datastruktur för Beten (`public/data/bait_recommendations.json`)

Strukturerad data som innehåller:
- **Betinformation**: Namn, typ, beskrivning, pris
- **Återförsäljare**: Flera butiker per bete med individuella priser och lagerstatus  
- **Affiliate-tracking**: Unika affiliate-ID:n för varje återförsäljare
- **Metadata**: Tekniker, säsonger, vattentyper, effektivitetsbetyg

```json
{
  "fish_species": "Abborre",
  "recommended_baits": [{
    "name": "Abu Garcia Droppen 12g",
    "retailers": [{
      "name": "Sportfiskeprylar",
      "url": "https://sportfiskeprylar.se/...",
      "price": 89,
      "affiliate_id": "MSV001"
    }]
  }]
}
```

### 2. Utökad Fiske-flik

**Fiskinformationssidan** (`src/app/fiskinformation/page.tsx`) har nu:
- **Traditionella fisketips** (som tidigare)
- **Rekommenderade beten-sektion** med:
  - Produktkort med bilder och beskrivningar
  - Tekniker och säsonger som badges
  - Prisinfo från olika återförsäljare
  - Direktlänkar till köp med affiliate-tracking
  - Lagerstatus (I lager/Ej i lager)
  - Effektivitetsbetyg (stjärnor)

### 3. Affiliate-tracking System

**API-route** (`src/app/api/affiliate-tracking/route.ts`):
- **POST**: Spårar klick när användare klickar på köplänkar
- **GET**: Returnerar statistik för admin-dashboard
- Loggar: affiliate_id, bait_id, fish_species, retailer, timestamp, user-agent, IP

**Admin-dashboard** (`src/app/admin/affiliate-stats/page.tsx`):
- Översikt av totala klick, unika affiliates, dagens klick
- Topp återförsäljare ranking
- Senaste klick i realtid
- Konverteringsstatistik

## Så här använder du systemet

### 1. Lägg till nya beten

Redigera `public/data/bait_recommendations.json`:

```json
{
  "fish_species": "Gädda",
  "recommended_baits": [{
    "id": "gadda_wobbler_2",
    "name": "Rapala X-Rap 10cm",
    "type": "Wobbler",
    "description": "Aggressiv wobbler för stora gäddor",
    "price_sek": 149,
    "retailers": [{
      "name": "Fishsports",
      "url": "https://fishsports.se/wobbler/rapala-xrap-10cm?affiliate=makrill_se",
      "price": 149,
      "in_stock": true,
      "affiliate_id": "FS_MSV_006"
    }],
    "techniques": ["spinnfiske", "trolling"],
    "seasons": ["vår", "sommar", "höst"],
    "effectiveness_rating": 4.8
  }]
}
```

### 2. Sätt upp affiliate-samarbeten

För varje återförsäljare:
1. **Registrera dig** i deras affiliate-program
2. **Få din unika tracking-URL** med din affiliate-kod
3. **Lägg till i retailers-arrayen** med rätt affiliate_id
4. **Förhandla provision** (vanligtvis 3-8% för fiskeutrustning)

### 3. Övervaka prestanda

Besök `/admin/affiliate-stats` för att se:
- Vilka beten som klickas mest
- Vilka återförsäljare som presterar bäst  
- Daglig/månatlig klickstatistik
- Uppskattad provision baserat på klick

## Intäktspotential

### Svenska Fiskeutrustningsmarknaden
- **Sportfiskeprylar.se**: 3-5% provision
- **Fishsports.se**: 4-7% provision  
- **Fiskegrossisten.com**: 3-6% provision
- **Havsfiske.com**: 5-8% provision

### Realistiska förväntningar
- **500 månadsbesökare**: ~50-100 affiliate-klick/månad
- **2-5% konverteringsgrad**: 1-5 köp/månad
- **Medelpris per köp**: 200-800 kr
- **Månatlig intäkt**: 200-1500 kr (beroende på traffic)

## Tekniska förbättringar att överväga

### Kortsiktigt (1-2 månader)
- [ ] **Riktiga produktbilder** istället för placeholder
- [ ] **Automatisk prisuppdatering** via återförsäljares API:er
- [ ] **Fler fiskar** - utöka betrekommendationer för alla 28 fiskar
- [ ] **Databaslager** istället för JSON-filer

### Långsiktigt (3-6 månader)  
- [ ] **A/B-testning** av olika produktlayouter
- [ ] **Personliga rekommendationer** baserat på fiskehistorik
- [ ] **Email-notifieringar** vid prisändringar
- [ ] **Recensionssystem** från användare
- [ ] **Säsongsbaserade kampanjer** (vinterrea, vårpremiär)

## Juridiska överväganden

### GDPR-compliance
- Affiliate-tracking sparar IP-adresser → **Uppdatera privacy policy**
- Lägg till **cookie-banner** för tracking

### Marknadsföring
- **Markera tydligt** att länkar är affiliate-länkar 
- **"Vi får provision vid köp via våra länkar"** (redan implementerat)
- **Håll rekommendationer relevanta** - förtroendet är viktigast

## Sammanfattning

Du har nu ett komplett affiliate-system som:
1. ✅ **Visar relevanta beten** för varje fiskart
2. ✅ **Spårar klick och intäkter** automatiskt  
3. ✅ **Ger admin-överblick** över prestanda
4. ✅ **Är skalbart** för fler fiskar och återförsäljare
5. ✅ **Följer branschstandard** för affiliate-marknadsföring

**Nästa steg**: Kontakta svenska fiskeutrustningsbutiker för att förhandla affiliate-avtal och börja tjäna pengar på dina fiskeexpertis! 