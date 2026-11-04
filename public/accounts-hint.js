// Accounts tab helper: quick-add buttons and a hint for platforms that have no "Connect" login button.
(function () {
  var HINTS = {
    telegram: {
      text: 'Telegram: put the channel @username in the handle box (example @mychannel). Make the bot @jajot_socialhub_bot an admin of that channel. Posts go out automatically.',
      ph: '@channelusername',
    },
    whatsapp: {
      text: 'WhatsApp Channel: put the channel link in the handle box. After posting, open History and use Open channel, Copy text and Share with image.',
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
    ['telegram', 'Add Telegram'],
    ['whatsapp', 'Add WhatsApp Channel'],
    ['twitter', 'Add X'],
    ['instagram', 'Add Instagram (manual)'],
  ];

  function setup() {
    var sel = document.getElementById('ac-platform');
    var hint = document.getElementById('ac-hint');
    var handle = document.getElementById('ac-handle');
    var label = document.getElementById('ac-label');
    var quick = document.getElementById('ac-quick');
    if (!sel || !hint || !handle || !label || !quick) return;

    function update() {
      var h = HINTS[sel.value];
      hint.textContent = h ? h.text : 'For this platform use the Connect buttons below.';
      handle.placeholder = h ? h.ph : '@handle (optional)';
    }
    sel.addEventListener('change', update);
    try { new MutationObserver(update).observe(sel, { childList: true }); } catch (e) {}

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
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();
