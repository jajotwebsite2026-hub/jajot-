// "Write with AI": drafts or improves post text, and suggests related topics.
// Providers, tried in this order when their key is set:
//   1. GROQ_API_KEY      (free, very fast)  optional GROQ_MODEL
//   2. GEMINI_API_KEY    (free, slower)     optional GEMINI_MODEL, GEMINI_FALLBACK_MODEL
//   3. ANTHROPIC_API_KEY (paid)             optional AI_MODEL
// Every failed attempt is logged (provider, model, status) so problems are visible in Railway logs.
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
  if (a.length >= 60) { hits.set(uid, a); return true; }
  a.push(now);
  hits.set(uid, a);
  return false;
}

function fail(provider, model, status, msg) {
  console.warn(`[ai] ${provider} ${model} failed: ${status} ${String(msg).slice(0, 160)}`);
  return { status, msg: String(msg) };
}
const isKeyBad = (o) => o.status === 401 || o.status === 403 || (o.status === 400 && /api key/i.test(o.msg || ''));

// ---------- Groq (OpenAI-compatible) ----------
async function groqOnce(model, system, user) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 7000);
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal: ac.signal,
      headers: { Authorization: 'Bearer ' + process.env.GROQ_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.8,
        max_tokens: 400,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return fail('groq', model, r.status, (j.error && j.error.message) || 'HTTP ' + r.status);
    const text = ((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '').trim();
    return text ? { text } : fail('groq', model, 502, 'empty');
  } catch (e) {
    return fail('groq', model, 503, 'timeout');
  } finally {
    clearTimeout(timer);
  }
}

async function viaGroq(system, user) {
  const models = [process.env.GROQ_MODEL || 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
  let last = null;
  for (const m of models) {
    const out = await groqOnce(m, system, user);
    if (out.text) return out;
    last = out;
    if (isKeyBad(out)) break;
  }
  return last;
}

// ---------- Gemini ----------
async function geminiCall(model, system, user, think) {
  const gen = { maxOutputTokens: 400, temperature: 0.8 };
  if (think) gen.thinkingConfig = { thinkingBudget: 0 };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 10000);
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
    if (!r.ok) return fail('gemini', model, r.status, (j.error && j.error.message) || 'HTTP ' + r.status);
    const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
    const text = parts.map((p) => p.text || '').join('').trim();
    return text ? { text } : fail('gemini', model, 502, 'empty');
  } catch (e) {
    return fail('gemini', model, 503, 'timeout');
  } finally {
    clearTimeout(timer);
  }
}
async function geminiModel(model, system, user) {
  let out = await geminiCall(model, system, user, true);
  if (!out.text && out.status === 400 && !/api key/i.test(out.msg || '')) out = await geminiCall(model, system, user, false);
  return out;
}
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
  return race(a === b ? [a] : [a, b], system, user);
}

// ---------- Anthropic ----------
async function viaAnthropic(system, user) {
  const model = process.env.AI_MODEL || 'claude-haiku-5-5';
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model, max_tokens: 500, system, messages: [{ role: 'user', content: user }] }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = (j.error && j.error.message) || 'HTTP ' + r.status;
      if (r.status === 400 && /credit|balance/i.test(msg)) return fail('anthropic', model, r.status, 'credits finished');
      return fail('anthropic', model, r.status, msg);
    }
    const text = ((j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n') || '').trim();
    return text ? { text } : fail('anthropic', model, 502, 'empty');
  } catch (e) {
    return fail('anthropic', model, 503, 'unreachable');
  }
}

async function generate(system, user) {
  const steps = [];
  if (process.env.GROQ_API_KEY) steps.push(viaGroq);
  if (process.env.GEMINI_API_KEY) steps.push(viaGemini);
  if (process.env.ANTHROPIC_API_KEY) steps.push(viaAnthropic);
  let last = null;
  for (const step of steps) {
    const out = await step(system, user);
    if (out && out.text) return out;
    last = out;
  }
  if (last && isKeyBad(last)) return { error: 'AI key is not valid. Ask the admin to check it.' };
  if (last && last.status === 429) return { error: 'AI free limit reached for now. Try again in a minute.' };
  return { error: 'AI is busy right now. Press the button once more.' };
}

module.exports = function mount(app, { auth }) {
  const enabled = () => Boolean(process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY);

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
      const t0 = Date.now();
      const out = await generate(system, user);
      console.log(`[ai] write ${out.text ? 'ok' : 'FAILED'} in ${Date.now() - t0} ms`);
      if (out.error) return res.status(502).json({ error: out.error });
      res.json({ text: out.text });
    } catch (e) {
      console.warn('[ai] crash', e && e.message);
      res.status(502).json({ error: 'AI is not reachable right now. Try again.' });
    }
  });

  // Related topic ideas from the user's recent post topics.
  app.post('/api/ai/suggest', auth, async (req, res) => {
    if (!enabled()) return res.status(400).json({ error: 'AI is not set up yet. Ask the admin to add the AI key.' });
    if (limited(req.user.id)) return res.status(429).json({ error: 'Too many AI requests this hour. Try again later.' });
    const { topics, lang } = req.body || {};
    const l = LANGS[lang] || LANGS.hinglish;
    const recent = (Array.isArray(topics) ? topics : [])
      .map((x) => String(x || '').trim().slice(0, 120))
      .filter(Boolean)
      .slice(0, 6);
    const system =
      'You help a small business in India decide what to post on social media. ' +
      'Suggest exactly 6 NEW post topic ideas. Each idea is one short line (max 10 words), specific and ready to turn into a post. ' +
      `Write the ideas in ${l}. ` +
      'Do not repeat the recent topics; make them related to the same business or theme. ' +
      'Output only the 6 lines, no numbering, no bullets, no extra text.';
    const user = recent.length
      ? `Recent post topics of this business:\n- ${recent.join('\n- ')}\n\nSuggest 6 related new topics.`
      : 'This business has no recent posts yet. It is Diwali season in India. Suggest 6 general post topics for a small business.';
    try {
      const out = await generate(system, user);
      if (out.error) return res.status(502).json({ error: out.error });
      const ideas = out.text
        .split(/\r?\n/)
        .map((s) => s.replace(/^[\s\-\*•\d\.\)]+/, '').replace(/^["']|["']$/g, '').trim())
        .filter((s) => s && s.length <= 140)
        .slice(0, 6);
      if (!ideas.length) return res.status(502).json({ error: 'AI gave no ideas. Try again.' });
      res.json({ ideas });
    } catch (e) {
      res.status(502).json({ error: 'AI is not reachable right now. Try again.' });
    }
  });
};
