/**
 * "Meet Tokkey — the film", ported from the prototype homepage v3 (.fm-sec).
 * Once the section is on screen the YouTube film starts muted inside the card. Clicking the card grows
 * the "Tokkey film" player from the card to full screen and plays the film with sound; Close or Escape
 * shrinks it back into the card and returns focus.
 */
class TokkeyFilm extends HTMLElement {
  /** Duration of the grow / shrink transition between card and full screen, in ms */
  static TRANSITION = 720;

  connectedCallback() {
    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.section = this.querySelector('.fm-sec');
    this.card = this.querySelector('#fmCard');
    this.player = this.querySelector('#fmFs');
    this.closeButton = this.querySelector('#fmClose');
    this.embed = this.querySelector('#fmYt');
    this.preview = this.querySelector('#fmCv');
    if (!this.section || !this.card || !this.player) return;

    this.videoId = this.embed?.dataset.yt;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    window.addEventListener('resize', () => this.fit(), { signal });
    this.fit();

    // Hover / keyboard focus reveals the play button
    const hover = (on) => this.section.classList.toggle('hov', on);
    this.card.addEventListener('mouseenter', () => hover(true), { signal });
    this.card.addEventListener('mouseleave', () => hover(false), { signal });
    this.card.addEventListener('focus', () => hover(this.card.matches(':focus-visible')), { signal });
    this.card.addEventListener('blur', () => hover(false), { signal });

    this.card.addEventListener('click', () => this.open(), { signal });
    this.closeButton?.addEventListener('click', () => this.close(), { signal });
    document.addEventListener(
      'keydown',
      (event) => {
        if (!this.player.hidden && event.key === 'Escape') this.close();
      },
      { signal }
    );

    this.startPreviewWhenVisible();
  }

  disconnectedCallback() {
    this.abort?.abort();
    this.observer?.disconnect();
    clearTimeout(this.timer);
    document.body.classList.remove('fm-lock');
  }

  /** YouTube embed URL; the inline preview is muted and loops */
  embedUrl(preview) {
    const params = preview
      ? `autoplay=1&mute=1&loop=1&playlist=${this.videoId}&controls=0&modestbranding=1&playsinline=1&rel=0`
      : 'autoplay=1&rel=0&modestbranding=1&playsinline=1';
    return `https://www.youtube-nocookie.com/embed/${this.videoId}?${params}`;
  }

  /** The cover holds for a beat after the section scrolls in, then the film plays muted in the card */
  startPreviewWhenVisible() {
    if (!this.preview || !this.videoId || this.reducedMotion) return;
    this.observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        this.observer.disconnect();
        this.timer = setTimeout(() => {
          const frame = document.createElement('iframe');
          frame.src = this.embedUrl(true);
          frame.title = 'Tokkey film preview';
          frame.allow = 'autoplay; encrypted-media';
          frame.tabIndex = -1;
          frame.addEventListener('load', () => setTimeout(() => this.preview.classList.add('on'), 1200), { once: true });
          this.preview.replaceChildren(frame);
        }, 1500);
      },
      { threshold: 0.4 }
    );
    this.observer.observe(this.section);
  }

  /** The card's current box, used as the player's start / end geometry */
  cardBox() {
    const rect = this.card.getBoundingClientRect();
    const zoom = parseFloat(getComputedStyle(this.section).getPropertyValue('--z')) || 1;
    return { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, borderRadius: `${24 * zoom}px` };
  }

  setBox(box) {
    Object.assign(this.player.style, box);
  }

  /** Grow the player from the card to full screen, then start the film with sound */
  open() {
    const full = { left: '0px', top: '0px', width: '100vw', height: '100vh', borderRadius: '0px' };
    this.section.classList.remove('hov');
    document.body.classList.add('fm-lock');
    this.setBox(this.cardBox());
    this.player.hidden = false;
    void this.player.offsetWidth;

    if (this.reducedMotion) {
      this.setBox(full);
      this.player.classList.add('open');
      this.play();
      return;
    }
    requestAnimationFrame(() => {
      this.setBox(full);
      this.player.classList.add('open');
    });
    this.timer = setTimeout(() => this.play(), 750);
  }

  play() {
    this.player.classList.add('play');
    if (this.embed && this.videoId) {
      const frame = document.createElement('iframe');
      frame.src = this.embedUrl(false);
      frame.title = 'Tokkey film';
      frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      frame.allowFullscreen = true;
      this.embed.replaceChildren(frame);
      this.player.classList.add('has-yt');
    }
    this.closeButton?.focus();
  }

  /** Stop the film and shrink the player back into the card */
  close() {
    clearTimeout(this.timer);
    this.embed?.replaceChildren();
    this.player.classList.remove('open', 'play', 'has-yt');
    const done = () => {
      this.player.hidden = true;
      document.body.classList.remove('fm-lock');
      this.card.focus({ preventScroll: true });
    };
    if (this.reducedMotion) {
      done();
      return;
    }
    this.setBox(this.cardBox());
    this.timer = setTimeout(done, TokkeyFilm.TRANSITION);
  }

  /** Scale the 1920px canvas to the viewport */
  fit() {
    this.section.style.setProperty('--z', String(Math.min(1, document.documentElement.clientWidth / 1920)));
  }
}

if (!customElements.get('tokkey-film')) {
  customElements.define('tokkey-film', TokkeyFilm);
}
