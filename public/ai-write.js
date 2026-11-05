// "Write with AI": small button under the post box. One click opens a compact panel.
// Pick a topic (or type), language, tap. Text (with emojis) goes straight into the post box.
// "X Clear" wipes the post text in one tap.
(function () {
  var TOPICS = [
    ['Diwali', 'Diwali wishes for our customers and their families'],
    ['Sale', 'A special offer or sale for our customers'],
    ['New', 'Announcing a new product or service'],
    ['Thanks', 'A thank you message to our customers'],
    ['Open', 'Our shop is open, visit us'],
  ];

  function store(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {}
    return null;
  }

  function setup() {
    var ta = document.getElementById('c-text');
    if (!ta || document.getElementById('ai-wrap')) return;

    var css = document.createElement('style');
    css.textContent =
      '#ai-wrap button,#ai-wrap select,#ai-wrap textarea{font-size:13px}' +
      '#ai-wrap button{padding:4px 10px;min-height:0}' +
      '#ai-wrap select{padding:4px 6px;width:auto;min-height:0}' +
      '#ai-wrap textarea{padding:6px;margin:6px 0}' +
      '#ai-panel{margin-top:6px;padding:8px;border:1px solid #d8dbe6;border-radius:8px}' +
      '#ai-panel .row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:4px 0}';
    document.head.appendChild(css);

    var chips = TOPICS.map(function (t, i) {
      return '<button type="button" class="ai-topic" data-i="' + i + '">' + t[0] + '</button>';
    }).join('');

    var wrap = document.createElement('div');
    wrap.id = 'ai-wrap';
    wrap.style.margin = '4px 0 8px';
    wrap.innerHTML =
      '<button type="button" id="ai-open">✨ AI ▾</button> ' +
      '<button type="button" id="ai-clear" title="Clear the text">✕ Clear</button> ' +
      '<span id="ai-note" class="muted" style="font-size:13px"></span>' +
      '<div id="ai-panel" class="hidden">' +
      '<div class="row"><span class="muted">Tap topic:</span>' + chips + '</div>' +
      '<textarea id="ai-idea" rows="2" placeholder="Or type a few words, e.g. Diwali offer 20% off"></textarea>' +
      '<div class="row">' +
      '<select id="ai-lang">' +
      '<option value="hinglish">Hinglish</option>' +
      '<option value="hindi">हिंदी</option>' +
      '<option value="english">English</option>' +
      '</select>' +
      '<select id="ai-tone">' +
      '<option value="professional">Professional</option>' +
      '<option value="friendly">Friendly</option>' +
      '<option value="festive">Festive</option>' +
      '<option value="short">Short</option>' +
      '</select>' +
      '</div>' +
      '<div class="row">' +
      '<button type="button" id="ai-write" class="primary">Write post</button>' +
      '<button type="button" id="ai-improve">Improve my text</button>' +
      '</div>' +
      '</div>';
    ta.parentNode.insertBefore(wrap, ta.nextSibling);

    var $ = function (id) { return document.getElementById(id); };
    var panel = $('ai-panel');
    var note = $('ai-note');

    var sl = store('ai-lang'); if (sl) $('ai-lang').value = sl;
    var st = store('ai-tone'); if (st) $('ai-tone').value = st;
    $('ai-lang').onchange = function () { store('ai-lang', this.value); };
    $('ai-tone').onchange = function () { store('ai-tone', this.value); };

    $('ai-clear').onclick = function () {
      ta.value = '';
      $('ai-idea').value = '';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      note.textContent = '';
      ta.focus();
    };

    $('ai-open').onclick = function () {
      panel.classList.toggle('hidden');
      $('ai-open').textContent = panel.classList.contains('hidden') ? '✨ AI ▾' : '✨ AI ▴';
      note.textContent = '';
      if (!panel.classList.contains('hidden')) {
        fetch('/api/ai/status', { credentials: 'same-origin' })
          .then(function (r) { return r.json(); })
          .then(function (j) { if (!j.enabled) note.textContent = 'AI is not set up yet.'; })
          .catch(function () {});
      }
    };

    var busy = false;
    function run(mode) {
      if (busy) return;
      busy = true;
      note.textContent = '⏳ Writing...';
      var body = { mode: mode, tone: $('ai-tone').value, lang: $('ai-lang').value, idea: $('ai-idea').value, text: ta.value };
      fetch('/api/ai/write', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (x) {
          if (!x.ok) { note.textContent = x.j.error || 'Failed'; return; }
          ta.value = x.j.text;
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          panel.classList.add('hidden');
          $('ai-open').textContent = '✨ AI ▾';
          note.textContent = '✅ Done. Edit if you want, or tap AI again for a new version.';
        })
        .catch(function () { note.textContent = 'Network error, try again.'; })
        .then(function () { busy = false; });
    }

    Array.prototype.forEach.call(panel.querySelectorAll('.ai-topic'), function (b) {
      b.onclick = function () {
        $('ai-idea').value = TOPICS[Number(b.getAttribute('data-i'))][1];
        run('write');
      };
    });
    $('ai-write').onclick = function () { run('write'); };
    $('ai-improve').onclick = function () { run('improve'); };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();
