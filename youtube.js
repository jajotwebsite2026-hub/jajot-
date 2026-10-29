// YouTube uploads via Data API v3. Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET.
// Until Google audits the app, uploads are forced to "private" (Google rule).
const fs = require('fs');

const SCOPES = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly';
const envHelp = 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET';
const configured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

function authUrl({ redirectUri, state }) {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent select_account',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

async function jsonOrThrow(r) {
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) {
    const e = j.error;
    const msg = (e && (e.message || e.error_description)) || j.error_description || (typeof e === 'string' ? e : '') || 'HTTP ' + r.status;
    throw new Error(`YouTube: ${msg}`);
  }
  return j;
}

async function tokenCall(params) {
  return jsonOrThrow(
    await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        ...params,
      }),
    })
  );
}

async function connect({ code, redirectUri }) {
  const t = await tokenCall({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
  if (!t.refresh_token) throw new Error('Google did not give a refresh token. Remove the app from your Google account permissions and connect again.');
  const ch = await jsonOrThrow(
    await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
      headers: { Authorization: `Bearer ${t.access_token}` },
    })
  );
  const c = ch.items && ch.items[0];
  if (!c) throw new Error('No YouTube channel found on this Google account.');
  return [
    {
      platform: 'youtube',
      label: c.snippet.title,
      handle: c.snippet.customUrl || c.snippet.title,
      externalId: c.id,
      token: t.access_token,
      refreshToken: t.refresh_token,
      expiresAt: new Date(Date.now() + (t.expires_in || 3600) * 1000).toISOString(),
    },
  ];
}

async function freshToken(account) {
  if (account.access_token && account.token_expires_at && new Date(account.token_expires_at).getTime() > Date.now() + 60000) {
    return account.access_token;
  }
  if (!account.refresh_token) throw new Error('YouTube account needs reconnecting');
  const t = await tokenCall({ grant_type: 'refresh_token', refresh_token: account.refresh_token });
  return t.access_token;
}

async function publish({ account, caption, filePath, mediaType }) {
  if (mediaType !== 'video' || !filePath) throw new Error('YouTube needs a video');
  const token = await freshToken(account);
  const size = fs.statSync(filePath).size;
  const text = caption || 'Video';
  const title = text.split('\n')[0].slice(0, 100) || 'Video';
  const privacy = process.env.YT_PRIVACY === 'public' ? 'public' : 'private';
  const init = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(size),
        'X-Upload-Content-Type': 'video/*',
      },
      body: JSON.stringify({
        snippet: { title, description: text, categoryId: '22' },
        status: { privacyStatus: privacy, selfDeclaredMadeForKids: false },
      }),
    }
  );
  if (!init.ok) await jsonOrThrow(init);
  const loc = init.headers.get('location');
  if (!loc) throw new Error('YouTube: no upload URL returned');
  const up = await fetch(loc, {
    method: 'PUT',
    headers: { 'Content-Length': String(size), 'Content-Type': 'video/*' },
    body: fs.createReadStream(filePath),
    duplex: 'half',
  });
  const v = await jsonOrThrow(up);
  return { url: `https://youtu.be/${v.id}` };
}

module.exports = { envHelp, configured, authUrl, connect, publish };
