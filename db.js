const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(process.env.DB_PATH || path.join(__dirname, 'data.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'client',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  label TEXT NOT NULL,
  handle TEXT,
  access_token TEXT,
  refresh_token TEXT,
  mode TEXT NOT NULL DEFAULT 'demo',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  base_text TEXT,
  media_path TEXT,
  media_type TEXT,
  scheduled_at TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS post_targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  caption TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  external_url TEXT,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  published_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_posts_due ON posts(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);
`);

// light migrations
const cols = db.prepare("PRAGMA table_info(accounts)").all().map((c) => c.name);
if (!cols.includes('external_id')) db.exec('ALTER TABLE accounts ADD COLUMN external_id TEXT');
if (!cols.includes('token_expires_at')) db.exec('ALTER TABLE accounts ADD COLUMN token_expires_at TEXT');

module.exports = db;
