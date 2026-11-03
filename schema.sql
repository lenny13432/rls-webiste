-- Real Life Southland – Datenbank für Team-Bewerbungen (Cloudflare D1)
-- Einmalig ausführen: npx wrangler d1 execute southland --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS admins (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass_hash   TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'admin',      -- 'owner' oder 'admin'
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL,
  last_login  TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  admin_id    INTEGER NOT NULL,
  expires_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS applications (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  code         TEXT NOT NULL UNIQUE,
  discord_name TEXT NOT NULL,
  discord_id   TEXT,
  age          INTEGER NOT NULL,
  position     TEXT NOT NULL,
  hours        TEXT NOT NULL,
  times        TEXT NOT NULL,
  experience   TEXT NOT NULL,
  motivation   TEXT NOT NULL,
  scenario1    TEXT NOT NULL,
  scenario2    TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'offen',    -- offen, pruefung, angenommen, abgelehnt
  public_note  TEXT,
  decided_by   INTEGER,
  decided_at   TEXT,
  ip_hash      TEXT NOT NULL,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_app_status  ON applications(status);
CREATE INDEX IF NOT EXISTS idx_app_discord ON applications(discord_name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS notes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL,
  admin_id       INTEGER,
  body           TEXT NOT NULL,
  kind           TEXT NOT NULL DEFAULT 'note',  -- 'note' oder 'system'
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_app ON notes(application_id);

CREATE TABLE IF NOT EXISTS login_attempts (
  ip_hash    TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Standard-Einstellungen (im Team-Panel unter "Einstellungen" änderbar)
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('applications_open', 'true'),
  ('positions', '[{"name":"Supporter","state":"offen"},{"name":"Moderator","state":"offen"},{"name":"Entwickler","state":"wenige"},{"name":"Eventmanager","state":"offen"},{"name":"Social Media","state":"voll"}]');

-- Dev-Panel (Roadmap & To-dos). Wird auch automatisch angelegt, sobald jemand das Dev-Panel öffnet.
CREATE TABLE IF NOT EXISTS dev_milestones (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT, target TEXT, status TEXT NOT NULL DEFAULT 'geplant', sort INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS dev_tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT, status TEXT NOT NULL DEFAULT 'todo', priority TEXT NOT NULL DEFAULT 'normal', category TEXT NOT NULL DEFAULT 'Sonstiges', assignee_id INTEGER, milestone_id INTEGER, due TEXT, created_by INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_dev_tasks_status ON dev_tasks(status);
