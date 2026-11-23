/**
 * Software page behaviour, ported from the tokkey-landing-page repo (AmbientField / AsciiField,
 * FeatureStoryScene, FeaturePreview) without GSAP or Lenis:
 * - <tokkey-software-hero>: pale ambient character field over the dark hero.
 * - <tokkey-software-features>: dark ambient field on paper, the pinned scroll story from 1200px (active
 *   preview, copy fade, chapter bar) or the stacked fade-up below it, and the preview micro-interactions.
 */

/**
 * Quiet ambient character field on a <canvas> (prototype `heroAmb` / `fxAmb`): a low-contrast glyph grid that
 * drifts slowly, with soft rings passing through it every few seconds and where the pointer moves or clicks.
 * Draws only while its host is on screen; one still frame and no rings under reduced motion.
 */
class TokkeyAmbientField {
  /** Characters from dim to bright; index 0 (space) is never drawn */
  static RAMP = ' .·:-=+*';
  /** Rings kept alive at once, and how long one lasts (s) */
  static MAX_RINGS = 3;
  static RING_LIFE = 6;
  /** Pointer moves only add a ring after this pause (ms) and distance (px) */
  static MOVE_GAP_MS = 420;
  static MOVE_GAP_PX = 90;
  /** Interval (ms) between rings that surface on their own */
  static IDLE_RING_MS = 4200;

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ color: string, maxAlpha: number, baseAlpha: number, stepAlpha: number }} options
   *   Glyph alpha = min(maxAlpha, baseAlpha + level * stepAlpha)
   */
  constructor(canvas, options) {
    this.canvas = canvas;
    this.options = options;
    this.ctx = canvas.getContext('2d');
    this.rings = [];
    this.still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.visible = false;
    this.tick = 0;
    this.frame = 0;
    this.lastMove = { time: 0, x: -999, y: -999 };
    this.lastClick = 0;
    this.abort = new AbortController();

    // Host = the section the canvas decorates: it receives the pointer and decides visibility
    const host = canvas.parentElement ?? canvas;
    this.observer = new IntersectionObserver(([entry]) => this.setVisible(entry.isIntersecting));
    this.observer.observe(host);
    if (this.still) return;

    const signal = this.abort.signal;
    host.addEventListener('pointerdown', (event) => this.onClick(event), { passive: true, signal });
    host.addEventListener('pointermove', (event) => this.onMove(event), { passive: true, signal });
    this.timeout = setTimeout(() => this.addRing(canvas.clientWidth * 0.62, canvas.clientHeight * 0.5), 1500);
    this.interval = setInterval(() => {
      if (this.visible && !document.hidden) {
        this.addRing(canvas.clientWidth * (0.15 + 0.7 * Math.random()), canvas.clientHeight * (0.2 + 0.6 * Math.random()));
      }
    }, TokkeyAmbientField.IDLE_RING_MS);
  }

  /** Stop drawing and release every listener, timer and observer */
  destroy() {
    this.abort.abort();
    this.observer.disconnect();
    clearTimeout(this.timeout);
    clearInterval(this.interval);
    cancelAnimationFrame(this.frame);
  }

  /** Run the render loop only while on screen; clear the canvas when it leaves */
  setVisible(visible) {
    this.visible = visible;
    cancelAnimationFrame(this.frame);
    if (!visible) {
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      return;
    }
    if (this.still) {
      this.draw();
      return;
    }
    const loop = () => {
      // Half frame rate is plenty for this effect and halves the cost
      if (this.tick++ & 1) this.draw();
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  /** Paint one frame of the glyph grid */
  draw() {
    const { width, height } = this.resize();
    const { color, baseAlpha, stepAlpha, maxAlpha } = this.options;
    // Smaller cells on narrow canvases
    const small = width < 700;
    const cellW = small ? 9 : 11;
    const cellH = small ? 14 : 17;
    const time = performance.now() / 1000;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, width, height);
    ctx.font = `${small ? 10 : 12}px "Commit Mono", ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;

    for (let y = cellH / 2; y < height; y += cellH) {
      for (let x = cellW / 2; x < width; x += cellW) {
        const value = this.base(x, y, this.still ? 0 : time) * 0.32 + this.ring(x, y, time) * 0.9;
        const level = Math.min(7, Math.floor(value * 8));
        if (level < 1) continue;
        ctx.globalAlpha = Math.min(maxAlpha, baseAlpha + level * stepAlpha);
        ctx.fillText(TokkeyAmbientField.RAMP[level], x, y);
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Match the backing store to CSS size (DPR capped at 2); returns CSS-pixel size */
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (this.canvas.width !== Math.round(width * dpr) || this.canvas.height !== Math.round(height * dpr)) {
      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(height * dpr);
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width, height };
  }

  /** Slow interference pattern that keeps the field gently moving */
  base(x, y, t) {
    const a = Math.sin(x * 0.0062 + 1.3 + t * 0.11) * Math.sin(y * 0.0081 + 0.4 - t * 0.07);
    const b = Math.sin(x * 0.0027 - y * 0.0041 + 2.1 + t * 0.09);
    const v = Math.max(0, 0.55 * a + 0.45 * b);
    return v * v;
  }

  /** Sum of the expanding, fading rings at a point */
  ring(x, y, t) {
    let sum = 0;
    for (const ring of this.rings) {
      const age = t - ring.time;
      if (age < 0 || age > TokkeyAmbientField.RING_LIFE) continue;
      const d = Math.hypot(x - ring.x, (y - ring.y) * 1.15);
      const g = (d - age * 70) / 48;
      sum += Math.exp(-g * g) * Math.exp(-age / 2.4) * (0.55 + 0.45 * Math.cos(d * 0.045));
    }
    return Math.min(1, sum);
  }

  addRing(x, y) {
    this.rings.push({ x, y, time: performance.now() / 1000 });
    if (this.rings.length > TokkeyAmbientField.MAX_RINGS) this.rings.shift();
  }

  /** Pointer position in canvas CSS px */
  point(event) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  onClick(event) {
    const now = performance.now();
    if (now - this.lastClick < 700) return;
    this.lastClick = now;
    const { x, y } = this.point(event);
    this.addRing(x, y);
  }

  onMove(event) {
    const now = performance.now();
    const { x, y } = this.point(event);
    const last = this.lastMove;
    if (now - last.time < TokkeyAmbientField.MOVE_GAP_MS || Math.hypot(x - last.x, y - last.y) < TokkeyAmbientField.MOVE_GAP_PX) return;
    this.lastMove = { time: now, x, y };
    this.addRing(x, y);
  }
}

/** Software hero: pale blue glyphs on the dark backdrop (prototype `heroAmb`) */
class TokkeySoftwareHero extends HTMLElement {
  connectedCallback() {
    const canvas = this.querySelector('[data-ref="ambient"]');
    if (!canvas) return;
    this.field = new TokkeyAmbientField(canvas, { color: '#dbe9ff', maxAlpha: 0.34, baseAlpha: 0.12, stepAlpha: 0.08 });
  }

  disconnectedCallback() {
    this.field?.destroy();
  }
}

/**
 * Software features story. From 1200px the five previews live in the pinned right column and the one whose
 * chapter is nearest the viewport centre is shown (CSS cross-fade on `.is-active`); each chapter's copy dims
 * as it leaves the centre, and the chapter bar tracks the active chapter. Below 1200px every preview moves
 * back under its own chapter's copy and both fade up as the chapter enters. Also drives the Agent Hub tabs
 * and the "Your workflow" model menu inside the previews.
 */
class TokkeySoftwareFeatures extends HTMLElement {
  /** Width from which the pinned story exists (the Figma layout) */
  static DESKTOP = '(min-width: 1200px)';
  /** Copy stays fully visible within this share of the viewport height around the centre, then fades */
  static COPY_HOLD = 0.16;
  static COPY_FADE = 2.1;
  static COPY_MIN = 0.08;

  connectedCallback() {
    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.section = this.querySelector('.tk-swf');
    this.chapters = this.refs('chapter');
    this.copies = this.refs('copy');
    this.slots = this.refs('slot');
    this.stages = this.refs('stage');
    this.host = this.ref('host');
    this.bar = this.ref('bar');
    this.barLinks = this.refs('bar-link');
    this.count = this.ref('count');
    if (!this.section || !this.host || !this.bar || this.stages.length !== this.chapters.length) return;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Dark glyphs on paper, capped at 20% (prototype `fxAmb`)
    const canvas = this.ref('ambient');
    if (canvas) this.field = new TokkeyAmbientField(canvas, { color: '#282c29', maxAlpha: 0.2, baseAlpha: 0.06, stepAlpha: 0.045 });

    // Chapter bar links scroll their chapter to the viewport centre (tokkey.css makes it smooth)
    this.barLinks.forEach((link, i) =>
      link.addEventListener(
        'click',
        (event) => {
          event.preventDefault();
          const rect = this.chapters[i].getBoundingClientRect();
          window.scrollTo({ top: scrollY + rect.top - (innerHeight - rect.height) / 2 });
        },
        { signal }
      )
    );

    this.setupAgentTabs(signal);
    this.setupModelMenu(signal);

    this.desktop = matchMedia(TokkeySoftwareFeatures.DESKTOP);
    this.desktop.addEventListener('change', () => this.applyLayout(), { signal });
    this.applyLayout();
  }

  disconnectedCallback() {
    this.abort?.abort();
    this.teardown?.();
    this.field?.destroy();
  }

  ref(name) {
    return this.querySelector(`[data-ref="${name}"]`);
  }

  refs(name) {
    return [...this.querySelectorAll(`[data-ref="${name}"]`)];
  }

  /** Switch between the pinned and stacked layouts, undoing the previous one first */
  applyLayout() {
    this.teardown?.();
    this.teardown = this.desktop.matches ? this.setupDesktop() : this.setupStacked();
  }

  /** Pinned layout: previews in the right column; scroll drives the active chapter, copy fade and bar */
  setupDesktop() {
    this.stages.forEach((stage) => this.host.append(stage));
    this.active = -1;
    const layout = new AbortController();
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => this.update());
    };
    window.addEventListener('scroll', schedule, { passive: true, signal: layout.signal });
    window.addEventListener('resize', schedule, { signal: layout.signal });
    this.update();

    return () => {
      layout.abort();
      cancelAnimationFrame(frame);
      this.copies.forEach((copy) => copy.style.removeProperty('--copy-opacity'));
      this.stages.forEach((stage) => {
        stage.classList.remove('is-active');
        stage.inert = false;
        stage.removeAttribute('aria-hidden');
      });
    };
  }

  /** Stacked layout: each preview under its chapter's copy; copy and preview fade up as the chapter enters */
  setupStacked() {
    this.stages.forEach((stage, i) => this.slots[i].append(stage));
    if (this.reducedMotion) return null;

    const pieces = this.chapters.map((_, i) => [this.copies[i], this.stages[i]]);
    pieces.flat().forEach((piece) => piece.classList.add('is-reveal'));
    // Reveal once the chapter's top passes 80% of the viewport; the preview follows 0.1s after the copy
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          pieces[this.chapters.indexOf(entry.target)].forEach((piece, step) => {
            piece.style.transitionDelay = `${step * 0.1}s`;
            piece.classList.add('is-revealed');
          });
        }
      },
      { rootMargin: '0px 0px -20% 0px' }
    );
    this.chapters.forEach((chapter) => observer.observe(chapter));

    return () => {
      observer.disconnect();
      pieces.flat().forEach((piece) => {
        piece.classList.remove('is-reveal', 'is-revealed');
        piece.style.removeProperty('transition-delay');
      });
    };
  }

  /** Recompute the chapter nearest the viewport centre, each copy's opacity, and whether the bar shows */
  update() {
    const centre = innerHeight / 2;
    let nearest = 0;
    let best = Infinity;
    this.chapters.forEach((chapter, i) => {
      const rect = chapter.getBoundingClientRect();
      const distance = Math.abs(rect.top + rect.height / 2 - centre);
      if (distance < best) {
        best = distance;
        nearest = i;
      }
      const opacity = this.reducedMotion ? 1 : this.copyOpacity(this.copies[i], centre);
      this.copies[i].style.setProperty('--copy-opacity', opacity.toFixed(3));
    });
    this.setActive(nearest);

    const story = this.section.getBoundingClientRect();
    this.bar.classList.toggle('is-shown', story.top < innerHeight * 0.45 && story.bottom > innerHeight * 0.9);
  }

  /** 1 near the viewport centre, fading to COPY_MIN as the copy moves away */
  copyOpacity(copy, centre) {
    const { COPY_HOLD, COPY_FADE, COPY_MIN } = TokkeySoftwareFeatures;
    const rect = copy.getBoundingClientRect();
    const offset = Math.abs(rect.top + rect.height / 2 - centre) / innerHeight;
    return Math.max(COPY_MIN, 1 - Math.max(0, offset - COPY_HOLD) * COPY_FADE);
  }

  /** Show chapter `index`'s preview, hide the rest from assistive tech, and move the bar's marker */
  setActive(index) {
    if (index === this.active) return;
    this.active = index;
    this.stages.forEach((stage, i) => {
      const on = i === index;
      stage.classList.toggle('is-active', on);
      stage.inert = !on;
      if (on) stage.removeAttribute('aria-hidden');
      else stage.setAttribute('aria-hidden', 'true');
    });
    this.barLinks.forEach((link, i) => {
      link.classList.toggle('is-on', i === index);
      if (i === index) link.setAttribute('aria-current', 'step');
      else link.removeAttribute('aria-current');
    });
    if (this.count) this.count.textContent = String(index + 1).padStart(2, '0');
    this.bar.classList.toggle('is-end', index === this.stages.length - 1);
  }

  /** Agent Hub: click or arrow keys pick an agent; the selection row and button follow it */
  setupAgentTabs(signal) {
    const tabs = this.refs('agent');
    const name = this.ref('agent-name');
    const open = this.ref('agent-open');
    if (!tabs.length || !name || !open) return;

    const select = (tab) => {
      tabs.forEach((other) => {
        const on = other === tab;
        other.classList.toggle('is-on', on);
        other.setAttribute('aria-selected', String(on));
        other.tabIndex = on ? 0 : -1;
      });
      name.textContent = tab.dataset.agent;
      open.textContent = `Open ${tab.dataset.agent} ↗`;
    };

    // Roving focus: ← → move between tabs, Home/End jump to the ends
    const keys = {
      ArrowRight: (i) => (i + 1) % tabs.length,
      ArrowLeft: (i) => (i + tabs.length - 1) % tabs.length,
      Home: () => 0,
      End: () => tabs.length - 1,
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(tab), { signal });
      tab.addEventListener(
        'keydown',
        (event) => {
          const next = keys[event.key]?.(i);
          if (next === undefined) return;
          event.preventDefault();
          select(tabs[next]);
          tabs[next].focus();
        },
        { signal }
      );
    });
  }

  /** Your workflow: the selector toggles the menu; an option becomes the current model and rewrites the API note */
  setupModelMenu(signal) {
    const toggle = this.ref('model-toggle');
    const menu = this.ref('model-menu');
    const options = this.refs('model');
    if (!toggle || !menu) return;

    toggle.addEventListener(
      'click',
      () => {
        menu.hidden = !menu.hidden;
        toggle.setAttribute('aria-expanded', String(!menu.hidden));
      },
      { signal }
    );

    const fields = { 'model-current': 'name', 'api-name': 'api', 'api-text': 'apiText', 'api-note': 'apiNote' };
    options.forEach((option) =>
      option.addEventListener(
        'click',
        () => {
          options.forEach((other) => {
            const on = other === option;
            other.classList.toggle('is-on', on);
            other.setAttribute('aria-pressed', String(on));
          });
          for (const [ref, key] of Object.entries(fields)) {
            const target = this.ref(ref);
            if (target) target.textContent = option.dataset[key];
          }
        },
        { signal }
      )
    );
  }
}

if (!customElements.get('tokkey-software-hero')) customElements.define('tokkey-software-hero', TokkeySoftwareHero);
if (!customElements.get('tokkey-software-features')) customElements.define('tokkey-software-features', TokkeySoftwareFeatures);
