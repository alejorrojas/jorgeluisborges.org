import * as THREE from "three";
import { fragments } from "./fragments.js";

// At rest the ink is barely there; lighting up, it fills in, short of full black.
const INK = "#292421";
const LIT_COLOR = "#292421";
const LIT_ALPHA = 0.7;
const FONT_FAMILY = '"Helvetica Neue", Helvetica, Arial, sans-serif';

// Fragments hang still in the world at every depth around you, above and below too, and
// fade into the haze with distance. Walking, near ones drift past far ones; those left
// behind beyond the haze come back somewhere around you, so the field never ends.
const COUNT = 110;
const DISTANCE = [14, 180];
// Spots for fragments that come back, out in the haze so they do not pop in.
const RETURN_DISTANCE = [120, 180];
const FADE = { near: [5, 13], far: [95, 180] };
const MAX_ELEVATION = 80;
const SPACING = 1.3;

// Fragments are drawn to canvases in px, then scaled into meters.
const FONT_PX = 30;
const LINE_PX = 45;
const WRAP_PX = [400, 560];
const PAD_PX = 8;
const METERS_PER_PX = [0.025, 0.045];
const PIXEL_PX = 4;

// How visible the ink is at rest, and under the light.
const BASE_ALPHA = 0.08;
const ASSEMBLE_MS = 2400;
const DISSOLVE_MS = 2000;
const HOLD_MS = [6000, 14000];
const GAP_MS = [400, 1100];
const MAX_BUSY = 4;
const RELOCATE_CHANCE = 0.6;
const FIRST_CHANGE_MS = 4000;

// On arrival these are already whole, with no assembly. Angles are from a level gaze; the
// camera tilts up just after. The Aleph stays large, above and to the left. The rest sit
// further back in the landscape. One sits just behind the letter, in the same kind of
// place as the others, facing you.
const PLACED = [
  { start: "Vi en el Aleph la tierra", distance: 46, yaw: 19, pitch: 16, wrapPx: 680, metersPerPx: 0.05, holdMs: 30000 },
  { start: "El universo (que otros llaman", distance: 78, yaw: -26, pitch: 5, wrapPx: 520, metersPerPx: 0.032, holdMs: 50000 },
  { start: "El tiempo se bifurca", distance: 70, yaw: 34, pitch: -2, wrapPx: 440, metersPerPx: 0.03, holdMs: 46000 },
  { start: "Ser inmortal es baladí", distance: 100, yaw: -8, pitch: 22, wrapPx: 430, metersPerPx: 0.028, holdMs: 54000 },
  { start: "Nadie lo vio desembarcar", distance: 86, yaw: 6, pitch: -11, wrapPx: 460, metersPerPx: 0.03, holdMs: 48000 },
  { start: "No sé cuál de los dos", distance: 92, yaw: -38, pitch: 14, wrapPx: 400, metersPerPx: 0.028, holdMs: 52000 },
  { start: "A mí se me hace cuento", distance: 108, yaw: 24, pitch: 9, wrapPx: 500, metersPerPx: 0.026, holdMs: 44000 },
  { start: "La Biblioteca es ilimitada", distance: 32, yaw: 0, pitch: -2, wrapPx: 460, metersPerPx: 0.032, holdMs: 70000 },
];

