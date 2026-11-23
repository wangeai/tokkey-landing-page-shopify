/**
 * About page behaviour (Tokkey Editions, Winter '26), ported from the tokkey-landing-page repo (src/scripts/about/)
 * without GSAP or Lenis: <tokkey-about> builds every scene of the story and drives them from one animation frame
 * loop. Markup: sections/tokkey-about.liquid + snippets/tokkey-about-*. Styles: snippets/tokkey-about-styles.liquid.
 */

/** Small numeric helpers used across the About scenes */
class TokkeyAboutMath {
  static reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** @param {number} v */
  static clamp01(v) {
    return Math.min(1, Math.max(0, v));
  }

  /**
   * Seeded Park–Miller generator, so torn edges and smoke puffs look the same on every load
   * @param {number} seed
   * @returns {() => number}
   */
  static seeded(seed) {
    let s = seed;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
  }

  /**
   * True when the element's box overlaps the viewport (with a margin in px)
   * @param {Element} el
   * @param {number} [margin]
   */
  static onScreen(el, margin = 0) {
    const r = el.getBoundingClientRect();
    return r.bottom > -margin && r.top < innerHeight + margin;
  }

  /**
   * Promise that resolves after `ms`, or right away once `signal` aborts
   * @param {number} ms
   * @param {AbortSignal} signal
   */
  static wait(ms, signal) {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      signal.addEventListener('abort', () => (clearTimeout(timer), resolve()), { once: true });
    });
  }
}

/**
 * Pointer state over one element, shared by every About scene: target position as 0..1 of the element, an eased
 * copy that chases it, a decaying speed (px of travel) and whether the pointer is inside.
 */
class TokkeyPointerTracker {
  /**
   * @param {HTMLElement} el
   * @param {AbortSignal} signal
   * @param {boolean} [recenter] - Return the target to the middle when the pointer leaves
   */
  constructor(el, signal, recenter = true) {
    /** Target position, 0..1 of the element box */
    this.tx = 0.5;
    this.ty = 0.5;
    /** Eased position, follows the target in ease() */
    this.x = 0.5;
    this.y = 0.5;
    /** Last client position (px), -1 before the first move */
    this.clientX = -1;
    this.clientY = -1;
    /** Accumulated pointer travel, decays in ease() */
    this.speed = 0;
    this.inside = false;

    el.addEventListener(
      'pointermove',
      (e) => {
        const r = el.getBoundingClientRect();
        this.tx = (e.clientX - r.left) / r.width;
        this.ty = (e.clientY - r.top) / r.height;
        if (this.clientX >= 0) this.speed += Math.hypot(e.clientX - this.clientX, e.clientY - this.clientY);
        this.clientX = e.clientX;
        this.clientY = e.clientY;
        this.inside = true;
      },
      { signal }
    );
    el.addEventListener(
      'pointerleave',
      () => {
        this.inside = false;
        if (!recenter) return;
        this.tx = 0.5;
        this.ty = 0.5;
      },
      { signal }
    );
  }

  /**
   * Step the eased position toward the target and decay the speed; call once per frame
   * @param {number} factor
   */
  ease(factor) {
    this.x += (this.tx - this.x) * factor;
    this.y += (this.ty - this.y) * factor;
    this.speed *= 0.9;
  }

  /** Eased position mapped to -1..1 around the centre, for tilts */
  get cx() {
    return this.x * 2 - 1;
  }

  get cy() {
    return this.y * 2 - 1;
  }
}

/**
 * Chapter 1 hero: Prometheus reaching for the cube. A 3D-tilting stage (painting + figure) under two canvases:
 * drifting smoke puffs that part around the pointer, and a fire stream that flows along two curves into the cube and
 * bends toward the pointer. A focus box tracks the cube. `light` (0..1) is raised by TokkeyAboutIntro as the
 * darkness opens.
 */
class TokkeyPrometheusHero {
  /** Source painting size; the stage covers the hero at this aspect, slightly overscanned for the tilt */
  static IMG_W = 1672;
  static IMG_H = 941;
  static OVERSCAN = 1.04;
  /** Fire stream: two cubic curves (image fractions) from the sky into the cube, then out to the ground */
  static PATHS = [
    [
      [0.852, 0.272],
      [0.8, 0.395],
      [0.718, 0.4],
      [0.676, 0.536],
    ],
    [
      [0.676, 0.54],
      [0.705, 0.615],
      [0.765, 0.64],
      [0.825, 0.7],
    ],
  ];
  /** Glowing nodes: source, cube (index 1, kept clear so the cube stays visible), sink */
  static NODES = [
    { p: [0.852, 0.272], r: 0.08, c: [255, 196, 120] },
    { p: [0.676, 0.536], r: 0.045, c: [255, 240, 205] },
    { p: [0.825, 0.7], r: 0.075, c: [255, 186, 96] },
  ];
  static CLEAR_R = 0.042;
  /** Smoke spawn zones [x, y, w, h], away from the figure */
  static ZONES = [
    [0.55, 0.0, 0.45, 0.3],
    [0.86, 0.22, 0.14, 0.55],
    [0.0, 0.62, 0.55, 0.38],
    [0.35, 0.0, 0.3, 0.22],
    [0.7, 0.75, 0.3, 0.25],
  ];

  /**
   * @param {HTMLElement} hero
   * @param {AbortSignal} signal
   */
  constructor(hero, signal) {
    const q = (sel) => hero.querySelector(sel);
    this.hero = hero;
    /** Intro progress: 0 = dark, 1 = fully lit */
    this.light = 0;
    /** Mobile shifts the painting left so the cube stays in frame (set by TokkeyAbout's media query) */
    this.mobile = false;
    this.stage = q('[data-ref=stage]');
    this.fig = q('#fig');
    this.fireC = q('#fire');
    this.fogC = q('#fog');
    this.fx = this.fireC.getContext('2d');
    this.gx = this.fogC.getContext('2d');
    this.hot = q('[data-ref=hot]');
    this.hotBox = this.hot.querySelector('.box');
    this.anchor = q('#anchor');
    this.pointer = new TokkeyPointerTracker(hero, signal);
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.parts = [];
    this.sparks = [];
    this.clouds = [];
    this.W = 0;
    this.shift = 0;

    for (let i = 0; i < 260; i++) this.spawn(Math.random());
    this.seedClouds();

    addEventListener('resize', () => this.layout(), { signal });
    const bg = q('#bg');
    if (!bg.complete) bg.addEventListener('load', () => this.layout(), { signal });
    this.layout();
  }

  /** Burst of sparks at the cube (intro ignition) */
  ignite() {
    const [x, y] = TokkeyPrometheusHero.NODES[1].p;
    for (let i = 0; i < 40; i++) this.sparks.push(this.mkSpark(x, y, 1.4));
  }

  /** Size the stage and canvases to cover the hero */
  layout() {
    const vw = this.hero.clientWidth;
    const vh = this.hero.clientHeight;
    const { IMG_W, IMG_H, OVERSCAN } = TokkeyPrometheusHero;
    const s = Math.max(vw / IMG_W, vh / IMG_H) * OVERSCAN;
    const W = IMG_W * s;
    const H = IMG_H * s;
    this.W = W;
    this.stage.style.width = `${W}px`;
    this.stage.style.height = `${H}px`;
    this.shift = this.mobile ? (W - vw) * 0.28 : 0;
    this.fireC.width = W * this.dpr;
    this.fireC.height = H * this.dpr;
    this.fogC.width = W * 0.5;
    this.fogC.height = H * 0.5;
  }

