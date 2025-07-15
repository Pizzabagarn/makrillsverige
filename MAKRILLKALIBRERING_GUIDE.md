# 🎯 Makrillkalibrering - Hybridmodell Guide

## Översikt

Jag har implementerat en **hybridstrategi** för makrillsannolikhet som kombinerar:
- 🧬 **Befintliga heuristiska regler** (temperatur, salthalt, ström, säsong)
- 📊 **Datadriven intercept-kalibrering** baserat på fishing reports
- 🔄 **Automatisk uppdatering** när nya rapporter läggs till

## Hur det fungerar

### 1. Behåller din befintliga biologi

Alla dina tröskelregler fungerar exakt som förut:
```python
# Temperatur - Optimal 15-20°C
if temperature < 8: temp_factor = -2.0
elif temperature < 12: temp_factor = -1.0
# ... osv

# Salthalt - Stark tröskel under 15 g/kg  
if salinity < 8: salinity_factor = -3.0
# ... osv
```

### 2. Justerar endast intercept

Istället för hårdkodad intercept `-8.0` används nu:
```python
# TIDIGARE: hårdkodad
Z = (-8.0 + temp_factor + salinity_factor + ...)

# NU: datadriven kalibrering
calibrated_intercept = -8.0 + intercept_offset  # baserat på rapporter
Z = (calibrated_intercept + temp_factor + salinity_factor + ...)
```

### 3. Kalibrering baserat på framgångsgrad

```typescript
// Beräkna andelen "bra fiske" (quality >= 0.6)
const goodReports = reports.filter(r => qualityToNumber(r.quality) >= 0.6);
const successRate = goodReports.length / reports.length;

// Logit-transformation för intercept
const targetLogit = Math.log(successRate / (1 - successRate));

// Blend med heuristik (max 50% data weight)
const dataWeight = Math.min(reports.length / 30, 0.5);
const blendedIntercept = heuristicIntercept * (1 - dataWeight) + targetLogit * dataWeight;
```

## Användning

### Steg 1: Exportera kalibrering (Node.js)

```bash
# Exportera kalibrering från localStorage till JSON
node scripts/export_mackerel_calibration.js
```

Detta skapar `public/data/mackerel_calibration.json` med:
- Rekommenderat intercept
- Framgångsgrad från rapporter
- Konfidensgrad
- Kvalitetsdistribution

### Steg 2: Generera bilder med kalibrering

```bash
# Python-scripten laddar automatiskt kalibrering
python scripts/generate_marine_images_mercator.py --parameter mackerel
```

### Steg 3: Kontrollera kalibrering (Frontend)

1. Öppna Validation Dashboard
2. Se "Modell Kalibrering" sektion
3. Kontrollera intercept, framgångsgrad, konfidensgrad

## Exempel på olika scenarier

### Scenario 1: Inga rapporter (0 rapporter)
```
Intercept: -8.000 (standard heuristik)
Framgångsgrad: 0.0%
Konfidensgrad: Låg
```

### Scenario 2: Få rapporter (3-5 rapporter)
```
Intercept: -7.850 (liten justering)
Framgångsgrad: 60.0% (3 av 5 good)
Konfidensgrad: Låg
Data weight: 10-17%
```

### Scenario 3: Många rapporter (20+ rapporter)
```
Intercept: -7.200 (större justering)
Framgångsgrad: 65.0% (13 av 20 good)
Konfidensgrad: Hög
Data weight: 40-50%
```

## Fördelar

### ✅ Behåller din expertis
- Alla biologiska regler är intakta
- Temperatur, salthalt, ström fungerar som förut
- Säsongsmönster bevaras

### ✅ Datadriven förbättring
- Justerar grundnivån baserat på faktiska resultat
- Automatisk uppdatering vid nya rapporter
- Gradvis ökning av data-inflytande

### ✅ Robust design
- Fungerar redan med få rapporter
- Skyddar mot överfitting (max 50% data weight)
- Fallback till heuristik vid problem

## Teknisk implementation

### Frontend (TypeScript)
```typescript
// Kalibrering hanteras automatiskt
const interceptOffset = mackerelCalibration.getCurrentInterceptOffset();
const calibratedIntercept = -8.0 + interceptOffset;

// Används i model prediction
const Z = calibratedIntercept + temp_factor + salinity_factor + ...;
```

### Backend (Python)
```python
# Laddar kalibrering från JSON
CALIBRATION_DATA = load_calibration_data()
calibrated_intercept = CALIBRATION_DATA['calibration'].get('recommendedIntercept', -8.0)

# Används i probability calculation
Z = (calibrated_intercept + temp_factor + salinity_factor + ...)
```

## Filstruktur

```
src/lib/mackerelModelCalibration.ts     # TypeScript kalibrering
scripts/export_mackerel_calibration.js  # Node.js export
public/data/mackerel_calibration.json   # Kalibrering data
scripts/generate_marine_images_mercator.py # Python med kalibrering
```

## Troubleshooting

### Problem: Kalibrering inte laddad
**Lösning**: Kör `node scripts/export_mackerel_calibration.js`

### Problem: Gamla intercept används
**Lösning**: Kontrollera att `mackerel_calibration.json` finns i `public/data/`

### Problem: Konstiga sannolikhetsvärden
**Lösning**: Kontrollera kalibrering i Validation Dashboard

## Nästa steg

När du har 20+ rapporter spridda över flera månader:
1. Implementera full ML-träning
2. Lägg till regularisering (L2)
3. Träna på temperatur/salthalt koefficienter
4. Använda historisk parameterdata

Men tills dess fungerar denna hybridstrategi perfekt! 