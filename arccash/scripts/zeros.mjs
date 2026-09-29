// Fills in MerkleTreeWithHistory.zeros() with the empty-subtree hashes for each level, computed with the
// exact MiMC sponge the circuit and the on-chain hasher use, so all three agree.
import fs from "node:fs";
import { buildMimcSponge } from "circomlibjs";
import { keccak256, toHex } from "viem";

const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const ZERO = BigInt(keccak256(toHex("arccash"))) % FIELD;
const LEVELS = 32;

const mimc = await buildMimcSponge();
const F = mimc.F;
const hash = (l, r) => BigInt(F.toString(mimc.multiHash([l, r], 0n, 1)));

const zeros = [ZERO];
for (let i = 1; i < LEVELS; i++) zeros.push(hash(zeros[i - 1], zeros[i - 1]));

const lines = zeros.map((z, i) => `        ${i === 0 ? "if" : "else if"} (i == ${i}) return bytes32(uint256(${z.toString()}));`).join("\n");
const file = "contracts/MerkleTreeWithHistory.sol";
let src = fs.readFileSync(file, "utf8");
if (!src.includes("// ZEROS_PLACEHOLDER")) throw new Error("placeholder already replaced");
src = src.replace("        // ZEROS_PLACEHOLDER\n        revert(\"index out of bounds\");", `${lines}\n        else revert("index out of bounds");`);
src = src.replace(/ZERO_VALUE = \d+;/, `ZERO_VALUE = ${ZERO.toString()};`);
fs.writeFileSync(file, src);
fs.writeFileSync("build/zeros.json", JSON.stringify(zeros.map(String)));
console.log("ZERO_VALUE", ZERO.toString());
console.log("zeros[1]", zeros[1].toString(), "| levels written:", LEVELS);
