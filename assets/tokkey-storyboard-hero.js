/**
 * Storyboard hero: MacBook lid opens (frame sequence on a canvas), camera pushes in on the key,
 * the MacBook dissolves into the Mac mini, and the headline lands on "Own your intelligence".
 * Ported from the prototype homepage v3 hero. Plays once, the first time the hero scrolls into view.
 */
class TokkeyStoryboardHero extends HTMLElement {
  /** Total timeline length in seconds */
  static DURATION = 9.6;

  /** Number of logical frames in the lid-open sequence (f00–f34 plus the hi-res end frame) */
  static FRAME_COUNT = 36;

  /** Key position on the 1920×1080 stage, and where the push-in centres it */
  static KEY = { x: 639, y: 714 };
  static MID = { x: 960, y: 700 };
  static FIN = { x: 960, y: 710 };

  /** Typefaces "intelligence" flickers through: [family, style, weight, letter-spacing] */
  static FLICKER_FACES = [
    ["'HV Playfair'", 'italic', 400, '-0.01em'],
    ["'HV Cormorant'", 'normal', 300, '0.03em'],
    ["'HV EBG'", 'italic', 400, '0.01em'],
    ["'HV Bodoni'", 'normal', 400, '-0.02em'],
    ["'HV DMSerif'", 'italic', 400, '-0.005em'],
    ["'HV Josefin'", 'normal', 300, '0.06em'],
    ["'HV Grotesk'", 'normal', 300, '0.015em'],
    ["'HV Bebas'", 'normal', 400, '0.08em'],
    ["'HV Courier'", 'normal', 400, '0.02em'],
    ["'HV Playfair'", 'normal', 400, '-0.015em'],
  ];
  static FLICKER_DURATIONS = [130, 120, 110, 110, 120, 145, 180, 240, 340, 480];

  connectedCallback() {
    this.abort = new AbortController();
    this.mobileQuery = matchMedia('(max-width: 1023px)');
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.mbw = this.querySelector('.hv-mbw');
    this.canvas = this.querySelector('.hv-mb');
    this.ctx = this.canvas?.getContext('2d');
    this.cut = this.querySelector('.hv-cut');
    this.phrases = [...(this.querySelector('.hv-ph')?.children ?? [])];
    this.line2 = this.querySelector('.hv-l2');
    this.sub1 = this.querySelector('.hv-sub-1');
    this.sub2 = this.querySelector('.hv-sub-2');
    this.bottomShade = this.querySelector('.hv-shade-b');
    this.phraseIndex = 0;
    this.lastFrame = -1;
    this.played = false;

    this.fit();
    window.addEventListener('resize', () => this.fit(), { signal: this.abort.signal });

    this.frames = this.loadFrames();
    this.observeFirstView();
  }

  disconnectedCallback() {
    this.abort?.abort();
    this.observer?.disconnect();
    if (this.raf) cancelAnimationFrame(this.raf);
    clearTimeout(this.flickerTimer);
  }

  /** Scale the fixed 1920×1080 stage to cover-fit the viewport box */
  fit() {
    this.style.setProperty('--hvz', String(Math.min(this.clientWidth / 1920, this.clientHeight / 1080)));
  }

  /**
   * Preload the sequence. The prototype's 36 frames are only 9 distinct images
   * (each held for 5 frames), so logical frame k maps onto one of the unique files.
   * Small screens load the 1080px-wide variants.
   * @returns {HTMLImageElement[]}
   */
  loadFrames() {
    const source = this.mobileQuery.matches ? this.dataset.framesMobile : this.dataset.frames;
    /** @type {string[]} */
    const urls = JSON.parse(source || '[]');
    const unique = urls.map((url) => {
      const image = new Image();
      image.src = url;
      return image;
    });
    const last = TokkeyStoryboardHero.FRAME_COUNT - 1;
    return Array.from({ length: TokkeyStoryboardHero.FRAME_COUNT }, (_, k) => {
      if (k === last) return unique[8];
      if (k === last - 1) return unique[7];
      return unique[Math.floor(k / 5)];
    });
  }

  /** Start the timeline the first time a third of the hero is visible */
  observeFirstView() {
    this.observer = new IntersectionObserver(
      (entries) => {
        if (this.played || !entries.some((entry) => entry.isIntersecting)) return;
        this.played = true;
        this.observer.disconnect();
        const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
        fontsReady.then(() => setTimeout(() => this.play(), 300));
      },
      { threshold: 0.35 }
    );
    this.observer.observe(this);
  }

