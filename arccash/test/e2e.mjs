// End-to-end on a local Anvil chain: deploy hasher + verifier + pool, deposit twice, withdraw one note to a
// fresh address through a relayer with a fee, then confirm every way of cheating is rejected.
import fs from "node:fs";
import path from "node:path";
import { createPublicClient, createWalletClient, http, parseEther, formatEther, defineChain } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { shutdown, ROOT, LEVELS, createDeposit, merkleProof, proveWithdrawal, toBytes32, arcCashAbi, fetchLeaves, mimcHash, encodeNote, parseNote } from "../lib/core.mjs";

const RPC = process.env.RPC || "http://127.0.0.1:8545";
const DEPLOYER_KEY = process.env.KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // anvil #0
const DENOMINATION = parseEther("10"); // 10 USDC (18 dp on Arc)

const chain = defineChain({ id: 31337, name: "local", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const deployer = privateKeyToAccount(DEPLOYER_KEY);
const pub = createPublicClient({ chain, transport: http(RPC) });
const wallet = createWalletClient({ account: deployer, chain, transport: http(RPC) });
const chainId = await pub.getChainId();
chain.id = chainId;

const artifact = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, `out/${name}.sol/${name === "Verifier" ? "Groth16Verifier" : name}.json`), "utf8"));
async function deploy(abi, bytecode, args = []) {
  const hash = await wallet.deployContract({ abi, bytecode, args });
  const rc = await pub.waitForTransactionReceipt({ hash });
  return rc.contractAddress;
}
const check = (cond, msg) => { if (!cond) throw new Error("FAILED: " + msg); console.log("  ok  " + msg); };
async function expectRevert(fn, msg) { try { await fn(); throw new Error("did not revert"); } catch (e) { if (/did not revert/.test(e.message)) throw new Error("FAILED: " + msg + " (no revert)"); console.log("  ok  " + msg + " -> reverted"); } }

console.log("deploying on chain", chainId);
const hasher = await deploy([], "0x" + fs.readFileSync(path.join(ROOT, "build/Hasher.bin"), "utf8").trim());
const verifier = await deploy(artifact("Verifier").abi, artifact("Verifier").bytecode.object);
const pool = await deploy(artifact("ArcCash").abi, artifact("ArcCash").bytecode.object, [verifier, hasher, DENOMINATION, LEVELS]);
console.log("  hasher", hasher, "\n  verifier", verifier, "\n  pool", pool);

// the on-chain MiMC must match circomlibjs exactly, or nothing else can work
const onchain = await pub.readContract({ address: pool, abi: [{ type: "function", name: "hashLeftRight", stateMutability: "pure", inputs: [{ type: "address" }, { type: "bytes32" }, { type: "bytes32" }], outputs: [{ type: "bytes32" }] }], functionName: "hashLeftRight", args: [hasher, toBytes32(1n), toBytes32(2n)] });
check(BigInt(onchain) === (await mimcHash(1n, 2n)), "on-chain MiMC hashLeftRight(1,2) equals circomlibjs");
const zero = await pub.readContract({ address: pool, abi: arcCashAbi, functionName: "ZERO_VALUE" });

// two deposits from the deployer
const notes = [];
for (let i = 0; i < 2; i++) {
  const d = await createDeposit();
  const hash = await wallet.writeContract({ address: pool, abi: arcCashAbi, functionName: "deposit", args: [toBytes32(d.commitment)], value: DENOMINATION });
  const rc = await pub.waitForTransactionReceipt({ hash });
  check(rc.status === "success", `deposit #${i} accepted (gas ${rc.gasUsed})`);
  notes.push({ d, note: encodeNote(d, { chainId, denomination: DENOMINATION.toString() }) });
}
await expectRevert(() => wallet.writeContract({ address: pool, abi: arcCashAbi, functionName: "deposit", args: [toBytes32(notes[0].d.commitment)], value: DENOMINATION }), "same commitment twice");
await expectRevert(() => wallet.writeContract({ address: pool, abi: arcCashAbi, functionName: "deposit", args: [toBytes32(123n)], value: DENOMINATION - 1n }), "wrong denomination");
check(formatEther(await pub.getBalance({ address: pool })) === "20", "pool holds 20 USDC");

