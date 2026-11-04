// Accounts tab helper: Connect Telegram (one tap), quick-add buttons, a hint for platforms that have
// no "Connect" login button, and clear badges instead of "demo".
(function () {
  var HINTS = {
    telegram: {
      text: 'Telegram: tap Connect Telegram, choose your channel, confirm. Come back here and tap Finish Telegram. The channel is added and posts go out automatically.',
      ph: '@channelusername',
    },
    whatsapp: {
      text: 'WhatsApp Channel: put the channel link in the handle box. After posting, open History and use Copy text & open channel and Download image.',
      ph: 'https://whatsapp.com/channel/...',
    },
    twitter: {
      text: 'X (Twitter): handle is optional. After posting, open History and use Open X & post (and Share with image if you added a picture).',
      ph: '@handle (optional)',
    },
    instagram: {
      text: 'Instagram by hand (manual): put the @username in the handle box. After posting, open History and use Share with image, then choose Instagram. For automatic posting use Connect Instagram below.',
      ph: '@instagram_username',
    },
  };
  var QUICK = [
    ['whatsapp', 'Add WhatsApp Channel'],
    ['twitter', 'Add X'],
    ['instagram', 'Add Instagram (manual)'],
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

  function setup() {
    var sel = document.getElementById('ac-platform');
    var hint = document.getElementById('ac-hint');
    var handle = document.getElementById('ac-handle');
    var label = document.getElementById('ac-label');
    var quick = document.getElementById('ac-quick');
    var list = document.getElementById('ac-list');
    if (!sel || !hint || !handle || !label || !quick) return;

    function update() {
      var h = HINTS[sel.value];
      hint.textContent = h ? h.text : 'For this platform use the Connect buttons below.';
      handle.placeholder = h ? h.ph : '@handle (optional)';
    }
    sel.addEventListener('change', update);
    try { new MutationObserver(update).observe(sel, { childList: true }); } catch (e) {}
    try { if (list) new MutationObserver(relabel).observe(list, { childList: true }); } catch (e) {}

    // --- Connect Telegram (one tap) ---
    var tgUrl = null;
    var tgBtn = document.createElement('button');
    tgBtn.type = 'button';
    tgBtn.textContent = 'Connect Telegram';
    tgBtn.className = 'primary';
    var tgFinish = document.createElement('button');
    tgFinish.type = 'button';
    tgFinish.textContent = 'Finish Telegram';
    var tgMsg = document.createElement('div');
    tgMsg.className = 'muted';
    quick.appendChild(tgBtn);
    quick.appendChild(document.createTextNode(' '));
    quick.appendChild(tgFinish);
    quick.appendChild(tgMsg);

    fetch('/api/telegram/link', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j && j.url) tgUrl = j.url; else tgMsg.textContent = 'Telegram is not set up on the server yet.'; })
      .catch(function () {});

    tgBtn.onclick = function () {
      if (!tgUrl) { tgMsg.textContent = 'Telegram link not ready, wait a second and try again.'; return; }
      tgMsg.textContent = 'In Telegram: choose your channel, confirm adding the bot as admin. Then come back and tap Finish Telegram.';
      window.open(tgUrl, '_blank');
    };
    tgFinish.onclick = function () {
      tgMsg.textContent = 'Checking...';
      fetch('/api/telegram/scan', { method: 'POST', credentials: 'same-origin' })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (x) {
          if (!x.ok) { tgMsg.textContent = x.j.error || 'Failed'; return; }
          if (x.j.added && x.j.added.length) {
            tgMsg.textContent = 'Telegram connected: ' + x.j.added.join(', ');
            var nav = document.querySelector('button.nav[data-view="accounts"]');
            if (nav) nav.click();
          } else if (x.j.already) {
            tgMsg.textContent = 'This channel is already added.';
          } else {
            tgMsg.textContent = 'No new channel found. Tap Connect Telegram, choose the channel, confirm, then tap Finish again.';
          }
        })
        .catch(function () { tgMsg.textContent = 'Network error, try again.'; });
    };

    QUICK.forEach(function (q) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = q[1];
      b.onclick = function () {
        sel.value = q[0];
        sel.dispatchEvent(new Event('change'));
        label.focus();
      };
      quick.appendChild(b);
      quick.appendChild(document.createTextNode(' '));
    });
    update();
    relabel();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();