// Fragments glow on their own: some light up whole, others in parts as a light passes.
const LIGHT_GAP_MS = [700, 1800];
const MAX_LIT = 6;
const GLOW_MS = { rise: 1400, stay: [1800, 3600], fall: 2000 };
const SWEEP_MS = [4200, 7000];
const SWEEP_RADIUS = 0.42;

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// The map holds the letters' coverage in red.
const fragmentShader = /* glsl */ `
  uniform sampler2D map;
  uniform vec2 uCells;
  uniform float uAspect;
  uniform float uProgress;
  uniform float uDissolving;
  uniform float uGlow;
  uniform vec4 uSweep;
  uniform vec3 uInk;
  uniform vec3 uLit;
  uniform float uBaseAlpha;
  uniform float uLitAlpha;
  uniform float uFade;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vec2 cell = floor(vUv * uCells);
    vec2 cellUv = (cell + 0.5) / uCells;
    float x = uDissolving > 0.5 ? 1.0 - cellUv.x : cellUv.x;
    // Each pixel arrives (or leaves) on its own turn, sweeping across the fragment.
    float order = x * 0.65 + hash(cell) * 0.35;
    float t = uProgress * 1.35 - order;
    if (t <= 0.0) discard;

    float pixel = texture2D(map, cellUv).r > 0.2 ? 1.0 : 0.0;
    float settle = smoothstep(0.22, 0.35, t);
    float letters = mix(pixel * smoothstep(0.0, 0.12, t), texture2D(map, vUv).r, settle);

    float sweep = uSweep.z * (1.0 - smoothstep(0.0, uSweep.w, length(vec2((vUv.x - uSweep.x) * uAspect, vUv.y - uSweep.y))));
    float light = clamp(max(uGlow, sweep), 0.0, 1.0);
    // Pixels in flight read a little darker, like the dust on the home page.
    float inFlight = (1.0 - settle) * 0.25;

    float alpha = letters * clamp(mix(uBaseAlpha, uLitAlpha, light) + inFlight, 0.0, 1.0);
    if (alpha <= 0.003) discard;

    gl_FragColor = vec4(mix(uInk, uLit, light), alpha * uFade);
    #include <colorspace_fragment>
  }
`;

const rand = (min, max) => min + Math.random() * (max - min);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const easeInOut = (t) => t * t * (3 - 2 * t);
const measureCtx = document.createElement("canvas").getContext("2d");

