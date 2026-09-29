#!/usr/bin/env node
// ArcCash command line.
//   node cli.mjs deploy  --rpc <url> --key <hex> --denomination 10        deploy hasher + verifier + pool
//   node cli.mjs deposit --rpc <url> --key <hex> --pool <addr>            deposit, prints the NOTE (keep it secret)
//   node cli.mjs withdraw --rpc <url> --key <hex> --pool <addr> --note <note> --to <addr> [--relayer <addr> --fee <usdc>] [--from-block <n>]
//   node cli.mjs status  --rpc <url> --pool <addr> [--note <note>]        pool stats, and whether a note is spent
import fs from "node:fs";
import path from "node:path";
import { createPublicClient, createWalletClient, http, parseEther, formatEther, defineChain, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { shutdown, ROOT, LEVELS, createDeposit, merkleProof, proveWithdrawal, toBytes32, arcCashAbi, fetchLeaves, deploymentBlock, encodeNote, parseNote } from "./lib/core.mjs";

const args = Object.fromEntries(process.argv.slice(3).map((a, i, arr) => (a.startsWith("--") ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : "true"] : null)).filter(Boolean));
const cmd = process.argv[2];
const need = (k) => { if (!args[k]) { console.error(`missing --${k}`); process.exit(2); } return args[k]; };
const rpc = args.rpc || process.env.ARCCASH_RPC || "http://127.0.0.1:8545";
const key = args.key || process.env.ARCCASH_KEY;

