-- =============================================================================
--  Complete System Seed Data (v0.5)
--  Includes:
--   1. 11 Trades (including Fire & Gas Safety)
--   2. 25 Complaint Categories (linked with default_trade_id, level, points, SLA)
--   3. 6 Common Areas (Pool, Gym, Clubhouse, Park, Parking, Lifts)
--   4. 14 Actions
--   5. RolePermission matrix (scoped)
--   6. 16 Legal State Transitions
--   7. Core Users: 1 GM, 1 Coordinator, 3 Zone Managers, 5 Residents
--   8. 22 Vendors (2 per trade across all 11 trades) + vendor_trade
--   9. 14 System Parameters
--  10. 20 Sample Complaints with priority scores across statuses
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Trades (11 trades)
-- -----------------------------------------------------------------------------
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
  ('Elevator Maintenance'),
  ('Fire & Gas Safety')
ON CONFLICT (name) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. Complaint Categories (25 categories linked to default trades)
-- -----------------------------------------------------------------------------
INSERT INTO complaint_category (name, severity, level, severity_points, response_sla_h, resolution_sla_h, is_sensitive, default_trade_id)
SELECT c.name, c.severity::severity_level, c.lvl, c.pts, c.resp_sla, c.res_sla, c.is_sens, t.trade_id
FROM (VALUES
  ('Lift entrapment',                              'Critical', 5, 60, 1,   4, FALSE, 'Elevator Maintenance'),
  ('Lift not working',                             'High',     4, 48, 2,  12, FALSE, 'Elevator Maintenance'),
  ('Lift noise or door fault',                     'Medium',   3, 36, 6,  48, FALSE, 'Elevator Maintenance'),
  ('Sparking, exposed wire, short circuit',        'Critical', 5, 60, 1,   4, FALSE, 'Electrical'),
  ('Power or backup failure',                      'High',     4, 48, 2,  12, FALSE, 'Electrical'),
  ('Light, switch or socket fault',                'Medium',   2, 24, 6,  72, FALSE, 'Electrical'),
  ('No water supply',                              'High',     4, 48, 2,  12, FALSE, 'Plumbing'),
  ('Pipe leak or seepage',                         'Medium',   3, 36, 6,  48, FALSE, 'Plumbing'),
  ('Drain blockage or overflow',                   'Medium',   3, 36, 6,  48, FALSE, 'Plumbing'),
  ('Tap or fixture repair',                        'Medium',   2, 24, 6,  72, FALSE, 'Plumbing'),
  ('Structural crack or falling plaster',          'High',     4, 48, 2,  12, FALSE, 'Masonry'),
  ('Tile, wall or plaster repair',                 'Low',      1, 12, 12, 120, FALSE, 'Masonry'),
  ('Door, window or lock broken',                  'Medium',   3, 36, 6,  48, FALSE, 'Carpentry'),
  ('Wood or furniture repair',                     'Low',      1, 12, 12, 120, FALSE, 'Carpentry'),
  ('Common-area AC or ventilation failure',        'Medium',   2, 24, 6,  72, FALSE, 'HVAC / AC Repair'),
  ('Dangerous pests (snake, beehive)',             'Critical', 5, 60, 1,   4, FALSE, 'Pest Control'),
  ('Pest infestation (rodents, insects)',          'Medium',   2, 24, 6,  72, FALSE, 'Pest Control'),
  ('Appliance or equipment fault (gym, purifier)', 'Medium',   2, 24, 6,  72, FALSE, 'Appliance Repair'),
  ('Garbage overflow or sewage smell',             'Medium',   3, 36, 6,  48, FALSE, 'Housekeeping'),
  ('Cleaning or sweeping issue',                   'Medium',   2, 24, 6,  72, FALSE, 'Housekeeping'),
  ('Garden or landscaping',                        'Low',      1, 12, 12, 120, FALSE, 'Housekeeping'),
  ('Paint touch-up or damp marks',                 'Low',      1, 12, 12, 120, FALSE, 'Painting'),
  ('Security concern or theft',                    'Critical', 5, 60, 1,   4, TRUE,  NULL),
  ('Harassment or staff misconduct',               'High',     4, 48, 2,  12, TRUE,  NULL),
  ('Gas leak or fire alarm',                       'Critical', 5, 60, 1,   4, FALSE, 'Fire & Gas Safety')
) AS c(name, severity, lvl, pts, resp_sla, res_sla, is_sens, trade_name)
LEFT JOIN trade t ON t.name = c.trade_name
ON CONFLICT (name) DO UPDATE SET
  severity         = EXCLUDED.severity,
  level            = EXCLUDED.level,
  severity_points  = EXCLUDED.severity_points,
  response_sla_h   = EXCLUDED.response_sla_h,
  resolution_sla_h = EXCLUDED.resolution_sla_h,
  is_sensitive     = EXCLUDED.is_sensitive,
  default_trade_id = EXCLUDED.default_trade_id;

