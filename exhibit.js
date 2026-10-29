import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { Text } from "troika-three-text";
import { createSky } from "./sky.js";
import { createStanding } from "./standing.js";
import { createTranscript } from "./transcript.js";

const BACKGROUND = "#f9f7f1";
const INK = "#292421";
// troika reads .ttf, .otf, and .woff, but not .woff2 or system fonts.
const FONT = "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.woff";
// Tinos is drawn to Times New Roman's metrics.
const LETTER_FONT = "https://cdn.jsdelivr.net/fontsource/fonts/tinos@latest/latin-400-normal.woff";

// The sign is a letter by default; `?sign=glass` shows it as liquid glass instead.
const SIGN_STYLE = new URLSearchParams(location.search).get("sign") ?? "paper";

const EYE_HEIGHT = 1.6;
// Top speed is SPEED / DAMPING meters per second: an unhurried stroll, since in Borges's
// world one walks slowly.
const SPEED = 8;
const DAMPING = 10;
// Walking away, the sign fades into the background.
const FOG_NEAR = 6;
const FOG_FAR = 55;

// The sign, in meters.
const TEXT_WIDTH = 2.4;
const SIGN_DISTANCE = 5;
// You arrive well back from the sign, looking a little up, so the space opens out above
// it before you walk in.
const START_DISTANCE = 14;
const START_PITCH = 0.16;
const BODY_SIZE = 0.065;
// Liquid glass: a clear slab whose thick, rounded rim works as a lens, bending what is
// behind it and catching a bright line of light.
const GLASS_PADDING = 0.26;
const GLASS_RADIUS = 0.2;
const GLASS_CORE = 0.01;
const GLASS_BEVEL = 0.07;
const GLASS_FROST = 0.1;

// A sheet of cotton paper, its pores in the normal map (ambientCG Paper001, CC0), written
// in dark blue ink and lit from the front and back so the grain shows up close.
// A warm ivory, kept bright so it reads as paper rather than brown or gray.
const PAPER_COLOR = "#fbf5eb";
const PAPER_LIGHT = "#ffffff";
const PAPER_THICKNESS = 0.003;
const PAPER_GRAIN_METERS = 0.22;
const PAPER_GRAIN_DEPTH = 1.4;
const PAPER_AMBIENT = 2.1;
// A column narrow enough that the sheet comes out taller than wide, like a letter.
const PAPER_TEXT_WIDTH = 1.8;
const PAPER_PADDING = 0.16;
const LETTER_INK = "#26304a";
const LETTER_SIZE = 0.95;
// You walk around the sign, never through it: you keep this far from the sheet.
const SIGN_CLEARANCE = 0.35;
// Only obstacles whose edge is within this many meters are checked each frame.
const NEAR_OBSTACLE = 2;
const SIGN_LIFT = 0.2;
// The letter icon in the corner turns you back to face the sign, the shortest way round.
const TURN_MS = 1100;
const FLOAT_HEIGHT = 0.025;
const FLOAT_PERIOD = 6;

// Two faint shadows at your feet, one per leg, in meters. Walking, one stays planted while
// the other steps ahead, trading every STEP_LENGTH you travel; standing still, they draw
// back in side by side, at SETTLE_RATE per second.
const LEG_SPACING = 0.2;
const LEG_WIDTH = 0.13;
const LEG_LENGTH = 0.36;
const SHADOW_ALPHA = 0.11;
const STEP_LENGTH = 0.48;
// With each step the head rises toward mid stride and drops as the foot lands, and drifts
// over the planted foot, in meters. `HEAD_RATE` smooths it in and out when you start or stop.
const HEAD_BOB = 0.022;
const HEAD_SWAY = 0.012;
const HEAD_RATE = 10;
const SETTLE_RATE = 6;

// The sign casts a soft shadow onto the ground on your side of it, as if lit from behind.
// Walking around the edge, it fades over to the other side.
const SIGN_SHADOW_GAP = 0.1;
const SIGN_SHADOW_LENGTH = 2.2;
const SIGN_SHADOW_SOFTNESS = 0.35;
const SIGN_SHADOW_ALPHA = 0.035;
const SIGN_SHADOW_TURN = 1.2;

// On a phone or tablet, a thumb on the left half walks, through a joystick that appears
// where it lands, and a finger on the right half looks around. A tap on the letter opens
// it to read, since on a small screen its text is too fine to make out in the scene.
const TOUCH = matchMedia("(pointer: coarse)").matches;
const STICK_RADIUS = 48;
const LOOK_SPEED = 0.005;
const MAX_PITCH = 1.4;
const TAP_MS = 300;
const TAP_PX = 10;
const TOUCH_SKY_COUNT = 60;
const TOUCH_STANDING_COUNT = 10;
// Held upright, the view widens to keep at least PORTRAIT_FOV across, so the sides don't
// close in.
const FOV = 60;
const PORTRAIT_FOV = 50;
const MAX_FOV = 85;

