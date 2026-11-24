/**
 * "Everyday AI tasks" gallery. Each card's scene is drawn at the 788px Figma width; this keeps
 * --gl-z (the CSS zoom applied to every scene) equal to the current card width / 788.
 * All cards share one width, so the first card is measured.
 * It also wires the corner arrow of the game card to show the game full screen.
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

    this.controller = new AbortController();
    const { signal } = this.controller;
    this.querySelector('[data-gl-fullscreen]')?.addEventListener('click', () => this.openGame(), { signal });
    this.querySelector('[data-gl-close]')?.addEventListener('click', () => this.closeGame(), { signal });
    document.addEventListener('keydown', (event) => this.onKeydown(event), { signal });
    document.addEventListener('fullscreenchange', () => this.onFullscreenChange(), { signal });
    document.addEventListener('webkitfullscreenchange', () => this.onFullscreenChange(), { signal });
  }

  disconnectedCallback() {
    this.observer?.disconnect();
    this.controller?.abort();
  }

  /**
   * Shows the game full screen: the wrapper becomes a fixed viewport overlay (works on every phone),
   * and the native Fullscreen API is requested on top where supported to hide the browser UI.
   */
  async openGame() {
    const wrap = this.querySelector('.gl-game-wrap');
    if (!wrap || wrap.classList.contains('is-full')) return;

    wrap.classList.add('is-full');
    this.querySelector('.gl-game')?.contentWindow?.focus();

    const request = wrap.requestFullscreen || wrap.webkitRequestFullscreen;
    try {
      await request?.call(wrap);
    } catch {
      // Native full screen refused: the fixed overlay already fills the viewport
    }
  }

  /** Leaves full screen and returns focus to the button that opened it */
  closeGame() {
    const wrap = this.querySelector('.gl-game-wrap');
    if (!wrap?.classList.contains('is-full')) return;

    wrap.classList.remove('is-full');
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
    }
    this.querySelector('[data-gl-fullscreen]')?.focus();
  }

  /** Escape closes the game; the game frame forwards its own Escape presses to this document */
  onKeydown(event) {
    if (event.key === 'Escape') this.closeGame();
  }

  /** Native full screen exited by the browser (Esc, back gesture): drop the overlay too */
  onFullscreenChange() {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) this.closeGame();
  }

  fit() {
    const zoom = this.card.clientWidth / TokkeyEverydayTasks.DESIGN_WIDTH;
    if (zoom > 0) this.style.setProperty('--gl-z', String(Math.min(1, zoom)));
  }
}

if (!customElements.get('tokkey-everyday-tasks')) {
  customElements.define('tokkey-everyday-tasks', TokkeyEverydayTasks);
}