  /**
   * One frame: tilt the stage, sway the figure, track the cube, and draw smoke + fire while on screen
   * @param {number} time
   */
  render(time) {
    const m = this.pointer;
    m.ease(0.06);
    this.stage.style.left = '50%';
    this.stage.style.top = '50%';
    this.stage.style.transform =
      `translate(calc(-50% - ${this.shift}px), -50%) ` +
      `rotateY(${m.cx * 4.5}deg) rotateX(${-m.cy * 3}deg) ` +
      `translate3d(${-m.cx * 14}px, ${-m.cy * 8}px, 0)`;
    const sw = Math.sin(time * 0.0006);
    const sw2 = Math.sin(time * 0.00037 + 1.3);
    this.fig.style.transform = `translate3d(${sw2 * 2.5 - m.cx * 6}px, ${Math.sin(time * 0.0009) * 1.5}px, 0) rotate(${sw * 0.35 + m.cx * 0.25}deg)`;
    this.fogC.style.transform = `translate3d(${m.cx * 18}px, ${m.cy * 8}px, 0) scale(1.04)`;

    // Focus box follows the cube's anchor through the tilt
    const ar = this.anchor.getBoundingClientRect();
    const hr = this.hero.getBoundingClientRect();
    const bs = Math.max(34, this.W * 0.036);
    this.hot.style.transform = `translate3d(${ar.left - hr.left}px, ${ar.top - hr.top}px, 0)`;
    this.hotBox.style.width = this.hotBox.style.height = `${bs}px`;
    this.hot.style.setProperty('--gap', `${bs * 0.5 + 8}px`);

    if (-hr.top < innerHeight) {
      this.renderFog(time);
      this.renderFire(time);
    }
  }

  /** Pointer position as a fraction of the stage (the painting), for pulling fire and smoke */
  pointerOnStage() {
    const r = this.stage.getBoundingClientRect();
    return [(this.pointer.clientX - r.left) / r.width, (this.pointer.clientY - r.top) / r.height];
  }

  static bez(P, t) {
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;
    return [
      a * P[0][0] + b * P[1][0] + c * P[2][0] + d * P[3][0],
      a * P[0][1] + b * P[1][1] + c * P[2][1] + d * P[3][1],
    ];
  }

  /** Point along the whole stream, t in 0..1 across both curves */
  static pathAt(t) {
    const P = TokkeyPrometheusHero.PATHS;
    return t < 0.5 ? TokkeyPrometheusHero.bez(P[0], t * 2) : TokkeyPrometheusHero.bez(P[1], (t - 0.5) * 2);
  }

  spawn(t0) {
    this.parts.push({
      t: t0 ?? Math.random() * 0.04,
      v: 0.0016 + Math.random() * 0.0022,
      off: (Math.random() - 0.5) * 2,
      wob: Math.random() * 6.28,
      size: 0.6 + Math.random() * 1.8,
      hue: Math.random(),
    });
  }

  mkSpark(x, y, power) {
    const a = Math.random() * 6.283;
    const sp = (0.0006 + Math.random() * 0.0024) * power;
    return {
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 0.0008 * power,
      life: 1,
      decay: 0.008 + Math.random() * 0.02,
      r: 0.8 + Math.random() * 1.8,
    };
  }

