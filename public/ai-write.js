// "Write with AI": small button under the post box. One click opens a compact panel.
// Tap a topic, one of your recent topics, or an AI idea. Text (with emojis) goes straight into the post box.
// A tiny x inside the post box and inside the topic box clears the text in one tap.
// Press Enter in the topic box to write the post (Shift+Enter = new line).
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
  function getRecent() {
    try { var a = JSON.parse(store('ai-recent') || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  }
  function addRecent(t) {
    t = String(t || '').trim().replace(/\s+/g, ' ').slice(0, 120);
    if (!t) return;
    var a = getRecent().filter(function (x) { return x.toLowerCase() !== t.toLowerCase(); });
    a.unshift(t);
    store('ai-recent', JSON.stringify(a.slice(0, 6)));
  }
  function short(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  // put a small x inside a textarea (top right) that clears it
  function addClear(el, onClear) {
    var box = document.createElement('div');
    box.className = 'ai-ta-wrap';
    el.parentNode.insertBefore(box, el);
    box.appendChild(el);
    el.classList.add('ai-has-x');
    var x = document.createElement('button');
    x.type = 'button';
    x.className = 'ai-x';
    x.title = 'Clear text';
    x.textContent = '×';
    x.style.display = 'none';
    box.appendChild(x);
    function sync() { x.style.display = el.value ? 'block' : 'none'; }
    el.addEventListener('input', sync);
    setInterval(sync, 500); // also catches the box being emptied after a post
    x.onclick = function () {
      el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      if (onClear) onClear();
      el.focus();
    };
    return box;
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
      '#ai-panel .row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:4px 0}' +
      '.ai-ta-wrap{position:relative}' +
      '.ai-has-x{padding-right:32px !important}' +
      '#ai-wrap .ai-x,.ai-x{position:absolute;top:7px;right:8px;width:22px;height:22px;line-height:20px;padding:0;min-height:0;' +
      'border:0;border-radius:50%;background:#d5d8e2;color:#222;font-size:16px;cursor:pointer;text-align:center;z-index:2}' +
      '#ai-wrap .ai-x{top:13px}' +
      '.ai-x:hover{background:#bfc4d4}';
    document.head.appendChild(css);

    addClear(ta);
    var postBox = ta.parentNode; // .ai-ta-wrap

    var chips = TOPICS.map(function (t, i) {
      return '<button type="button" class="ai-topic" data-i="' + i + '">' + t[0] + '</button>';
    }).join('');

    var wrap = document.createElement('div');
    wrap.id = 'ai-wrap';
    wrap.style.margin = '4px 0 8px';
    wrap.innerHTML =
      '<button type="button" id="ai-open">✨ AI ▾</button> ' +
      '<span id="ai-note" class="muted" style="font-size:13px"></span>' +
      '<div id="ai-panel" class="hidden">' +
      '<div class="row"><span class="muted">Tap topic:</span>' + chips + '</div>' +
      '<div class="row hidden" id="ai-recent-row"><span class="muted">Recent:</span></div>' +
      '<div class="row"><button type="button" id="ai-ideas">💡 Ideas for me</button></div>' +
      '<div class="row hidden" id="ai-ideas-row"></div>' +
      '<div id="ai-idea-box"><textarea id="ai-idea" rows="2" placeholder="Type a few words, e.g. Diwali offer 20% off, then press Enter"></textarea></div>' +
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
    postBox.parentNode.insertBefore(wrap, postBox.nextSibling);

    var $ = function (id) { return document.getElementById(id); };
    var panel = $('ai-panel');
    var note = $('ai-note');

    addClear($('ai-idea'));

    // Enter in the topic box = Write post. Shift+Enter = new line.
    $('ai-idea').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        run('write');
      }
    });

    var sl = store('ai-lang'); if (sl) $('ai-lang').value = sl;
    var st = store('ai-tone'); if (st) $('ai-tone').value = st;
    $('ai-lang').onchange = function () { store('ai-lang', this.value); };
    $('ai-tone').onchange = function () { store('ai-tone', this.value); };

    function renderRecent() {
      var row = $('ai-recent-row');
      var items = getRecent();
      Array.prototype.forEach.call(row.querySelectorAll('button'), function (b) { b.remove(); });
      if (!items.length) { row.classList.add('hidden'); return; }
      row.classList.remove('hidden');
      items.forEach(function (t) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = short(t, 22);
        b.title = t;
        b.onclick = function () { $('ai-idea').value = t; run('write'); };
        row.appendChild(b);
      });
    }
    renderRecent();

    $('ai-ideas').onclick = function () {
      if (busy) return;
      busy = true;
      note.textContent = '⏳ Finding ideas...';
      fetch('/api/ai/suggest', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topics: getRecent(), lang: $('ai-lang').value }),
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok) { note.textContent = res.j.error || 'Failed'; return; }
          var row = $('ai-ideas-row');
          row.innerHTML = '<span class="muted">Ideas:</span>';
          row.classList.remove('hidden');
          res.j.ideas.forEach(function (t) {
            var b = document.createElement('button');
            b.type = 'button';
            b.textContent = short(t, 40);
            b.title = t;
            b.onclick = function () { $('ai-idea').value = t; run('write'); };
            row.appendChild(b);
          });
          note.textContent = 'Tap an idea to write that post.';
        })
        .catch(function () { note.textContent = 'Network error, try again.'; })
        .then(function () { busy = false; });
    };

    $('ai-open').onclick = function () {
      panel.classList.toggle('hidden');
      $('ai-open').textContent = panel.classList.contains('hidden') ? '✨ AI ▾' : '✨ AI ▴';
      note.textContent = '';
      if (!panel.classList.contains('hidden')) {
        renderRecent();
        $('ai-idea').focus();
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
      var idea = $('ai-idea').value;
      var body = { mode: mode, tone: $('ai-tone').value, lang: $('ai-lang').value, idea: idea, text: ta.value };
      fetch('/api/ai/write', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok) { note.textContent = res.j.error || 'Failed'; return; }
          ta.value = res.j.text;
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          addRecent(mode === 'improve' ? res.j.text : idea);
          renderRecent();
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
