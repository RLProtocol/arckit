// Synthesises the soundtrack for the ArcFlow v2 explainer: a soft pad, scene whooshes, UI clicks,
// typing ticks, success chimes, a lock "thunk" and a rising tone for the fee hook. Output: 44.1 kHz stereo WAV.
const fs = require("fs");
const SR = 44100, TOTAL = 51.0;
const N = Math.floor(SR * TOTAL);
const L = new Float32Array(N), R = new Float32Array(N);
const add = (i, l, r) => { if (i >= 0 && i < N) { L[i] += l; R[i] += r === undefined ? l : r; } };
const TAU = Math.PI * 2;

function tone(at, dur, f0, f1, amp, { attack = 0.004, decay = 6, pan = 0, wave = "sine" } = {}) {
  const s = Math.floor(at * SR), n = Math.floor(dur * SR); let ph = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n, f = f0 + (f1 - f0) * u; ph += (TAU * f) / SR;
    const env = Math.min(1, i / (attack * SR)) * Math.exp(-decay * u);
    let v = Math.sin(ph); if (wave === "tri") v = (2 / Math.PI) * Math.asin(v);
    v *= env * amp; add(s + i, v * (1 - Math.max(0, pan)), v * (1 + Math.min(0, pan)));
  }
}
function noise(at, dur, amp, { cutoff0 = 400, cutoff1 = 4000, shape = (u) => Math.sin(Math.PI * u), pan = 0 } = {}) {
  const s = Math.floor(at * SR), n = Math.floor(dur * SR); let y = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n, fc = cutoff0 + (cutoff1 - cutoff0) * u, a = 1 - Math.exp((-TAU * fc) / SR);
    y += a * ((Math.random() * 2 - 1) - y);
    const v = y * shape(u) * amp; add(s + i, v * (1 - Math.max(0, pan)), v * (1 + Math.min(0, pan)));
  }
}
const click = (at, pan = 0) => { tone(at, 0.07, 1500, 900, 0.22, { decay: 9, pan }); noise(at, 0.02, 0.12, { cutoff0: 6000, cutoff1: 3000, shape: (u) => 1 - u, pan }); };
const tick = (at) => tone(at, 0.035, 2600, 2200, 0.07, { decay: 7, pan: 0.2 });
const soft = (at) => tone(at, 0.18, 880, 880, 0.05, { decay: 5, pan: -0.3 });
const chime = (at, base = 660) => { tone(at, 0.9, base, base, 0.16, { decay: 4.5 }); tone(at + 0.09, 1.1, base * 1.5, base * 1.5, 0.13, { decay: 4 }); tone(at + 0.18, 1.3, base * 2, base * 2, 0.07, { decay: 4 }); };
const whoosh = (at) => { noise(at, 0.7, 0.16, { cutoff0: 300, cutoff1: 5200, pan: -0.4 }); noise(at + 0.1, 0.6, 0.1, { cutoff0: 5000, cutoff1: 500, pan: 0.4 }); };

// ---- pad: slow chords, one per scene ----
const chords = [
  [0, 4.5, [110, 164.81, 220, 277.18, 329.63]],
  [4.5, 16.5, [98, 146.83, 196, 246.94, 293.66]],
  [16.5, 28.5, [87.31, 130.81, 174.61, 220, 261.63]],
  [28.5, 38.5, [110, 164.81, 220, 261.63, 329.63]],
  [38.5, 46, [123.47, 185, 246.94, 293.66, 369.99]],
  [46, 51, [110, 164.81, 220, 277.18, 440]],
];
for (const [a, b, fs_] of chords) {
  const s = Math.floor(a * SR), n = Math.floor((b - a) * SR), xf = 0.9 * SR;
  fs_.forEach((f, k) => {
    let ph = Math.random() * TAU;
    for (let i = 0; i < n; i++) {
      ph += (TAU * f) / SR;
      const env = Math.min(1, i / xf) * Math.min(1, (n - i) / xf);
      const lfo = 0.75 + 0.25 * Math.sin((TAU * (0.11 + k * 0.03) * i) / SR + k);
      const v = ((2 / Math.PI) * Math.asin(Math.sin(ph))) * 0.022 * env * lfo * (k === 0 ? 1.6 : 1);
      add(s + i, v * (k % 2 ? 0.7 : 1), v * (k % 2 ? 1 : 0.7));
    }
  });
}

// ---- events (seconds) ----
chime(0.35, 440); noise(0, 1.2, 0.08, { cutoff0: 200, cutoff1: 3000 });
[1.5, 1.95, 2.4].forEach((t) => soft(t));
[4.3, 16.3, 28.3, 38.3, 45.8].forEach(whoosh);
const bulletsAt = (start) => [0, 0.9, 1.8].forEach((d) => soft(start + 1.2 + d));
[4.5, 16.5, 28.5, 38.5].forEach(bulletsAt);

// scene 1: stakes
click(6.8); [7.8, 8.27, 8.74].forEach(tick); click(10.2); chime(11.4, 587.33);
for (let t = 11.9; t < 16; t += 0.5) tone(t, 0.05, 1900, 1900, 0.018, { decay: 8, pan: 0.5 }); // claimable ticking
// scene 2: pools
click(18.9); click(21.5, 0.3); click(23.7, -0.2);
for (const t of [18.9, 21.5, 23.7]) noise(t + 0.02, 0.45, 0.05, { cutoff0: 900, cutoff1: 2600 }); // bars morphing
[24.5, 24.76, 25.02, 25.28, 25.54].forEach(tick); click(26.5); chime(27.4, 659.25);
// scene 3: lock
for (let i = 0; i < 16; i++) tick(30.7 + i * 0.1); click(33.0);
tone(34.3, 0.5, 95, 48, 0.55, { decay: 5, attack: 0.002 }); noise(34.3, 0.09, 0.3, { cutoff0: 2500, cutoff1: 300, shape: (u) => 1 - u }); // thunk
chime(34.65, 523.25); soft(35.2);
// scene 4: fee hook
tone(40.9, 1.9, 260, 760, 0.07, { decay: 0.8, attack: 0.25, wave: "tri" }); noise(40.9, 1.9, 0.06, { cutoff0: 500, cutoff1: 3800 });
tone(44.2, 1.4, 700, 300, 0.05, { decay: 1.2, attack: 0.2, wave: "tri" }); soft(45.2);
// outro
chime(46.9, 440); chime(47.5, 554.37);

// ---- master: fade, soft clip, write WAV ----
const fadeIn = 0.4 * SR, fadeOut = 1.6 * SR;
const buf = Buffer.alloc(44 + N * 4);
buf.write("RIFF", 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write("WAVEfmt ", 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(N * 4, 40);
let peak = 0;
for (let i = 0; i < N; i++) {
  const g = Math.min(1, i / fadeIn) * Math.min(1, (N - i) / fadeOut) * 1.5;
  const l = Math.tanh(L[i] * g), r = Math.tanh(R[i] * g);
  peak = Math.max(peak, Math.abs(l), Math.abs(r));
  buf.writeInt16LE(Math.round(l * 32000), 44 + i * 4); buf.writeInt16LE(Math.round(r * 32000), 46 + i * 4);
}
fs.writeFileSync(process.argv[2], buf);
console.log("wav written", process.argv[2], "seconds", TOTAL, "peak", peak.toFixed(2));
