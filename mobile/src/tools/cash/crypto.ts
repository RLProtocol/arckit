/**
 * Browser port of the ArcCash hashing (arccash/lib/core.mjs), with no circomlibjs: BigInt field arithmetic only.
 * Every value here must match the circuit and the on-chain hasher bit for bit; test/arccash-crypto.test.mjs
 * checks this port against circomlibjs.
 *
 *  - commitment    = Pedersen(nullifier ‖ secret)          (BabyJubjub, x-coordinate)
 *  - nullifierHash = Pedersen(nullifier)
 *  - tree node     = MiMCSponge(left, right)                 (220 rounds, key 0, one output)
 */
import { keccak256, stringToBytes, hexToBytes } from "viem";

export const LEVELS = 20;
/** BN254 scalar field: the field the circuit, BabyJubjub and MiMC all live in. */
export const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
/** keccak256("arccash") mod FIELD; the empty leaf. */
export const ZERO_VALUE = 9797517519481385227547262016731974551529900186648242288733394065825204372759n;

// ------------------------------------------------------------------ field

const mod = (a: bigint, m = FIELD) => ((a % m) + m) % m;
const add = (a: bigint, b: bigint) => mod(a + b);
const sub = (a: bigint, b: bigint) => mod(a - b);
const mul = (a: bigint, b: bigint) => mod(a * b);
function inv(a: bigint): bigint {
  // extended Euclid
  let [t, newT, r, newR] = [0n, 1n, FIELD, mod(a)];
  while (newR !== 0n) {
    const q = r / newR;
    [t, newT] = [newT, t - q * newT];
    [r, newR] = [newR, r - q * newR];
  }
  if (r !== 1n) throw new Error("not invertible");
  return mod(t);
}
const div = (a: bigint, b: bigint) => mul(a, inv(b));

// ------------------------------------------------------------------ MiMC sponge (circomlibjs mimcsponge.js)

const NROUNDS = 220;
const MIMC_CONSTANTS: bigint[] = (() => {
  const cts = new Array<bigint>(NROUNDS);
  let c: `0x${string}` = keccak256(stringToBytes("mimcsponge"));
  for (let i = 1; i < NROUNDS; i++) {
    c = keccak256(c);
    cts[i] = mod(BigInt(c));
  }
  cts[0] = 0n;
  cts[NROUNDS - 1] = 0n;
  return cts;
})();

function mimcSponge(xLin: bigint, xRin: bigint, k: bigint): { xL: bigint; xR: bigint } {
  let xL = mod(xLin);
  let xR = mod(xRin);
  for (let i = 0; i < NROUNDS; i++) {
    const t = i === 0 ? add(xL, k) : add(add(xL, k), MIMC_CONSTANTS[i]);
    const t2 = mul(t, t);
    const t5 = mul(mul(t2, t2), t);
    const xRtmp = xR;
    if (i < NROUNDS - 1) {
      xR = xL;
      xL = add(xRtmp, t5);
    } else {
      xR = add(xRtmp, t5);
    }
  }
  return { xL, xR };
}

/** MiMC multiHash([left, right], key 0, 1 output): the Merkle tree node hash, identical to the on-chain hasher. */
export function mimcHash(left: bigint, right: bigint): bigint {
  let R = 0n;
  let C = 0n;
  for (const x of [left, right]) {
    R = add(R, x);
    const S = mimcSponge(R, C, 0n);
    R = S.xL;
    C = S.xR;
  }
  return R;
}

// ------------------------------------------------------------------ BabyJubjub + Pedersen (circomlibjs pedersen_hash.js)

type Point = [bigint, bigint];
const A = 168700n;
const D = 168696n;
const SUB_ORDER = 21888242871839275222246405745257275088614511777268538073601725287587578984328n >> 3n;

function addPoint(a: Point, b: Point): Point {
  const beta = mul(a[0], b[1]);
  const gamma = mul(a[1], b[0]);
  const delta = mul(sub(a[1], mul(A, a[0])), add(b[0], b[1]));
  const dtau = mul(D, mul(beta, gamma));
  return [div(add(beta, gamma), add(1n, dtau)), div(add(delta, sub(mul(A, beta), gamma)), sub(1n, dtau))];
}
function mulPoint(base: Point, e: bigint): Point {
  let res: Point = [0n, 1n];
  let exp = base;
  let rem = e;
  while (rem !== 0n) {
    if (rem & 1n) res = addPoint(res, exp);
    exp = addPoint(exp, exp);
    rem >>= 1n;
  }
  return res;
}

/**
 * Pedersen generators for segments 0..2 (a 62-byte commitment preimage needs 3), precomputed from
 * circomlibjs getBasePoint("blake", i) so the browser needs no BLAKE-256 implementation.
 */
