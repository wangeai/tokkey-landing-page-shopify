/**
 * "Get updates" early-access form. On submit it validates the email natively, POSTs it as JSON
 * ({ user_email }) to the endpoint in the form's data-endpoint, then sends the visitor to the URL in
 * data-redirect. Failures show in the form's status line and re-enable the button.
 * Mirrors EarlyAccessForm in the tokkey-landing-page repo.
 */
class TokkeyEarlyAccess extends HTMLElement {
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
  }

  disconnectedCallback() {
    this.abort?.abort();
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
