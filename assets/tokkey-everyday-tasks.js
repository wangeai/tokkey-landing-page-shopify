/**
 * "Everyday AI tasks" gallery. Each card's scene is drawn at the 788px Figma width; this keeps
 * --gl-z (the CSS zoom applied to every scene) equal to the current card width / 788.
 * All cards share one width, so the first card is measured.
 */
class TokkeyEverydayTasks extends HTMLElement {
  /** Scene width in the Figma design, in px */
  static DESIGN_WIDTH = 788;

  connectedCallback() {
    this.card = this.querySelector('.gl-card');
    if (!this.card) return;
    this.observer = new ResizeObserver(() => this.fit());
    this.observer.observe(this.card);
    this.fit();
  }

  disconnectedCallback() {
    this.observer?.disconnect();
  }

  fit() {
    const zoom = this.card.clientWidth / TokkeyEverydayTasks.DESIGN_WIDTH;
    if (zoom > 0) this.style.setProperty('--gl-z', String(Math.min(1, zoom)));
  }
}

if (!customElements.get('tokkey-everyday-tasks')) {
  customElements.define('tokkey-everyday-tasks', TokkeyEverydayTasks);
}
