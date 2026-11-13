// Theme picker + live wallpaper (floating emoji). Choice is remembered in this browser.
(function () {
  var THEMES = {
    candy:  { name: 'Candy',  icon: '🍬', emoji: ['🌸', '✨', '💌', '📣', '⭐', '🦋', '☁️', '💖'] },
    ocean:  { name: 'Ocean',  icon: '🌊', emoji: ['🐚', '🐠', '🐳', '🌊', '💧', '⭐', '🫧', '🪸'] },
    forest: { name: 'Forest', icon: '🌿', emoji: ['🌿', '🍃', '🦋', '🐞', '🌼', '🍄', '🐝', '🌳'] },
    sunset: { name: 'Sunset', icon: '🌅', emoji: ['🌅', '🔥', '🧡', '🌴', '🦩', '☀️', '🍊', '✨'] },
    sweet:  { name: 'Sweet',  icon: '🧁', emoji: ['🧁', '🍓', '🍩', '🍭', '🎀', '🍰', '🍒', '🧸'] },
    night:  { name: 'Night',  icon: '🌙', emoji: ['🌙', '⭐', '✨', '🪐', '🦉', '💫', '🌌', '☁️'] },
  };
  var root = document.documentElement;
  var layer = null;
  var panel = null;

  function get(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function currentTheme() {
    var t = get('sh_theme', '');
    if (!THEMES[t]) {
      t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'candy';
    }
    return t;
  }
  function animOn() { return get('sh_anim', '1') !== '0'; }

  function rand(a, b) { return a + Math.random() * (b - a); }

  function buildLayer() {
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'wallpaper';
      layer.setAttribute('aria-hidden', 'true');
      document.body.appendChild(layer);
    }
    layer.innerHTML = '';
    layer.style.display = animOn() ? '' : 'none';
    var set_ = THEMES[root.dataset.theme].emoji;
    var count = window.innerWidth < 600 ? 14 : 26;
    for (var i = 0; i < count; i++) {
      var s = document.createElement('span');
      s.textContent = set_[i % set_.length];
      s.style.left = rand(0, 98).toFixed(1) + '%';
      s.style.fontSize = rand(18, 38).toFixed(0) + 'px';
      s.style.animationDuration = rand(16, 34).toFixed(1) + 's, ' + rand(3, 6).toFixed(1) + 's';
      s.style.animationDelay = '-' + rand(0, 34).toFixed(1) + 's, -' + rand(0, 6).toFixed(1) + 's';
      s.style.opacity = rand(0.28, 0.6).toFixed(2);
      layer.appendChild(s);
    }
  }

  function apply(t) {
    root.dataset.theme = t;
    set('sh_theme', t);
    var m = document.querySelector('meta[name=theme-color]');
    if (m) m.setAttribute('content', getComputedStyle(root).getPropertyValue('--accent').trim() || '#8b5cf6');
    buildLayer();
    if (panel) markActive();
  }

  function markActive() {
    panel.querySelectorAll('[data-t]').forEach(function (b) {
      b.classList.toggle('on', b.dataset.t === root.dataset.theme);
    });
    var cb = panel.querySelector('#th-anim');
    if (cb) cb.checked = animOn();
  }

  function buildPicker() {
    var btn = document.createElement('button');
    btn.id = 'theme-btn';
    btn.type = 'button';
    btn.title = 'Change theme';
    btn.textContent = '🎨';
    document.body.appendChild(btn);

    panel = document.createElement('div');
    panel.id = 'theme-panel';
    panel.className = 'hidden';
    var html = '<div class="th-title">Pick a theme</div><div class="th-grid">';
    Object.keys(THEMES).forEach(function (k) {
      html += '<button type="button" data-t="' + k + '"><span class="th-ic">' + THEMES[k].icon + '</span>' + THEMES[k].name + '</button>';
    });
    html += '</div><label class="th-anim"><input type="checkbox" id="th-anim"> Floating stickers (live wallpaper)</label>';
    panel.innerHTML = html;
    document.body.appendChild(panel);

    btn.onclick = function () { panel.classList.toggle('hidden'); };
    panel.querySelectorAll('[data-t]').forEach(function (b) {
      b.onclick = function () { apply(b.dataset.t); };
    });
    panel.querySelector('#th-anim').onchange = function (e) {
      set('sh_anim', e.target.checked ? '1' : '0');
      layer.style.display = e.target.checked ? '' : 'none';
    };
    document.addEventListener('click', function (e) {
      if (!panel.classList.contains('hidden') && !panel.contains(e.target) && e.target !== btn) panel.classList.add('hidden');
    });
  }

  function init() {
    root.dataset.theme = currentTheme();
    buildPicker();
    apply(root.dataset.theme);
    var rt;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(buildLayer, 400); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
