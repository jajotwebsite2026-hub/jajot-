// Shows the result after returning from Instagram connect.
(function () {
  const q = new URLSearchParams(location.search);
  if (!q.get('ig')) return;
  const msg = q.get('ig') === 'ok' ? 'Instagram connected. Account added below (live).' : 'Instagram connect failed: ' + (q.get('msg') || '');
  history.replaceState(null, '', '/');
  let n = 0;
  const t = setInterval(() => {
    const app = document.getElementById('app');
    if (app && !app.classList.contains('hidden')) {
      clearInterval(t);
      document.querySelector('button.nav[data-view="accounts"]').click();
      document.getElementById('ig-note').textContent = msg;
    } else if (++n > 50) clearInterval(t);
  }, 100);
})();
