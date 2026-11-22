require('dotenv').config();
const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}
const { Client } = require('pg');

const DDL = `
-- 1. Ensure Trade 11 exists
INSERT INTO trade (name) VALUES ('Fire & Gas Safety') ON CONFLICT (name) DO NOTHING;

-- 2. Alter complaint_category to add default_trade_id, level, severity_points
ALTER TABLE complaint_category 
  ADD COLUMN IF NOT EXISTS default_trade_id INT REFERENCES trade(trade_id),
  ADD COLUMN IF NOT EXISTS level INT CHECK (level BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS severity_points INT;

-- 3. Update ticket_role status to simple ('Open', 'In Progress', 'Done')
ALTER TABLE ticket_role ALTER COLUMN role_status DROP DEFAULT;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'role_status_type') THEN
    ALTER TYPE role_status_type RENAME TO role_status_type_old;
  END IF;
END$$;

CREATE TYPE role_status_type AS ENUM ('Open', 'In Progress', 'Done');

ALTER TABLE ticket_role 
  ALTER COLUMN role_status TYPE role_status_type 
  USING 'Open'::role_status_type;

ALTER TABLE ticket_role ALTER COLUMN role_status SET DEFAULT 'Open';

DROP TYPE IF EXISTS role_status_type_old CASCADE;

-- 4. Alter zone to support both zm_user_id and zone_manager_id
ALTER TABLE zone ADD COLUMN IF NOT EXISTS zone_manager_id INT REFERENCES "user"(user_id);

-- 5. Alter vendor to support max_concurrent_jobs and active_load
ALTER TABLE vendor 
  ADD COLUMN IF NOT EXISTS max_concurrent_jobs INT,
  ADD COLUMN IF NOT EXISTS active_load INT DEFAULT 0;

-- 6. Ensure status table has Completed and Escalated
INSERT INTO status (status_code, label, is_open) VALUES
  ('Completed',  'Completed',  TRUE),
  ('Escalated',  'Escalated',  TRUE)
ON CONFLICT (status_code) DO NOTHING;
`;

async function runMigration() {
  let client;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      client = new Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
      break;
    } catch (err) {
      console.log(`Connection attempt ${attempt} failed: ${err.message}. Retrying...`);
      if (attempt === 5) throw err;
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  try {
    console.log('Running v0.5 DDL migration...');
    await client.query(DDL);
    console.log('✅ v0.5 DDL migration completed successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    if (client) await client.end();
  }
}

runMigration();

