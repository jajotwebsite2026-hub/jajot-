// "Write with AI": drafts or improves post text through the Anthropic API.
// Env: ANTHROPIC_API_KEY (required), AI_MODEL (optional, default claude-haiku-5-5).
const TONES = {
  professional: 'professional, polished and trustworthy',
  friendly: 'warm, friendly and conversational',
  festive: 'festive, joyful and celebratory (suitable for an Indian festival such as Diwali)',
  short: 'short, punchy and attention-grabbing',
};

const hits = new Map(); // userId -> [timestamps]
function limited(uid) {
  const now = Date.now();
  const a = (hits.get(uid) || []).filter((t) => now - t < 3600 * 1000);
  if (a.length >= 40) { hits.set(uid, a); return true; }
  a.push(now);
  hits.set(uid, a);
  return false;
}

module.exports = function mount(app, { auth }) {
  app.get('/api/ai/status', auth, (req, res) => res.json({ enabled: Boolean(process.env.ANTHROPIC_API_KEY) }));

  app.post('/api/ai/write', auth, async (req, res) => {
    if (!process.env.ANTHROPIC_API_KEY) return res.status(400).json({ error: 'AI is not set up yet. Ask the admin to add the AI key.' });
    if (limited(req.user.id)) return res.status(429).json({ error: 'Too many AI requests this hour. Try again later.' });
    const { mode, idea, text, tone } = req.body || {};
    const t = TONES[tone] || TONES.professional;
    const src = String(mode === 'improve' ? text || '' : idea || '').trim().slice(0, 2000);
    if (!src) return res.status(400).json({ error: mode === 'improve' ? 'Write some text in the post box first.' : 'Tell the AI what the post is about.' });

    const system =
      'You write social media posts for a small business in India. ' +
      'Write in the same language the user used (English, Hindi in Devanagari, or Hinglish in Latin letters). ' +
      `Tone: ${t}. Keep it clear, accurate and under 600 characters. Use at most 3 fitting emojis and a few relevant hashtags only if they help. ` +
      'Never invent facts, prices, dates, offers or contact details that the user did not give. ' +
      'Output ONLY the final post text, with no quotes, no explanation and no preface.';
    const user = mode === 'improve'
      ? `Rewrite this draft so it reads well and professionally, keeping its meaning and facts exactly:\n\n${src}`
      : `Write a post about this:\n\n${src}`;

    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.AI_MODEL || 'claude-haiku-5-5',
          max_tokens: 700,
          system,
          messages: [{ role: 'user', content: user }],
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = (j.error && j.error.message) || 'HTTP ' + r.status;
        if (r.status === 401) return res.status(502).json({ error: 'AI key is not valid. Ask the admin to check it.' });
        if (r.status === 400 && /credit|balance/i.test(msg)) return res.status(502).json({ error: 'AI credits are finished. Ask the admin to add credits.' });
        return res.status(502).json({ error: 'AI error: ' + msg });
      }
      const out = ((j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n') || '').trim();
      if (!out) return res.status(502).json({ error: 'AI gave an empty answer. Try again.' });
      res.json({ text: out });
    } catch (e) {
      res.status(502).json({ error: 'AI is not reachable right now. Try again.' });
    }
  });
};
