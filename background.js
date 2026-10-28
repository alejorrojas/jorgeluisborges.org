import { fragments } from "./fragments.js";

const canvas = document.getElementById("fragments");
const lightCanvas = document.getElementById("fragments-light");
const main = document.querySelector("main");
const article = document.querySelector("article");
const ctx = canvas.getContext("2d");
const lightCtx = lightCanvas.getContext("2d");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const INK = "#292421";
const LIT_COLOR = "#857e77";
const FONT_FAMILY = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const PAD = 3;

// How visible the ink is at rest, and under the light.
const BASE_ALPHA = 0.035;
const LIT_ALPHA = 1;
const HIGHLIGHT_ALPHA = 1;
const GLOW_ALPHA = 0.6;
// A circle, brightest at the center and fading out toward its edge.
const LIGHT_RADIUS_X = 62;
const LIGHT_RADIUS_Y = 62;

const HOLD_MS = [5000, 11000];
const GAP_MS = [500, 1300];
const MAX_BUSY = 3;
const FIRST_CHANGE_MS = 1800;
// How long the pixel sweep takes across a fragment, and how long each pixel flies.
const ENTRANCE = { sweep: 380, jitter: 120, life: [320, 620] };
const CHANGE = { sweep: 850, jitter: 200, life: [650, 1100] };
const CROSSFADE_MS = 320;
const MAX_PARTICLES = 2400;

// Space kept clear around the reading column, and how far the fade toward it reaches.
const CLEAR_X = 44;
const CLEAR_Y = 22;
const FADE_DISTANCE = 110;
const VERTICAL_FADE_SCALE = 5;
const BLOCK_SPACING = 26;
const RELOCATE_CHANCE = 0.65;

const ink = document.createElement("canvas");
const inkCtx = ink.getContext("2d");
const lit = document.createElement("canvas");
const litCtx = lit.getContext("2d");
const highlight = document.createElement("canvas");
const highlightCtx = highlight.getContext("2d");
const mask = document.createElement("canvas");
const measureCtx = document.createElement("canvas").getContext("2d");

let dpr = 0;
let width = 0;
let height = 0;
let clear = { left: 0, right: 0, top: 0, bottom: 0 };
let type = { size: 16, lineHeight: 24, text: "", source: "" };
let blocks = [];
let nextDissolveAt = 0;
let dirty = true;

const pointer = {
  clientX: 0,
  clientY: 0,
  x: 0,
  y: 0,
  targetX: 0,
  targetY: 0,
  strength: 0,
  target: 0,
  seen: false,
};