  static drawGlow(ctx, x, y, r, c, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,255,240,${a})`);
    g.addColorStop(0.18, `rgba(${c[0]},${c[1]},${c[2]},${a * 0.7})`);
    g.addColorStop(1, `rgba(${c[0]},${(c[1] * 0.5) | 0},0,0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 6.283);
    ctx.fill();
  }

  renderFire(time) {
    const { fx, pointer: m } = this;
    const w = this.fireC.width;
    const h = this.fireC.height;
    const k = w;
    fx.clearRect(0, 0, w, h);
    fx.globalCompositeOperation = 'lighter';
    const [mx, my] = this.pointerOnStage();
    const heat = (0.55 + 0.45 * Math.min(1, m.speed * 0.04) + (m.inside ? 0.15 : 0)) * (0.25 + 0.75 * this.light);
    const flowBoost = 1 + m.cx * 0.6 + Math.min(1.5, m.speed * 0.02);

    // Layered strokes along the curves, bent toward the pointer
    const pull = (q) => {
      if (!m.inside) return q;
      const dx = mx - q[0];
      const dy = my - q[1];
      const f = Math.max(0, 0.18 - Math.hypot(dx, dy)) * 0.35;
      return [q[0] + dx * f, q[1] + dy * f];
    };
    for (const [lw, a] of [
      [0.03, 0.05],
      [0.014, 0.1],
      [0.005, 0.32],
      [0.0018, 0.8],
    ]) {
      fx.lineWidth = lw * k * (0.85 + 0.15 * Math.sin(time * 0.004)) * heat;
      fx.strokeStyle = `rgba(255,${lw < 0.003 ? 236 : 160},${lw < 0.003 ? 190 : 70},${a})`;
      fx.lineCap = 'round';
      for (const P of TokkeyPrometheusHero.PATHS) {
        const c1 = pull(P[1]);
        const c2 = pull(P[2]);
        fx.beginPath();
        fx.moveTo(P[0][0] * w, P[0][1] * h);
        fx.bezierCurveTo(c1[0] * w, c1[1] * h, c2[0] * w, c2[1] * h, P[3][0] * w, P[3][1] * h);
        fx.stroke();
      }
    }
    TokkeyPrometheusHero.NODES.forEach((n, i) => {
      if (i === 1) return;
      const pulse = 0.75 + 0.25 * Math.sin(time * 0.003 + i * 2.1);
      const near = m.inside ? Math.max(0, 1 - Math.hypot(mx - n.p[0], my - n.p[1]) / 0.25) : 0;
      TokkeyPrometheusHero.drawGlow(fx, n.p[0] * w, n.p[1] * h, n.r * k * (pulse + near * 0.6) * heat, n.c, 0.5 + near * 0.4);
    });

    // Particles flowing along the stream
    for (let i = 0; i < Math.round(3 * flowBoost); i++) if (this.parts.length < 900) this.spawn();
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.t += p.v * flowBoost;
      p.wob += 0.08;
      if (p.t >= 1) {
        if (Math.random() < 0.35) this.sparks.push(this.mkSpark(...TokkeyPrometheusHero.pathAt(1), 1));
        this.parts.splice(i, 1);
        continue;
      }
      let [x, y] = TokkeyPrometheusHero.pathAt(p.t);
      const [x2, y2] = TokkeyPrometheusHero.pathAt(Math.min(1, p.t + 0.01));
      let nx = -(y2 - y);
      let ny = x2 - x;
      const nl = Math.hypot(nx, ny) || 1;
      nx /= nl;
      ny /= nl;
      const spread = 0.006 + 0.01 * Math.sin(p.t * Math.PI);
      x += nx * (p.off * spread + Math.sin(p.wob) * 0.003);
      y += ny * (p.off * spread + Math.sin(p.wob) * 0.003);
      if (m.inside) {
        const dx = mx - x;
        const dy = my - y;
        const d = Math.hypot(dx, dy);
        if (d < 0.16) {
          const f = (0.16 - d) * 0.5;
          x += dx * f;
          y += dy * f;
          if (Math.random() < 0.004 * (1 + m.speed * 0.05)) this.sparks.push(this.mkSpark(x, y, 0.8));
        }
      }
      const r = p.size * k * 0.0011 * heat;
      const col = p.hue < 0.5 ? '255,214,140' : p.hue < 0.85 ? '255,150,60' : '255,250,230';
      const g = fx.createRadialGradient(x * w, y * h, 0, x * w, y * h, r * 2.8);
      g.addColorStop(0, 'rgba(255,252,236,0.95)');
      g.addColorStop(0.3, `rgba(${col},0.7)`);
      g.addColorStop(1, `rgba(${col},0)`);
      fx.fillStyle = g;
      fx.beginPath();
      fx.arc(x * w, y * h, r * 2.8, 0, 6.283);
      fx.fill();
    }

    // Sparks thrown off by a moving pointer
    if (m.inside && m.speed > 2 && this.sparks.length < 400) {
      for (let i = 0; i < Math.min(4, m.speed * 0.1); i++) this.sparks.push(this.mkSpark(mx, my, 0.5));
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.x += s.vx;
      s.y += s.vy;
      s.vy -= 0.00004;
      s.vx *= 0.985;
      s.vy *= 0.985;
      s.life -= s.decay;
      if (s.life <= 0) {
        this.sparks.splice(i, 1);
        continue;
      }
      fx.fillStyle = `rgba(255,${(180 + 60 * s.life) | 0},${(90 * s.life) | 0},${s.life})`;
      fx.beginPath();
      fx.arc(s.x * w, s.y * h, s.r * k * 0.001 * (0.4 + s.life), 0, 6.283);
      fx.fill();
    }

    // Keep the cube itself clear, with a faint cool rim once lit
    const [cxF, cyF] = TokkeyPrometheusHero.NODES[1].p;
    const cx = cxF * w;
    const cy = cyF * h;
    const cr = TokkeyPrometheusHero.CLEAR_R * k;
    fx.globalCompositeOperation = 'destination-out';
    const clr = fx.createRadialGradient(cx, cy, 0, cx, cy, cr);
    clr.addColorStop(0, 'rgba(0,0,0,0.97)');
    clr.addColorStop(0.55, 'rgba(0,0,0,0.9)');
    clr.addColorStop(1, 'rgba(0,0,0,0)');
    fx.fillStyle = clr;
    fx.beginPath();
    fx.arc(cx, cy, cr, 0, 6.283);
    fx.fill();
    fx.globalCompositeOperation = 'lighter';
    const rim = fx.createRadialGradient(cx, cy, cr * 0.42, cx, cy, cr * 0.95);
    const ra = (0.16 + 0.08 * Math.sin(time * 0.003)) * this.light;
    rim.addColorStop(0, 'rgba(255,255,255,0)');
    rim.addColorStop(0.35, `rgba(235,242,255,${ra})`);
    rim.addColorStop(1, 'rgba(255,255,255,0)');
    fx.fillStyle = rim;
    fx.beginPath();
    fx.arc(cx, cy, cr, 0, 6.283);
    fx.fill();
    fx.globalCompositeOperation = 'source-over';
  }

  /** Pre-render a soft smoke puff sprite */
  static makePuff(seed, tint) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d');
    const rnd = TokkeyAboutMath.seeded(seed);
    for (let i = 0; i < 46; i++) {
      const px = 128 + (rnd() - 0.5) * 150;
      const py = 128 + (rnd() - 0.5) * 80 - rnd() * 20;
      const r = 26 + rnd() * 54;
      const g = x.createRadialGradient(px, py - r * 0.25, 0, px, py, r);
      g.addColorStop(0, `rgba(${tint},${0.1 + rnd() * 0.08})`);
      g.addColorStop(1, `rgba(${tint},0)`);
      x.fillStyle = g;
      x.beginPath();
      x.arc(px, py, r, 0, 6.283);
      x.fill();
    }
    return c;
  }

  seedClouds() {
    const puffs = [
      TokkeyPrometheusHero.makePuff(7, '236,214,190'),
      TokkeyPrometheusHero.makePuff(91, '255,196,140'),
      TokkeyPrometheusHero.makePuff(313, '200,190,185'),
      TokkeyPrometheusHero.makePuff(555, '255,226,190'),
    ];
    const zones = TokkeyPrometheusHero.ZONES;
    for (let i = 0; i < 46; i++) {
      const z = zones[i % zones.length];
      const depth = 0.3 + Math.random() * 0.7;
      this.clouds.push({
        x: z[0] + Math.random() * z[2],
        y: z[1] + Math.random() * z[3],
        depth,
        s: 0.18 + Math.random() * 0.28 * depth,
        vx: (0.00004 + Math.random() * 0.0001) * depth,
        img: puffs[i % 4],
        a: 0.28 + Math.random() * 0.37,
        ox: 0,
        oy: 0,
        rot: Math.random() * 6.28,
      });
    }
  }

  renderFog(time) {
    const { gx, pointer: m } = this;
    const w = this.fogC.width;
    const h = this.fogC.height;
    gx.clearRect(0, 0, w, h);
    const [mx, my] = this.pointerOnStage();
    const wind = 1 + m.cx * 1.4 + Math.min(3, m.speed * 0.03);
    for (const c of this.clouds) {
      c.x += c.vx * wind;
      if (c.x > 1.15) c.x = -0.25;
      if (c.x < -0.3) c.x = 1.1;
      // Puffs near the pointer drift away from it
      let tx = 0;
      let ty = 0;
      if (m.inside) {
        const dx = c.x - mx;
        const dy = c.y - my;
        const d = Math.hypot(dx, dy);
        if (d < 0.22) {
          const f = (0.22 - d) / 0.22;
          tx = (dx / (d || 1)) * f * 0.09 * c.depth;
          ty = (dy / (d || 1)) * f * 0.07 * c.depth;
        }
      }
      c.ox += (tx - c.ox) * 0.05;
      c.oy += (ty - c.oy) * 0.05;
      const px = c.x + c.ox - m.cx * 0.03 * c.depth;
      const py = c.y + c.oy + Math.sin(time * 0.0004 + c.rot) * 0.006 - m.cy * 0.02 * c.depth;
      const size = c.s * w;
      gx.globalAlpha = c.a * (0.8 + 0.2 * Math.sin(time * 0.0007 + c.rot));
      gx.drawImage(c.img, px * w - size / 2, py * h - size * 0.3, size, size * 0.6);
    }
    gx.globalAlpha = 1;
  }
}

/**
 * Opening sequence: darkness and brackets with the edition title, the golden-ratio lines draw in, then a spark at
 * the cube and the light spreads outward. Any click, key or wheel skips ahead. Scrolling is held (html.about-intro
 * hides overflow) until the light has spread.
 */
class TokkeyAboutIntro {
  /**
   * @param {HTMLElement} root
   * @param {TokkeyPrometheusHero} hero
   * @param {HTMLElement} ui
   * @param {HTMLElement} dark
   * @param {AbortSignal} signal
   */
  constructor(root, hero, ui, dark, signal) {
    this.root = root;
    this.hero = hero;
    this.ui = ui;
    this.dark = dark;
    this.signal = signal;
    this.timers = [];
    this.lighting = false;
    this.done = false;
    // Leaving mid-intro must not keep the page locked
    signal.addEventListener('abort', () => this.finish(), { once: true });

    if (TokkeyAboutMath.reducedMotion) {
      root.classList.add('drawn');
      this.finish();
      return;
    }
    document.documentElement.classList.add('about-intro');
    this.later(250, () => {
      ui.classList.add('stage-1');
      root.classList.add('drawn');
    });
    this.later(2300, () => this.ignite(2400));
    const skip = () => this.skip();
    for (const type of ['pointerdown', 'keydown', 'wheel']) {
      addEventListener(type, skip, { once: true, passive: true, signal });
    }
  }

