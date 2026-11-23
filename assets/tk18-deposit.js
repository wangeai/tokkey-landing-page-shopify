/**
 * Behavior for the deposit page (product.deposit.liquid): sets the page title,
 * runs the "thank you" dialog (#tyd), and fills in the Kickstarter / Facebook links.
 * Expects window.TK_STEP from tk18-deposit-body.js.
 */
(function () {
  // Leave empty to keep the links' default href
  const KS_URL = '';
  const FB_URL = '';

  const thanks = window.TK_STEP === 'thanks';
  document.title = thanks
    ? 'Tokkey - You Just Unlocked VIP Pricing & Priority shipping!'
    : 'Tokkey - Pay $5 Deposit, Lock the VIP Exclusive $129';

  const dialog = document.getElementById('tyd');
  if (dialog) {
    const root = document.documentElement;
    const lastFocused = document.activeElement;

    function closeDialog() {
      dialog.hidden = true;
      root.classList.remove('tyd-open');
      document.removeEventListener('keydown', onKeyDown);

      // Drop ?step=done so a reload doesn't reopen the dialog
      try {
        const url = new URL(location.href);
        url.searchParams.delete('step');
        history.replaceState(null, '', url.pathname + url.search + url.hash);
      } catch (e) {}

      if (lastFocused && lastFocused.focus) lastFocused.focus();
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        closeDialog();
        return;
      }
      if (event.key !== 'Tab') return;

      // Keep keyboard focus inside the dialog
      const focusable = dialog.querySelectorAll('button, a[href]');
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    root.classList.add('tyd-open');
    const closeButton = dialog.querySelector('.tyd-x');
    if (closeButton) closeButton.focus();
    document.addEventListener('keydown', onKeyDown);
    dialog.addEventListener('click', function (event) {
      if (event.target.closest('[data-tyd-close]')) closeDialog();
    });
  }

  const links = [
    ['[data-ks-link]', KS_URL],
    ['[data-fb-link]', FB_URL],
  ];
  for (const [selector, url] of links) {
    if (!url) continue;
    for (const link of document.querySelectorAll(selector)) {
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener';
    }
  }
})();