// Borges's voice, from his 1976 interview on "A fondo", joins a few seconds in and fades up,
// skipping the program's opening every time around, and beginning where he is asked if he
// is a cold man and answers that he is sentimental. Phones get fifteen minutes of it
// instead of the whole hour and a half. `offset` is where the file begins in
// the interview, which is what the transcript's times count from.
const VOICE = TOUCH
  ? { src: "./audio/borges-a-fondo-1976-15min.m4a", start: 0, offset: 128 }
  : { src: "./audio/borges-a-fondo-1976.m4a", start: 128, offset: 0 };
const TRANSCRIPT = "./audio/borges-a-fondo-1976.transcript.json";
const TOUCH_TRANSCRIPT_WIDTH = 1.8;
const VOICE_DELAY_MS = 10000;
const VOICE_FADE_MS = 3000;

const BLOCKS = [
  { text: "Jorge Luis Borges is one of the best writers of all time.", gap: 1.5 },
  {
    text:
      "He is the one who got me into reading, with the story “The Aleph,” and I have been reading him since I was a kid. He introduced me to a world of literature that is still my refuge, my source of inspiration, and my way into other perspectives and into life. What I found there was not a list of books to admire. It was a way of looking. A page could hold a city, a century, a belief I had never lived, and still be exact.",
    gap: 1.5,
  },
  {
    text:
      "I consider writing one of the most valuable skills there is, even more now, when generating words and text is so cheap, meaningless, and mass-produced. Anyone can produce text. Very few can make it say what they actually think. From people I admire I have often heard that a good writer is someone with an ordered mind. If you can transmit what you think so that others understand it, that is a valuable skill. For my part, I think that to be a good writer you first have to be an excellent reader. You learn what an ordered mind looks like by living inside other people’s sentences for a long time. Borges is my recommendation for anyone setting out to master that skill. He was my way in.",
    gap: 2.25,
  },
  {
    text: "“Let others boast of the pages they have written; I am proud of the ones I have read.”",
    gap: 0.6,
  },
  {
    text: "Jorge Luis Borges, “Un lector,” Elogio de la sombra",
    scale: 0.85,
    opacity: 0.68,
    gap: 1.5,
  },
  {
    text:
      "More to come on this website and this project. This page is not official and is not affiliated with any institution or estate; it is a project from a reader. To take part, write to contact@jorgeluisborges.org.",
    scale: 0.85,
    opacity: 0.58,
    gap: 0,
  },
];

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, TOUCH ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(BACKGROUND);
scene.fog = new THREE.Fog(BACKGROUND, FOG_NEAR, FOG_FAR);
// Only the glass is lit by this; the text is unlit.
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.05, 300);
camera.position.set(0, EYE_HEIGHT, START_DISTANCE - SIGN_DISTANCE);
fitView();

const controls = new PointerLockControls(camera, document.body);
scene.add(controls.object);

const sky = createSky(camera, TOUCH ? TOUCH_SKY_COUNT : undefined);
scene.add(sky.group);
// Tilted only after the sky is placed, since its first fragment is set from a level gaze.
camera.rotation.set(START_PITCH, 0, 0, "YXZ");

const shadow = createShadow();
scene.add(shadow.group);
const facing = new THREE.Vector3();
const earUp = new THREE.Vector3();
const toVoice = new THREE.Vector3();
const voiceTurn = new THREE.Quaternion();

const transcript = createTranscript(await (await fetch(TRANSCRIPT)).json(), {
  font: LETTER_FONT,
  start: camera.position,
  eye: EYE_HEIGHT,
  from: VOICE.start + VOICE.offset,
  width: TOUCH ? TOUCH_TRANSCRIPT_WIDTH : undefined,
});
scene.add(transcript.group);
// A soft blot on the ground, centered under the words the way each foot's shadow sits
// under the foot. Dense in the middle, fading out well past the text.
const transcriptShadow = createFittedShadow();
transcriptShadow.group.position.set(transcript.group.position.x, 0, transcript.group.position.z);
transcriptShadow.group.quaternion.copy(transcript.group.quaternion);
scene.add(transcriptShadow.group);

const sign = await createSign(SIGN_STYLE);
sign.position.z = -SIGN_DISTANCE;
const signHeight = sign.position.y;
scene.add(sign);
const signShadow = createSignShadow(sign.userData.width);
signShadow.group.position.set(sign.position.x, 0, sign.position.z);
scene.add(signShadow.group);

const standing = await createStanding({
  font: FONT,
  start: camera.position,
  sign: sign.position,
  count: TOUCH ? TOUCH_STANDING_COUNT : undefined,
});
scene.add(standing.group);
const obstacles = [{ position: sign.position, yaw: 0, halfWidth: sign.userData.width / 2 }];

// The keys move you from the start. Looking needs a click, since browsers only capture
// the mouse on one. Esc pauses and Esc again resumes; leaving pointer lock is the
// browser's own Esc, so it pauses too.
const hint = document.getElementById("hint");
const paused = document.getElementById("paused");
const MOVE_KEYS = ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"];
const keys = new Set();
let pausedAt = 0;

const setPaused = (value) => {
  paused.hidden = !value;
  document.body.classList.toggle("is-paused", value);
  pausedAt = value ? performance.now() : 0;
  if (value) keys.clear();
};

if (!TOUCH) renderer.domElement.addEventListener("click", () => controls.lock());
paused.addEventListener("click", () => {
  setPaused(false);
  controls.lock();
});
controls.addEventListener("unlock", () => setPaused(true));