  play() {
    let start = null;
    const loop = (now) => {
      if (start === null) start = now;
      const t = this.reducedMotion
        ? TokkeyStoryboardHero.DURATION
        : Math.min(TokkeyStoryboardHero.DURATION, (now - start) / 1000);
      this.render(t);
      if (t < TokkeyStoryboardHero.DURATION) this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Draw logical frame k of the lid-open sequence onto the canvas once it has loaded */
  drawFrame(k) {
    const index = Math.max(0, Math.min(TokkeyStoryboardHero.FRAME_COUNT - 1, k));
    const image = this.frames[index];
    if (index === this.lastFrame || !image.complete || !image.naturalWidth || !this.ctx) return;
    this.lastFrame = index;
    this.ctx.clearRect(0, 0, 1920, 1080);
    this.ctx.drawImage(image, 0, 0, 1920, 1080);
  }

  /** Swap the visible headline phrase */
  showPhrase(i) {
    if (i === this.phraseIndex || !this.phrases[i]) return;
    this.phrases[this.phraseIndex].classList.remove('on');
    this.phraseIndex = i;
    this.phrases[i].classList.add('on');
    if (i === 4) this.flicker(this.querySelector('.hv-intl'));
  }

  /** Cycle an element through the flicker typefaces, then fall back to its CSS face */
  flicker(el) {
    if (this.reducedMotion || !el) return;
    const faces = TokkeyStoryboardHero.FLICKER_FACES;
    let i = 0;
    const next = () => {
      if (i >= faces.length) {
        el.removeAttribute('style');
        return;
      }
      const [family, style, weight, spacing] = faces[i];
      el.style.fontFamily = `${family},serif`;
      el.style.fontStyle = style;
      el.style.fontWeight = String(weight);
      el.style.letterSpacing = spacing;
      this.flickerTimer = setTimeout(next, TokkeyStoryboardHero.FLICKER_DURATIONS[i++]);
    };
    next();
  }

  /** Apply the storyboard state at time t (seconds) */
  render(t) {
    const { KEY, MID, FIN } = TokkeyStoryboardHero;
    const clamp = (v) => Math.max(0, Math.min(1, v));
    const seg = (a, b) => clamp((t - a) / (b - a));
    const lerp = (a, b, k) => a + (b - a) * k;
    const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
    const out = (k) => 1 - Math.pow(1 - k, 3);

    this.showPhrase(t < 1.2 ? 0 : t < 2.4 ? 1 : t < 3.6 ? 2 : t < 6 ? 3 : 4);
    this.drawFrame(t > 2.5 ? 35 : Math.round(ease(seg(0.2, 2.4)) * 34));

    // Push in on the key, then dissolve the MacBook
    const push = ease(seg(1.9, 3.9));
    this.mbw.style.transform = `translate(${(MID.x - KEY.x) * push}px,${(MID.y - KEY.y) * push}px) scale(${lerp(1, 2.2, push)})`;
    const fade = ease(seg(3.3, 4.5));
    this.mbw.style.opacity = String(1 - fade);
    this.mbw.style.filter = fade > 0.01 ? `blur(${fade * 8}px)` : 'none';

    // Mac mini settles in with a soft edge mask
    const settle = ease(seg(3.6, 6.2));
    this.cut.style.opacity = String(fade);
    this.cut.style.transform = `translate(${(MID.x - FIN.x) * (1 - settle)}px,${(MID.y - FIN.y) * (1 - settle)}px) scale(${lerp(0.66, 1, settle)})`;
    this.cut.style.filter = `brightness(${lerp(0.4, 1, ease(seg(4.2, 6.4)))})${fade < 0.99 ? ` blur(${(1 - fade) * 8}px)` : ''}`;
    const edge = (1 - settle) * 22;
    if (edge > 0.2) {
      const mask = `linear-gradient(to left,transparent 0,#000 ${edge}%),linear-gradient(to top,transparent 0,#000 ${edge * 1.4}%)`;
      this.cut.style.webkitMaskImage = mask;
      this.cut.style.maskImage = mask;
      this.cut.style.webkitMaskComposite = 'source-in';
      this.cut.style.maskComposite = 'intersect';
    } else {
      this.cut.style.webkitMaskImage = 'none';
      this.cut.style.maskImage = 'none';
    }

    // Second headline line out, bottom shade and sub-lines in
    this.line2.style.opacity = String(1 - ease(seg(5.7, 6.2)));
    this.bottomShade.style.opacity = String(ease(seg(7, 8)));
    const a = out(seg(7.9, 8.8));
    const b = out(seg(8.4, 9.4));
    this.sub1.style.opacity = String(a);
    this.sub1.style.transform = `translateY(${lerp(18, 0, a)}px)`;
    this.sub2.style.opacity = String(b);
    this.sub2.style.transform = `translateY(${lerp(18, 0, b)}px)`;
  }
}

if (!customElements.get('tokkey-storyboard-hero')) {
  customElements.define('tokkey-storyboard-hero', TokkeyStoryboardHero);
}
