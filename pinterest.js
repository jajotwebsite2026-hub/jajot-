// Pinterest: Connect Pinterest (OAuth) and create a Pin from an image. One Social Hub account per board.
// Env: PINTEREST_APP_ID, PINTEREST_APP_SECRET. Optional PINTEREST_API_BASE (default https://api.pinterest.com/v5;
// if the app only has Trial access and Pinterest asks for the sandbox, use https://api-sandbox.pinterest.com/v5).
// Redirect URI to register in the Pinterest app: <PUBLIC_URL>/auth/pinterest/callback
// Note: with Trial access Pins are visible only to the app owner. Standard access is needed for public Pins.
const SCOPES = 'boards:read,boards:write,pins:read,pins:write,user_accounts:read';

const envHelp = 'PINTEREST_APP_ID / PINTEREST_APP_SECRET';
const appId = () => process.env.PINTEREST_APP_ID;
const appSecret = () => process.env.PINTEREST_APP_SECRET;
const configured = () => Boolean(appId() && appSecret());
const api = () => String(process.env.PINTEREST_API_BASE || 'https://api.pinterest.com/v5').replace(/\/+$/, '');

function authUrl({ redirectUri, state }) {
  const q = new URLSearchParams({
    client_id: appId(),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    state,
  });
  return `https://www.pinterest.com/oauth/?${q}`;
}

async function jsonOrThrow(r, what) {
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j.message || j.error_description || j.error || `HTTP ${r.status}`;
    const hint = r.status === 401 ? ' (login expired - reconnect Pinterest)' : '';
    throw new Error(`Pinterest ${what}: ${msg}${j.code ? ' (code ' + j.code + ')' : ''}${hint}`);
  }
  return j;
}

async function connect({ code, redirectUri }) {
  const basic = Buffer.from(`${appId()}:${appSecret()}`).toString('base64');
  const t = await jsonOrThrow(
    await fetch(`${api()}/oauth/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
    }),
    'login'
  );
  const token = t.access_token;
  const h = { Authorization: `Bearer ${token}` };
  let username = '';
  try {
    const me = await jsonOrThrow(await fetch(`${api()}/user_account`, { headers: h }), 'profile');
    username = me.username || '';
  } catch {}
  const boards = await jsonOrThrow(await fetch(`${api()}/boards?page_size=25`, { headers: h }), 'boards');
  const items = (boards.items || []).slice(0, 15);
  if (!items.length) throw new Error('Pinterest: no boards found. Create a board on Pinterest first, then connect again.');
  const expiresAt = new Date(Date.now() + (t.expires_in || 2592000) * 1000).toISOString();
  return items.map((b) => ({
    platform: 'pinterest',
    label: `Pinterest ${b.name}`,
    handle: username ? '@' + username : null,
    externalId: String(b.id),
    token,
    refreshToken: t.refresh_token || null,
    expiresAt,
  }));
}

function splitTitle(caption) {
  const text = String(caption || '').trim();
  const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  let title = (lines[0] || 'Pin').slice(0, 100);
  let desc = text;
  if (lines.length > 1 && lines[0].length <= 100) desc = lines.slice(1).join('\n');
  return { title, desc: desc.slice(0, 800) };
}

async function publish({ account, caption, mediaUrl, mediaType }) {
  const token = account.access_token;
  if (!token || !account.external_id) throw new Error('Pinterest not connected');
  if (account.token_expires_at && new Date(account.token_expires_at) < new Date()) {
    throw new Error('Pinterest login expired - reconnect Pinterest');
  }
  if (!mediaUrl || mediaType !== 'image') throw new Error('Pinterest needs an image (video not supported yet)');
  const { title, desc } = splitTitle(caption);
  const body = {
    board_id: String(account.external_id),
    title,
    description: desc,
    media_source: { source_type: 'image_url', url: mediaUrl },
  };
  const j = await jsonOrThrow(
    await fetch(`${api()}/pins`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    'pin'
  );
  return { url: j.id ? `https://www.pinterest.com/pin/${j.id}/` : 'https://www.pinterest.com/' };
}

module.exports = { envHelp, configured, authUrl, connect, publish };
