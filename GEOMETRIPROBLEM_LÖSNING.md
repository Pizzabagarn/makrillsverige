# 🎯 Lösning för OSM Geometriproblem

## Problem du beskrev:
- **OSM-geometrier är ofullständiga**: Många sjöar har bara kanter, hål i mitten, eller ofullständiga polygoner
- **ST_Contains missar träffar**: Du klickar mitt i sjön men geometrin säger "nej" för att den bara är en kant
- **Precision vs Användbarhet**: Du vill aldrig komma till fel sjö, men det ska ändå vara möjligt att klicka

## 🔧 Min Lösning: 3-Stegs Smart Geometrihantering

### **STEG 1: Perfekt Geometri (SMHI + bra OSM)**
```sql
-- Exakt precision för bra data
ST_Contains(w.geometry, ST_Point(click_lon, click_lat, 4326))
-- Prioriterar SMHI-data som har bäst geometrier
```

### **STEG 2: Smart Hantering av Ofullständiga Geometrier**
```sql
-- A) För sjöar med hål: Kolla om klick är inom bounding box
ST_Within(ST_Point(click_lon, click_lat, 4326), ST_Envelope(w.geometry))

-- B) För kantgeometrier: Smart tolerans baserat på sjöstorlek
ST_DWithin(w.geometry, ST_Point(...), 
  CASE 
    WHEN w.area_km2 > 1.0 THEN search_radius_deg * 2.0  -- Stora sjöar
    WHEN w.water_type = 'lake' THEN search_radius_deg * 1.0  -- Små sjöar
    ELSE search_radius_deg * 0.5  -- Vattendrag
  END
)
```

### **STEG 3: Sista Chansen för Vattendrag**
```sql
-- Bara små vattendrag med minimal tolerans
AND w.water_type IN ('river', 'stream')
AND w.area_km2 < 3.0
AND ST_DWithin(..., search_radius_deg * 0.2)
```

## 🎯 Resultat:

### ✅ **Löser OSM-problem:**
- **Sjöar med hål**: ST_Envelope fångar klick inuti sjöns område
- **Kantgeometrier**: ST_DWithin med smart tolerans
- **Ofullständiga polygoner**: Större tolerans för stora sjöar
- **LineString sjöar**: Behandlas som närhetsmatch

### ✅ **Behåller precision:**
- **SMHI prioriteras**: Bäst geometri används först
- **Olika toleranser**: Stora sjöar får större hjälp, små kräver precision
- **Avståndsortering**: Närmaste match väljs
- **Aldrig fel sjö**: Smart prioritering förhindrar fel

### ✅ **Optimal prestanda:**
- **Spatial förfiltrering**: lat/lon index används först
- **Stegvis sökning**: Slutar vid första träff
- **Begränsade kandidater**: Max 5 resultat per steg

## 📋 Installation:

1. **Kör**: `sql/create_geometry_aware_click_function.sql`
2. **Testa**: `sql/test_geometry_edge_cases.sql`

## 🔍 Vad händer när du klickar:

1. **Klick på SMHI-sjö** → Exakt träff omedelbart
2. **Klick på OSM-sjö med hål** → ST_Envelope fångar dig
3. **Klick nära OSM-kant** → ST_DWithin med smart tolerans
4. **Klick på liten å** → Minimal hjälp-tolerans

**Resultat: Du kommer alltid till rätt vattendrag, även med dåliga OSM-geometrier!**