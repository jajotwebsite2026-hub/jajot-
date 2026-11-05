// "Write with AI" helper under the post text box. Easy for a busy client:
// pick a topic button (or type a few words), pick language, tap Write post.
// The result goes straight into the post box.
(function () {
  var TOPICS = [
    ['Diwali wishes', 'Diwali wishes for our customers and their families'],
    ['Sale / offer', 'A special offer or sale for our customers'],
    ['New product', 'Announcing a new product or service'],
    ['Thank you', 'A thank you message to our customers'],
    ['Shop open', 'Our shop is open, visit us'],
  ];

  function store(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {}
    return null;
  }

  function setup() {
    var ta = document.getElementById('c-text');
    if (!ta || document.getElementById('ai-wrap')) return;

    var chips = TOPICS.map(function (t, i) {
      return '<button type="button" class="ai-topic" data-i="' + i + '">' + t[0] + '</button>';
    }).join(' ');

    var wrap = document.createElement('div');
    wrap.id = 'ai-wrap';
    wrap.style.margin = '6px 0 10px';
    wrap.innerHTML =
      '<button type="button" id="ai-open">✨ Write with AI</button>' +
      '<div id="ai-panel" class="hidden" style="margin-top:8px;padding:10px;border:1px solid #d8dbe6;border-radius:8px">' +
      '<label>Tap a topic (or type your own words below)</label>' +
      '<div class="row">' + chips + '</div>' +
      '<textarea id="ai-idea" rows="2" placeholder="Example: Diwali offer, 20% off on all items from 5 to 8 Nov"></textarea>' +
      '<div class="row">' +
      '<div><label>Language</label>' +
      '<select id="ai-lang">' +
      '<option value="hinglish">Hinglish</option>' +
      '<option value="hindi">हिंदी (Hindi)</option>' +
      '<option value="english">English</option>' +
      '</select></div>' +
      '<div><label>Style</label>' +
      '<select id="ai-tone">' +
      '<option value="professional">Professional</option>' +
      '<option value="friendly">Friendly</option>' +
      '<option value="festive">Festive</option>' +
      '<option value="short">Short and punchy</option>' +
      '</select></div>' +
      '</div>' +
      '<div class="row" style="margin-top:8px">' +
      '<button type="button" id="ai-write" class="primary">Write post</button>' +
      '<button type="button" id="ai-improve">Improve my text</button>' +
      '<button type="button" id="ai-close">Close</button>' +
      '</div>' +
      '<div id="ai-msg" class="muted"></div>' +
      '</div>';
    ta.parentNode.insertBefore(wrap, ta.nextSibling);

    var $ = function (id) { return document.getElementById(id); };
    var panel = $('ai-panel');
    var msg = $('ai-msg');

    var sl = store('ai-lang'); if (sl) $('ai-lang').value = sl;
    var st = store('ai-tone'); if (st) $('ai-tone').value = st;
    $('ai-lang').onchange = function () { store('ai-lang', this.value); };
    $('ai-tone').onchange = function () { store('ai-tone', this.value); };

    $('ai-open').onclick = function () {
      panel.classList.toggle('hidden');
      if (!panel.classList.contains('hidden')) {
        fetch('/api/ai/status', { credentials: 'same-origin' })
          .then(function (r) { return r.json(); })
          .then(function (j) { if (!j.enabled) msg.textContent = 'AI is not set up yet. Ask the admin to add the AI key.'; })
          .catch(function () {});
      }
    };
    $('ai-close').onclick = function () { panel.classList.add('hidden'); };

    Array.prototype.forEach.call(panel.querySelectorAll('.ai-topic'), function (b) {
      b.onclick = function () {
        $('ai-idea').value = TOPICS[Number(b.getAttribute('data-i'))][1];
        run('write');
      };
    });

    function run(mode) {
      msg.textContent = 'Writing...';
      var body = { mode: mode, tone: $('ai-tone').value, lang: $('ai-lang').value, idea: $('ai-idea').value, text: ta.value };
      var btns = panel.querySelectorAll('button');
      Array.prototype.forEach.call(btns, function (b) { b.disabled = true; });
      fetch('/api/ai/write', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (x) {
          if (!x.ok) { msg.textContent = x.j.error || 'Failed'; return; }
          ta.value = x.j.text;
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          msg.textContent = '✅ Text added in the post box above. Edit if you want, or press Write post again for another version.';
        })
        .catch(function () { msg.textContent = 'Network error, try again.'; })
        .then(function () {
          Array.prototype.forEach.call(btns, function (b) { b.disabled = false; });
        });
    }
    $('ai-write').onclick = function () { run('write'); };
    $('ai-improve').onclick = function () { run('improve'); };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();
