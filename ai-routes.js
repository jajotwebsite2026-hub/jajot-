// "Write with AI": drafts or improves post text.
// Free option: GEMINI_API_KEY (Google AI Studio free tier). Optional GEMINI_MODEL, GEMINI_FALLBACK_MODEL.
// Paid option: ANTHROPIC_API_KEY. Optional AI_MODEL (default claude-haiku-5-5).
// Gemini is used first when both are set. Two Gemini models are raced in parallel; the first answer wins.
const TONES = {
  professional: 'professional, polished and trustworthy',
  friendly: 'warm, friendly and conversational',
  festive: 'festive, joyful and celebratory (suitable for an Indian festival such as Diwali)',
  short: 'short, punchy and attention-grabbing',
};
const LANGS = {
  hinglish: 'Hinglish (Hindi written in English/Latin letters, the way people text in India)',
  hindi: 'Hindi in Devanagari script',
  english: 'English',
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

async function geminiCall(model, system, user, think) {
  const gen = { maxOutputTokens: 400, temperature: 0.8 };
  if (think) gen.thinkingConfig = { thinkingBudget: 0 };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 12000);
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      signal: ac.signal,
      headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: gen,
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { status: r.status, msg: (j.error && j.error.message) || 'HTTP ' + r.status };
    const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
    const text = parts.map((p) => p.text || '').join('').trim();
    return text ? { text } : { status: 502, msg: 'empty' };
  } catch (e) {
    return { status: 503, msg: 'timeout' };
  } finally {
    clearTimeout(timer);
  }
}

// One model: try with thinking off; if the model rejects that setting, retry plain.
async function geminiModel(model, system, user) {
  let out = await geminiCall(model, system, user, true);
  if (!out.text && out.status === 400 && !/api key/i.test(out.msg || '')) out = await geminiCall(model, system, user, false);
  return out;
}

// First success wins; resolves with the last failure if all fail.
function race(models, system, user) {
  return new Promise((resolve) => {
    let left = models.length;
    let last = null;
    models.forEach((m) => {
      geminiModel(m, system, user).then((out) => {
        if (out.text) return resolve(out);
        last = out;
        if (--left === 0) resolve(last);
      });
    });
  });
}

async function viaGemini(system, user) {
  const a = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
  const b = process.env.GEMINI_FALLBACK_MODEL || 'gemini-flash-latest';
  let out = await race(a === b ? [a] : [a, b], system, user);
  if (!out.text) {
    const bad = out.status === 401 || out.status === 403 || (out.status === 400 && /api key/i.test(out.msg || ''));
    if (bad) return { error: 'AI key is not valid. Ask the admin to check it.' };
    out = await geminiModel('gemini-3.8-flash', system, user);
  }
  if (out.text) return out;
  if (out.status === 429) return { error: 'AI free limit reached for now. Try again in a minute.' };
  if (out.status === 503) return { error: 'AI is very busy right now. Press the button once more.' };
  return { error: 'AI error: ' + (out.msg || 'unknown') };
}

async function viaAnthropic(system, user) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL || 'claude-haiku-5-5',
      max_tokens: 500,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = (j.error && j.error.message) || 'HTTP ' + r.status;
    if (r.status === 401) return { error: 'AI key is not valid. Ask the admin to check it.' };
    if (r.status === 400 && /credit|balance/i.test(msg)) return { error: 'AI credits are finished. Ask the admin to add credits.' };
    return { error: 'AI error: ' + msg };
  }
  return { text: ((j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n') || '').trim() };
}

module.exports = function mount(app, { auth }) {
  const enabled = () => Boolean(process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY);

  app.get('/api/ai/status', auth, (req, res) => res.json({ enabled: enabled() }));

  app.post('/api/ai/write', auth, async (req, res) => {
    if (!enabled()) return res.status(400).json({ error: 'AI is not set up yet. Ask the admin to add the AI key.' });
    if (limited(req.user.id)) return res.status(429).json({ error: 'Too many AI requests this hour. Try again later.' });
    const { mode, idea, text, tone, lang } = req.body || {};
    const t = TONES[tone] || TONES.professional;
    const l = LANGS[lang] || LANGS.hinglish;
    const src = String(mode === 'improve' ? text || '' : idea || '').trim().slice(0, 1500);
    if (!src) return res.status(400).json({ error: mode === 'improve' ? 'Write some text in the post box first.' : 'Pick a topic button or type a few words.' });

    const system =
      'You write social media posts for a small business in India. ' +
      `Write the post in ${l}. ` +
      `Tone: ${t}. Keep it clear, accurate and under 350 characters. ` +
      'Add 2 to 4 emojis that fit the meaning of the text (for example a diya and sparkles for Diwali, a shopping bag for a sale, a gift for an offer, a smile for thanks). ' +
      'Add 2 or 3 relevant hashtags only if they help. ' +
      'Never invent facts, prices, dates, offers, names or contact details that the user did not give. ' +
      'Output ONLY the final post text, with no quotes, no explanation and no preface.';
    const user = mode === 'improve'
      ? `Rewrite this draft so it reads well and professionally, keeping its meaning and facts exactly:\n\n${src}`
      : `Write a post about this:\n\n${src}`;

    try {
      const out = process.env.GEMINI_API_KEY ? await viaGemini(system, user) : await viaAnthropic(system, user);
      if (out.error) return res.status(502).json({ error: out.error });
      if (!out.text) return res.status(502).json({ error: 'AI gave an empty answer. Try again.' });
      res.json({ text: out.text });
    } catch (e) {
      res.status(502).json({ error: 'AI is not reachable right now. Try again.' });
    }
  });
};
