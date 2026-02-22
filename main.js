(() => {
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d", { alpha: false });

  const STORAGE_KEY = "flux.ritual.state";
  const state = {
    pointer: { x: 0, y: 0, active: false },
    rituals: 0,
    hueSeed: 210,
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (Number.isFinite(saved.rituals)) state.rituals = saved.rituals;
    if (Number.isFinite(saved.hueSeed)) state.hueSeed = saved.hueSeed;
  } catch (_) {
    // noop
  }

  const particles = [];
  const BASE_COUNT = 700;
  let w = 1;
  let h = 1;
  let centerX = 0;
  let centerY = 0;
  let time = 0;

  function saveState() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ rituals: state.rituals, hueSeed: state.hueSeed }),
    );
  }

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    centerX = w * 0.5;
    centerY = h * 0.5;
  }

  function newParticle(x = Math.random() * w, y = Math.random() * h) {
    return {
      x,
      y,
      vx: (Math.random() - 0.5) * 0.8,
      vy: (Math.random() - 0.5) * 0.8,
      life: 100 + Math.random() * 200,
      size: 0.6 + Math.random() * 1.6,
      hueOffset: Math.random() * 90,
    };
  }

  function resetParticles() {
    particles.length = 0;
    for (let i = 0; i < BASE_COUNT; i += 1) {
      particles.push(newParticle());
    }
  }

  function chakanaField(x, y, t) {
    // Chakana matemática: cruz escalonada + pulsación radial.
    const nx = (x - centerX) / Math.min(w, h);
    const ny = (y - centerY) / Math.min(w, h);
    const ax = Math.abs(nx);
    const ay = Math.abs(ny);

    // Cruz (brazos) usando distancia Chebyshev con vacío central modulable.
    const arm = Math.min(Math.max(ax - 0.04, ay - 0.18), Math.max(ax - 0.18, ay - 0.04));

    // Escalonado andino (tres niveles).
    const r = Math.hypot(nx, ny);
    const level = Math.sin((r * 25 - t * 1.4) + Math.floor((ax + ay) * 12) * 0.9);

    // Giro de campo.
    const swirl = Math.atan2(ny, nx) + Math.sin(t * 0.3 + r * 8) * 0.45;
    const force = 0.4 / (0.05 + Math.abs(arm)) + level * 0.22;

    return {
      fx: Math.cos(swirl + Math.sign(ny) * 0.7) * force,
      fy: Math.sin(swirl - Math.sign(nx) * 0.7) * force,
    };
  }

  function applyMouseWind(p) {
    if (!state.pointer.active) return;
    const dx = p.x - state.pointer.x;
    const dy = p.y - state.pointer.y;
    const d2 = dx * dx + dy * dy + 180;
    const push = 300 / d2;
    p.vx += dx * push;
    p.vy += dy * push;
  }

  function ritualBurst(x, y) {
    state.rituals += 1;
    state.hueSeed = (state.hueSeed + 37) % 360;
    saveState();

    const burstCount = 130;
    for (let i = 0; i < burstCount; i += 1) {
      const a = (i / burstCount) * Math.PI * 2;
      const speed = 1 + Math.random() * 4;
      const p = newParticle(x, y);
      p.vx = Math.cos(a) * speed;
      p.vy = Math.sin(a) * speed;
      p.life = 120 + Math.random() * 120;
      p.size = 1 + Math.random() * 2;
      particles.push(p);
    }
  }

  function animate() {
    time += 0.016;

    ctx.fillStyle = "rgba(4, 5, 8, 0.22)";
    ctx.fillRect(0, 0, w, h);

    while (particles.length < BASE_COUNT) particles.push(newParticle());
    if (particles.length > BASE_COUNT + 220) particles.splice(0, particles.length - (BASE_COUNT + 220));

    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      const field = chakanaField(p.x, p.y, time + state.rituals * 0.2);
      p.vx += field.fx * 0.03;
      p.vy += field.fy * 0.03;

      applyMouseWind(p);

      p.vx *= 0.985;
      p.vy *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.7;

      if (p.x < -10 || p.x > w + 10 || p.y < -10 || p.y > h + 10 || p.life <= 0) {
        particles[i] = newParticle();
        continue;
      }

      const hue = (state.hueSeed + p.hueOffset + time * 22 + state.rituals * 8) % 360;
      const alpha = Math.max(0.12, Math.min(0.8, p.life / 260));

      ctx.fillStyle = `hsla(${hue}, 86%, 68%, ${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(animate);
  }

  canvas.addEventListener("pointermove", (ev) => {
    state.pointer.x = ev.clientX;
    state.pointer.y = ev.clientY;
    state.pointer.active = true;
  });

  canvas.addEventListener("pointerleave", () => {
    state.pointer.active = false;
  });

  canvas.addEventListener("click", (ev) => {
    ritualBurst(ev.clientX, ev.clientY);
  });

  window.addEventListener("resize", resize);

  resize();
  resetParticles();
  ctx.fillStyle = "#040406";
  ctx.fillRect(0, 0, w, h);
  animate();
})();
