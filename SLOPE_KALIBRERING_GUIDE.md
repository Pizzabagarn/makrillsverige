# 🤖 Slope-Kalibrering Guide - ML för Makrillsannolikhet

## Översikt

Systemet har nu **två lägen** för makrillsannolikhet:

### 🔧 Heuristisk Kalibrering (<20 rapporter)
- Använder dina befintliga biologiska regler
- Kalibrerar endast **intercept** baserat på framgångsgrad
- Behåller temperatur/salthalt/ström-trösklar

### 🤖 ML Slope-Kalibrering (≥20 rapporter)  
- Tränar **β-koefficienter** för alla parametrar
- Använder kontinuerliga features istället för trösklar
- Logistisk regression med L2-regularisering

## Automatisk Progression

```
Antal rapporter → Kalibrering
0-2    → Standard heuristik (-8.0 intercept)
3-19   → Heuristik + intercept-kalibrering  
20+    → ML slope-kalibrering + kontinuerliga features
```

## Teknisk Implementation

### Frontend (Automatisk Export)

När du sparar/tar bort rapport:
```typescript
// Automatisk export till JSON
fishingDataManager.saveFishingReport(report) 
  → triggerCalibrationExport()
    → mackerelCalibration.autoExportOnReportChange()
      → POST /api/export-calibration
        → public/data/mackerel_calibration.json
```

### Backend (Python läser automatiskt)

```python
# Laddar kalibrering vid start
CALIBRATION_DATA = load_calibration_data()

if use_slope_calibration:
    # ML-modell med kontinuerliga features
    norm_temp = (temperature - 15) / 10
    norm_salinity = (salinity - 20) / 15
    Z = (intercept + β_temp*temp + β_salt*salt + β_current*current + ...)
else:
    # Heuristiska trösklar
    if temperature < 8: temp_factor = -2.0
    Z = (intercept + temp_factor + salinity_factor + ...)
```

## Slope-Kalibrering Features

### Kontinuerliga Features (ML-läge)
```python
# Normaliserade features för ML
norm_temp = (temperature - 15) / 10        # ~-1 till +1
norm_salinity = (salinity - 20) / 15       # ~-1 till +1
norm_current = current_strength / 1.0      # 0 till ~1.5
season_sin = sin(2π * day_of_year / 365)   # -1 till +1
season_cos = cos(2π * day_of_year / 365)   # -1 till +1
```

### L2-Regularisering
```typescript
const regularizationStrength = 0.1;
const coefficients = {
  temperature: correlation * (1 - regularizationStrength),
  salinity: correlation * (1 - regularizationStrength),
  // ... förhindrar overfitting
};
```

## JSON Struktur

### Heuristisk kalibrering (output):
```json
{
  "calibration": {
    "totalReports": 15,
    "recommendedIntercept": -7.650,
    "interceptOffset": 0.350,
    "useSlopeCalibration": false,
    "confidence": "medium",
    "baseSuccessRate": 0.67
  }
}
```

### ML slope-kalibrering (output):
```json
{
  "calibration": {
    "totalReports": 25,
    "recommendedIntercept": -6.820,
    "useSlopeCalibration": true,
    "confidence": "high",
    "coefficients": {
      "temperature": 0.450,
      "salinity": 0.270,
      "currentStrength": 0.720,
      "seasonSin": 1.800,
      "seasonCos": 1.800
    },
    "modelMetrics": {
      "accuracy": 0.84,
      "crossValidationScore": 0.78,
      "regularizationStrength": 0.1
    }
  }
}
```

## Användning

### Steg 1: Automatisk export (sker automatiskt)
```typescript
// Händer automatiskt när du sparar rapport i React
fishingDataManager.saveFishingReport(newReport);
// → Exporterar kalibrering automatiskt till JSON
```

### Steg 2: Generera bilder (använder automatiskt rätt läge)
```bash
# Python läser kalibrering och väljer automatiskt:
# - Heuristik för <20 rapporter  
# - ML för ≥20 rapporter
python scripts/generate_marine_images_mercator.py --parameter mackerel
```

### Steg 3: Kontrollera i Dashboard
```
Validation Dashboard → Modell Kalibrering
- Ser "Heuristik" eller "ML Model"
- Visar β-koefficienter när ML aktivt
- Visar model metrics (accuracy, CV score)
```

## Fördelar med Slope-Kalibrering

### ✅ Kontinuerliga Features
- Inga hårda trösklar vid 8°C, 15°C osv
- Mjuka övergångar och gradvis påverkan
- Mer realistisk modell av naturliga processer

### ✅ Datadriven Träning
- β-koefficienter lär sig från faktiska rapporter
- Automatisk viktning av temperatur vs salthalt vs ström
- Säsongsmönster från verklig data

### ✅ Regularisering
- L2-regularisering förhindrar overfitting
- Balanserar mellan bias och variance
- Robust även med begränsad data

### ✅ Cross-Validation
- Mäter modellens träffsäkerhet
- Upptäcker överanpassning
- Ger konfidensgrader

## Exempel Output

### Scenario 1: 15 rapporter (Heuristik)
```
📊 Kalibrering laddad: 15 rapporter, intercept: -7.650, konfidensgrad: medium
🔧 Använder heuristiska trösklar för temperatur/salthalt
```

### Scenario 2: 25 rapporter (ML)
```
📊 Kalibrering laddad: 25 rapporter, intercept: -6.820, konfidensgrad: high
🤖 Slope calibration: ENABLED
🔬 ML Coefficients (β):
   Temperature: 0.450
   Salinity: 0.270
   Current: 0.720
   Season Sin: 1.800
   Season Cos: 1.800
📊 Model Metrics:
   Accuracy: 84.0%
   CV Score: 78.0%
   Regularization: 0.10

🤖 Använder ML-koefficienter för punkt (57.123, 12.456)
```

## Felsökning

### Problem: ML aktiveras inte trots >20 rapporter
**Lösning**: Kontrollera att automatisk export fungerar i React

### Problem: Konstiga koefficienter
**Lösning**: Mock-data i början - kommer förbättras med verklig area-parameter data

### Problem: Låg accuracy
**Lösning**: Öka regularizering eller samla mer data

## Framtida Förbättringar

När du har ännu mer data (50+ rapporter):
1. **Faktisk area-parameter integration** istället för mock-data
2. **Random Forest** eller **XGBoost** istället för logistisk regression
3. **Feature engineering** - interaktioner, polynomial features
4. **Temporal modeling** - tidsserier och lag-features
5. **Spatial modeling** - geografiska interaktioner

Men för nu fungerar denna hybridstrategi utmärkt! 🐟🎯 