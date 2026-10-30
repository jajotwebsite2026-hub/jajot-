// LinkedIn personal-profile posting. Env: LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET.
// Products needed on the LinkedIn app: "Share on LinkedIn" + "Sign In with LinkedIn using OpenID Connect".
const SCOPES = 'openid profile w_member_social';
const VERSION = process.env.LINKEDIN_VERSION || '202510';

const envHelp = 'LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET';
const configured = () => Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET);

function authUrl({ redirectUri, state }) {
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.LINKEDIN_CLIENT_ID,
    redirect_uri: redirectUri,
    state,
    scope: SCOPES,
  });
  return `https://www.linkedin.com/oauth/v2/authorization?${q}`;
}

async function connect({ code, redirectUri }) {
  const r = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: process.env.LINKEDIN_CLIENT_ID,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET,
    }),
  });
  const t = await r.json().catch(() => ({}));
  if (!r.ok || !t.access_token) throw new Error(`LinkedIn: ${t.error_description || t.error || 'HTTP ' + r.status}`);
  const u = await fetch('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: `Bearer ${t.access_token}` } });
  const me = await u.json().catch(() => ({}));
  if (!u.ok || !me.sub) {
    throw new Error('LinkedIn: could not read profile. Add product "Sign In with LinkedIn using OpenID Connect" to the LinkedIn app.');
  }
  return [
    {
      platform: 'linkedin',
      label: me.name || 'LinkedIn',
      handle: me.name || null,
      externalId: me.sub,
      token: t.access_token,
      refreshToken: t.refresh_token || null,
      expiresAt: t.expires_in ? new Date(Date.now() + t.expires_in * 1000).toISOString() : null,
    },
  ];
}

const headers = (token) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  'LinkedIn-Version': VERSION,
  'X-Restli-Protocol-Version': '2.0.0',
});

async function check(r, what) {
  if (r.ok) return r;
  const j = await r.json().catch(() => ({}));
  const exp = r.status === 401 ? ' (token expired - reconnect LinkedIn)' : '';
  throw new Error(`LinkedIn ${what}: ${j.message || 'HTTP ' + r.status}${exp}`);
}

async function uploadImage(token, owner, filePath) {
  const fs = require('fs');
  const init = await check(
    await fetch('https://api.linkedin.com/rest/images?action=initializeUpload', {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({ initializeUploadRequest: { owner } }),
    }),
    'image init'
  );
  const { value } = await init.json();
  await check(await fetch(value.uploadUrl, { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: fs.readFileSync(filePath) }), 'image upload');
  return value.image;
}

async function publish({ account, caption, filePath, mediaType }) {
  const token = account.access_token;
  if (!token || !account.external_id) throw new Error('LinkedIn not connected');
  if (account.token_expires_at && new Date(account.token_expires_at) < new Date()) {
    throw new Error('LinkedIn token expired - reconnect LinkedIn');
  }
  if (mediaType === 'video') throw new Error('LinkedIn video not supported yet - post text or image');
  const author = `urn:li:person:${account.external_id}`;
  const body = {
    author,
    commentary: caption || '',
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  };
  if (filePath && mediaType === 'image') {
    const image = await uploadImage(token, author, filePath);
    body.content = { media: { id: image } };
  }
  const r = await check(await fetch('https://api.linkedin.com/rest/posts', { method: 'POST', headers: headers(token), body: JSON.stringify(body) }), 'post');
  const urn = r.headers.get('x-restli-id') || r.headers.get('x-linkedin-id');
  return { url: urn ? `https://www.linkedin.com/feed/update/${urn}/` : 'https://www.linkedin.com/feed/' };
}

module.exports = { envHelp, configured, authUrl, connect, publish };
