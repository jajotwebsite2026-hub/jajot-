(() => {
  const $ = (id) => document.getElementById(id);
  const state = { me: null, platforms: [], limits: {}, accounts: [], mode: 'login' };

  const LABEL = { twitter: 'X (Twitter)', instagram: 'Instagram', facebook: 'Facebook', linkedin: 'LinkedIn', youtube: 'YouTube' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, { credentials: 'same-origin', ...opts });
    let data = {};
    try { data = await res.json(); } catch {}
    if (!res.ok) {
      const err = new Error(data.error || 'Request failed');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // ---------- auth ----------
  function setAuthMode(mode) {
    state.mode = mode;
    $('tab-login').classList.toggle('active', mode === 'login');
    $('tab-signup').classList.toggle('active', mode === 'signup');
    $('a-name').classList.toggle('hidden', mode !== 'signup');
    $('a-submit').textContent = mode === 'login' ? 'Login' : 'Create account';
    $('a-err').textContent = '';
  }
  $('tab-login').onclick = () => setAuthMode('login');
  $('tab-signup').onclick = () => setAuthMode('signup');

  $('auth-form').onsubmit = async (e) => {
    e.preventDefault();
    $('a-err').textContent = '';
    try {
      await api(state.mode === 'login' ? '/api/login' : '/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: $('a-name').value, email: $('a-email').value, password: $('a-pass').value }),
      });
      $('a-pass').value = '';
      await boot();
    } catch (err) {
      $('a-err').textContent = err.message;
    }
  };

  $('logout').onclick = async () => {
    await api('/api/logout', { method: 'POST' });
    location.reload();
  };

  // ---------- navigation ----------
  function show(view) {
    for (const v of ['compose', 'history', 'accounts', 'admin']) {
      $('view-' + v).classList.toggle('hidden', v !== view);
    }
    document.querySelectorAll('button.nav').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    if (view === 'history') loadHistory();
    if (view === 'accounts') loadAccounts();
    if (view === 'admin') loadAdmin();
    if (view === 'compose') loadAccounts();
  }
  document.querySelectorAll('button.nav').forEach((b) => (b.onclick = () => show(b.dataset.view)));

  // ---------- accounts ----------
  async function loadAccounts() {
    state.accounts = await api('/api/accounts');
    renderAccounts();
    renderChips();
  }

  function renderAccounts() {
    const el = $('ac-list');
    if (!state.accounts.length) {
      el.innerHTML = '<p class="muted">No accounts yet.</p>';
      return;
    }
    el.innerHTML = state.accounts
      .map(
        (a) => `<div class="item row">
          <div class="grow"><strong>${esc(a.label)}</strong> <span class="muted">${esc(LABEL[a.platform])} ${esc(a.handle)}</span>
          <span class="badge">${esc(a.mode)}</span></div>
          <button class="danger" data-del="${a.id}">Remove</button></div>`
      )
      .join('');
    el.querySelectorAll('[data-del]').forEach((b) => {
      b.onclick = async () => {
        if (!confirm('Remove this account? Its post history is removed too.')) return;
        await api('/api/accounts/' + b.dataset.del, { method: 'DELETE' });
        loadAccounts();
      };
    });
  }

  $('ac-add').onclick = async () => {
    $('ac-err').textContent = '';
    try {
      await api('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: $('ac-platform').value, label: $('ac-label').value, handle: $('ac-handle').value }),
      });
      $('ac-label').value = '';
      $('ac-handle').value = '';
      loadAccounts();
    } catch (err) {
      $('ac-err').textContent = err.message;
    }
  };

  // ---------- compose ----------
  const selected = new Set();

  function renderChips() {
    const el = $('c-accounts');
    $('c-empty').classList.toggle('hidden', state.accounts.length > 0);
    for (const id of [...selected]) if (!state.accounts.find((a) => a.id === id)) selected.delete(id);
    el.innerHTML = state.accounts
      .map(
        (a) => `<label class="chip ${selected.has(a.id) ? 'on' : ''}" data-id="${a.id}">
          ${esc(a.label)} <small>${esc(LABEL[a.platform])}</small></label>`
      )
      .join('');
    el.querySelectorAll('.chip').forEach((c) => {
      c.onclick = (e) => {
        e.preventDefault();
        const id = Number(c.dataset.id);
        selected.has(id) ? selected.delete(id) : selected.add(id);
        renderChips();
      };
    });
    renderCaptions();
  }

  function selectedPlatforms() {
    return [...new Set(state.accounts.filter((a) => selected.has(a.id)).map((a) => a.platform))];
  }

  const captionCache = {};
  function renderCaptions() {
    const el = $('c-captions');
    const plats = selectedPlatforms();
    el.innerHTML = plats.length ? '<label>Custom caption per platform (optional)</label>' : '';
    for (const p of plats) {
      const div = document.createElement('div');
      div.className = 'cap-block';
      div.innerHTML = `<span class="muted">${esc(LABEL[p])}</span> <span class="count" id="cnt-${p}"></span>
        <textarea rows="2" id="cap-${p}" placeholder="Leave empty to use main text"></textarea>`;
      el.appendChild(div);
      const ta = div.querySelector('textarea');
      ta.value = captionCache[p] || '';
      ta.oninput = () => { captionCache[p] = ta.value; updateCounts(); };
    }
    updateCounts();
  }

  function updateCounts() {
    const base = $('c-text').value;
    for (const p of selectedPlatforms()) {
      const len = ((captionCache[p] || '').trim() || base.trim()).length;
      const max = state.limits[p];
      const c = $('cnt-' + p);
      if (!c) continue;
      c.textContent = `${len} / ${max}`;
      c.classList.toggle('over', len > max);
    }
  }
  $('c-text').oninput = updateCounts;

  document.querySelectorAll('input[name=when]').forEach((r) => {
    r.onchange = () => $('c-when').classList.toggle('hidden', document.querySelector('input[name=when]:checked').value !== 'later');
  });

  $('c-send').onclick = async () => {
    const msg = $('c-msg');
    msg.className = 'muted';
    msg.textContent = '';
    const later = document.querySelector('input[name=when]:checked').value === 'later';
    if (later && !$('c-when').value) { msg.className = 'err'; msg.textContent = 'Pick a schedule time'; return; }

    const caps = {};
    for (const p of selectedPlatforms()) {
      const v = (captionCache[p] || '').trim();
      if (v) caps[p] = v;
    }
    const fd = new FormData();
    fd.append('text', $('c-text').value);
    fd.append('accountIds', JSON.stringify([...selected]));
    fd.append('captions', JSON.stringify(caps));
    if (later) fd.append('scheduleAt', new Date($('c-when').value).toISOString());
    const f = $('c-media').files[0];
    if (f) fd.append('media', f);

    $('c-send').disabled = true;
    try {
      await api('/api/posts', { method: 'POST', body: fd });
      msg.textContent = later ? 'Scheduled.' : 'Sent. Check History for status.';
      $('c-text').value = '';
      $('c-media').value = '';
      for (const k of Object.keys(captionCache)) delete captionCache[k];
      selected.clear();
      renderChips();
    } catch (err) {
      msg.className = 'err';
      msg.textContent = err.message;
    } finally {
      $('c-send').disabled = false;
    }
  };

  // ---------- history ----------
  let histTimer = null;
  async function loadHistory() {
    clearTimeout(histTimer);
    const posts = await api('/api/posts');
    const el = $('h-list');
    if (!posts.length) {
      el.innerHTML = '<p class="muted">No posts yet.</p>';
    } else {
      el.innerHTML = posts
        .map((p) => {
          const when = p.scheduled_at ? 'Scheduled ' + p.scheduled_at + ' UTC' : 'Created ' + p.created_at + ' UTC';
          const targets = p.targets
            .map(
              (t) => `<div class="target"><span class="badge ${esc(t.status)}">${esc(t.status)}</span>
              ${esc(t.label)} <span class="muted">(${esc(LABEL[t.platform])})</span>
              ${t.external_url ? ` <a href="${esc(t.external_url)}" target="_blank" rel="noopener">${t.platform === 'twitter' ? 'Open X &amp; post' : 'link'}</a>` : ''}
              ${t.error ? `<div class="e">${esc(t.error)}</div>` : ''}</div>`
            )
            .join('');
          const canRetry = p.targets.some((t) => t.status === 'failed');
          return `<div class="item">
            <span class="badge ${esc(p.status)}">${esc(p.status)}</span>
            <span class="muted">${esc(when)}</span>
            <div>${esc((p.base_text || '').slice(0, 200))}${p.media_type ? ` <span class="muted">[${esc(p.media_type)}]</span>` : ''}</div>
            ${targets}
            <div class="actions">
              ${canRetry ? `<button data-retry="${p.id}">Retry failed</button>` : ''}
              <button class="danger" data-rm="${p.id}">Delete</button>
            </div></div>`;
        })
        .join('');
      el.querySelectorAll('[data-retry]').forEach((b) => (b.onclick = async () => { await api(`/api/posts/${b.dataset.retry}/retry`, { method: 'POST' }); loadHistory(); }));
      el.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = async () => {
        if (!confirm('Delete this post record?')) return;
        try { await api('/api/posts/' + b.dataset.rm, { method: 'DELETE' }); } catch (e) { alert(e.message); }
        loadHistory();
      }));
    }
    if (!$('view-history').classList.contains('hidden')) histTimer = setTimeout(loadHistory, 5000);
  }

  // ---------- admin ----------
  async function loadAdmin() {
    const rows = await api('/api/admin/clients');
    $('ad-list').innerHTML = `<table><tr><th>Name</th><th>Email</th><th>Role</th><th>Accounts</th><th>Posts</th></tr>${rows
      .map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.email)}</td><td>${esc(r.role)}</td><td>${r.accounts}</td><td>${r.posts}</td></tr>`)
      .join('')}</table>`;
  }

  // ---------- boot ----------
  async function boot() {
    try {
      const me = await api('/api/me');
      state.me = me.user;
      state.platforms = me.platforms;
      state.limits = me.limits;
      $('ac-platform').innerHTML = me.platforms.map((p) => `<option value="${p}">${esc(LABEL[p])}</option>`).join('');
      $('who').textContent = me.user.name || me.user.email;
      $('nav-admin').classList.toggle('hidden', me.user.role !== 'admin');
      $('auth').classList.add('hidden');
      $('app').classList.remove('hidden');
      show('compose');
    } catch {
      $('app').classList.add('hidden');
      $('auth').classList.remove('hidden');
    }
  }
  boot();
})();