document.addEventListener("keydown", (event) => {
  if (event.code === "Escape") {
    if (!credits.hidden) {
      closeCredits();
      return;
    }
    // The Esc that ended pointer lock can arrive here too; it already paused.
    if (!paused.hidden && performance.now() - pausedAt > 300) setPaused(false);
    else if (paused.hidden) setPaused(true);
    return;
  }
  if (!paused.hidden) return;
  if (MOVE_KEYS.includes(event.code)) {
    event.preventDefault();
    hint.classList.add("gone");
  }
  keys.add(event.code);
});
document.addEventListener("keyup", (event) => keys.delete(event.code));
window.addEventListener("blur", () => keys.clear());

// Credits is a page laid over the walk. The room, the voice, and the hint stay as they
// were; only the cover comes and goes. A direct visit to /credits is still that page.
const credits = document.getElementById("credits");
const creditsFrame = credits.querySelector("iframe");
const rights = document.getElementById("rights");
const WALK_TITLE = document.title;
const CREDITS_TITLE = "Rights and credits | Jorge Luis Borges";
const RIGHTS_LABEL = "credits";
const BACK_LABEL = "go back to the walk";
let coverPaused = false;

const revealCredits = () => {
  if (!creditsFrame.getAttribute("src")) creditsFrame.src = "/credits";
  credits.hidden = false;
  document.title = CREDITS_TITLE;
  rights.textContent = BACK_LABEL;
};

const openCredits = () => {
  coverPaused = paused.hidden;
  if (coverPaused) setPaused(true);
  revealCredits();
  if (location.pathname !== "/credits") history.pushState({ credits: true }, "", "/credits");
};

const hideCredits = () => {
  if (credits.hidden) return;
  credits.hidden = true;
  document.title = WALK_TITLE;
  rights.textContent = RIGHTS_LABEL;
  if (coverPaused) {
    coverPaused = false;
    setPaused(false);
  }
};

function closeCredits() {
  if (location.pathname === "/credits") history.back();
  else hideCredits();
}

rights.addEventListener("click", (event) => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  event.preventDefault();
  if (credits.hidden) openCredits();
  else closeCredits();
});
window.addEventListener("popstate", () => {
  if (location.pathname === "/credits") openCredits();
  else hideCredits();
});
window.addEventListener("message", (event) => {
  if (event.origin !== location.origin || event.data !== "close-credits") return;
  closeCredits();
});

// The voice plays through Web Audio, since iPhones ignore an audio element's own volume;
// a "playback" session keeps it audible with the ringer switched off. Browsers only allow
// sound after a tap, click or key press, so if none has come by the time the voice is
// due, it starts with the first one.
const voice = document.getElementById("voice");
const volume = document.getElementById("volume");
const slider = volume.querySelector("input");
const toggle = volume.querySelector("button");
let level = Number(slider.value);
let fadeIn = 0;
// Rises to 2 when you stand against the transcript, so that spot is louder than the walk.
let near = 1;

if (navigator.audioSession) navigator.audioSession.type = "playback";
const audio = new AudioContext();
const gain = audio.createGain();
gain.gain.value = 0;
// The voice stands where the transcript stands. HRTF places it to the left, the right, or
// behind you. Full distance-gain holds out to where you arrive; past that it falls off
// steeply. Standing against the words, and across the column, adds a further lift.
// Headphones make the direction obvious.
const panner = new PannerNode(audio, {
  panningModel: "HRTF",
  distanceModel: "inverse",
  refDistance: 6,
  maxDistance: 50,
  rolloffFactor: 3,
  coneInnerAngle: 360,
  coneOuterAngle: 360,
  coneOuterGain: 1,
});
audio.createMediaElementSource(voice).connect(gain).connect(panner).connect(audio.destination);

const setEar = (param, value) => param.setValueAtTime(value, audio.currentTime);
function placeEars() {
  camera.getWorldDirection(facing);
  earUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
  const listener = audio.listener;
  const spot = transcript.group.position;
  if (listener.forwardX) {
    setEar(listener.positionX, camera.position.x);
    setEar(listener.positionY, camera.position.y);
    setEar(listener.positionZ, camera.position.z);
    setEar(listener.forwardX, facing.x);
    setEar(listener.forwardY, facing.y);
    setEar(listener.forwardZ, facing.z);
    setEar(listener.upX, earUp.x);
    setEar(listener.upY, earUp.y);
    setEar(listener.upZ, earUp.z);
    setEar(panner.positionX, spot.x);
    setEar(panner.positionY, spot.y);
    setEar(panner.positionZ, spot.z);
  } else {
    listener.setPosition(camera.position.x, camera.position.y, camera.position.z);
    listener.setOrientation(facing.x, facing.y, facing.z, earUp.x, earUp.y, earUp.z);
    panner.setPosition(spot.x, spot.y, spot.z);
  }
  // Local Z is how far you are from the sheet, either side. Local X is how far along it.
  // Right against the words, and in front of the column, the voice lifts above the walk.
  voiceTurn.copy(transcript.group.quaternion).invert();
  toVoice.copy(camera.position).sub(spot).applyQuaternion(voiceTurn);
  const close = (value, full, gone) => {
    if (value <= full) return 1;
    if (value >= gone) return 0;
    const t = (value - full) / (gone - full);
    return 1 - t * t * (3 - 2 * t);
  };
  near = 1 + close(Math.abs(toVoice.z), 1.15, 2.4) * close(Math.abs(toVoice.x), 1.5, 2.6);
  setVolume();
}