// the withdrawer only has the note string and a fresh, never-funded address
const parsed = parseNote(notes[0].note);
const d = await createDeposit(parsed.nullifier, parsed.secret);
check(d.commitment === notes[0].d.commitment, "note round-trips to the same commitment");
const leaves = await fetchLeaves(pub, pool);
const leafIndex = leaves.findIndex((l) => l === d.commitment);
check(leafIndex === 0, "found our leaf among the on-chain deposits");
const { root, pathElements, pathIndices } = await merkleProof(leaves, leafIndex, zero);
check(BigInt(await pub.readContract({ address: pool, abi: arcCashAbi, functionName: "getLastRoot" })) === root, "locally rebuilt root equals the on-chain root");

const recipient = privateKeyToAccount(generatePrivateKey()).address;
const relayer = deployer.address;
const fee = parseEther("0.05");
const proof = await proveWithdrawal({ deposit: d, root, pathElements, pathIndices, recipient, relayer, fee });
console.log(`  proof generated in ${(proof.ms / 1000).toFixed(1)}s`);

const args = (p, rcpt = recipient, f = fee, nh = d.nullifierHash) => [p.pA, p.pB, p.pC, toBytes32(root), toBytes32(nh), rcpt, relayer, f, 0n];
// tampering: change the recipient after proving
await expectRevert(() => pub.simulateContract({ address: pool, abi: arcCashAbi, functionName: "withdraw", args: args(proof, deployer.address), account: deployer }), "proof bound to recipient: different recipient");
await expectRevert(() => pub.simulateContract({ address: pool, abi: arcCashAbi, functionName: "withdraw", args: args(proof, recipient, fee + 1n), account: deployer }), "proof bound to fee: different fee");
await expectRevert(() => pub.simulateContract({ address: pool, abi: arcCashAbi, functionName: "withdraw", args: args(proof, recipient, fee, notes[1].d.nullifierHash), account: deployer }), "proof bound to nullifier: another note's nullifier hash");

const wh = await wallet.writeContract({ address: pool, abi: arcCashAbi, functionName: "withdraw", args: args(proof) });
const wrc = await pub.waitForTransactionReceipt({ hash: wh });
check(wrc.status === "success", `withdrawal accepted (gas ${wrc.gasUsed})`);
check(formatEther(await pub.getBalance({ address: recipient })) === "9.95", "fresh recipient received 9.95 USDC");
check(await pub.readContract({ address: pool, abi: arcCashAbi, functionName: "isSpent", args: [toBytes32(d.nullifierHash)] }), "nullifier marked spent");
await expectRevert(() => pub.simulateContract({ address: pool, abi: arcCashAbi, functionName: "withdraw", args: args(proof), account: deployer }), "double spend of the same note");
check(formatEther(await pub.getBalance({ address: pool })) === "10", "pool holds the remaining 10 USDC");

// the second note still withdraws against a root that includes both leaves
const d2 = notes[1].d;
const mp2 = await merkleProof(leaves, 1, zero);
const r2 = privateKeyToAccount(generatePrivateKey()).address;
const proof2 = await proveWithdrawal({ deposit: d2, root: mp2.root, pathElements: mp2.pathElements, pathIndices: mp2.pathIndices, recipient: r2 });
const wh2 = await wallet.writeContract({ address: pool, abi: arcCashAbi, functionName: "withdraw", args: [proof2.pA, proof2.pB, proof2.pC, toBytes32(mp2.root), toBytes32(d2.nullifierHash), r2, "0x0000000000000000000000000000000000000000", 0n, 0n] });
check((await pub.waitForTransactionReceipt({ hash: wh2 })).status === "success", "second note withdrawn with no relayer");
check(formatEther(await pub.getBalance({ address: r2 })) === "10", "second recipient received the full 10 USDC");
check(formatEther(await pub.getBalance({ address: pool })) === "0", "pool is empty");
console.log("\nALL PASSED");
process.exit(0);
