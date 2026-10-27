/*
  Murmurations
  Craig Reynolds' boids (1987): each bird steers by three rules, looking
  only at its neighbors: keep apart, fly the same way, stay together. A
  falcon under the pointer sends waves through the flock.
  https://github.com/evoluteur/murmurations
  (c) 2026 Olivier Giulieri
*/

const W = 1000; // the sky is W x W

const PRESETS = {
  starlings: {
    name: "Starlings at dusk", n: 3000, sep: 2, ali: 1.0, coh: 1.0, vision: 50, speed: 4, falcon: true, look: "starlings",
    text: "Thousands of starlings over a winter roost, turning as one when the falcon comes.",
  },
  fish: {
    name: "School of fish", n: 1500, sep: 3, ali: 1.6, coh: 0.6, vision: 55, speed: 3, falcon: true, look: "fish",
    text: "Strong alignment: the school streams in lanes and splits around the predator.",
  },
  swarm: {
    name: "Midge swarm", n: 1500, sep: 2.5, ali: 0.1, coh: 1.2, vision: 70, speed: 3.5, falcon: false, look: "midges",
    text: "No alignment: the insects hold together in a buzzing ball, each going its own way.",
  },
  fireflies: {
    name: "Fireflies", n: 600, sep: 3, ali: 0.5, coh: 0.1, vision: 60, speed: 1.6, falcon: false, look: "fireflies",
    text: "Slow and loose: small groups drift through the night and blink.",
  },
};

const LOOKS = {
  starlings: { pull: 0.00045, sky: ["#2b2f54", "#7a4f7d", "#e5876b", "#f6c886"], bird: "#14121c", trail: "rgba(20,18,28,0.25)", shape: "bird" },
  fish: { pull: 0.00015, sky: ["#03263f", "#05456b", "#0b6f95", "#2aa6b8"], bird: "#d9f2f5", trail: "rgba(217,242,245,0.2)", shape: "fish" },
  midges: { pull: 0.0008, sky: ["#3d4a2a", "#7d8a4a", "#c9c27a", "#efe6b4"], bird: "#1e1b12", trail: "rgba(30,27,18,0.2)", shape: "dot" },
  fireflies: { pull: 0.00003, sky: ["#03040c", "#081028", "#0d1c3a", "#132a44"], bird: "#e9ff7a", trail: "rgba(233,255,122,0.2)", shape: "glow" },
};

const state = {
  preset: "starlings",
  n: 2500,
  sep: 1.6, // weights of the three rules
  ali: 1.0,
  coh: 0.9,
  vision: 45, // how far a bird sees its neighbors
  speed: 4,
  falcon: true, // a falcon dives at the flock now and then
  trails: false,
  look: "starlings",
  running: true,
};

let canvas, ctx;
let px, py, vx, vy, blink; // the birds
let hawk = null; // the falcon: the pointer, or the automatic one
let pointer = null;

// ------------------------------------------------------------ the flock

const spawn = () => {
  const n = state.n;
  px = new Float32Array(n);
  py = new Float32Array(n);
  vx = new Float32Array(n);
  vy = new Float32Array(n);
  blink = new Float32Array(n);
  // a few loose, uneven clumps, each heading its own way, plus some strays
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
  const clumps = Array.from({ length: 3 + Math.floor(Math.random() * 4) }, () => ({
    x: W * (0.25 + Math.random() * 0.5),
    y: W * (0.25 + Math.random() * 0.5),
    rx: W * (0.05 + Math.random() * 0.12),
    ry: W * (0.05 + Math.random() * 0.12),
    a: Math.random() * Math.PI * 2,
  }));
  for (let i = 0; i < n; i++) {
    let a;
    if (Math.random() < 0.15) {
      px[i] = W * (0.12 + Math.random() * 0.76);
      py[i] = W * (0.12 + Math.random() * 0.76);
      a = Math.random() * Math.PI * 2;
    } else {
      const c = clumps[Math.floor(Math.random() * clumps.length)];
      px[i] = c.x + gauss() * c.rx;
      py[i] = c.y + gauss() * c.ry;
      a = c.a + (Math.random() - 0.5) * 2.5;
    }
    const sp = state.speed * (0.55 + Math.random() * 0.45);
    vx[i] = Math.cos(a) * sp;
    vy[i] = Math.sin(a) * sp;
    blink[i] = Math.random() * 100;
  }
};