const chain = defineChain({ id: 0, name: "arc", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
const pub = createPublicClient({ chain, transport: http(rpc) });
chain.id = await pub.getChainId();
const wallet = key ? createWalletClient({ account: privateKeyToAccount(key), chain, transport: http(rpc) }) : null;
const artifact = (name, contract = name) => JSON.parse(fs.readFileSync(path.join(ROOT, `out/${name}.sol/${contract}.json`), "utf8"));
const deployments = path.join(ROOT, "deployments.json");
const saved = fs.existsSync(deployments) ? JSON.parse(fs.readFileSync(deployments, "utf8")) : {};

if (cmd === "deploy") {
  if (!wallet) need("key");
  const denomination = parseEther(String(args.denomination || "10"));
  const dep = async (abi, bytecode, a = []) => (await pub.waitForTransactionReceipt({ hash: await wallet.deployContract({ abi, bytecode, args: a }) })).contractAddress;
  console.log(`deploying to chain ${chain.id} from ${wallet.account.address}…`);
  // reuse a hasher/verifier already deployed on this chain (from deployments.json or --hasher/--verifier)
  const prior = saved[chain.id] || {};
  const hasher = args.hasher || prior.hasher || (await dep([], "0x" + fs.readFileSync(path.join(ROOT, "build/Hasher.bin"), "utf8").trim()));
  const verifier = args.verifier || prior.verifier || (await dep(artifact("Verifier", "Groth16Verifier").abi, artifact("Verifier", "Groth16Verifier").bytecode.object));
  const pool = await dep(artifact("ArcCash").abi, artifact("ArcCash").bytecode.object, [verifier, hasher, denomination, LEVELS]);
  const block = await pub.getBlockNumber(); // withdraw scans Deposit events from here; public RPCs cannot scan from genesis
  const name = `pool_${formatEther(denomination)}`;
  saved[chain.id] = { ...(saved[chain.id] || {}), hasher, verifier, [name]: pool, blocks: { ...(saved[chain.id]?.blocks || {}), [pool.toLowerCase()]: Number(block) }, deployedAt: new Date().toISOString() };
  fs.writeFileSync(deployments, JSON.stringify(saved, null, 2));
  console.log(`hasher   ${hasher}\nverifier ${verifier}\npool     ${pool}  (denomination ${formatEther(denomination)} USDC)\nsaved to deployments.json`);
} else if (cmd === "deposit") {
  if (!wallet) need("key");
  const pool = getAddress(need("pool"));
  const denomination = await pub.readContract({ address: pool, abi: arcCashAbi, functionName: "denomination" });
  const d = await createDeposit();
  const note = encodeNote(d, { chainId: chain.id, denomination: denomination.toString() });
  // written to disk *before* the transaction is sent: a lost note means the deposit is gone for good
  const notesDir = path.join(ROOT, "notes");
  fs.mkdirSync(notesDir, { recursive: true });
  const noteFile = path.join(notesDir, `${chain.id}-${formatEther(denomination)}usdc-${Date.now()}.note`);
  fs.writeFileSync(noteFile, note + "\n", { mode: 0o600 });
  console.log(`\nYOUR NOTE (also saved to ${path.relative(process.cwd(), noteFile)}; it is the only way to withdraw):\n\n  ${note}\n`);
  const hash = await wallet.writeContract({ address: pool, abi: arcCashAbi, functionName: "deposit", args: [toBytes32(d.commitment)], value: denomination });
  const rc = await pub.waitForTransactionReceipt({ hash });
  console.log(`deposited ${formatEther(denomination)} USDC · tx ${hash} · ${rc.status}`);
  console.log("Tip: wait for other deposits before withdrawing, and withdraw to an address that has never been linked to the depositing one.");
} else if (cmd === "withdraw") {
  if (!wallet) need("key");
  const pool = getAddress(need("pool"));
  const parsed = parseNote(need("note"));
  if (parsed.chainId !== chain.id) { console.error(`note is for chain ${parsed.chainId}, RPC is chain ${chain.id}`); process.exit(2); }
  const to = getAddress(need("to"));
  const relayer = args.relayer ? getAddress(args.relayer) : "0x0000000000000000000000000000000000000000";
  const fee = args.fee ? parseEther(String(args.fee)) : 0n;
  const d = await createDeposit(parsed.nullifier, parsed.secret);
  if (await pub.readContract({ address: pool, abi: arcCashAbi, functionName: "isSpent", args: [toBytes32(d.nullifierHash)] })) { console.error("this note has already been spent"); process.exit(1); }
  const zero = await pub.readContract({ address: pool, abi: arcCashAbi, functionName: "ZERO_VALUE" });
  // --from-block, else the block recorded at deploy time, else locate the deployment block on the fly
  let fromBlock = args["from-block"] ? BigInt(args["from-block"]) : saved[chain.id]?.blocks?.[pool.toLowerCase()];
  if (fromBlock === undefined) { console.log("locating the pool's deployment block…"); fromBlock = await deploymentBlock(pub, pool); }
  const leaves = await fetchLeaves(pub, pool, BigInt(fromBlock));
  const idx = leaves.findIndex((l) => l === d.commitment);
  if (idx < 0) { console.error("no deposit with this note's commitment was found in the pool"); process.exit(1); }
  console.log(`note found at leaf ${idx} of ${leaves.length}; building proof…`);
  const mp = await merkleProof(leaves, idx, zero);
  const proof = await proveWithdrawal({ deposit: d, root: mp.root, pathElements: mp.pathElements, pathIndices: mp.pathIndices, recipient: to, relayer, fee });
  console.log(`proof ready in ${(proof.ms / 1000).toFixed(1)}s; sending withdrawal from ${wallet.account.address}…`);
  const hash = await wallet.writeContract({ address: pool, abi: arcCashAbi, functionName: "withdraw", args: [proof.pA, proof.pB, proof.pC, toBytes32(mp.root), toBytes32(d.nullifierHash), to, relayer, fee, 0n] });
  const rc = await pub.waitForTransactionReceipt({ hash });
  console.log(`withdrawn to ${to} · tx ${hash} · ${rc.status}`);
} else if (cmd === "status") {
  const pool = getAddress(need("pool"));
  const [denomination, next, root, bal] = await Promise.all([pub.readContract({ address: pool, abi: arcCashAbi, functionName: "denomination" }), pub.readContract({ address: pool, abi: arcCashAbi, functionName: "nextIndex" }), pub.readContract({ address: pool, abi: arcCashAbi, functionName: "getLastRoot" }), pub.getBalance({ address: pool })]);
  console.log(`pool ${pool} on chain ${chain.id}\ndenomination ${formatEther(denomination)} USDC · deposits ${next} · balance ${formatEther(bal)} USDC (${Number(formatEther(bal)) / Number(formatEther(denomination))} unspent)\nroot ${root}`);
  if (args.note) {
    const p = parseNote(args.note);
    const d = await createDeposit(p.nullifier, p.secret);
    console.log("note:", (await pub.readContract({ address: pool, abi: arcCashAbi, functionName: "isSpent", args: [toBytes32(d.nullifierHash)] })) ? "SPENT" : "unspent");
  }
} else {
  console.log("usage: node cli.mjs <deploy|deposit|withdraw|status> [--rpc url] [--key hex] [--pool addr] [--note note] [--to addr] [--relayer addr] [--fee usdc] [--denomination usdc]");
}
await shutdown();
process.exit(0);
