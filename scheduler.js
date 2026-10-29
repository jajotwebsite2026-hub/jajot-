const db = require('./db');
const { adapters } = require('./platforms');

const MAX_ATTEMPTS = 3;
let running = false;

async function processPost(post) {
  const targets = db
    .prepare(
      `SELECT t.*, a.platform, a.handle, a.label, a.mode, a.access_token, a.refresh_token, a.external_id, a.token_expires_at
       FROM post_targets t JOIN accounts a ON a.id = t.account_id
       WHERE t.post_id = ? AND t.status IN ('pending','failed') AND t.attempts < ?`
    )
    .all(post.id, MAX_ATTEMPTS);

  for (const t of targets) {
    const account = {
      id: t.account_id,
      platform: t.platform,
      handle: t.handle,
      mode: t.mode,
      access_token: t.access_token,
      refresh_token: t.refresh_token,
      external_id: t.external_id,
      token_expires_at: t.token_expires_at,
    };
    try {
      const res = await adapters[t.platform].publish({
        account,
        caption: t.caption || post.base_text || '',
        mediaPath: post.media_path,
        mediaType: post.media_type,
      });
      db.prepare(
        `UPDATE post_targets SET status='published', external_url=?, error=NULL,
         attempts=attempts+1, published_at=datetime('now') WHERE id=?`
      ).run(res.url, t.id);
    } catch (e) {
      db.prepare(
        `UPDATE post_targets SET status='failed', error=?, attempts=attempts+1 WHERE id=?`
      ).run(String(e.message || e), t.id);
    }
  }

  const rows = db.prepare('SELECT status, attempts FROM post_targets WHERE post_id = ?').all(post.id);
  const allDone = rows.every((r) => r.status === 'published');
  const stuck = rows.some((r) => r.status === 'failed' && r.attempts >= MAX_ATTEMPTS);
  const anyPending = rows.some((r) => r.status === 'pending' || (r.status === 'failed' && r.attempts < MAX_ATTEMPTS));
  let status = 'processing';
  if (allDone) status = 'published';
  else if (!anyPending && stuck) {
    status = rows.some((r) => r.status === 'published') ? 'partial' : 'failed';
  }
  db.prepare('UPDATE posts SET status=? WHERE id=?').run(status, post.id);
}

async function tick() {
  if (running) return;
  running = true;
  try {
    const due = db
      .prepare(
        `SELECT * FROM posts
         WHERE status IN ('queued','processing')
           AND (scheduled_at IS NULL OR scheduled_at <= datetime('now'))
         ORDER BY id LIMIT 10`
      )
      .all();
    for (const p of due) {
      db.prepare("UPDATE posts SET status='processing' WHERE id=?").run(p.id);
      await processPost(p);
    }
  } catch (e) {
    console.error('scheduler error', e);
  } finally {
    running = false;
  }
}

function start(intervalMs = 5000) {
  setInterval(tick, intervalMs);
  tick();
}

module.exports = { start, tick };
