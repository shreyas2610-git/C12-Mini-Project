require('dotenv').config();
const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}
const { Client } = require('pg');

async function runMigration() {
  let client;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      client = new Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
      console.log(`Connected on attempt ${attempt}.`);
      break;
    } catch (err) {
      console.log(`Connection attempt ${attempt} failed (${err.code || err.message}). Retrying in 2s...`);
      if (attempt === 6) throw err;
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  try {
    await client.query('BEGIN');

    // 1. Add urgent_flag, title, clarification fields to complaint table
    console.log('Adding columns to complaint table...');
    await client.query(`
      ALTER TABLE complaint
        ADD COLUMN IF NOT EXISTS urgent_flag BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS title VARCHAR(150),
        ADD COLUMN IF NOT EXISTS clarification_question TEXT,
        ADD COLUMN IF NOT EXISTS clarification_reply TEXT,
        ADD COLUMN IF NOT EXISTS clarification_due_at TIMESTAMPTZ;
    `);

    // 2. Add title column to notification table
    console.log('Adding title column to notification table...');
    await client.query(`
      ALTER TABLE notification
        ADD COLUMN IF NOT EXISTS title VARCHAR(150);
    `);

    // 3. Populate title for existing sample complaints where title is null
    console.log('Backfilling titles for existing complaints...');
    await client.query(`
      UPDATE complaint c
      SET title = cat.name
      FROM complaint_category cat
      WHERE c.category_id = cat.category_id
        AND (c.title IS NULL OR c.title = '');
    `);

    await client.query('COMMIT');
    console.log('Migration completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
