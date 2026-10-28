// ─────────────────────────────────────────────────────────
//  run_schema.js – Execute schema.sql against the Neon DB
// ─────────────────────────────────────────────────────────
require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Drop all tables and custom types so the script is idempotent
const RESET_SQL = `
-- Drop tables in reverse FK order
DROP TABLE IF EXISTS user_session       CASCADE;
DROP TABLE IF EXISTS otp_request        CASCADE;
DROP TABLE IF EXISTS notification       CASCADE;
DROP TABLE IF EXISTS parameter          CASCADE;
DROP TABLE IF EXISTS resident_hold      CASCADE;
DROP TABLE IF EXISTS attachment         CASCADE;
DROP TABLE IF EXISTS role_permission    CASCADE;
DROP TABLE IF EXISTS action             CASCADE;
DROP TABLE IF EXISTS status_history     CASCADE;
DROP TABLE IF EXISTS ticket_role        CASCADE;
DROP TABLE IF EXISTS vendor_trade       CASCADE;
DROP TABLE IF EXISTS trade              CASCADE;
DROP TABLE IF EXISTS vendor             CASCADE;
DROP TABLE IF EXISTS complaint          CASCADE;
DROP TABLE IF EXISTS transition         CASCADE;
DROP TABLE IF EXISTS status             CASCADE;
DROP TABLE IF EXISTS complaint_category CASCADE;
DROP TABLE IF EXISTS resident           CASCADE;
DROP TABLE IF EXISTS common_area        CASCADE;
DROP TABLE IF EXISTS flat               CASCADE;
DROP TABLE IF EXISTS tower              CASCADE;
DROP TABLE IF EXISTS zone               CASCADE;
DROP TABLE IF EXISTS "user"             CASCADE;
DROP TABLE IF EXISTS "role"             CASCADE;

-- Drop custom ENUM types
DROP TYPE IF EXISTS severity_level    CASCADE;
DROP TYPE IF EXISTS handler_type      CASCADE;
DROP TYPE IF EXISTS phase_type        CASCADE;
DROP TYPE IF EXISTS resolution_type   CASCADE;
DROP TYPE IF EXISTS sendback_reason   CASCADE;
DROP TYPE IF EXISTS role_status_type  CASCADE;
DROP TYPE IF EXISTS event_type        CASCADE;
DROP TYPE IF EXISTS hold_type         CASCADE;
DROP TYPE IF EXISTS scope_type        CASCADE;
DROP TYPE IF EXISTS notification_type CASCADE;
DROP TYPE IF EXISTS auth_provider     CASCADE;
DROP TYPE IF EXISTS otp_channel       CASCADE;
`;

async function main() {
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');

    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        console.log('⏳  Connecting to Neon PostgreSQL …');
        await client.connect();
        console.log('✅  Connected.\n');

        console.log('🧹  Resetting existing schema …');
        await client.query(RESET_SQL);
        console.log('✅  Reset complete.\n');

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

