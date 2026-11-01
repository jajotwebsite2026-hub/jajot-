// Entry point: restore saved data first (if DATABASE_URL set), then start the app.
const persist = require('./persist');
(async () => {
  await persist.restore();
  require('./server');
  persist.startSync();
})();
