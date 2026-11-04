// Telegram channel/group posting via Bot API (free, official). Env: TELEGRAM_BOT_TOKEN (from @BotFather).
// Account "handle" = channel @username (or t.me link, or numeric chat id). The bot must be an admin of the channel.
const fs = require('fs');
const path = require('path');

const configured = () => Boolean(process.env.TELEGRAM_BOT_TOKEN);

// Telegram Bot API limits: 50 MB per file upload, 10 MB for sendPhoto (bigger images go as a document).
const MAX_UPLOAD = 50 * 1024 * 1024;
const MAX_PHOTO = 10 * 1024 * 1024;

function chatId(handle) {
  let h = String(handle || '').trim();
  const m = h.match(/t\.me\/(?:s\/)?([A-Za-z0-9_]{4,})/i);
  if (m) h = '@' + m[1];
  if (/^-?\d+$/.test(h)) return h;
  if (h && !h.startsWith('@')) h = '@' + h;
  return h;
}

async function call(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, { method: 'POST', body });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) {
    let d = j.description || `HTTP ${r.status}`;
    if (/chat not found/i.test(d)) d += ' (check channel @username and that the bot is added as admin)';
    if (/not enough rights|administrator/i.test(d)) d += ' (make the bot an admin with permission to post)';
    throw new Error(`Telegram: ${d}`);
  }
  return j.result;
}

const form = (obj) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) if (v !== undefined && v !== null) f.append(k, v);
  return f;
};

async function publish({ account, caption, filePath, mediaType }) {
  if (!configured()) throw new Error('Telegram bot not configured (TELEGRAM_BOT_TOKEN missing)');
  const chat = chatId(account.handle);
  if (!chat) throw new Error('Telegram: put the channel @username in the handle box');
  const text = caption || '';
  let res;
  if (filePath && mediaType) {
    const isVideo = mediaType === 'video';
    const size = fs.statSync(filePath).size;
    if (size > MAX_UPLOAD) throw new Error('Telegram: file is over 50 MB (Telegram bot limit). Use a smaller file.');
    const asDocument = !isVideo && size > MAX_PHOTO;
    const method = isVideo ? 'sendVideo' : asDocument ? 'sendDocument' : 'sendPhoto';
    const field = isVideo ? 'video' : asDocument ? 'document' : 'photo';
    const blob = new Blob([fs.readFileSync(filePath)]);
    const f = form({ chat_id: chat });
    if (isVideo) f.append('supports_streaming', 'true');
    f.append(field, blob, path.basename(filePath));
    const short = text.length <= 1024;
    if (short && text) f.append('caption', text);
    res = await call(method, f);
    if (!short) res = await call('sendMessage', form({ chat_id: chat, text }));
  } else {
    if (!text) throw new Error('Telegram: nothing to post');
    res = await call('sendMessage', form({ chat_id: chat, text }));
  }
  const uname = chat.startsWith('@') ? chat.slice(1) : null;
  return { url: uname ? `https://t.me/${uname}/${res.message_id}` : 'https://t.me' };
}

module.exports = { configured, publish, chatId };
