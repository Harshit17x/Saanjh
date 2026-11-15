// Applies the saved light/dark choice before first paint, so the page never flashes the wrong theme.
try {
  var theme = window.localStorage.getItem('saanjh.theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch (e) {
  // Storage unavailable: follow the system setting.
}
