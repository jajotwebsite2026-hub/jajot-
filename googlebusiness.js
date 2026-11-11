// Google Business Profile (Maps / Search listing) posts via the Business Profile APIs.
// Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (same Google login as YouTube).
// Needs: (1) Google approval of the Cloud project for the Business Profile API (access request form),
//        (2) APIs enabled: My Business Account Management API, My Business Business Information API, Google My Business API,
//        (3) redirect URI <PUBLIC_URL>/auth/googlebusiness/callback added to the OAuth client.
// Each business location becomes one account. Posts are "Updates" with an optional photo (videos are not supported).
const SCOPES = 'https://www.googleapis.com/auth/business.manage';
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

async function jsonOrThrow(r, what) {
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) {
    const e = j.error;
    let msg = (e && (e.message || e.error_description)) || j.error_description || (typeof e === 'string' ? e : '') || 'HTTP ' + r.status;
    if (r.status === 429 || /quota|RESOURCE_EXHAUSTED/i.test(msg)) {
      msg += ' (Google has not approved the Business Profile API for this project yet. Apply with the access request form, then try again)';
    } else if (r.status === 403 && /has not been used|disabled|not enabled/i.test(msg)) {
      msg += ' (enable the Business Profile APIs in Google Cloud Console)';
    }
    throw new Error(`Google Business${what ? ' ' + what : ''}: ${msg}`);
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
    }),
    'login'
  );
}

const auth = (t) => ({ Authorization: `Bearer ${t}` });

async function connect({ code, redirectUri }) {
  const t = await tokenCall({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
  if (!t.refresh_token) throw new Error('Google did not give a refresh token. Remove the app from your Google account permissions and connect again.');
  const accs = await jsonOrThrow(
    await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', { headers: auth(t.access_token) }),
    'accounts'
  );
  const out = [];
  for (const a of accs.accounts || []) {
    // a.name = "accounts/123"
    let pageToken = '';
    do {
      const q = new URLSearchParams({ readMask: 'name,title,storefrontAddress', pageSize: '100' });
      if (pageToken) q.set('pageToken', pageToken);
      const locs = await jsonOrThrow(
        await fetch(`https://mybusinessbusinessinformation.googleapis.com/v1/${a.name}/locations?${q}`, { headers: auth(t.access_token) }),
        'locations'
      );
      for (const l of locs.locations || []) {
        const city = l.storefrontAddress && (l.storefrontAddress.locality || (l.storefrontAddress.addressLines || [])[0]);
        out.push({
          platform: 'googlebusiness',
          label: l.title || 'Google Business',
          handle: city || a.accountName || null,
          externalId: `${a.name}/${l.name}`, // accounts/123/locations/456
          token: t.access_token,
          refreshToken: t.refresh_token,
          expiresAt: null, // access token (1 h) is refreshed on every post
        });
      }
      pageToken = locs.nextPageToken || '';
    } while (pageToken);
  }
  if (!out.length) throw new Error('Google Business: no business location found on this Google account (it must be Owner or Manager of a verified profile).');
  return out;
}

async function freshToken(account) {
  if (!account.refresh_token) throw new Error('Google Business account needs reconnecting');
  try {
    const t = await tokenCall({ grant_type: 'refresh_token', refresh_token: account.refresh_token });
    return t.access_token;
  } catch (e) {
    if (/invalid_grant|expired|revoked/i.test(e.message)) {
      throw new Error('Google Business login expired - open Accounts and press "Connect Google Business" again');
    }
    throw e;
  }
}

async function publish({ account, caption, mediaUrl, mediaType }) {
  if (!account.external_id) throw new Error('Google Business not connected');
  if (mediaType === 'video') throw new Error('Google Business posts support photos only (no video). Remove the video or untick this account.');
  const text = String(caption || '').trim();
  if (!text && !mediaUrl) throw new Error('Google Business needs some text or a photo');
  const token = await freshToken(account);
  const body = { languageCode: 'en', summary: text.slice(0, 1500), topicType: 'STANDARD' };
  if (mediaUrl && mediaType === 'image') body.media = [{ mediaFormat: 'PHOTO', sourceUrl: mediaUrl }];
  const j = await jsonOrThrow(
    await fetch(`https://mybusiness.googleapis.com/v4/${account.external_id}/localPosts`, {
      method: 'POST',
      headers: { ...auth(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    'post'
  );
  return { url: j.searchUrl || 'https://business.google.com/' };
}

module.exports = { envHelp, configured, authUrl, connect, publish };
