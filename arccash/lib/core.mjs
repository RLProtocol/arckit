// Shared logic for the CLI and the tests: notes, commitments, Merkle proofs and Groth16 proofs. Every hash
// here matches the circuit and the on-chain hasher exactly (Pedersen for commitments, MiMC sponge for the tree).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPedersenHash, buildBabyjub, buildMimcSponge } from "circomlibjs";
import { MerkleTree } from "fixed-merkle-tree";
import * as snarkjs from "snarkjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const LEVELS = 20;
export const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

let pedersen, babyjub, mimc;
async function init() {
  if (!pedersen) [pedersen, babyjub, mimc] = await Promise.all([buildPedersenHash(), buildBabyjub(), buildMimcSponge()]);
}

const toBuf31 = (n) => Buffer.from(n.toString(16).padStart(62, "0"), "hex").reverse(); // 31 bytes, little-endian
export const rbigint = (bytes = 31) => BigInt("0x" + crypto.randomBytes(bytes).toString("hex"));

/** Pedersen hash of arbitrary bytes, returning the x-coordinate as a field element (Tornado's convention). */
export async function pedersenHash(data) {
  await init();
  const point = babyjub.unpackPoint(pedersen.hash(data));
  return BigInt(babyjub.F.toString(point[0]));
}

export async function mimcHash(left, right) {
  await init();
  return BigInt(mimc.F.toString(mimc.multiHash([BigInt(left), BigInt(right)], 0n, 1)));
}

/** A note is (nullifier, secret): 31 random bytes each. commitment = Pedersen(nullifier || secret). */
export async function createDeposit(nullifier = rbigint(), secret = rbigint()) {
  const preimage = Buffer.concat([toBuf31(nullifier), toBuf31(secret)]);
  return { nullifier, secret, commitment: await pedersenHash(preimage), nullifierHash: await pedersenHash(toBuf31(nullifier)) };
}

export const encodeNote = (d, { chainId, denomination }) => `arccash-${denomination}-${chainId}-0x${d.nullifier.toString(16).padStart(62, "0")}${d.secret.toString(16).padStart(62, "0")}`;
export function parseNote(note) {
  const m = /^arccash-(\d+)-(\d+)-0x([0-9a-f]{124})$/i.exec(String(note).trim());
  if (!m) throw new Error("that is not an ArcCash note");
  return { denomination: m[1], chainId: Number(m[2]), nullifier: BigInt("0x" + m[3].slice(0, 62)), secret: BigInt("0x" + m[3].slice(62)) };
}

/** Rebuild the tree from the on-chain leaves (in insertion order) and return root + path for `leafIndex`. */
export async function merkleProof(leaves, leafIndex, zeroValue) {
  await init();
  const tree = new MerkleTree(LEVELS, leaves.map(String), { hashFunction: (l, r) => mimc.F.toString(mimc.multiHash([BigInt(l), BigInt(r)], 0n, 1)), zeroElement: String(zeroValue) });
  const { pathElements, pathIndices } = tree.path(leafIndex);
  return { root: BigInt(tree.root), pathElements: pathElements.map(BigInt), pathIndices };
}

/** Groth16 proof for a withdrawal. Returns calldata-ready pieces plus the public signals. */
export async function proveWithdrawal({ deposit, root, pathElements, pathIndices, recipient, relayer = 0n, fee = 0n, refund = 0n }) {
  const input = {
    root: root.toString(),
    nullifierHash: deposit.nullifierHash.toString(),
    recipient: BigInt(recipient).toString(),
    relayer: BigInt(relayer).toString(),
    fee: fee.toString(),
    refund: refund.toString(),
    nullifier: deposit.nullifier.toString(),
    secret: deposit.secret.toString(),
    pathElements: pathElements.map(String),
    pathIndices: pathIndices.map(String),
  };
  const wasm = path.join(ROOT, "build/withdraw_js/withdraw.wasm");
  const zkey = path.join(ROOT, "keys/withdraw_final.zkey");
  const t0 = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm, zkey);
  const vkey = JSON.parse(fs.readFileSync(path.join(ROOT, "keys/verification_key.json"), "utf8"));
  if (!(await snarkjs.groth16.verify(vkey, publicSignals, proof))) throw new Error("proof failed local verification");
  const b = (x) => BigInt(x);
  return {
    pA: [b(proof.pi_a[0]), b(proof.pi_a[1])],
    // snarkjs orders G2 coordinates [x1, x0]; the Solidity verifier expects [x0, x1] swapped, as in its own export
    pB: [[b(proof.pi_b[0][1]), b(proof.pi_b[0][0])], [b(proof.pi_b[1][1]), b(proof.pi_b[1][0])]],
    pC: [b(proof.pi_c[0]), b(proof.pi_c[1])],
    publicSignals: publicSignals.map(b),
    ms: Date.now() - t0,
  };
}

