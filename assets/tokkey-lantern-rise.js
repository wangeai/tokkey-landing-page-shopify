/**
 * "Lantern Rise": canvas mini-game played inside the "CREATE & BUILD" card of the
 * "Everyday AI tasks" gallery. It runs in an iframe (see snippets/tokkey-everyday-tasks.liquid),
 * so window size, keyboard and storage stay scoped to the game frame.
 */
// --- CONSTANTS & PALETTE ---
const PAL = {
  night: '#141833', plum: '#3a2547', rose: '#b8606b', amber: '#f2a65a', 
  cream: '#fbe8c8', pine: '#0d1016', leaf: '#1f2a22'
};

// --- ENGINE STATE ---
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let W, H, DPR;
// Logical play area: the world is measured in units, and at least this many fit on any screen.
// The canvas scales units to pixels so sizes, gaps and speeds stay proportional on every device.
const MIN_W = 420, MIN_H = 640;
let SCALE = 1;
let lastTime = 0;
let game = {
  state: 'title', // 'title' | 'playing' | 'over'
  score: 0, best: parseInt(localStorage.getItem('lanternRiseBest')) || 0,
  flame: 100, combo: 0, elapsed: 0,
  player: { x: 0, y: 0, vx: 0 },
  fireflies: [], hazards: [], particles: [], stars: [], clouds: [], motes: [],
  scrollOffset: 0, shake: { amp: 0, t: 0 }, hitStop: 0,
  input: { left: false, right: false, mouseX: null, mouseY: null, touchX: null },
  muted: false, audioCtx: null, lastFireflySpawn: 0, lastHazardSpawn: 0,
  invulnT: 0, noPickupT: 0, titleBob: 0,
  effects: [], hitFlash: 0, spawnTimer: 0,
  fiberNoise: [],
  
  // Change 2: Tutorial flags (Updated State Machine)
  hintStage: 0,
  tutorialCatches: 0,
  hint: '',
  hintFadeIn: 0,
  hintFadeOut: 0,
  startX: 0,
  hintTarget: null,
  hintT: 0,
  hintStartTime: 0, // Added for timer logic
  
  // HUD Feedback
  hudGlowColor: null,
  hudGlowT: 0
};

// --- AUDIO SYSTEM ---
function initAudio() {
  if (game.audioCtx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  game.audioCtx = new AC();
}

function playSound(type) {
  if (game.muted || !game.audioCtx) return;
  const ctx = game.audioCtx;
  const now = ctx.currentTime;
  
  if (type === 'pickup') {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    const baseFreq = 440 * Math.pow(1.059, (game.combo - 1) * 2); 
    osc.frequency.setValueAtTime(baseFreq, now);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  } else if (type === 'hit') {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(20, now + 0.1);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.15);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
    
    const bufferSize = ctx.sampleRate * 0.1;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for(let i=0; i<bufferSize; i++) data[i] = (Math.random() * 2 - 1);
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.1, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    noise.connect(filter).connect(nGain).connect(ctx.destination);
    noise.start(now);
  } else if (type === 'gameover') {
    [392, 330, 261].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = now + i * 0.4;
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 1.0);
    });
  }
}

// --- INITIALIZATION ---
function resize() {
  DPR = window.devicePixelRatio || 1;
  const cssW = window.innerWidth;
  const cssH = window.innerHeight;
  // The tighter side sets the scale; the other side gets extra room
  SCALE = Math.min(cssW / MIN_W, cssH / MIN_H);
  W = cssW / SCALE;
  H = cssH / SCALE;
  canvas.width = cssW * DPR;
  canvas.height = cssH * DPR;
  ctx.setTransform(DPR * SCALE, 0, 0, DPR * SCALE, 0, 0);
  generateStars();
  generateClouds();
  generateMotes();
  if(game.state === 'title') {
     game.player.x = W / 2;
     game.player.y = H * 0.72;
  }
}

function generateStars() {
  game.stars = [];
  for(let i=0; i<120; i++) {
    game.stars.push({
      x: Math.random() * W,
      y: Math.random() * H * 0.8,
      size: Math.random() * 1.2 + 0.2,
      twinkleSpeed: Math.random() * 2 + 1,
      phase: Math.random() * Math.PI * 2
    });
  }
}

function generateClouds() {
  game.clouds = [];
  for(let i=0; i<3; i++) {
    game.clouds.push({
      x: Math.random() * W,
      y: Math.random() * (H * 0.5),
      w: 200 + Math.random() * 300,
      h: 40 + Math.random() * 40,
      speed: 10 + Math.random() * 20
    });
  }
}

function generateMotes() {
  game.motes = [];
  for(let i=0; i<25; i++) {
    game.motes.push({
      x: Math.random() * W,
      y: Math.random() * H,
      speed: 10 + Math.random() * 20,
      swayPhase: Math.random() * Math.PI * 2
    });
  }
}

window.addEventListener('resize', resize);
resize();

// --- INPUT HANDLING ---
window.addEventListener('keydown', e => {
  if(e.code === 'ArrowLeft' || e.code === 'KeyA') game.input.left = true;
  if(e.code === 'ArrowRight' || e.code === 'KeyD') game.input.right = true;
  if(e.code === 'Space' || e.code === 'Enter') handleInputStart();
  if(e.code === 'KeyM') toggleMute();
});
window.addEventListener('keyup', e => {
  if(e.code === 'ArrowLeft' || e.code === 'KeyA') game.input.left = false;
  if(e.code === 'ArrowRight' || e.code === 'KeyD') game.input.right = false;
});

canvas.addEventListener('mousedown', e => {
  initAudio();
  game.input.mouseX = e.clientX / SCALE;
  handleInputStart();
});
canvas.addEventListener('mousemove', e => {
  game.input.mouseX = e.clientX / SCALE;
});
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  initAudio();
  game.input.touchX = e.touches[0].clientX / SCALE;
  handleInputStart();
}, {passive: false});
canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  game.input.touchX = e.touches[0].clientX / SCALE;
}, {passive: false});
canvas.addEventListener('touchend', e => {
  game.input.touchX = null;
});

function handleInputStart() {
  if(game.state === 'title') startGame();
  else if(game.state === 'over') {
    if(performance.now() - game.lastDeath > 800) startGame();
  }
}

function toggleMute() {
  game.muted = !game.muted;
  if(!game.muted && game.audioCtx) game.audioCtx.resume();
  if(game.muted && game.audioCtx) game.audioCtx.suspend();
}

