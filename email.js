// Email platform: each client connects their own Gmail with an App Password.
// A post is sent as an email from that Gmail to the recipients saved on the account.
// Account fields: external_id = gmail address, access_token = app password, handle = recipients (comma separated).
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const platforms = require('./platforms');
const instagram = require('./instagram');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
const MAX_ATTACH = 20 * 1024 * 1024; // Gmail limit is 25 MB per mail

// Register the platform without touching platforms.js (it shares the same objects).
platforms.LIMITS.email = 5000;
if (!platforms.PLATFORMS.includes('email')) platforms.PLATFORMS.push('email');

function transport(user, pass) {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });
}

function cleanList(s) {
  return String(s || '')
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function splitTitle(text) {
  const t = String(text || '').trim();
  const nl = t.indexOf('\n');
  const first = (nl === -1 ? t : t.slice(0, nl)).trim();
  if (first && first.length <= 100) return { subject: first, body: nl === -1 ? t : t.slice(nl + 1).trim() || t };
  return { subject: t.slice(0, 80).replace(/\s+\S*$/, '') + '...', body: t };
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function publish({ account, caption, mediaPath, mediaType }) {
  if (account.mode !== 'live' || !account.access_token || !account.external_id) {
    throw new Error('This email account is not connected. Remove it and use the "Connect Email" button in the Accounts tab.');
  }
  const to = cleanList(account.handle).filter((x) => EMAIL_RE.test(x));
  if (!to.length) throw new Error('No valid recipient email saved on this account');
  const { subject, body } = splitTitle(caption || (mediaPath ? 'New update' : ''));
  const attachments = [];
  let extra = '';
  if (mediaPath) {
    const file = path.join(UPLOAD_DIR, mediaPath);
    const size = fs.existsSync(file) ? fs.statSync(file).size : 0;
    if (size && size <= MAX_ATTACH) attachments.push({ filename: mediaPath, path: file });
    else extra = `\n\n${mediaType === 'video' ? 'Video' : 'Image'}: ${instagram.publicBase()}/pub/${mediaPath}`;
  }
  const text = body + extra;
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5">${esc(text).replace(/\n/g, '<br>')}</div>`;
  try {
    await transport(account.external_id, account.access_token).sendMail({
      from: account.external_id,
      to: to.join(', '),
      subject,
      text,
      html,
      attachments,
    });
  } catch (e) {
    if (e.responseCode === 535 || e.code === 'EAUTH') {
      throw new Error('Gmail login failed. Create a new App Password and reconnect the Email account.');
    }
    throw new Error('Email failed: ' + (e.message || e));
  }
  return { url: 'https://mail.google.com/mail/u/0/#sent' };
}

platforms.adapters.email = { publish };

// POST /api/email/connect  { gmail, appPassword, to }
function routes(app, { auth, db }) {
  app.post('/api/email/connect', auth, async (req, res) => {
    try {
      const gmail = String((req.body || {}).gmail || '').trim().toLowerCase();
      const pass = String((req.body || {}).appPassword || '').replace(/\s+/g, '');
      const to = cleanList((req.body || {}).to);
      if (!EMAIL_RE.test(gmail)) return res.status(400).json({ error: 'Enter a valid Gmail address' });
      if (pass.length < 12) return res.status(400).json({ error: 'App Password is 16 letters (not your normal password)' });
      if (!to.length) return res.status(400).json({ error: 'Enter at least one recipient email' });
      if (to.some((x) => !EMAIL_RE.test(x))) return res.status(400).json({ error: 'A recipient email looks wrong' });
      if (to.length > 50) return res.status(400).json({ error: 'Max 50 recipients' });
      try {
        await transport(gmail, pass).verify();
      } catch (e) {
        return res.status(400).json({ error: 'Gmail login failed. Check the Gmail and the 16 letter App Password (2-Step Verification must be on).' });
      }
      const handle = to.join(', ');
      const label = 'Email ' + gmail;
      const ex = db.prepare("SELECT id FROM accounts WHERE user_id=? AND platform='email' AND external_id=?").get(req.user.id, gmail);
      if (ex) {
        db.prepare("UPDATE accounts SET access_token=?, handle=?, label=?, mode='live' WHERE id=?").run(pass, handle, label, ex.id);
      } else {
        db.prepare(
          "INSERT INTO accounts (user_id, platform, label, handle, access_token, external_id, mode) VALUES (?,?,?,?,?,?, 'live')"
        ).run(req.user.id, 'email', label, handle, pass, gmail);
      }
      res.json({ ok: true, label });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}

module.exports = { publish, routes };
