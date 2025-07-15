# Fiskdata Träning Guide 🐟

## Översikt

Du har nu ett komplett system för att samla in verklig fiskdata och träna din makrillsannolikthet-modell med machine learning. Här är hur hela processen fungerar:

## 1. Dataregistrering (Frontend)

### Högerklick på Kartan
- **Högerklicka** på kartan för att öppna kontextmenyn
- Välj **"Registrera fiskdata"**
- Formuläret öppnas med automatisk geografisk placering

### Fiskdata Formulär
Formuläret samlar in:
- **Datumintervall**: Från-till datum för fiskeperioden
- **Tidsintervall**: Timmar på dagen när det fiskades
- **Plats**: Bounding box (automatiskt förifyllt från klickposition)
- **Fiskekvalitet**: 
  - 🐟🐟🐟 **Excellent** (1.0) - Fantastiskt fiske
  - 🐟🐟 **Good** (0.8) - Bra fiske
  - 🐟 **Fair** (0.6) - OK fiske
  - ⚪ **Poor** (0.3) - Dåligt fiske
  - ❌ **None** (0.0) - Inget fiske
- **Anteckningar**: Valfri fritext

### Datalagring
- Data sparas i **localStorage** för omedelbar åtkomst
- Formuläret visar befintliga rapporter och statistik
- Möjlighet att ta bort felaktiga rapporter

## 2. Dataexport

### Från Kontextmenyn
- Högerklicka på kartan
- Välj **"Exportera träningsdata"**
- JSON-fil laddas ned automatiskt

### Exporterad Data Format
```json
{
  "reports": [
    {
      "id": "unique_id",
      "dateRange": {
        "start": "2024-01-15",
        "end": "2024-01-17"
      },
      "timeRange": {
        "start": "06:00",
        "end": "18:00"
      },
      "location": {
        "bounds": {
          "north": 57.01,
          "south": 56.99,
          "east": 12.01,
          "west": 11.99
        },
        "centerLat": 57.0,
        "centerLng": 12.0
      },
      "quality": "good",
      "notes": "Bra fiske nära klipporna",
      "timestamp": "2024-01-15T10:30:00Z",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ],
  "exportedAt": "2024-01-15T10:30:00Z",
  "format": "fishing_data_v1"
}
```

## 3. Modell Träning (Python)

### Installation
```bash
pip install scikit-learn pandas numpy matplotlib seaborn
```

### Grundläggande Träning
```bash
python scripts/train_mackerel_model.py --data fishing_data_export_2024-01-15.json
```

### Träningsprocessen
1. **Datainladdning**: Läser JSON-exporten
2. **Punktgenerering**: Skapar träningspunkter från bounding boxes
3. **Feature Engineering**: 
   - Temperatur, salthalt, strömstyrka, strömriktning
   - Årstidsfaktorer (sin/cos)
   - Historiska värden
4. **Modell Träning**: Logistisk regression med standardisering
5. **Validering**: Cross-validation och testset-evaluering

### Resultat
Träningen producerar:
- **Tränad modell**: `trained_mackerel_model.pkl`
- **Koefficienter**: `trained_coefficients.json`
- **Prestanda-plot**: `mackerel_model_results.png`
- **Konsol-utskrift**: Koefficienter för copy-paste

## 4. Integrering med Bildgeneration

### Från Estimerade till Tränade Koefficienter

**Nuvarande (Estimerade):**
```python
# Estimerade koefficienter baserat på ekologisk kunskap
beta_0 = -10.0    # Intercept
beta_1 = 0.5      # Temperatur
beta_2 = 0.2      # Salthalt
# ... etc
```

**Efter Träning:**
```python
# Tränade koefficienter från verklig data
beta_0 = -8.234   # Från trained_coefficients.json
beta_1 = 0.723    # Från träningsresultat
beta_2 = 0.156    # Optimerade värden
# ... etc
```

### Uppdatering av generate_marine_images_mercator.py

1. **Läs träningsresultat**:
```bash
python scripts/train_mackerel_model.py --data fishing_data_export.json
```

2. **Copy-paste nya koefficienter**:
```
Coefficients for generate_marine_images_mercator.py:
β₀ (intercept) = -8.234
β₁ (temperature) = 0.723
β₂ (salinity) = 0.156
...
```

3. **Uppdatera koefficienterna** i Python-scriptet

4. **Generera nya bilder**:
```bash
# Regenerera makrillbilder med nya koefficienter
python scripts/generate_marine_images_mercator.py --parameter mackerel
```

## 5. Förbättringar över Tid

### Mer Data = Bättre Modell
- Ju fler fiskrapporter, desto bättre träning
- Modellen lär sig verkliga mönster från din data
- Kontinuerlig förbättring med nya rapporter

### Säsongsbaserad Träning
- Samla data över olika årstider
- Modellen upptäcker säsongsmönster automatiskt
- Bättre prediktioner för olika tider på året

### Regionala Skillnader
- Data från olika områden förbättrar generalisering
- Modellen lär sig geografiska variationer
- Bättre täckning av svenska vatten

## 6. Teknisk Arkitektur

```
[Frontend] → [localStorage] → [Export] → [Python Training] → [Coefficients] → [Image Generation]
     ↓              ↓             ↓           ↓                    ↓              ↓
[Högerklick]   [Formulär]   [JSON-fil]   [Scikit-learn]   [trained_coefficients.json]  [PNG-bilder]
```

## 7. Arbetsflöde

### Veckovis Uppdatering
1. **Samla data**: Registrera fiskrapporter under veckan
2. **Exportera**: Högerklicka → Exportera träningsdata
3. **Träna**: Kör Python-script med ny data
4. **Uppdatera**: Copy-paste nya koefficienter
5. **Generera**: Skapa nya makrillsannolikhet-bilder

### Kvalitetskontroll
- Granska träningsresultat (accuracy, AUC-ROC)
- Validera med cross-validation
- Jämför med tidigare modeller
- Kontrollera feature importance

## 8. Felsökning

### Inga Träningsdata
```
Error: No fishing reports found in data file
```
**Lösning**: Registrera fiskrapporter i frontend först

### Dålig Modellprestanda
```
Test Accuracy: 0.456 (låg)
```
**Lösning**: 
- Samla mer data
- Kontrollera datakvalitet
- Balansera "good" vs "poor" fishing rapporter

### Träningsfel
```
Error: Features shape mismatch
```
**Lösning**: 
- Kontrollera att alla features finns
- Uppdatera feature_columns i training script

## 9. Framtida Förbättringar

### Verklig Marin Data
- Integrera med DMI API för exakta värden
- Ersätt estimerade värden med verkliga mätningar
- Förbättra prediktionsnoggranhet

### Avancerade Modeller
- Random Forest för icke-linjära samband
- Neural Networks för komplexa mönster
- Ensemble-metoder för robusthet

### Realtids-uppdateringar
- Automatisk omträning vid ny data
- Live-uppdatering av prediktioner
- Kontinuerlig modellförbättring

## 10. Slutsats

Du har nu ett komplett system för att:
- ✅ Samla in verklig fiskdata via din webapp
- ✅ Exportera data för machine learning
- ✅ Träna modeller med scikit-learn
- ✅ Integrera tränade koefficienter i bildgeneration
- ✅ Förbättra prediktioner över tid

Detta tar din makrillprediktion från "teoretisk" till "data-driven" och ger dig möjlighet att kontinuerligt förbättra noggrannheten baserat på verklig fiskdata!

---

**Nästa steg**: Börja registrera fiskrapporter och träna din första modell! 🎣 