const setVolume = () => {
  gain.gain.value = Math.min(1, level * fadeIn * near);
  volume.classList.toggle("muted", level === 0);
  toggle.setAttribute("aria-label", level === 0 ? "Muted" : "Volume");
};

voice.src = VOICE.src;
voice.currentTime = VOICE.start;
// Where the voice is in the interview, or null before it has started. The transcript reads
// this, including across the loop, so the passage is never left blank while the file ends.
let interviewTime = null;
let atLoopPoint = false;
const restartVoice = () => {
  atLoopPoint = true;
  interviewTime = VOICE.start + VOICE.offset;
  if (voice.currentTime > VOICE.start + 0.5) voice.currentTime = VOICE.start;
  if (voice.paused) voice.play().catch(() => {});
};
// The element's own loop would restart a desktop file at the opening of the program.
// This returns to the same place the voice began, and the transcript follows.
voice.addEventListener("ended", restartVoice);
const followVoice = () => {
  if (!Number.isFinite(voice.duration) || voice.duration <= 0) return;
  const atEnd = voice.ended || voice.currentTime >= voice.duration - 0.2;
  if (atEnd) {
    if (!atLoopPoint) restartVoice();
    return;
  }
  atLoopPoint = false;
  if (!voice.paused && Number.isFinite(voice.currentTime)) {
    interviewTime = voice.currentTime + VOICE.offset;
  }
};

const startVoice = async () => {
  if (!voice.paused) return;
  try {
    await voice.play();
    if (audio.state !== "running") {
      await Promise.race([audio.resume(), new Promise((resolve) => setTimeout(resolve, 300))]);
    }
  } catch {
    // Refused without a gesture; the state check below waits for one.
  }
  if (voice.paused || audio.state !== "running") {
    voice.pause();
    waitForGesture();
    return;
  }
  const startedAt = performance.now();
  const rise = (now) => {
    fadeIn = Math.min(1, Math.max(0, now - startedAt) / VOICE_FADE_MS);
    setVolume();
    if (fadeIn < 1) requestAnimationFrame(rise);
  };
  requestAnimationFrame(rise);
};

// Both calls have to happen inside the gesture itself for iOS to let the sound through.
function waitForGesture() {
  const onGesture = () => {
    document.removeEventListener("pointerdown", onGesture);
    document.removeEventListener("keydown", onGesture);
    audio.resume();
    startVoice();
  };
  document.addEventListener("pointerdown", onGesture);
  document.addEventListener("keydown", onGesture);
}
setTimeout(startVoice, VOICE_DELAY_MS);

// The icon opens the slider; a click anywhere else closes it. Once it is open, clicking
// the icon again mutes, or brings back the level from before muting.
const setOpen = (open) => {
  volume.classList.toggle("open", open);
  toggle.setAttribute("aria-expanded", String(open));
};
let unmutedLevel = level;
slider.addEventListener("input", () => {
  level = Number(slider.value);
  if (level > 0) unmutedLevel = level;
  setVolume();
});
slider.addEventListener("change", () => slider.blur());
// The finger drags the bar itself, and the bar keeps the pointer. A rotated range input
// keeps a flat hit target, so on a phone the touch fell through onto the canvas and was
// read as looking around.
const bar = volume.querySelector(".bar");
const dragBar = (event) => {
  const box = bar.getBoundingClientRect();
  const along = box.height > box.width ? (box.bottom - event.clientY) / box.height : (event.clientX - box.left) / box.width;
  level = THREE.MathUtils.clamp(along, 0, 1);
  slider.value = String(level);
  if (level > 0) unmutedLevel = level;
  setVolume();
};
bar.addEventListener("pointerdown", (event) => {
  if (!volume.classList.contains("open") || event.button !== 0) return;
  event.stopPropagation();
  bar.setPointerCapture(event.pointerId);
  dragBar(event);
});
bar.addEventListener("pointermove", (event) => {
  if (bar.hasPointerCapture(event.pointerId)) dragBar(event);
});
toggle.addEventListener("click", () => {
  toggle.blur();
  if (!volume.classList.contains("open")) {
    setOpen(true);
    return;
  }
  level = level > 0 ? 0 : unmutedLevel;
  slider.value = String(level);
  setVolume();
});
document.addEventListener("pointerdown", (event) => {
  if (!volume.contains(event.target)) setOpen(false);
});

const find = document.getElementById("find");
const view = new THREE.Euler(0, 0, 0, "YXZ");
let turn = null;

find.addEventListener("click", () => {
  find.blur();
  view.setFromQuaternion(camera.quaternion);
  const toSign = sign.position.clone().sub(camera.position);
  const yaw = Math.atan2(-toSign.x, -toSign.z);
  const shortest = THREE.MathUtils.euclideanModulo(yaw - view.y + Math.PI, Math.PI * 2) - Math.PI;
  turn = {
    startedAt: performance.now(),
    from: { yaw: view.y, pitch: view.x },
    to: { yaw: view.y + shortest, pitch: Math.atan2(toSign.y, Math.hypot(toSign.x, toSign.z)) },
  };
});