// --- GAME LOGIC ---

function resetRun() {
  game.score = 0;
  game.flame = 100;
  game.combo = 0;
  game.elapsed = 0;
  game.fireflies = [];
  game.hazards = [];
  game.particles = [];
  game.scrollOffset = 0;
  game.shake = { amp: 0, t: 0 };
  game.hitStop = 0;
  game.invulnT = 0;
  game.noPickupT = 0;
  game.effects = [];
  game.hitFlash = 0;
  game.spawnTimer = 0;
  game.player.x = W / 2;
  game.player.y = H * 0.70;
  game.player.vx = 0;
  game.lastFireflySpawn = 0;
  game.lastHazardSpawn = 0;
  game.lastDeath = performance.now();
  
  // Change 2: Tutorial setup (State Machine)
  game.startX = game.player.x;
  game.hintStage = 0;
  game.tutorialCatches = 0;
  game.hint = '';
  game.hintFadeIn = 0;
  game.hintFadeOut = 0;
  game.hudGlowColor = null;
  game.hudGlowT = 0;
  game.hintStartTime = 0; // Reset timer

  // Gentle opening
  for(let i=0; i<6; i++) {
    game.fireflies.push({
      x: game.player.x + (i - 2.5) * 40,
      y: game.player.y - 150 - (i % 2) * 30,
      r: 26,
      vx: 0, vy: 0,
      phase: Math.random() * Math.PI * 2
    });
  }
}

function startGame() {
  resetRun();
  game.state = 'playing';
}

function gameOver() {
  game.state = 'over';
  if(game.score > game.best) {
    game.best = Math.floor(game.score);
    localStorage.setItem('lanternRiseBest', game.best);
  }
  playSound('gameover');
}

function spawnFirefly(isChain = false) {
  const count = isChain ? 5 : 1;
  for(let i=0; i<count; i++) {
    game.fireflies.push({
      x: Math.random() * (W - 40) + 20 + (isChain ? (i-2)*30 : 0),
      y: -30 - (isChain ? (i-2)*30 : 0),
      r: 26,
      vx: (Math.random() - 0.5) * 30,
      vy: 0,
      phase: Math.random() * Math.PI * 2
    });
  }
}

function spawnHazard(dt) {
  game.spawnTimer++;
  const isPair = game.elapsed > 12 && game.spawnTimer % 3 === 0;
  
  const createCrow = () => ({
    type: 'crow', 
    x: W * (0.15 + Math.random() * 0.7), 
    y: -60,
    w: 56, h: 20, 
    vx: (Math.random() > 0.5 ? 1 : -1) * (80 + Math.random() * 80), 
    vy: 30 + Math.random() * 30,
    wingPhase: 0
  });
  
  const createBranch = () => {
    const side = Math.random() > 0.5 ? 'left' : 'right';
    const L = W * (0.30 + Math.random() * 0.20);
    const leaves = [];
    for(let i=0; i<10; i++) {
      leaves.push({
        t: 0.15 + Math.random() * 0.85,
        dy: -6 + Math.random() * 12,
        rot: Math.random() * Math.PI * 2,
        s: 0.8 + Math.random() * 0.4
      });
    }
    return {
      type: 'branch', 
      x: side === 'left' ? 0 : W - L, 
      y: -60,
      w: L, h: 18, vx: 0, vy: 0,
      side: side, length: L,
      leaves: leaves
    };
  };

  if(isPair) {
    game.hazards.push(createBranch());
    const branchSide = game.hazards[game.hazards.length-1].side;
    const crow = createCrow();
    crow.x = branchSide === 'left' ? W * (0.5 + Math.random()*0.35) : W * (Math.random()*0.35);
    game.hazards.push(crow);
  } else {
    if(Math.random() > 0.5) game.hazards.push(createCrow());
    else game.hazards.push(createBranch());
  }
}

