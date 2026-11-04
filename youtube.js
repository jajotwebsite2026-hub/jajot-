// YouTube uploads via Data API v3. Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET.
// Until Google audits the app, uploads are forced to "private" (Google rule).
// An image is turned into a 5 second video first (YouTube only accepts video).
const fs = require('fs');
const { spawn } = require('child_process');

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
      // The 1-hour access token is refreshed on every upload, so no expiry is stored
      // (storing it made the Accounts tab show a false "login expired" after an hour).
      expiresAt: null,
    },
  ];
}

async function freshToken(account) {
  if (account.access_token && account.token_expires_at && new Date(account.token_expires_at).getTime() > Date.now() + 60000) {
    return account.access_token;
  }
  if (!account.refresh_token) throw new Error('YouTube account needs reconnecting');
  try {
    const t = await tokenCall({ grant_type: 'refresh_token', refresh_token: account.refresh_token });
    return t.access_token;
  } catch (e) {
    if (/invalid_grant|expired|revoked/i.test(e.message)) {
      throw new Error('YouTube login expired - open Accounts and press "Connect YouTube" again');
    }
    throw e;
  }
}

// Image -> 5 second silent-audio MP4 (even width/height, yuv420p so YouTube accepts it).
function imageToVideo(imgPath) {
  return new Promise((resolve, reject) => {
    let ff;
    try { ff = require('ffmpeg-static'); } catch { ff = null; }
    if (!ff) return reject(new Error('YouTube: image-to-video converter is not installed'));
    const out = imgPath + '.yt.mp4';
    const args = [
      '-y', '-loop', '1', '-framerate', '2', '-i', imgPath,
      '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
      '-t', '5', '-c:v', 'libx264', '-tune', 'stillimage', '-pix_fmt', 'yuv420p',
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-r', '24',
      '-c:a', 'aac', '-shortest', '-movflags', '+faststart', out,
    ];
    const p = spawn(ff, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err = (err + d).slice(-500); });
    const timer = setTimeout(() => p.kill('SIGKILL'), 90000);
    p.on('error', (e) => { clearTimeout(timer); reject(new Error('YouTube: converter failed to start (' + e.message + ')')); });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && fs.existsSync(out)) resolve(out);
      else reject(new Error('YouTube: could not turn the image into a video (use JPG or PNG)'));
    });
  });
}

async function publish({ account, caption, filePath, mediaType }) {
  if (!filePath || (mediaType !== 'video' && mediaType !== 'image')) throw new Error('YouTube needs a video or an image');
  let temp = null;
  try {
    if (mediaType === 'image') {
      temp = await imageToVideo(filePath);
      filePath = temp;
    }
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
  } finally {
    if (temp) fs.unlink(temp, () => {});
  }
}

module.exports = { envHelp, configured, authUrl, connect, publish };
