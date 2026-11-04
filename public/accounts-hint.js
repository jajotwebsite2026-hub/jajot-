// Accounts tab helper: Connect Telegram (one tap), one-tap Connect X / WhatsApp Channel / Instagram (manual),
// a hint for platforms that have no OAuth login, and clear badges instead of "demo".
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
      text: 'Instagram by hand (manual): tap Connect Instagram (manual) and type your @username. After posting, open History and use Share with image, then choose Instagram. For automatic posting use Connect Instagram below.',
      ph: '@instagram_username',
    },
  };

  // One-tap buttons: ask for one thing, add the account, refresh the list.
  var ONE_TAP = [
    { platform: 'twitter', btn: 'Connect X', ask: 'Your X username (example @jajot_india)', label: function (v) { return 'X ' + v; }, handle: function (v) { return v.replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, '@').replace(/^@?/, '@').replace(/[/?].*$/, ''); } },
    { platform: 'whatsapp', btn: 'Connect WhatsApp Channel', ask: 'Paste your WhatsApp Channel link (https://whatsapp.com/channel/...)', label: function () { return 'WhatsApp Channel'; }, handle: function (v) { return v; }, check: function (v) { return /^https?:\/\//i.test(v) ? '' : 'Paste the full channel link starting with https://'; } },
    { platform: 'instagram', btn: 'Connect Instagram (manual)', ask: 'Your Instagram username (example @jajotindia)', label: function (v) { return 'Instagram ' + v; }, handle: function (v) { return v.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '@').replace(/^@?/, '@').replace(/[/?].*$/, ''); } },
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
      else if (/Instagram|X \(Twitter\)|WhatsApp/.test(t)) b.textContent = 'manual share';
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

    function update() {
      var h = HINTS[sel.value];
      hint.textContent = h ? h.text : 'For this platform use the Connect buttons below.';
      handle.placeholder = h ? h.ph : '@handle (optional)';
    }
    sel.addEventListener('change', update);
    try { new MutationObserver(update).observe(sel, { childList: true }); } catch (e) {}
    try { if (list) new MutationObserver(relabel).observe(list, { childList: true }); } catch (e) {}

    var msg = document.createElement('div');
    msg.className = 'muted';

    // --- Connect Telegram (one tap) ---
    var tgUrl = null;
    var tgBtn = document.createElement('button');
    tgBtn.type = 'button';
    tgBtn.textContent = 'Connect Telegram';
    tgBtn.className = 'primary';
    var tgFinish = document.createElement('button');
    tgFinish.type = 'button';
    tgFinish.textContent = 'Finish Telegram';
    quick.appendChild(tgBtn);
    quick.appendChild(document.createTextNode(' '));
    quick.appendChild(tgFinish);
    quick.appendChild(document.createTextNode(' '));

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

    // --- One-tap Connect X / WhatsApp Channel / Instagram (manual) ---
    ONE_TAP.forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = o.btn;
      b.onclick = function () {
        var v = window.prompt(o.ask);
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
      quick.appendChild(b);
      quick.appendChild(document.createTextNode(' '));
    });
    quick.appendChild(msg);
    update();
    relabel();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();
