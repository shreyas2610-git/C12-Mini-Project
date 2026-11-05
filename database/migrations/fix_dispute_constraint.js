require('dotenv').config();
const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}
const { Client } = require('pg');

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log('Connected to Neon DB.');

  try {
    await client.query('BEGIN');

    console.log('Updating i1_resolution_closed constraint to support Disputed status...');
    await client.query(`
      ALTER TABLE complaint DROP CONSTRAINT IF EXISTS i1_resolution_closed;
      ALTER TABLE complaint ADD CONSTRAINT i1_resolution_closed CHECK (
        (status = 'Closed' AND resolution IS NOT NULL) OR
        (status = 'Disputed') OR
        (status NOT IN ('Closed', 'Disputed') AND resolution IS NULL)
      );
    `);

    await client.query('COMMIT');
    console.log('✅ Constraint i1_resolution_closed updated successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
