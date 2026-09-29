// Soundtrack for the ArcLend explainer: pad per scene, whooshes, clicks, typing, coin/earn ticks, chimes, a falling
// tone and a decisive "closed" thunk for the guardian scene. 44.1 kHz stereo WAV.
const fs = require("fs");
const SR = 44100, TOTAL = 58.5;
const N = Math.floor(SR * TOTAL);
const L = new Float32Array(N), R = new Float32Array(N);
const add = (i, l, r) => { if (i >= 0 && i < N) { L[i] += l; R[i] += r === undefined ? l : r; } };
const TAU = Math.PI * 2;
function tone(at, dur, f0, f1, amp, { attack = 0.004, decay = 6, pan = 0, wave = "sine" } = {}) {
  const s = Math.floor(at * SR), n = Math.floor(dur * SR); let ph = 0;
  for (let i = 0; i < n; i++) { const u = i / n, f = f0 + (f1 - f0) * u; ph += (TAU * f) / SR; const env = Math.min(1, i / (attack * SR)) * Math.exp(-decay * u); let v = Math.sin(ph); if (wave === "tri") v = (2 / Math.PI) * Math.asin(v); v *= env * amp; add(s + i, v * (1 - Math.max(0, pan)), v * (1 + Math.min(0, pan))); }
}
function noise(at, dur, amp, { cutoff0 = 400, cutoff1 = 4000, shape = (u) => Math.sin(Math.PI * u), pan = 0 } = {}) {
  const s = Math.floor(at * SR), n = Math.floor(dur * SR); let y = 0;
  for (let i = 0; i < n; i++) { const u = i / n, fc = cutoff0 + (cutoff1 - cutoff0) * u, a = 1 - Math.exp((-TAU * fc) / SR); y += a * ((Math.random() * 2 - 1) - y); const v = y * shape(u) * amp; add(s + i, v * (1 - Math.max(0, pan)), v * (1 + Math.min(0, pan))); }
}
const click = (at, pan = 0) => { tone(at, 0.07, 1500, 900, 0.22, { decay: 9, pan }); noise(at, 0.02, 0.12, { cutoff0: 6000, cutoff1: 3000, shape: (u) => 1 - u, pan }); };
const tick = (at) => tone(at, 0.035, 2600, 2200, 0.07, { decay: 7, pan: 0.2 });
const soft = (at) => tone(at, 0.18, 880, 880, 0.05, { decay: 5, pan: -0.3 });
const chime = (at, base = 660) => { tone(at, 0.9, base, base, 0.16, { decay: 4.5 }); tone(at + 0.09, 1.1, base * 1.5, base * 1.5, 0.13, { decay: 4 }); tone(at + 0.18, 1.3, base * 2, base * 2, 0.07, { decay: 4 }); };
const whoosh = (at) => { noise(at, 0.7, 0.16, { cutoff0: 300, cutoff1: 5200, pan: -0.4 }); noise(at + 0.1, 0.6, 0.1, { cutoff0: 5000, cutoff1: 500, pan: 0.4 }); };
const swap = (at) => noise(at, 0.35, 0.07, { cutoff0: 800, cutoff1: 4000, pan: 0.3 });
const typing = (from, to, step = 0.08) => { for (let t = from; t < to; t += step) tone(t, 0.03, 2400 + Math.random() * 400, 2200, 0.045, { decay: 8, pan: 0.15 }); };

const chords = [
  [0, 4.5, [110, 164.81, 220, 277.18, 329.63]],
  [4.5, 15.5, [98, 146.83, 196, 246.94, 293.66]],
  [15.5, 30, [110, 164.81, 220, 261.63, 329.63]],
  [30, 40.5, [123.47, 185, 246.94, 293.66, 369.99]],
  [40.5, 53, [87.31, 130.81, 174.61, 207.65, 261.63]],
  [53, 58.5, [110, 164.81, 220, 277.18, 440]],
];
for (const [a, b, fs_] of chords) {
  const s = Math.floor(a * SR), n = Math.floor((b - a) * SR), xf = 0.9 * SR;
  fs_.forEach((f, k) => { let ph = Math.random() * TAU; for (let i = 0; i < n; i++) { ph += (TAU * f) / SR; const env = Math.min(1, i / xf) * Math.min(1, (n - i) / xf); const lfo = 0.75 + 0.25 * Math.sin((TAU * (0.11 + k * 0.03) * i) / SR + k); const v = ((2 / Math.PI) * Math.asin(Math.sin(ph))) * 0.022 * env * lfo * (k === 0 ? 1.6 : 1); add(s + i, v * (k % 2 ? 0.7 : 1), v * (k % 2 ? 1 : 0.7)); } });
}

// title
chime(0.35, 440); noise(0, 1.2, 0.08, { cutoff0: 200, cutoff1: 3000 }); [1.5, 1.95, 2.4].forEach(soft);
[4.3, 15.3, 29.8, 40.3, 52.8].forEach(whoosh);
[5.7, 16.7, 31.2, 41.7].forEach((s) => [0, 0.9, 1.8].forEach((d) => soft(s + d)));
// 1 lend (4.5): rows, pick, type, supply, chime, earn ticks
[4.9, 5.15, 5.4].forEach(tick); click(6.9); typing(7.9, 8.8); click(10.1); chime(11.5, 587.33);
for (let t = 11.9; t < 15; t += 0.5) tone(t, 0.05, 1900, 1900, 0.018, { decay: 8, pan: 0.5 });
// 2 borrow (15.5): type collateral, approve, deposit, chime, switch, type 40, borrow, chime
typing(17.1, 18.2); click(19.2); click(20.8); chime(22.1, 523.25); swap(23.7); typing(24.1, 24.7); click(25.9); chime(27.3, 659.25);
// 3 repay (30): type, repay, chime, switch, type, withdraw, chime
typing(31.5, 32.4); click(34.0); chime(35.2, 587.33); swap(37.2); typing(37.6, 38.3); click(39.1); chime(40.0, 659.25);
// 4 safety (40.5): calm ticks then a falling tone as the price dumps, thunk + chime when the guardian closes it
for (let t = 41.0; t < 43.5; t += 0.5) tick(t);
tone(43.6, 2.2, 520, 140, 0.09, { decay: 0.9, attack: 0.15, wave: "tri" }); noise(43.6, 2.2, 0.05, { cutoff0: 2500, cutoff1: 300 });
tone(45.7, 0.5, 95, 48, 0.55, { decay: 5, attack: 0.002 }); noise(45.7, 0.09, 0.3, { cutoff0: 2500, cutoff1: 300, shape: (u) => 1 - u });
chime(46.2, 523.25); soft(46.9);
// outro
chime(53.4, 440); chime(54.0, 554.37);

const fadeIn = 0.4 * SR, fadeOut = 1.6 * SR;
const buf = Buffer.alloc(44 + N * 4);
buf.write("RIFF", 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write("WAVEfmt ", 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(N * 4, 40);
let peak = 0;
for (let i = 0; i < N; i++) { const g = Math.min(1, i / fadeIn) * Math.min(1, (N - i) / fadeOut) * 1.5; const l = Math.tanh(L[i] * g), r = Math.tanh(R[i] * g); peak = Math.max(peak, Math.abs(l), Math.abs(r)); buf.writeInt16LE(Math.round(l * 32000), 44 + i * 4); buf.writeInt16LE(Math.round(r * 32000), 46 + i * 4); }
fs.writeFileSync(process.argv[2], buf);
console.log("wav written", process.argv[2], "seconds", TOTAL, "peak", peak.toFixed(2));