// a grid of buckets, so each bird only looks at the birds near it
let cellSize, cols, head, next;
const bucket = () => {
  cellSize = state.vision;
  cols = Math.ceil(W / cellSize) + 2;
  head = new Int32Array(cols * cols).fill(-1);
  next = new Int32Array(px.length);
  for (let i = 0; i < px.length; i++) {
    const cx = Math.min(cols - 1, Math.max(0, Math.floor(px[i] / cellSize) + 1));
    const cy = Math.min(cols - 1, Math.max(0, Math.floor(py[i] / cellSize) + 1));
    const c = cy * cols + cx;
    next[i] = head[c];
    head[c] = i;
  }
};

const step = () => {
  const n = px.length, R = state.vision, R2 = R * R, sepR2 = (R * 0.22) ** 2;
  const max = state.speed, min = state.speed * 0.55, pull = LOOKS[state.look].pull;
  bucket();
  const ax = new Float32Array(n), ay = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sx = 0, sy = 0, avx = 0, avy = 0, cx = 0, cy = 0, k = 0;
    const gx = Math.min(cols - 1, Math.max(0, Math.floor(px[i] / cellSize) + 1));
    const gy = Math.min(cols - 1, Math.max(0, Math.floor(py[i] / cellSize) + 1));
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const X = gx + dx, Y = gy + dy;
        if (X < 0 || Y < 0 || X >= cols || Y >= cols) continue;
        for (let j = head[Y * cols + X]; j >= 0 && k < 24; j = next[j]) {
          if (j === i) continue;
          const ddx = px[i] - px[j], ddy = py[i] - py[j], d2 = ddx * ddx + ddy * ddy;
          if (d2 > R2) continue;
          k++;
          avx += vx[j];
          avy += vy[j];
          cx += px[j];
          cy += py[j];
          if (d2 < sepR2 && d2 > 0) {
            sx += ddx / d2;
            sy += ddy / d2;
          }
        }
      }
    let fx = 0, fy = 0;
    if (k) {
      // keep apart, fly the same way, stay together
      fx += sx * state.sep * 6;
      fy += sy * state.sep * 6;
      fx += (avx / k - vx[i]) * state.ali * 0.06;
      fy += (avy / k - vy[i]) * state.ali * 0.06;
      fx += (cx / k - px[i]) * state.coh * 0.0035;
      fy += (cy / k - py[i]) * state.coh * 0.0035;
    }
    // the roost below pulls the whole flock back over it
    fx += (W / 2 - px[i]) * pull;
    fy += (W / 2 - py[i]) * pull;
    // the edges of the sky: turn back gently
    const m = W * 0.12, turn = 0.12;
    if (px[i] < m) fx += turn * (1 - px[i] / m);
    if (px[i] > W - m) fx -= turn * (1 - (W - px[i]) / m);
    if (py[i] < m) fy += turn * (1 - py[i] / m);
    if (py[i] > W - m) fy -= turn * (1 - (W - py[i]) / m);
    // the falcon: flee
    if (hawk) {
      const ddx = px[i] - hawk.x, ddy = py[i] - hawk.y, d2 = ddx * ddx + ddy * ddy, F = 130;
      if (d2 < F * F) {
        const d = Math.sqrt(d2) || 1, s = (1 - d / F) * 1.2;
        fx += (ddx / d) * s;
        fy += (ddy / d) * s;
      }
    }
    // a little randomness
    fx += (Math.random() - 0.5) * 0.08;
    fy += (Math.random() - 0.5) * 0.08;
    ax[i] = fx;
    ay[i] = fy;
  }
  for (let i = 0; i < n; i++) {
    let nx = vx[i] + ax[i], ny = vy[i] + ay[i];
    const s = Math.hypot(nx, ny) || 1;
    const t = s > max ? max / s : s < min ? min / s : 1;
    nx *= t;
    ny *= t;
    vx[i] = nx;
    vy[i] = ny;
    px[i] = Math.max(1, Math.min(W - 1, px[i] + nx));
    py[i] = Math.max(1, Math.min(W - 1, py[i] + ny));
    blink[i] += 1;
  }
};

