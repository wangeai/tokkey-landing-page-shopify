/**
 * "Coordinated local AI" section, ported from the prototype homepage v3 (.c6-sec).
 * On first view the board intro video plays once; when it ends (or fails, or after 9s) the section
 * steps through `done` → `lit` → `loop`, which CSS uses to reveal the callouts and start the loops.
 * Phones and reduced motion skip the video. Animations pause while the section is off screen.
 */
class TokkeyCoordinatedAi extends HTMLElement {
  connectedCallback() {
    this.abort = new AbortController();
    this.section = this.querySelector('.c6-sec');
    this.video = this.querySelector('#c6v');
    if (!this.section) return;

    this.started = false;
    this.finished = false;
    this.timers = [];
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.mobileQuery = matchMedia('(max-width: 1023px)');

    window.addEventListener('resize', () => this.fit(), { signal: this.abort.signal });
    this.fit();

    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) this.start();
          this.section.classList.toggle('paused', !entry.isIntersecting);
        }
      },
      { threshold: 0.35 }
    );
    this.observer.observe(this.section);

    // Start fetching the video a screen early so it plays instantly
    this.preloader = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        this.preloader.disconnect();
        if (this.playsVideo() && !this.video.getAttribute('src')) {
          this.video.src = this.video.dataset.src;
          this.video.load();
        }
      },
      { rootMargin: '800px 0px' }
    );
    this.preloader.observe(this.section);
  }

  disconnectedCallback() {
    this.abort?.abort();
    this.observer?.disconnect();
    this.preloader?.disconnect();
    this.timers?.forEach(clearTimeout);
  }

  /** The intro video runs on desktop only, and not with reduced motion */
  playsVideo() {
    return Boolean(this.video) && !this.reducedMotion && !this.mobileQuery.matches;
  }

  start() {
    if (this.started) return;
    this.started = true;
    if (!this.playsVideo()) {
      this.finish();
      return;
    }
    const signal = this.abort.signal;
    if (!this.video.getAttribute('src')) this.video.src = this.video.dataset.src;
    this.video.addEventListener('ended', () => this.finish(), { once: true, signal });
    this.video.addEventListener(
      'timeupdate',
      () => {
        if (this.video.duration && this.video.currentTime > this.video.duration - 0.9) this.finish();
      },
      { signal }
    );
    this.video.play().catch(() => this.finish());
    this.timers.push(setTimeout(() => this.finish(), 9000));
  }

  /** Reveal the end state, then light the flow and start the loops */
  finish() {
    if (this.finished) return;
    this.finished = true;
    this.section.classList.add('done');
    this.timers.push(setTimeout(() => this.section.classList.add('lit'), 1700));
    this.timers.push(setTimeout(() => this.section.classList.add('loop'), 3200));
  }

  /** Scale the 1920px canvas to the viewport */
  fit() {
    this.section.style.setProperty('--z', String(Math.min(1, document.documentElement.clientWidth / 1920)));
  }
}

if (!customElements.get('tokkey-coordinated-ai')) {
  customElements.define('tokkey-coordinated-ai', TokkeyCoordinatedAi);
}