  later(ms, fn) {
    this.timers.push(setTimeout(fn, ms));
  }

  static easeInOut(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  /**
   * Spark at the cube, then open the darkness over `dur` ms
   * @param {number} dur
   */
  ignite(dur) {
    if (this.lighting) return;
    this.lighting = true;
    this.ui.classList.add('stage-2');
    this.hero.ignite();
    const t0 = performance.now();
    const step = (now) => {
      if (this.done) return;
      const k = Math.min(1, (now - t0) / dur);
      this.dark.style.setProperty('--r', (-30 + TokkeyAboutIntro.easeInOut(k) * 170).toFixed(2));
      this.hero.light = Math.min(1, k * 1.4);
      if (k > 0.35 && !this.root.classList.contains('lit')) {
        this.root.classList.add('lit');
        this.ui.classList.add('stage-3');
      }
      if (k < 1) requestAnimationFrame(step);
      else this.finish();
    };
    requestAnimationFrame(step);
  }

  finish() {
    if (this.done) return;
    this.done = true;
    this.timers.forEach(clearTimeout);
    this.dark.style.display = 'none';
    this.hero.light = 1;
    this.root.classList.add('lit');
    this.ui.classList.add('gone');
    document.documentElement.classList.remove('about-intro');
  }

  skip() {
    if (this.done) return;
    this.timers.forEach(clearTimeout);
    this.root.classList.add('drawn');
    if (!this.lighting) this.ignite(700);
  }
}

/**
 * Chapters 2 and 3 hero atmosphere: the painting tilts with the pointer, a canvas adds a glowing lever beam
 * (Archimedes) or a rising blade (Arthur) with drifting motes, a focus box + label track the device, and a warm
 * spotlight leans toward the pointer. Image-space points follow object-fit:cover AND the live tilt, so overlays stay
 * glued to the painting.
 */
class TokkeySceneFx {
  /** Scene perspective (px), must match .scene { perspective } */
  static PERSPECTIVE = 1600;
  /** Lever beam polyline (image fractions), from the fulcrum to the tip */
  static LEVER = [
    [0.447, 0.843],
    [0.43, 0.79],
    [0.55, 0.69],
    [0.714, 0.478],
    [0.8, 0.3],
    [0.84, 0.19],
  ];

  /**
   * @param {HTMLElement} scene
   * @param {AbortSignal} signal
   */
  constructor(scene, signal) {
    this.scene = scene;
    this.kind = scene.dataset.fx === 'lever' ? 'lever' : 'sword';
    this.img = scene.querySelector('.color');
    this.cv = scene.querySelector('.fx-canvas');
    this.ctx = this.cv.getContext('2d');
    this.spot = scene.querySelector('.spot');
    this.hot = scene.querySelector('.hot');
    this.box = this.hot.querySelector('.box');
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    /** Pointer for the effects (stays where it left) and for the tilt (recentres on leave) */
    this.pointer = new TokkeyPointerTracker(scene, signal, false);
    this.tilt = new TokkeyPointerTracker(scene, signal);
    this.parts = TokkeySceneFx.mkMotes(this.kind === 'lever' ? 90 : 70);
    this.motes = TokkeySceneFx.mkMotes(26);
  }

  static mkMotes(n) {
    return Array.from({ length: n }, () => ({
      u: Math.random(),
      life: Math.random(),
      speed: 0.4 + Math.random() * 1.1,
      size: 0.6 + Math.random() * 1.6,
      hue: Math.random(),
    }));
  }

  static leverAt(u) {
    const L = TokkeySceneFx.LEVER;
    const x = Math.min(L.length - 1.001, Math.max(0, u * (L.length - 1)));
    const i = Math.floor(x);
    const k = x - i;
    return [L[i][0] + (L[i + 1][0] - L[i][0]) * k, L[i][1] + (L[i + 1][1] - L[i][1]) * k];
  }

  /** object-fit:cover mapping of the image plus its current transform */
  coverFit() {
    const img = this.img;
    const w = img.offsetWidth;
    const h = img.offsetHeight;
    const iw = img.naturalWidth || 1672;
    const ih = img.naturalHeight || 941;
    const s = Math.max(w / iw, h / ih);
    let M = null;
    try {
      M = img.style.transform ? new DOMMatrix(img.style.transform) : null;
    } catch {
      M = null;
    }
    return { ox: (w - iw * s) / 2, oy: (h - ih * s) / 2, s, w, h, iw, ih, M };
  }

  /** Image fraction → scene pixels, through the cover fit and the perspective tilt */
  static pt(f, x, y) {
    const lx = f.ox + x * f.iw * f.s;
    const ly = f.oy + y * f.ih * f.s;
    if (!f.M) return [lx, ly];
    const cx = f.w / 2;
    const cy = f.h / 2;
    const p = f.M.transformPoint(new DOMPoint(lx - cx, ly - cy, 0));
    const k = TokkeySceneFx.PERSPECTIVE / (TokkeySceneFx.PERSPECTIVE - p.z);
    return [cx + p.x * k, cy + p.y * k];
  }

  /**
   * One frame; skipped while the scene is off screen
   * @param {number} time
   */
  render(time) {
    if (!TokkeyAboutMath.onScreen(this.scene, 40)) return;

    // Tilt the painting first so the overlays read its new transform
    const t = this.tilt;
    t.ease(0.06);
    this.img.style.transform = `scale(1.06) rotateY(${t.cx * 3.5}deg) rotateX(${-t.cy * 2.4}deg) translate3d(${-t.cx * 12}px, ${-t.cy * 7}px, 0)`;

    const fit = this.coverFit();
    const m = this.pointer;
    m.ease(0.08);
    this.cv.width = Math.round(fit.w * this.dpr);
    this.cv.height = Math.round(fit.h * this.dpr);
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, fit.w, fit.h);
    const heat = 0.55 + Math.min(0.9, m.speed * 0.012) + (m.inside ? 0.25 : 0);
    const near = (x, y) => (m.inside ? Math.max(0, 1 - Math.hypot(m.x * fit.w - x, m.y * fit.h - y) / 260) : 0);

    if (this.kind === 'lever') this.drawLever(fit, heat, near);
    else this.drawSword(fit, heat, near, time);