// the automatic falcon: every so often it crosses the sky, aiming at the flock
let auto = null, nextDive = 240;
const falcon = () => {
  if (pointer) return (hawk = pointer);
  if (!state.falcon) return (hawk = null);
  if (!auto) {
    if (--nextDive > 0) return (hawk = null);
    // aim at the middle of the flock, from a side
    let mx = 0, my = 0;
    for (let i = 0; i < px.length; i += 7) {
      mx += px[i];
      my += py[i];
    }
    const c = Math.ceil(px.length / 7);
    mx /= c;
    my /= c;
    const a = Math.random() * Math.PI * 2;
    const sx = mx + Math.cos(a) * W * 0.7, sy = my + Math.sin(a) * W * 0.7;
    const d = Math.hypot(mx - sx, my - sy);
    auto = { x: sx, y: sy, vx: ((mx - sx) / d) * 9, vy: ((my - sy) / d) * 9, life: 200 };
  }
  auto.x += auto.vx;
  auto.y += auto.vy;
  if (--auto.life <= 0) {
    auto = null;
    nextDive = 180 + Math.random() * 300;
    return (hawk = null);
  }
  hawk = auto;
};

// ------------------------------------------------------------ drawing

let sky = null;
const paintSky = () => {
  const L = LOOKS[state.look], w = canvas.width;
  const g = ctx.createLinearGradient(0, 0, 0, w);
  L.sky.forEach((c, i) => g.addColorStop(i / (L.sky.length - 1), c));
  sky = g;
};

const draw = () => {
  const L = LOOKS[state.look], w = canvas.width, s = w / W;
  ctx.globalAlpha = state.trails ? 0.18 : 1;
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, w);
  ctx.globalAlpha = 1;
  const n = px.length;
  if (L.shape === "glow") {
    for (let i = 0; i < n; i++) {
      const b = 0.5 + 0.5 * Math.sin(blink[i] * 0.05 + i);
      if (b < 0.3) continue;
      ctx.globalAlpha = b;
      ctx.fillStyle = L.bird;
      ctx.shadowColor = L.bird;
      ctx.shadowBlur = 8 * s * 2;
      ctx.beginPath();
      ctx.arc(px[i] * s, py[i] * s, 1.6 * s * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  } else if (L.shape === "dot") {
    ctx.fillStyle = L.bird;
    for (let i = 0; i < n; i++) ctx.fillRect(px[i] * s - s, py[i] * s - s, 2.2 * s, 2.2 * s);
  } else {
    // a bird: a short stroke with wings; a fish: a longer, thinner one
    const len = L.shape === "fish" ? 6 : 3;
    ctx.strokeStyle = L.bird;
    ctx.lineCap = "round";
    ctx.lineWidth = (L.shape === "fish" ? 1.5 : 1.8) * s;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const sp = Math.hypot(vx[i], vy[i]) || 1, ux = vx[i] / sp, uy = vy[i] / sp;
      const x = px[i] * s, y = py[i] * s;
      ctx.moveTo(x - ux * len * s, y - uy * len * s);
      ctx.lineTo(x + ux * len * s * 0.4, y + uy * len * s * 0.4);
      if (L.shape === "bird") {
        // wings, beating
        const f = Math.sin(blink[i] * 0.6 + i) * 0.5 + 0.8;
        ctx.moveTo(x - uy * 2.2 * s * f, y + ux * 2.2 * s * f);
        ctx.lineTo(x + uy * 2.2 * s * f, y - ux * 2.2 * s * f);
      }
    }
    ctx.stroke();
  }
  if (hawk && hawk !== pointer) {
    // the falcon
    const sp = Math.hypot(hawk.vx, hawk.vy) || 1, ux = hawk.vx / sp, uy = hawk.vy / sp;
    const x = hawk.x * s, y = hawk.y * s;
    ctx.fillStyle = state.look === "fish" ? "#0a1a24" : "#3a2418";
    ctx.beginPath();
    ctx.moveTo(x + ux * 14 * s, y + uy * 14 * s);
    ctx.lineTo(x - ux * 8 * s - uy * 14 * s, y - uy * 8 * s + ux * 14 * s);
    ctx.lineTo(x - ux * 4 * s, y - uy * 4 * s);
    ctx.lineTo(x - ux * 8 * s + uy * 14 * s, y - uy * 8 * s - ux * 14 * s);
    ctx.closePath();
    ctx.fill();
  }
};

