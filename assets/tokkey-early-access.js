/**
 * "Get updates" early-access form. On submit it validates the email natively, POSTs it as JSON
 * ({ user_email }) to the endpoint in the form's data-endpoint, then sends the visitor to the URL in
 * data-redirect. Failures show in the form's status line and re-enable the button.
 * When a link brings the visitor to this element's id (on load or a same-page click), the empty email
 * field shakes once it is on screen. Mirrors EarlyAccessForm in the tokkey-landing-page repo.
 */
class TokkeyEarlyAccess extends HTMLElement {
  /** Class that plays the shake animation (styles: tokkey-early-access-attrs.liquid) */
  static NUDGE_CLASS = 'is-nudged';

  /** How long a nudge waits for the field to scroll into view, in ms */
  static NUDGE_WAIT = 3000;

  connectedCallback() {
    this.abort = new AbortController();
    this.form = this.querySelector('form');
    this.input = this.form?.querySelector('input[name="email"]');
    this.button = this.form?.querySelector('button[type="submit"]');
    this.status = this.form?.querySelector('[data-ref="status"]');
    if (!this.form || !this.input || !this.button) return;

    this.idleLabel = this.button.textContent;
    this.form.addEventListener(
      'submit',
      (event) => {
        event.preventDefault();
        this.submit();
      },
      { signal: this.abort.signal }
    );
    this.bindNudge();
  }

  disconnectedCallback() {
    this.abort?.abort();
    clearTimeout(this.nudgeTimer);
  }

  /** Nudge when the page opens on this element's anchor, or a same-page link points at it */
  bindNudge() {
    if (!this.id) return;
    const signal = this.abort.signal;
    const hash = `#${this.id}`;
    // Typing clears the reminder
    this.input.addEventListener('input', () => this.input.classList.remove(TokkeyEarlyAccess.NUDGE_CLASS), { signal });
    if (location.hash === hash) this.nudge();
    document.addEventListener(
      'click',
      (event) => {
        const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
        if (link && link.pathname === location.pathname && link.hash === hash) this.nudge();
      },
      { signal }
    );
  }

  /** Shake the empty email field once it is fully on screen (the anchor scroll may still be under way) */
  nudge() {
    if (this.input.value) return;
    clearTimeout(this.nudgeTimer);
    const deadline = Date.now() + TokkeyEarlyAccess.NUDGE_WAIT;
    const check = () => {
      const rect = this.input.getBoundingClientRect();
      if (rect.top >= 0 && rect.bottom <= window.innerHeight) {
        this.input.classList.remove(TokkeyEarlyAccess.NUDGE_CLASS);
        void this.input.offsetWidth; // reflow so the animation plays again
        this.input.classList.add(TokkeyEarlyAccess.NUDGE_CLASS);
      } else if (Date.now() < deadline) {
        this.nudgeTimer = setTimeout(check, 100);
      }
    };
    this.nudgeTimer = setTimeout(check, 100);
  }

  /** Validate, send, then redirect (or show an error) */
  async submit() {
    if (!this.form.reportValidity()) return;
    this.setBusy(true);
    this.showStatus('');
    try {
      const response = await fetch(this.form.dataset.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_email: this.input.value.trim() }),
      });
      if (!response.ok) throw new Error(`Early access request failed: ${response.status}`);
      window.location.href = this.form.dataset.redirect;
    } catch (error) {
      console.error(error);
      this.showStatus(this.form.dataset.errorMessage || 'Something went wrong. Please try again.');
      this.setBusy(false);
    }
  }

  /** Lock the button while the request is in flight (and while the next page loads) */
  setBusy(busy) {
    this.button.disabled = busy;
    this.button.textContent = busy ? this.form.dataset.busyLabel || this.idleLabel : this.idleLabel;
  }

  showStatus(message) {
    if (this.status) this.status.textContent = message;
  }
}

if (!customElements.get('tokkey-early-access')) {
  customElements.define('tokkey-early-access', TokkeyEarlyAccess);
}
