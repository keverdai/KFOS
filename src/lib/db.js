const path = require('path');
const fs = require('fs');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS founders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  email TEXT,
  password_hash TEXT
);

-- One row per logged-in browser session. A founder authenticates once with
-- their own email + password (see lib/passwords.js) and everything they do
-- afterward — daily log entries, commitment writes — is attributed to
-- founder_id from here, never from a client-supplied value.
CREATE TABLE IF NOT EXISTS auth_sessions (
  token TEXT PRIMARY KEY,
  founder_id INTEGER NOT NULL REFERENCES founders(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  pillar TEXT NOT NULL,
  owner_founder_id INTEGER REFERENCES founders(id),
  objective TEXT DEFAULT '',
  discussion TEXT DEFAULT '',
  decisions TEXT DEFAULT '',
  closed INTEGER NOT NULL DEFAULT 0,
  updated_by_founder_id INTEGER REFERENCES founders(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS commitments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
  pillar TEXT NOT NULL,
  description TEXT NOT NULL,
  definition_of_done TEXT DEFAULT '',
  owner_founder_id INTEGER REFERENCES founders(id),
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'open', -- open | green | yellow | red | cancelled
  evidence TEXT DEFAULT '',
  status_note TEXT DEFAULT '',
  created_by_founder_id INTEGER REFERENCES founders(id),
  status_updated_by_founder_id INTEGER REFERENCES founders(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS daily_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  founder_id INTEGER NOT NULL REFERENCES founders(id),
  revenue_hours REAL NOT NULL DEFAULT 0,
  revenue_evidence TEXT DEFAULT '',
  product_hours REAL NOT NULL DEFAULT 0,
  product_evidence TEXT DEFAULT '',
  distribution_hours REAL NOT NULL DEFAULT 0,
  distribution_evidence TEXT DEFAULT '',
  infrastructure_hours REAL NOT NULL DEFAULT 0,
  infrastructure_evidence TEXT DEFAULT '',
  learning_hours REAL NOT NULL DEFAULT 0,
  learning_evidence TEXT DEFAULT '',
  biggest_outcome TEXT DEFAULT '',
  biggest_problem TEXT DEFAULT '',
  decision_tomorrow TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(date, founder_id)
);

CREATE INDEX IF NOT EXISTS idx_commitments_due ON commitments(due_date);
CREATE INDEX IF NOT EXISTS idx_commitments_owner ON commitments(owner_founder_id);
CREATE INDEX IF NOT EXISTS idx_daily_logs_date ON daily_logs(date);
`;

function wrapLastInsertRowid(db) {
  const origPrepare = db.prepare.bind(db);
  db.prepare = (sql) => {
    const stmt = origPrepare(sql);
    const origRun = stmt.run.bind(stmt);
    stmt.run = (...args) => {
      const info = origRun(...args);
      if (info && typeof info.lastInsertRowid === 'bigint') {
        info.lastInsertRowid = Number(info.lastInsertRowid);
      }
      return info;
    };
    return stmt;
  };
  return db;
}

function openDatabase() {
  const tursoUrl = process.env.TURSO_DATABASE_URL || process.env.LIBSQL_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN;

  if (tursoUrl) {
    const Libsql = require('libsql');
    const Database = Libsql.default || Libsql;
    const db = wrapLastInsertRowid(new Database(tursoUrl, { authToken }));
    console.log('KFOS database: Turso (hosted SQLite)');
    return { db, remote: true };
  }

  const Database = require('better-sqlite3');
  const DATA_DIR = path.join(__dirname, '..', '..', 'data');
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const DB_PATH = process.env.KFOS_DB_PATH || path.join(DATA_DIR, 'kfos.db');
  const db = wrapLastInsertRowid(new Database(DB_PATH));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return { db, remote: false };
}

const { db } = openDatabase();
db.exec(SCHEMA);

// CREATE TABLE IF NOT EXISTS never alters a table that already existed from
// an earlier version of KFOS (e.g. before founder accounts existed) — add
// any columns that migration needs, idempotently.
function migrate() {
  function addColumnIfMissing(table, column, ddl) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!cols.some((c) => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    }
  }

  addColumnIfMissing('founders', 'email', 'email TEXT');
  addColumnIfMissing('founders', 'password_hash', 'password_hash TEXT');
  addColumnIfMissing('sessions', 'updated_by_founder_id', 'updated_by_founder_id INTEGER REFERENCES founders(id)');
  addColumnIfMissing('commitments', 'created_by_founder_id', 'created_by_founder_id INTEGER REFERENCES founders(id)');
  addColumnIfMissing(
    'commitments',
    'status_updated_by_founder_id',
    'status_updated_by_founder_id INTEGER REFERENCES founders(id)'
  );

  // Only safe to add once the email column above is guaranteed to exist.
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_founders_email ON founders(email) WHERE email IS NOT NULL');

  // A founders table that existed before this feature shipped got the email
  // column added above with every row's value left NULL — the placeholder-
  // email seeding below only ever runs on a table that's empty, so those
  // pre-existing rows never get one and nobody can sign in at all. Backfill
  // the same placeholder convention, matched by sort_order (fixed at seed
  // time, never user-editable — unlike name/role) rather than by role text,
  // and only where email is still unset so a real email already saved via
  // Settings is never touched.
  const placeholderEmailByOrder = { 0: 'ceo@keverd.com', 1: 'cto@keverd.com', 2: 'coo@keverd.com' };
  const backfillEmail = db.prepare('UPDATE founders SET email = ? WHERE sort_order = ? AND email IS NULL');
  for (const [order, email] of Object.entries(placeholderEmailByOrder)) {
    backfillEmail.run(email, Number(order));
  }
}

function seed() {
  const founderCount = Number(db.prepare('SELECT COUNT(*) AS c FROM founders').get().c);
  if (founderCount === 0) {
    // Seeded with placeholder emails and no password: whoever signs in with
    // one of these addresses for the first time chooses their own password
    // right there (see routes/auth.js) — that's how each founder claims
    // their account. Update the email in Settings once you're in.
    const insert = db.prepare(
      'INSERT INTO founders (name, role, sort_order, email) VALUES (?, ?, ?, ?)'
    );
    insert.run('CEO', 'CEO', 0, 'ceo@keverd.com');
    insert.run('CTO', 'CTO', 1, 'cto@keverd.com');
    insert.run('COO', 'COO', 2, 'coo@keverd.com');
  }

  const defaults = {
    rotation_start_date: mondayOf(new Date()).toISOString().slice(0, 10),
    daily_hour_target: '6',
    company_name: 'Keverd',
  };
  const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
  const setSetting = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING'
  );
  for (const [key, value] of Object.entries(defaults)) {
    if (!getSetting.get(key)) setSetting.run(key, value);
  }
}

function mondayOf(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay(); // 0 = Sunday
  const diff = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

migrate();
seed();

module.exports = db;
