// Free persistence for hosts with ephemeral disk (e.g. Render free).
// Keeps the SQLite DB (encrypted) and uploaded files in a free external Postgres (DATABASE_URL, e.g. Neon).
// On start: restore. While running: snapshot every few seconds if anything changed.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const URL = process.env.DATABASE_URL;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.db');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
const MAX_FILE = 20 * 1024 * 1024; // bigger files are not backed up
const KEY = crypto.createHash('sha256').update(process.env.JWT_SECRET || 'dev').digest();

let pool = null;
function getPool() {
  if (!pool) {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: URL, max: 2, ssl: /localhost|127\.0\.0\.1/.test(URL) ? false : { rejectUnauthorized: false } });
    pool.on('error', (e) => console.error('persist pool error', e.message));
  }
  return pool;
}

const encrypt = (buf) => {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]);
};
const decrypt = (buf) => {
  const d = crypto.createDecipheriv('aes-256-gcm', KEY, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]);
};

async function init() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS sh_snapshot (name TEXT PRIMARY KEY, data BYTEA NOT NULL, updated_at TIMESTAMPTZ DEFAULT now());
    CREATE TABLE IF NOT EXISTS sh_files (name TEXT PRIMARY KEY, data BYTEA NOT NULL);
  `);
}

async function restore() {
  if (!URL) return console.log('persist: DATABASE_URL not set, data stays on local disk only');
  try {
    await init();
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const s = await getPool().query("SELECT data FROM sh_snapshot WHERE name='db'");
    if (s.rows.length) {
      for (const ext of ['', '-wal', '-shm']) fs.rmSync(DB_PATH + ext, { force: true });
      fs.writeFileSync(DB_PATH, decrypt(s.rows[0].data));
      console.log('persist: database restored');
    } else {
      console.log('persist: no snapshot yet, starting fresh');
    }
    const f = await getPool().query('SELECT name, data FROM sh_files');
    for (const r of f.rows) {
      const p = path.join(UPLOAD_DIR, path.basename(r.name));
      fs.writeFileSync(p, r.data);
      synced.add(path.basename(r.name));
    }
    if (f.rows.length) console.log(`persist: ${f.rows.length} files restored`);
  } catch (e) {
    console.error('persist: restore failed (starting with local data):', e.message);
  }
}

const synced = new Set();
let lastHash = null;
let busy = false;

async function syncNow() {
  if (!URL || busy) return;
  busy = true;
  try {
    const db = require('./db');
    const tmp = DB_PATH + '.snap';
    await db.backup(tmp);
    const buf = fs.readFileSync(tmp);
    fs.rmSync(tmp, { force: true });
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    if (hash !== lastHash) {
      await getPool().query(
        "INSERT INTO sh_snapshot (name, data, updated_at) VALUES ('db', $1, now()) ON CONFLICT (name) DO UPDATE SET data=EXCLUDED.data, updated_at=now()",
        [encrypt(buf)]
      );
      lastHash = hash;
    }
    for (const name of fs.existsSync(UPLOAD_DIR) ? fs.readdirSync(UPLOAD_DIR) : []) {
      if (synced.has(name)) continue;
      const p = path.join(UPLOAD_DIR, name);
      const st = fs.statSync(p);
      if (!st.isFile()) continue;
      synced.add(name);
      if (st.size > MAX_FILE) continue;
      await getPool().query('INSERT INTO sh_files (name, data) VALUES ($1,$2) ON CONFLICT (name) DO NOTHING', [name, fs.readFileSync(p)]);
    }
  } catch (e) {
    console.error('persist: sync failed:', e.message);
  } finally {
    busy = false;
  }
}

function startSync(intervalMs = 10000) {
  if (!URL) return;
  setInterval(syncNow, intervalMs);
  const bye = async () => {
    await Promise.race([syncNow(), new Promise((r) => setTimeout(r, 8000))]);
    process.exit(0);
  };
  process.on('SIGTERM', bye);
  process.on('SIGINT', bye);
}

module.exports = { restore, startSync, syncNow };
