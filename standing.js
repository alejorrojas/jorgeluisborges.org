import * as THREE from "three";
import { Text } from "troika-three-text";
import { fragments } from "./fragments.js";

// Quotations standing on the ground at the height of your eyes, scattered among which you
// walk. They are only text, so you pass through them; the letter is the one solid thing.
// Each reads from both sides. Those left far behind come back somewhere out in the haze
// and fade in, so there are always some around you.
const COUNT = 16;
const DISTANCE = [4, 38];
const RETURN_DISTANCE = [30, 40];
const LEAVE_DISTANCE = 46;
// Kept clear of the letter and of the open way to it from where you arrive, of where you
// are when they come back, and of each other.
const SIGN_ROOM = 4.5;
const PATH_ROOM = 3;
const YOU_ROOM = 4;
const SPACING = 3.2;

const HEIGHT = 1.5;
const FONT_SIZE = 0.075;
const LINE_HEIGHT = 1.4;
const MAX_WIDTH = 1.5;
const INK = "#292421";
const SOURCE_INK = "#8f8880";
const ALPHA = 0.62;
const APPEAR_MS = 2500;

export async function createStanding({ font, start, sign, count = COUNT }) {
  const group = new THREE.Group();
  const chosen = [...fragments].sort(() => Math.random() - 0.5).slice(0, count);
  const panels = await Promise.all(chosen.map((fragment) => createPanel(fragment, font)));
  const path = new THREE.Line3(
    new THREE.Vector3(start.x, HEIGHT, start.z),
    new THREE.Vector3(sign.x, HEIGHT, sign.z),
  );
  const isOpen = (spot) =>
    spot.distanceTo(path.end) > SIGN_ROOM && path.closestPointToPoint(spot, true, new THREE.Vector3()).distanceTo(spot) > PATH_ROOM;
  const now = performance.now();
  for (const panel of panels) {
    group.add(panel.group);
    place(panel, panels, path.start, DISTANCE, isOpen);
    panel.shownAt = now - APPEAR_MS;
  }

  return {
    group,
    update(position, now) {
      for (const panel of panels) {
        const away = Math.hypot(panel.group.position.x - position.x, panel.group.position.z - position.z);
        if (away > LEAVE_DISTANCE) {
          place(panel, panels, position, RETURN_DISTANCE, isOpen);
          panel.shownAt = now;
        }
        const shown = THREE.MathUtils.smoothstep(now - panel.shownAt, 0, APPEAR_MS);
        for (const face of panel.faces) face.fillOpacity = ALPHA * shown;
      }
    },
  };
}

async function createPanel(fragment, font) {
  const group = new THREE.Group();
  const quote = fragment.text;
  const text = `${quote}\n${fragment.source}`;
  const faces = await Promise.all(
    [0, Math.PI].map((turn) => {
      const face = new Text();
      face.text = text;
      face.font = font;
      face.fontSize = FONT_SIZE;
      face.lineHeight = LINE_HEIGHT;
      face.maxWidth = MAX_WIDTH;
      face.anchorX = "center";
      face.anchorY = "middle";
      face.color = INK;
      face.colorRanges = { 0: INK, [quote.length + 1]: SOURCE_INK };
      face.material = new THREE.MeshBasicMaterial({ side: THREE.FrontSide, transparent: true });
      face.rotation.y = turn;
      group.add(face);
      return new Promise((resolve) => face.sync(() => resolve(face)));
    }),
  );
  group.position.y = HEIGHT;
  return { group, faces, shownAt: 0 };
}

// A random free spot at a distance in `range` from `center`, facing a random way.
function place(panel, panels, center, range, isOpen) {
  const spot = new THREE.Vector3();
  for (let tries = 0; tries < 40; tries++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = THREE.MathUtils.lerp(range[0], range[1], Math.sqrt(Math.random()));
    spot.set(center.x + Math.sin(angle) * distance, HEIGHT, center.z + Math.cos(angle) * distance);
    const crowded = panels.some(
      (other) => other !== panel && other.group.position.distanceTo(spot) < SPACING,
    );
    const you = Math.hypot(spot.x - center.x, spot.z - center.z);
    if (!crowded && isOpen(spot) && you > YOU_ROOM) break;
  }
  panel.group.position.copy(spot);
  panel.group.rotation.y = Math.random() * Math.PI * 2;
}
