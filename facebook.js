// Facebook Page posting via Graph API. Env: FB_APP_ID, FB_APP_SECRET (Meta app Settings > Basic).
// Optional: FB_CONFIG_ID (only if the app uses "Facebook Login for Business" configurations).
const GRAPH = 'https://graph.facebook.com/v21.0';
const SCOPES = 'pages_show_list,pages_manage_posts,pages_read_engagement';

const envHelp = 'FB_APP_ID / FB_APP_SECRET';
const configured = () => Boolean(process.env.FB_APP_ID && process.env.FB_APP_SECRET);

function authUrl({ redirectUri, state }) {
  const q = new URLSearchParams({
    client_id: process.env.FB_APP_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
  });
  if (process.env.FB_CONFIG_ID) {
    q.set('config_id', process.env.FB_CONFIG_ID);
    q.set('override_default_response_type', 'true');
  } else {
    q.set('scope', SCOPES);
  }
  return `https://www.facebook.com/v21.0/dialog/oauth?${q}`;
}

async function jsonOrThrow(r) {
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) {
    const e = j.error || {};
    const code = e.code ? ` (code ${e.code}${e.error_subcode ? '/' + e.error_subcode : ''})` : '';
    throw new Error(`Facebook: ${e.error_user_msg || e.message || 'HTTP ' + r.status}${code}`);
  }
  return j;
}

const get = async (p, params) => jsonOrThrow(await fetch(`${GRAPH}/${p}?${new URLSearchParams(params)}`));
const post = async (p, params) => jsonOrThrow(await fetch(`${GRAPH}/${p}`, { method: 'POST', body: new URLSearchParams(params) }));

// code -> list of Pages the user manages (each with its own Page token)
async function connect({ code, redirectUri }) {
  const short = await get('oauth/access_token', {
    client_id: process.env.FB_APP_ID,
    client_secret: process.env.FB_APP_SECRET,
    redirect_uri: redirectUri,
    code,
  });
  const long = await get('oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: process.env.FB_APP_ID,
    client_secret: process.env.FB_APP_SECRET,
    fb_exchange_token: short.access_token,
  });
  const pages = await get('me/accounts', { fields: 'id,name,access_token', limit: '100', access_token: long.access_token });
  if (!pages.data || !pages.data.length) throw new Error('No Facebook Page found on this login. Create a Page first, then connect again.');
  return pages.data.map((p) => ({
    platform: 'facebook',
    label: p.name,
    handle: p.name,
    externalId: p.id,
    token: p.access_token, // Page token from a long-lived user token does not expire
    refreshToken: null,
    expiresAt: null,
  }));
}

async function publish({ account, caption, mediaUrl, mediaType }) {
  const token = account.access_token;
  const id = account.external_id;
  if (!token || !id) throw new Error('Facebook Page not connected');
  let res;
  if (mediaUrl && mediaType === 'video') {
    res = await post(`${id}/videos`, { file_url: mediaUrl, description: caption || '', access_token: token });
  } else if (mediaUrl) {
    res = await post(`${id}/photos`, { url: mediaUrl, caption: caption || '', access_token: token });
  } else {
    res = await post(`${id}/feed`, { message: caption || '', access_token: token });
  }
  const postId = res.post_id || res.id;
  let url = `https://www.facebook.com/${id}`;
  try {
    const m = await get(postId, { fields: 'permalink_url', access_token: token });
    if (m.permalink_url) url = m.permalink_url.startsWith('http') ? m.permalink_url : `https://www.facebook.com${m.permalink_url}`;
  } catch {}
  return { url };
}

module.exports = { envHelp, configured, authUrl, connect, publish };
