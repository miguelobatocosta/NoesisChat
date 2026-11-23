// Runs before the app loads so the right theme paints first. Keep in sync with src/theme.ts.
(function () {
  var pref = 'system';
  try {
    pref = window.localStorage.getItem('pausa.theme') || 'system';
  } catch {
    /* storage unavailable: follow the OS */
  }
  var dark =
    pref === 'dark' ||
    (pref !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
})();