function stepTurn(now) {
  const t = Math.min(1, (now - turn.startedAt) / TURN_MS);
  const eased = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
  const { from, to } = turn;
  view.set(
    THREE.MathUtils.lerp(from.pitch, to.pitch, eased),
    THREE.MathUtils.lerp(from.yaw, to.yaw, eased),
    0,
  );
  camera.quaternion.setFromEuler(view);
  if (t >= 1) turn = null;
}

// Touch: `stick` holds the walking thumb's push, -1 to 1 each way, with y down the screen.
const stick = { id: null, x: 0, y: 0, originX: 0, originY: 0 };
const look = { id: null, x: 0, y: 0 };
const ring = document.getElementById("stick");
const knob = ring.firstElementChild;
const canvas = renderer.domElement;
let tap = null;

canvas.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse") return;
  canvas.setPointerCapture(event.pointerId);
  tap = { id: event.pointerId, x: event.clientX, y: event.clientY, at: performance.now() };
  if (event.clientX < window.innerWidth / 2 && stick.id === null) {
    Object.assign(stick, { id: event.pointerId, x: 0, y: 0, originX: event.clientX, originY: event.clientY });
    ring.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
    knob.style.transform = "";
    ring.hidden = false;
  } else if (look.id === null) {
    Object.assign(look, { id: event.pointerId, x: event.clientX, y: event.clientY });
  }
});

canvas.addEventListener("pointermove", (event) => {
  if (tap?.id === event.pointerId && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > TAP_PX) {
    tap = null;
  }
  if (event.pointerId === stick.id) {
    const dx = event.clientX - stick.originX;
    const dy = event.clientY - stick.originY;
    const push = Math.min(1, Math.hypot(dx, dy) / STICK_RADIUS);
    const angle = Math.atan2(dy, dx);
    stick.x = Math.cos(angle) * push;
    stick.y = Math.sin(angle) * push;
    knob.style.transform = `translate(${stick.x * STICK_RADIUS}px, ${stick.y * STICK_RADIUS}px)`;
    hint.classList.add("gone");
  } else if (event.pointerId === look.id) {
    turn = null;
    view.setFromQuaternion(camera.quaternion);
    view.y -= (event.clientX - look.x) * LOOK_SPEED;
    view.x = THREE.MathUtils.clamp(view.x - (event.clientY - look.y) * LOOK_SPEED, -MAX_PITCH, MAX_PITCH);
    view.z = 0;
    camera.quaternion.setFromEuler(view);
    Object.assign(look, { x: event.clientX, y: event.clientY });
    hint.classList.add("gone");
  }
});

const release = (event) => {
  if (tap?.id === event.pointerId) {
    if (event.type === "pointerup" && performance.now() - tap.at < TAP_MS) readIfOnSign(event);
    tap = null;
  }
  if (event.pointerId === stick.id) {
    Object.assign(stick, { id: null, x: 0, y: 0 });
    ring.hidden = true;
  }
  if (event.pointerId === look.id) look.id = null;
};
canvas.addEventListener("pointerup", release);
canvas.addEventListener("pointercancel", release);

// The letter, laid out as a page to read, closed by a tap anywhere on it.
const reader = document.getElementById("reader");
const page = reader.querySelector("article");
for (const block of BLOCKS) {
  const paragraph = document.createElement("p");
  paragraph.textContent = block.text;
  paragraph.style.fontSize = `${block.scale ?? 1}em`;
  paragraph.style.opacity = block.opacity ?? 1;
  paragraph.style.marginBottom = `${block.gap ?? 0}em`;
  page.append(paragraph);
}
reader.addEventListener("click", () => {
  reader.hidden = true;
});

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function readIfOnSign(event) {
  pointer.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  if (raycaster.intersectObject(sign, true).length === 0) return;
  reader.scrollTop = 0;
  reader.hidden = false;
}

const bob = new THREE.Vector3();
const bobTarget = new THREE.Vector3();
const velocity = new THREE.Vector2();
const direction = new THREE.Vector2();
const clock = new THREE.Clock();

window.addEventListener("resize", () => {
  fitView();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(() => {
  const delta = Math.min(clock.getDelta(), 0.1);
  if (paused.hidden) move(delta);
  if (turn) stepTurn(performance.now());
  const seconds = clock.elapsedTime;
  sign.position.y = signHeight + Math.sin((seconds / FLOAT_PERIOD) * Math.PI * 2) * FLOAT_HEIGHT;
  sky.update(performance.now());
  standing.update(camera.position, performance.now());
  camera.getWorldDirection(facing);
  const yaw = Math.atan2(facing.x, facing.z);
  const gait = shadow.walk(camera.position, yaw, delta);
  followVoice();
  transcript.update(interviewTime);
  signShadow.update((camera.position.z - sign.position.z) / SIGN_SHADOW_TURN);
  transcriptShadow.resize(transcript.size.width, transcript.size.height);

  // The head rides the stride only for the frame, so walking and collisions never see it.
  bobTarget.set(-Math.cos(yaw), 0, Math.sin(yaw)).multiplyScalar(gait.lean * gait.lift * HEAD_SWAY);
  bobTarget.y = gait.lift * HEAD_BOB;
  bob.lerp(bobTarget, 1 - Math.exp(-HEAD_RATE * delta));
  camera.position.add(bob);
  placeEars();
  renderer.render(scene, camera);
  camera.position.sub(bob);
});

function fitView() {
  const aspect = window.innerWidth / window.innerHeight;
  const across = THREE.MathUtils.degToRad(PORTRAIT_FOV);
  const fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(across / 2) / aspect));
  camera.fov = THREE.MathUtils.clamp(fov, FOV, MAX_FOV);
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
}

