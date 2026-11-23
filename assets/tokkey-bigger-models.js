/**
 * "Bigger models on the same Mac" section, ported from the prototype homepage v3 (.s2-sec).
 * A deck of model cards is laid out on a 1920px canvas scaled by --z. The memory toggle (16GB / 48GB)
 * swaps the visible set; on desktop the section pins and scrolling past its midpoint switches to 48GB.
 * Below 1024px the same fan is scaled down onto the left of the laptop, with its horizontal step tightened.
 * While visible, the front card rotates to the back every second until the visitor interacts.
 */
class TokkeyBiggerModels extends HTMLElement {
  /** Figma geometry: 16GB = 3 cards stepped 170/80 from (179,400); 48GB = 5 cards stepped 100/40 from (181,400) */
  static SETS = [
    { order: ['q9', 'mc', 'q35'], x: 179, y: 400, dx: 170, dy: 80 },
    { order: ['q27', 'q35', 'mc', 'fl', 'q122'], x: 181, y: 400, dx: 100, dy: 40 },
  ];

  /** Mobile fan: horizontal step factor, left inset (px), the share of the width the fan may take, and its max scale */
  static MOBILE = { spread: 0.5, inset: 16, share: 0.5, maxScale: 0.7 };

  /** Unscaled size of a card, and the largest fan extent (48GB set) on the desktop canvas */
  static CARD = 320;
  static FAN = { x: 400, y: 160 };

