// Runs first, on /join#<code> only (DECISIONS D-50). The email gate in front of Pausa sends people to its
// login page and back, and that round trip drops the #part, so the invite would be lost. This page is the
// one thing the gate lets through: it keeps the code in this tab (sessionStorage, never sent anywhere) and
// moves on to "/", where the gate asks for the email and the app picks the code up. Keep the storage key in
// sync with src/features/onboarding/invite.ts.
(function () {
  if (window.location.pathname !== '/join') return;
  var code = window.location.hash.slice(1);
  if (!code) return;
  try {
    window.sessionStorage.setItem('pausa.invite', code);
  } catch {
    return; // storage unavailable: the join page reads the code from the address instead
  }
  window.location.replace('/');
})();