export const toBytes32 = (n) => "0x" + BigInt(n).toString(16).padStart(64, "0");

export const arcCashAbi = [
  { type: "constructor", inputs: [{ name: "_verifier", type: "address" }, { name: "_hasher", type: "address" }, { name: "_denomination", type: "uint256" }, { name: "_merkleTreeHeight", type: "uint32" }] },
  { type: "function", name: "deposit", stateMutability: "payable", inputs: [{ name: "_commitment", type: "bytes32" }], outputs: [] },
  { type: "function", name: "withdraw", stateMutability: "payable", inputs: [{ name: "_pA", type: "uint256[2]" }, { name: "_pB", type: "uint256[2][2]" }, { name: "_pC", type: "uint256[2]" }, { name: "_root", type: "bytes32" }, { name: "_nullifierHash", type: "bytes32" }, { name: "_recipient", type: "address" }, { name: "_relayer", type: "address" }, { name: "_fee", type: "uint256" }, { name: "_refund", type: "uint256" }], outputs: [] },
  { type: "function", name: "denomination", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "getLastRoot", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "isKnownRoot", stateMutability: "view", inputs: [{ type: "bytes32" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "isSpent", stateMutability: "view", inputs: [{ type: "bytes32" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "nextIndex", stateMutability: "view", inputs: [], outputs: [{ type: "uint32" }] },
  { type: "function", name: "ZERO_VALUE", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "event", name: "Deposit", inputs: [{ name: "commitment", type: "bytes32", indexed: true }, { name: "leafIndex", type: "uint32", indexed: false }, { name: "timestamp", type: "uint256", indexed: false }] },
  { type: "event", name: "Withdrawal", inputs: [{ name: "to", type: "address", indexed: false }, { name: "nullifierHash", type: "bytes32", indexed: false }, { name: "relayer", type: "address", indexed: true }, { name: "fee", type: "uint256", indexed: false }] },
];

/**
 * All deposit leaves in insertion order, from the Deposit events. Public Arc RPCs prune old logs and cap
 * eth_getLogs at 100k blocks, so scan forward from the pool's deployment block in chunks and retry each one.
 */
export async function fetchLeaves(client, address, fromBlock = 0n, { chunk = 50_000n, retries = 4, indexUrl = process.env.ARCCASH_LEAVES_URL ?? "https://www.usearckit.locker/api/cash" } = {}) {
  const expected = Number(await client.readContract({ address, abi: arcCashAbi, functionName: "nextIndex" }));
  // Arc RPCs prune logs after a few days; the Arc Kit relayer serves the deposit list from an indexer. The count is
  // checked here and the contract rejects unknown roots, so a wrong list cannot produce a valid withdrawal.
  if (indexUrl) {
    try {
      const j = await (await fetch(`${indexUrl}?op=leaves&pool=${address}`, { signal: AbortSignal.timeout(30_000) })).json();
      if (Array.isArray(j.leaves) && j.leaves.length === expected) return j.leaves.map((h) => BigInt(h));
      console.error(`leaf index returned ${j.leaves?.length ?? j.error} (pool has ${expected}); scanning the chain instead`);
    } catch (e) {
      console.error("leaf index unavailable, scanning the chain instead:", e.message);
    }
  }
  const head = await client.getBlockNumber({ cacheTime: 0 }); // viem caches this by default; a stale head drops the newest deposits
  const logs = [];
  for (let from = BigInt(fromBlock); from <= head; from += chunk) {
    const to = from + chunk - 1n < head ? from + chunk - 1n : head;
    for (let attempt = 1; ; attempt++) {
      try {
        logs.push(...(await client.getContractEvents({ address, abi: arcCashAbi, eventName: "Deposit", fromBlock: from, toBlock: to })));
        break;
      } catch (e) {
        if (attempt > retries) throw e;
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
  }
  if (logs.length !== expected) throw new Error(`found ${logs.length} Deposit events but the pool has ${expected} leaves; is --from-block earlier than the pool's deployment?`);
  return logs.sort((a, b) => Number(a.args.leafIndex) - Number(b.args.leafIndex)).map((l) => BigInt(l.args.commitment));
}

/** Block in which `address` was deployed (binary search on eth_getCode), for RPCs that cannot scan from genesis. */
export async function deploymentBlock(client, address) {
  let lo = 0n, hi = await client.getBlockNumber();
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    const code = await client.getCode({ address, blockNumber: mid });
    if (code && code !== "0x") hi = mid; else lo = mid + 1n;
  }
  return lo;
}

/** Close the elliptic-curve worker threads snarkjs/circomlibjs keep open, so the process can end cleanly. */
export async function shutdown() {
  try {
    if (globalThis.curve_bn128) await globalThis.curve_bn128.terminate();
  } catch {
    /* already gone */
  }
}
