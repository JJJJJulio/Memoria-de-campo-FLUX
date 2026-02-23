(() => {
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d", { alpha: false });
  const hud = document.getElementById("hud");

  // 5) MEMORIA LOCAL
  // Propósito: mantener huella entre sesiones para que la obra cambie sutilmente.
  // Variables: seed, energyLevel, variation, hudVisible.
  // Lógica: carga inicial + guardado periódico y al salir.
  const STORAGE_KEY = "memoria.flux.state.v4";
  const memory = loadMemory();

  // 4) MÁQUINA DE ESTADOS
  // Propósito: transición temporal contemplativa y evento ritual.
  // Variables: current, startMs, ritualUntil, residue, energy.
  // Lógica: latencia (0-3), emergencia (3-12), resonancia (12+) y ritual temporal por click/comando.
  const machine = {
    startMs: performance.now(),
    current: "latencia",
    ritualUntil: 0,
    residue: 0,
    energy: memory.energyLevel,
  };

  // 3) CAMPO DE INTERACCIÓN
  // Propósito: traducir puntero y comandos en fuerza viva, clara pero minimalista.
  // Variables: coordenadas, velocidad, actividad, pulso de comandos.
  // Lógica: pointermove genera viento por distancia/velocidad; click dispara ritual radial.
  const input = {
    x: 0,
    y: 0,
    speed: 0,
    active: false,
    lastMoveMs: 0,
    commandPulse: 0,
    pointerDown: false,
    rightDown: false,
    revealBoost: 0,
    lastInteractionMs: 0,
    chakanaGrip: {
      x: 0,
      y: 0,
      strength: 0,
    },
  };

  // 1) MOTOR DE PARTÍCULAS
  // Propósito: materia atmosférica con 3 tamaños y auto-optimización por FPS.
  // Variables: particles, targetCount, fpsAvg.
  // Lógica: integración de fuerzas, amortiguación y poda/crecimiento gradual.
  const particles = [];
  const range = { min: 1200, max: 1800 };
  let targetCount = clamp(1380 + Math.floor(memory.variation * 300), range.min, range.max);
  let fpsAvg = 60;

  // 2) GENERADOR MATEMÁTICO DE CHAKANA
  // Propósito: concretar visualmente la chakana real (escalones + círculo central vacío).
  // Variables: chakanaPoints, chakanaScale, formation.
  // Lógica: máscara implícita sobre rejilla + capa de revelado + anclaje parcial de partículas.
  let chakanaPoints = [];
  let chakanaScale = 1;
  let formation = 0;

  // 6) RENDER
  // Propósito: contraste sobrio y resultado legible, no neón/no arcade.
  // Variables: viewport, tiempo, onda ritual.
  // Lógica: fondo con estela larga + guía de forma + partículas cálidas.
  let w = 1;
  let h = 1;
  let dpr = 1;
  let cx = 0;
  let cy = 0;
  let phase = 0;
  let lastMs = performance.now();
  let ritualWave = 0;
  let ritualCenter = { x: 0, y: 0 };
  let visibilityEnergy = 0.18;

  const rand = rngFactory(memory.seed);

  function loadMemory() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return {
        seed: Number.isFinite(raw.seed) ? raw.seed : Math.floor(Math.random() * 2 ** 31),
        energyLevel: Number.isFinite(raw.energyLevel) ? raw.energyLevel : 0.3,
        variation: Number.isFinite(raw.variation) ? raw.variation : Math.random(),
        hudVisible: raw.hudVisible !== false,
      };
    } catch (_) {
      return {
        seed: Math.floor(Math.random() * 2 ** 31),
        energyLevel: 0.3,
        variation: Math.random(),
        hudVisible: true,
      };
    }
  }

  function saveMemory() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        seed: memory.seed >>> 0,
        energyLevel: Number(machine.energy.toFixed(4)),
        variation: Number(memory.variation.toFixed(4)),
        hudVisible: !hud.classList.contains("hidden"),
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

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = window.innerWidth;
    h = window.innerHeight;
    cx = w * 0.5;
    cy = h * 0.5;

    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    buildChakana();
  }

  function chakanaMask(nx, ny) {
    const ax = Math.abs(nx);
    const ay = Math.abs(ny);

    const core = ax <= 0.96 && ay <= 0.96;
    const step1 = (ax <= 1.42 && ay <= 0.58) || (ax <= 0.58 && ay <= 1.42);
    const step2 = (ax <= 1.86 && ay <= 0.30) || (ax <= 0.30 && ay <= 1.86);
    const inShape = core || step1 || step2;

    const hole = nx * nx + ny * ny < 0.205;
    return inShape && !hole;
  }

  function buildChakana() {
    const grid = 140;
    const s = Math.min(w, h) * 0.22;
    chakanaScale = s;
    chakanaPoints = [];

    for (let gy = 0; gy < grid; gy += 1) {
      for (let gx = 0; gx < grid; gx += 1) {
        const nx = (gx / (grid - 1)) * 4 - 2;
        const ny = (gy / (grid - 1)) * 4 - 2;
        if (!chakanaMask(nx, ny)) continue;

        const radial = clamp(Math.hypot(nx, ny) / 1.85, 0, 1);
        const armBias = clamp(Math.max(Math.abs(nx), Math.abs(ny)) / 1.9, 0, 1);

        chakanaPoints.push({
          x: cx + nx * s,
          y: cy + ny * s,
          layer: clamp(radial * 0.65 + armBias * 0.35, 0, 1),
        });
      }
    }
  }

  function createParticle() {
    const r = rand();
    const tier = r < 0.6 ? 0 : r < 0.9 ? 1 : 2;
    const size = tier === 0 ? 0.6 + rand() * 0.7 : tier === 1 ? 1.1 + rand() * 1 : 1.9 + rand() * 1.2;

    return {
      x: rand() * w,
      y: rand() * h,
      vx: (rand() - 0.5) * 0.11,
      vy: (rand() - 0.5) * 0.11,
      size,
      tier,
      warmth: 32 + rand() * 12,
      life: 190 + rand() * 260,
      target: Math.floor(rand() * Math.max(1, chakanaPoints.length)),
      lock: rand() < 0.34,
    };
  }

  function ensureParticles() {
    while (particles.length < targetCount) particles.push(createParticle());
  }

  function updateMachine(nowMs) {
    const sec = (nowMs - machine.startMs) / 1000;
    if (sec < 3) machine.current = "latencia";
    else if (sec < 12) machine.current = "emergencia";
    else machine.current = "resonancia";

    ritualWave = 0;
    if (nowMs < machine.ritualUntil) {
      machine.current = "ritual";
      ritualWave = (machine.ritualUntil - nowMs) / 1650;
    }

    machine.residue = Math.max(0, machine.residue * 0.994 - 0.0005);
    input.commandPulse = Math.max(0, input.commandPulse * 0.965 - 0.004);
    input.revealBoost = Math.max(0, input.revealBoost * 0.988 - 0.0012);

    const targetEnergy =
      machine.current === "latencia"
        ? 0.24
        : machine.current === "emergencia"
          ? 0.37
          : machine.current === "resonancia"
            ? 0.52
            : 0.68;

    machine.energy += (targetEnergy - machine.energy) * 0.02;

    // Respiración de visibilidad: aparece con interacción y vuelve a ocultarse lentamente.
    const idleMs = nowMs - (input.lastInteractionMs || machine.startMs);
    const idleFactor = clamp((idleMs - 900) / 9500, 0, 1);
    const targetVisibility = 0.12 + input.revealBoost * 0.82 + ritualWave * 0.3 + (1 - idleFactor) * 0.08;
    const blend = idleFactor > 0.65 ? 0.009 : 0.02;
    visibilityEnergy += (targetVisibility - visibilityEnergy) * blend;
    visibilityEnergy = clamp(visibilityEnergy, 0.08, 1);
  }

  function optimizeParticles(dtMs) {
    const fps = 1000 / Math.max(1, dtMs);
    fpsAvg = fpsAvg * 0.96 + fps * 0.04;

    if (fpsAvg < 40 && targetCount > range.min) targetCount -= 10;
    if (fpsAvg > 57 && targetCount < range.max) targetCount += 5;

    if (particles.length > targetCount) {
      particles.splice(0, Math.min(18, particles.length - targetCount));
    }
  }

  function fieldForParticle(p, dtMs) {
    const t = chakanaPoints[p.target] || { x: cx, y: cy, layer: 0.5 };
    const dx = t.x - p.x;
    const dy = t.y - p.y;
    const dist = Math.hypot(dx, dy) + 0.001;

    const reveal = clamp((formation - t.layer * 0.8) * 2.5, 0, 1);
    const pull = 0.003 + reveal * 0.04;

    let fx = (dx / dist) * pull;
    let fy = (dy / dist) * pull;

    const nx = (p.x - cx) / (chakanaScale * 2.5);
    const ny = (p.y - cy) / (chakanaScale * 2.5);
    const swirl = Math.sin(nx * 1.32 + phase * 0.33) * Math.cos(ny * 1.24 - phase * 0.3);

    fx += -ny * swirl * 0.0023;
    fy += nx * swirl * 0.0023;

    fx += Math.sin((p.y + phase * 50) * 0.0042) * machine.residue * 0.011;
    fy += Math.cos((p.x - phase * 50) * 0.0042) * machine.residue * 0.011;

    if (ritualWave > 0) {
      const rx = p.x - ritualCenter.x;
      const ry = p.y - ritualCenter.y;
      const rr = Math.hypot(rx, ry) + 0.001;
      const wave = Math.sin(rr * 0.028 - (1 - ritualWave) * 10.8) * ritualWave;
      fx += (rx / rr) * wave * 0.014;
      fy += (ry / rr) * wave * 0.014;
    }

    return { fx: fx * dtMs * 0.06, fy: fy * dtMs * 0.06, reveal };
  }

  function applyPointerWind(p, dtMs) {
    if (!input.active) return;
    const dx = p.x - input.x;
    const dy = p.y - input.y;
    const d = Math.hypot(dx, dy) + 1;

    const influence = clamp(1 - d / (Math.min(w, h) * 0.55), 0, 1);
    const turbulence = clamp(input.speed * 0.42, 0, 10.2);
    const pressBoost = input.pointerDown ? 1.45 : 1;
    const wind = turbulence * influence * pressBoost;

    p.vx += (dx / d) * wind * dtMs * 0.011;
    p.vy += (dy / d) * wind * dtMs * 0.011;
  }


  function applyChakanaGrip(p, dtMs) {
    if (!input.rightDown) return;
    if (!p.lock) return;

    // Polaridad: punto de atracción en el cursor y punto espejo de repulsión en eje central.
    const ax = input.chakanaGrip.x;
    const ay = input.chakanaGrip.y;
    const bx = cx - (ax - cx);
    const by = cy - (ay - cy);

    const adx = ax - p.x;
    const ady = ay - p.y;
    const bdx = p.x - bx;
    const bdy = p.y - by;

    const da = Math.hypot(adx, ady) + 1;
    const db = Math.hypot(bdx, bdy) + 1;

    const attract = input.chakanaGrip.strength * 0.026;
    const repel = input.chakanaGrip.strength * 0.018;

    p.vx += (adx / da) * attract * dtMs;
    p.vy += (ady / da) * attract * dtMs;
    p.vx += (bdx / db) * repel * dtMs;
    p.vy += (bdy / db) * repel * dtMs;
  }

  function updateParticles(dtMs) {
    ensureParticles();

    const drag = 0.988 - machine.energy * 0.035;
    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];
      const f = fieldForParticle(p, dtMs);

      p.vx += f.fx;
      p.vy += f.fy;

      applyPointerWind(p, dtMs);
      applyChakanaGrip(p, dtMs);

      if (p.lock && f.reveal > 0.74) {
        // Anclaje parcial para concretar la forma de la chakana cuando ya emergió.
        p.vx *= 0.64;
        p.vy *= 0.64;
      }

      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx;
      p.y += p.vy;
      p.life -= dtMs * 0.01;

      if (p.x < -30 || p.x > w + 30 || p.y < -30 || p.y > h + 30 || p.life <= 0) {
        particles[i] = createParticle();
        continue;
      }

      if ((i + phase * 150) % 240 < 1) {
        p.target = Math.floor(rand() * Math.max(1, chakanaPoints.length));
      }
    }
  }

  function drawChakanaGuide() {
    // Capa visual más sólida para que la chakana se termine de leer claramente.
    const denseAlpha = (0.02 + formation * 0.2) * visibilityEnergy;
    const step = 4;

    for (let i = 0; i < chakanaPoints.length; i += step) {
      const p = chakanaPoints[i];
      const reveal = clamp((formation - p.layer * 0.75) * 2.4, 0, 1) * visibilityEnergy;
      if (reveal <= 0) continue;
      ctx.fillStyle = `rgba(234,230,222,${denseAlpha * reveal})`;
      ctx.fillRect(p.x - 1.0, p.y - 1.0, 2.0, 2.0);
    }
  }

  function drawParticles() {
    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];
      const light = p.tier === 0 ? 78 : p.tier === 1 ? 84 : 91;
      const base = p.tier === 0 ? 0.24 : p.tier === 1 ? 0.37 : 0.5;
      const alpha = clamp(base + formation * 0.1 + visibilityEnergy * 0.16 + ritualWave * 0.15 + input.commandPulse * 0.1, 0.08, 0.9);

      ctx.fillStyle = `hsla(${p.warmth}, 17%, ${light}%, ${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function render(nowMs, dtMs) {
    ctx.fillStyle = "rgba(11,11,13,0.12)";
    ctx.fillRect(0, 0, w, h);

    drawChakanaGuide();
    drawParticles();

    const veil = clamp(0.042 - machine.energy * 0.014, 0.01, 0.06);
    ctx.fillStyle = `rgba(7,7,9,${veil})`;
    ctx.fillRect(0, 0, w, h);

    if (nowMs - machine.startMs > 2600 && (nowMs - machine.startMs) % 3500 < dtMs) saveMemory();
  }

  function ritualAt(x, y) {
    ritualCenter = { x, y };
    machine.ritualUntil = performance.now() + 1700;
    machine.residue = clamp(machine.residue + 0.5, 0, 1.2);
    machine.energy = clamp(machine.energy + 0.13, 0, 1);
    input.commandPulse = clamp(input.commandPulse + 0.22, 0, 1);
    input.revealBoost = clamp(input.revealBoost + 0.3, 0, 1.5);
    input.lastInteractionMs = performance.now();

    memory.variation = (memory.variation * 0.9 + Math.random() * 0.1) % 1;
    memory.seed = (memory.seed + Math.floor(Math.random() * 991)) >>> 0;

    for (let i = 0; i < particles.length; i += 1) {
      if (Math.random() < 0.34) {
        particles[i].target = Math.floor(Math.random() * Math.max(1, chakanaPoints.length));
      }
    }
    saveMemory();
  }

  function toggleHud() {
    hud.classList.toggle("hidden");
    saveMemory();
  }

  function frame(nowMs) {
    const dtMs = nowMs - lastMs;
    lastMs = nowMs;
    phase += dtMs * 0.001;

    formation = clamp((nowMs - machine.startMs) / 10800, 0, 1);

    updateMachine(nowMs);
    optimizeParticles(dtMs);
    updateParticles(dtMs);
    render(nowMs, dtMs);

    requestAnimationFrame(frame);
  }

  canvas.addEventListener("pointerenter", (ev) => {
    input.active = true;
    input.x = ev.clientX;
    input.y = ev.clientY;
    input.lastInteractionMs = performance.now();
  });

  canvas.addEventListener("pointermove", (ev) => {
    const now = performance.now();
    const dx = ev.clientX - input.x;
    const dy = ev.clientY - input.y;
    const dt = Math.max(8, now - (input.lastMoveMs || now - 16));

    input.x = ev.clientX;
    input.y = ev.clientY;
    input.speed = Math.hypot(dx, dy) / dt;
    input.lastMoveMs = now;
    input.active = true;
    const speedNorm = clamp(input.speed * 0.22, 0, 1);
    input.revealBoost = clamp(input.revealBoost + speedNorm * 0.08 + 0.007, 0, 1.4);
    input.lastInteractionMs = now;

    if (input.rightDown) {
      input.chakanaGrip.x = ev.clientX;
      input.chakanaGrip.y = ev.clientY;
    }
  });

  canvas.addEventListener("pointerdown", (ev) => {
    input.lastInteractionMs = performance.now();

    if (ev.button === 0) {
      input.pointerDown = true;
      ritualAt(ev.clientX, ev.clientY);
      return;
    }

    if (ev.button === 2) {
      input.rightDown = true;
      input.chakanaGrip.x = ev.clientX;
      input.chakanaGrip.y = ev.clientY;
      input.chakanaGrip.strength = 1;
      input.revealBoost = clamp(input.revealBoost + 0.14, 0, 1.5);
    }
  });

  window.addEventListener("pointerup", (ev) => {
    if (ev.button === 0) input.pointerDown = false;
    if (ev.button === 2) {
      input.rightDown = false;
      input.chakanaGrip.strength = 0;
    }
  });

  canvas.addEventListener("pointerleave", () => {
    input.active = false;
    input.speed = 0;
    input.rightDown = false;
    input.chakanaGrip.strength = 0;
  });

  canvas.addEventListener("contextmenu", (ev) => {
    ev.preventDefault();
  });

  window.addEventListener("keydown", (ev) => {
    if (ev.key === "r" || ev.key === "R") ritualAt(cx, cy);
    if (ev.key === "c" || ev.key === "C") {
      machine.energy = clamp(machine.energy - 0.1, 0, 1);
      machine.residue = clamp(machine.residue - 0.2, 0, 1.2);
      input.commandPulse = clamp(input.commandPulse + 0.05, 0, 1);
      input.revealBoost = clamp(input.revealBoost + 0.06, 0, 1.5);
      input.lastInteractionMs = performance.now();
    }
    if (ev.key === "m" || ev.key === "M") {
      memory.variation = (memory.variation + 0.041) % 1;
      targetCount = clamp(1300 + Math.floor(memory.variation * 420), range.min, range.max);
      input.commandPulse = clamp(input.commandPulse + 0.08, 0, 1);
      input.revealBoost = clamp(input.revealBoost + 0.08, 0, 1.5);
      input.lastInteractionMs = performance.now();
      saveMemory();
    }
    if (ev.key === "h" || ev.key === "H") toggleHud();
  });

  window.addEventListener("resize", resize);
  window.addEventListener("beforeunload", saveMemory);

  if (!memory.hudVisible) hud.classList.add("hidden");

  resize();
  ensureParticles();
  ctx.fillStyle = "#0b0b0d";
  ctx.fillRect(0, 0, w, h);

  requestAnimationFrame((t) => {
    lastMs = t;
    frame(t);
  });
})();
