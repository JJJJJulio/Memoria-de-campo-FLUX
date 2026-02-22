(() => {
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d", { alpha: false });

  // 5) Memoria local
  // Propósito: conservar una huella sutil entre sesiones (seed, energía y variación).
  const STORAGE_KEY = "memoria.flux.state.v2";
  const persisted = loadMemory();

  // 4) Máquina de estados
  // Propósito: organizar la evolución emocional y visual del sistema en fases suaves.
  const machine = {
    startTime: performance.now(),
    current: "latencia",
    ritualUntil: 0,
    residue: 0,
    energy: persisted.energyLevel,
  };

  // 3) Campo de interacción
  // Propósito: transformar movimiento/click del usuario en viento, turbulencia y ritual.
  const pointer = {
    x: 0,
    y: 0,
    px: 0,
    py: 0,
    speed: 0,
    active: false,
    lastMoveTime: 0,
  };

  // 1) Motor de partículas
  // Propósito: simular materia viva con tres escalas y auto-optimización por FPS.
  const particles = [];
  const targetRange = { min: 1200, max: 1800 };
  let targetCount = clamp(1400 + Math.floor(persisted.variation * 350), targetRange.min, targetRange.max);

  // 2) Generador matemático de chakana
  // Propósito: crear una figura reconocible (grid 9x9) como campo de atracción gradual.
  let chakanaTargets = [];
  let chakanaScale = 1;
  let centerX = 0;
  let centerY = 0;
  let w = 1;
  let h = 1;

  // Render / tiempo
  let dpr = 1;
  let lastTime = performance.now();
  let formation = 0;
  let ritualWave = 0;
  let ritualCenter = { x: 0, y: 0 };
  let phase = 0;

  // Métricas para auto-optimización.
  let fpsAvg = 60;

  function loadMemory() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return {
        seed: Number.isFinite(raw.seed) ? raw.seed : Math.floor(Math.random() * 1e9),
        energyLevel: Number.isFinite(raw.energyLevel) ? raw.energyLevel : 0.32,
        variation: Number.isFinite(raw.variation) ? raw.variation : Math.random(),
      };
    } catch (_) {
      return {
        seed: Math.floor(Math.random() * 1e9),
        energyLevel: 0.32,
        variation: Math.random(),
      };
    }
  }

  function saveMemory() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        seed: persisted.seed,
        energyLevel: Number(machine.energy.toFixed(4)),
        variation: Number(persisted.variation.toFixed(4)),
      }),
    );
  }

  function rngFactory(seed) {
    let s = seed >>> 0;
    return () => {
      s = (1664525 * s + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  const rand = rngFactory(persisted.seed);

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    centerX = w * 0.5;
    centerY = h * 0.5;
    buildChakanaTargets();
  }

  function buildChakanaTargets() {
    const gridSize = 9;
    const cell = Math.min(w, h) * 0.055;
    chakanaScale = cell;

    const pattern = [
      [0, 0, 1, 1, 1, 1, 1, 0, 0],
      [0, 0, 1, 1, 1, 1, 1, 0, 0],
      [1, 1, 1, 0, 0, 0, 1, 1, 1],
      [1, 1, 0, 0, 1, 0, 0, 1, 1],
      [1, 1, 0, 1, 1, 1, 0, 1, 1],
      [1, 1, 0, 0, 1, 0, 0, 1, 1],
      [1, 1, 1, 0, 0, 0, 1, 1, 1],
      [0, 0, 1, 1, 1, 1, 1, 0, 0],
      [0, 0, 1, 1, 1, 1, 1, 0, 0],
    ];

    chakanaTargets = [];
    const offset = (gridSize - 1) * 0.5;

    for (let gy = 0; gy < gridSize; gy += 1) {
      for (let gx = 0; gx < gridSize; gx += 1) {
        if (pattern[gy][gx] === 0) continue;
        const tx = centerX + (gx - offset) * cell;
        const ty = centerY + (gy - offset) * cell;
        chakanaTargets.push({ x: tx, y: ty });
      }
    }
  }

  function createParticle() {
    const tierPick = rand();
    const tier = tierPick < 0.58 ? 0 : tierPick < 0.88 ? 1 : 2;
    const size = tier === 0 ? 0.7 + rand() * 0.8 : tier === 1 ? 1.2 + rand() * 1 : 2 + rand() * 1.4;

    return {
      x: rand() * w,
      y: rand() * h,
      vx: (rand() - 0.5) * 0.2,
      vy: (rand() - 0.5) * 0.2,
      size,
      tier,
      warmth: 38 + rand() * 14,
      life: 120 + rand() * 280,
      targetIndex: Math.floor(rand() * Math.max(chakanaTargets.length, 1)),
    };
  }

  function fillParticles() {
    while (particles.length < targetCount) particles.push(createParticle());
  }

  function updateState(now) {
    const t = (now - machine.startTime) / 1000;
    if (t < 3) machine.current = "latencia";
    else if (t < 12) machine.current = "emergencia";
    else machine.current = "resonancia";

    if (now < machine.ritualUntil) {
      machine.current = "ritual";
      ritualWave = (machine.ritualUntil - now) / 1500;
    } else {
      ritualWave = 0;
    }

    machine.residue = Math.max(0, machine.residue * 0.993 - 0.0006);

    const targetEnergy =
      machine.current === "latencia"
        ? 0.24
        : machine.current === "emergencia"
          ? 0.38
          : machine.current === "resonancia"
            ? 0.52
            : 0.68;

    machine.energy += (targetEnergy - machine.energy) * 0.02;
  }

  function measureFps(dt) {
    const fps = 1000 / Math.max(1, dt);
    fpsAvg = fpsAvg * 0.97 + fps * 0.03;

    if (fpsAvg < 40 && targetCount > targetRange.min) targetCount -= 8;
    if (fpsAvg > 56 && targetCount < targetRange.max) targetCount += 4;

    if (particles.length > targetCount) {
      particles.splice(0, Math.min(12, particles.length - targetCount));
    }
  }

  function chakanaField(px, py, p, dt) {
    const target = chakanaTargets[p.targetIndex % chakanaTargets.length] || { x: centerX, y: centerY };
    const dx = target.x - px;
    const dy = target.y - py;
    const dist = Math.hypot(dx, dy) + 0.001;

    // Formación gradual: 10–12 s para que la figura emerja claramente.
    const formStrength = 0.02 + formation * 0.2;
    let fx = (dx / dist) * formStrength;
    let fy = (dy / dist) * formStrength;

    // Campo atmosférico lento, no neon ni arcade.
    const nx = (px - centerX) / (chakanaScale * 4.6);
    const ny = (py - centerY) / (chakanaScale * 4.6);
    const swirl = Math.sin(nx * 1.2 + phase * 0.2) * Math.cos(ny * 1.15 - phase * 0.2);
    fx += -ny * 0.0036 * swirl;
    fy += nx * 0.0036 * swirl;

    // Residuo: ligera memoria cinética tras ritual.
    fx += machine.residue * Math.sin((py + phase * 30) * 0.004) * 0.02;
    fy += machine.residue * Math.cos((px - phase * 30) * 0.004) * 0.02;

    // Onda radial de ritual desde el centro del click.
    if (ritualWave > 0) {
      const rx = px - ritualCenter.x;
      const ry = py - ritualCenter.y;
      const rr = Math.hypot(rx, ry) + 0.001;
      const wave = Math.sin(rr * 0.035 - (1 - ritualWave) * 10) * ritualWave;
      fx += (rx / rr) * wave * 0.02;
      fy += (ry / rr) * wave * 0.02;
    }

    return { fx: fx * dt * 0.06, fy: fy * dt * 0.06 };
  }

  function applyInteraction(p, dt) {
    if (!pointer.active) return;
    const dx = p.x - pointer.x;
    const dy = p.y - pointer.y;
    const d = Math.hypot(dx, dy) + 1;
    const influence = clamp(1 - d / (Math.min(w, h) * 0.42), 0, 1);

    // Velocidad del mouse -> turbulencia; distancia -> influencia.
    const turbulence = clamp(pointer.speed * 0.06, 0, 4.2);
    const wind = turbulence * influence;
    p.vx += (dx / d) * wind * dt * 0.012;
    p.vy += (dy / d) * wind * dt * 0.012;
  }

  function updateParticles(dt) {
    fillParticles();
    const calm = 0.985 - machine.energy * 0.04;

    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];
      const { fx, fy } = chakanaField(p.x, p.y, p, dt);
      p.vx += fx;
      p.vy += fy;

      applyInteraction(p, dt);

      p.vx *= calm;
      p.vy *= calm;
      p.x += p.vx;
      p.y += p.vy;
      p.life -= dt * 0.013;

      if (p.x < -30 || p.x > w + 30 || p.y < -30 || p.y > h + 30 || p.life <= 0) {
        particles[i] = createParticle();
        continue;
      }

      if ((i + phase * 100) % 280 < 1) {
        p.targetIndex = (p.targetIndex + 1) % Math.max(chakanaTargets.length, 1);
      }
    }
  }

  function draw(now, dt) {
    // 6) Render
    // Propósito: alto contraste, contemplación y visibilidad de la chakana sin UI.
    ctx.fillStyle = "rgba(11,11,13,0.16)";
    ctx.fillRect(0, 0, w, h);

    // Guía casi invisible de la chakana para reforzar reconocimiento formal.
    const guideAlpha = 0.02 + formation * 0.09;
    for (let i = 0; i < chakanaTargets.length; i += 1) {
      const t = chakanaTargets[i];
      ctx.fillStyle = `rgba(242,236,224,${guideAlpha})`;
      ctx.fillRect(t.x - chakanaScale * 0.16, t.y - chakanaScale * 0.16, chakanaScale * 0.32, chakanaScale * 0.32);
    }

    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];
      const brightness = p.tier === 0 ? 78 : p.tier === 1 ? 84 : 90;
      const alphaBase = p.tier === 0 ? 0.23 : p.tier === 1 ? 0.33 : 0.44;
      const alpha = alphaBase + formation * 0.22 + ritualWave * 0.15;
      ctx.fillStyle = `hsla(${p.warmth}, 22%, ${brightness}%, ${clamp(alpha, 0.1, 0.9)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Velo sutil para una elegancia silenciosa.
    const veil = 0.05 - machine.energy * 0.02;
    ctx.fillStyle = `rgba(5,5,7,${clamp(veil, 0.012, 0.06)})`;
    ctx.fillRect(0, 0, w, h);

    if (now - machine.startTime > 2500 && (now - machine.startTime) % 3500 < dt) {
      saveMemory();
    }
  }

  function tick(now) {
    const dt = now - lastTime;
    lastTime = now;
    phase += dt * 0.001;

    formation = clamp((now - machine.startTime) / 11000, 0, 1);

    updateState(now);
    measureFps(dt);
    updateParticles(dt);
    draw(now, dt);

    requestAnimationFrame(tick);
  }

  canvas.addEventListener("pointermove", (ev) => {
    const now = performance.now();
    const dx = ev.clientX - pointer.x;
    const dy = ev.clientY - pointer.y;
    const dt = Math.max(16, now - (pointer.lastMoveTime || now - 16));

    pointer.px = pointer.x;
    pointer.py = pointer.y;
    pointer.x = ev.clientX;
    pointer.y = ev.clientY;
    pointer.speed = Math.hypot(dx, dy) / dt;
    pointer.active = true;
    pointer.lastMoveTime = now;
  });

  canvas.addEventListener("pointerleave", () => {
    pointer.active = false;
    pointer.speed = 0;
  });

  canvas.addEventListener("click", (ev) => {
    ritualCenter.x = ev.clientX;
    ritualCenter.y = ev.clientY;
    machine.ritualUntil = performance.now() + 1600;
    machine.residue = clamp(machine.residue + 0.45, 0, 1.2);
    machine.energy = clamp(machine.energy + 0.1, 0, 1);

    persisted.variation = (persisted.variation * 0.88 + Math.random() * 0.12) % 1;
    persisted.seed = (persisted.seed + Math.floor(Math.random() * 977)) >>> 0;
    saveMemory();

    // Ligera reorganización de objetivos tras ritual.
    for (let i = 0; i < particles.length; i += 1) {
      if (Math.random() < 0.3) {
        particles[i].targetIndex = Math.floor(Math.random() * Math.max(chakanaTargets.length, 1));
      }
    }
  });

  window.addEventListener("resize", resize);
  window.addEventListener("beforeunload", saveMemory);

  resize();
  fillParticles();
  ctx.fillStyle = "#0b0b0d";
  ctx.fillRect(0, 0, w, h);
  requestAnimationFrame((t) => {
    lastTime = t;
    tick(t);
  });
})();
