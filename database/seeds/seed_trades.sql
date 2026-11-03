-- =============================================================================
--  Seed Trades: 10 Standard Society Trades
-- =============================================================================

INSERT INTO trade (name) VALUES
  ('Plumbing'),
  ('Electrical'),
  ('Carpentry'),
  ('Masonry'),
  ('HVAC / AC Repair'),
  ('Painting'),
  ('Pest Control'),
  ('Appliance Repair'),
  ('Housekeeping'),
  ('Elevator Maintenance')
ON CONFLICT (name) DO NOTHING;

