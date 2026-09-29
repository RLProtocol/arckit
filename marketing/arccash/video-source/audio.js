// Soundtrack for the ArcCash explainer: slow pad (one chord per scene), scene whooshes, UI clicks, typing ticks,
// coin pops, a low "linked" thud, a rising download sweep, a proving hum and success chimes. 44.1 kHz stereo WAV.
const fs = require("fs");
const SR = 44100, TOTAL = 57.0;
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
const swap = (at) => noise(at, 0.35, 0.07, { cutoff0: 800, cutoff1: 4000, pan: 0.3 });
const pop = (at, k) => { const f = 520 + (k % 7) * 40; tone(at, 0.16, f, f * 1.6, 0.11, { decay: 8, pan: ((k % 8) - 3.5) / 5 }); noise(at, 0.03, 0.05, { cutoff0: 3000, cutoff1: 1200, shape: (u) => 1 - u }); };

// ---- pad: slow chords, one per scene (darker for "the problem", brighter as privacy grows) ----
const chords = [
  [0, 4.5, [110, 164.81, 220, 277.18, 329.63]],
  [4.5, 12, [87.31, 130.81, 174.61, 207.65, 261.63]],
  [12, 25.5, [98, 146.83, 196, 246.94, 293.66]],
  [25.5, 34.5, [110, 164.81, 220, 261.63, 329.63]],
  [34.5, 49.5, [123.47, 185, 246.94, 293.66, 369.99]],
  [49.5, 57.0, [110, 164.81, 220, 277.18, 440]],
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
[4.3, 11.8, 25.3, 34.3, 49.3].forEach(whoosh);
const bulletsAt = (start) => [0, 0.9, 1.8].forEach((d) => soft(start + d));
[5.9, 13.2, 26.7, 35.7].forEach(bulletsAt);

// scene 1: the problem (4.5). rows slide in, red thread, LINKED thud
[5.1, 5.65, 6.2, 6.75].forEach((t) => tick(t));
tone(7.7, 2.0, 110, 165, 0.09, { decay: 0.6, attack: 0.3, wave: "tri" }); noise(7.7, 2.0, 0.05, { cutoff0: 300, cutoff1: 1400 });
tone(9.9, 0.5, 95, 48, 0.55, { decay: 5, attack: 0.002 }); noise(9.9, 0.09, 0.3, { cutoff0: 2500, cutoff1: 300, shape: (u) => 1 - u });

// scene 2: deposit (12.0). pick pool, continue, note types, copy, tick, continue, deposit, chime
click(13.9); click(15.7); swap(16.2);
for (let t = 16.5; t < 18.1; t += 0.08) tone(t, 0.03, 2400 + Math.random() * 400, 2200, 0.045, { decay: 8, pan: 0.15 });
click(18.7, 0.3); click(19.6, -0.2); click(21.1); swap(21.6); click(22.8); chime(24.3, 587.33);

// scene 3: wait (25.5). coins pop in one by one; the "yours" glow fades
pop(25.9, 0);
for (let k = 1; k < 24; k++) pop(27.1 + (k - 1) * 0.23, k);
tone(31.9, 1.2, 1320, 660, 0.05, { decay: 2.5, attack: 0.1 }); // glow fading away
soft(33.0);

// scene 4: withdraw (34.5). paste, checks, continue, recipient typing, continue, generate, stages, withdraw, chime
noise(35.2, 0.12, 0.14, { cutoff0: 1500, cutoff1: 5000, shape: (u) => 1 - u }); // paste
tick(36.6); tick(36.75); click(37.5); swap(37.9);
for (let t = 38.2; t < 39.4; t += 0.075) tone(t, 0.03, 2400 + Math.random() * 400, 2200, 0.045, { decay: 8, pan: 0.15 });
click(40.0); swap(40.4); click(40.9);
tick(41.3); tick(42.1);
tone(42.6, 1.6, 260, 760, 0.07, { decay: 0.8, attack: 0.25, wave: "tri" }); noise(42.6, 1.6, 0.06, { cutoff0: 500, cutoff1: 3800 }); // download sweep
tone(44.2, 1.0, 196, 196, 0.06, { decay: 0.5, attack: 0.05, wave: "tri" }); tone(44.2, 1.0, 294, 294, 0.04, { decay: 0.5, attack: 0.05, wave: "tri" }); // proving hum
tick(45.2); chime(45.7, 523.25);
click(46.8); chime(47.9, 659.25);

// outro
chime(49.9, 440); chime(50.5, 554.37);

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
