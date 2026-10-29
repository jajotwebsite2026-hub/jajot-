const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const db = require('./db');
const { PLATFORMS, LIMITS, validate } = require('./platforms');
const scheduler = require('./scheduler');
const ig = require('./instagram');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.JWT_SECRET) {
  console.warn('WARNING: JWT_SECRET not set. Logins reset on every restart. Set it in production.');
}
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) =>
      cb(null, crypto.randomBytes(12).toString('hex') + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /^(image|video)\//.test(file.mimetype);
    cb(ok ? null : new Error('Only image or video allowed'), ok);
  },
});

// ---------- auth ----------
function issueToken(res, user) {
  const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 3600 * 1000,
  });
}

function auth(req, res, next) {
  try {
    const p = jwt.verify(req.cookies.token, JWT_SECRET);
    const user = db.prepare('SELECT id, email, name, role FROM users WHERE id=?').get(p.id);
    if (!user) throw new Error('no user');
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Login required' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

app.post('/api/signup', (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Valid email needed' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password min 8 chars' });
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email.toLowerCase())) {
    return res.status(409).json({ error: 'Email already used' });
  }
  // First user ever becomes admin (the owner)
  const isFirst = db.prepare('SELECT COUNT(*) c FROM users').get().c === 0;
  const info = db
    .prepare('INSERT INTO users (email, password_hash, name, role) VALUES (?,?,?,?)')
    .run(email.toLowerCase(), bcrypt.hashSync(password, 10), name || '', isFirst ? 'admin' : 'client');
  const user = { id: info.lastInsertRowid, role: isFirst ? 'admin' : 'client' };
  issueToken(res, user);
  res.json({ ok: true });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE email=?').get((email || '').toLowerCase());
  if (!u || !bcrypt.compareSync(password || '', u.password_hash)) {
    return res.status(401).json({ error: 'Wrong email or password' });
  }
  issueToken(res, u);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

app.get('/api/me', auth, (req, res) => {
  res.json({ user: req.user, platforms: PLATFORMS, limits: LIMITS });
});

// ---------- accounts ----------
app.get('/api/accounts', auth, (req, res) => {
  const rows = db
    .prepare('SELECT id, platform, label, handle, mode, created_at FROM accounts WHERE user_id=? ORDER BY platform, id')
    .all(req.user.id);
  res.json(rows);
});

app.post('/api/accounts', auth, (req, res) => {
  const { platform, label, handle } = req.body || {};
  if (!PLATFORMS.includes(platform)) return res.status(400).json({ error: 'Unknown platform' });
  if (!label || !label.trim()) return res.status(400).json({ error: 'Label needed' });
  const info = db
    .prepare("INSERT INTO accounts (user_id, platform, label, handle, mode) VALUES (?,?,?,?, 'demo')")
    .run(req.user.id, platform, label.trim(), (handle || '').trim());
  res.json({ id: info.lastInsertRowid });
});