    // Ambient motes rising through the lower half
    for (const p of this.motes) {
      p.life += 0.0016 * p.speed;
      if (p.life > 1) {
        p.life = 0;
        p.u = Math.random();
      }
      ctx.fillStyle = `rgba(255,220,160,${(0.35 * Math.sin(Math.PI * p.life)).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(p.u * fit.w, fit.h * (1 - p.life) * 0.6 + fit.h * 0.35, p.size, 0, 6.283);
      ctx.fill();
    }

    this.trackDevice(fit, near);
  }

  drawLever(fit, heat, near) {
    const ctx = this.ctx;
    const L = TokkeySceneFx.LEVER;
    ctx.lineCap = 'round';
    for (let i = 1; i < L.length; i++) {
      const [x1, y1] = TokkeySceneFx.pt(fit, L[i - 1][0], L[i - 1][1]);
      const [x2, y2] = TokkeySceneFx.pt(fit, L[i][0], L[i][1]);
      const g = ctx.createLinearGradient(x1, y1, x2, y2);
      g.addColorStop(0, 'rgba(255,176,70,.05)');
      g.addColorStop(1, 'rgba(255,214,140,.55)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 7;
      ctx.globalAlpha = 0.5 * heat;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const [tx, ty] = TokkeySceneFx.pt(fit, 0.84, 0.19);
    const tip = ctx.createRadialGradient(tx, ty, 0, tx, ty, 150);
    tip.addColorStop(0, `rgba(255,236,190,${0.55 * heat})`);
    tip.addColorStop(1, 'rgba(255,180,70,0)');
    ctx.fillStyle = tip;
    ctx.beginPath();
    ctx.arc(tx, ty, 150, 0, 6.283);
    ctx.fill();
    // Embers lifting off the beam
    for (const p of this.parts) {
      p.life += 0.004 * p.speed;
      if (p.life > 1) {
        p.life = 0;
        p.u = Math.random();
      }
      const [ux, uy] = TokkeySceneFx.leverAt(Math.min(0.999, p.u));
      const [x, y] = TokkeySceneFx.pt(fit, ux, uy);
      const lift = p.life * (26 + p.speed * 30);
      const nx = near(x, y);
      const rad = p.size * (1.1 + nx * 1.4);
      const gg = ctx.createRadialGradient(x, y - lift, 0, x, y - lift, rad * 3.2);
      gg.addColorStop(0, `rgba(255,${p.hue < 0.5 ? 230 : 176},120,${(0.85 * Math.sin(Math.PI * p.life) * (0.6 + nx)).toFixed(3)})`);
      gg.addColorStop(1, 'rgba(255,160,60,0)');
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(x, y - lift, rad * 3.2, 0, 6.283);
      ctx.fill();
    }
  }

  drawSword(fit, heat, near, time) {
    const ctx = this.ctx;
    const [bx, by] = TokkeySceneFx.pt(fit, 0.504, 0.855);
    const [hx, hy] = TokkeySceneFx.pt(fit, 0.504, 0.497);
    const pulse = 0.75 + 0.25 * Math.sin(time * 0.003);
    const blade = ctx.createLinearGradient(bx, by, hx, hy);
    blade.addColorStop(0, 'rgba(255,236,190,0)');
    blade.addColorStop(0.35, `rgba(255,220,150,${(0.55 * heat * pulse).toFixed(3)})`);
    blade.addColorStop(1, `rgba(255,244,214,${(0.9 * heat).toFixed(3)})`);
    ctx.strokeStyle = blade;
    ctx.lineWidth = 16;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.globalAlpha = 1;
    const halo = ctx.createRadialGradient(hx, hy, 0, hx, hy, 90);
    halo.addColorStop(0, `rgba(255,236,190,${0.5 * heat})`);
    halo.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(hx, hy, 90, 0, 6.283);
    ctx.fill();
    // Light climbing the blade
    for (const p of this.parts) {
      p.life += 0.0032 * p.speed;
      if (p.life > 1) p.life = 0;
      const k = p.life;
      const x = bx + (hx - bx) * k + Math.sin(time * 0.002 + p.u * 12) * 5;
      const y = by + (hy - by) * k;
      const nx = near(x, y);
      const rad = p.size * (1.2 + nx);
      const gg = ctx.createRadialGradient(x, y, 0, x, y, rad * 3);
      gg.addColorStop(0, `rgba(255,240,200,${(0.8 * (1 - Math.abs(k * 2 - 1)) * (0.55 + nx)).toFixed(3)})`);
      gg.addColorStop(1, 'rgba(255,210,140,0)');
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(x, y, rad * 3, 0, 6.283);
      ctx.fill();
    }
  }

  /** Brackets + label on the device; data-px/py = its centre, data-pw/ph = its size, as image fractions */
  trackDevice(fit, near) {
    const d = this.hot.dataset;
    const px = Number(d.px);
    const py = Number(d.py);
    const pw = Number(d.pw) || 0.05;
    const ph = Number(d.ph) || 0.05;
    const [ax, ay] = TokkeySceneFx.pt(fit, px, py);
    const [lx] = TokkeySceneFx.pt(fit, px - pw / 2, py);
    const [rx] = TokkeySceneFx.pt(fit, px + pw / 2, py);
    const [, ty] = TokkeySceneFx.pt(fit, px, py - ph / 2);
    const [, by] = TokkeySceneFx.pt(fit, px, py + ph / 2);
    const pad = 10;
    const bw = Math.max(28, rx - lx + pad * 2);
    const bh = Math.max(22, by - ty + pad * 2);
    this.hot.style.transform = `translate3d(${ax.toFixed(1)}px, ${ay.toFixed(1)}px, 0)`;
    this.box.style.width = `${bw.toFixed(1)}px`;
    this.box.style.height = `${bh.toFixed(1)}px`;
    this.hot.style.setProperty('--gap', `${bh * 0.5 + 8}px`);
    this.hot.style.opacity = (0.82 + near(ax, ay) * 0.18).toFixed(3);

    // Spotlight sits on the device and leans toward the pointer
    const m = this.pointer;
    const ex = ax / fit.w;
    const ey = ay / fit.h;
    this.spot.style.setProperty('--sx', `${((m.inside ? m.x * 0.35 + ex * 0.65 : ex) * 100).toFixed(1)}%`);
    this.spot.style.setProperty('--sy', `${((m.inside ? m.y * 0.35 + ey * 0.65 : ey) * 100).toFixed(1)}%`);
  }
}

/**
 * Torn top edge of a paper mask: a jagged midpoint-displacement profile that climbs and spreads as the sheet rises,
 * with a slow ripple, layered strokes (shadow, fibres, glow, rim) and glowing motes lifting off the edge.
 */
class TokkeyTornEdge {
  /** Profile resolution (points across the width) */
  static N = 512;

  /**
   * @param {SVGSVGElement} svg
   * @param {number} index - Seeds the profile, so every sheet tears differently
   */
  constructor(svg, index) {
    this.svg = svg;
    this.prof = TokkeyTornEdge.profile(TokkeyTornEdge.N, 9173 + index * 31);
    this.fill = svg.querySelector('.tfill');
    this.lines = ['.trim', '.thalo', '.tglow', '.tshadow'].map((s) => svg.querySelector(s));
    this.motesEl = svg.querySelector('.motes');
    this.motes = Array.from({ length: 40 }, () => ({
      u: Math.random(),
      life: Math.random(),
      speed: 0.12 + Math.random() * 0.5,
      drift: (Math.random() - 0.5) * 0.6,
      size: 1.2 + Math.random() * 2.6,
    }));
  }

  /** Normalised 0..1 torn profile from midpoint displacement plus a few sharp nicks */
  static profile(n, seed) {
    const r = TokkeyAboutMath.seeded(seed);
    const y = new Float32Array(n + 1);
    y[0] = r();
    y[n] = r();
    let step = n;
    let amp = 1;
    while (step > 1) {
      const half = step >> 1;
      for (let i = half; i < n; i += step) y[i] = (y[i - half] + y[i + half]) / 2 + (r() - 0.5) * amp;
      step = half;
      amp *= 0.62;
    }
    for (let i = 1; i < n; i++) if (r() < 0.22) y[i] += (r() - 0.3) * 0.16;
    let mn = Infinity;
    let mx = -Infinity;
    for (const v of y) {
      mn = Math.min(mn, v);
      mx = Math.max(mx, v);
    }
    for (let i = 0; i <= n; i++) y[i] = (y[i] - mn) / (mx - mn);
    return y;
  }

  /** Edge height at u (0..1), interpolated */
  edgeAt(u) {
    const x = Math.min(TokkeyTornEdge.N - 0.001, Math.max(0, u * TokkeyTornEdge.N));
    const i = Math.floor(x);
    return this.prof[i] + (this.prof[i + 1] - this.prof[i]) * (x - i);
  }

  /** Centre bulge so the tear climbs higher mid-page */
  static bulge(u) {
    return 0.22 * Math.sin(Math.PI * TokkeyAboutMath.clamp01(u * 1.15 - 0.05));
  }

  /** @param {number} time */
  render(time) {
    const vh = innerHeight;
    const r = this.svg.getBoundingClientRect();
    const w = r.width;
    const h = r.height;
    if (!w || !h || r.top > vh || r.bottom < -h) return;

    // The tear deepens as the sheet rises into view
    const N = TokkeyTornEdge.N;
    const depth = h * (0.34 + 0.62 * TokkeyAboutMath.clamp01((vh - (r.top + h)) / vh));
    const flow = time * 0.00035;
    let d = '';
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const wave = 0.045 * Math.sin(u * 9 - flow * 6) + 0.02 * Math.sin(u * 23 + flow * 4);
      const y = h - 6 - (this.prof[i] + TokkeyTornEdge.bulge(u) + wave) * depth;
      d += `${i ? 'L' : 'M'}${(u * w).toFixed(1)},${y.toFixed(1)}`;
    }
    this.fill.setAttribute('d', `${d}L${w},${h + 4}L0,${h + 4}Z`);
    this.lines.forEach((p) => p.setAttribute('d', d));

    // Motes lifting off the edge, brighter as the sheet arrives
    const live = TokkeyAboutMath.clamp01((vh - r.top) / vh);
    let md = '';
    for (const s of this.motes) {
      s.life += 0.004 * s.speed;
      if (s.life > 1) {
        s.life = 0;
        s.u = Math.random();
      }
      const u = Math.min(0.999, Math.max(0, s.u + s.drift * s.life * 0.05));
      const ev = this.edgeAt(u) + TokkeyTornEdge.bulge(u);
      const x = u * w + Math.sin(time * 0.001 * s.speed + s.u * 20) * 6;
      const y = h - 6 - ev * depth - s.life * (10 + s.speed * 34);
      md += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${s.size.toFixed(1)}" opacity="${(Math.sin(Math.PI * s.life) * (0.35 + 0.65 * live)).toFixed(2)}"/>`;
    }
    this.motesEl.innerHTML = md;
  }
}