-- -----------------------------------------------------------------------------
-- 3. Common Areas (across the 3 zones)
-- -----------------------------------------------------------------------------
INSERT INTO common_area (zone_id, name)
SELECT z.zone_id, c.name
FROM (VALUES
  ('Zone 1', 'Clubhouse & Swimming Pool'),
  ('Zone 1', 'Main Gymnasium'),
  ('Zone 2', 'Central Community Park'),
  ('Zone 2', 'Children Play Area'),
  ('Zone 3', 'Multipurpose Sports Court'),
  ('Zone 3', 'Basement Visitor Parking')
) AS c(zone_name, name)
JOIN zone z ON z.name = c.zone_name
ON CONFLICT (name) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 4. Actions (14 core workflow & system actions)
-- -----------------------------------------------------------------------------
INSERT INTO action (code, description) VALUES
  ('submit',    'Submit a new complaint ticket'),
  ('route',     'Route ticket to appropriate desk / zone / handler'),
  ('assign',    'Assign vendor roles and set priority'),
  ('accept',    'Accept an offered role by a vendor'),
  ('start',     'Start work on an accepted role'),
  ('done',      'Mark an assigned role as completed'),
  ('verify',    'Verify completed work on site'),
  ('rework',    'Order rework if fix is incomplete or defective'),
  ('escalate',  'Escalate ticket to General Manager desk'),
  ('reassign',  'Reassign vendor team and reset due dates'),
  ('close',     'Close ticket (Fixed, Duplicate, Invalid, or Withdrawn)'),
  ('dispute',   'Dispute a closed resolution within dispute window'),
  ('uphold',    'Uphold a resident dispute'),
  ('reject',    'Reject a resident dispute and confirm original closure')
ON CONFLICT (code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 5. RolePermission Matrix (mapping roles to actions with scopes)
-- -----------------------------------------------------------------------------
-- Scopes: OWN_FLAT, OWN_ZONE, OWN_JOBS, ESCALATED_ONLY, TOWNSHIP
INSERT INTO role_permission (role_id, action_id, scope)
SELECT r.role_id, a.action_id, p.scope::scope_type
FROM (VALUES
  -- Resident
  ('Resident',    'submit',   'OWN_FLAT'),
  ('Resident',    'close',    'OWN_FLAT'),    -- withdraw
  ('Resident',    'dispute',  'OWN_FLAT'),

  -- Coordinator
  ('Coordinator', 'route',    'TOWNSHIP'),
  ('Coordinator', 'assign',   'TOWNSHIP'),
  ('Coordinator', 'close',    'TOWNSHIP'),    -- duplicate, invalid

  -- Zone Manager (ZM)
  ('ZM',          'route',    'OWN_ZONE'),
  ('ZM',          'assign',   'OWN_ZONE'),
  ('ZM',          'verify',   'OWN_ZONE'),
  ('ZM',          'rework',   'OWN_ZONE'),
  ('ZM',          'escalate', 'OWN_ZONE'),
  ('ZM',          'close',    'OWN_ZONE'),
  ('ZM',          'uphold',   'OWN_ZONE'),
  ('ZM',          'reject',   'OWN_ZONE'),

  -- Vendor
  ('Vendor',      'accept',   'OWN_JOBS'),
  ('Vendor',      'start',    'OWN_JOBS'),
  ('Vendor',      'done',     'OWN_JOBS'),

  -- General Manager (GM)
  ('GM',          'verify',   'TOWNSHIP'),
  ('GM',          'rework',   'TOWNSHIP'),
  ('GM',          'reassign', 'TOWNSHIP'),
  ('GM',          'close',    'TOWNSHIP'),
  ('GM',          'uphold',   'TOWNSHIP'),
  ('GM',          'reject',   'TOWNSHIP'),

  -- System (Automated triggers)
  ('System',      'route',    'TOWNSHIP'),
  ('System',      'escalate', 'TOWNSHIP'),
  ('System',      'close',    'TOWNSHIP')
) AS p(role_name, action_code, scope)
JOIN "role" r ON r.name = p.role_name
JOIN action a ON a.code = p.action_code
ON CONFLICT (role_id, action_id) DO UPDATE SET scope = EXCLUDED.scope;

-- -----------------------------------------------------------------------------
-- 6. Transitions (16 Legal State Transitions)
-- -----------------------------------------------------------------------------
INSERT INTO transition (t_code, from_status, to_status, from_phase, to_phase, actor_role_id, requires_reason)
SELECT 
  t.t_code,
  t.from_status,
  t.to_status,
  t.from_phase::phase_type,
  t.to_phase::phase_type,
  r.role_id,
  t.req_reason
FROM (VALUES
  ('T1',  'Reported',    'In Progress', NULL, 'Assigned',   'Coordinator', FALSE),
  ('T2',  'Reported',    'Escalated',   NULL, 'Triage',     'System',      FALSE),
  ('T3',  'Reported',    'Closed',      NULL, NULL,         'Coordinator', TRUE),
  ('T4',  'In Progress', 'Completed',   NULL, 'Verifying',  'Vendor',      FALSE),
  ('T5',  'In Progress', 'Escalated',   NULL, 'Working',    'System',      FALSE),
  ('T6',  'In Progress', 'Closed',      NULL, NULL,         'GM',          TRUE),
  ('T7',  'Completed',   'Closed',      NULL, NULL,         'Resident',    FALSE),
  ('T8',  'Completed',   'In Progress', NULL, 'Assigned',   'ZM',          TRUE),
  ('T9',  'Completed',   'Escalated',   NULL, 'Verifying',  'System',      FALSE),
  ('T10', 'Escalated',   'In Progress', NULL, 'Assigned',   'GM',          FALSE),
  ('T11', 'Escalated',   'Completed',   NULL, 'Confirming', 'GM',          FALSE),
  ('T12', 'Escalated',   'Closed',      NULL, NULL,         'GM',          TRUE),
  ('T13', 'Closed',      'Disputed',    NULL, NULL,         'Resident',    TRUE),
  ('T14', 'Disputed',    'Reported',    NULL, 'Triage',     'ZM',          TRUE),
  ('T15', 'Disputed',    'In Progress', NULL, 'Assigned',   'ZM',          TRUE),
  ('T16', 'Disputed',    'Closed',      NULL, NULL,         'ZM',          TRUE)
) AS t(t_code, from_status, to_status, from_phase, to_phase, role_name, req_reason)
JOIN "role" r ON r.name = t.role_name
ON CONFLICT (t_code, from_status, from_phase, to_status, to_phase, actor_role_id) DO NOTHING;

