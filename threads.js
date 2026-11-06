// Threads posting via the official Threads API (graph.threads.net).
// Env: THREADS_APP_ID, THREADS_APP_SECRET (the Threads app id/secret from the Meta dashboard, not the main app id).
// Permissions: threads_basic, threads_content_publish. Redirect URI to register: <PUBLIC_URL>/auth/threads/callback
const GRAPH = 'https://graph.threads.net/v1.0';
const SCOPES = 'threads_basic,threads_content_publish';

const envHelp = 'THREADS_APP_ID / THREADS_APP_SECRET';
const appId = () => process.env.THREADS_APP_ID;
const appSecret = () => process.env.THREADS_APP_SECRET;
const configured = () => Boolean(appId() && appSecret());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function authUrl({ redirectUri, state }) {
  const q = new URLSearchParams({
    client_id: appId(),
    redirect_uri: redirectUri,
    scope: SCOPES,
    response_type: 'code',
    state,
  });
  return `https://threads.net/oauth/authorize?${q}`;
}

async function jsonOrThrow(r) {
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error || j.error_message) {
    const e = j.error || {};
    const msg = e.error_user_msg || e.message || (typeof j.error === 'string' ? j.error : '') || j.error_message || `HTTP ${r.status}`;
    const code = e.code ? ` (code ${e.code}${e.error_subcode ? '/' + e.error_subcode : ''})` : '';
    throw new Error(`Threads: ${msg}${code}`);
  }
  return j;
}

// code -> long-lived token + profile
async function connect({ code, redirectUri }) {
  const clean = String(code || '').replace(/#_$/, '');
  const short = await jsonOrThrow(
    await fetch('https://graph.threads.net/oauth/access_token', {
      method: 'POST',
      body: new URLSearchParams({
        client_id: appId(),
        client_secret: appSecret(),
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code: clean,
      }),
    })
  );
  const longQ = new URLSearchParams({
    grant_type: 'th_exchange_token',
    client_secret: appSecret(),
    access_token: short.access_token,
  });
  const long = await jsonOrThrow(await fetch(`https://graph.threads.net/access_token?${longQ}`));
  const token = long.access_token || short.access_token;
  const me = await jsonOrThrow(
    await fetch(`${GRAPH}/me?${new URLSearchParams({ fields: 'id,username,name', access_token: token })}`)
  );
  const uname = me.username ? '@' + me.username : null;
  return [
    {
      platform: 'threads',
      label: me.name || uname || 'Threads',
      handle: uname,
      externalId: String(me.id || short.user_id),
      token,
      refreshToken: null,
      expiresAt: new Date(Date.now() + (long.expires_in || 5184000) * 1000).toISOString(),
    },
  ];
}

async function post(pathname, params, token) {
  return jsonOrThrow(
    await fetch(`${GRAPH}/${pathname}`, {
      method: 'POST',
      body: new URLSearchParams({ ...params, access_token: token }),
    })
  );
}

async function publish({ account, caption, mediaUrl, mediaType }) {
  const token = account.access_token;
  const uid = account.external_id;
  if (!token || !uid) throw new Error('Threads not connected');
  if (account.token_expires_at && new Date(account.token_expires_at) < new Date()) {
    throw new Error('Threads token expired - reconnect Threads');
  }
  const params = { text: caption || '' };
  if (mediaUrl && mediaType === 'video') {
    params.media_type = 'VIDEO';
    params.video_url = mediaUrl;
  } else if (mediaUrl && mediaType === 'image') {
    params.media_type = 'IMAGE';
    params.image_url = mediaUrl;
  } else {
    params.media_type = 'TEXT';
    if (!params.text.trim()) throw new Error('Threads needs some text, an image or a video');
  }
  const container = await post(`${uid}/threads`, params, token);

  // wait until Threads has processed the container
  for (let i = 0; i < 60; i++) {
    let st = {};
    try {
      st = await jsonOrThrow(
        await fetch(`${GRAPH}/${container.id}?${new URLSearchParams({ fields: 'status,error_message', access_token: token })}`)
      );
    } catch {}
    if (st.status === 'FINISHED') break;
    if (st.status === 'ERROR' || st.status === 'EXPIRED') throw new Error('Threads could not process the post (' + (st.error_message || st.status) + ')');
    await sleep(params.media_type === 'VIDEO' ? 5000 : 2000);
  }
  let pub;
  for (let i = 0; i < 5; i++) {
    try {
      pub = await post(`${uid}/threads_publish`, { creation_id: container.id }, token);
      break;
    } catch (e) {
      if (i === 4 || !/not ready|try again|unexpected/i.test(e.message)) throw e;
      await sleep(4000);
    }
  }
  let url = `https://www.threads.net/${account.handle || ''}`;
  try {
    const m = await jsonOrThrow(
      await fetch(`${GRAPH}/${pub.id}?${new URLSearchParams({ fields: 'permalink', access_token: token })}`)
    );
    if (m.permalink) url = m.permalink;
  } catch {}
  return { url };
}

module.exports = { envHelp, configured, authUrl, connect, publish };
