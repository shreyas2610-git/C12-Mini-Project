require('dotenv').config();
const { Client } = require('pg');

const SEED_SQL = `
-- Zones
INSERT INTO zone (name) VALUES 
  ('North Zone'),
  ('South Zone'),
  ('East Zone'),
  ('West Zone')
ON CONFLICT (name) DO NOTHING;

-- Towers
INSERT INTO tower (zone_id, name)
SELECT z.zone_id, t.name
FROM (VALUES 
  ('North Zone', 'Tower A'),
  ('North Zone', 'Tower B'),
  ('South Zone', 'Tower C'),
  ('South Zone', 'Tower D'),
  ('East Zone',  'Tower E'),
  ('West Zone',  'Tower F')
) AS t(zone_name, name)
JOIN zone z ON z.name = t.zone_name
ON CONFLICT (name) DO NOTHING;

-- Flats
INSERT INTO flat (tower_id, flat_number)
SELECT tw.tower_id, f.flat_number
FROM tower tw
CROSS JOIN (VALUES ('101'), ('102'), ('201'), ('202'), ('301'), ('302')) AS f(flat_number)
ON CONFLICT (tower_id, flat_number) DO NOTHING;

-- Trades
INSERT INTO trade (name) VALUES 
  ('Plumbing'),
  ('Electrical'),
  ('Carpentry'),
  ('Masonry'),
  ('HVAC / AC Repair'),
  ('Painting'),
  ('Pest Control'),
  ('Appliance Repair')
ON CONFLICT (name) DO NOTHING;
`;

async function seed() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    console.log('Seeding lookup tables (zones, towers, flats, trades)...');
    await client.query(SEED_SQL);
    console.log('✅ Seed completed successfully.');
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seed();

