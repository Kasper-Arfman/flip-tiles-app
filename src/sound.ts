// The game's sounds, made on the spot with the Web Audio API (no sound files to download): short
// tones and clicks, shaped by a volume envelope. The player can turn them off (the speaker button
// on the home screen); that choice is saved on the device, apart from the progress (Reset
// progress keeps it).
//
//   flip, force     a tile pressed: a light tock, a deeper thunk
//   solved          four soft bells up a chord, as Solved! appears
//   star(i)         a bright ding as each star lands (higher for each)
//   fanfare         three stars, or a stage complete
//   coin            a coin landing in the pouch
//   hint, tick      ranked: a hint appears; the last seconds on the clock
//   lose            ranked: time's up or given up
//   tap             a button pressed
import { Preferences } from "@capacitor/preferences";

const KEY = "sound-v1";
let on = true;
let context: AudioContext | null = null;

export async function loadSound() {
  try {
    const { value } = await Preferences.get({ key: KEY });
    on = value !== "false";
  } catch {
    on = true;
  }
}

export const soundOn = () => on;

export function setSoundOn(value: boolean) {
  on = value;
  void Preferences.set({ key: KEY, value: String(value) }).catch(() => {});
  if (on) sound.tap();
}

// The audio context, made at the first sound (always after a tap: browsers only allow sound then)
function audio(): AudioContext | null {
  if (!on || typeof AudioContext === "undefined") return null;
  if (!context) {
    // (iPhone: the sounds follow the silent switch, and don't stop the player's own music)
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = "ambient";
    context = new AudioContext();
  }
  if (context.state === "suspended") void context.resume();
  return context;
}

type Tone = {
  freq: number; // Hz at the start
  to?: number; // Hz at the end (a slide), if it changes
  type?: OscillatorType;
  at?: number; // seconds from now
  length: number; // seconds
  volume: number; // 0 to 1
  hold?: boolean; // stays at full volume for most of its length, then fades (a held note)
};

// One tone: a quick rise (no click), then it fades away
function tone({ freq, to, type = "sine", at = 0, length, volume, hold }: Tone) {
  const ctx = audio();
  if (!ctx) return;
  const start = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, start + length);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.006);
  if (hold) gain.gain.setValueAtTime(volume, start + length * 0.55);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  // (square waves, the retro game sound, through a soft filter so they don't buzz)
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = type === "square" ? 3200 : 12000;
  osc.connect(filter).connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + length + 0.02);
}

// A short burst of noise through a filter: the tap of a tile, the rustle of a thunk
function noise({ at = 0, length, volume, freq }: { at?: number; length: number; volume: number; freq: number }) {
  const ctx = audio();
  if (!ctx) return;
  const start = ctx.currentTime + at;
  const samples = Math.ceil(ctx.sampleRate * length);
  const buffer = ctx.createBuffer(1, samples, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < samples; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / samples) ** 2;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(start);
}

// A soft bell, like a marimba or a glockenspiel (the sound of today's casual games): a pure tone
// with two quieter overtones that die away faster, so it starts bright and ends round
function bell(freq: number, at: number, length: number, volume: number) {
  tone({ freq, at, length, volume });
  tone({ freq: freq * 2, at, length: length * 0.5, volume: volume * 0.35 });
  tone({ freq: freq * 3, at, length: length * 0.25, volume: volume * 0.12 });
}

// (a little variety, so many flips in a row don't sound like a machine)
const vary = (hz: number) => hz * (0.96 + Math.random() * 0.08);

// Notes: C5 E5 G5 C6 E6 G6
const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5, E6 = 1318.5, G6 = 1568;

export const sound = {
  flip() {
    tone({ freq: vary(620), to: 340, type: "triangle", length: 0.07, volume: 0.22 });
    noise({ length: 0.03, volume: 0.15, freq: 2500 });
  },
  force() {
    tone({ freq: vary(220), to: 90, type: "triangle", length: 0.16, volume: 0.3 });
    noise({ length: 0.06, volume: 0.2, freq: 900 });
  },
  // A "level clear" jingle: four soft bells up a major chord, each ringing on under the next,
  // the last one longest, so it ends as a chord
  solved(at = 0) {
    [C5, E5, G5].forEach((freq, i) => bell(freq, at + i * 0.09, 0.9, 0.1));
    bell(C6, at + 0.27, 1.4, 0.11);
  },
  star(i: number, at = 0) {
    const freq = [E6, G6, C6 * 2][Math.min(i, 2)];
    tone({ freq, at, length: 0.5, volume: 0.12 });
    tone({ freq: freq * 1.5, at: at + 0.03, length: 0.3, volume: 0.05 });
  },
  fanfare(at = 0) {
    [G5, C6, E6].forEach((freq, i) => tone({ freq, type: "triangle", at: at + i * 0.1, length: 0.3, volume: 0.14 }));
    [C6, E6, G6].forEach((freq) => tone({ freq, type: "triangle", at: at + 0.32, length: 0.8, volume: 0.1 }));
  },
  coin() {
    tone({ freq: vary(1975), length: 0.08, volume: 0.08, type: "square" });
    tone({ freq: vary(2637), at: 0.06, length: 0.2, volume: 0.07, type: "square" });
  },
  // A warm-up of the final challenge's run solved (step: 0 for the first): a short bleep, one note
  // higher up a major scale each time, from C5 to E6 for the tenth
  climb(step: number) {
    const scale = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16];
    const freq = C5 * 2 ** (scale[Math.min(step, scale.length - 1)] / 12);
    tone({ freq, length: 0.07, volume: 0.08, type: "square" });
    tone({ freq: freq * 1.5, at: 0.05, length: 0.16, volume: 0.06, type: "square" });
  },
  hint() {
    tone({ freq: G5, length: 0.15, volume: 0.12 });
    tone({ freq: C6, at: 0.12, length: 0.25, volume: 0.12 });
  },
  tick() {
    noise({ length: 0.02, volume: 0.25, freq: 3500 });
  },
  lose() {
    [G5 / 2, E5 / 2, C5 / 2].forEach((freq, i) => tone({ freq, to: freq * 0.97, type: "triangle", at: i * 0.18, length: 0.35, volume: 0.18 }));
  },
  tap() {
    tone({ freq: 900, to: 700, length: 0.04, volume: 0.06 });
  },
};

// Every button (and button-like link) gives a soft tap, except the tiles (they have their own)
// and buttons that make a sound of their own
export function tapSounds() {
  document.addEventListener("click", (e) => {
    const target = (e.target as Element).closest("button, a[href], [role=tab], [role=radio], summary");
    if (!target || target.closest(".flip-tiles .board, .sound-button")) return;
    if ((target as HTMLButtonElement).disabled) return;
    sound.tap();
  }, true);
}
