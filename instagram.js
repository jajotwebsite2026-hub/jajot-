// Real Instagram posting via "Instagram API with Instagram Login".
// Needs env: IG_APP_ID, IG_APP_SECRET (Instagram app id/secret from Meta dashboard).
const path = require('path');

const GRAPH = 'https://graph.instagram.com/v21.0';
const SCOPES = 'instagram_business_basic,instagram_business_content_publish';

const appId = () => process.env.IG_APP_ID;
const appSecret = () => process.env.IG_APP_SECRET;
const configured = () => Boolean(appId() && appSecret());

function publicBase(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '');
  if (req) return `${req.protocol}://${req.get('host')}`;
  throw new Error('PUBLIC_URL not set');
}

function authUrl({ redirectUri, state }) {
  const q = new URLSearchParams({
    client_id: appId(),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    state,
  });
  return `https://www.instagram.com/oauth/authorize?${q}`;
}

async function jsonOrThrow(r) {
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error || j.error_message) {
    const e = j.error || {};
    const msg = e.error_user_msg || e.message || (typeof j.error === 'string' ? j.error : '') || j.error_message || `HTTP ${r.status}`;
    const code = e.code ? ` (code ${e.code}${e.error_subcode ? '/' + e.error_subcode : ''})` : '';
    throw new Error(`Instagram: ${msg}${code}`);
  }
  return j;
}

// code -> long-lived token + profile
async function connect({ code, redirectUri }) {
  const short = await jsonOrThrow(
    await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      body: new URLSearchParams({
        client_id: appId(),
        client_secret: appSecret(),
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code,
      }),
    })
  );
  const s = Array.isArray(short.data) ? short.data[0] : short;
  const longQ = new URLSearchParams({
    grant_type: 'ig_exchange_token',
    client_secret: appSecret(),
    access_token: s.access_token,
  });
  const long = await jsonOrThrow(await fetch(`https://graph.instagram.com/access_token?${longQ}`));
  const me = await jsonOrThrow(
    await fetch(`${GRAPH}/me?${new URLSearchParams({ fields: 'user_id,username', access_token: long.access_token })}`)
  );
  return {
    token: long.access_token,
    expiresAt: new Date(Date.now() + (long.expires_in || 5184000) * 1000).toISOString(),
    igId: String(me.user_id || s.user_id),
    username: me.username,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(pathname, params, token) {
  return jsonOrThrow(
    await fetch(`${GRAPH}/${pathname}`, {
      method: 'POST',
      body: new URLSearchParams({ ...params, access_token: token }),
    })
  );
}

async function publish({ account, caption, mediaUrl, mediaType, mediaPath }) {
  const token = account.access_token;
  const igId = account.external_id;
  if (!token || !igId) throw new Error('Instagram account not connected');
  if (account.token_expires_at && new Date(account.token_expires_at) < new Date()) {
    throw new Error('Instagram token expired - reconnect the account');
  }
  if (mediaType === 'image' && !/\.jpe?g$/i.test(mediaPath || '')) {
    throw new Error('Instagram live posting needs a JPG image (PNG not supported)');
  }
  const params = { caption: caption || '' };
  if (mediaType === 'video') {
    params.media_type = 'REELS';
    params.video_url = mediaUrl;
  } else {
    params.image_url = mediaUrl;
  }
  const container = await post('me/media', params, token);

  // Wait until Instagram has processed the media (images and videos both need it)
  for (let i = 0; i < 60; i++) {
    let st = {};
    try {
      st = await jsonOrThrow(
        await fetch(`${GRAPH}/${container.id}?${new URLSearchParams({ fields: 'status_code', access_token: token })}`)
      );
    } catch {}
    if (st.status_code === 'FINISHED') break;
    if (st.status_code === 'ERROR' || st.status_code === 'EXPIRED') throw new Error('Instagram could not process the media (' + st.status_code + ')');
    await sleep(mediaType === 'video' ? 5000 : 2000);
  }
  let pub;
  for (let i = 0; i < 6; i++) {
    try {
      pub = await post('me/media_publish', { creation_id: container.id }, token);
      break;
    } catch (e) {
      if (!/9007|not ready/i.test(e.message) || i === 5) throw e;
      await sleep(4000);
    }
  }
  let url = `https://www.instagram.com/${account.handle || ''}`;
  try {
    const m = await jsonOrThrow(
      await fetch(`${GRAPH}/${pub.id}?${new URLSearchParams({ fields: 'permalink', access_token: token })}`)
    );
    if (m.permalink) url = m.permalink;
  } catch {}
  return { url };
}

module.exports = { configured, publicBase, authUrl, connect, publish };
