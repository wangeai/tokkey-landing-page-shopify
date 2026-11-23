/**
 * "Pay once" cost compare, ported from the prototype homepage v3 (.s3-sec).
 * The usage slider (log scale, 10M–1B tokens) and cloud-model chips drive the cloud API cost,
 * the yearly total, the price bar and the payback estimate; the headline meter ticks tokens at
 * the chosen monthly rate (sped up 60×) while the section is visible.
 */
class TokkeyCostCompare extends HTMLElement {
  /** PLACEHOLDER pricing from the prototype: blended $ per 1M tokens (70% in / 30% out). Verify before publishing. */
  static MODELS = [
    ['GPT-6.2 Astra', 17.6],
    ['Claude Opus 5.5', 12],
    ['Gemini 3.1 Pro', 6.5],
  ];

  /** PLACEHOLDER one-time Tokkey price, used for the payback estimate */
  static TOKKEY_PRICE = 235;

  /** Starting value of the headline token meter */
  static METER_START = 1284019;

  connectedCallback() {
    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.section = this.querySelector('.s3-sec');
    this.range = this.querySelector('#s3rng');
    this.chips = [...this.querySelectorAll('.s3-chips button')];
    if (!this.section || !this.range) return;

    this.model = 0;
    this.shownCost = null;
    this.meterCount = TokkeyCostCompare.METER_START;
    this.meterTime = 0;
    this.visible = false;

    this.range.addEventListener('input', () => this.update(), { signal });
    this.chips.forEach((chip, i) =>
      chip.addEventListener(
        'click',
        () => {
          this.model = i;
          this.chips.forEach((c, j) => c.setAttribute('aria-pressed', String(j === i)));
          this.update();
        },
        { signal }
      )
    );
    window.addEventListener('resize', () => this.fit(), { signal });
    this.fit();
    this.update();

    this.observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => (this.visible = entry.isIntersecting)),
      { threshold: 0.2 }
    );
    this.observer.observe(this.section);
    this.startMeter();
  }

  disconnectedCallback() {
    this.abort?.abort();
    this.observer?.disconnect();
    cancelAnimationFrame(this.meterFrame);
    cancelAnimationFrame(this.tweenFrame);
  }

  /** Slider position (0–1000) to millions of tokens, 10M..1B on a log scale */
  tokens(value) {
    return Math.round(10 * Math.pow(100, value / 1000));
  }

  /** Round a token count to a friendly label */
  label(millions) {
    if (millions >= 1000) return '1B';
    const rounded = millions >= 100 ? Math.round(millions / 10) * 10 : millions >= 20 ? Math.round(millions / 5) * 5 : millions;
    return `${rounded}M`;
  }

  usd(n) {
    return `$${Math.round(n).toLocaleString('en-US')}`;
  }

  /** How long the one-time price takes to pay for itself at a monthly cloud cost */
  payback(monthly) {
    const days = TokkeyCostCompare.TOKKEY_PRICE / (monthly / 30);
    if (days < 1.5) return 'about a day';
    if (days < 14) return `about ${Math.round(days)} days`;
    if (days < 60) return `about ${Math.round(days / 7)} weeks`;
    return `about ${Math.round(days / 30)} months`;
  }

  /** Recompute every figure from the slider and selected model */
  update() {
    const value = Number(this.range.value);
    const label = this.label(this.tokens(value));
    const millions = label === '1B' ? 1000 : parseInt(label, 10);
    const [modelName, rate] = TokkeyCostCompare.MODELS[this.model];
    const monthly = millions * rate;
    const set = (id, text) => {
      const el = this.querySelector(`#${id}`);
      if (el) el.textContent = text;
    };

    this.range.style.setProperty('--f', `${value / 10}%`);
    this.range.setAttribute('aria-valuetext', `${label} tokens`);
    set('s3uv', `${label} tokens`);
    set('s3cn', `Cloud API · ${modelName}`);
    set('s3for', `for ${label} tokens this month`);
    set('s3yr', `${this.usd(monthly * 12)} over 12 months at list price.`);
    set('s3pb', this.payback(monthly));

    const bar = this.querySelector('#s3bb');
    if (bar) {
      const max = 1000 * Math.max(...TokkeyCostCompare.MODELS.map((m) => m[1]));
      bar.style.height = `${Math.round(24 + 220 * Math.sqrt(monthly / max))}px`;
      set('s3bp', `$${rate.toFixed(2)} / 1M`);
    }
    this.tweenCost(monthly);
  }

  /** Ease the big cost figure from its shown value to the new one */
  tweenCost(to) {
    const cost = this.querySelector('#s3cost');
    if (!cost) return;
    const from = this.shownCost === null ? to : this.shownCost;
    const start = performance.now();
    this.shownCost = to;
    cancelAnimationFrame(this.tweenFrame);
    const step = (now) => {
      const k = Math.min(1, (now - start) / 450);
      const eased = 1 - Math.pow(1 - k, 3);
      cost.textContent = this.usd(from + (to - from) * eased);
      if (k < 1) this.tweenFrame = requestAnimationFrame(step);
    };
    this.tweenFrame = requestAnimationFrame(step);
  }

  /** Headline meter: tokens tick at the chosen monthly rate, sped up 60× */
  startMeter() {
    const meter = this.querySelector('#s3mn');
    if (!meter) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      meter.textContent = TokkeyCostCompare.METER_START.toLocaleString('en-US');
      return;
    }
    const tick = (now) => {
      this.meterFrame = requestAnimationFrame(tick);
      if (!this.visible) {
        this.meterTime = now;
        return;
      }
      const dt = this.meterTime ? Math.min(100, now - this.meterTime) : 0;
      this.meterTime = now;
      const perMonth = this.tokens(Number(this.range.value)) * 1e6;
      this.meterCount += ((perMonth / (30 * 24 * 3600)) * 60 * dt) / 1000;
      if (this.meterCount > 99999999) this.meterCount = TokkeyCostCompare.METER_START;
      meter.textContent = Math.floor(this.meterCount).toLocaleString('en-US');
    };
    this.meterFrame = requestAnimationFrame(tick);
  }

  /** Scale the 1920px canvas to the viewport */
  fit() {
    this.section.style.setProperty('--z', String(Math.min(1, document.documentElement.clientWidth / 1920)));
  }
}

if (!customElements.get('tokkey-cost-compare')) {
  customElements.define('tokkey-cost-compare', TokkeyCostCompare);
}