function update(dt) {
  if(game.hitStop > 0) {
    game.hitStop -= dt;
    draw();
    return;
  }

  const t = game.elapsed;
  const scrollSpeed = Math.min(140 + 7 * t, 420);
  const drain = 2.2 + 0.07 * t;
  
  game.lastFireflySpawn += dt;
  game.lastHazardSpawn += dt;
  
  const ffInterval = 0.55;
  const hzInterval = Math.max(0.45, 1.5 - 0.035 * t);

  if(game.state === 'playing') {
    game.elapsed += dt;
    game.score += dt * 10;
    
    game.flame -= drain * dt;
    if(game.flame <= 0) {
      game.flame = 0;
      gameOver();
      return;
    }

    if(game.lastFireflySpawn >= ffInterval) {
      spawnFirefly(game.lastFireflySpawn % 1.65 < 0.1);
      game.lastFireflySpawn = 0;
    }
    
    // Change 2: Guided first 8 seconds
    let hazardAllowed = true;
    if (!game.tutorialDone) {
      if (t < 8.0) hazardAllowed = false;
    }

    if(hazardAllowed) {
      if(game.lastHazardSpawn >= hzInterval) {
        spawnHazard(dt);
        game.lastHazardSpawn = 0;
      }
    }

    let targetVx = 0;
    if(game.input.left) targetVx = -520;
    if(game.input.right) targetVx = 520;
    
    game.player.vx += (targetVx - game.player.vx) * (1 - Math.exp(-10 * dt));
    game.player.x += game.player.vx * dt;
    game.player.x = Math.max(30, Math.min(W - 30, game.player.x));

    if(game.input.mouseX !== null) {
      const dx = game.input.mouseX - game.player.x;
      game.player.x += dx * (1 - Math.exp(-10 * dt));
      game.player.x = Math.max(30, Math.min(W - 30, game.player.x));
    }
    if(game.input.touchX !== null) {
      const dx = game.input.touchX - game.player.x;
      game.player.x += dx * (1 - Math.exp(-10 * dt));
      game.player.x = Math.max(30, Math.min(W - 30, game.player.x));
    }

    if(game.invulnT > 0) game.invulnT -= dt;

    for(let i = game.fireflies.length - 1; i >= 0; i--) {
      let f = game.fireflies[i];
      f.y += (scrollSpeed + f.vy) * dt;
      f.x += Math.sin(game.elapsed * 3 + f.phase) * 6;
      
      if (!f.trail) f.trail = [];
      f.trail.push({x: f.x, y: f.y});
      if (f.trail.length > 6) f.trail.shift();

      const dist = Math.hypot(f.x - game.player.x, f.y - game.player.y);
      if(dist < 30 + f.r) {
        game.flame = Math.min(100, game.flame + 8);
        game.combo++;
        game.noPickupT = 0;
        game.score += 10 * game.combo;
        
        // Change 2: Tutorial catch tracking
        // FIX 1: Only count catches while hintStage === 1
        if (game.hintStage === 1) game.tutorialCatches++;

        // Change 4: Feedback text (Y offset adjusted to be above lantern)
        game.effects.push({
          type: 'floatText',
          text: '+fuel',
          x: f.x, y: f.y - 45, // Change 4: Spawn higher
          life: 0.7, maxLife: 0.7,
          color: '#ffd27a', size: 17, bold: true
        });
        game.effects.push({
          type: 'floatText',
          text: `+${10 * game.combo}`,
          x: f.x, y: f.y + 5,
          life: 0.7, maxLife: 0.7,
          color: PAL.cream, size: 14
        });
        game.effects.push({
          type: 'ring',
          x: f.x, y: f.y,
          radius: 6, maxRadius: 42,
          life: 0.4, maxLife: 0.4,
          color: PAL.amber
        });
        game.player.squashT = 0.18;
        
        spawnParticles(f.x, f.y, 10, PAL.amber, 'burst');
        playSound('pickup');
        
        // Change 4: Flash bar amber
        game.hudGlowColor = PAL.amber;
        game.hudGlowT = 0.3;

        game.fireflies.splice(i, 1);
        continue;
      }
      
      if(f.y > H + 80) game.fireflies.splice(i, 1);
    }

    for(let i = game.hazards.length - 1; i >= 0; i--) {
      let h = game.hazards[i];
      h.y += (scrollSpeed + h.vy) * dt;
      h.x += h.vx * dt;
      
      if(h.type === 'crow') {
        if(h.x < 30 || h.x > W - 30) h.vx *= -1;
        h.wingPhase += dt * 15;
      }

      let hit = false;
      if(h.type === 'crow') {
        const dist = Math.hypot(h.x - game.player.x, h.y - game.player.y);
        if(dist < 22 + 28) hit = true;
      } else {
        if(game.player.x + 22 > h.x - h.w/2 && game.player.x - 22 < h.x + h.w/2 &&
           game.player.y + 22 > h.y - h.h/2 && game.player.y - 22 < h.y + h.h/2) {
             hit = true;
        }
      }

      if(hit && game.invulnT <= 0) {
        game.flame -= 24;
        game.combo = 0;
        game.invulnT = 0.6;
        game.noPickupT = 0;
        game.shake.amp = 12;
        game.shake.t = 0.35;
        game.hitStop = 0.09;
        game.hitFlash = 0.35;
        
        // Change 4: Feedback text (Y offset adjusted to be above lantern)
        game.effects.push({
          type: 'floatText',
          text: '-flame',
          x: game.player.x, y: game.player.y - 45, // Change 4: Spawn higher
          life: 0.7, maxLife: 0.7,
          color: '#e08a92', size: 18, bold: true
        });
        spawnParticles(game.player.x, game.player.y, 18, PAL.plum, 'debris');
        playSound('hit');
        
        // Change 4: Flash bar rose
        game.hudGlowColor = PAL.rose;
        game.hudGlowT = 0.3;

        if(game.flame <= 0) {
          game.flame = 0;
          gameOver();
          return;
        }
      }

      if(h.y > H + 80 || h.x < -100 || h.x > W + 100) game.hazards.splice(i, 1);
    }
    
    game.noPickupT += dt;
    if(game.noPickupT > 2.5) game.combo = 0;

  } else if (game.state === 'title') {
    game.titleBob += dt;
    game.player.x = W / 2 + Math.sin(game.titleBob) * 10;
    game.player.y = H * 0.72 + Math.cos(game.titleBob * 0.5) * 10;
    game.scrollOffset += 20 * dt;
    
    if(Math.random() < 0.05) {
      game.fireflies.push({
        x: Math.random() * W,
        y: H + 20,
        r: 26,
        vx: (Math.random() - 0.5) * 20,
        vy: -(10 + Math.random() * 20),
        phase: Math.random() * Math.PI * 2
      });
    }
    for(let i = game.fireflies.length - 1; i >= 0; i--) {
      let f = game.fireflies[i];
      f.y += f.vy * dt;
      f.x += Math.sin(game.elapsed * 2 + f.phase) * 10 * dt;
      if(f.y < -50) game.fireflies.splice(i, 1);
    }
  }

  for(let i = game.effects.length - 1; i >= 0; i--) {
    let e = game.effects[i];
    e.life -= dt;
    if(e.life <= 0) game.effects.splice(i, 1);
  }

  for(let i = game.particles.length - 1; i >= 0; i--) {
    let p = game.particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 50 * dt;
    if(p.life <= 0) game.particles.splice(i, 1);
  }

  if(game.shake.t > 0) {
    game.shake.t -= dt;
    if(game.shake.t <= 0) game.shake.amp = 0;
  }
  
  if(game.player.squashT > 0) game.player.squashT -= dt;
  
  game.scrollOffset += scrollSpeed * dt;
  
  // Change 2: Tutorial Hint Logic (State Machine)
  if (game.state === 'playing' && !game.tutorialDone) {
    if (game.hintFadeIn > 0) {
      game.hintFadeIn -= dt;
      if (game.hintFadeIn < 0) game.hintFadeIn = 0;
    }
    if (game.hintFadeOut > 0) {
      game.hintFadeOut -= dt;
      if (game.hintFadeOut < 0) game.hintFadeOut = 0;
    }

    // Stage 0: Steering
    if (game.hintStage === 0) {
      game.hint = "← → or drag to steer";
      if (Math.abs(game.player.x - game.startX) > 60) {
        game.hintStage = 1;
        game.hint = "";
        game.hintFadeIn = 0;
        game.hintFadeOut = 0;
        game.hintStartTime = game.elapsed; // FIX 1: Record start time
      }
    }
    // Stage 1: Catch Fireflies
    else if (game.hintStage === 1) {
      game.hint = "Catch fireflies to refuel";
      // FIX 1: Wait at least 1.5s even if caught early
      if ((game.elapsed - game.hintStartTime >= 1.5) && game.tutorialCatches >= 2) {
        game.hintStage = 2;
        game.hint = "";
        game.hintFadeIn = 0;
        game.hintFadeOut = 0;
      }
    }
    // Stage 2: Wait for Hazard
    else if (game.hintStage === 2) {
      const visibleHazards = game.hazards.filter(h => h.y > 0 && h.y < H);
      if (visibleHazards.length > 0) {
        game.hintStage = 3;
        game.hintTarget = visibleHazards[0];
        game.hintT = 2.5;
      }
    }
    // Stage 3: Avoid Hazards
    else if (game.hintStage === 3) {
      game.hint = "Avoid crows & branches";
      game.hintT -= dt;
      // FIX 2: Enter stage 4 only when hazard is below 18% of screen height
      if (game.hintT <= 0 || (game.hintTarget && game.hintTarget.y > H * 0.18)) {
        game.hintStage = 4;
        game.hint = "";
        game.hintFadeIn = 0;
        game.hintFadeOut = 0;
        game.tutorialDone = true;
        game.hintTarget = null;
      }
    }
  }
  
  if(game.hudGlowT > 0) game.hudGlowT -= dt;
}

