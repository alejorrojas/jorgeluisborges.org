import { fragments } from "./fragments.js";

const canvas = document.getElementById("fragments");
const article = document.querySelector("article");
const ctx = canvas.getContext("2d");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const INK = "#292421";
const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const TEXT_FONT = `11px ${FONT}`;
const SOURCE_FONT = `italic 10px ${FONT}`;
const LINE_HEIGHT = 15.5;
const PAD = 3;

// How visible the ink is at rest, and under the light.
const BASE_ALPHA = 0.032;
const LIT_ALPHA = 0.62;
const HIGHLIGHT_ALPHA = 0.95;
const GLOW_ALPHA = 0.55;
const LIGHT_RADIUS = 210;

const HOLD_MS = [14000, 32000];
const GAP_MS = [1600, 3800];
const MAX_DISSOLVING = 2;
const TYPE_MS_PER_CHAR = [20, 34];
const DISSOLVE_SWEEP_MS = 1100;
const PARTICLE_LIFE_MS = [900, 1600];
const MAX_PARTICLES = 1800;
const MIN_GUTTER = 150;
const COLUMN_MARGIN = 56;
const BLOCK_SPACING = 18;
const RELOCATE_CHANCE = 0.65;

const ink = document.createElement("canvas");
const inkCtx = ink.getContext("2d");
const lit = document.createElement("canvas");
const litCtx = lit.getContext("2d");
const highlight = document.createElement("canvas");
const highlightCtx = highlight.getContext("2d");
const mask = document.createElement("canvas");
const measureCtx = document.createElement("canvas").getContext("2d");

let dpr = 1;
let width = 0;
let height = 0;
let column = { left: 0, right: 0 };
let enabled = false;
let blocks = [];
let bag = [];
let nextDissolveAt = 0;
let dirty = true;

const pointer = { x: 0, y: 0, targetX: 0, targetY: 0, strength: 0, target: 0, seen: false };

