// Platform adapters.
// Each adapter has: publish({ account, caption, mediaPath, mediaType }) -> { url }
// "demo" mode simulates a post. Real mode is added later when OAuth keys are ready.

const path = require('path');
const instagram = require('./instagram');
const facebook = require('./facebook');
const youtube = require('./youtube');
const linkedin = require('./linkedin');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');

const LIMITS = {
  twitter: 280,
  instagram: 2200,
  facebook: 63206,
  linkedin: 3000,
  youtube: 5000,
};

const PLATFORMS = Object.keys(LIMITS);

const NEEDS_MEDIA = {
  instagram: true,
  youtube: true,
};

function validate(platform, caption, mediaPath, mediaType) {
  if (!PLATFORMS.includes(platform)) return `Unknown platform: ${platform}`;
  if ((caption || '').length > LIMITS[platform]) {
    return `${platform} caption too long (max ${LIMITS[platform]})`;
  }
  if (NEEDS_MEDIA[platform] && !mediaPath) return `${platform} needs an image or video`;
  if (platform === 'youtube' && mediaType !== 'video') return 'youtube needs a video';
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
      // X/Twitter: no paid API. Give a ready-to-post link (opens X compose with the text filled).
      if (p === 'twitter') {
        const q = new URLSearchParams({ text: args.caption || '' });
        return { url: `https://x.com/intent/post?${q}` };
      }
      if (args.account.mode === 'demo') return demoPublish(args);
      if (p === 'instagram' && args.account.mode === 'live') {
        const base = instagram.publicBase();
        return instagram.publish({ ...args, mediaUrl: `${base}/pub/${args.mediaPath}` });
      }
      if (p === 'facebook' && args.account.mode === 'live') {
        const mediaUrl = args.mediaPath ? `${instagram.publicBase()}/pub/${args.mediaPath}` : null;
        return facebook.publish({ ...args, mediaUrl });
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
