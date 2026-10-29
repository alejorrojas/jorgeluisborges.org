import * as THREE from "three";
import { Text } from "troika-three-text";

// The words Borges is saying stand to the right of where you arrive, at eye height, facing
// you. A couple of lines show either side of the one he is on. The words already said
// fill in, and the rest stays faint, so the line lights up as he speaks.
const RIGHT = 2.4;
const AHEAD = 5;
const FONT_SIZE = 0.062;
const LINE_HEIGHT = 1.55;
const MAX_WIDTH = 1.6;
const CONTEXT_LINES = 2;
const FADE_RATE = 2;

const SPOKEN = "#292421";
const UNSPOKEN = "#c9c2b8";
const NEAR = "#d9d3c9";
const FAR = "#e4dfd6";

// `lines` is [[start, end, text, wordStarts]], with each word's start in seconds.
export function createTranscript(lines, { font, start, eye, width = MAX_WIDTH }) {
  const words = lines.map(([, , text]) => text.split(" "));
  const group = new THREE.Group();
  const page = new Text();
  page.font = font;
  page.fontSize = FONT_SIZE;
  page.lineHeight = LINE_HEIGHT;
  page.maxWidth = width;
  page.textAlign = "center";
  page.anchorX = "center";
  page.anchorY = "middle";
  page.material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
  group.add(page);
  group.visible = false;
  // To your right as you face the letter, and far enough ahead to sit in that side of the view.
  group.position.set(start.x + RIGHT, eye, start.z - AHEAD);
  group.lookAt(start.x, eye, start.z);

  let shown = 0;
  let key = "";

  const lineAt = (time) => {
    let low = 0;
    let high = lines.length - 1;
    if (time < lines[0][0]) return -1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (lines[mid][0] <= time) low = mid;
      else high = mid - 1;
    }
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
    update(time, delta) {
      const current = time == null ? -1 : lineAt(time);
      const wanted = current < 0 ? 0 : 1;
      shown += (wanted - shown) * Math.min(1, FADE_RATE * delta);
      if (shown < 0.01) {
        group.visible = false;
        return;
      }
      if (current >= 0) {
        const said = lines[current][3].filter((startAt) => startAt <= time).length;
        const next = `${current}:${said}`;
        if (next !== key) {
          key = next;
          layout(current, said);
        }
      }
      page.fillOpacity = shown;
      group.visible = true;
    },
  };
}