const loop = () => {
  if (state.running) {
    falcon();
    step();
    draw();
  }
  requestAnimationFrame(loop);
};

// ------------------------------------------------------------ controls

const $ = (id) => document.getElementById(id);
const SLIDERS = ["sep", "ali", "coh", "vision", "speed"];

let hashTimer;
const saveHash = () => {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const q = new URLSearchParams({ p: state.preset, n: state.n });
    if (state.preset === "custom") {
      SLIDERS.forEach((k) => q.set(k, state[k]));
      q.set("l", state.look);
    }
    history.replaceState(null, "", "#" + q.toString());
  }, 300);
};

const readHash = () => {
  const q = new URLSearchParams(location.hash.slice(1));
  if (PRESETS[q.get("p")]) usePreset(q.get("p"));
  else if (q.get("p") === "custom") {
    state.preset = "custom";
    SLIDERS.forEach((k) => {
      const v = parseFloat(q.get(k));
      if (!isNaN(v)) state[k] = v;
    });
    if (LOOKS[q.get("l")]) state.look = q.get("l");
  }
  const n = +q.get("n");
  if (n >= 100 && n <= 5000) state.n = n;
};

const usePreset = (k) => {
  const p = PRESETS[k];
  Object.assign(state, { preset: k, n: p.n, sep: p.sep, ali: p.ali, coh: p.coh, vision: p.vision, speed: p.speed, falcon: p.falcon, look: p.look });
};

const showValues = () => {
  $("v-n").textContent = state.n.toLocaleString("en-US");
  SLIDERS.forEach((k) => ($("v-" + k).textContent = state[k]));
  $("preset-text").textContent = PRESETS[state.preset] ? PRESETS[state.preset].text : "Your own flock.";
};

const sync = () => {
  $("preset").value = state.preset;
  $("n").value = state.n;
  SLIDERS.forEach((k) => ($(k).value = state[k]));
  $("falcon").checked = state.falcon;
  $("trails").checked = state.trails;
  showValues();
};

const options = (o) => Object.entries(o).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join("");

const initBoids = () => {
  canvas = $("sky");
  ctx = canvas.getContext("2d");
  readHash();
  $("preset").innerHTML = options(PRESETS) + '<option value="custom">Custom</option>';
  sync();
  const fit = () => {
    const r = canvas.getBoundingClientRect();
    const w = Math.round(r.width * Math.min(2, window.devicePixelRatio || 1));
    if (w && canvas.width !== w) {
      canvas.width = canvas.height = w;
      paintSky();
    }
  };
  fit();
  window.addEventListener("resize", fit);
  spawn();

  $("preset").addEventListener("change", (e) => {
    if (PRESETS[e.target.value]) usePreset(e.target.value);
    else state.preset = "custom";
    sync();
    paintSky();
    spawn();
    saveHash();
  });
  SLIDERS.forEach((k) =>
    $(k).addEventListener("input", (e) => {
      state[k] = +e.target.value;
      state.preset = "custom";
      $("preset").value = "custom";
      showValues();
      saveHash();
    }),
  );
  $("n").addEventListener("input", (e) => {
    state.n = +e.target.value;
    showValues();
  });
  $("n").addEventListener("change", () => {
    spawn();
    saveHash();
  });
  $("falcon").addEventListener("change", (e) => (state.falcon = e.target.checked));
  $("trails").addEventListener("change", (e) => (state.trails = e.target.checked));
  $("btn-run").addEventListener("click", () => {
    state.running = !state.running;
    $("btn-run").textContent = state.running ? "Pause" : "Fly";
  });
  $("btn-new").addEventListener("click", spawn);
  $("btn-png").addEventListener("click", () => {
    canvas.toBlob((b) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = `murmuration-${state.look}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
  });
  // the pointer is a falcon
  const toSky = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * W, vx: 0, vy: 0 };
  };
  canvas.addEventListener("pointermove", (e) => (pointer = toSky(e)));
  canvas.addEventListener("pointerdown", (e) => (pointer = toSky(e)));
  canvas.addEventListener("pointerleave", () => (pointer = null));
  canvas.addEventListener("pointerup", (e) => e.pointerType !== "mouse" && (pointer = null));

  saveHash();
  requestAnimationFrame(loop);
};