function move(delta) {
  const forward = pressed("KeyW", "ArrowUp") - pressed("KeyS", "ArrowDown") - stick.y;
  const right = pressed("KeyD", "ArrowRight") - pressed("KeyA", "ArrowLeft") + stick.x;
  direction.set(right, forward);
  if (direction.lengthSq() > 1) direction.normalize();

  velocity.multiplyScalar(Math.max(0, 1 - DAMPING * delta));
  velocity.addScaledVector(direction, SPEED * delta);

  const near = obstacles.filter(
    (o) => Math.hypot(camera.position.x - o.position.x, camera.position.z - o.position.z) < o.halfWidth + NEAR_OBSTACLE,
  );
  const before = near.map((o) => toLocal(o).z);
  controls.moveRight(velocity.x * delta);
  controls.moveForward(velocity.y * delta);
  camera.position.y = EYE_HEIGHT;
  near.forEach((o, i) => keepClear(o, before[i]));
}

// The letter is a wall: its footprint, grown by the clearance, pushes you back out along
// the shallower way, so you slide along the face or around the edge. Which face you are
// on comes from before the step, so a fast step can't carry you through. The standing
// quotations are only text, and you walk through them. `obstacle` is
// `{ position, yaw, halfWidth }`.
function keepClear(obstacle, before) {
  const local = toLocal(obstacle);
  const halfWidth = obstacle.halfWidth + SIGN_CLEARANCE;
  const intoEdge = halfWidth - Math.abs(local.x);
  const intoFace = SIGN_CLEARANCE - Math.abs(local.z);
  const crossed = before * local.z < 0;
  if (intoEdge <= 0 || (intoFace <= 0 && !crossed)) return;

  if (crossed || intoFace < intoEdge) local.z = Math.sign(before || 1) * SIGN_CLEARANCE;
  else local.x = Math.sign(local.x || 1) * halfWidth;

  const cos = Math.cos(obstacle.yaw);
  const sin = Math.sin(obstacle.yaw);
  camera.position.x = obstacle.position.x + local.x * cos + local.z * sin;
  camera.position.z = obstacle.position.z - local.x * sin + local.z * cos;
}

// Where you stand across (`x`) and in front of (`z`) an obstacle's face.
function toLocal({ position, yaw }) {
  const x = camera.position.x - position.x;
  const z = camera.position.z - position.z;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return { x: x * cos - z * sin, z: x * sin + z * cos };
}

function pressed(...codes) {
  return codes.some((code) => keys.has(code)) ? 1 : 0;
}

// One soft blot per leg, each longer front to back than across. The feet sit on the ground
// itself, not on you: over each step the swinging foot goes from behind you to half a step
// ahead while the planted one holds still, so neither ever slides.
function createShadow() {
  const blot = createGroundShadow(LEG_WIDTH * 2, LEG_LENGTH, 64, (x, z) => {
    const across = x / LEG_WIDTH;
    const along = (z - LEG_LENGTH / 2) / (LEG_LENGTH / 2);
    return 1 - THREE.MathUtils.smoothstep(Math.hypot(across, along), 0.25, 1);
  });
  blot.material.opacity = SHADOW_ALPHA;
  blot.material.fog = false;
  blot.material.depthTest = false;
  blot.renderOrder = 3;

  const group = new THREE.Group();
  const feet = [-1, 1].map((side) => {
    const foot = new THREE.Group();
    foot.add(side < 0 ? blot : blot.clone());
    group.add(foot);
    return { side, foot };
  });

  const body = new THREE.Vector3();
  const right = new THREE.Vector3();
  const heading = new THREE.Vector3();
  const target = new THREE.Vector3();
  const from = new THREE.Vector3();
  let swinging = 0;
  let travelled = 0;
  let placed = false;

  const homeOf = ({ side }) => target.copy(body).addScaledVector(right, (side * LEG_SPACING) / 2);
  const startStep = () => {
    travelled = 0;
    from.copy(feet[swinging].foot.position);
  };

  const gait = { lift: 0, lean: 0 };
  const rest = () => {
    gait.lift = 0;
    gait.lean = 0;
    return gait;
  };

  // Returns how far through the step you are, as `lift` (0 with both feet down, 1 mid
  // swing), and the side of the planted foot, as `lean`, so the head can follow the stride.
  const walk = (position, yaw, delta) => {
    const step = Math.hypot(position.x - body.x, position.z - body.z);
    if (step > 0) heading.set(position.x - body.x, 0, position.z - body.z).normalize();
    body.set(position.x, 0, position.z);
    right.set(-Math.cos(yaw), 0, Math.sin(yaw));
    for (const { foot } of feet) foot.rotation.y = yaw;

    // On arrival, or after a jump too long to walk, the feet start out under you.
    if (!placed || step > STEP_LENGTH) {
      for (const leg of feet) leg.foot.position.copy(homeOf(leg));
      placed = true;
      startStep();
      return rest();
    }

    if (step < 1e-4) {
      const settle = 1 - Math.exp(-SETTLE_RATE * delta);
      for (const leg of feet) leg.foot.position.lerp(homeOf(leg), settle);
      startStep();
      return rest();
    }

    travelled += step;
    const t = Math.min(1, travelled / STEP_LENGTH);
    const leg = feet[swinging];
    const eased = THREE.MathUtils.smootherstep(t, 0, 1);
    leg.foot.position.lerpVectors(from, homeOf(leg).addScaledVector(heading, STEP_LENGTH / 2), eased);
    gait.lift = Math.sin(Math.PI * t);
    gait.lean = -leg.side;
    if (t >= 1) {
      swinging = 1 - swinging;
      startStep();
    }
    return gait;
  };
  return { group, walk };
}

