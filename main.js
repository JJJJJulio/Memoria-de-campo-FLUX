(() => {
  const hud = document.getElementById("hud");
  const hudState = document.getElementById("hud-state");
  const hudMode = document.getElementById("hud-mode");
  const hudCommand = document.getElementById("hud-command");

  const STORAGE_KEY = "memoria.flux.p5.v1";

  const paletteKlee = [
    [234, 73, 50],
    [255, 233, 66],
    [121, 188, 135],
    [84, 128, 187],
    [240, 160, 115],
    [199, 142, 86],
    [211, 176, 123],
    [179, 142, 146],
    [109, 112, 128],
    [245, 196, 194],
  ];

  const memory = loadMemory();

  const machine = {
    startMs: performance.now(),
    ritualUntil: 0,
    residue: 0,
    energy: memory.energyLevel,
    calmUntil: 0,
  };

  const input = {
    x: 0,
    y: 0,
    speed: 0,
    active: false,
    lastMoveMs: 0,
    lastInteractionMs: 0,
    pointerDown: false,
    rightDown: false,
    revealBoost: 0,
    extractionArmed: !!memory.extractionArmed,
    extractionPulse: 0,
    commandMessageUntil: 0,
    chakanaGrip: { x: 0, y: 0, strength: 0 },
    mode: memory.mode === "palette" ? "palette" : "mono",
  };

  const particles = [];
  const range = { min: 1200, max: 1800 };
  let targetCount = clamp(1380 + Math.floor(memory.variation * 300), range.min, range.max);

  let chakanaPoints = [];
  let w = 1;
  let h = 1;
  let cx = 0;
  let cy = 0;
  let lastMs = performance.now();
  let phase = 0;
  let formation = 0;
  let ritualWave = 0;
  let visibilityEnergy = 0.18;
  let ritualCenter = { x: 0, y: 0 };
  let fpsAvg = 60;

  const rand = rngFactory(memory.seed);

  function loadMemory() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return {
        seed: Number.isFinite(raw.seed) ? raw.seed : Math.floor(Math.random() * 2 ** 31),
        energyLevel: Number.isFinite(raw.energyLevel) ? raw.energyLevel : 0.3,
        variation: Number.isFinite(raw.variation) ? raw.variation : Math.random(),
        hudVisible: raw.hudVisible !== false,
        extractionArmed: raw.extractionArmed === true,
        mode: raw.mode === "palette" ? "palette" : "mono",
      };
    } catch (_) {
      return {
        seed: Math.floor(Math.random() * 2 ** 31),
        energyLevel: 0.3,
        variation: Math.random(),
        hudVisible: true,
        extractionArmed: false,
        mode: "mono",
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
        extractionArmed: input.extractionArmed,
        mode: input.mode,
      }),
    );
  }

  function announceCommand(text) {
    if (!hudCommand) return;
    hudCommand.textContent = `Comando: ${text}`;
    hudCommand.classList.add("active");
    input.commandMessageUntil = performance.now() + 1400;
  }

  function updateHudState() {
    if (hudState) {
      const active = input.extractionArmed || input.rightDown || input.chakanaGrip.strength > 0.08;
      hudState.textContent = active ? "Extracción: activa" : "Extracción: inactiva";
      hudState.classList.toggle("active", active);
    }

    if (hudMode) {
      const txt = input.mode === "mono" ? "Modo: Blanco y negro" : "Modo: Paleta Klee";
      hudMode.textContent = txt;
      hudMode.classList.toggle("active", input.mode === "palette");
    }
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

  function toggleHud() {
    hud.classList.toggle("hidden");
    saveMemory();
  }

  function getParticleColor(p) {
    if (input.mode === "mono") {
      const light = p.lock ? 88 : 78;
      return [light, light, light];
    }
    const c = paletteKlee[p.paletteIndex % paletteKlee.length];
    return c;
  }

  function chakanaMask(nx, ny) {
    const ax = Math.abs(nx);
    const ay = Math.abs(ny);
    const core = ax <= 0.96 && ay <= 0.96;
    const step1 = (ax <= 1.42 && ay <= 0.58) || (ax <= 0.58 && ay <= 1.42);
    const step2 = (ax <= 1.86 && ay <= 0.3) || (ax <= 0.3 && ay <= 1.86);
    const inShape = core || step1 || step2;
    const hole = nx * nx + ny * ny < 0.205;
    return inShape && !hole;
  }

  function buildChakana() {
    const grid = 140;
    const s = Math.min(w, h) * 0.22;
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
    return {
      x: rand() * w,
      y: rand() * h,
      vx: (rand() - 0.5) * 0.11,
      vy: (rand() - 0.5) * 0.11,
      tier,
      size: tier === 0 ? 0.7 + rand() * 0.6 : tier === 1 ? 1.2 + rand() * 0.8 : 2 + rand() * 1.1,
      target: Math.floor(rand() * Math.max(1, chakanaPoints.length)),
      lock: rand() < 0.34,
      life: 190 + rand() * 260,
      paletteIndex: Math.floor(rand() * paletteKlee.length),
    };
  }

  function ensureParticles() {
    while (particles.length < targetCount) particles.push(createParticle());
  }

  function updateMachine(nowMs) {
    ritualWave = nowMs < machine.ritualUntil ? (machine.ritualUntil - nowMs) / 1650 : 0;

    machine.residue = Math.max(0, machine.residue * 0.994 - 0.0005);
    input.commandPulse = Math.max(0, input.commandPulse * 0.965 - 0.004);
    input.revealBoost = Math.max(0, input.revealBoost * 0.988 - 0.0012);
    input.extractionPulse = Math.max(0, input.extractionPulse * 0.95 - 0.006);

    if (input.rightDown) input.chakanaGrip.strength = clamp(input.chakanaGrip.strength + 0.03, 0, 1.35);
    else input.chakanaGrip.strength *= 0.9;

    let targetEnergy = 0.52;
    const sec = (nowMs - machine.startMs) / 1000;
    if (sec < 3) targetEnergy = 0.24;
    else if (sec < 12) targetEnergy = 0.37;

    if (ritualWave > 0) targetEnergy = 0.68;
    if (nowMs < machine.calmUntil) targetEnergy = Math.min(targetEnergy, 0.16);

    machine.energy += (targetEnergy - machine.energy) * 0.02;

    const idleMs = nowMs - (input.lastInteractionMs || machine.startMs);
    const idleFactor = clamp((idleMs - 900) / 9500, 0, 1);
    const targetVisibility = 0.12 + input.revealBoost * 0.82 + ritualWave * 0.3 + (1 - idleFactor) * 0.08;
    const blend = idleFactor > 0.65 ? 0.009 : 0.02;
    visibilityEnergy += (targetVisibility - visibilityEnergy) * blend;
    visibilityEnergy = clamp(visibilityEnergy, 0.08, 1);

    if (hudCommand && input.commandMessageUntil > 0 && nowMs > input.commandMessageUntil) {
      hudCommand.textContent = "Comando: listo";
      hudCommand.classList.remove("active");
      input.commandMessageUntil = 0;
    }
  }

  function optimizeParticles(dtMs) {
    const fps = 1000 / Math.max(1, dtMs);
    fpsAvg = fpsAvg * 0.96 + fps * 0.04;
    if (fpsAvg < 40 && targetCount > range.min) targetCount -= 10;
    if (fpsAvg > 57 && targetCount < range.max) targetCount += 5;
    if (particles.length > targetCount) particles.splice(0, Math.min(18, particles.length - targetCount));
  }

  function applyForces(p, dtMs) {
    const t = chakanaPoints[p.target] || { x: cx, y: cy, layer: 0.5 };
    const dx = t.x - p.x;
    const dy = t.y - p.y;
    const dist = Math.hypot(dx, dy) + 0.001;

    const reveal = clamp((formation - t.layer * 0.8) * 2.5, 0, 1);
    const pull = 0.003 + reveal * 0.04;
    p.vx += (dx / dist) * pull * dtMs * 0.06;
    p.vy += (dy / dist) * pull * dtMs * 0.06;

    const nx = (p.x - cx) / (Math.min(w, h) * 0.55);
    const ny = (p.y - cy) / (Math.min(w, h) * 0.55);
    const swirl = Math.sin(nx * 1.32 + phase * 0.33) * Math.cos(ny * 1.24 - phase * 0.3);
    p.vx += -ny * swirl * 0.0023 * dtMs * 0.06;
    p.vy += nx * swirl * 0.0023 * dtMs * 0.06;

    p.vx += Math.sin((p.y + phase * 50) * 0.0042) * machine.residue * 0.011 * dtMs * 0.06;
    p.vy += Math.cos((p.x - phase * 50) * 0.0042) * machine.residue * 0.011 * dtMs * 0.06;

    if (ritualWave > 0) {
      const rx = p.x - ritualCenter.x;
      const ry = p.y - ritualCenter.y;
      const rr = Math.hypot(rx, ry) + 0.001;
      const wave = Math.sin(rr * 0.028 - (1 - ritualWave) * 10.8) * ritualWave;
      p.vx += (rx / rr) * wave * 0.014 * dtMs * 0.06;
      p.vy += (ry / rr) * wave * 0.014 * dtMs * 0.06;
    }

    if (input.active) {
      const mdx = p.x - input.x;
      const mdy = p.y - input.y;
      const md = Math.hypot(mdx, mdy) + 1;
      const influence = clamp(1 - md / (Math.min(w, h) * 0.55), 0, 1);
      const turbulence = clamp(input.speed * 0.42, 0, 10.2);
      const wind = turbulence * influence * (input.pointerDown ? 1.45 : 1);
      p.vx += (mdx / md) * wind * dtMs * 0.011;
      p.vy += (mdy / md) * wind * dtMs * 0.011;
    }

    if (p.lock && (input.rightDown || input.extractionArmed)) {
      const ax = input.chakanaGrip.x || input.x || cx;
      const ay = input.chakanaGrip.y || input.y || cy;
      const bx = cx - (ax - cx);
      const by = cy - (ay - cy);
      const adx = ax - p.x;
      const ady = ay - p.y;
      const bdx = p.x - bx;
      const bdy = p.y - by;
      const da = Math.hypot(adx, ady) + 1;
      const db = Math.hypot(bdx, bdy) + 1;
      const strength = Math.max(input.chakanaGrip.strength, input.extractionArmed ? 0.68 : 0);
      p.vx += (adx / da) * strength * 0.026 * dtMs;
      p.vy += (ady / da) * strength * 0.026 * dtMs;
      p.vx += (bdx / db) * strength * 0.018 * dtMs;
      p.vy += (bdy / db) * strength * 0.018 * dtMs;
    }

    if (p.lock && reveal > 0.74) {
      p.vx *= 0.64;
      p.vy *= 0.64;
    }
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
      if (Math.random() < 0.34) particles[i].target = Math.floor(rand() * Math.max(1, chakanaPoints.length));
    }

    saveMemory();
  }

  function setup() {
    const parent = document.getElementById("app");
    const cnv = createCanvas(window.innerWidth, window.innerHeight);
    cnv.parent(parent);
    pixelDensity(Math.min(2, window.devicePixelRatio || 1));
    background(11, 11, 13);
    w = width;
    h = height;
    cx = w * 0.5;
    cy = h * 0.5;
    buildChakana();
    ensureParticles();

    if (!memory.hudVisible) hud.classList.add("hidden");
    updateHudState();

    document.addEventListener("contextmenu", (ev) => {
      if (ev.target.tagName === "CANVAS") ev.preventDefault();
    });
  }

  function draw() {
    const nowMs = performance.now();
    const dtMs = nowMs - lastMs;
    lastMs = nowMs;
    phase += dtMs * 0.001;
    formation = clamp((nowMs - machine.startMs) / 10800, 0, 1);

    updateMachine(nowMs);
    optimizeParticles(dtMs);
    ensureParticles();

    noStroke();
    fill(11, 11, 13, 28);
    rect(0, 0, w, h);

    const guideAlpha = (0.02 + formation * 0.2) * visibilityEnergy;
    fill(236, 232, 224, 255 * guideAlpha);
    for (let i = 0; i < chakanaPoints.length; i += 4) {
      const p = chakanaPoints[i];
      const reveal = clamp((formation - p.layer * 0.75) * 2.4, 0, 1) * visibilityEnergy;
      if (reveal <= 0) continue;
      fill(236, 232, 224, 255 * guideAlpha * reveal);
      rect(p.x - 1, p.y - 1, 2, 2);
    }

    const drag = 0.988 - machine.energy * 0.035;
    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];
      applyForces(p, dtMs);
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

      const base = p.tier === 0 ? 0.24 : p.tier === 1 ? 0.37 : 0.5;
      const alpha = clamp(base + formation * 0.1 + visibilityEnergy * 0.16 + ritualWave * 0.15 + input.commandPulse * 0.1 + (p.lock ? input.extractionPulse * 0.12 : 0), 0.08, 0.9);
      const [r, g, b] = getParticleColor(p);
      fill(r, g, b, alpha * 255);
      circle(p.x, p.y, p.size * 2);
    }

    fill(7, 7, 9, clamp(0.042 - machine.energy * 0.014, 0.01, 0.06) * 255);
    rect(0, 0, w, h);

    if (nowMs - machine.startMs > 2600 && (nowMs - machine.startMs) % 3500 < dtMs) saveMemory();
  }

  function windowResized() {
    resizeCanvas(window.innerWidth, window.innerHeight);
    w = width;
    h = height;
    cx = w * 0.5;
    cy = h * 0.5;
    buildChakana();
  }

  function mouseMoved() {
    const now = performance.now();
    const dx = mouseX - input.x;
    const dy = mouseY - input.y;
    const dt = Math.max(8, now - (input.lastMoveMs || now - 16));
    input.x = mouseX;
    input.y = mouseY;
    input.speed = Math.hypot(dx, dy) / dt;
    input.lastMoveMs = now;
    input.active = true;
    input.lastInteractionMs = now;
    input.revealBoost = clamp(input.revealBoost + clamp(input.speed * 0.22, 0, 1) * 0.08 + 0.007, 0, 1.4);
    if (input.rightDown) {
      input.chakanaGrip.x = mouseX;
      input.chakanaGrip.y = mouseY;
    }
  }

  function mousePressed() {
    input.lastInteractionMs = performance.now();
    if (mouseButton === LEFT) {
      input.pointerDown = true;
      ritualAt(mouseX, mouseY);
      return;
    }

    if (mouseButton === RIGHT) {
      input.rightDown = true;
      input.chakanaGrip.x = mouseX;
      input.chakanaGrip.y = mouseY;
      input.chakanaGrip.strength = Math.max(input.chakanaGrip.strength, 0.62);
      input.extractionPulse = clamp(input.extractionPulse + 0.35, 0, 1.4);
      input.revealBoost = clamp(input.revealBoost + 0.14, 0, 1.5);
      updateHudState();
      return false;
    }
  }

  function mouseReleased() {
    if (mouseButton === LEFT) input.pointerDown = false;
    if (mouseButton === RIGHT) {
      input.rightDown = false;
      if (!input.extractionArmed) input.chakanaGrip.strength = 0;
      updateHudState();
    }
  }

  function keyPressed() {
    const k = key.toLowerCase();
    if (k === "r") {
      ritualAt(cx, cy);
      announceCommand("R ritual");
    }
    if (k === "c") {
      machine.calmUntil = performance.now() + 6000;
      machine.energy = clamp(machine.energy - 0.14, 0, 1);
      machine.residue = clamp(machine.residue - 0.25, 0, 1.2);
      input.commandPulse = clamp(input.commandPulse + 0.07, 0, 1);
      input.revealBoost = clamp(input.revealBoost + 0.06, 0, 1.5);
      input.lastInteractionMs = performance.now();
      announceCommand("C calma 6s");
    }
    if (k === "m") {
      memory.variation = (memory.variation + 0.041) % 1;
      targetCount = clamp(1300 + Math.floor(memory.variation * 420), range.min, range.max);
      input.commandPulse = clamp(input.commandPulse + 0.08, 0, 1);
      input.revealBoost = clamp(input.revealBoost + 0.08, 0, 1.5);
      input.lastInteractionMs = performance.now();
      saveMemory();
      announceCommand("M mutación");
    }
    if (k === "x") {
      input.extractionArmed = !input.extractionArmed;
      if (!input.extractionArmed && !input.rightDown) input.chakanaGrip.strength = 0;
      input.extractionPulse = clamp(input.extractionPulse + 0.3, 0, 1.4);
      input.lastInteractionMs = performance.now();
      updateHudState();
      saveMemory();
      announceCommand(`X extracción ${input.extractionArmed ? "ON" : "OFF"}`);
    }
    if (k === "v") {
      input.mode = input.mode === "mono" ? "palette" : "mono";
      updateHudState();
      saveMemory();
      announceCommand(`V modo ${input.mode === "mono" ? "B/N" : "Paleta"}`);
    }
    if (k === "h") {
      toggleHud();
      announceCommand("H HUD");
    }
  }

  window.addEventListener("beforeunload", saveMemory);
})();