app.delete('/api/accounts/:id', auth, (req, res) => {
  const r = db.prepare('DELETE FROM accounts WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  res.json({ deleted: r.changes });
});

// ---------- posts ----------
app.post('/api/posts', auth, upload.single('media'), (req, res) => {
  try {
    const baseText = (req.body.text || '').trim();
    const accountIds = JSON.parse(req.body.accountIds || '[]');
    const captions = JSON.parse(req.body.captions || '{}'); // { platform: text }
    const scheduleAt = req.body.scheduleAt ? new Date(req.body.scheduleAt) : null;

    if (!accountIds.length) return res.status(400).json({ error: 'Pick at least one account' });
    if (!baseText && !req.file) return res.status(400).json({ error: 'Add text or media' });
    if (scheduleAt && isNaN(scheduleAt.getTime())) return res.status(400).json({ error: 'Bad schedule time' });

    const mediaType = req.file ? (req.file.mimetype.startsWith('video') ? 'video' : 'image') : null;
    const mediaPath = req.file ? req.file.filename : null;

    const accounts = accountIds.map((id) =>
      db.prepare('SELECT * FROM accounts WHERE id=? AND user_id=?').get(id, req.user.id)
    );
    if (accounts.some((a) => !a)) return res.status(400).json({ error: 'Invalid account selected' });

    for (const a of accounts) {
      const caption = (captions[a.platform] || '').trim() || baseText;
      const err = validate(a.platform, caption, mediaPath, mediaType);
      if (err) return res.status(400).json({ error: `${a.label}: ${err}` });
    }

    const sqlTime = scheduleAt ? scheduleAt.toISOString().replace('T', ' ').slice(0, 19) : null;
    const tx = db.transaction(() => {
      const p = db
        .prepare('INSERT INTO posts (user_id, base_text, media_path, media_type, scheduled_at) VALUES (?,?,?,?,?)')
        .run(req.user.id, baseText, mediaPath, mediaType, sqlTime);
      for (const a of accounts) {
        const caption = (captions[a.platform] || '').trim() || baseText;
        db.prepare('INSERT INTO post_targets (post_id, account_id, caption) VALUES (?,?,?)').run(
          p.lastInsertRowid,
          a.id,
          caption
        );
      }
      return p.lastInsertRowid;
    });
    const id = tx();
    if (!scheduleAt) setImmediate(() => scheduler.tick());
    res.json({ id });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/posts', auth, (req, res) => {
  const posts = db
    .prepare('SELECT * FROM posts WHERE user_id=? ORDER BY id DESC LIMIT 100')
    .all(req.user.id);
  const tstmt = db.prepare(
    `SELECT t.id, t.status, t.caption, t.external_url, t.error, t.attempts, a.platform, a.label
     FROM post_targets t JOIN accounts a ON a.id=t.account_id WHERE t.post_id=?`
  );
  res.json(posts.map((p) => ({ ...p, targets: tstmt.all(p.id) })));
});

app.post('/api/posts/:id/retry', auth, (req, res) => {
  const p = db.prepare('SELECT * FROM posts WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  db.prepare("UPDATE post_targets SET status='pending', attempts=0 WHERE post_id=? AND status='failed'").run(p.id);
  db.prepare("UPDATE posts SET status='queued' WHERE id=?").run(p.id);
  setImmediate(() => scheduler.tick());
  res.json({ ok: true });
});

app.delete('/api/posts/:id', auth, (req, res) => {
  const p = db.prepare('SELECT * FROM posts WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  if (p.status === 'processing') return res.status(409).json({ error: 'Post is running now' });
  db.prepare('DELETE FROM posts WHERE id=?').run(p.id);
  res.json({ ok: true });
});

// Media only visible to the owner
app.get('/api/media/:file', auth, (req, res) => {
  const f = path.basename(req.params.file);
  const own = db.prepare('SELECT 1 FROM posts WHERE media_path=? AND user_id=?').get(f, req.user.id);
  if (!own) return res.status(404).end();
  res.sendFile(path.join(UPLOAD_DIR, f));
});

// Public media URL (needed so Instagram can download the file). Names are random.
app.get('/pub/:file', (req, res) => {
  const f = path.basename(req.params.file);
  const full = path.join(UPLOAD_DIR, f);
  if (!fs.existsSync(full)) return res.status(404).end();
  res.sendFile(full);
});

// ---------- Instagram connect ----------
const igRedirect = (req) => `${ig.publicBase(req)}/auth/instagram/callback`;

app.get('/auth/instagram/start', auth, (req, res) => {
  if (!ig.configured()) return res.status(500).send('Instagram is not configured (IG_APP_ID / IG_APP_SECRET missing).');
  const state = jwt.sign({ u: req.user.id }, JWT_SECRET, { expiresIn: '10m' });
  res.redirect(ig.authUrl({ redirectUri: igRedirect(req), state }));
});

app.get('/auth/instagram/callback', auth, async (req, res) => {
  try {
    if (req.query.error) throw new Error(req.query.error_description || req.query.error);
    const st = jwt.verify(String(req.query.state || ''), JWT_SECRET);
    if (st.u !== req.user.id) throw new Error('Wrong session, try again');
    const t = await ig.connect({ code: String(req.query.code || ''), redirectUri: igRedirect(req) });
    const ex = db
      .prepare("SELECT id FROM accounts WHERE user_id=? AND platform='instagram' AND external_id=?")
      .get(req.user.id, t.igId);
    if (ex) {
      db.prepare("UPDATE accounts SET access_token=?, token_expires_at=?, handle=?, mode='live' WHERE id=?").run(
        t.token, t.expiresAt, t.username, ex.id
      );
    } else {
      db.prepare(
        "INSERT INTO accounts (user_id, platform, label, handle, access_token, external_id, token_expires_at, mode) VALUES (?,?,?,?,?,?,?, 'live')"
      ).run(req.user.id, 'instagram', t.username, t.username, t.token, t.igId, t.expiresAt);
    }
    res.redirect('/?ig=ok');
  } catch (e) {
    res.redirect('/?ig=err&msg=' + encodeURIComponent(e.message));
  }
});

// ---------- admin ----------
app.get('/api/admin/clients', auth, adminOnly, (req, res) => {
  const rows = db
    .prepare(
      `SELECT u.id, u.email, u.name, u.role, u.created_at,
        (SELECT COUNT(*) FROM accounts a WHERE a.user_id=u.id) AS accounts,
        (SELECT COUNT(*) FROM posts p WHERE p.user_id=u.id) AS posts
       FROM users u ORDER BY u.id`
    )
    .all();
  res.json(rows);
});

app.use((err, req, res, next) => {
  res.status(400).json({ error: err.message || 'Error' });
});

app.get('/healthz', (req, res) => res.json({ ok: true }));

scheduler.start();
app.listen(PORT, () => console.log(`Social Hub running on http://localhost:${PORT}`));
