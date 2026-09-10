const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.KFOS_DB_PATH || path.join(DATA_DIR, 'kfos.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS founders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
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
`);

function seed() {
  const founderCount = db.prepare('SELECT COUNT(*) AS c FROM founders').get().c;
  if (founderCount === 0) {
    const insert = db.prepare(
      'INSERT INTO founders (name, role, sort_order) VALUES (?, ?, ?)'
    );
    insert.run('CEO', 'CEO', 0);
    insert.run('CTO', 'CTO', 1);
    insert.run('COO', 'COO', 2);
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

seed();

module.exports = db;