// One shadow per side of the sign, darkest just past its foot and fading out away from it;
// `update` shows the one on the side you are on, with `side` above 0 in front.
function createSignShadow(signWidth) {
  const width = signWidth + SIGN_SHADOW_SOFTNESS * 2;
  const length = SIGN_SHADOW_GAP + SIGN_SHADOW_LENGTH;
  const halfSheet = signWidth / 2;
  const alphaAt = (x, z) => {
    const { smoothstep } = THREE.MathUtils;
    const across = 1 - smoothstep(Math.abs(x), halfSheet - SIGN_SHADOW_SOFTNESS, halfSheet + SIGN_SHADOW_SOFTNESS);
    const along = smoothstep(z, 0, SIGN_SHADOW_GAP + SIGN_SHADOW_SOFTNESS) * (1 - z / length) ** 1.5;
    return across * along;
  };

  const group = new THREE.Group();
  const sides = [1, -1].map((side) => {
    const shadow = createGroundShadow(width, length, 256, alphaAt);
    shadow.position.z = length / 2;
    const holder = new THREE.Group();
    holder.rotation.y = side > 0 ? 0 : Math.PI;
    holder.add(shadow);
    group.add(holder);
    return { side, shadow };
  });

  const update = (side) => {
    for (const { side: own, shadow } of sides) {
      const amount = THREE.MathUtils.clamp(side * own, 0, 1);
      shadow.material.opacity = SIGN_SHADOW_ALPHA * amount;
      shadow.visible = amount > 0;
    }
  };
  return { group, update };
}

// The transcript floats, so its shadow sits on the ground directly below the words.
// Dense under the middle of the text, then a long faint wake that runs out past the
// block. The shape follows the text, so a wide passage does not leave a square.
function createFittedShadow() {
  const group = new THREE.Group();
  let blot = null;
  let across = 0;
  let down = 0;
  const SPREAD = 3;

  const resize = (width, height) => {
    if (!(width > 0) || !(height > 0)) return;
    if (Math.abs(width - across) < 0.02 && Math.abs(height - down) < 0.02) return;
    across = width;
    down = height;
    const w = width * SPREAD;
    const h = height * SPREAD;
    const next = createGroundShadow(w, h, 256, (x, z) => {
      const dx = x / (width / 2);
      const dz = (z - h / 2) / (height / 2);
      const r = Math.hypot(dx, dz);
      return Math.exp(-(r * r) / 2.6);
    });
    next.material.opacity = SIGN_SHADOW_ALPHA * 1.15;
    next.material.fog = false;
    next.material.depthTest = false;
    next.renderOrder = 3;
    if (blot) {
      group.remove(blot);
      blot.geometry.dispose();
      blot.material.map.dispose();
      blot.material.dispose();
    }
    blot = next;
    group.add(blot);
  };

  return { group, resize };
}

// A flat shadow lying on the ground, `width` across and `length` along +z, painted from
// `alphaAt(x, z)`: x from the center, z from the -z end, both in meters.
function createGroundShadow(width, length, size, alphaAt) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d");
  const image = g.createImageData(size, size);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const x = ((col + 0.5) / size - 0.5) * width;
      const z = ((row + 0.5) / size) * length;
      const i = (row * size + col) * 4;
      image.data.set([41, 36, 33, Math.round(alphaAt(x, z) * 255)], i);
    }
  }
  g.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, length),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}
// The same text faces both ways, one copy per side of the sheet. Each copy is drawn only
// from the front, so from any angle you see the readable one and never its mirror image.
async function createSign(style) {
  const look = signLook(style);
  const [front, back] = await Promise.all([createTextFace(look), createTextFace(look)]);
  const width = look.textWidth + look.padding * 2;
  const height = front.height + look.padding * 2;
  const offset = look.thickness / 2 + 0.001;

  front.group.position.set(-look.textWidth / 2, front.height / 2, offset);
  back.group.rotation.y = Math.PI;
  back.group.position.set(look.textWidth / 2, back.height / 2, -offset);

  const sign = new THREE.Group();
  sign.add(look.createSheet(width, height), front.group, back.group);
  // A tall sheet rises so that it never touches the ground.
  sign.position.y = Math.max(EYE_HEIGHT + 0.1, height / 2 + SIGN_LIFT);
  sign.userData.width = width;
  return sign;
}

