CREATE TABLE waitlist (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  message TEXT,
  turnstile_action TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE rate_limits (
  key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