function spawnParticles(x, y, count, color, type) {
  for(let i=0; i<count; i++) {
    let angle = Math.random() * Math.PI * 2;
    let speed = type === 'burst' ? 100 : 50;
    game.particles.push({
      x, y,
      vx: Math.cos(angle) * speed * Math.random(),
      vy: Math.sin(angle) * speed * Math.random(),
      life: 0.5 + Math.random() * 0.5,
      color: color,
      size: Math.random() * 3 + 1
    });
  }
}

// --- RENDERING ---

function drawSky() {
  const night = game.state === 'playing' ? Math.min(1, game.elapsed / 35) : (game.state === 'title' ? 0 : game._lastNight);
  game._lastNight = night;
  
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, lerpColor('#3a2547', '#0b0e22', night));
  grad.addColorStop(0.5, lerpColor('#b8606b', '#1d2142', night));
  grad.addColorStop(1, lerpColor('#f2a65a', '#3a2f4a', night));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

function lerpColor(c1, c2, t) {
  const r1 = parseInt(c1.substr(1,2), 16), g1 = parseInt(c1.substr(3,2), 16), b1 = parseInt(c1.substr(5,2), 16);
  const r2 = parseInt(c2.substr(1,2), 16), g2 = parseInt(c2.substr(3,2), 16), b2 = parseInt(c2.substr(5,2), 16);
  const r = Math.round(r1 + (r2-r1)*t), g = Math.round(g1 + (g2-g1)*t), b = Math.round(b1 + (b2-b1)*t);
  return `rgb(${r},${g},${b})`;
}

