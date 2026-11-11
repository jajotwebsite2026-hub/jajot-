// Accounts tab helper: Connect Telegram (one tap), Connect Threads, Connect Google Business, one-tap Connect X / WhatsApp Channel / Website,
// all in the same blue row as the other Connect buttons.
// Also a hint line and clear badges instead of "demo".
(function () {
  var HINTS = {
    telegram: {
      text: 'Telegram: tap Connect Telegram, choose your channel, confirm. Come back here and tap Finish Telegram. The channel is added and posts go out automatically.',
      ph: '@channelusername',
    },
    whatsapp: {
      text: 'WhatsApp Channel: tap Connect WhatsApp Channel and paste your channel link. After posting, open History and use Copy text & open channel and Download image.',
      ph: 'https://whatsapp.com/channel/...',
    },
    twitter: {
      text: 'X (Twitter): tap Connect X and type your @username. After posting, open History and use Open X & post, then press Post in X.',
      ph: '@handle',
    },
    instagram: {
      text: 'Instagram: use the Connect Instagram (real) button for automatic posting.',
      ph: '@instagram_username',
    },
    facebook: {
      text: 'Facebook: use the Connect Facebook Page (real) button for automatic posting to a business Page.',
      ph: 'Your Facebook name',
    },
    threads: {
      text: 'Threads: use the Connect Threads button (automatic posting).',
      ph: '@threads_username',
    },
    googlebusiness: {
      text: 'Google Business: use the Connect Google Business button. Posts go to your Google Maps / Search listing as an Update (text + photo, no video).',
      ph: '',
    },
    website: {
      text: 'Website: tap Connect Website. Posts go straight to your site Updates page (first line = title, rest = text, image/video attached).',
      ph: 'agtechnicals.com',
    },
  };

  // One-tap buttons: ask for one thing, add the account, refresh the list.
  var ONE_TAP = [
    { platform: 'twitter', btn: 'Connect X', ask: 'Your X username (example @jajot_india)', label: function (v) { return 'X ' + v; }, handle: function (v) { return v.replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, '@').replace(/^@?/, '@').replace(/[/?].*$/, ''); } },
    { platform: 'whatsapp', btn: 'Connect WhatsApp Channel', ask: 'Paste your WhatsApp Channel link (https://whatsapp.com/channel/...)', label: function () { return 'WhatsApp Channel'; }, handle: function (v) { return v; }, check: function (v) { return /^https?:\/\//i.test(v) ? '' : 'Paste the full channel link starting with https://'; } },
    { platform: 'website', btn: 'Connect Website', ask: 'Website to post to (press OK)', def: 'agtechnicals.com', label: function (h) { return 'Website ' + h; }, handle: function (v) { return v.replace(/^https?:\/\//i, '').replace(/\/.*$/, ''); } },
  ];

  // Replace the technical "demo" badge with something a client understands.
  function relabel() {
    var list = document.getElementById('ac-list');
    if (!list) return;
    list.querySelectorAll('.item').forEach(function (it) {
      var b = it.querySelector('.badge');
      var m = it.querySelector('.muted');
      if (!b || !m || b.textContent.trim() !== 'demo') return;
      var t = m.textContent;
      if (/Telegram/.test(t)) b.textContent = 'auto (bot)';
      else if (/Website/.test(t)) b.textContent = 'auto (key)';
      else if (/Instagram|Facebook|X \(Twitter\)|WhatsApp/.test(t)) b.textContent = 'manual share';
      else b.textContent = 'not connected';
    });
  }

  function reloadAccounts() {
    var nav = document.querySelector('button.nav[data-view="accounts"]');
    if (nav) nav.click();
  }

  function setup() {
    var sel = document.getElementById('ac-platform');
    var hint = document.getElementById('ac-hint');
    var handle = document.getElementById('ac-handle');
    var quick = document.getElementById('ac-quick');
    var list = document.getElementById('ac-list');
    if (!sel || !hint || !handle || !quick) return;

    // Same row as the Connect Instagram/Facebook/YouTube/LinkedIn buttons.
    var li = document.querySelector('a[href="/auth/linkedin/start"]');
    var box = li && li.parentNode ? li.parentNode : quick;

    function update() {
      var h = HINTS[sel.value];
      hint.textContent = h ? h.text : 'For this platform use the Connect buttons.';
      handle.placeholder = h ? h.ph : '@handle (optional)';
    }
    sel.addEventListener('change', update);
    try { new MutationObserver(update).observe(sel, { childList: true }); } catch (e) {}
    try { if (list) new MutationObserver(relabel).observe(list, { childList: true }); } catch (e) {}

    function addBtn(text) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'primary';
      b.textContent = text;
      box.appendChild(document.createTextNode(' '));
      box.appendChild(b);
      return b;
    }

    var msg = document.createElement('div');
    msg.className = 'muted';

    // --- Connect Telegram (one tap) ---
    var tgUrl = null;
    var tgBtn = addBtn('Connect Telegram');
    var tgFinish = addBtn('Finish Telegram');

    fetch('/api/telegram/link', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j && j.url) tgUrl = j.url; else msg.textContent = 'Telegram is not set up on the server yet.'; })
      .catch(function () {});

    tgBtn.onclick = function () {
      if (!tgUrl) { msg.textContent = 'Telegram link not ready, wait a second and try again.'; return; }
      msg.textContent = 'In Telegram: choose your channel, confirm adding the bot as admin. Then come back and tap Finish Telegram.';
      window.open(tgUrl, '_blank');
    };
    tgFinish.onclick = function () {
      msg.textContent = 'Checking...';
      fetch('/api/telegram/scan', { method: 'POST', credentials: 'same-origin' })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (x) {
          if (!x.ok) { msg.textContent = x.j.error || 'Failed'; return; }
          if (x.j.added && x.j.added.length) {
            msg.textContent = 'Telegram connected: ' + x.j.added.join(', ');
            reloadAccounts();
          } else if (x.j.already) {
            msg.textContent = 'This channel is already added.';
          } else {
            msg.textContent = 'No new channel found. Tap Connect Telegram, choose the channel, confirm, then tap Finish again.';
          }
        })
        .catch(function () { msg.textContent = 'Network error, try again.'; });
    };

    // --- Connect Threads (real OAuth) ---
    var thBtn = addBtn('Connect Threads');
    thBtn.onclick = function () { window.location.href = '/auth/threads/start'; };

    // --- Connect Google Business (real OAuth) ---
    var gbBtn = addBtn('Connect Google Business');
    gbBtn.onclick = function () { window.location.href = '/auth/googlebusiness/start'; };

    // --- One-tap Connect X / WhatsApp Channel / Website ---
    ONE_TAP.forEach(function (o) {
      var b = addBtn(o.btn);
      b.onclick = function () {
        var v = window.prompt(o.ask, o.def || '');
        if (v === null) return;
        v = v.trim();
        if (!v) { msg.textContent = 'Nothing entered.'; return; }
        var bad = o.check ? o.check(v) : '';
        if (bad) { msg.textContent = bad; return; }
        var h = o.handle(v);
        msg.textContent = 'Adding...';
        fetch('/api/accounts', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform: o.platform, label: o.label(h), handle: h }),
        })
          .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
          .then(function (x) {
            if (!x.ok) { msg.textContent = x.j.error || 'Failed'; return; }
            msg.textContent = o.btn.replace('Connect ', '') + ' added.';
            reloadAccounts();
          })
          .catch(function () { msg.textContent = 'Network error, try again.'; });
      };
    });
    box.parentNode.insertBefore(msg, box.nextSibling);
    update();
    relabel();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();