/**
 * Scroll-driven handoffs between the layers of each chapter, plus the bottom-left chapter index:
 *  1. as a mask rises, the color hero under it blurs and dims
 *  2. once the mask covers the screen, color swaps to charcoal; its dissolving lower edge reveals the charcoal
 *     blurred, sharpening as it leaves
 *  3. the next chapter's hero rises with a feathered top edge, blurred at first, while the outgoing charcoal blurs
 *     and darkens underneath it
 * Index links are native anchors; assets/tokkey.css makes the jump smooth.
 */
class TokkeyChapterHandoff {
  /**
   * @param {HTMLElement} root
   * @param {HTMLElement} index
   */
  constructor(root, index) {
    this.root = root;
    this.index = index;
    this.chapters = [...root.querySelectorAll('.chapter')].map((c) => {
      const scene = c.querySelector('.scene');
      return {
        scene,
        mask: c.querySelector('.mask'),
        /** Color layer: the tilting stage (chapter 1) or the painting */
        color: scene.querySelector('.stage') ?? scene.querySelector('.color'),
        charcoal: scene.querySelector('.charcoal'),
        veil: scene.querySelector('.veil'),
      };
    });
    this.heroText = [...root.querySelectorAll('.copy .headline, .copy .foot')];
    this.links = [...index.querySelectorAll('a')];
    this.targets = this.links.map((a) => root.querySelector(a.getAttribute('href')));
    /** Last written style per element, so unchanged values aren't re-set every frame */
    this.written = new WeakMap();
  }

  set(el, prop, value) {
    const last = this.written.get(el) ?? {};
    if (last[prop] === value) return;
    last[prop] = value;
    this.written.set(el, last);
    el.style[prop] = value;
  }

  /** One frame */
  render() {
    const vh = innerHeight;
    this.updateIndex(vh);
    const enter = this.chapters.map((o) => TokkeyAboutMath.clamp01(o.scene.getBoundingClientRect().top / vh));

    this.chapters.forEach((o, i) => {
      const m = o.mask.getBoundingClientRect();
      // 1. color hero under the rising mask; incoming hero blurred while still rising
      const p = TokkeyAboutMath.clamp01((vh - m.top) / vh);
      const e = enter[i];
      const cBlur = Math.max(p * 9, e * 10);
      const cDim = 1 - p * 0.28 - e * 0.15;
      this.set(o.color, 'filter', cBlur > 0.05 ? `blur(${cBlur.toFixed(1)}px) brightness(${cDim.toFixed(3)})` : '');
      // 3a. feathered top edge on an incoming scene
      const feather =
        e > 0.001
          ? `linear-gradient(to bottom, transparent 0, rgba(0,0,0,.55) ${(e * 18).toFixed(1)}vh, #000 ${(e * 42).toFixed(1)}vh)`
          : 'none';
      this.set(o.scene, 'maskImage', feather);

      // 2. swap to charcoal while the mask fully covers the screen
      const covered = m.top <= 0 ? 1 : 0;
      this.set(o.charcoal, 'opacity', String(covered));
      this.set(o.veil, 'opacity', String(covered * 0.9));
      // charcoal sharpens as the dissolving edge clears it
      const q = TokkeyAboutMath.clamp01((vh - m.bottom) / (vh * 0.55));
      // 3c. outgoing charcoal blurs and darkens while the next hero covers it
      const nx = enter[i + 1];
      const leave = nx !== undefined && nx > 0 && nx < 1 ? 1 - nx : nx === 0 ? 1 : 0;
      const kBlur = Math.max(m.top <= 0 ? (1 - q) * 12 : 0, leave * 8);
      const kDim = 0.92 - leave * 0.35;
      this.set(
        o.charcoal,
        'filter',
        `contrast(1.05) brightness(${kDim.toFixed(3)})` + (kBlur > 0.05 ? ` blur(${kBlur.toFixed(1)}px)` : '')
      );
    });
  }

  /** Highlight the current chapter; step the index back while hero text passes its corner or the footer is up */
  updateIndex(vh) {
    const ir = this.index.getBoundingClientRect();
    const hit = this.heroText.some((el) => {
      const r = el.getBoundingClientRect();
      return r.bottom > ir.top && r.top < ir.bottom && r.left < ir.right;
    });
    const pastPage = this.root.getBoundingClientRect().bottom < vh;
    this.set(this.index, 'opacity', hit || pastPage ? '0' : '');

    let cur = this.targets[0];
    for (const el of this.targets) if (el.getBoundingClientRect().top < vh * 0.45) cur = el;
    this.links.forEach((a, i) => a.classList.toggle('on', this.targets[i] === cur));
  }
}

/**
 * Closing CTA background: embers rise from a warm glow at the bottom and drift toward the pointer, leaving short
 * trails. Drawn only while the section is on screen.
 */
