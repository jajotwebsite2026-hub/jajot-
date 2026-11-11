// Platform adapters.
// Each adapter has: publish({ account, caption, mediaPath, mediaType }) -> { url }
// "demo" mode simulates a post. Real mode is added later when OAuth keys are ready.

const path = require('path');
const instagram = require('./instagram');
const facebook = require('./facebook');
const youtube = require('./youtube');
const linkedin = require('./linkedin');
const telegram = require('./telegram');
const threads = require('./threads');
const website = require('./website');
const googlebusiness = require('./googlebusiness');
const pinterest = require('./pinterest');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');

const LIMITS = {
  twitter: 280,
  instagram: 2200,
  facebook: 63206,
  linkedin: 3000,
  youtube: 5000,
  whatsapp: 4096,
  telegram: 4096,
  threads: 500,
  website: 5000,
  googlebusiness: 1500,
  pinterest: 900,
};

const PLATFORMS = Object.keys(LIMITS);

const NEEDS_MEDIA = {
  instagram: true,
  youtube: true,
  pinterest: true,
};

// These platforms only work through the "Connect ... (real)" buttons.
// (Instagram and Facebook profile added by hand are manual-share mode, see adapter below.)
const CONNECT_ONLY = ['youtube', 'linkedin', 'threads', 'googlebusiness', 'pinterest'];

function validate(platform, caption, mediaPath, mediaType) {
  if (!PLATFORMS.includes(platform)) return `Unknown platform: ${platform}`;
  if ((caption || '').length > LIMITS[platform]) {
    return `${platform} caption too long (max ${LIMITS[platform]})`;
  }
  if (NEEDS_MEDIA[platform] && !mediaPath) return `${platform} needs an image or video`;
  // YouTube takes a video, or an image that is turned into a 5 second video.
  if (platform === 'youtube' && mediaType !== 'video' && mediaType !== 'image') return 'youtube needs a video or an image';
  if (platform === 'pinterest' && mediaType !== 'image') return 'pinterest needs an image (video not supported yet)';
  return null;
}

async function demoPublish({ account, caption }) {
  await new Promise((r) => setTimeout(r, 150));
  // Simulate one failure on request, to test retry/history
  if ((caption || '').includes('[fail]')) throw new Error('Simulated platform error');
  return { url: `https://demo.local/${account.platform}/${account.handle || account.id}/${Date.now()}` };
}

const adapters = {};
for (const p of PLATFORMS) {
  adapters[p] = {
    async publish(args) {
      // X/Twitter: no free API. Give a ready-to-post link (opens X compose with the text filled).
      // The image goes through the History "Share with image" button (phone share sheet -> X app).
      if (p === 'twitter') {
        const q = new URLSearchParams({ text: args.caption || '' });
        return { url: `https://x.com/intent/post?${q}` };
      }
      // WhatsApp Channel: no posting API. Open the channel (handle = channel link); user pastes copied text.
      if (p === 'whatsapp') {
        const h = String(args.account.handle || '');
        if (/^https?:\/\//.test(h)) return { url: h };
        return { url: `https://wa.me/?${new URLSearchParams({ text: args.caption || '' })}` };
      }
      // Website: posts straight to the site's own /api/posts or WordPress (keys live in server Variables, not in the database).
      if (p === 'website') {
        const mediaUrl = args.mediaPath ? `${instagram.publicBase()}/pub/${args.mediaPath}` : null;
        return website.publish({ ...args, mediaUrl });
      }
      // Telegram: real posting whenever the bot token is set (account handle = channel @username).
      if (p === 'telegram' && telegram.configured()) {
        return telegram.publish({ ...args, filePath: args.mediaPath ? path.join(UPLOAD_DIR, args.mediaPath) : null });
      }
      // Instagram added by hand (not connected): manual-share mode. Open Instagram; the app offers Copy text / Share with image.
      if (p === 'instagram' && args.account.mode === 'demo') {
        return { url: 'https://www.instagram.com/' };
      }
      // Personal Facebook profile added by hand: Meta has no posting API for profiles, so manual-share mode.
      // Open Facebook; the app offers Copy text / Share with image.
      if (p === 'facebook' && args.account.mode === 'demo') {
        return { url: 'https://www.facebook.com/' };
      }
      if (args.account.mode === 'demo') {
        // A hand-added YouTube/LinkedIn/Threads/Google Business/Pinterest account is NOT connected. Never fake a successful post.
        if (CONNECT_ONLY.includes(p)) {
          throw new Error(`This ${p} account is not connected. Remove it and use the "Connect ${p}" button in the Accounts tab.`);
        }
        return demoPublish(args);
      }
      if (p === 'instagram' && args.account.mode === 'live') {
        const base = instagram.publicBase();
        return instagram.publish({ ...args, mediaUrl: `${base}/pub/${args.mediaPath}` });
      }
      if (p === 'facebook' && args.account.mode === 'live') {
        const mediaUrl = args.mediaPath ? `${instagram.publicBase()}/pub/${args.mediaPath}` : null;
        return facebook.publish({ ...args, mediaUrl });
      }
      if (p === 'threads' && args.account.mode === 'live') {
        const mediaUrl = args.mediaPath ? `${instagram.publicBase()}/pub/${args.mediaPath}` : null;
        return threads.publish({ ...args, mediaUrl });
      }
      if (p === 'googlebusiness' && args.account.mode === 'live') {
        const mediaUrl = args.mediaPath ? `${instagram.publicBase()}/pub/${args.mediaPath}` : null;
        return googlebusiness.publish({ ...args, mediaUrl });
      }
      if (p === 'pinterest' && args.account.mode === 'live') {
        const mediaUrl = args.mediaPath ? `${instagram.publicBase()}/pub/${args.mediaPath}` : null;
        return pinterest.publish({ ...args, mediaUrl });
      }
      if (p === 'youtube' && args.account.mode === 'live') {
        return youtube.publish({ ...args, filePath: path.join(UPLOAD_DIR, args.mediaPath || '') });
      }
      if (p === 'linkedin' && args.account.mode === 'live') {
        return linkedin.publish({ ...args, filePath: args.mediaPath ? path.join(UPLOAD_DIR, args.mediaPath) : null });
      }
      // TODO real mode: implement per platform with official API + OAuth tokens
      throw new Error(`${p} live mode not connected yet`);
    },
  };
}

module.exports = { PLATFORMS, LIMITS, NEEDS_MEDIA, validate, adapters };
