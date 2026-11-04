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

-- Panel: Protokoll, Online, Pinnwand, Spielerakten, News, Dev (Board, Roadmap, Checklisten, Kommentare, Scripts, Wiki).
-- Wird auch automatisch angelegt, sobald sich jemand im Panel anmeldet.
CREATE TABLE IF NOT EXISTS activity (id INTEGER PRIMARY KEY AUTOINCREMENT, admin_id INTEGER, kind TEXT NOT NULL, ref_type TEXT, ref_id INTEGER, text TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS presence (admin_id INTEGER PRIMARY KEY, last_seen TEXT NOT NULL, view TEXT);
CREATE TABLE IF NOT EXISTS announcements (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT, pinned INTEGER NOT NULL DEFAULT 0, admin_id INTEGER, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS players (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, discord TEXT, license TEXT, notes TEXT, watch INTEGER NOT NULL DEFAULT 0, created_by INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sanctions (id INTEGER PRIMARY KEY AUTOINCREMENT, player_id INTEGER NOT NULL, type TEXT NOT NULL, reason TEXT NOT NULL, duration TEXT, expires_at TEXT, active INTEGER NOT NULL DEFAULT 1, admin_id INTEGER, created_at TEXT NOT NULL, lifted_by INTEGER, lifted_at TEXT);
CREATE TABLE IF NOT EXISTS news (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT, tag TEXT NOT NULL DEFAULT 'Ankündigung', published INTEGER NOT NULL DEFAULT 0, pinned INTEGER NOT NULL DEFAULT 0, admin_id INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS dev_milestones (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT, target TEXT, status TEXT NOT NULL DEFAULT 'geplant', sort INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS dev_tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT, status TEXT NOT NULL DEFAULT 'todo', priority TEXT NOT NULL DEFAULT 'normal', category TEXT NOT NULL DEFAULT 'Sonstiges', assignee_id INTEGER, milestone_id INTEGER, due TEXT, created_by INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS dev_comments (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER NOT NULL, admin_id INTEGER, body TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS dev_checks (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER NOT NULL, text TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS dev_resources (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, version TEXT, kind TEXT, status TEXT NOT NULL DEFAULT 'aktiv', source TEXT, notes TEXT, admin_id INTEGER, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS dev_docs (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT, category TEXT, admin_id INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_dev_tasks_status ON dev_tasks(status);
CREATE INDEX IF NOT EXISTS idx_sanctions_player ON sanctions(player_id);
CREATE INDEX IF NOT EXISTS idx_comments_task ON dev_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_checks_task ON dev_checks(task_id);

-- Team-Bereich: Teamakten, Kalender, Abwesenheiten, Abstimmungen, Textbausteine
CREATE TABLE IF NOT EXISTS team_profiles (admin_id INTEGER PRIMARY KEY, rank TEXT, area TEXT, discord TEXT, joined TEXT, probation_until TEXT, bio TEXT, onboarding TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS team_records (id INTEGER PRIMARY KEY AUTOINCREMENT, admin_id INTEGER NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL, by_id INTEGER, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'meeting', starts_at TEXT NOT NULL, ends_at TEXT, location TEXT, body TEXT, protocol TEXT, created_by INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS event_rsvp (event_id INTEGER NOT NULL, admin_id INTEGER NOT NULL, status TEXT NOT NULL, PRIMARY KEY (event_id, admin_id));
CREATE TABLE IF NOT EXISTS absences (id INTEGER PRIMARY KEY AUTOINCREMENT, admin_id INTEGER NOT NULL, from_date TEXT NOT NULL, to_date TEXT NOT NULL, reason TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS polls (id INTEGER PRIMARY KEY AUTOINCREMENT, question TEXT NOT NULL, body TEXT, options TEXT NOT NULL, anonymous INTEGER NOT NULL DEFAULT 0, closes_at TEXT, closed INTEGER NOT NULL DEFAULT 0, created_by INTEGER, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS poll_votes (poll_id INTEGER NOT NULL, admin_id INTEGER NOT NULL, option INTEGER NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (poll_id, admin_id));
CREATE TABLE IF NOT EXISTS snippets (id INTEGER PRIMARY KEY AUTOINCREMENT, category TEXT, title TEXT NOT NULL, body TEXT NOT NULL, uses INTEGER NOT NULL DEFAULT 0, admin_id INTEGER, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_events_start ON events(starts_at);
CREATE INDEX IF NOT EXISTS idx_absences_to ON absences(to_date);
CREATE INDEX IF NOT EXISTS idx_activity_admin ON activity(admin_id, created_at);
