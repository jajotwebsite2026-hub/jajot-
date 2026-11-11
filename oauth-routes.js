// Generic "Connect <platform>" OAuth routes for Facebook, YouTube, LinkedIn, Threads and Google Business,
// plus the one-tap Telegram connect (deep link makes the bot admin, then we scan for the channel),
// plus /x/:file, a public card page so an X post link shows the image.
const fs = require('fs');
const path = require('path');
const providers = {
  facebook: require('./facebook'),
  youtube: require('./youtube'),
  linkedin: require('./linkedin'),
  threads: require('./threads'),
  googlebusiness: require('./googlebusiness'),
};
const ig = require('./instagram');
const tg = require('./telegram');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');

async function tgCall(method, body = {}) {
  const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error('Telegram: ' + (j.description || 'HTTP ' + r.status));
  return j.result;
}
let botInfo = null;
async function bot() {
  if (!botInfo) botInfo = await tgCall('getMe');
  return botInfo;
}

module.exports = function mount(app, { auth, db, jwt, JWT_SECRET }) {
  require('./pwa-routes')(app);
  require('./ai-routes')(app, { auth });

  // ---- Public image card page for X (Twitter card). Opened by X's crawler when the post link is previewed. ----
  app.get('/x/:file', (req, res) => {
    const f = String(req.params.file || '');
    if (!/^[A-Za-z0-9._-]+$/.test(f) || !fs.existsSync(path.join(UPLOAD_DIR, f))) return res.status(404).send('Not found');
    const img = `${ig.publicBase(req)}/pub/${encodeURIComponent(f)}`;
    const page = `${ig.publicBase(req)}/x/${encodeURIComponent(f)}`;
    res.set('Cache-Control', 'public, max-age=3600');
    res.type('html').send(
      `<!doctype html><html><head><meta charset="utf-8"><title>Photo</title>` +
        `<meta name="twitter:card" content="summary_large_image">` +
        `<meta name="twitter:title" content="Photo">` +
        `<meta name="twitter:description" content="Photo">` +
        `<meta name="twitter:image" content="${img}">` +
        `<meta property="og:type" content="website">` +
        `<meta property="og:url" content="${page}">` +
        `<meta property="og:title" content="Photo">` +
        `<meta property="og:description" content="Photo">` +
        `<meta property="og:image" content="${img}">` +
        `<meta name="viewport" content="width=device-width,initial-scale=1"></head>` +
        `<body style="margin:0"><img src="${img}" alt="Photo" style="max-width:100%"></body></html>`
    );
  });

  // ---- Telegram one-tap connect ----
  app.get('/api/telegram/link', auth, async (req, res) => {
    if (!tg.configured()) return res.status(400).json({ error: 'Telegram bot is not configured' });
    try {
      const b = await bot();
      res.json({ url: `https://t.me/${b.username}?startchannel=true&admin=post_messages`, bot: b.username });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/telegram/scan', auth, async (req, res) => {
    if (!tg.configured()) return res.status(400).json({ error: 'Telegram bot is not configured' });
    try {
      const me = await bot();
      const ups = await tgCall('getUpdates', { allowed_updates: ['my_chat_member'], timeout: 0, limit: 100 });
      const since = Date.now() / 1000 - 30 * 60; // only channels the bot was added to in the last 30 minutes
      const seen = new Map();
      for (const u of ups) {
        const m = u.my_chat_member;
        if (!m || m.date < since) continue;
        const c = m.chat;
        if (!['channel', 'supergroup', 'group'].includes(c.type)) continue;
        seen.set(c.id, c);
      }
      const added = [];
      let already = 0;
      for (const c of seen.values()) {
        let ok = false;
        try {
          const cm = await tgCall('getChatMember', { chat_id: c.id, user_id: me.id });
          ok = cm.status === 'creator' || (cm.status === 'administrator' && cm.can_post_messages !== false);
        } catch {}
        if (!ok) continue;
        const ex = db
          .prepare('SELECT id FROM accounts WHERE user_id=? AND platform=? AND external_id=?')
          .get(req.user.id, 'telegram', String(c.id));
        if (ex) { already++; continue; }
        const handle = c.username ? '@' + c.username : String(c.id);
        const label = c.title || handle;
        db.prepare(
          "INSERT INTO accounts (user_id, platform, label, handle, external_id, mode) VALUES (?,?,?,?,?, 'live')"
        ).run(req.user.id, 'telegram', label, handle, String(c.id));
        added.push(label);
      }
      res.json({ added, already });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  for (const [name, P] of Object.entries(providers)) {
    const redirect = (req) => `${ig.publicBase(req)}/auth/${name}/callback`;

    app.get(`/auth/${name}/start`, auth, (req, res) => {
      if (!P.configured()) return res.status(500).send(`${name} is not configured (${P.envHelp} missing).`);
      const state = jwt.sign({ u: req.user.id, p: name }, JWT_SECRET, { expiresIn: '10m' });
      res.redirect(P.authUrl({ redirectUri: redirect(req), state }));
    });

    app.get(`/auth/${name}/callback`, auth, async (req, res) => {
      try {
        if (req.query.error) throw new Error(req.query.error_description || req.query.error);
        const st = jwt.verify(String(req.query.state || ''), JWT_SECRET);
        if (st.u !== req.user.id || st.p !== name) throw new Error('Wrong session, try again');
        const accts = await P.connect({ code: String(req.query.code || ''), redirectUri: redirect(req) });
        for (const a of accts) {
          const ex = db
            .prepare('SELECT id FROM accounts WHERE user_id=? AND platform=? AND external_id=?')
            .get(req.user.id, a.platform, a.externalId);
          if (ex) {
            db.prepare(
              "UPDATE accounts SET access_token=?, refresh_token=COALESCE(?, refresh_token), token_expires_at=?, label=?, handle=?, mode='live' WHERE id=?"
            ).run(a.token, a.refreshToken, a.expiresAt, a.label, a.handle, ex.id);
          } else {
            db.prepare(
              "INSERT INTO accounts (user_id, platform, label, handle, access_token, refresh_token, external_id, token_expires_at, mode) VALUES (?,?,?,?,?,?,?,?, 'live')"
            ).run(req.user.id, a.platform, a.label, a.handle, a.token, a.refreshToken, a.externalId, a.expiresAt);
          }
        }
        res.redirect(`/?ig=ok&msg=${encodeURIComponent(name + ' connected: ' + accts.map((a) => a.label).join(', '))}`);
      } catch (e) {
        res.redirect('/?ig=err&msg=' + encodeURIComponent(e.message));
      }
    });
  }
};
