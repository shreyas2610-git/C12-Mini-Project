// ─────────────────────────────────────────────────────────
//  run_schema.js – Execute schema.sql against the Neon DB
// ─────────────────────────────────────────────────────────
require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function main() {
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');

    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        console.log('⏳  Connecting to Neon PostgreSQL …');
        await client.connect();
        console.log('✅  Connected.\n');

        console.log('⏳  Running schema.sql …');
        await client.query(sql);
        console.log('✅  Schema created successfully!\n');

        // Quick verification
        const res = await client.query(`
            SELECT table_name
            FROM   information_schema.tables
            WHERE  table_schema = 'public'
            ORDER  BY table_name;
        `);
        console.log(`📊  Tables created (${res.rows.length}):`);
        res.rows.forEach((r, i) => console.log(`    ${i + 1}. ${r.table_name}`));
    } catch (err) {
        console.error('❌  Error:', err.message);
        process.exit(1);
    } finally {
        await client.end();
        console.log('\n🔌  Connection closed.');
    }
}

main();