export function createSky(camera, count = COUNT) {
  const group = new THREE.Group();
  const geometry = new THREE.PlaneGeometry(1, 1);
  const blocks = [];
  let nextChangeAt = performance.now() + FIRST_CHANGE_MS;
  let nextLightAt = performance.now() + rand(...LIGHT_GAP_MS);

  for (let i = 0; i < count; i++) {
    // Blended by hand rather than marked transparent: three leaves transparent objects
    // out of what glass shows through it, and the sign should frost the fragments behind.
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      depthWrite: false,
      side: THREE.FrontSide,
      uniforms: {
        map: { value: null },
        uCells: { value: new THREE.Vector2() },
        uAspect: { value: 1 },
        uProgress: { value: 0 },
        uDissolving: { value: 0 },
        uGlow: { value: 0 },
        uSweep: { value: new THREE.Vector4(0, 0, 0, SWEEP_RADIUS) },
        uInk: { value: new THREE.Color(INK) },
        uLit: { value: new THREE.Color(LIT_COLOR) },
        uBaseAlpha: { value: BASE_ALPHA },
        uLitAlpha: { value: LIT_ALPHA },
        uFade: { value: 1 },
      },
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false;
    group.add(mesh);
    const block = { mesh, material, fragment: null, light: null };
    const placed = i < PLACED.length ? placedSpot(camera, PLACED[i]) : null;
    const fragment = placed ? placed.fragment : pickFragment(blocks, null);
    const spot = placed ?? findSpot(blocks, block, fragment, camera.position, DISTANCE);
    if (!spot) continue;
    blocks.push(block);
    const now = performance.now();
    assemble(block, fragment, spot, now + i * rand(30, 80));
    if (placed) {
      block.state = "holding";
      block.holdUntil = now + PLACED[i].holdMs;
      material.uniforms.uProgress.value = 1;
      mesh.visible = true;
    }
  }

  function update(now) {
    for (const block of blocks) {
      if (block.state !== "waiting" && block.position.distanceTo(camera.position) > DISTANCE[1]) {
        rebuild(block, now, RETURN_DISTANCE);
      }
      step(block, now);
      const distance = block.position.distanceTo(camera.position);
      block.fade =
        THREE.MathUtils.smoothstep(distance, ...FADE.near) *
        (1 - THREE.MathUtils.smoothstep(distance, ...FADE.far));
      block.material.uniforms.uFade.value = block.fade;
      block.mesh.lookAt(camera.position);
      block.mesh.renderOrder = -distance;
    }

    const busy = blocks.filter((b) => b.state === "assembling" || b.state === "dissolving").length;
    if (busy < MAX_BUSY && now >= nextChangeAt) {
      const due = blocks
        .filter((b) => b.state === "holding" && b.holdUntil <= now && !b.light)
        .sort((a, b) => a.holdUntil - b.holdUntil)[0];
      if (due) {
        dissolve(due, now);
        nextChangeAt = now + rand(...GAP_MS);
      }
    }

    const lit = blocks.filter((b) => b.light).length;
    if (lit < MAX_LIT && now >= nextLightAt) {
      const options = blocks.filter((b) => b.state === "holding" && !b.light && b.fade > 0.35);
      const block = options[Math.floor(Math.random() * options.length)];
      if (block) startLight(block, now);
      nextLightAt = now + rand(...LIGHT_GAP_MS);
    }

    for (const block of blocks) shine(block, now);
  }

  function step(block, now) {
    const u = block.material.uniforms;
    switch (block.state) {
      case "assembling": {
        const t = clamp01((now - block.startedAt) / ASSEMBLE_MS);
        u.uProgress.value = t;
        block.mesh.visible = now >= block.startedAt;
        if (t >= 1) {
          block.state = "holding";
          block.holdUntil = now + rand(...HOLD_MS);
        }
        break;
      }
      case "holding":
        u.uProgress.value = 1;
        break;
      case "dissolving": {
        const t = clamp01((now - block.startedAt) / DISSOLVE_MS);
        u.uProgress.value = 1 - t;
        if (t >= 1) rebuild(block, now);
        break;
      }
      case "waiting":
        if (now >= block.startedAt) rebuild(block, now);
        break;
      default: {
        const unknown = block.state;
        throw new Error(`Unknown sky fragment state: ${unknown}`);
      }
    }
  }

  function dissolve(block, now) {
    block.state = "dissolving";
    block.startedAt = now;
    block.material.uniforms.uDissolving.value = 1;
  }

  function rebuild(block, now, range = DISTANCE) {
    block.light = null;
    const fragment = pickFragment(blocks, block.fragment);
    const moves = range !== DISTANCE || Math.random() < RELOCATE_CHANCE;
    const spot = findSpot(blocks, block, fragment, camera.position, range, moves ? null : block.position);
    if (!spot) {
      block.mesh.visible = false;
      block.state = "waiting";
      block.startedAt = now + 2500;
      return;
    }
    assemble(block, fragment, spot, now + rand(80, 300));
  }

  function assemble(block, fragment, spot, startAt) {
    block.material.uniforms.map.value?.dispose();
    Object.assign(block, spot, { fragment, state: "assembling", startedAt: startAt });

    const texture = new THREE.CanvasTexture(spot.canvas);
    texture.anisotropy = 4;
    const u = block.material.uniforms;
    u.map.value = texture;
    u.uCells.value.set(spot.widthPx / PIXEL_PX, spot.heightPx / PIXEL_PX);
    u.uAspect.value = spot.widthPx / spot.heightPx;
    u.uProgress.value = 0;
    u.uDissolving.value = 0;

    const { mesh } = block;
    mesh.visible = false;
    mesh.scale.set(spot.widthPx * spot.metersPerPx, spot.heightPx * spot.metersPerPx, 1);
    mesh.position.copy(spot.position);
  }

  function startLight(block, now) {
    block.light = Math.random() < 0.5
      ? { kind: "glow", startedAt: now, stay: rand(...GLOW_MS.stay) }
      : { kind: "sweep", startedAt: now, duration: rand(...SWEEP_MS), v: rand(0.2, 0.8) };
  }

  function shine(block, now) {
    const u = block.material.uniforms;
    u.uGlow.value = 0;
    u.uSweep.value.z = 0;
    const light = block.light;
    if (!light) return;
    const elapsed = now - light.startedAt;
    switch (light.kind) {
      case "glow": {
        const fallAt = GLOW_MS.rise + light.stay;
        u.uGlow.value =
          elapsed < GLOW_MS.rise
            ? easeInOut(elapsed / GLOW_MS.rise)
            : 1 - easeInOut(clamp01((elapsed - fallAt) / GLOW_MS.fall));
        if (elapsed >= fallAt + GLOW_MS.fall) block.light = null;
        break;
      }
      case "sweep": {
        const t = clamp01(elapsed / light.duration);
        u.uSweep.value.set(-0.15 + t * 1.3, light.v, Math.sin(t * Math.PI), SWEEP_RADIUS);
        if (t >= 1) block.light = null;
        break;
      }
      default: {
        const unknown = light.kind;
        throw new Error(`Unknown sky light: ${unknown}`);
      }
    }
  }

  return { group, update };
}