const BASES: Point[] = [
  [10457101036533406547632367118273992217979173478358440826365724437999023779287n, 19824078218392094440610104313265183977899662750282163392862422243483260492317n],
  [2671756056509184035029146175565761955751135805354291559563293617232983272177n, 2663205510731142763556352975002641716101654201788071096152948830924149045094n],
  [5802099305472655231388284418920769829666717045250560929368476121199858275951n, 5980429700218124965372158798884772646841287887664001482443826541541529227896n],
];
const WINDOW = 4;
const WINDOWS_PER_SEGMENT = 50;

/** Pedersen hash of bytes, returning the x-coordinate as a field element (Tornado's convention). */
export function pedersenHash(msg: Uint8Array): bigint {
  const bits: number[] = [];
  for (const byte of msg) for (let b = 0; b < 8; b++) bits.push((byte >> b) & 1);
  const bitsPerSegment = WINDOW * WINDOWS_PER_SEGMENT;
  const nSegments = Math.floor((bits.length - 1) / bitsPerSegment) + 1;
  if (nSegments > BASES.length) throw new Error("message too long for the precomputed generators");
  let acc: Point = [0n, 1n];
  for (let s = 0; s < nSegments; s++) {
    const nWindows = s === nSegments - 1 ? Math.floor((bits.length - (nSegments - 1) * bitsPerSegment - 1) / WINDOW) + 1 : WINDOWS_PER_SEGMENT;
    let escalar = 0n;
    let exp = 1n;
    for (let w = 0; w < nWindows; w++) {
      let o = s * bitsPerSegment + w * WINDOW;
      let a = 1n;
      for (let b = 0; b < WINDOW - 1 && o < bits.length; b++) {
        if (bits[o]) a += 1n << BigInt(b);
        o++;
      }
      if (o < bits.length) {
        if (bits[o]) a = -a;
        o++;
      }
      escalar += a * exp;
      exp <<= BigInt(WINDOW + 1);
    }
    if (escalar < 0n) escalar += SUB_ORDER;
    acc = addPoint(acc, mulPoint(BASES[s], escalar));
  }
  return acc[0];
}

// ------------------------------------------------------------------ notes

export type Deposit = { nullifier: bigint; secret: bigint; commitment: bigint; nullifierHash: bigint };

/** 31 bytes as a little-endian buffer, as the circuit's Num2Bits(248) expects. */
function toBuf31(n: bigint): Uint8Array {
  return hexToBytes(`0x${n.toString(16).padStart(62, "0")}`).reverse();
}
function randomField31(): bigint {
  const b = new Uint8Array(31);
  crypto.getRandomValues(b);
  return BigInt("0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(""));
}

export function createDeposit(nullifier = randomField31(), secret = randomField31()): Deposit {
  const preimage = new Uint8Array(62);
  preimage.set(toBuf31(nullifier), 0);
  preimage.set(toBuf31(secret), 31);
  return { nullifier, secret, commitment: pedersenHash(preimage), nullifierHash: pedersenHash(toBuf31(nullifier)) };
}

/** `arccash-<denomination wei>-<chainId>-0x<31-byte nullifier><31-byte secret>`; same format as the CLI. */
export const encodeNote = (d: Deposit, chainId: number, denomination: bigint) => `arccash-${denomination}-${chainId}-0x${d.nullifier.toString(16).padStart(62, "0")}${d.secret.toString(16).padStart(62, "0")}`;

export type ParsedNote = { denomination: bigint; chainId: number; nullifier: bigint; secret: bigint };
export function parseNote(note: string): ParsedNote | null {
  const m = /^arccash-(\d+)-(\d+)-0x([0-9a-f]{124})$/i.exec(note.trim());
  if (!m) return null;
  return { denomination: BigInt(m[1]), chainId: Number(m[2]), nullifier: BigInt("0x" + m[3].slice(0, 62)), secret: BigInt("0x" + m[3].slice(62)) };
}

// ------------------------------------------------------------------ Merkle tree

export type MerklePath = { root: bigint; pathElements: bigint[]; pathIndices: number[] };

/** Rebuild the tree from the on-chain leaves (insertion order) and return root + path for `leafIndex`. */
export function merklePath(leaves: bigint[], leafIndex: number): MerklePath {
  const zeros: bigint[] = [ZERO_VALUE];
  for (let i = 1; i <= LEVELS; i++) zeros.push(mimcHash(zeros[i - 1], zeros[i - 1]));
  const pathElements: bigint[] = [];
  const pathIndices: number[] = [];
  let layer = leaves.slice();
  let idx = leafIndex;
  for (let level = 0; level < LEVELS; level++) {
    const sibling = idx ^ 1;
    pathElements.push(sibling < layer.length ? layer[sibling] : zeros[level]);
    pathIndices.push(idx & 1);
    const next: bigint[] = [];
    for (let i = 0; i < layer.length; i += 2) next.push(mimcHash(layer[i], i + 1 < layer.length ? layer[i + 1] : zeros[level]));
    layer = next;
    idx >>= 1;
  }
  return { root: layer.length ? layer[0] : zeros[LEVELS], pathElements, pathIndices };
}

export const toBytes32 = (n: bigint): `0x${string}` => `0x${n.toString(16).padStart(64, "0")}`;