class TokkeyEmberField {
  /**
   * @param {HTMLElement} section
   * @param {HTMLCanvasElement} canvas
   * @param {AbortSignal} signal
   */
  constructor(section, canvas, signal) {
    this.section = section;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.embers = [];
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    /** Attractor, 0..1 of the section */
    this.at = { x: 0.5, y: 0.6 };
    section.addEventListener(
      'pointermove',
      (e) => {
        const r = section.getBoundingClientRect();
        this.at.x = (e.clientX - r.left) / r.width;
        this.at.y = (e.clientY - r.top) / r.height;
      },
      { signal }
    );
  }

  render() {
    if (!TokkeyAboutMath.onScreen(this.section)) return;
    const r = this.section.getBoundingClientRect();
    const { ctx, canvas, at } = this;
    if ((canvas.width | 0) !== ((r.width * this.dpr) | 0)) {
      canvas.width = r.width * this.dpr;
      canvas.height = r.height * this.dpr;
    }
    const w = canvas.width;
    const h = canvas.height;
    // Translucent wash instead of a clear leaves trails
    ctx.fillStyle = 'rgba(8,6,5,0.22)';
    ctx.fillRect(0, 0, w, h);
    const g = ctx.createRadialGradient(at.x * w, h * 1.05, 0, at.x * w, h * 1.05, h * 0.9);
    g.addColorStop(0, 'rgba(255,120,30,0.10)');
    g.addColorStop(1, 'rgba(255,80,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 4; i++) {
      this.embers.push({ x: Math.random(), y: 1.02, vx: 0, vy: -(0.0015 + Math.random() * 0.004), l: 1, r: 1 + Math.random() * 2.5 });
    }
    ctx.globalCompositeOperation = 'lighter';
    for (let i = this.embers.length - 1; i >= 0; i--) {
      const p = this.embers[i];
      p.vx += (at.x - p.x) * 0.00006 + (Math.random() - 0.5) * 0.0004;
      p.x += p.vx;
      p.y += p.vy;
      p.l -= 0.004;
      if (p.l <= 0 || p.y < -0.05) {
        this.embers.splice(i, 1);
        continue;
      }
      ctx.fillStyle = `rgba(255,${(150 + 90 * p.l) | 0},${(60 * p.l) | 0},${p.l})`;
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, p.r * this.dpr, 0, 6.283);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

/**
 * Live UI mocks inside the board tiles. Each `.slot[data-ui=name]` is self-contained (so a real product UI can
 * replace any one later) and starts the first time it scrolls into view. Loops and intervals stop on `signal`.
 */
class TokkeyBoardMocks {
  /**
   * @param {HTMLElement} root
   * @param {AbortSignal} signal
   */
  constructor(root, signal) {
    this.signal = signal;
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          io.unobserve(e.target);
          const name = e.target.dataset.ui;
          if (typeof this[name] === 'function') this[name](e.target);
        }),
      { threshold: 0.25 }
    );
    root.querySelectorAll('.slot[data-ui]').forEach((s) => io.observe(s));
    signal.addEventListener('abort', () => io.disconnect(), { once: true });
  }

  /** Abortable delay */
  wait(ms) {
    return TokkeyAboutMath.wait(ms, this.signal);
  }

  /** setInterval that stops with the page */
  every(ms, fn) {
    const timer = setInterval(fn, ms);
    this.signal.addEventListener('abort', () => clearInterval(timer), { once: true });
    return timer;
  }

  /** Run `body` forever (until abort); each pass awaits its own pauses */
  async loop(body) {
    for (let k = 0; !this.signal.aborted; k++) await body(k);
  }

  /** Make `on` the only `.on` button among `buttons` */
  static select(buttons, on) {
    buttons.forEach((x) => x.classList.toggle('on', x === on));
  }

  /** Assistant types a question and answers on device; caption alternates; menu-bar panel tabs */
  'ai-mac'(el) {
    const q = el.querySelector('[data-q]');
    const a = el.querySelector('[data-a]');
    const list = el.querySelector('[data-list]');
    const cap = el.querySelector('[data-cap]');
    const SCRIPT = [
      {
        q: '“Summarize this week’s meeting notes and list the open actions.”',
        a: 'Three actions are still open:',
        items: ['Confirm launch date with retail', 'Send pricing draft to finance', 'Book the CES booth walkthrough'],
      },
      {
        q: '“Draft a reply to Lena about the Q1 roadmap.”',
        a: 'Draft ready, kept on this Mac:',
        items: ['Thanks for the notes on Q1', 'Router ships in February', 'Happy to walk through it Thursday'],
      },
    ];
    const CAPS = ['Own your <b>intelligence</b>', 'Turn your Mac into an <b>AI Mac</b>'];
    this.loop(async (k) => {
      const s = SCRIPT[k % SCRIPT.length];
      cap.style.opacity = '0';
      await this.wait(400);
      cap.innerHTML = CAPS[k % CAPS.length];
      cap.style.opacity = '1';
      q.textContent = '';
      a.textContent = '';
      list.innerHTML = '';
      a.parentElement.hidden = true;
      for (const ch of s.q) {
        q.textContent += ch;
        await this.wait(TokkeyAboutMath.reducedMotion ? 0 : 22);
      }
      await this.wait(500);
      a.parentElement.hidden = false;
      a.textContent = s.a;
      for (const it of s.items) {
        const li = document.createElement('li');
        li.textContent = it;
        list.appendChild(li);
        await this.wait(60);
        li.classList.add('in');
        await this.wait(380);
      }
      await this.wait(3200);
    });
    const tabs = [...el.querySelectorAll('[data-tab]')];
    tabs.forEach((b) =>
      b.addEventListener('click', () => {
        TokkeyBoardMocks.select(tabs, b);
        el.querySelectorAll('[data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== b.dataset.tab));
      })
    );
  }

  /** Weights load from disk into memory, then stay */
  weights(el) {
    const bar = el.querySelector('[data-wbar]');
    const st = el.querySelector('[data-wstate]');
    const pill = el.querySelector('[data-wpill]');
    this.loop(async () => {
      bar.style.transition = 'none';
      bar.style.width = '0%';
      st.textContent = 'Loading into memory…';
      pill.textContent = 'On disk';
      pill.className = 'pill';
      await this.wait(60);
      bar.style.transition = '';
      bar.style.width = '100%';
      await this.wait(1400);
      st.textContent = 'Ready · loaded once, stays';
      pill.textContent = 'In memory';
      pill.className = 'pill ok';
      await this.wait(4200);
    });
  }

  /** Setup checklist ticks through */
  setup(el) {
    const items = [...el.querySelectorAll('[data-steps] li')];
    this.loop(async () => {
      items.forEach((x) => (x.className = ''));
      for (const x of items) {
        x.className = 'run';
        await this.wait(900);
        x.className = 'done';
      }
      await this.wait(3600);
    });
  }

  /** Terminal calls the local endpoint */
  endpoint(el) {
    const pre = el.querySelector('[data-term]');
    const LINES = [
      '<span class="k">$</span> curl localhost:8080/v1/chat/completions \\',
      "    -d '{\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}]}'",
      '',
      '<span class="ok">200 OK</span> · answered on device · 0 bytes sent out',
    ];
    this.loop(async () => {
      pre.innerHTML = '';
      for (const l of LINES) {
        pre.innerHTML += `${l}\n`;
        await this.wait(650);
      }
      await this.wait(3800);
    });
  }

  /** Cloud route switch */
  privacy(el) {
    const sw = el.querySelector('[data-sw]');
    const note = el.querySelector('[data-privnote]');
    const ask = el.querySelector('[data-ask]');
    el.querySelector('.sw-row').addEventListener('click', (e) => {
      e.preventDefault();
      const on = sw.getAttribute('aria-checked') !== 'true';
      sw.setAttribute('aria-checked', String(on));
      note.textContent = on ? 'On, for tasks you approve. Each one is logged.' : 'Off. Everything stays on this Mac.';
      ask.hidden = !on;
    });
  }

  /** Cloud vs Tokkey columns */
  compare(el) {
    const rows = el.querySelector('[data-cmp]');
    const cells = [...rows.querySelectorAll('b')];
    const sides = [...el.querySelectorAll('[data-side]')];
    const show = (side) => {
      rows.classList.add('fade');
      setTimeout(() => {
        cells.forEach((b) => (b.textContent = side === 'cloud' ? b.dataset.c : b.dataset.l));
        rows.classList.remove('fade');
      }, 220);
      TokkeyBoardMocks.select(sides, sides.find((x) => x.dataset.side === side));
    };
    sides.forEach((b) => b.addEventListener('click', () => show(b.dataset.side)));
    cells.forEach((b) => (b.textContent = b.dataset.c));
  }

  scorecard(el) {
    el.querySelector('.score').classList.add('in');
  }

  density(el) {
    el.querySelector('.dens').classList.add('in');
    const v = el.querySelector('[data-dens]');
    let n = 0;
    const t = this.every(30, () => {
      n += 3;
      v.textContent = `${Math.min(n, 72)}%`;
      if (n >= 72) clearInterval(t);
    });
  }

  /** Layers stream from SSD into RAM */
  offload(el) {
    el.querySelector('.offl').classList.add('in');
    const layers = el.querySelector('[data-layers]');
    const ready = el.querySelector('[data-ready]');
    this.loop(async () => {
      for (let i = 0; i <= 36; i += 4) {
        layers.textContent = `${i} / 36`;
        ready.textContent = i < 8 ? '…' : 'Yes, streaming the rest';
        await this.wait(260);
      }
      await this.wait(2600);
    });
  }

  /** Tasks pick a route */
  route(el) {
    const task = el.querySelector('[data-rtask]');
    const why = el.querySelector('[data-rwhy]');
    const routes = [...el.querySelectorAll('[data-rt]')];
    const T = [
      ['Summarize my meeting notes', 'local', 'Private file. Kept local.'],
      ['Translate a public press release', 'cloud', 'Public text, and you allowed this model.'],
      ['Search my inbox for invoices', 'local', 'Personal data. Kept local.'],
    ];
    let k = 0;
    this.every(3200, () => {
      k = (k + 1) % T.length;
      task.style.opacity = '0';
      setTimeout(() => {
        task.textContent = T[k][0];
        why.textContent = T[k][2];
        task.style.opacity = '1';
        TokkeyBoardMocks.select(routes, routes.find((r) => r.dataset.rt === T[k][1]));
      }, 300);
    });
  }

  /** A metered bill ticking up */
  rent(el) {
    const r = el.querySelector('[data-rent]');
    const t = el.querySelector('[data-renttot]');
    let c = 0;
    this.every(900, () => {
      c = c > 38 ? 0 : c + 0.37 + Math.random() * 0.4;
      r.textContent = `$${c.toFixed(2)}`;
      t.textContent = `$${(20 + c).toFixed(2)}`;
    });
  }

  /** Swap models, keep memory */
  swap(el) {
    const note = el.querySelector('[data-swapnote]');
    const buttons = [...el.querySelectorAll('[data-swap] button')];
    buttons.forEach((b) =>
      b.addEventListener('click', () => {
        TokkeyBoardMocks.select(buttons, b);
        note.textContent = `Switched to ${b.textContent}. Memory and preferences kept.`;
      })
    );
  }

  /** Local / cloud per task */
  choose(el) {
    const m = el.querySelector('[data-chmodel]');
    const buttons = [...el.querySelectorAll('[data-choose] button')];
    buttons.forEach((b, i) =>
      b.addEventListener('click', () => {
        TokkeyBoardMocks.select(buttons, b);
        m.textContent = i ? 'A cloud model you named' : 'Qwen 3.5 9B · on device';
      })
    );
  }

  /** What may leave, and a stop button */
  boundary(el) {
    const btn = el.querySelector('[data-stop]');
    const inputs = [...el.querySelectorAll('input')];
    const reset = () => {
      btn.textContent = 'Stop all sharing';
      btn.classList.remove('done');
    };
    btn.addEventListener('click', () => {
      inputs.forEach((x) => (x.checked = false));
      btn.textContent = 'Sharing stopped';
      btn.classList.add('done');
      setTimeout(reset, 2400);
    });
    inputs.forEach((x) => x.addEventListener('change', reset));
  }

  /** Forget remembered facts */
  remember(el) {
    const note = el.querySelector('[data-memnote]');
    el.querySelectorAll('[data-memlist] button').forEach((b) =>
      b.addEventListener('click', () => {
        const li = b.closest('li');
        li.classList.add('gone');
        setTimeout(() => {
          li.remove();
          note.textContent = 'Forgotten on this device. Nothing kept elsewhere.';
        }, 300);
      })
    );
  }
}

