(() => {
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d", { alpha: false });

  // 5) MEMORIA LOCAL
  // Propósito: persistir huella suave entre sesiones.
  // Variables: seed (aleatoriedad estable), energyLevel (intensidad global), variation (matiz de comportamiento).
  // Lógica: leer al iniciar, aplicar en parámetros base y guardar periódicamente + beforeunload.
  const STORAGE_KEY = "memoria.flux.state.v3";
  const memory = loadMemory();

  // 4) MÁQUINA DE ESTADOS
  // Propósito: modular el ritmo contemplativo en fases temporales.
  // Variables: current, startMs, ritualUntil, residue, energy.
  // Lógica: estado por tiempo (latencia/emergencia/resonancia), evento ritual temporal y cola de residuo.
  const machine = {
    startMs: performance.now(),
    current: "latencia",
    ritualUntil: 0,
    residue: 0,
    energy: memory.energyLevel,
  };

  // 3) CAMPO DE INTERACCIÓN
  // Propósito: interacción sutil, orgánica y minimalista.
  // Variables: posición/velocidad del puntero + comandos discretos de teclado.
  // Lógica: pointermove crea viento por velocidad y distancia; click genera ritual; teclas discretas afectan energía.
  const input = {
    x: 0,
    y: 0,
    speed: 0,
    active: false,
    lastMoveMs: 0,
    commandPulse: 0,
  };

  // 1) MOTOR DE PARTÍCULAS
  // Propósito: sistema vivo de 3 escalas con auto-optimización por FPS.
  // Variables: particles, targetCount (1200-1800), fpsAvg.
  // Lógica: actualizar fuerzas, amortiguar, reinyectar y ajustar volumen según rendimiento.
  const particles = [];
  const range = { min: 1200, max: 1800 };
  let targetCount = clamp(1320 + Math.floor(memory.variation * 380), range.min, range.max);
  let fpsAvg = 60;

  // 2) GENERADOR MATEMÁTICO DE CHAKANA
  // Propósito: representar la chakana real (escalonada con vacío circular central).
  // Variables: chakanaPoints, geometryScale, formation.
  // Lógica: muestrear una rejilla y conservar puntos que pertenecen a una función implícita de la forma.
  let chakanaPoints = [];
  let geometryScale = 1;
  let formation = 0;

  // 6) RENDER
  // Propósito: mantener negro profundo, contraste alto y presencia silenciosa.
  // Variables: dimensiones, dpr, phase.
  // Lógica: fondo con estela larga + guía tenue + partículas cálidas de alta legibilidad.
  let w = 1;
  let h = 1;
  let dpr = 1;
  let cx = 0;
  let cy = 0;
  let lastMs = performance.now();
  let phase = 0;
  let ritualWave = 0;
  let ritualCenter = { x: 0, y: 0 };

  const rand = rngFactory(memory.seed);

  function loadMemory() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return {
        seed: Number.isFinite(raw.seed) ? raw.seed : Math.floor(Math.random() * 2 ** 31),
        energyLevel: Number.isFinite(raw.energyLevel) ? raw.energyLevel : 0.3,
        variation: Number.isFinite(raw.variation) ? raw.variation : Math.random(),
      };
    } catch (_) {
      return { seed: Math.floor(Math.random() * 2 ** 31), energyLevel: 0.3, variation: Math.random() };
    }
  }

  function saveMemory() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        seed: memory.seed >>> 0,
        energyLevel: Number(machine.energy.toFixed(4)),
        variation: Number(memory.variation.toFixed(4)),
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

    const core = ax <= 1.0 && ay <= 1.0;
    const armMidV = ax <= 0.58 && ay <= 1.42;
    const armMidH = ax <= 1.42 && ay <= 0.58;
    const armTipV = ax <= 0.31 && ay <= 1.78;
    const armTipH = ax <= 1.78 && ay <= 0.31;

    const inShape = core || armMidV || armMidH || armTipV || armTipH;
    const hole = nx * nx + ny * ny < 0.23;

    return inShape && !hole;
  }

  function buildChakana() {
    const grid = 120;
    const s = Math.min(w, h) * 0.235;
    geometryScale = s;
    chakanaPoints = [];

    for (let gy = 0; gy < grid; gy += 1) {
      for (let gx = 0; gx < grid; gx += 1) {
        const nx = (gx / (grid - 1)) * 4 - 2;
        const ny = (gy / (grid - 1)) * 4 - 2;
        if (!chakanaMask(nx, ny)) continue;

        // Sesgo por capas para que emerja desde el centro hacia la forma completa.
        const r = Math.hypot(nx, ny);
        const layer = clamp(r / 1.8, 0, 1);

        chakanaPoints.push({
          x: cx + nx * s,
          y: cy + ny * s,
          layer,
        });
      }
    }
  }

  function createParticle() {
    const k = rand();
    const tier = k < 0.6 ? 0 : k < 0.9 ? 1 : 2;
    const size = tier === 0 ? 0.6 + rand() * 0.65 : tier === 1 ? 1.1 + rand() * 0.9 : 1.8 + rand() * 1.2;

    return {
      x: rand() * w,
      y: rand() * h,
      vx: (rand() - 0.5) * 0.08,
      vy: (rand() - 0.5) * 0.08,
      size,
      tier,
      life: 180 + rand() * 260,
      warmth: 33 + rand() * 12,
      target: Math.floor(rand() * Math.max(1, chakanaPoints.length)),
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
      ritualWave = (machine.ritualUntil - nowMs) / 1700;
    }

    machine.residue = Math.max(0, machine.residue * 0.994 - 0.00055);
    input.commandPulse = Math.max(0, input.commandPulse * 0.96 - 0.004);

    const targetEnergy =
      machine.current === "latencia"
        ? 0.24
        : machine.current === "emergencia"
          ? 0.36
          : machine.current === "resonancia"
            ? 0.5
            : 0.67;

    machine.energy += (targetEnergy - machine.energy) * 0.023;
  }

  function optimizeParticles(dtMs) {
    const fps = 1000 / Math.max(1, dtMs);
    fpsAvg = fpsAvg * 0.96 + fps * 0.04;

    if (fpsAvg < 40 && targetCount > range.min) targetCount -= 10;
    if (fpsAvg > 57 && targetCount < range.max) targetCount += 5;

    if (particles.length > targetCount) {
      particles.splice(0, Math.min(20, particles.length - targetCount));
    }
  }

  function fieldForParticle(p, dtMs) {
    const t = chakanaPoints[p.target] || { x: cx, y: cy, layer: 0 };
    const dx = t.x - p.x;
    const dy = t.y - p.y;
    const dist = Math.hypot(dx, dy) + 0.001;

    // Formación 10-12s: primero capas cercanas al centro, luego brazos y puntas.
    const layerFactor = clamp((formation - t.layer * 0.7) * 2.2, 0, 1);
    const pull = 0.004 + layerFactor * 0.03;

    let fx = (dx / dist) * pull;
    let fy = (dy / dist) * pull;

    const nx = (p.x - cx) / (geometryScale * 2.4);
    const ny = (p.y - cy) / (geometryScale * 2.4);
    const swirl = Math.sin(nx * 1.45 + phase * 0.4) * Math.cos(ny * 1.35 - phase * 0.36);
    fx += -ny * swirl * 0.0028;
    fy += nx * swirl * 0.0028;

    fx += Math.sin((p.y + phase * 50) * 0.0043) * machine.residue * 0.012;
    fy += Math.cos((p.x - phase * 50) * 0.0043) * machine.residue * 0.012;

    if (ritualWave > 0) {
      const rx = p.x - ritualCenter.x;
      const ry = p.y - ritualCenter.y;
      const rr = Math.hypot(rx, ry) + 0.001;
      const wave = Math.sin(rr * 0.03 - (1 - ritualWave) * 11) * ritualWave;
      fx += (rx / rr) * wave * 0.012;
      fy += (ry / rr) * wave * 0.012;
    }

    return { fx: fx * dtMs * 0.06, fy: fy * dtMs * 0.06 };
  }

  function applyPointerWind(p, dtMs) {
    if (!input.active) return;
    const dx = p.x - input.x;
    const dy = p.y - input.y;
    const d = Math.hypot(dx, dy) + 1;

    const influence = clamp(1 - d / (Math.min(w, h) * 0.48), 0, 1);
    const turbulence = clamp(input.speed * 0.25, 0, 8.5);
    const wind = turbulence * influence;

    p.vx += (dx / d) * wind * dtMs * 0.010;
    p.vy += (dy / d) * wind * dtMs * 0.010;
  }

  function updateParticles(dtMs) {
    ensureParticles();

    const drag = 0.987 - machine.energy * 0.036;
    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];

      const f = fieldForParticle(p, dtMs);
      p.vx += f.fx;
      p.vy += f.fy;

      applyPointerWind(p, dtMs);

      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx;
      p.y += p.vy;
      p.life -= dtMs * 0.01;

      if (p.x < -24 || p.x > w + 24 || p.y < -24 || p.y > h + 24 || p.life <= 0) {
        particles[i] = createParticle();
        continue;
      }

      if ((i + phase * 150) % 220 < 1) {
        p.target = Math.floor(rand() * Math.max(1, chakanaPoints.length));
      }
    }
  }

  function drawChakanaGuide() {
    const alpha = 0.01 + formation * 0.08;
    const step = 8;
    for (let i = 0; i < chakanaPoints.length; i += step) {
      const p = chakanaPoints[i];
      const reveal = clamp((formation - p.layer * 0.75) * 2.2, 0, 1);
      if (reveal <= 0) continue;
      ctx.fillStyle = `rgba(236,232,224,${alpha * reveal})`;
      ctx.fillRect(p.x - 0.8, p.y - 0.8, 1.6, 1.6);
    }
  }

  function drawParticles() {
    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];
      const light = p.tier === 0 ? 78 : p.tier === 1 ? 84 : 90;
      const alphaBase = p.tier === 0 ? 0.24 : p.tier === 1 ? 0.36 : 0.48;
      const alpha = clamp(alphaBase + formation * 0.19 + ritualWave * 0.12 + input.commandPulse * 0.09, 0.08, 0.88);

      ctx.fillStyle = `hsla(${p.warmth}, 18%, ${light}%, ${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function render(nowMs, dtMs) {
    ctx.fillStyle = "rgba(11,11,13,0.14)";
    ctx.fillRect(0, 0, w, h);

    drawChakanaGuide();
    drawParticles();

    const veil = clamp(0.048 - machine.energy * 0.016, 0.012, 0.06);
    ctx.fillStyle = `rgba(7,7,9,${veil})`;
    ctx.fillRect(0, 0, w, h);

    if (nowMs - machine.startMs > 2800 && (nowMs - machine.startMs) % 3600 < dtMs) saveMemory();
  }

  function ritualAt(x, y) {
    ritualCenter = { x, y };
    machine.ritualUntil = performance.now() + 1700;
    machine.residue = clamp(machine.residue + 0.46, 0, 1.2);
    machine.energy = clamp(machine.energy + 0.12, 0, 1);

    memory.variation = (memory.variation * 0.91 + Math.random() * 0.09) % 1;
    memory.seed = (memory.seed + Math.floor(Math.random() * 997)) >>> 0;
    input.commandPulse = clamp(input.commandPulse + 0.2, 0, 1);

    for (let i = 0; i < particles.length; i += 1) {
      if (Math.random() < 0.33) {
        particles[i].target = Math.floor(Math.random() * Math.max(1, chakanaPoints.length));
      }
    }
    saveMemory();
  }

  function frame(nowMs) {
    const dtMs = nowMs - lastMs;
    lastMs = nowMs;
    phase += dtMs * 0.001;

    formation = clamp((nowMs - machine.startMs) / 11000, 0, 1);

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
  });

  canvas.addEventListener("pointermove", (ev) => {
    const now = performance.now();
    const dx = ev.clientX - input.x;
    const dy = ev.clientY - input.y;
    const dt = Math.max(10, now - (input.lastMoveMs || now - 16));

    input.x = ev.clientX;
    input.y = ev.clientY;
    input.speed = Math.hypot(dx, dy) / dt;
    input.lastMoveMs = now;
    input.active = true;
  });

  canvas.addEventListener("pointerdown", (ev) => {
    ritualAt(ev.clientX, ev.clientY);
  });

  canvas.addEventListener("pointerleave", () => {
    input.active = false;
    input.speed = 0;
  });

  // Comandos interactivos sutiles y minimalistas (sin UI):
  // r = ritual al centro, c = calma (reduce energía), m = mutación leve de variación.
  window.addEventListener("keydown", (ev) => {
    if (ev.key === "r" || ev.key === "R") ritualAt(cx, cy);
    if (ev.key === "c" || ev.key === "C") {
      machine.energy = clamp(machine.energy - 0.08, 0, 1);
      machine.residue = clamp(machine.residue - 0.18, 0, 1.2);
      input.commandPulse = clamp(input.commandPulse + 0.05, 0, 1);
    }
    if (ev.key === "m" || ev.key === "M") {
      memory.variation = (memory.variation + 0.037) % 1;
      input.commandPulse = clamp(input.commandPulse + 0.08, 0, 1);
      targetCount = clamp(1300 + Math.floor(memory.variation * 420), range.min, range.max);
      saveMemory();
    }
  });

  window.addEventListener("resize", resize);
  window.addEventListener("beforeunload", saveMemory);

  resize();
  ensureParticles();
  ctx.fillStyle = "#0b0b0d";
  ctx.fillRect(0, 0, w, h);
  requestAnimationFrame((t) => {
    lastMs = t;
    frame(t);
  });
})();