function pickFragment(blocks, previous) {
  const counts = new Map(fragments.map((f) => [f, 0]));
  for (const block of blocks) {
    if (block.fragment) counts.set(block.fragment, counts.get(block.fragment) + 1);
  }
  const candidates = fragments.filter((f) => f !== previous);
  const fewest = Math.min(...candidates.map((f) => counts.get(f)));
  const options = candidates.filter((f) => counts.get(f) === fewest);
  return options[Math.floor(Math.random() * options.length)];
}

// Picks a place around `center`, within `range` meters, that does not overlap the
// others. With `keep`, it tries to stay where it was first.
function findSpot(blocks, block, fragment, center, range, keep = null) {
  const drawn = drawFragment(fragment);
  const metersPerPx = rand(...METERS_PER_PX);
  const size = Math.max(drawn.widthPx, drawn.heightPx) * metersPerPx;
  for (let attempt = 0; attempt < 200; attempt++) {
    const position =
      keep && attempt === 0
        ? keep.clone()
        : randomDirection().multiplyScalar(randomDistance(range)).add(center);
    const clear = blocks.every(
      (other) =>
        other === block ||
        !other.position ||
        position.distanceTo(other.position) > ((size + other.size) / 2) * SPACING,
    );
    if (clear) return { ...drawn, position, size, metersPerPx };
  }
  return null;
}

function placedSpot(camera, place) {
  const fragment = fragments.find((f) => f.text.startsWith(place.start));
  const drawn = drawFragment(fragment, place.wrapPx);
  const yaw = THREE.MathUtils.degToRad(place.yaw);
  const pitch = THREE.MathUtils.degToRad(place.pitch);
  const position = new THREE.Vector3(
    -Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch),
  )
    .applyQuaternion(camera.quaternion)
    .multiplyScalar(place.distance)
    .add(camera.position);
  const size = Math.max(drawn.widthPx, drawn.heightPx) * place.metersPerPx;
  return { fragment, ...drawn, position, size, metersPerPx: place.metersPerPx };
}

// More fragments far away than near, though fewer than a uniform volume would put there,
// so some always hang close enough to walk past.
function randomDistance([near, far]) {
  return Math.sqrt(rand(near ** 2, far ** 2));
}

// Uniform over the sphere, so fragments are as dense below as above.
function randomDirection() {
  const azimuth = rand(0, Math.PI * 2);
  const limit = Math.sin(THREE.MathUtils.degToRad(MAX_ELEVATION));
  const elevation = Math.asin(rand(-limit, limit));
  return new THREE.Vector3(
    Math.cos(elevation) * Math.sin(azimuth),
    Math.sin(elevation),
    -Math.cos(elevation) * Math.cos(azimuth),
  );
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

function drawFragment(fragment, wrapPx = rand(...WRAP_PX)) {
  const textFont = `${FONT_PX}px ${FONT_FAMILY}`;
  const sourceFont = `italic ${Math.round(FONT_PX * 0.82)}px ${FONT_FAMILY}`;
  const rows = wrap(fragment.text, textFont, wrapPx).map((text) => ({ text, font: textFont, alpha: 1 }));
  rows.push(null);
  for (const text of wrap(fragment.source, sourceFont, wrapPx)) {
    rows.push({ text, font: sourceFont, alpha: 0.72 });
  }

  const widthPx = Math.ceil(wrapPx + PAD_PX * 2);
  const heightPx = Math.ceil(rows.length * LINE_PX + PAD_PX * 2);
  const inset = (LINE_PX - FONT_PX) / 2;
  // White letters on black, so red carries their coverage.
  const canvas = document.createElement("canvas");
  canvas.width = widthPx;
  canvas.height = heightPx;
  const g = canvas.getContext("2d");
  g.fillStyle = "#000";
  g.fillRect(0, 0, widthPx, heightPx);
  g.fillStyle = "#fff";
  g.textBaseline = "top";
  rows.forEach((row, i) => {
    if (!row) return;
    g.font = row.font;
    g.globalAlpha = row.alpha;
    g.fillText(row.text, PAD_PX, PAD_PX + i * LINE_PX + inset);
  });
  return { canvas, widthPx, heightPx };
}