/**
 * <tokkey-about>: page controller. Builds every scene and drives them from one animation frame loop. Below 768px
 * the Prometheus painting shifts so the cube stays in frame; pointer effects simply idle on touch.
 */
class TokkeyAbout extends HTMLElement {
  /** Viewport width (px) below which the mobile layout applies; matches the stylesheet's 767px breakpoint */
  static MOBILE_MAX_WIDTH = 767;

  connectedCallback() {
    this.abort = new AbortController();
    const signal = this.abort.signal;
    const q = (sel) => this.querySelector(sel);

    this.hero = new TokkeyPrometheusHero(q('#hero'), signal);
    new TokkeyAboutIntro(this, this.hero, q('[data-ref=intro]'), q('[data-ref=dark]'), signal);
    this.fx = [...this.querySelectorAll('[data-fx]')].map((s) => new TokkeySceneFx(s, signal));
    this.tears = [...this.querySelectorAll('.tear')].map((svg, i) => new TokkeyTornEdge(svg, i));
    this.handoff = new TokkeyChapterHandoff(this, q('[data-ref=index]'));
    this.embers = new TokkeyEmberField(q('#cta'), q('#embers'), signal);
    new TokkeyBoardMocks(this, signal);

    const mobile = matchMedia(`(max-width: ${TokkeyAbout.MOBILE_MAX_WIDTH}px)`);
    const setMobile = () => {
      this.hero.mobile = mobile.matches;
      this.hero.layout();
    };
    mobile.addEventListener('change', setMobile, { signal });
    setMobile();

    const frame = (time) => {
      this.render(time);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  disconnectedCallback() {
    cancelAnimationFrame(this.raf);
    this.abort?.abort();
  }

  /** @param {number} time */
  render(time) {
    this.handoff.render();
    this.hero.render(time);
    this.fx.forEach((f) => f.render(time));
    this.tears.forEach((t) => t.render(time));
    this.embers.render();
  }
}

if (!customElements.get('tokkey-about')) customElements.define('tokkey-about', TokkeyAbout);
