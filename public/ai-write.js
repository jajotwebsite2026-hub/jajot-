// "Write with AI" helper under the post text box.
(function () {
  function setup() {
    var ta = document.getElementById('c-text');
    if (!ta || document.getElementById('ai-wrap')) return;

    var wrap = document.createElement('div');
    wrap.id = 'ai-wrap';
    wrap.style.margin = '6px 0 10px';
    wrap.innerHTML =
      '<button type="button" id="ai-open">✨ Write with AI</button>' +
      '<div id="ai-panel" class="hidden" style="margin-top:8px;padding:10px;border:1px solid #d8dbe6;border-radius:8px">' +
      '<label>What is the post about? (Hindi, English or Hinglish)</label>' +
      '<textarea id="ai-idea" rows="3" placeholder="Example: Diwali offer, 20% off on all items from 5 to 8 Nov, shop name Jajot"></textarea>' +
      '<label>Style</label>' +
      '<select id="ai-tone">' +
      '<option value="professional">Professional</option>' +
      '<option value="friendly">Friendly</option>' +
      '<option value="festive">Festive</option>' +
      '<option value="short">Short and punchy</option>' +
      '</select>' +
      '<div class="row" style="margin-top:8px">' +
      '<button type="button" id="ai-write" class="primary">Write post</button>' +
      '<button type="button" id="ai-improve">Improve my text</button>' +
      '<button type="button" id="ai-close">Close</button>' +
      '</div>' +
      '<div id="ai-msg" class="muted"></div>' +
      '<div id="ai-result" class="hidden">' +
      '<label>AI draft (you can edit it)</label>' +
      '<textarea id="ai-out" rows="5"></textarea>' +
      '<div class="row"><button type="button" id="ai-use" class="primary">Use this text</button></div>' +
      '</div>' +
      '</div>';
    ta.parentNode.insertBefore(wrap, ta.nextSibling);

    var $ = function (id) { return document.getElementById(id); };
    var panel = $('ai-panel');
    var msg = $('ai-msg');

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

    function run(mode) {
      msg.textContent = 'Writing...';
      $('ai-result').classList.add('hidden');
      var body = { mode: mode, tone: $('ai-tone').value, idea: $('ai-idea').value, text: ta.value };
      $('ai-write').disabled = true;
      $('ai-improve').disabled = true;
      fetch('/api/ai/write', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (x) {
          if (!x.ok) { msg.textContent = x.j.error || 'Failed'; return; }
          msg.textContent = '';
          $('ai-out').value = x.j.text;
          $('ai-result').classList.remove('hidden');
        })
        .catch(function () { msg.textContent = 'Network error, try again.'; })
        .then(function () {
          $('ai-write').disabled = false;
          $('ai-improve').disabled = false;
        });
    }
    $('ai-write').onclick = function () { run('write'); };
    $('ai-improve').onclick = function () { run('improve'); };

    $('ai-use').onclick = function () {
      ta.value = $('ai-out').value;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      panel.classList.add('hidden');
      msg.textContent = '';
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();
