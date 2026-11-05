require('dotenv').config();
const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const PASSWORD_HASH = '$2b$12$M1ufQHomID8I870j3dwU9OXmp/i3ae6fZ.Rg7FfFa1TatZPpqxwA.'; // Password123!

async function seed() {
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
    console.log('--- 1. Applying seed_all.sql (Trades, Categories, Common Areas, Actions, Permissions, Transitions) ---');
    const sqlAll = fs.readFileSync(path.join(__dirname, 'seed_all.sql'), 'utf-8');
    await client.query(sqlAll);
    console.log('✅ Applied seed_all.sql');

    // Add priority_score column if not present
    await client.query(`
      ALTER TABLE complaint ADD COLUMN IF NOT EXISTS priority_score INT DEFAULT 0;
    `);

    console.log('--- 2. Seeding Staff & Resident Users ---');
    // Ensure roles exist
    const roleRows = await client.query('SELECT role_id, name FROM role');
    const roleMap = {};
    roleRows.rows.forEach(r => { roleMap[r.name] = r.role_id; });

    // GM User
    const gmRes = await client.query(`
      INSERT INTO "user" (role_id, full_name, email, phone, password_hash, auth_provider)
      VALUES ($1, 'General Manager', 'gm@society.com', '+91-9876500001', $2, 'password')
      ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
      RETURNING user_id;
    `, [roleMap['GM'], PASSWORD_HASH]);
    const gmUserId = gmRes.rows[0].user_id;

    // Coordinator User
    const coordRes = await client.query(`
      INSERT INTO "user" (role_id, full_name, email, phone, password_hash, auth_provider)
      VALUES ($1, 'Helpdesk Coordinator', 'coordinator@society.com', '+91-9876500002', $2, 'password')
      ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
      RETURNING user_id;
    `, [roleMap['Coordinator'], PASSWORD_HASH]);

    // 3 Zone Managers
    const zmData = [
      { name: 'Ramesh (ZM Zone 1)', email: 'zm1@society.com', phone: '+91-9876500011', zone: 'Zone 1' },
      { name: 'Vikram (ZM Zone 2)', email: 'zm2@society.com', phone: '+91-9876500012', zone: 'Zone 2' },
      { name: 'Sunil (ZM Zone 3)',  email: 'zm3@society.com', phone: '+91-9876500013', zone: 'Zone 3' }
    ];

    for (const zm of zmData) {
      const uRes = await client.query(`
        INSERT INTO "user" (role_id, full_name, email, phone, password_hash, auth_provider)
        VALUES ($1, $2, $3, $4, $5, 'password')
        ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
        RETURNING user_id;
      `, [roleMap['ZM'], zm.name, zm.email, zm.phone, PASSWORD_HASH]);
      const zmUid = uRes.rows[0].user_id;

      await client.query(`
        UPDATE zone 
        SET zm_user_id = $1, zone_manager_id = $1 
        WHERE name = $2;
      `, [zmUid, zm.zone]);
    }

    // 5 Residents
    const flatRows = await client.query('SELECT flat_id, tower_id, flat_number FROM flat ORDER BY flat_id LIMIT 10');
    const resData = [
      { name: 'Aarav Patel',  email: 'resident1@society.com', phone: '+91-9876510001', flat_id: flatRows.rows[0].flat_id },
      { name: 'Pooja Sharma', email: 'resident2@society.com', phone: '+91-9876510002', flat_id: flatRows.rows[1].flat_id },
      { name: 'Rohan Verma',  email: 'resident3@society.com', phone: '+91-9876510003', flat_id: flatRows.rows[2].flat_id },
      { name: 'Ananya Iyer',  email: 'resident4@society.com', phone: '+91-9876510004', flat_id: flatRows.rows[3].flat_id },
      { name: 'Kabir Mehta',  email: 'resident5@society.com', phone: '+91-9876510005', flat_id: flatRows.rows[4].flat_id }
    ];

    const residentIds = [];
    for (const res of resData) {
      const uRes = await client.query(`
        INSERT INTO "user" (role_id, full_name, email, phone, password_hash, auth_provider)
        VALUES ($1, $2, $3, $4, $5, 'password')
        ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
        RETURNING user_id;
      `, [roleMap['Resident'], res.name, res.email, res.phone, PASSWORD_HASH]);
      const uid = uRes.rows[0].user_id;
      residentIds.push({ user_id: uid, flat_id: res.flat_id });

      await client.query(`
        INSERT INTO resident (resident_id, flat_id)
        VALUES ($1, $2)
        ON CONFLICT (resident_id) DO UPDATE SET flat_id = EXCLUDED.flat_id;
      `, [uid, res.flat_id]);
    }
    console.log('✅ Staff and Residents seeded.');

    console.log('--- 3. Seeding 22 Vendors (2 per trade across all 11 trades) ---');
    const trades = (await client.query('SELECT trade_id, name FROM trade ORDER BY trade_id')).rows;
    for (const tr of trades) {
      const safeName = tr.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const vConfigs = [
        { name: `${tr.name} Pros A`, email: `vendor_${safeName}_1@society.com`, phone: `+91-987652${tr.trade_id}01`, company: `Ace ${tr.name} Pvt Ltd`, cap: 5 },
        { name: `${tr.name} Pros B`, email: `vendor_${safeName}_2@society.com`, phone: `+91-987652${tr.trade_id}02`, company: `Quick ${tr.name} Solutions`, cap: 4 }
      ];

      for (const vc of vConfigs) {
        const uRes = await client.query(`
          INSERT INTO "user" (role_id, full_name, email, phone, password_hash, auth_provider)
          VALUES ($1, $2, $3, $4, $5, 'password')
          ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
          RETURNING user_id;
        `, [roleMap['Vendor'], vc.name, vc.email, vc.phone, PASSWORD_HASH]);
        const vUid = uRes.rows[0].user_id;

        await client.query(`
          INSERT INTO vendor (vendor_id, company_name, capacity, current_load, max_concurrent_jobs, active_load)
          VALUES ($1, $2, $3, 0, $3, 0)
          ON CONFLICT (vendor_id) DO UPDATE SET 
            company_name = EXCLUDED.company_name,
            capacity = EXCLUDED.capacity,
            max_concurrent_jobs = EXCLUDED.max_concurrent_jobs;
        `, [vUid, vc.company, vc.cap]);

        await client.query(`
          INSERT INTO vendor_trade (vendor_id, trade_id)
          VALUES ($1, $2)
          ON CONFLICT (vendor_id, trade_id) DO NOTHING;
        `, [vUid, tr.trade_id]);
      }
    }
    console.log('✅ 22 Vendors seeded and linked to trades.');

    console.log('--- 4. Seeding Parameters (GM configuration) ---');
    const params = [
      { key: 'severity_step',          val: '12',  desc: 'Points per severity level (1 to 5)' },
      { key: 'aging_max_points',       val: '60',  desc: 'Maximum aging points achievable' },
      { key: 'escalation_multiplier',  val: '1.5', desc: 'Multiplier of SLA where max aging & auto escalation occurs' },
      { key: 'urgent_boost',           val: '15',  desc: 'Score boost for urgent tickets' },
      { key: 'recurring_boost',        val: '10',  desc: 'Score boost for recurring complaints' },
      { key: 'rework_boost_each',      val: '5',   desc: 'Score boost per rework round' },
      { key: 'rework_boost_cap',       val: '15',  desc: 'Maximum total boost from rework' },
      { key: 'recurring_window_days',  val: '90',  desc: 'Lookback window to count recurring tickets' },
      { key: 'recurring_limit',        val: '3',   desc: 'Threshold of complaints before recurring boost/routing applies' },
      { key: 'dispute_window_days',    val: '7',   desc: 'Days allowed after closure to file a dispute' },
      { key: 'rework_limit',           val: '2',   desc: 'Maximum rework attempts before escalating to GM' },
      { key: 'otp_expiry_minutes',     val: '5',   desc: 'Minutes before an OTP expires' },
      { key: 'otp_max_attempts',       val: '5',   desc: 'Maximum invalid OTP attempts before lockout' },
      { key: 'sla_job_minutes',        val: '5',   desc: 'Interval for automated SLA background worker' }
    ];

    for (const p of params) {
      await client.query(`
        INSERT INTO parameter (param_key, param_value, description, updated_by, updated_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (param_key) DO UPDATE SET 
          param_value = EXCLUDED.param_value,
          description = EXCLUDED.description,
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW();
      `, [p.key, p.val, p.desc, gmUserId]);
    }
    console.log('✅ 14 Parameters seeded.');

    console.log('--- 5. Seeding 20 Sample Complaints with Priority Calculations ---');
    // Clear existing sample complaints if any
    await client.query(`
      DELETE FROM ticket_role;
      DELETE FROM status_history;
      DELETE FROM resident_hold;
      DELETE FROM attachment;
      DELETE FROM notification;
      DELETE FROM complaint;
    `);

    const cats = (await client.query('SELECT category_id, name, level, severity_points, resolution_sla_h, default_trade_id FROM complaint_category')).rows;
    const catMap = {};
    cats.forEach(c => { catMap[c.name] = c; });

    const zones = (await client.query('SELECT zone_id, name FROM zone ORDER BY zone_id')).rows;
    const commonAreas = (await client.query('SELECT common_area_id, zone_id, name FROM common_area')).rows;

    // Update i8_status_phase constraint to allow Completed and Escalated statuses
    await client.query(`
      ALTER TABLE complaint DROP CONSTRAINT IF EXISTS i8_status_phase;
      ALTER TABLE complaint ADD CONSTRAINT i8_status_phase CHECK (
        (status = 'Reported'                      AND phase IN ('Triage', 'Awaiting Resident', 'Assigned')) OR
        (status = 'In Progress'                   AND phase IN ('Assigned', 'Accepted', 'Working'))         OR
        (status IN ('Under Review', 'Completed')  AND (phase IN ('Verifying', 'Confirming') OR phase IS NULL)) OR
        (status = 'Escalated'                     AND (phase IN ('Triage', 'Assigned', 'Accepted', 'Working', 'Verifying', 'Confirming') OR phase IS NULL)) OR
        (status = 'Closed'                        AND phase IS NULL)                                         OR
        (status = 'Disputed'                      AND phase IS NULL)
      );
    `);

    // Helper to calculate priority score
    // Ticket score = severity points + aging (0–60) + boosts (urgent +15, recurring +10, rework +5 each, capped at 15)
    function calcScore(sevPoints, slaHours, elapsedHours, isUrgent, isRecurring, reworkCount) {
      const aging = Math.min(60, Math.floor((elapsedHours / (1.5 * slaHours)) * 60));
      const urgentBoost = isUrgent ? 15 : 0;
      const recurringBoost = isRecurring ? 10 : 0;
      const reworkBoost = Math.min(15, reworkCount * 5);
      return sevPoints + aging + urgentBoost + recurringBoost + reworkBoost;
    }

    // 20 realistic tickets across statuses:
    // 4 Reported, 5 In Progress, 3 Completed, 3 Escalated, 3 Closed, 2 Disputed
    const sampleSpecs = [
      // Reported
      { desc: 'Main water line leaking near basement flat 101', cat: 'Pipe leak or seepage', hoursAgo: 2, status: 'Reported', phase: 'Triage', handler: 'Coordinator', urgent: false, recurring: false, rework: 0 },
      { desc: 'Power fluctuation and tripping circuit breakers', cat: 'Power or backup failure', hoursAgo: 1, status: 'Reported', phase: 'Triage', handler: 'Coordinator', urgent: true, recurring: false, rework: 0 },
      { desc: 'Lobby light switch sparking', cat: 'Sparking, exposed wire, short circuit', hoursAgo: 0.5, status: 'Reported', phase: 'Assigned', handler: 'Coordinator', urgent: true, recurring: false, rework: 0 },
      { desc: 'Kitchen sink clogged and overflowing', cat: 'Drain blockage or overflow', hoursAgo: 4, status: 'Reported', phase: 'Triage', handler: 'Coordinator', urgent: false, recurring: true, rework: 0 },

      // In Progress
      { desc: 'Frequent lift stoppage between floors 3 and 4', cat: 'Lift not working', hoursAgo: 8, status: 'In Progress', phase: 'Working', handler: 'ZM', urgent: false, recurring: true, rework: 0 },
      { desc: 'Bedroom wall seepage expanding after rain', cat: 'Pipe leak or seepage', hoursAgo: 16, status: 'In Progress', phase: 'Accepted', handler: 'ZM', urgent: false, recurring: false, rework: 0 },
      { desc: 'Clubhouse central AC compressor failure', cat: 'Common-area AC or ventilation failure', hoursAgo: 24, status: 'In Progress', phase: 'Working', handler: 'ZM', urgent: false, recurring: false, rework: 0, isCommon: true },
      { desc: 'Balcony safety latch and sliding glass door stuck', cat: 'Door, window or lock broken', hoursAgo: 12, status: 'In Progress', phase: 'Accepted', handler: 'ZM', urgent: false, recurring: false, rework: 0 },
      { desc: 'Termite infestation in wooden cabinetry', cat: 'Pest infestation (rodents, insects)', hoursAgo: 18, status: 'In Progress', phase: 'Working', handler: 'ZM', urgent: false, recurring: false, rework: 0 },

      // Completed / Under Review
      { desc: 'Water purifier dispenser leak in community gym', cat: 'Appliance or equipment fault (gym, purifier)', hoursAgo: 30, status: 'Completed', phase: 'Verifying', handler: 'ZM', urgent: false, recurring: false, rework: 0, isCommon: true },
      { desc: 'Bathroom tap replacement and washer repair', cat: 'Tap or fixture repair', hoursAgo: 36, status: 'Completed', phase: 'Confirming', handler: 'ZM', urgent: false, recurring: false, rework: 1 },
      { desc: 'Hallway lighting fixture loose wiring fixed', cat: 'Light, switch or socket fault', hoursAgo: 40, status: 'Completed', phase: 'Confirming', handler: 'ZM', urgent: false, recurring: false, rework: 0 },

      // Escalated
      { desc: 'Severe gas smell reported near utility ducts', cat: 'Gas leak or fire alarm', hoursAgo: 5, status: 'Escalated', phase: 'Working', handler: 'GM', urgent: true, recurring: false, rework: 0 },
      { desc: 'Passenger elevator emergency stop with residents inside', cat: 'Lift entrapment', hoursAgo: 6, status: 'Escalated', phase: 'Working', handler: 'GM', urgent: true, recurring: false, rework: 0 },
      { desc: 'Deep vertical structural crack on exterior facade', cat: 'Structural crack or falling plaster', hoursAgo: 50, status: 'Escalated', phase: 'Triage', handler: 'GM', urgent: false, recurring: true, rework: 1 },

      // Closed
      { desc: 'Broken garden sprinkler head spraying walkway', cat: 'Garden or landscaping', hoursAgo: 72, status: 'Closed', phase: null, handler: 'Coordinator', urgent: false, recurring: false, rework: 0, isCommon: true, resolution: 'Fixed' },
      { desc: 'Repainting of water stain in ceiling corner', cat: 'Paint touch-up or damp marks', hoursAgo: 80, status: 'Closed', phase: null, handler: 'Coordinator', urgent: false, recurring: false, rework: 0, resolution: 'Fixed' },
      { desc: 'Duplicate report of swimming pool filter noise', cat: 'Appliance or equipment fault (gym, purifier)', hoursAgo: 20, status: 'Closed', phase: null, handler: 'Coordinator', urgent: false, recurring: false, rework: 0, isCommon: true, resolution: 'Duplicate' },

      // Disputed
      { desc: 'Waste bin overflow at service gate - reported incomplete cleaning', cat: 'Garbage overflow or sewage smell', hoursAgo: 48, status: 'Disputed', phase: null, handler: 'ZM', urgent: false, recurring: false, rework: 1, isCommon: true },
      { desc: 'Basement storm drain backlog during downpour', cat: 'Drain blockage or overflow', hoursAgo: 60, status: 'Disputed', phase: null, handler: 'ZM', urgent: false, recurring: true, rework: 1, isCommon: true }
    ];

    for (let i = 0; i < sampleSpecs.length; i++) {
      const sp = sampleSpecs[i];
      const cat = catMap[sp.cat];
      const resident = residentIds[i % residentIds.length];
      const zoneId = zones[i % zones.length].zone_id;
      const commonAreaId = sp.isCommon ? commonAreas[i % commonAreas.length].common_area_id : null;
      const flatId = commonAreaId ? null : resident.flat_id;

      const subAt = new Date(Date.now() - sp.hoursAgo * 3600 * 1000);
      const respDue = new Date(subAt.getTime() + 2 * 3600 * 1000);
      const resDue = new Date(subAt.getTime() + cat.resolution_sla_h * 3600 * 1000);
      const confirmDueAt = sp.phase === 'Confirming' ? new Date(subAt.getTime() + 48 * 3600 * 1000) : null;
      const closedAt = sp.status === 'Closed' ? new Date(subAt.getTime() + 48 * 3600 * 1000) : null;
      const disputeDueAt = (sp.status === 'Closed' && ['Duplicate', 'Invalid', 'Unresolved'].includes(sp.resolution)) ? new Date(subAt.getTime() + (48 + 7*24) * 3600 * 1000) : null;
      const disputedAt = sp.status === 'Disputed' ? new Date(subAt.getTime() + 24 * 3600 * 1000) : null;
      const score = calcScore(cat.severity_points, cat.resolution_sla_h, sp.hoursAgo, sp.urgent, sp.recurring, sp.rework);

      const ins = await client.query(`
        INSERT INTO complaint (
          raised_by, description, submitted_at, flat_id, common_area_id, zone_id,
          category_id, priority, recurring_flag, status, phase, handler,
          escalated_flag, reopen_count, resolution, response_due_at, resolution_due_at,
          confirm_due_at, closed_at, dispute_due_at, disputed_at,
          priority_score, version
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12,
          $13, $14, $15, $16, $17,
          $18, $19, $20, $21,
          $22, 1
        ) RETURNING complaint_id;
      `, [
        resident.user_id,
        sp.desc,
        subAt,
        flatId,
        commonAreaId,
        zoneId,
        cat.category_id,
        sp.urgent ? 'Critical' : 'High',
        sp.recurring,
        sp.status,
        sp.phase,
        sp.handler,
        sp.status === 'Escalated',
        sp.rework,
        sp.resolution || null,
        respDue,
        resDue,
        confirmDueAt,
        closedAt,
        disputeDueAt,
        disputedAt,
        score
      ]);
      const cid = ins.rows[0].complaint_id;

      // Also create initial ticket_role for default trade if present
      if (cat.default_trade_id) {
        // Pick a vendor for this trade
        const vRow = await client.query('SELECT vendor_id FROM vendor_trade WHERE trade_id = $1 LIMIT 1', [cat.default_trade_id]);
        const vendorId = vRow.rows.length > 0 ? vRow.rows[0].vendor_id : null;
        const roleStatus = sp.status === 'Reported' ? 'Open' : (sp.status === 'In Progress' ? 'In Progress' : 'Done');

        await client.query(`
          INSERT INTO ticket_role (
            complaint_id, trade_id, vendor_id, role_status
          ) VALUES ($1, $2, $3, $4);
        `, [cid, cat.default_trade_id, vendorId, roleStatus]);
      }
    }
    console.log('✅ 20 Sample Complaints with Priority Scores and Ticket Roles seeded.');

    console.log('\n--- VERIFICATION SUMMARY ---');
    const counts = [
      'trade', 'complaint_category', 'common_area', 'action', 'role_permission', 
      'transition', 'user', 'resident', 'vendor', 'vendor_trade', 'parameter', 'complaint', 'ticket_role'
    ];
    for (const t of counts) {
      const cnt = (await client.query(`SELECT count(*) FROM "${t}"`)).rows[0].count;
      console.log(`  ${t.padEnd(20)}: ${cnt} rows`);
    }

  } catch (err) {
    console.error('❌ Seeding error:', err.message);
    process.exit(1);
  } finally {
    if (client) await client.end();
  }
}

seed();
