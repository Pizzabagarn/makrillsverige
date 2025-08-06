-- KOLLA VAD SOM FAKTISKT FINNS I TABELLEN
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'water_bodies_merged_fast_lookup'
ORDER BY ordinal_position;