  connectedCallback() {
    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.mobileQuery = matchMedia('(max-width: 1023px)');
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.deck = this.querySelector('.s2-deck');
    this.buttons = [...this.querySelectorAll('.s2-seg button')];
    this.thumb = this.querySelector('.s2th');
    this.rolls = [...this.querySelectorAll('.s2-roll')];
    this.hint = this.querySelector('.s2hint');
    /** @type {Record<string, HTMLElement>} */
    this.cards = {};
    for (const card of this.querySelectorAll('.s2-card')) this.cards[card.dataset.key] = card;

    this.current = 0;
    this.hovered = null;
    this.lastPos = {};
    this.rotation = [0, 0];
    this.open = false;
    this.swiped = false;
    this.pulse = false;
    this.auto = !this.reducedMotion;
    this.visible = false;
    this.paused = false;
    this.scrollMemory = -1;
    this.dragStartX = null;

    // Cards new to the 48GB set enter from behind the 16GB front card
    const [small, large] = TokkeyBiggerModels.SETS;
    for (const key of large.order) {
      if (!small.order.includes(key)) this.lastPos[key] = { x: small.x + small.dx * 2, y: small.y + small.dy * 2 };
    }

    this.bindCards(signal);
    this.buttons.forEach((button, i) =>
      button.addEventListener(
        'click',
        () => {
          this.stopAuto();
          this.hovered = null;
          this.setMemory(i, true);
        },
        { signal }
      )
    );
    this.bindSwipe(signal);
    this.deck.addEventListener('mouseenter', () => this.pauseAuto(), { signal });
    this.deck.addEventListener('mouseleave', () => this.resumeAuto(600), { signal });

    window.addEventListener('resize', () => this.fit(), { signal });
    window.addEventListener('scroll', () => this.onScroll(), { passive: true, signal });
    this.fit();
    document.fonts?.ready.then(() => this.isConnected && this.fit());
    // Geist can arrive after fonts.ready (the Google Fonts @import starts late); re-measure the rolling words
    // whenever a face finishes loading so a slot sized with the fallback font doesn't clip "35B" / "16GB"
    document.fonts?.addEventListener('loadingdone', () => this.fit(), { signal });
    this.scrollCheck = setTimeout(() => this.onScroll(), 0);

    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          this.visible = entry.isIntersecting;
          if (this.visible) {
            this.scheduleTick(800);
          } else {
            clearTimeout(this.timer);
            if (this.auto) {
              this.hovered = null;
              this.place();
            }
          }
        }
      },
      { threshold: 0.45 }
    );
    this.observer.observe(this);
  }

  disconnectedCallback() {
    this.abort?.abort();
    this.observer?.disconnect();
    clearTimeout(this.timer);
    clearTimeout(this.pulseTimer);
    clearTimeout(this.scrollCheck);
  }

  /** Hover lifts a card; click / Enter brings it to the front, or flips the front card to its specs */
  bindCards(signal) {
    for (const [key, card] of Object.entries(this.cards)) {
      card.addEventListener(
        'mouseenter',
        () => {
          if (card.classList.contains('s2off')) return;
          this.hovered = key;
          this.place();
        },
        { signal }
      );
      card.addEventListener(
        'mouseleave',
        () => {
          if (this.hovered !== key) return;
          this.hovered = null;
          this.place();
        },
        { signal }
      );
      card.addEventListener('click', () => this.pick(key), { signal });
      card.addEventListener(
        'keydown',
        (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          this.pick(key);
        },
        { signal }
      );
    }
  }

  /** Horizontal drag across the deck switches memory size (desktop only) */
  bindSwipe(signal) {
    this.deck.addEventListener(
      'pointerdown',
      (event) => {
        if (this.mobileQuery.matches) return;
        this.dragStartX = event.clientX;
        this.swiped = false;
      },
      { signal }
    );
    window.addEventListener(
      'pointerup',
      (event) => {
        if (this.dragStartX === null) return;
        const distance = event.clientX - this.dragStartX;
        this.dragStartX = null;
        if (Math.abs(distance) <= 40) return;
        this.swiped = true;
        this.stopAuto();
        this.hovered = null;
        this.setMemory(distance < 0 ? 1 : 0, true);
        setTimeout(() => (this.swiped = false), 0);
      },
      { signal }
    );
  }

  pick(key) {
    const card = this.cards[key];
    if (card.classList.contains('s2off') || this.swiped) return;
    this.stopAuto();
    const order = this.sequence();
    if (order[order.length - 1] === key) {
      this.open = !this.open;
    } else {
      const base = TokkeyBiggerModels.SETS[this.current].order;
      const n = base.length;
      this.rotation[this.current] = (n - 1 - base.indexOf(key) + n) % n;
      this.open = true;
    }
    this.hovered = null;
    this.place();
  }

  /** Current card order for the active set; the last entry is the front card */
  sequence() {
    const { order } = TokkeyBiggerModels.SETS[this.current];
    const n = order.length;
    const r = ((this.rotation[this.current] % n) + n) % n;
    return order.slice(n - r).concat(order.slice(0, n - r));
  }

  /** Position every card for the current state */
  place() {
    const set = TokkeyBiggerModels.SETS[this.current];
    const order = this.sequence();
    for (const [key, card] of Object.entries(this.cards)) {
      const i = order.indexOf(key);
      if (i < 0) {
        card.classList.add('s2off');
        card.classList.remove('s2hov');
        card.tabIndex = -1;
        const p = this.lastPos[key] || { x: set.x, y: set.y };
        card.style.transform = this.transformAt(p.x + 60, p.y + 30);
        continue;
      }
      const x = set.x + set.dx * i;
      const y = set.y + set.dy * i;
      const lift = this.hovered === key ? -28 : 0;
      const front = i === order.length - 1;
      this.lastPos[key] = { x, y };
      card.classList.remove('s2off');
      card.classList.toggle('s2hov', this.hovered === key);
      card.classList.toggle('s2open', front && this.open);
      card.tabIndex = 0;
      card.setAttribute('aria-expanded', String(front && this.open));
      card.style.zIndex = String(i + 1);
      card.style.transform = this.transformAt(x, y + lift);
    }
    this.classList.toggle('lit', this.hovered !== null || this.pulse);
  }

  /**
   * Turn a card position on the 1920px desktop canvas into a CSS transform. On mobile the fan is scaled
   * by this.mobileScale and re-anchored to the deck's left edge, vertically centred.
   */
  transformAt(x, y) {
    if (!this.mobileQuery.matches) return `translate(${x}px,${y}px)`;
    const { MOBILE, SETS, CARD, FAN } = TokkeyBiggerModels;
    const s = this.mobileScale;
    const left = MOBILE.inset + (x - SETS[0].x) * MOBILE.spread * s;
    const top = (this.deck.clientHeight - (CARD + FAN.y) * s) / 2 + (y - SETS[0].y) * s;
    return `translate(${left}px,${top}px) scale(${s})`;
  }

  /** Switch between the 16GB (0) and 48GB (1) sets */
  setMemory(i, user = false) {
    if (i === this.current && !user) return;
    if (i !== this.current) this.open = false;
    this.current = i;
    this.dataset.s = String(i);

    // Size each rolling word slot to the word it is about to show
    const zoom = this.mobileQuery.matches ? 1 : parseFloat(getComputedStyle(this).getPropertyValue('--z')) || 1;
    for (const roll of this.rolls) {
      const word = roll.querySelectorAll('b')[i];
      roll.style.width = `${Math.ceil(word.getBoundingClientRect().width / zoom)}px`;
    }

    this.buttons.forEach((button, j) => button.setAttribute('aria-pressed', String(j === i)));
    const button = this.buttons[i];
    this.thumb.style.width = `${button.offsetWidth}px`;
    this.thumb.style.transform = `translateX(${button.offsetLeft - 4}px)`;

    this.pulse = true;
    clearTimeout(this.pulseTimer);
    this.pulseTimer = setTimeout(() => {
      this.pulse = false;
      this.place();
    }, 1400);
    this.place();
  }

  /** Scale the 1920px canvas to the viewport */
  fit() {
    this.style.setProperty('--z', String(Math.min(1, document.documentElement.clientWidth / 1920)));
    const { MOBILE, CARD, FAN } = TokkeyBiggerModels;
    this.mobileScale = Math.min(MOBILE.maxScale, (this.deck.clientWidth * MOBILE.share) / (CARD + FAN.x * MOBILE.spread));
    this.setMemory(this.current, true);
    this.pulse = false;
    this.place();
  }

  /** Desktop pin: first half of the scroll run shows 16GB, second half 48GB */
  onScroll() {
    if (this.mobileQuery.matches) return;
    const rect = this.getBoundingClientRect();
    const run = rect.height - innerHeight;
    if (run <= 0) return;
    const want = -rect.top / run > 0.5 ? 1 : 0;
    if (want === this.scrollMemory) return;
    this.scrollMemory = want;
    this.auto = !this.reducedMotion;
    if (want !== this.current) {
      this.rotation[want] = 0;
      this.open = false;
      this.hovered = null;
      this.setMemory(want);
    }
    if (this.hint) this.hint.textContent = want ? this.hint.dataset.up : this.hint.dataset.down;
    this.scheduleTick(1200);
  }

  /** Autoplay step: front card goes to the back */
  tick() {
    clearTimeout(this.timer);
    if (!this.auto || !this.visible || this.paused) return;
    this.rotation[this.current]++;
    this.open = false;
    this.hovered = null;
    this.place();
    this.timer = setTimeout(() => this.tick(), 1000);
  }

  scheduleTick(delay) {
    clearTimeout(this.timer);
    if (this.auto && this.visible && !this.paused) this.timer = setTimeout(() => this.tick(), delay);
  }

  stopAuto() {
    this.auto = false;
    clearTimeout(this.timer);
  }

  pauseAuto() {
    this.paused = true;
    clearTimeout(this.timer);
  }

  resumeAuto(delay) {
    this.paused = false;
    this.scheduleTick(delay);
  }
}

if (!customElements.get('tokkey-bigger-models')) {
  customElements.define('tokkey-bigger-models', TokkeyBiggerModels);
}
