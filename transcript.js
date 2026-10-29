import * as THREE from "three";
import { Text } from "troika-three-text";

// What Borges is saying lies on the ground just ahead of your feet, read like a page you
// carry with you: a couple of lines either side of the one he is on, with the words
// already said inked in. It is there whenever he is speaking; look down to read it.
const AHEAD = 0.72;
const FONT_SIZE = 0.042;
const LINE_HEIGHT = 1.6;
const MAX_WIDTH = 1.1;
// A soft clearing in the background color, so fragments drifting below the ground don't
// cross the page.
const CLEARING = { width: 1.9, depth: 0.9, alpha: 0.92 };
const CONTEXT_LINES = 2;
const FOLLOW_RATE = 12;
const FADE_RATE = 2;

const SPOKEN = "#292421";
const UNSPOKEN = "#a39c92";
const NEAR = "#bdb6ac";
const FAR = "#d8d3ca";

// `lines` is [[start, end, text, wordStarts]], with each word's start in seconds.
export function createTranscript(lines, { font, background, width = MAX_WIDTH }) {
  const words = lines.map(([, , text]) => text.split(" "));
  const group = new THREE.Group();

  const clearing = new THREE.Mesh(
    new THREE.PlaneGeometry(CLEARING.width, CLEARING.depth),
    new THREE.MeshBasicMaterial({
      color: background,
      alphaMap: createClearingTexture(),
      transparent: true,
      depthTest: false,
      depthWrite: false,
      fog: false,
    }),
  );
  clearing.rotation.x = -Math.PI / 2;
  clearing.renderOrder = 1;
  group.add(clearing);

  const page = new Text();
  page.font = font;
  page.fontSize = FONT_SIZE;
  page.lineHeight = LINE_HEIGHT;
  page.maxWidth = width;
  page.textAlign = "center";
  page.anchorX = "center";
  page.anchorY = "middle";
  page.material = new THREE.MeshBasicMaterial({ fog: false, transparent: true, depthTest: false, depthWrite: false });
  page.rotation.x = -Math.PI / 2;
  page.renderOrder = 2;
  group.add(page);
  group.visible = false;

  let shown = 0;
  let placed = false;
  let key = "";
  const yawView = new THREE.Euler(0, 0, 0, "YXZ");

  const lineAt = (time) => {
    let low = 0;
    let high = lines.length - 1;
    if (time < lines[0][0]) return -1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (lines[mid][0] <= time) low = mid;
      else high = mid - 1;
    }
    // Between lines, the last one stays up until the next begins.
    return low;
  };

  const layout = (current, said) => {
    const first = Math.max(0, current - CONTEXT_LINES);
    const last = Math.min(lines.length - 1, current + CONTEXT_LINES);
    const ranges = {};
    let text = "";
    for (let i = first; i <= last; i++) {
      if (text) text += "\n";
      const distance = Math.abs(i - current);
      if (distance === 0) {
        const spoken = words[i].slice(0, said).join(" ");
        ranges[text.length] = SPOKEN;
        ranges[text.length + spoken.length] = UNSPOKEN;
      } else {
        ranges[text.length] = distance === 1 ? NEAR : FAR;
      }
      text += lines[i][2];
    }
    page.text = text;
    page.colorRanges = ranges;
  };

  return {
    group,
    // `time` is where the voice is in the interview, or null when it isn't playing.
    update(time, position, yaw, delta) {
      const current = time == null ? -1 : lineAt(time);
      const wanted = current < 0 ? 0 : 1;
      shown += (wanted - shown) * Math.min(1, FADE_RATE * delta);
      if (shown < 0.01) {
        group.visible = false;
        placed = false;
        return;
      }

      if (current >= 0) {
        const said = lines[current][3].filter((start) => start <= time).length;
        const next = `${current}:${said}`;
        if (next !== key) {
          key = next;
          layout(current, said);
        }
      }

      // The page turns with you, eased just enough not to jitter.
      if (!placed) {
        yawView.y = yaw;
        placed = true;
      } else {
        const turn = THREE.MathUtils.euclideanModulo(yaw - yawView.y + Math.PI, Math.PI * 2) - Math.PI;
        yawView.y += turn * Math.min(1, FOLLOW_RATE * delta);
      }
      group.rotation.y = yawView.y + Math.PI;
      group.position.set(
        position.x + Math.sin(yawView.y) * AHEAD,
        0,
        position.z + Math.cos(yawView.y) * AHEAD,
      );
      page.fillOpacity = shown;
      clearing.material.opacity = shown * CLEARING.alpha;
      group.visible = true;
    },
  };
}

// An oval that is solid in the middle and dissolves toward the edges.
function createClearingTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "#fff");
  gradient.addColorStop(0.55, "#fff");
  gradient.addColorStop(1, "#000");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}