const rand = (min, max) => min + Math.random() * (max - min);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smoothstep = (e0, e1, v) => {
  const t = clamp01((v - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

// 0 at the reading column, rising to 1 away from it. Fades faster vertically
// so the bands above and below the text still hold readable fragments.
function weightAt(x, y) {
  const dx = Math.max(clear.left - x, 0, x - clear.right);
  const dy = Math.max(clear.top - y, 0, y - clear.bottom) * VERTICAL_FADE_SCALE;
  return smoothstep(0, FADE_DISTANCE, Math.hypot(dx, dy));
}

function intersectsClear(rect) {
  return !(
    rect.x + rect.w < clear.left ||
    rect.x > clear.right ||
    rect.y + rect.h < clear.top ||
    rect.y > clear.bottom
  );
}

function pickFragment(previous) {
  const counts = new Map(fragments.map((f) => [f, 0]));
  for (const block of blocks) {
    if (block.fragment) counts.set(block.fragment, counts.get(block.fragment) + 1);
  }
  const candidates = fragments.length > 1 ? fragments.filter((f) => f !== previous) : fragments;
  const fewest = Math.min(...candidates.map((f) => counts.get(f)));
  const options = candidates.filter((f) => counts.get(f) === fewest);
  return options[Math.floor(Math.random() * options.length)];
}

function wrap(text, font, maxWidth) {
  measureCtx.font = font;
  const lines = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && measureCtx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function layout(fragment, boxWidth) {
  const rows = wrap(fragment.text, type.text, boxWidth).map((text) => ({
    text,
    font: type.text,
    alpha: 1,
  }));
  rows.push(null);
  for (const text of wrap(`— ${fragment.source}`, type.source, boxWidth)) {
    rows.push({ text, font: type.source, alpha: 0.72 });
  }
  return rows;
}

function overlapsOthers(block, rect) {
  return blocks.some(
    (other) =>
      other !== block &&
      other.fragment &&
      !(
        rect.x + rect.w + BLOCK_SPACING < other.x ||
        other.x + other.w + BLOCK_SPACING < rect.x ||
        rect.y + rect.h + BLOCK_SPACING < other.y ||
        other.y + other.h + BLOCK_SPACING < rect.y
      ),
  );
}

function candidateRect(region, w, h) {
  switch (region) {
    case "top": {
      const maxY = clear.top - h - 4;
      const minY = Math.max(-h * 0.8, 2 * type.lineHeight - h);
      if (maxY < minY) return null;
      return { x: rand(clear.left - w * 0.4, clear.right - w * 0.6), y: rand(minY, maxY) };
    }
    case "bottom": {
      const minY = clear.bottom + 4;
      const maxY = Math.min(height - h * 0.2, height - 2 * type.lineHeight);
      if (maxY < minY) return null;
      return { x: rand(clear.left - w * 0.4, clear.right - w * 0.6), y: rand(minY, maxY) };
    }
    case "edges": {
      const x = rand(-w * 0.3, width - w * 0.7);
      const y = rand(-h * 0.5, height - h * 0.5);
      return Math.random() < Math.pow(weightAt(x + w / 2, y + h / 2), 0.7) + 0.12 ? { x, y } : null;
    }
    default: {
      const unknown = region;
      throw new Error(`Unknown region: ${unknown}`);
    }
  }
}

function findSpot(block, fragment, region) {
  for (let attempt = 0; attempt < 320; attempt++) {
    const w = Math.min(rand(250, 370), width - 32);
    const rows = layout(fragment, w);
    const h = rows.length * type.lineHeight;
    const point = candidateRect(region, w, h);
    if (!point) continue;
    const rect = { ...point, w, h };
    if (!intersectsClear(rect) && !overlapsOthers(block, rect)) return { ...rect, rows };
  }
  return null;
}

function spotInPlace(block, fragment) {
  const rows = layout(fragment, block.w);
  const rect = { x: block.x, y: block.y, w: block.w, h: rows.length * type.lineHeight };
  return !intersectsClear(rect) && !overlapsOthers(block, rect) ? { ...rect, rows } : null;
}

function renderBlock(block) {
  const c = block.canvas;
  c.width = Math.ceil((block.w + PAD * 2) * dpr);
  c.height = Math.ceil((block.h + PAD * 2) * dpr);
  const g = c.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = INK;
  g.textBaseline = "top";
  const inset = (type.lineHeight - type.size) / 2;
  block.rows.forEach((row, i) => {
    if (!row) return;
    g.font = row.font;
    g.globalAlpha = row.alpha;
    g.fillText(row.text, PAD, PAD + i * type.lineHeight + inset);
  });
}

function sampleParticles(block, timing) {
  const c = block.canvas;
  const data = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  const opaque = (x, y) => data[(y * c.width + x) * 4 + 3] > 60;
  let step = Math.max(2, Math.round(1.5 * dpr));
  for (;;) {
    let count = 0;
    for (let y = 0; y < c.height; y += step) {
      for (let x = 0; x < c.width; x += step) if (opaque(x, y)) count++;
    }
    if (count <= MAX_PARTICLES) break;
    step++;
  }

  const particles = [];
  for (let y = 0; y < c.height; y += step) {
    for (let x = 0; x < c.width; x += step) {
      if (!opaque(x, y)) continue;
      particles.push({
        x: block.x - PAD + x / dpr,
        y: block.y - PAD + y / dpr,
        a: data[(y * c.width + x) * 4 + 3] / 255,
        size: step / dpr,
        delay: (x / c.width) * timing.sweep + rand(0, timing.jitter),
        life: rand(...timing.life),
        vx: rand(-0.006, 0.034),
        vy: rand(-0.028, 0.008),
        lift: rand(0.000006, 0.00002),
        wobble: rand(0, Math.PI * 2),
      });
    }
  }
  return particles;
}

const duration = (timing) => timing.sweep + timing.jitter + timing.life[1];

function startAssembling(block, fragment, spot, startAt, timing = CHANGE) {
  Object.assign(block, spot, {
    fragment,
    startedAt: startAt,
    particles: [],
    entering: timing === ENTRANCE,
  });
  renderBlock(block);
  if (reduceMotion) {
    block.state = "fadingIn";
    return;
  }
  block.particles = sampleParticles(block, timing);
  block.state = "assembling";
  block.endsAt = startAt + duration(timing);
}

function startDissolving(block, now) {
  block.startedAt = now;
  if (reduceMotion) {
    block.state = "fadingOut";
    return;
  }
  block.particles = sampleParticles(block, CHANGE);
  block.state = "dissolving";
  block.endsAt = now + duration(CHANGE);
}

function hold(block, now) {
  block.state = "holding";
  block.particles = [];
  // Right after the entrance, spread the first changes out so they start soon.
  block.holdUntil = now + (block.entering ? rand(800, HOLD_MS[1]) : rand(...HOLD_MS));
  block.entering = false;
}

function rebuild(block, now) {
  const fragment = pickFragment(block.fragment);
  const stays = block.region !== "edges" || Math.random() > RELOCATE_CHANCE;
  const spot =
    (stays && spotInPlace(block, fragment)) ||
    findSpot(block, fragment, block.region) ||
    findSpot(block, fragment, "edges");
  if (!spot) {
    block.fragment = null;
    block.state = "waiting";
    block.startedAt = now + 2500;
    return;
  }
  startAssembling(block, fragment, spot, now + rand(80, 250));
}

function update(now) {
  let animating = false;

  for (const block of blocks) {
    switch (block.state) {
      case "assembling":
        animating = true;
        if (now >= block.endsAt) hold(block, now);
        break;
      case "fadingIn":
        animating = true;
        if (now - block.startedAt >= 1400) hold(block, now);
        break;
      case "holding":
        break;
      case "dissolving":
        animating = true;
        if (now >= block.endsAt) rebuild(block, now);
        break;
      case "fadingOut":
        animating = true;
        if (now - block.startedAt >= 1400) rebuild(block, now);
        break;
      case "waiting":
        if (now >= block.startedAt) rebuild(block, now);
        break;
      default: {
        const unknown = block.state;
        throw new Error(`Unknown fragment state: ${unknown}`);
      }
    }
  }

  const busy = blocks.filter((b) => b.state !== "holding" && b.state !== "waiting").length;
  if (busy < MAX_BUSY && now >= nextDissolveAt) {
    let candidate = null;
    for (const block of blocks) {
      if (block.state !== "holding" || block.holdUntil > now) continue;
      if (!candidate || block.holdUntil < candidate.holdUntil) candidate = block;
    }
    if (candidate) {
      startDissolving(candidate, now);
      nextDissolveAt = now + rand(...GAP_MS);
      animating = true;
    }
  }

  return animating;
}

function drawParticles(block, elapsed, inward, fade) {
  for (const p of block.particles) {
    const t = elapsed - p.delay;
    let progress;
    if (inward) {
      if (t <= 0) continue;
      progress = 1 - Math.min(1, t / p.life);
    } else {
      if (t > p.life) continue;
      progress = Math.max(0, t / p.life);
    }
    const tt = progress * p.life;
    const alpha = p.a * Math.pow(1 - (inward ? easeOut(progress) : progress), 1.6) * fade;
    if (alpha <= 0.004) continue;
    inkCtx.globalAlpha = alpha;
    inkCtx.fillRect(
      p.x + p.vx * tt + Math.sin(p.wobble + tt * 0.006) * 1.4 * progress,
      p.y + p.vy * tt - p.lift * tt * tt,
      p.size,
      p.size,
    );
  }
}

function drawCrisp(block, alpha) {
  if (alpha <= 0) return;
  inkCtx.globalAlpha = alpha;
  inkCtx.drawImage(
    block.canvas,
    block.x - PAD,
    block.y - PAD,
    block.canvas.width / dpr,
    block.canvas.height / dpr,
  );
}

function drawInk(now) {
  inkCtx.setTransform(1, 0, 0, 1, 0, 0);
  inkCtx.globalCompositeOperation = "source-over";
  inkCtx.globalAlpha = 1;
  inkCtx.clearRect(0, 0, ink.width, ink.height);
  inkCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  inkCtx.fillStyle = INK;

  for (const block of blocks) {
    const elapsed = now - block.startedAt;
    switch (block.state) {
      case "assembling": {
        if (elapsed < 0) break;
        const crisp = clamp01((now - (block.endsAt - CROSSFADE_MS)) / CROSSFADE_MS);
        drawParticles(block, elapsed, true, 1 - crisp);
        drawCrisp(block, crisp);
        break;
      }
      case "dissolving":
        drawParticles(block, elapsed, false, 1);
        break;
      case "fadingIn":
        drawCrisp(block, clamp01(elapsed / 1400));
        break;
      case "fadingOut":
        drawCrisp(block, 1 - clamp01(elapsed / 1400));
        break;
      case "holding":
        drawCrisp(block, 1);
        break;
      case "waiting":
        break;
      default: {
        const unknown = block.state;
        throw new Error(`Unknown fragment state: ${unknown}`);
      }
    }
  }

  inkCtx.setTransform(1, 0, 0, 1, 0, 0);
  inkCtx.globalAlpha = 1;
  inkCtx.globalCompositeOperation = "destination-in";
  inkCtx.drawImage(mask, 0, 0, ink.width, ink.height);
  inkCtx.globalCompositeOperation = "source-over";
}

function fillEllipse(g, cx, cy, stretch, radius, reachX, reachY, stops) {
  g.save();
  g.translate(cx, cy);
  g.scale(stretch, 1);
  const gradient = g.createRadialGradient(0, 0, 0, 0, 0, radius);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  g.fillStyle = gradient;
  g.fillRect(-reachX / stretch, -reachY, (2 * reachX) / stretch, 2 * reachY);
  g.restore();
}

function drawLight() {
  const s = pointer.strength;
  const px = pointer.x * dpr;
  const py = pointer.y * dpr;
  const ry = LIGHT_RADIUS_Y * dpr;
  const stretch = LIGHT_RADIUS_X / LIGHT_RADIUS_Y;
  const reachX = LIGHT_RADIUS_X * dpr * 1.7;
  const reachY = ry * 1.7;
  const x0 = Math.max(0, Math.floor(px - reachX));
  const y0 = Math.max(0, Math.floor(py - reachY));
  const x1 = Math.min(lightCanvas.width, Math.ceil(px + reachX));
  const y1 = Math.min(lightCanvas.height, Math.ceil(py + reachY));
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return;

  lightCtx.globalAlpha = 1;
  fillEllipse(lightCtx, px, py, stretch, ry * 1.4, reachX, reachY, [
    [0, `rgba(255, 253, 247, ${GLOW_ALPHA * s})`],
    [0.35, `rgba(255, 253, 247, ${GLOW_ALPHA * s * 0.55})`],
    [0.7, `rgba(255, 253, 247, ${GLOW_ALPHA * s * 0.15})`],
    [1, "rgba(255, 253, 247, 0)"],
  ]);

  litCtx.globalCompositeOperation = "source-over";
  litCtx.clearRect(x0, y0, w, h);
  litCtx.drawImage(ink, x0, y0, w, h, x0, y0, w, h);
  litCtx.globalCompositeOperation = "destination-in";
  fillEllipse(litCtx, px, py, stretch, ry, reachX, reachY, [
    [0, "rgba(0, 0, 0, 1)"],
    [0.2, "rgba(0, 0, 0, 0.9)"],
    [0.45, "rgba(0, 0, 0, 0.55)"],
    [0.7, "rgba(0, 0, 0, 0.22)"],
    [0.88, "rgba(0, 0, 0, 0.06)"],
    [1, "rgba(0, 0, 0, 0)"],
  ]);
  litCtx.globalCompositeOperation = "source-in";
  litCtx.fillStyle = LIT_COLOR;
  litCtx.fillRect(x0, y0, w, h);
  litCtx.globalCompositeOperation = "source-over";

  highlightCtx.globalCompositeOperation = "source-over";
  highlightCtx.clearRect(x0, y0, w, h);
  highlightCtx.drawImage(lit, x0, y0, w, h, x0, y0, w, h);
  highlightCtx.globalCompositeOperation = "source-in";
  highlightCtx.fillStyle = "#fffdf7";
  highlightCtx.fillRect(x0, y0, w, h);
  highlightCtx.globalCompositeOperation = "source-over";

  const offset = Math.max(1, Math.round(dpr));
  lightCtx.globalAlpha = HIGHLIGHT_ALPHA * s;
  lightCtx.drawImage(highlight, x0, y0, w, h, x0, y0 + offset, w, h);
  lightCtx.globalAlpha = LIT_ALPHA * s;
  lightCtx.drawImage(lit, x0, y0, w, h, x0, y0, w, h);
  lightCtx.globalAlpha = 1;
}

function draw(now) {
  drawInk(now);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = BASE_ALPHA;
  ctx.drawImage(ink, 0, 0);
  ctx.globalAlpha = 1;
  lightCtx.clearRect(0, 0, lightCanvas.width, lightCanvas.height);
  if (pointer.strength > 0.004) drawLight();
}

function frame(now) {
  requestAnimationFrame(frame);
  if (!blocks.length) return;

  if (update(now)) dirty = true;

  const dx = pointer.targetX - pointer.x;
  const dy = pointer.targetY - pointer.y;
  const ds = pointer.target - pointer.strength;
  if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1 || Math.abs(ds) > 0.002) {
    pointer.x += dx * 0.25;
    pointer.y += dy * 0.25;
    pointer.strength += ds * 0.08;
    dirty = true;
  }

  if (!dirty) return;
  dirty = false;
  draw(now);
}

function buildMask() {
  const cell = 8;
  const small = document.createElement("canvas");
  small.width = Math.ceil(width / cell);
  small.height = Math.ceil(height / cell);
  const s = small.getContext("2d");
  const image = s.createImageData(small.width, small.height);
  for (let y = 0; y < small.height; y++) {
    for (let x = 0; x < small.width; x++) {
      image.data[(y * small.width + x) * 4 + 3] = Math.round(
        weightAt((x + 0.5) * cell, (y + 0.5) * cell) * 255,
      );
    }
  }
  s.putImageData(image, 0, 0);
  mask.width = ink.width;
  mask.height = ink.height;
  const m = mask.getContext("2d");
  m.imageSmoothingEnabled = true;
  m.drawImage(small, 0, 0, mask.width, mask.height);
}

function populate(now) {
  blocks = [];
  const clearArea =
    Math.max(0, clear.right - clear.left) * Math.max(0, clear.bottom - clear.top);
  const target = Math.max(4, Math.min(22, Math.round((width * height - clearArea) / 60000)));
  const regions = ["top", "bottom", "top", "bottom"];
  while (regions.length < target + 10) regions.push("edges");

  for (const region of regions) {
    if (blocks.length >= target) break;
    const block = { canvas: document.createElement("canvas"), region, fragment: null };
    const fragment = pickFragment(null);
    const spot = findSpot(block, fragment, region);
    if (!spot) continue;
    blocks.push(block);
    startAssembling(block, fragment, spot, now + blocks.length * rand(0, 35), ENTRANCE);
  }
  nextDissolveAt = now + FIRST_CHANGE_MS;
}

function resize() {
  const nextDpr = Math.min(window.devicePixelRatio || 1, 2);
  const nextWidth = document.documentElement.clientWidth;
  const nextHeight = Math.max(main.offsetHeight, document.documentElement.clientHeight);
  if (nextDpr === dpr && nextWidth === width && nextHeight === height) return;
  dpr = nextDpr;
  width = nextWidth;
  height = nextHeight;

  for (const c of [canvas, lightCanvas]) {
    c.style.width = `${width}px`;
    c.style.height = `${height}px`;
  }
  for (const c of [canvas, lightCanvas, ink, lit, highlight]) {
    c.width = Math.round(width * dpr);
    c.height = Math.round(height * dpr);
  }

  const rect = article.getBoundingClientRect();
  clear = {
    left: rect.left + window.scrollX - CLEAR_X,
    right: rect.right + window.scrollX + CLEAR_X,
    top: rect.top + window.scrollY - CLEAR_Y,
    bottom: rect.bottom + window.scrollY + CLEAR_Y,
  };

  const size = parseFloat(getComputedStyle(article).fontSize) || 16;
  type = {
    size,
    lineHeight: Math.round(size * 1.5),
    text: `${size}px ${FONT_FAMILY}`,
    source: `italic ${Math.round(size * 0.82)}px ${FONT_FAMILY}`,
  };

  buildMask();
  populate(performance.now());
  dirty = true;
}

function aimLight() {
  pointer.targetX = pointer.clientX + window.scrollX;
  pointer.targetY = pointer.clientY + window.scrollY;
}

function movePointer(event) {
  pointer.clientX = event.clientX;
  pointer.clientY = event.clientY;
  aimLight();
  if (!pointer.seen) {
    pointer.x = pointer.targetX;
    pointer.y = pointer.targetY;
    pointer.seen = true;
  }
  pointer.target = 1;
}

let releaseTimer = 0;
window.addEventListener("pointermove", movePointer, { passive: true });
window.addEventListener(
  "pointerdown",
  (event) => {
    clearTimeout(releaseTimer);
    movePointer(event);
  },
  { passive: true },
);
window.addEventListener("pointerup", (event) => {
  if (event.pointerType !== "mouse") {
    releaseTimer = setTimeout(() => (pointer.target = 0), 1200);
  }
});
window.addEventListener(
  "scroll",
  () => {
    if (pointer.seen) aimLight();
  },
  { passive: true },
);
document.addEventListener("mouseout", (event) => {
  if (!event.relatedTarget) pointer.target = 0;
});
window.addEventListener("blur", () => (pointer.target = 0));

let resizeTimer = 0;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(resize, 180);
});
document.fonts?.ready.then(resize);

resize();
requestAnimationFrame(frame);