function drawMoon() {
  const night = game._lastNight || 0;
  const r = Math.min(W, H) * 0.08;
  const mx = W * 0.85;
  const my = H * 0.15;
  
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const haloSize = r * 2 * (1 + night * 0.5);
  const grad = ctx.createRadialGradient(mx, my, r*0.5, mx, my, haloSize);
  grad.addColorStop(0, `rgba(251, 232, 200, ${0.3 + night * 0.2})`);
  grad.addColorStop(1, 'rgba(251, 232, 200, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(mx, my, haloSize, 0, Math.PI*2);
  ctx.fill();
  
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = PAL.cream;
  ctx.beginPath();
  ctx.arc(mx, my, r, 0, Math.PI*2);
  ctx.fill();
  
  ctx.globalAlpha = 0.25;
  [[-0.3, -0.2, 0.18], [0.4, 0.1, 0.15], [-0.1, 0.4, 0.2]].forEach(([ox, oy, sr]) => {
    const spotGrad = ctx.createRadialGradient(mx + ox*r, my + oy*r, 0, mx + ox*r, my + oy*r, r*sr);
    spotGrad.addColorStop(0, 'rgba(180,150,120,0.25)');
    spotGrad.addColorStop(1, 'rgba(180,150,120,0)');
    ctx.fillStyle = spotGrad;
    ctx.beginPath();
    ctx.arc(mx + ox*r, my + oy*r, r*sr, 0, Math.PI*2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  
  ctx.restore();
}

function drawStars() {
  const night = game._lastNight || 0;
  let starAlpha = Math.min(game.elapsed / 15, 1) * (0.25 + 0.75 * night);
  if (game.elapsed >= 13 && game.elapsed <= 17) {
    starAlpha = Math.min(starAlpha, (game.elapsed - 13) / 4);
  }
  
  if(starAlpha <= 0) return;
  ctx.fillStyle = PAL.cream;
  game.stars.forEach(s => {
    const twinkle = (Math.sin(game.elapsed * s.twinkleSpeed + s.phase) + 1) / 2;
    ctx.globalAlpha = starAlpha * twinkle;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size, 0, Math.PI*2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function drawClouds() {
  ctx.save();
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = PAL.rose;
  game.clouds.forEach(c => {
    c.x -= c.speed * 0.016;
    if(c.x + c.w < 0) c.x = W + c.w;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, c.w/2, c.h/2, 0, 0, Math.PI*2);
    ctx.fill();
  });
  ctx.restore();
}

function drawMountains() {
  const offsets = [0.2, 0.5, 0.8];
  const colors = ['#6b4a63', '#3a2f4a', '#0d1016'];
  const heights = [150, 120, 100];
  
  offsets.forEach((speedMult, idx) => {
    ctx.fillStyle = colors[idx];
    ctx.beginPath();
    ctx.moveTo(0, H);
    
    const offset = (game.scrollOffset * speedMult) % 200;
    
    for(let x = -200; x <= W + 200; x += 20) {
       const y = H - heights[idx] + Math.sin((x + offset) * 0.01) * 30 + Math.sin((x + offset)*0.03)*10;
       ctx.lineTo(x, y);
       
       if(idx > 0 && Math.abs((x + offset) % 60) < 10) {
         ctx.lineTo(x, y - 20 - Math.random()*10);
         ctx.lineTo(x+10, y);
       }
    }
    
    ctx.lineTo(W, H);
    ctx.fill();
  });
}

function drawLantern(x, y, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale * 1.4, scale * 1.4);
  
  if(game.player.squashT > 0) {
    const t = game.player.squashT / 0.18;
    const scaleX = 1 + (1 - t) * 0.15;
    const scaleY = 1 - (1 - t) * 0.12;
    ctx.scale(scaleX, scaleY);
  }
  
  const tilt = Math.max(-0.12, Math.min(0.12, game.player.vx * 0.0005));
  ctx.rotate(tilt);
  
  const time = performance.now() / 1000;
  const f = 0.9 + 0.06*Math.sin(time*13) + 0.04*Math.sin(time*29.7);
  
  ctx.globalCompositeOperation = 'lighter';
  
  const glowSize = 90 + (game.flame / 100) * 40;
  const outerGrad = ctx.createRadialGradient(0, 0, 20, 0, 0, glowSize);
  outerGrad.addColorStop(0, `rgba(242, 166, 90, ${0.3 * f})`);
  outerGrad.addColorStop(1, 'rgba(242, 166, 90, 0)');
  ctx.fillStyle = outerGrad;
  ctx.beginPath();
  ctx.arc(0, 0, glowSize, 0, Math.PI*2);
  ctx.fill();
  
  const innerGrad = ctx.createRadialGradient(0, 0, 10, 0, 0, 40);
  innerGrad.addColorStop(0, `rgba(255, 246, 220, ${0.6 * f})`);
  innerGrad.addColorStop(1, 'rgba(242, 166, 90, 0)');
  ctx.fillStyle = innerGrad;
  ctx.beginPath();
  ctx.arc(0, 0, 40, 0, Math.PI*2);
  ctx.fill();
  
  ctx.globalCompositeOperation = 'source-over';
  
  let alpha = 1;
  if(game.invulnT > 0) {
    alpha = (Math.floor(game.invulnT * 20) % 2 === 0) ? 0.4 : 1;
  }
  ctx.globalAlpha = alpha;
  
  ctx.fillStyle = '#fff6dc';
  ctx.beginPath();
  ctx.moveTo(-15, 26);
  ctx.bezierCurveTo(-27, 8, -28, -22, -12, -30);
  ctx.quadraticCurveTo(0, -35, 12, -30);
  ctx.bezierCurveTo(28, -22, 27, 8, 15, 26);
  ctx.quadraticCurveTo(0, 30, -15, 26);
  ctx.closePath();
  ctx.fill();
  
  ctx.save();
  ctx.clip();
  
  ctx.strokeStyle = 'rgba(160,90,40,0.35)';
  ctx.lineWidth = 1;
  [-12, -4, 4, 12, -8, 8].forEach(rx => {
    ctx.beginPath();
    ctx.moveTo(rx, -32);
    ctx.quadraticCurveTo(rx * 1.2, 0, rx * 0.8, 26);
    ctx.stroke();
  });
  
  ctx.strokeStyle = 'rgba(160,90,40,0.18)';
  ctx.lineWidth = 1;
  [-15, 0, 15].forEach(rY => {
    ctx.beginPath();
    ctx.moveTo(-20, rY);
    ctx.lineTo(20, rY);
    ctx.stroke();
  });
  
  ctx.strokeStyle = 'rgba(160,90,40,0.08)';
  ctx.lineWidth = 0.5;
  for(let i=0; i<20; i++) {
    const fx = (i - 10) * 2;
    ctx.beginPath();
    ctx.moveTo(fx, -30 + Math.random()*5);
    ctx.lineTo(fx, 26 - Math.random()*5);
    ctx.stroke();
  }
  
  ctx.restore();
  
  const bodyGrad = ctx.createRadialGradient(0, 10, 5, 0, 0, 30);
  bodyGrad.addColorStop(0, 'rgba(255,255,255,0.8)');
  bodyGrad.addColorStop(1, 'rgba(242,166,90,0.4)');
  ctx.fillStyle = bodyGrad;
  ctx.fill();
  
  ctx.strokeStyle = '#e0d0b0';
  ctx.lineWidth = 1;
  [-12, -4, 4, 12].forEach(rx => {
    ctx.beginPath();
    ctx.moveTo(rx, -32);
    ctx.quadraticCurveTo(rx * 1.2, 0, rx * 0.8, 26);
    ctx.stroke();
  });
  
  ctx.strokeStyle = PAL.pine;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 26, 15, 3, 0, 0, Math.PI*2);
  ctx.stroke();
  
  ctx.fillStyle = PAL.amber;
  ctx.shadowColor = PAL.amber;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.ellipse(0, 22, 4 * f, 8 * f * f, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.shadowBlur = 0;
  
  ctx.globalAlpha = 1;
  ctx.restore();
  
  if(game.combo >= 5) {
    const pulse = 1 + Math.sin(game.elapsed * 5) * 0.1;
    ctx.save();
    ctx.translate(x + 35, y);
    ctx.scale(pulse, pulse);
    ctx.font = 'bold 20px Georgia';
    ctx.fillStyle = PAL.amber;
    ctx.textAlign = 'center';
    ctx.fillText(`×${game.combo}`, 0, 0);
    ctx.restore();
  }
}

function drawFirefly(f) {
  const time = performance.now() / 1000;
  const R = 18 + 5 * Math.sin(time * 6 + f.phase);
  
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, R);
  g.addColorStop(0, 'rgba(255,214,130,1.0)');
  g.addColorStop(0.25, 'rgba(255,190,90,0.45)');
  g.addColorStop(1, 'rgba(255,170,60,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(f.x, f.y, R, 0, Math.PI*2);
  ctx.fill();
  
  if (f.trail && f.trail.length > 1) {
    for (let i = 0; i < f.trail.length - 1; i++) {
      const pos = f.trail[i];
      const progress = i / (f.trail.length - 1);
      const trailAlpha = progress * 0.5;
      const trailR = 2.5 * progress;
      
      ctx.fillStyle = `rgba(255, 214, 130, ${trailAlpha})`;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, trailR, 0, Math.PI*2);
      ctx.fill();
    }
  }
  
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#fff3c4';
  ctx.beginPath();
  ctx.arc(f.x, f.y, 2.5, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();
}

function drawCrow(h) {
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.fillStyle = PAL.pine;
  ctx.strokeStyle = 'rgba(242,166,90,0.55)';
  ctx.lineWidth = 1.5;
  
  ctx.beginPath();
  ctx.ellipse(0, 0, 12, 6, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.stroke();
  
  const wingAngle = Math.sin(h.wingPhase) * 0.6;
  ctx.save();
  ctx.rotate(wingAngle);
  ctx.beginPath();
  ctx.moveTo(-5, 0);
  ctx.quadraticCurveTo(-20, -15, -28, -5);
  ctx.lineTo(-10, 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  
  ctx.save();
  ctx.rotate(-wingAngle);
  ctx.beginPath();
  ctx.moveTo(5, 0);
  ctx.quadraticCurveTo(20, -15, 28, -5);
  ctx.lineTo(10, 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  
  ctx.restore();
}

function drawBranch(h) {
  ctx.save();
  if(h.side === 'left') {
    ctx.translate(0, h.y);
  } else {
    ctx.translate(W, h.y);
    ctx.scale(-1, 1);
  }
  
  const L = h.w;
  const tipY = 1;
  
  ctx.fillStyle = PAL.pine;
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.quadraticCurveTo(L * 0.5, -4, L, tipY);
  ctx.quadraticCurveTo(L + 6, tipY, L, tipY + 2);
  ctx.quadraticCurveTo(L * 0.5, 10, 0, 9);
  ctx.closePath();
  ctx.fill();
  
  ctx.strokeStyle = 'rgba(242,166,90,0.45)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  
  const twigPositions = [0.3, 0.55, 0.8];
  const twigLengths = [14, 18, 22];
  
  twigPositions.forEach((pos, i) => {
    const tx = L * pos;
    const ty = -4 + (tipY + 4) * pos;
    
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - 8, ty - twigLengths[i]);
    ctx.strokeStyle = PAL.pine;
    ctx.lineWidth = 4 - i;
    ctx.lineCap = 'round';
    ctx.stroke();
  });
  
  ctx.fillStyle = PAL.leaf;
  if(h.leaves) {
    h.leaves.forEach(l => {
      const lx = l.t * L;
      const approxY = -9 * (1-l.t)*(1-l.t) + 2 * (-4) * l.t*(1-l.t) + tipY * l.t*l.t;
      
      ctx.save();
      ctx.translate(lx, approxY + l.dy);
      ctx.rotate(l.rot);
      ctx.beginPath();
      ctx.ellipse(0, 0, 7 * l.s, 3.5 * l.s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }
  
  ctx.restore();
}

function drawEffects() {
  game.effects.forEach(e => {
    const progress = 1 - (e.life / e.maxLife);
    
    if(e.type === 'floatText') {
      const scale = 1.4 - (progress * 0.4);
      const yOff = -40 * progress;
      ctx.save();
      ctx.translate(e.x, e.y + yOff);
      ctx.scale(scale, scale);
      ctx.font = `${e.bold ? 'bold ' : ''}${e.size}px Georgia`;
      ctx.fillStyle = e.color;
      ctx.textAlign = 'center';
      ctx.globalAlpha = 1 - progress;
      ctx.fillText(e.text, 0, 0);
      ctx.restore();
    } else if (e.type === 'ring') {
      const r = 6 + (e.maxRadius - 6) * progress;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 1 - progress;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, Math.PI*2);
      ctx.stroke();
    }
  });
}

function drawMotes() {
  ctx.fillStyle = PAL.cream;
  game.motes.forEach(m => {
    m.y -= m.speed * 0.016;
    m.x += Math.sin(performance.now()/1000 + m.swayPhase) * 0.5;
    if(m.y < 0) {
      m.y = H;
      m.x = Math.random() * W;
    }
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.arc(m.x, m.y, 1, 0, Math.PI*2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function drawMist() {
  const grad = ctx.createLinearGradient(0, H * 0.7, 0, H);
  grad.addColorStop(0, 'rgba(251, 232, 200, 0)');
  grad.addColorStop(1, 'rgba(251, 232, 200, 0.08)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, H * 0.7, W, H * 0.3);
}

function drawFlameIcon(x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = PAL.amber;
  ctx.beginPath();
  ctx.moveTo(0, 7);
  ctx.bezierCurveTo(-5, 2, -5, -5, 0, -7);
  ctx.bezierCurveTo(5, -5, 5, 2, 0, 7);
  ctx.fill();
  ctx.restore();
}

function wrapText(text, maxWidth, fontSize) {
  ctx.font = `${fontSize}px system-ui`;
  const words = text.split(' ');
  let lines = [];
  let currentLine = words[0];
  
  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const width = ctx.measureText(currentLine + " " + word).width;
    if (width < maxWidth) {
      currentLine += " " + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  lines.push(currentLine);
  return lines.slice(0, 2);
}

function drawTutorialLegend() {
  const B = Math.min(440, W - 32);
  const startY = H * 0.27;
  const rowHeight = H * 0.075;
  const iconSize = 44;
  const fontSize = Math.min(17, W * 0.042);
  
  ctx.textAlign = 'left';
  
  // Row 1: Firefly
  ctx.save();
  ctx.translate(W/2 - B/2 + 22, startY + 22);
  ctx.scale(iconSize/52, iconSize/52); // Scale to fit roughly
  // Draw a simple firefly using drawFirefly logic but centered at 0,0
  // Since drawFirefly expects global coords, we cheat and pass a fake object
  const tempF = { x: 0, y: 0, phase: 0, trail: [] };
  drawFirefly(tempF);
  ctx.restore();
  
  const line1 = wrapText("Catch fireflies: they refuel your flame", B - 60, fontSize);
  ctx.fillStyle = PAL.cream;
  ctx.font = `${fontSize}px system-ui`;
  ctx.fillText(line1[0], W/2 - B/2 + 70, startY + 18);
  if (line1.length > 1) ctx.fillText(line1[1], W/2 - B/2 + 70, startY + 18 + fontSize + 4);
  
  // Row 2: Crow/Branch
  ctx.save();
  ctx.translate(W/2 - B/2 + 22, startY + rowHeight + 22);
  ctx.scale(0.5, 0.5);
  // Draw Crow
  const tempCrow = { x: -10, y: 0, wingPhase: 0 };
  drawCrow(tempCrow);
  // Draw Branch stub
  const tempBranch = { x: 20, y: 0, side: 'left', w: 40, leaves: [] };
  drawBranch(tempBranch);
  ctx.restore();
  
  const line2 = wrapText("Avoid crows and branches: a hit costs flame", B - 60, fontSize);
  ctx.fillStyle = PAL.cream;
  ctx.font = `${fontSize}px system-ui`;
  ctx.fillText(line2[0], W/2 - B/2 + 70, startY + rowHeight + 18);
  if (line2.length > 1) ctx.fillText(line2[1], W/2 - B/2 + 70, startY + rowHeight + 18 + fontSize + 4);
  
  // Row 3: Flame Icon + Bar
  ctx.save();
  ctx.translate(W/2 - B/2 + 22, startY + rowHeight * 2 + 22);
  ctx.scale(0.8, 0.8);
  drawFlameIcon(0, 0);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.roundRect(15, -5, 40, 10, 3);
  ctx.fill();
  ctx.fillStyle = PAL.amber;
  ctx.beginPath();
  ctx.roundRect(17, -3, 36, 6, 2);
  ctx.fill();
  ctx.restore();
  
  const line3 = wrapText("Your lantern's life. When it runs out, the night wins", B - 60, fontSize);
  ctx.fillStyle = PAL.cream;
  ctx.font = `${fontSize}px system-ui`;
  ctx.fillText(line3[0], W/2 - B/2 + 70, startY + rowHeight * 2 + 18);
  if (line3.length > 1) ctx.fillText(line3[1], W/2 - B/2 + 70, startY + rowHeight * 2 + 18 + fontSize + 4);
}

function drawHint(hintText, x, y) {
  if (!hintText) return;
  
  let alpha = 1;
  if (game.hintFadeIn > 0) {
    alpha = 1 - (game.hintFadeIn / 0.3);
  } else if (game.hintFadeOut > 0) {
    alpha = Math.max(0, game.hintFadeOut / 0.3);
  }
  
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.font = `italic ${Math.min(20, W * 0.05)}px Georgia`;
  ctx.fillStyle = PAL.cream;
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 6;
  ctx.fillText(hintText, x, y);
  ctx.restore();
}

function drawHUDHintLogic() {
  if (game.state !== 'playing' || game.tutorialDone || !game.hint) return;
  
  if (game.hint === "Catch fireflies to refuel") {
    // Find nearest firefly above lantern
    let targetF = null;
    let minDist = Infinity;
    game.fireflies.forEach(f => {
      if (f.y < game.player.y) {
        const d = Math.hypot(f.x - game.player.x, f.y - game.player.y);
        if (d < minDist) {
          minDist = d;
          targetF = f;
        }
      }
    });
    
    if (targetF) {
      // Draw arrow from text to firefly
      const textX = targetF.x;
      const textY = targetF.y - 50;
      
      ctx.save();
      ctx.strokeStyle = PAL.cream;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(textX, textY + 10);
      ctx.quadraticCurveTo(textX + 10, textY + 20, textX, textY + 30);
      ctx.stroke();
      ctx.restore();
      
      drawHint(game.hint, textX, textY);
    } else {
      // No firefly visible, show above lantern
      drawHint(game.hint, game.player.x, game.player.y - 90);
    }
  } else if (game.hint === "Avoid crows & branches") {
    // Find first hazard that is visible
    const h = game.hintTarget;
    if (h) {
      // FIX 2: Proper positioning and clamping
      ctx.font = `italic ${Math.min(20, W * 0.05)}px Georgia`;
      const tw = ctx.measureText(game.hint).width;
      
      // Calculate center X of the hazard
      let centerX = h.x;
      if (h.type === 'branch') {
        centerX = h.side === 'left' ? h.w / 2 : W - h.w / 2;
      }
      
      // Clamp text position
      const tx = Math.max(16 + tw/2, Math.min(W - 16 - tw/2, centerX));
      const ty = Math.max(H * 0.22, Math.min(h.y + 60, game.player.y - 90));
      
      drawHint(game.hint, tx, ty);
      
      // Arrow pointing at hazard
      ctx.save();
      ctx.strokeStyle = PAL.cream;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tx, ty + 10);
      ctx.quadraticCurveTo(tx + (tx > centerX ? -10 : 10), ty + 20, centerX, h.y);
      ctx.stroke();
      ctx.restore();
    }
  } else {
    drawHint(game.hint, W/2, game.player.y + 70);
  }
}

function drawUI() {
  ctx.font = 'bold 24px Georgia';
  ctx.fillStyle = PAL.cream;
  ctx.textAlign = 'left';
  
  ctx.fillText(`Score: ${Math.floor(game.score)}`, 20, 40);
  
  if(game.combo > 1) {
    ctx.font = 'italic 18px Georgia';
    ctx.fillText(`×${game.combo}`, 20, 65);
  }
  
  // Change 4: Move bar left to fit percentage text
  const barX = W - 176;
  const barY = 30;
  drawFlameIcon(barX - 20, barY + 17);
  
  // Change 4: Glow around bar
  if (game.hudGlowT > 0 && game.hudGlowColor) {
    ctx.save();
    ctx.shadowColor = game.hudGlowColor;
    ctx.shadowBlur = 15;
    ctx.strokeStyle = game.hudGlowColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(barX, barY + 10, 140, 15, 5);
    ctx.stroke();
    ctx.restore();
  }
  
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.roundRect(barX, barY + 10, 140, 15, 5);
  ctx.fill();
  
  const pct = game.flame / 100;
  let barColor = PAL.amber;
  if(game.flame < 25) {
    barColor = PAL.rose;
  }
  ctx.fillStyle = barColor;
  ctx.beginPath();
  ctx.roundRect(barX + 2, barY + 12, 136 * pct, 11, 3);
  ctx.fill();
  
  // Change 3: Percentage text (measured to fit inside margin)
  ctx.font = '14px system-ui';
  ctx.fillStyle = PAL.cream;
  ctx.textAlign = 'left';
  const txtW = ctx.measureText(`${Math.floor(game.flame)}%`).width;
  ctx.fillText(`${Math.floor(game.flame)}%`, barX + 145, barY + 22);
  
  // Change 3: Low flame warning
  // FIX 3: Only draw when playing
  if(game.state === 'playing' && game.flame < 25) {
    const pulse = (Math.sin(performance.now() / 100) + 1) / 2;
    ctx.fillStyle = `rgba(184, 96, 107, ${pulse * 0.3})`;
    ctx.fillRect(0, 0, W, H);
    
    ctx.font = `${Math.min(18, W * 0.045)}px system-ui`;
    ctx.fillStyle = '#e08a92';
    ctx.textAlign = 'center';
    ctx.fillText("Flame low: catch fireflies!", W/2, H * 0.12);
  }
}

function drawTitleScreen() {
  drawSky();
  drawMoon();
  drawStars();
  drawClouds();
  drawMountains();
  
  game.fireflies.forEach(drawFirefly);
  
  // Change 1: Title Screen Text
  ctx.textAlign = 'center';
  ctx.fillStyle = PAL.cream;
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 10;
  ctx.font = `bold ${Math.min(64, W * 0.12)}px Georgia`;
  ctx.fillText("Lantern Rise", W/2, H * 0.13);
  
  ctx.fillStyle = PAL.amber;
  ctx.font = `italic ${Math.min(24, W * 0.055)}px Georgia`;
  ctx.fillText("Keep the light alive.", W/2, H * 0.13 + Math.min(40, W * 0.09));
  
  ctx.shadowBlur = 0;
  
  // Change 1: Legend
  drawTutorialLegend();
  
  // Controls text
  const controlsY = H * 0.53;
  ctx.textAlign = 'center';
  ctx.font = `${Math.min(16, W * 0.04)}px system-ui`;
  ctx.fillStyle = PAL.cream;
  ctx.fillText("← → / A D / drag to steer", W/2, controlsY);
  
  // Change 1: Pulsing Start Text (draw once, pulsing)
  const pulseAlpha = 0.6 + 0.4 * ((Math.sin(performance.now() / 300) + 1) / 2);
  ctx.globalAlpha = pulseAlpha;
  ctx.fillText("Tap or press Space to begin", W/2, controlsY + 26);
  ctx.globalAlpha = 1;
  
  ctx.font = `${Math.min(16, W * 0.04)}px system-ui`;
  ctx.fillText(`Best: ${game.best}`, W/2, controlsY + 52);
  
  // Lantern below text
  drawLantern(game.player.x, game.player.y, 1.5);
}

function drawGameOver() {
  ctx.fillStyle = 'rgba(13, 16, 22, 0.7)';
  ctx.fillRect(0, 0, W, H);
  
  ctx.textAlign = 'center';
  ctx.fillStyle = PAL.rose;
  const goSize = Math.min(40, W * 0.085);
  ctx.font = `bold ${goSize}px Georgia`;
  ctx.fillText("The light went out", W/2, H/2 - 60);
  
  // Change 5: One line reason
  ctx.font = `${Math.min(18, W * 0.045)}px system-ui`;
  ctx.fillStyle = PAL.cream;
  ctx.fillText("Your flame ran out.", W/2, H/2 - 30);
  
  ctx.font = '24px system-ui';
  ctx.fillText(`Final Score: ${Math.floor(game.score)}`, W/2, H/2 + 10);
  
  if(game.score >= game.best && game.score > 0) {
    ctx.fillStyle = PAL.amber;
    ctx.font = 'bold 20px Georgia';
    ctx.fillText("New Best!", W/2, H/2 + 40);
  }
  
  // Change 5: Tip line
  ctx.fillStyle = PAL.amber;
  ctx.font = `italic 16px Georgia`;
  ctx.fillText("Tip: fireflies refuel your lantern. Steer into them.", W/2, H/2 + 70);
  
  ctx.fillStyle = PAL.cream;
  ctx.font = '16px system-ui';
  if(performance.now() - game.lastDeath > 800) {
    ctx.fillText("Tap or Space to fly again", W/2, H/2 + 100);
  }
}

function drawParticles() {
  game.particles.forEach(p => {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  
  ctx.save();
  if(game.shake.t > 0) {
    const sx = (Math.random() - 0.5) * game.shake.amp;
    const sy = (Math.random() - 0.5) * game.shake.amp;
    ctx.translate(sx, sy);
  }
  
  if(game.state === 'title') {
    drawTitleScreen();
  } else {
    drawSky();
    drawMoon();
    drawStars();
    drawClouds();
    drawMountains();
    drawMist();
    drawMotes();
    
    game.fireflies.forEach(drawFirefly);
    game.hazards.forEach(h => {
      if(h.type === 'crow') drawCrow(h);
      else drawBranch(h);
    });
    
    drawLantern(game.player.x, game.player.y, 1);
    
    drawParticles();
    drawEffects();
    drawUI();
    
    // Change 5: Game Over Overlay drawn after world objects
    if(game.state === 'over') drawGameOver();
    
    // Change 2: Tutorial hints
    drawHUDHintLogic();
    
    // Change 5: Night falls caption (kept as per original logic)
    if (game.elapsed >= 15 && game.elapsed <= 16.8) {
      const fadeInEnd = 15.6;
      const holdOutStart = 16.8;
      const fadeOutEnd = 17.6;
      
      let alpha = 0;
      if (game.elapsed < fadeInEnd) {
        alpha = (game.elapsed - 15) / 0.6;
      } else if (game.elapsed < holdOutStart) {
        alpha = 1;
      } else {
        alpha = 1 - (game.elapsed - holdOutStart) / (fadeOutEnd - holdOutStart);
      }
      
      if (alpha > 0) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.textAlign = 'center';
        ctx.font = `italic ${Math.min(28, W * 0.06)}px Georgia`;
        ctx.fillStyle = PAL.cream;
        ctx.fillText("Night falls", W/2, H * 0.22);
        ctx.restore();
      }
    }
    
    // Hit Flash
    if(game.hitFlash > 0) {
      const flashIntensity = game.hitFlash / 0.35;
      if(game.hitFlash > 0.35 - 0.06) {
        ctx.fillStyle = 'rgba(255,230,190,0.18)';
        ctx.fillRect(0, 0, W, H);
      }
      const grad = ctx.createRadialGradient(W/2, H/2, Math.min(W,H)*0.3, W/2, H/2, Math.max(W,H)*0.75);
      grad.addColorStop(0, 'rgba(184,96,107,0)');
      grad.addColorStop(1, `rgba(184,96,107,${0.6 * flashIntensity})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }
  }
  
  ctx.restore();
}

// --- MAIN LOOP ---
function loop(now) {
  requestAnimationFrame(loop);
  
  const dt = Math.min((now - lastTime) / 1000, 0.033);
  lastTime = now;
  
  if(game.hitFlash > 0) game.hitFlash -= dt;
  
  update(dt);
  
  if(game.hitStop > 0) {
     // Already drawn in update
  } else {
     draw();
  }
}

requestAnimationFrame(loop);

// Helper
function lerp(a, b, t) { return a + (b - a) * t; }
