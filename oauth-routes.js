// Generic "Connect <platform>" OAuth routes for Facebook and YouTube.
const providers = {
  facebook: require('./facebook'),
  youtube: require('./youtube'),
};
const ig = require('./instagram');

module.exports = function mount(app, { auth, db, jwt, JWT_SECRET }) {
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
