-- =============================================================================
--  Seed Society: 3 Zones, 7 Flower Towers, 5 Floors x 5 Houses = 175 Flats
-- =============================================================================

-- 1. Insert 3 Zones
INSERT INTO zone (name) VALUES
  ('Zone 1'),
  ('Zone 2'),
  ('Zone 3')
ON CONFLICT (name) DO NOTHING;

-- 2. Insert 7 Towers named after common flowers
INSERT INTO tower (zone_id, name)
SELECT z.zone_id, t.name
FROM (VALUES
  ('Zone 1', 'Rose'),
  ('Zone 1', 'Lotus'),
  ('Zone 1', 'Jasmine'),
  ('Zone 2', 'Marigold'),
  ('Zone 2', 'Lily'),
  ('Zone 3', 'Orchid'),
  ('Zone 3', 'Tulip')
) AS t(zone_name, name)
JOIN zone z ON z.name = t.zone_name
ON CONFLICT (name) DO NOTHING;

-- 3. Insert 25 flats per tower across 5 floors (5 houses per floor)
INSERT INTO flat (tower_id, flat_number)
SELECT tw.tower_id, f.flat_number
FROM tower tw
CROSS JOIN (
  VALUES
    ('101'), ('102'), ('103'), ('104'), ('105'),
    ('201'), ('202'), ('203'), ('204'), ('205'),
    ('301'), ('302'), ('303'), ('304'), ('305'),
    ('401'), ('402'), ('403'), ('404'), ('405'),
    ('501'), ('502'), ('503'), ('504'), ('505')
) AS f(flat_number)
ON CONFLICT (tower_id, flat_number) DO NOTHING;

