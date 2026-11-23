/**
 * "Features" section, ported from the prototype homepage v3 (.ft-sec).
 * A tab rail of five features beside a MacBook screen mock. Selecting a tab shows its scene and plays
 * a short timeline that resets the scene to a start state and animates toward the Figma end state
 * held in the markup. Tabs auto-advance every 5s while the section is visible.
 */
class TokkeyFeatures extends HTMLElement {
  /** Time each tab stays selected while auto-advancing, in ms */
  static DURATION = 5000;

  connectedCallback() {
    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.section = this.querySelector('.ft-sec');
    this.tabs = [...this.querySelectorAll('.ft-sw')];
    this.scenes = [...this.querySelectorAll('.ft-sc')];
    this.tabName = this.querySelector('#ftTabName');
    if (!this.section || this.tabs.length === 0) return;

    this.current = -1;
    this.visible = false;
    this.seen = false;
    this.effectTimers = [];
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.auto = !this.reducedMotion;
    if (this.auto) this.section.classList.add('auto');
    this.section.style.setProperty('--dur', `${TokkeyFeatures.DURATION}ms`);

    // Stagger each scene's pieces
    for (const scene of this.scenes) {
      [...scene.querySelectorAll('.ft-a, .ft-cap')].forEach((el, i) => el.style.setProperty('--d', `${0.08 + i * 0.09}s`));
    }

    this.tabs.forEach((tab, i) => {
      tab.addEventListener(
        'click',
        () => {
          this.arm();
          this.show(i);
        },
        { signal }
      );
      tab.addEventListener('keydown', (event) => this.onKeydown(event), { signal });
    });

    window.addEventListener('resize', () => this.fit(), { signal });
    this.fit();
    this.show(0);

    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          this.visible = entry.isIntersecting;
          if (this.visible) {
            if (!this.seen) {
              this.seen = true;
              this.play(this.current);
            }
            this.arm();
          } else {
            clearTimeout(this.timer);
          }
        }
      },
      { threshold: 0.35 }
    );
    this.observer.observe(this.section);
  }

  disconnectedCallback() {
    this.abort?.abort();
    this.observer?.disconnect();
    clearTimeout(this.timer);
    this.effectTimers?.forEach(clearTimeout);
  }

  /** Arrow keys move between tabs */
  onKeydown(event) {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    this.arm();
    const next = (this.current + step + this.tabs.length) % this.tabs.length;
    this.show(next);
    this.tabs[next].focus();
  }

  /** Select tab i and reveal its scene */
  show(i) {
    if (i === this.current) return;
    this.current = i;
    this.play(i);
    this.tabs.forEach((tab, j) => {
      tab.setAttribute('aria-selected', String(j === i));
      tab.tabIndex = j === i ? 0 : -1;
      // Restart the progress bar animation
      const bar = tab.querySelector('u');
      if (bar) {
        bar.style.animation = 'none';
        void bar.offsetHeight;
        bar.style.animation = '';
      }
    });
    this.scenes.forEach((scene, j) => scene.classList.toggle('f-on', j === i));
    if (this.tabName) this.tabName.textContent = this.tabs[i].querySelector('b')?.textContent ?? '';
  }

  /** Schedule the next auto-advance */
  arm() {
    clearTimeout(this.timer);
    if (!this.auto || !this.visible) return;
    this.timer = setTimeout(() => {
      this.show((this.current + 1) % this.tabs.length);
      this.arm();
    }, TokkeyFeatures.DURATION);
  }

  /** Run scene i's timeline: a list of [delay ms, step] pairs */
  play(i) {
    this.effectTimers.forEach(clearTimeout);
    this.effectTimers = [];
    const scene = this.scenes[i];
    if (this.reducedMotion || !scene) return;
    const effects = [
      () => this.routerTimeline(scene),
      () => this.chatTimeline(scene),
      () => this.agentHubTimeline(scene),
      () => this.workflowTimeline(scene),
      () => this.sameComputerTimeline(scene),
    ];
    for (const [delay, step] of effects[i]()) this.effectTimers.push(setTimeout(step, delay));
  }

  /** 01 Router: a packet drops from the task to the decision, which picks the local option */
  routerTimeline(scene) {
    const local = scene.querySelector('.rt-loc');
    const decision = scene.querySelector('.rt-dec');
    const packet = scene.querySelector('.rt-pk');
    local.classList.add('rt-dim');
    packet.classList.remove('go');
    decision.classList.remove('pulse');
    void packet.offsetWidth;
    return [
      [350, () => packet.classList.add('go')],
      [650, () => decision.classList.add('pulse')],
      [1650, () => local.classList.remove('rt-dim')],
    ];
  }

  /** 02 Private Chat: type a message, send it, count up the token panel, open the menu */
  chatTimeline(scene) {
    const chat = scene.querySelector('.pcw');
    const text = scene.querySelector('.pc-tx');
    const send = scene.querySelector('.pc-go');
    const ring = scene.querySelector('.pc-send');
    const add = scene.querySelector('.pc-add');
    const numbers = [...scene.querySelectorAll('.pc-tr b')];
    const message = 'Summarize this contract for me.';

    chat.classList.add('m0', 't0');
    text.textContent = '';
    text.classList.remove('sent');
    ring.classList.remove('go');
    numbers.forEach((n) => (n.textContent = '0'));

    const steps = [];
    for (let k = 1; k <= message.length; k++) steps.push([450 + k * 38, () => (text.textContent = message.slice(0, k))]);
    const typed = 450 + message.length * 38;
    steps.push(
      [typed + 300, () => {
        send.classList.add('press');
        ring.classList.add('go');
      }],
      [typed + 450, () => {
        send.classList.remove('press');
        text.classList.add('sent');
      }],
      [typed + 650, () => chat.classList.remove('t0')]
    );
    for (let k = 1; k <= 16; k++) {
      steps.push([typed + 700 + k * 45, () => numbers.forEach((n) => (n.textContent = String(Math.round((Number(n.dataset.v) * k) / 16))))]);
    }
    steps.push(
      [typed + 1750, () => add.classList.add('press')],
      [typed + 1900, () => {
        add.classList.remove('press');
        chat.classList.remove('m0');
      }]
    );
    return steps;
  }

  /** 03 Agent Hub: the assistant types, a reply lands, then the first agent starts */
  agentHubTimeline(scene) {
    const typing = scene.querySelector('.ah-typ');
    const reply = scene.querySelector('.ah-me');
    const row = scene.querySelector('.ah-row');
    const button = row.querySelector('.ah-r button');
    const meta = row.querySelector('.ah-l span');

    reply.classList.add('hide');
    typing.classList.remove('in');
    row.classList.remove('live');
    button.className = 'f-go';
    button.textContent = 'Start';
    meta.textContent = '5.8 GB · Downloaded · balanced local assistant';
    return [
      [600, () => typing.classList.add('in')],
      [1600, () => {
        typing.classList.remove('in');
        reply.classList.remove('hide');
      }],
      [2300, () => button.classList.add('press')],
      [2480, () => {
        button.className = 'f-st';
        button.textContent = 'Stop';
        row.classList.add('live');
        meta.textContent = '5.8 GB · Running · balanced local assistant';
      }],
    ];
  }

  /** 04 Your Workflow: agents finish and the matching tasks get ticked off */
  workflowTimeline(scene) {
    const agents = scene.querySelectorAll('.wf-ar > div span');
    const tasks = scene.querySelectorAll('.wf-tr');
    const startLabels = ['Sorting deductions', 'Drafting the cancellations', 'Drafting the email'];
    agents.forEach((el, k) => {
      el.textContent = startLabels[k];
      el.classList.remove('ok');
    });
    const tick = (task, on) => {
      const box = task.querySelector('.f-cb');
      const label = task.querySelector('b');
      box.classList.toggle('f-ok', on);
      box.textContent = on ? '✓' : '';
      label.classList.toggle('f-dn', on);
    };
    tick(tasks[0], false);
    tick(tasks[3], false);
    return [
      [900, () => {
        agents[0].textContent = 'Done';
        agents[0].classList.add('ok');
      }],
      [1300, () => tick(tasks[0], true)],
      [2300, () => {
        agents[2].textContent = 'Sent';
        agents[2].classList.add('ok');
      }],
      [2700, () => tick(tasks[3], true)],
    ];
  }

  /** 05 Same Computer: steps complete while the progress ring and bar fill to 100% */
  sameComputerTimeline(scene) {
    const island = scene.querySelector('.sc-isl');
    const ring = scene.querySelector('.sc-ring');
    const percent = island.querySelector('em');
    const label = island.querySelector(':scope > div > span');
    const steps = [...scene.querySelectorAll('.sc-exp .f-st')];
    const bar = scene.querySelector('.f-pg i');

    const setStep = (k, state) => {
      const row = steps[k];
      const dot = row.querySelector('.f-d');
      dot.className = `f-d${state === 'ok' ? ' f-ok' : state === 'run' ? ' f-run' : ''}`;
      dot.textContent = state === 'ok' ? '✓' : '';
      row.classList.toggle('f-cur', state === 'run');
      row.classList.toggle('f-dim', state === '');
    };
    const progress = (v) => {
      ring.style.setProperty('--p', String(v));
      percent.textContent = `${Math.round(v)}%`;
      bar.style.transform = `scaleX(${v / 100})`;
    };

    steps.forEach((_, k) => setStep(k, ''));
    progress(0);
    island.classList.remove('done');
    label.textContent = 'Running on your Mac';

    const out = [
      [300, () => setStep(0, 'ok')],
      [1000, () => setStep(1, 'ok')],
      [1500, () => setStep(2, 'run')],
      [3000, () => setStep(2, 'ok')],
      [3400, () => {
        setStep(3, 'ok');
        steps[3].classList.remove('f-dim');
      }],
      [3700, () => {
        island.classList.add('done');
        label.textContent = 'Done on your Mac';
      }],
    ];
    for (let k = 0; k <= 34; k++) out.push([300 + k * 100, () => progress(Math.min(100, (k * 100) / 34))]);
    return out;
  }

  /** Scale the 1920px canvas to the viewport */
  fit() {
    this.section.style.setProperty('--z', String(Math.min(1, document.documentElement.clientWidth / 1920)));
  }
}

if (!customElements.get('tokkey-features')) {
  customElements.define('tokkey-features', TokkeyFeatures);
}