function signLook(style) {
  switch (style) {
    case "paper":
      return {
        font: LETTER_FONT,
        ink: LETTER_INK,
        size: LETTER_SIZE,
        textWidth: PAPER_TEXT_WIDTH,
        padding: PAPER_PADDING,
        thickness: PAPER_THICKNESS,
        createSheet: createPaper,
      };
    case "glass":
      return {
        font: FONT,
        ink: INK,
        size: 1,
        textWidth: TEXT_WIDTH,
        padding: GLASS_PADDING,
        thickness: GLASS_CORE + GLASS_BEVEL * 2,
        createSheet: createGlass,
      };
    default:
      throw new Error(`Unknown sign style: ${style}`);
  }
}

function createPaper(width, height) {
  const loader = new THREE.TextureLoader();
  const repeat = [width / PAPER_GRAIN_METERS, height / PAPER_GRAIN_METERS];
  const load = (file) => {
    const texture = loader.load(new URL(`./textures/paper/${file}`, import.meta.url).href);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(...repeat);
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return texture;
  };
  const paper = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, PAPER_THICKNESS),
    new THREE.MeshStandardMaterial({
      color: PAPER_COLOR,
      normalMap: load("normal.jpg"),
      normalScale: new THREE.Vector2(PAPER_GRAIN_DEPTH, PAPER_GRAIN_DEPTH),
      roughness: 1,
      // The room environment lights the two faces differently, so the sheet opts out of
      // it. Only a map set here obeys the intensity; scene.environment would ignore it.
      envMap: scene.environment,
      envMapIntensity: 0,
    }),
  );

  // Even light keeps both faces the same color. On each side, a soft light from the
  // front adds some shape, and a raking one makes the grain throw tiny shadows.
  const group = new THREE.Group();
  group.add(paper, new THREE.AmbientLight(PAPER_LIGHT, PAPER_AMBIENT));
  for (const z of [1, -1]) {
    const fill = new THREE.DirectionalLight(PAPER_LIGHT, 0.7);
    fill.position.set(-0.6, 0.8, 3 * z);
    const rake = new THREE.DirectionalLight(PAPER_LIGHT, 1.8);
    rake.position.set(-3, 1.5, 0.6 * z);
    fill.target = rake.target = paper;
    group.add(fill, rake);
  }
  return group;
}

function createGlass(width, height) {
  return new THREE.Mesh(
    createGlassGeometry(width, height),
    new THREE.MeshPhysicalMaterial({
      color: "#ffffff",
      transmission: 1,
      roughness: GLASS_FROST,
      ior: 1.6,
        thickness: GLASS_CORE + GLASS_BEVEL * 2,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      dispersion: 1,
      // Liquid glass reads a touch brighter than what is behind it.
      emissive: "#ffffff",
      emissiveIntensity: 0.06,
    }),
  );
}

// A rounded rectangle, extruded with a rounded bevel all around, centered on the origin.
function createGlassGeometry(width, height) {
  const inset = GLASS_BEVEL;
  const w = width / 2 - inset;
  const h = height / 2 - inset;
  const r = GLASS_RADIUS - inset;
  const shape = new THREE.Shape()
    .moveTo(-w + r, -h)
    .lineTo(w - r, -h)
    .quadraticCurveTo(w, -h, w, -h + r)
    .lineTo(w, h - r)
    .quadraticCurveTo(w, h, w - r, h)
    .lineTo(-w + r, h)
    .quadraticCurveTo(-w, h, -w, h - r)
    .lineTo(-w, -h + r)
    .quadraticCurveTo(-w, -h, -w + r, -h);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: GLASS_CORE,
    bevelEnabled: true,
    bevelThickness: GLASS_BEVEL,
    bevelSize: inset,
    bevelSegments: 10,
    curveSegments: 16,
  });
  geometry.translate(0, 0, -GLASS_CORE / 2);
  geometry.computeVertexNormals();
  return geometry;
}

async function createTextFace(look) {
  const group = new THREE.Group();
  const meshes = await Promise.all(
    BLOCKS.map((block) => {
      const text = new Text();
      text.text = block.text;
      text.font = look.font;
      text.fontSize = BODY_SIZE * look.size * (block.scale ?? 1);
      text.lineHeight = 1.5;
      text.maxWidth = look.textWidth;
      text.anchorX = "left";
      text.anchorY = "top";
      text.material = new THREE.MeshBasicMaterial({ side: THREE.FrontSide });
      text.color = look.ink;
      text.fillOpacity = block.opacity ?? 1;
      group.add(text);
      return new Promise((resolve) => text.sync(() => resolve(text)));
    }),
  );

  let y = 0;
  meshes.forEach((text, i) => {
    const [, minY, , maxY] = text.textRenderInfo.blockBounds;
    text.position.y = -y;
    y += maxY - minY + (BLOCKS[i].gap ?? 0) * BODY_SIZE * look.size;
  });

  return { group, height: y };
}
