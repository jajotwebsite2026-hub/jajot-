// Website posting: sends the post to the site's own endpoint (POST <site>/api/posts).
// Env: WEBSITE_POST_KEY (secret, sent as header X-Post-Key), WEBSITE_URL (default https://www.agtechnicals.com).
// Form fields: title, body, media_url (public link of the image/video, optional).
const base = () => String(process.env.WEBSITE_URL || 'https://www.agtechnicals.com').replace(/\/+$/, '');
const configured = () => Boolean(process.env.WEBSITE_POST_KEY);

function splitTitle(caption) {
  const text = String(caption || '').trim();
  const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  let title = (lines[0] || 'Update').slice(0, 80);
  let body = text;
  // first line is a short headline -> use it as title and keep the rest as body
  if (lines.length > 1 && lines[0].length <= 80) body = lines.slice(1).join('\n');
  return { title, body };
}

async function publish({ caption, mediaUrl }) {
  if (!configured()) throw new Error('Website is not set up: add WEBSITE_POST_KEY in the server Variables.');
  const { title, body } = splitTitle(caption);
  const fd = new FormData();
  fd.append('title', title);
  fd.append('body', body);
  if (mediaUrl) fd.append('media_url', mediaUrl);
  const r = await fetch(`${base()}/api/posts`, {
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
  const link = j.url || j.link || (j.id ? `${base()}/updates#${j.id}` : `${base()}/updates`);
  return { url: /^https?:\/\//.test(link) ? link : base() + link };
}

module.exports = { configured, publish };
