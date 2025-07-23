-- Skapa tabell för sparade beten
CREATE TABLE saved_baits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  price DECIMAL(10,2),
  original_price DECIMAL(10,2),
  currency TEXT DEFAULT 'SEK',
  image TEXT,
  description TEXT,
  in_stock BOOLEAN DEFAULT true,
  retailer TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  category TEXT,
  brand TEXT,
  effectiveness INTEGER CHECK (effectiveness >= 1 AND effectiveness <= 5) DEFAULT 5,
  fish_species TEXT[] DEFAULT '{}',
  techniques TEXT[] DEFAULT '{}',
  seasons TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index för bättre prestanda
CREATE INDEX idx_saved_baits_fish_species ON saved_baits USING GIN (fish_species);
CREATE INDEX idx_saved_baits_retailer ON saved_baits (retailer);
CREATE INDEX idx_saved_baits_category ON saved_baits (category);

-- RLS (Row Level Security) - välj baserat på dina behov
-- ALTER TABLE saved_baits ENABLE ROW LEVEL SECURITY;

-- Om du vill att alla ska kunna se beten men bara admins redigera:
-- CREATE POLICY "Anyone can read saved_baits" ON saved_baits FOR SELECT TO PUBLIC USING (true);
-- CREATE POLICY "Only authenticated users can insert" ON saved_baits FOR INSERT TO authenticated USING (true);
-- CREATE POLICY "Only authenticated users can update" ON saved_baits FOR UPDATE TO authenticated USING (true);
-- CREATE POLICY "Only authenticated users can delete" ON saved_baits FOR DELETE TO authenticated USING (true);

-- Trigger för auto-update av updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_saved_baits_updated_at BEFORE UPDATE ON saved_baits FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); 