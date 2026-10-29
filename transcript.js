import * as THREE from "three";
import { Text } from "troika-three-text";

// The words Borges is saying stand to the right of where you arrive, at eye height, facing
// you. The opening passage is already there, readable, before he has said any of it. As he
// speaks, the words already said fill in. When the voice loops, this loops with it, and the
// passage stays up: it is never cleared.
const RIGHT = 3.2;
const AHEAD = 5;
const FONT_SIZE = 0.062;
const LINE_HEIGHT = 1.5;
const MAX_WIDTH = 2.8;
const LINES_BEFORE = 1;
const LINES_AFTER = 6;

const SPOKEN = "#292421";
const WAITING = "#6f6a64";
const LATER = "#918c86";

// `lines` is [[start, end, text, wordStarts]], with each word's start in seconds.
export function createTranscript(lines, { font, start, eye, from, width = MAX_WIDTH }) {
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
  page.material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, fog: false });
  group.add(page);
  // To your right as you face the letter, and far enough ahead to sit in that side of the view.
  group.position.set(start.x + RIGHT, eye, start.z - AHEAD);
  group.lookAt(start.x, eye, start.z);

  let pinned = null;
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
    const first = Math.max(lineAt(from), current - LINES_BEFORE);
    const last = Math.min(lines.length - 1, current + LINES_AFTER);
    const ranges = {};
    let text = "";
    for (let i = first; i <= last; i++) {
      if (text) text += "\n";
      if (i === current && said > 0) {
        const spoken = words[i].slice(0, said).join(" ");
        ranges[text.length] = SPOKEN;
        ranges[text.length + spoken.length] = WAITING;
      } else {
        ranges[text.length] = i > current + 3 ? LATER : WAITING;
      }
      text += lines[i][2];
    }
    // A bad time must not wipe the passage. The last text stays until a real page replaces it.
    if (!text) return;
    page.text = text;
    page.colorRanges = ranges;
  };

  const show = (current, said) => {
    const next = `${current}:${said}`;
    if (next === key) return;
    key = next;
    layout(current, said);
  };

  show(lineAt(from), 0);

  return {
    group,
    // `time` is where the voice is in the interview, or null before it has started. Before
    // it starts the opening stays up, unlit. Once it is going, including when it loops
    // back to the beginning, some of the passage is always on the page.
    update(time) {
      if (time != null && Number.isFinite(time)) pinned = time;
      const reading = Math.max(pinned ?? from, from);
      const current = lineAt(reading);
      if (current < 0) return;
      const said = pinned == null ? 0 : lines[current][3].filter((startAt) => startAt <= pinned).length;
      show(current, said);
    },
  };
}
