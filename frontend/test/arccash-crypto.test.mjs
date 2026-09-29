// Checks the browser port (src/lib/arccash/crypto.ts) against circomlibjs + fixed-merkle-tree, the reference the
// CLI and circuit were built with.   Run: node --experimental-strip-types test/arccash-crypto.test.mjs
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { mimcHash, pedersenHash, createDeposit, merklePath, encodeNote, parseNote, ZERO_VALUE, LEVELS } from "../src/lib/arccash/crypto.ts";

const arccash = path.resolve(import.meta.dirname, "../../arccash");
const req = createRequire(path.join(arccash, "package.json"));
const { buildPedersenHash, buildBabyjub, buildMimcSponge } = await import(pathToFileURL(req.resolve("circomlibjs")).href);
const { MerkleTree } = await import(pathToFileURL(req.resolve("fixed-merkle-tree")).href);
const ref = await import(pathToFileURL(path.join(arccash, "lib/core.mjs")).href);

const [pedersen, babyjub, mimc] = await Promise.all([buildPedersenHash(), buildBabyjub(), buildMimcSponge()]);
const refPedersen = (data) => BigInt(babyjub.F.toString(babyjub.unpackPoint(pedersen.hash(data))[0]));
const refMimc = (l, r) => BigInt(mimc.F.toString(mimc.multiHash([l, r], 0n, 1)));
const check = (cond, msg) => { if (!cond) { console.error("FAILED:", msg); process.exit(1); } console.log("  ok ", msg); };

// MiMC
for (const [l, r] of [[1n, 2n], [0n, 0n], [ZERO_VALUE, ZERO_VALUE], [2n ** 250n, 7n]]) check(mimcHash(l, r) === refMimc(l, r), `mimcHash(${l.toString().slice(0, 12)}…, ${r.toString().slice(0, 12)}…)`);

// Pedersen on random 31- and 62-byte inputs
for (let i = 0; i < 5; i++) {
  const d = createDeposit();
  const refD = await ref.createDeposit(d.nullifier, d.secret);
  check(d.commitment === refD.commitment, `commitment #${i} matches circomlibjs`);
  check(d.nullifierHash === refD.nullifierHash, `nullifierHash #${i} matches circomlibjs`);
  check(d.commitment === refPedersen(Buffer.concat([Buffer.from(d.nullifier.toString(16).padStart(62, "0"), "hex").reverse(), Buffer.from(d.secret.toString(16).padStart(62, "0"), "hex").reverse()])), `raw pedersen #${i}`);
}

// note round trip, both directions with the CLI encoder
const d = createDeposit();
const note = encodeNote(d, 5042, 10n ** 18n);
check(note === ref.encodeNote(d, { chainId: 5042, denomination: (10n ** 18n).toString() }), "note encodes exactly like the CLI");
const p = parseNote(note);
check(p && p.nullifier === d.nullifier && p.secret === d.secret && p.chainId === 5042 && p.denomination === 10n ** 18n, "note parses back");
check(parseNote("arccash-1-5042-0xdeadbeef") === null, "malformed note rejected");

// Merkle paths against fixed-merkle-tree, for trees of 1, 2, 3 and 9 leaves and every leaf index
for (const n of [1, 2, 3, 9]) {
  const leaves = Array.from({ length: n }, () => createDeposit().commitment);
  const tree = new MerkleTree(LEVELS, leaves.map(String), { hashFunction: (l, r) => refMimc(BigInt(l), BigInt(r)).toString(), zeroElement: ZERO_VALUE.toString() });
  for (let i = 0; i < n; i++) {
    const mine = merklePath(leaves, i);
    const theirs = tree.path(i);
    check(mine.root === BigInt(tree.root) && mine.pathElements.every((e, k) => e === BigInt(theirs.pathElements[k])) && mine.pathIndices.every((x, k) => x === theirs.pathIndices[k]), `merkle path, ${n} leaves, index ${i}`);
  }
}
// the on-chain mainnet root after 2 deposits (from the live round trip) is reproduced from the two known leaves? (only if leaves given) — skipped
console.log("\nALL PASSED");
process.exit(0);
