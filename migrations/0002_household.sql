-- migrations/0002_household.sql
-- D1 already enforces foreign keys on every query/migration (equivalent to
-- PRAGMA foreign_keys = on). Do not set that pragma here; it cannot be
-- toggled. Use PRAGMA defer_foreign_keys = true only if a later rebuild needs it.

CREATE TABLE households (
  id TEXT PRIMARY KEY,                   -- hid_… opaque
  name TEXT NOT NULL DEFAULT 'Home',
  dogfood INTEGER NOT NULL DEFAULT 0,    -- 1 = first household
  onboarded INTEGER NOT NULL DEFAULT 0,
  dinners_per_week INTEGER NOT NULL DEFAULT 5,
  flex_nights TEXT NOT NULL DEFAULT '["leftover","eatout_or_family"]',
  store TEXT NOT NULL DEFAULT 'woolworths'
    CHECK (store IN ('woolworths','coles','bring','notes','text')),
  quiet_start TEXT NOT NULL DEFAULT '18:30',
  quiet_tz TEXT NOT NULL DEFAULT 'Australia/Sydney',
  quiet_phones TEXT NOT NULL DEFAULT 'side_table',
  quiet_charge TEXT NOT NULL DEFAULT 'hallway',
  quiet_radios TEXT NOT NULL DEFAULT 'off',
  place_homework TEXT NOT NULL DEFAULT 'family_study',
  place_meals TEXT NOT NULL DEFAULT 'kitchen_table',
  home_ai TEXT NOT NULL DEFAULT 'none'
    CHECK (home_ai IN ('none','supervised_demo','local_endpoint')),
  llm_base_url TEXT,
  llm_tunnel_hostname TEXT,
  llm_key_wrapped TEXT,                  -- AES-GCM blob, key = LLM_KEY_WRAP
  kiosk_pin_hash TEXT,
  kiosk_pin_salt TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE parents (
  household_id TEXT NOT NULL REFERENCES households(id),
  id TEXT NOT NULL,                      -- YAML label parent_a
  email TEXT NOT NULL,
  display_name TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (household_id, id),
  UNIQUE (email)
);

CREATE TABLE members (
  household_id TEXT NOT NULL REFERENCES households(id),
  id TEXT NOT NULL,                      -- YAML label kid_8 / parent_a
  role TEXT NOT NULL CHECK (role IN ('parent','child')),
  label TEXT NOT NULL,                   -- first name, display only
  school_ai TEXT CHECK (school_ai IN ('bones_first_only','off','parent_approved')),
  home_ai TEXT CHECK (home_ai IN ('none','supervised_demo')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (household_id, id)
);

CREATE TABLE meals (
  household_id TEXT NOT NULL REFERENCES households(id),
  id TEXT NOT NULL,                      -- YAML slug butter-chicken
  title TEXT NOT NULL,
  serves INTEGER NOT NULL DEFAULT 4,
  leftovers INTEGER NOT NULL DEFAULT 0,  -- 0/1; YAML leftovers: true maps to 1
  time_min INTEGER,
  tags TEXT NOT NULL DEFAULT '[]',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (household_id, id)
);

CREATE TABLE ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id TEXT NOT NULL,
  meal_id TEXT NOT NULL,
  item TEXT NOT NULL,
  qty REAL,
  unit TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (household_id, meal_id) REFERENCES meals(household_id, id) ON DELETE CASCADE
);
CREATE INDEX idx_ing_meal ON ingredients(household_id, meal_id);

CREATE TABLE weeks (
  household_id TEXT NOT NULL REFERENCES households(id),
  id TEXT NOT NULL,                      -- week-04
  title TEXT NOT NULL,
  flex TEXT NOT NULL DEFAULT 'leftover',
  list_name TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'human' CHECK (origin IN ('human','llm_draft')),
  applied INTEGER NOT NULL DEFAULT 1,    -- llm drafts start at 0
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (household_id, id)
);

CREATE TABLE week_dinners (
  household_id TEXT NOT NULL,
  week_id TEXT NOT NULL,
  position INTEGER NOT NULL,             -- 0..4
  meal_id TEXT NOT NULL,
  PRIMARY KEY (household_id, week_id, position),
  FOREIGN KEY (household_id, week_id) REFERENCES weeks(household_id, id) ON DELETE CASCADE,
  FOREIGN KEY (household_id, meal_id) REFERENCES meals(household_id, id)
);

CREATE TABLE rules (
  household_id TEXT PRIMARY KEY REFERENCES households(id),
  body_md TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE hallucination_examples (
  household_id TEXT NOT NULL REFERENCES households(id),
  id TEXT NOT NULL,
  title TEXT NOT NULL,
  body_md TEXT NOT NULL,
  screenshot_key TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (household_id, id)
);

CREATE TABLE stamps (
  household_id TEXT NOT NULL REFERENCES households(id),
  id TEXT NOT NULL,                      -- st_20260903_ww2-poster (unique per household)
  member_id TEXT NOT NULL,
  title TEXT NOT NULL,
  due TEXT,
  used_ai_for TEXT NOT NULL DEFAULT '[]', -- JSON array; "none" cannot combine with others
  checked_against TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','changes_requested')),
  parent_id TEXT,
  paragraph TEXT,                        -- optional parent paste for check_stamp; max 32 KB
  textbook_r2_key TEXT,                  -- parent upload; no OCR in v1
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  decided_at TEXT,
  PRIMARY KEY (household_id, id),
  FOREIGN KEY (household_id, member_id) REFERENCES members(household_id, id),
  FOREIGN KEY (household_id, parent_id) REFERENCES parents(household_id, id)
);
CREATE INDEX idx_stamps_inbox ON stamps(household_id, status, created_at);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,                   -- opaque j_…
  household_id TEXT NOT NULL REFERENCES households(id),
  parent_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('cluster_weeks','scale_qty','check_stamp')),
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','succeeded','failed','skipped_no_endpoint')),
  request_json TEXT NOT NULL,            -- cap 32 KB
  result_json TEXT,                      -- cap 32 KB
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  finished_at TEXT,
  FOREIGN KEY (household_id, parent_id) REFERENCES parents(household_id, id)
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  parent_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  refreshed_at TEXT,
  kiosk INTEGER NOT NULL DEFAULT 0,
  kiosk_member_id TEXT,
  kiosk_stamp_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (household_id, parent_id) REFERENCES parents(household_id, id)
);
CREATE INDEX idx_sessions_exp ON sessions(expires_at);

CREATE TABLE magic_link_tokens (
  token_hash TEXT PRIMARY KEY,           -- HMAC-SHA256(token, MAGIC_LINK_SIGNING_KEY)
  household_id TEXT NOT NULL,
  parent_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (household_id, parent_id) REFERENCES parents(household_id, id)
);

CREATE TABLE passkeys (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  parent_id TEXT NOT NULL,
  public_key BLOB NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  device_type TEXT,
  backed_up INTEGER NOT NULL DEFAULT 0,
  transports TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (household_id, parent_id) REFERENCES parents(household_id, id)
);

CREATE TABLE passkey_challenges (
  id TEXT PRIMARY KEY,
  parent_id TEXT,
  challenge TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id TEXT,
  parent_id TEXT,
  action TEXT NOT NULL,
  target_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
-- audit never stores stamp paragraph, homework text, or emails
