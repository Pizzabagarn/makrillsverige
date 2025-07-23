# 🗄️ Supabase Setup Guide för Saved Baits

## Steg 1: Logga in på Supabase Dashboard

1. Gå till https://supabase.com/dashboard
2. Logga in på ditt konto
3. Välj ditt projekt (makrillsverige)

## Steg 2: Skapa tabellen

1. Klicka på **"SQL Editor"** i vänster menyn
2. Klicka på **"New Query"**
3. Kopiera och klistra in SQL-koden från `supabase_table_setup.sql`
4. Klicka på **"Run"** för att skapa tabellen

## Steg 3: Verifiera tabellen

1. Gå till **"Table Editor"** i vänster menyn
2. Du borde se tabellen `saved_baits` i listan
3. Klicka på den för att se kolumnerna

## Steg 4: Testa systemet

### Lokalt:
- Systemet använder nu Supabase istället för filer
- Alla sparade beten lagras i databasen
- Fungerar exakt som innan men är nu permanent

### På Vercel:
- **Fungerar automatiskt!** 🎉
- Ingen ytterligare konfiguration behövs
- Samma data både lokalt och på Vercel

## 🔧 Miljövariabler

Du behöver dessa i både `.env.local` (lokalt) och Vercel (produktion):

```env
NEXT_PUBLIC_SUPABASE_URL=din_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=din_anon_key
```

**Dessa finns redan i ditt projekt! ✅**

## 🚀 Efter Setup

När tabellen är skapad:

1. **Lokalt:** Systemet fungerar direkt med Supabase
2. **Vercel:** Pusha till main - systemet fungerar direkt
3. **Admin-panel:** Fungerar på både localhost och Vercel
4. **Data:** Synkroniseras automatiskt överallt

## 🔒 Säkerhet (Valfritt)

Om du vill begränsa vem som kan lägga till/redigera beten:

1. Gå till **"Authentication"** → **"Policies"**
2. Klicka på `saved_baits` tabellen
3. Aktivera **"Enable RLS"**
4. Lägg till policies för vem som får läsa/skriva

**För nu: Alla kan läsa/skriva (enklast för development)**

## ✅ Verifiering

Efter setup ska du kunna:
- ✅ Lägga till beten via admin-panelen
- ✅ Se beten på fiskinformationssidan
- ✅ Ta bort beten
- ✅ Sätta stjärnbetyg
- ✅ Allt fungerar både lokalt OCH på Vercel

## 🆘 Felsökning

**Problem:** "Failed to load saved baits"
**Lösning:** Kontrollera att tabellen är skapad och miljövariabler är korrekta

**Problem:** "Insert/Update failed"
**Lösning:** Kontrollera RLS-policies om de är aktiverade 