const rand = (min, max) => min + Math.random() * (max - min);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smoothstep = (e0, e1, v) => {
  const t = clamp01((v - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// 1 at the window edges, 0 at the reading column.
function edgeWeight(x) {
  if (x < column.left) return smoothstep(0, 0.85, 1 - x / column.left);
  if (x > column.right) return smoothstep(0, 0.85, (x - column.right) / (width - column.right));
  return 0;
}

function nextFragment() {
  const showing = new Set(blocks.map((b) => b.fragment));
  if (!bag.length) bag = shuffle(fragments.slice());
  let index = bag.findIndex((f) => !showing.has(f));
  if (index < 0) {
    bag = shuffle(fragments.filter((f) => !showing.has(f)));
    index = 0;
  }
  return bag.splice(index, 1)[0] ?? fragments[Math.floor(Math.random() * fragments.length)];
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
  const rows = wrap(fragment.text, TEXT_FONT, boxWidth).map((text) => ({
    text,
    font: TEXT_FONT,
    alpha: 1,
  }));
  rows.push(null);
  for (const text of wrap(`— ${fragment.source}`, SOURCE_FONT, boxWidth)) {
    rows.push({ text, font: SOURCE_FONT, alpha: 0.72 });
  }
  return rows;
}

function fits(block, rect) {
  if (rect.x < 8 || rect.y < 8 || rect.x + rect.w > width - 8 || rect.y + rect.h > height - 8) {
    return false;
  }
  if (rect.x < column.left && rect.x + rect.w > column.left) return false;
  if (rect.x < column.right && rect.x + rect.w > column.right) return false;
  if (rect.x >= column.left && rect.x + rect.w <= column.right) return false;
  return blocks.every(
    (other) =>
      other === block ||
      !other.fragment ||
      rect.x + rect.w + BLOCK_SPACING < other.x ||
      other.x + other.w + BLOCK_SPACING < rect.x ||
      rect.y + rect.h + BLOCK_SPACING < other.y ||
      other.y + other.h + BLOCK_SPACING < rect.y,
  );
}

function findSpot(block, fragment) {
  for (let attempt = 0; attempt < 260; attempt++) {
    const left = Math.random() < 0.5;
    const start = left ? 0 : column.right;
    const end = left ? column.left : width;
    const w = Math.min(rand(170, 265), end - start - 28);
    if (w < 110) continue;
    const rows = layout(fragment, w);
    const h = rows.length * LINE_HEIGHT;
    const rect = { x: rand(start + 12, end - w - 12), y: rand(12, height - h - 12), w, h };
    const weight = edgeWeight(rect.x + w / 2);
    if (Math.random() > weight * weight + 0.04) continue;
    if (fits(block, rect)) return { ...rect, rows };
  }
  return null;
}

function spotInPlace(block, fragment) {
  const rows = layout(fragment, block.w);
  const rect = { x: block.x, y: block.y, w: block.w, h: rows.length * LINE_HEIGHT };
  return fits(block, rect) ? { ...rect, rows } : null;
}

function renderBlock(block) {
  const c = block.canvas;
  const cw = Math.ceil((block.w + PAD * 2) * dpr);
  const ch = Math.ceil((block.h + PAD * 2) * dpr);
  if (c.width !== cw || c.height !== ch) {
    c.width = cw;
    c.height = ch;
  }
  const g = c.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, block.w + PAD * 2, block.h + PAD * 2);
  g.fillStyle = INK;
  g.textBaseline = "top";
  let remaining = block.shown;
  block.rows.forEach((row, i) => {
    if (!row || remaining <= 0) return;
    g.font = row.font;
    g.globalAlpha = row.alpha;
    g.fillText(row.text.slice(0, remaining), PAD, PAD + i * LINE_HEIGHT + 2);
    remaining -= row.text.length;
  });
  block.rendered = block.shown;
}

function startWriting(block, fragment, spot, startAt) {
  Object.assign(block, spot, {
    fragment,
    state: "typing",
    startedAt: startAt,
    msPerChar: rand(...TYPE_MS_PER_CHAR),
    total: spot.rows.reduce((sum, row) => sum + (row ? row.text.length : 0), 0),
    shown: 0,
    rendered: -1,
    fade: reduceMotion ? 0 : 1,
    particles: [],
  });
}

function startDissolve(block, now) {
  block.startedAt = now;
  if (reduceMotion) {
    block.state = "fading";
    return;
  }
  const c = block.canvas;
  const data = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let step = Math.max(2, Math.round(1.5 * dpr));
  const count = (s) => {
    let n = 0;
    for (let y = 0; y < c.height; y += s) {
      for (let x = 0; x < c.width; x += s) if (data[(y * c.width + x) * 4 + 3] > 60) n++;
    }
    return n;
  };
  while (count(step) > MAX_PARTICLES) step++;

  const size = step / dpr;
  const particles = [];
  for (let y = 0; y < c.height; y += step) {
    for (let x = 0; x < c.width; x += step) {
      const alpha = data[(y * c.width + x) * 4 + 3];
      if (alpha <= 60) continue;
      particles.push({
        x: block.x - PAD + x / dpr,
        y: block.y - PAD + y / dpr,
        a: alpha / 255,
        size,
        delay: (x / c.width) * DISSOLVE_SWEEP_MS + rand(0, 280),
        life: rand(...PARTICLE_LIFE_MS),
        vx: rand(-0.006, 0.034),
        vy: rand(-0.028, 0.008),
        lift: rand(0.000006, 0.00002),
        wobble: rand(0, Math.PI * 2),
      });
    }
  }
  block.particles = particles;
  block.state = "dissolving";
  block.endsAt = now + DISSOLVE_SWEEP_MS + 280 + PARTICLE_LIFE_MS[1];
}

function rewrite(block, now) {
  const fragment = nextFragment();
  const spot =
    (Math.random() > RELOCATE_CHANCE && spotInPlace(block, fragment)) || findSpot(block, fragment);
  if (!spot) {
    bag.push(fragment);
    block.fragment = null;
    block.state = "waiting";
    block.startedAt = now + 2500;
    return;
  }
  startWriting(block, fragment, spot, now + rand(250, 900));
}

function update(now) {
  let animating = false;

  for (const block of blocks) {
    switch (block.state) {
      case "typing": {
        animating = true;
        if (reduceMotion) {
          block.shown = block.total;
          block.fade = clamp01((now - block.startedAt) / 1400);
          if (block.fade >= 1) block.state = "holding";
        } else {
          block.shown = Math.min(
            block.total,
            Math.max(0, Math.floor((now - block.startedAt) / block.msPerChar)),
          );
          if (block.shown >= block.total) block.state = "holding";
        }
        if (block.state === "holding") block.holdUntil = now + rand(...HOLD_MS);
        if (block.shown !== block.rendered) renderBlock(block);
        break;
      }
      case "holding":
        break;
      case "fading":
        animating = true;
        block.fade = 1 - clamp01((now - block.startedAt) / 1400);
        if (block.fade <= 0) rewrite(block, now);
        break;
      case "dissolving":
        animating = true;
        if (now >= block.endsAt) rewrite(block, now);
        break;
      case "waiting":
        if (now >= block.startedAt) rewrite(block, now);
        break;
      default: {
        const unknown = block.state;
        throw new Error(`Unknown fragment state: ${unknown}`);
      }
    }
  }

  const busy = blocks.filter((b) => b.state === "dissolving" || b.state === "fading").length;
  if (busy < MAX_DISSOLVING && now >= nextDissolveAt) {
    let candidate = null;
    for (const block of blocks) {
      if (block.state !== "holding" || block.holdUntil > now) continue;
      if (!candidate || block.holdUntil < candidate.holdUntil) candidate = block;
    }
    if (candidate) {
      startDissolve(candidate, now);
      nextDissolveAt = now + rand(...GAP_MS);
      animating = true;
    }
  }

  return animating;
}

function drawInk(now) {
  inkCtx.setTransform(1, 0, 0, 1, 0, 0);
  inkCtx.globalCompositeOperation = "source-over";
  inkCtx.globalAlpha = 1;
  inkCtx.clearRect(0, 0, ink.width, ink.height);
  inkCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  inkCtx.fillStyle = INK;

  for (const block of blocks) {
    if (block.state === "dissolving") {
      const elapsed = now - block.startedAt;
      for (const p of block.particles) {
        const t = elapsed - p.delay;
        if (t > p.life) continue;
        if (t <= 0) {
          inkCtx.globalAlpha = p.a;
          inkCtx.fillRect(p.x, p.y, p.size, p.size);
          continue;
        }
        const progress = t / p.life;
        inkCtx.globalAlpha = p.a * Math.pow(1 - progress, 1.6);
        inkCtx.fillRect(
          p.x + p.vx * t + Math.sin(p.wobble + t * 0.006) * 1.4 * progress,
          p.y + p.vy * t - p.lift * t * t,
          p.size,
          p.size,
        );
      }
    } else if (block.fragment && block.shown > 0 && block.state !== "waiting") {
      inkCtx.globalAlpha = block.fade;
      inkCtx.drawImage(
        block.canvas,
        block.x - PAD,
        block.y - PAD,
        block.canvas.width / dpr,
        block.canvas.height / dpr,
      );
    }
  }

  inkCtx.setTransform(1, 0, 0, 1, 0, 0);
  inkCtx.globalAlpha = 1;
  inkCtx.globalCompositeOperation = "destination-in";
  inkCtx.drawImage(mask, 0, 0);
  inkCtx.globalCompositeOperation = "source-over";
}

function drawLight() {
  const s = pointer.strength;
  const px = pointer.x * dpr;
  const py = pointer.y * dpr;
  const r = LIGHT_RADIUS * dpr;
  const x0 = Math.max(0, Math.floor(px - r * 1.15));
  const y0 = Math.max(0, Math.floor(py - r * 1.15));
  const x1 = Math.min(canvas.width, Math.ceil(px + r * 1.15));
  const y1 = Math.min(canvas.height, Math.ceil(py + r * 1.15));
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return;

  const glow = ctx.createRadialGradient(px, py, 0, px, py, r * 1.15);
  glow.addColorStop(0, `rgba(255, 255, 255, ${GLOW_ALPHA * s})`);
  glow.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.globalAlpha = 1;
  ctx.fillStyle = glow;
  ctx.fillRect(x0, y0, w, h);

  litCtx.globalCompositeOperation = "source-over";
  litCtx.clearRect(0, 0, lit.width, lit.height);
  litCtx.drawImage(ink, x0, y0, w, h, x0, y0, w, h);
  litCtx.globalCompositeOperation = "destination-in";
  const falloff = litCtx.createRadialGradient(px, py, 0, px, py, r);
  falloff.addColorStop(0, "rgba(0, 0, 0, 1)");
  falloff.addColorStop(0.45, "rgba(0, 0, 0, 0.55)");
  falloff.addColorStop(1, "rgba(0, 0, 0, 0)");
  litCtx.fillStyle = falloff;
  litCtx.fillRect(x0, y0, w, h);
  litCtx.globalCompositeOperation = "source-over";

  highlightCtx.globalCompositeOperation = "source-over";
  highlightCtx.clearRect(0, 0, highlight.width, highlight.height);
  highlightCtx.drawImage(lit, x0, y0, w, h, x0, y0, w, h);
  highlightCtx.globalCompositeOperation = "source-in";
  highlightCtx.fillStyle = "#ffffff";
  highlightCtx.fillRect(x0, y0, w, h);
  highlightCtx.globalCompositeOperation = "source-over";

  const offset = Math.max(1, Math.round(dpr));
  ctx.globalAlpha = HIGHLIGHT_ALPHA * s;
  ctx.drawImage(highlight, x0, y0, w, h, x0, y0 + offset, w, h);
  ctx.globalAlpha = LIT_ALPHA * s;
  ctx.drawImage(lit, x0, y0, w, h, x0, y0, w, h);
}

function draw(now) {
  drawInk(now);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = BASE_ALPHA;
  ctx.drawImage(ink, 0, 0);
  if (pointer.strength > 0.004) drawLight();
  ctx.globalAlpha = 1;
}

function frame(now) {
  requestAnimationFrame(frame);
  if (!enabled) return;

  if (update(now)) dirty = true;

  const dx = pointer.targetX - pointer.x;
  const dy = pointer.targetY - pointer.y;
  const ds = pointer.target - pointer.strength;
  if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1 || Math.abs(ds) > 0.002) {
    pointer.x += dx * 0.2;
    pointer.y += dy * 0.2;
    pointer.strength += ds * 0.07;
    dirty = true;
  }

  if (!dirty) return;
  dirty = false;
  draw(now);
}

function buildMask() {
  mask.width = ink.width;
  mask.height = ink.height;
  const m = mask.getContext("2d");
  const gradient = m.createLinearGradient(0, 0, mask.width, 0);
  const stops = 96;
  for (let i = 0; i <= stops; i++) {
    gradient.addColorStop(i / stops, `rgba(0, 0, 0, ${edgeWeight((i / stops) * width)})`);
  }
  m.fillStyle = gradient;
  m.fillRect(0, 0, mask.width, mask.height);
}

function populate(now) {
  blocks = [];
  bag = [];
  const gutterArea = (column.left + (width - column.right)) * height;
  // Keep at least one quotation off screen so every rewrite can bring in a different one.
  const target = Math.max(1, Math.min(fragments.length - 1, Math.round(gutterArea / 30000)));
  let failures = 0;
  while (blocks.length < target && failures < 30) {
    const block = { canvas: document.createElement("canvas"), fragment: null, state: "waiting" };
    const fragment = nextFragment();
    const spot = findSpot(block, fragment);
    if (!spot) {
      bag.push(fragment);
      failures++;
      continue;
    }
    blocks.push(block);
    startWriting(block, fragment, spot, now + blocks.length * rand(140, 420));
  }
  nextDissolveAt = now + 6000;
}

function resize() {
  const nextDpr = Math.min(window.devicePixelRatio || 1, 2);
  const nextWidth = document.documentElement.clientWidth;
  const nextHeight = document.documentElement.clientHeight;
  if (nextDpr === dpr && nextWidth === width && nextHeight === height) return;
  dpr = nextDpr;
  width = nextWidth;
  height = nextHeight;
  for (const c of [canvas, ink, lit, highlight]) {
    c.width = Math.round(width * dpr);
    c.height = Math.round(height * dpr);
  }
  const rect = article.getBoundingClientRect();
  column = { left: rect.left - COLUMN_MARGIN, right: rect.right + COLUMN_MARGIN };
  enabled = column.left >= MIN_GUTTER && width - column.right >= MIN_GUTTER;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!enabled) {
    blocks = [];
    return;
  }
  buildMask();
  populate(performance.now());
  dirty = true;
}

function movePointer(event) {
  pointer.targetX = event.clientX;
  pointer.targetY = event.clientY;
  if (!pointer.seen) {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
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
document.addEventListener("mouseout", (event) => {
  if (!event.relatedTarget) pointer.target = 0;
});
window.addEventListener("blur", () => (pointer.target = 0));

let resizeTimer = 0;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(resize, 180);
});

resize();
requestAnimationFrame(frame);
