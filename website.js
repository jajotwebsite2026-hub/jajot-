// Website posting. One platform ("Website"), the account handle (domain) decides which site gets the post.
//
// 1) Custom site (agtechnicals.com): POST <site>/api/posts with header X-Post-Key.
//    Env: WEBSITE_POST_KEY (secret), WEBSITE_URL (default https://www.agtechnicals.com).
//    Form fields: title, body, media_url (public link of the image/video, optional).
//
// 2) WordPress site (jajot.in): WordPress REST API with an Application Password.
//    Env: WP_URL (default https://jajot.in), WP_USER (WordPress username), WP_APP_PASSWORD (Application Password).
//    Uploads the image/video to the Media library and publishes a normal blog Post (image = featured image).
const fs = require('fs');
const path = require('path');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
const clean = (u) => String(u || '').replace(/\/+$/, '');
const hostOf = (u) => String(u || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[/?#].*$/, '');

const customBase = () => clean(process.env.WEBSITE_URL || 'https://www.agtechnicals.com');
const wpBase = () => clean(process.env.WP_URL || 'https://jajot.in');
const customConfigured = () => Boolean(process.env.WEBSITE_POST_KEY);
const wpConfigured = () => Boolean(process.env.WP_USER && process.env.WP_APP_PASSWORD);
const configured = () => customConfigured() || wpConfigured();

function splitTitle(caption) {
  const text = String(caption || '').trim();
  const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const title = (lines[0] || 'Update').slice(0, 80);
  let body = text;
  // first line is a short headline -> use it as title and keep the rest as body
  if (lines.length > 1 && lines[0].length <= 80) body = lines.slice(1).join('\n');
  return { title, body };
}

// ---------- custom site ----------
async function publishCustom({ caption, mediaUrl }) {
  if (!customConfigured()) throw new Error('Website is not set up: add WEBSITE_POST_KEY in the server Variables.');
  const { title, body } = splitTitle(caption);
  const fd = new FormData();
  fd.append('title', title);
  fd.append('body', body);
  if (mediaUrl) fd.append('media_url', mediaUrl);
  const r = await fetch(`${customBase()}/api/posts`, {
    method: 'POST',
    headers: { 'X-Post-Key': process.env.WEBSITE_POST_KEY },
    body: fd,
  });
  const txt = await r.text();
  let j = {};
  try { j = JSON.parse(txt); } catch {}
  if (!r.ok || j.error || j.ok === false) {
    const why = j.error || j.message || txt.slice(0, 160) || 'HTTP ' + r.status;
    throw new Error(`Website: ${why}${r.status === 401 || r.status === 403 ? ' (check WEBSITE_POST_KEY)' : ''}`);
  }
  const link = j.url || j.link || (j.id ? `${customBase()}/updates#${j.id}` : `${customBase()}/updates`);
  return { url: /^https?:\/\//.test(link) ? link : customBase() + link };
}

// ---------- WordPress ----------
const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function wpError(r, what) {
  const txt = await r.text().catch(() => '');
  let j = {};
  try { j = JSON.parse(txt); } catch {}
  let why = j.message || txt.slice(0, 160) || 'HTTP ' + r.status;
  if (r.status === 401 || r.status === 403) why += ' (check WP_USER / WP_APP_PASSWORD, user must be Administrator or Editor)';
  if (r.status === 404) why += ' (WordPress REST API not found, check WP_URL)';
  return new Error(`WordPress ${what}: ${why.replace(/<[^>]+>/g, '')}`);
}

async function publishWordPress({ caption, mediaPath, mediaType }) {
  if (!wpConfigured()) throw new Error('WordPress is not set up: add WP_USER and WP_APP_PASSWORD in the server Variables.');
  const auth = 'Basic ' + Buffer.from(`${process.env.WP_USER}:${String(process.env.WP_APP_PASSWORD).replace(/\s+/g, ' ')}`).toString('base64');
  const api = `${wpBase()}/wp-json/wp/v2`;
  const { title, body } = splitTitle(caption);

  let mediaId = null;
  let mediaSrc = null;
  if (mediaPath) {
    const file = path.join(UPLOAD_DIR, path.basename(mediaPath));
    const ext = path.extname(file).toLowerCase();
    const r = await fetch(`${api}/media`, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': MIME[ext] || (mediaType === 'video' ? 'video/mp4' : 'image/jpeg'),
        'Content-Disposition': `attachment; filename="${path.basename(file)}"`,
      },
      body: fs.readFileSync(file),
    });
    if (!r.ok) throw await wpError(r, 'media upload');
    const m = await r.json();
    mediaId = m.id;
    mediaSrc = m.source_url;
  }

  let html = body
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
  if (mediaSrc && mediaType === 'video') html += `\n<figure><video controls playsinline src="${esc(mediaSrc)}" style="max-width:100%"></video></figure>`;
  else if (mediaSrc) html = `<figure><img src="${esc(mediaSrc)}" alt="${esc(title)}" style="max-width:100%"></figure>\n` + html;

  const payload = { title, content: html, status: 'publish' };
  if (mediaId && mediaType !== 'video') payload.featured_media = mediaId;
  const r = await fetch(`${api}/posts`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw await wpError(r, 'post');
  const j = await r.json();
  return { url: j.link || wpBase() };
}

async function publish(args) {
  const host = hostOf(args.account && args.account.handle);
  if (host && host === hostOf(wpBase())) return publishWordPress(args);
  if (host && host === hostOf(customBase())) return publishCustom(args);
  if (!host) {
    // no domain on the account: use whichever site is configured
    if (customConfigured()) return publishCustom(args);
    if (wpConfigured()) return publishWordPress(args);
  }
  throw new Error(`Website ${host || ''} is not known. Use agtechnicals.com or jajot.in when you press Connect Website.`);
}

module.exports = { configured, publish };
