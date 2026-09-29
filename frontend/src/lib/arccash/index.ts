/**
 * ArcCash in the browser: pool addresses, ABI, leaf fetching and Groth16 proving. The hashing lives in crypto.ts.
 * Everything private (note, proof inputs) stays in this tab; only the proof and public signals go on-chain.
 */
import { parseAbi, type Address, type PublicClient } from "viem";
import deployments from "@arccash/deployments.json";
import { LEVELS, merklePath, toBytes32, type Deposit } from "./crypto";

export * from "./crypto";

export const ARCCASH_CHAIN_ID = 5042;
const d = deployments["5042"];

export type Pool = { address: Address; denomination: bigint; label: string; deployBlock: bigint };
/** Fixed denominations; every deposit in a pool is identical, which is what makes withdrawals unlinkable. */
export const POOLS: Pool[] = [
  { address: d.pool_1 as Address, denomination: 10n ** 18n, label: "1 USDC", deployBlock: BigInt(d.blocks[d.pool_1 as keyof typeof d.blocks]) },
  { address: d.pool_10 as Address, denomination: 10n * 10n ** 18n, label: "10 USDC", deployBlock: BigInt(d.blocks[d.pool_10 as keyof typeof d.blocks]) },
];
export const poolFor = (denomination: bigint) => POOLS.find((p) => p.denomination === denomination);

export const arcCashAbi = parseAbi([
  "function deposit(bytes32 _commitment) payable",
  "function withdraw(uint256[2] _pA, uint256[2][2] _pB, uint256[2] _pC, bytes32 _root, bytes32 _nullifierHash, address _recipient, address _relayer, uint256 _fee, uint256 _refund) payable",
  "function denomination() view returns (uint256)",
  "function getLastRoot() view returns (bytes32)",
  "function isKnownRoot(bytes32) view returns (bool)",
  "function isSpent(bytes32) view returns (bool)",
  "function nextIndex() view returns (uint32)",
  "function commitments(bytes32) view returns (bool)",
  "event Deposit(bytes32 indexed commitment, uint32 leafIndex, uint256 timestamp)",
  "event Withdrawal(address to, bytes32 nullifierHash, address indexed relayer, uint256 fee)",
  "error CommitmentAlreadySubmitted()",
  "error WrongDenomination(uint256 sent, uint256 expected)",
  "error UnknownRoot()",
  "error NoteAlreadySpent()",
  "error InvalidProof()",
  "error FeeExceedsDenomination()",
  "error RefundNotSupported()",
  "error TransferFailed()",
]);

/**
 * All deposit leaves in insertion order. Arc RPCs prune old logs and cap eth_getLogs at 100k blocks, so scan
 * forward from the pool's deployment block in chunks; the count is checked against nextIndex so a silently
 * truncated scan cannot produce a wrong root.
 */
export async function fetchLeaves(client: PublicClient, pool: Pool, onProgress?: (done: number, total: number) => void): Promise<bigint[]> {
  const head = await client.getBlockNumber({ cacheTime: 0 });
  const chunk = 50_000n;
  const total = Number((head - pool.deployBlock) / chunk) + 1;
  const logs: { commitment: bigint; leafIndex: number }[] = [];
  let i = 0;
  for (let from = pool.deployBlock; from <= head; from += chunk) {
    const to = from + chunk - 1n < head ? from + chunk - 1n : head;
    let lastErr: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const got = await client.getContractEvents({ address: pool.address, abi: arcCashAbi, eventName: "Deposit", fromBlock: from, toBlock: to, strict: true });
        logs.push(...got.map((l) => ({ commitment: BigInt(l.args.commitment), leafIndex: Number(l.args.leafIndex) })));
        lastErr = undefined;
        break;
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }
    }
    if (lastErr) throw new Error("Could not read the pool's deposits from the network. Try again in a moment.");
    onProgress?.(++i, total);
  }
  const expected = Number(await client.readContract({ address: pool.address, abi: arcCashAbi, functionName: "nextIndex" }));
  if (logs.length !== expected) throw new Error(`Read ${logs.length} deposits but the pool has ${expected}. The RPC returned incomplete history; try again.`);
  return logs.sort((a, b) => a.leafIndex - b.leafIndex).map((l) => l.commitment);
}

// ------------------------------------------------------------------ proving

export type ProveStage = "leaves" | "tree" | "download" | "prove" | "verify";
export type ProveProgress = { stage: ProveStage; ratio?: number };

export type Proof = { pA: [bigint, bigint]; pB: [[bigint, bigint], [bigint, bigint]]; pC: [bigint, bigint]; root: bigint; ms: number };

let zkeyCache: Uint8Array | undefined;
let wasmCache: Uint8Array | undefined;

async function download(url: string, onRatio?: (r: number) => void): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Could not download ${url.split("/").pop()} (${res.status}).`);
  const total = Number(res.headers.get("content-length") ?? 0);
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    if (total) onRatio?.(got / total);
  }
  const out = new Uint8Array(got);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Downloads (once per tab) the ~20 MB proving key and 240 KB witness calculator. */
export async function loadProver(onRatio?: (r: number) => void) {
  wasmCache ??= await download("/cash/withdraw.wasm");
  zkeyCache ??= await download("/cash/withdraw_final.zkey", onRatio);
  return { wasm: wasmCache, zkey: zkeyCache };
}

/** Full withdrawal proof for `deposit` at `leafIndex` among `leaves`, bound to recipient/relayer/fee. */
export async function proveWithdrawal(
  { deposit, leaves, leafIndex, recipient, relayer, fee }: { deposit: Deposit; leaves: bigint[]; leafIndex: number; recipient: Address; relayer: Address; fee: bigint },
  onProgress: (p: ProveProgress) => void,
): Promise<Proof> {
  onProgress({ stage: "tree" });
  await new Promise((r) => setTimeout(r, 30)); // let the UI paint before the synchronous hashing
  const mp = merklePath(leaves, leafIndex);
  if (mp.pathElements.length !== LEVELS) throw new Error("bad merkle path");

  onProgress({ stage: "download", ratio: 0 });
  const { wasm, zkey } = await loadProver((ratio) => onProgress({ stage: "download", ratio }));

  onProgress({ stage: "prove" });
  const snarkjs = await import("snarkjs");
  const input = {
    root: mp.root.toString(),
    nullifierHash: deposit.nullifierHash.toString(),
    recipient: BigInt(recipient).toString(),
    relayer: BigInt(relayer).toString(),
    fee: fee.toString(),
    refund: "0",
    nullifier: deposit.nullifier.toString(),
    secret: deposit.secret.toString(),
    pathElements: mp.pathElements.map(String),
    pathIndices: mp.pathIndices.map(String),
  };
  const t0 = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm, zkey);

  onProgress({ stage: "verify" });
  const vkey = await fetch("/cash/verification_key.json").then((r) => r.json());
  if (!(await snarkjs.groth16.verify(vkey, publicSignals, proof))) throw new Error("The proof failed local verification. Nothing was sent.");

  const b = (x: string) => BigInt(x);
  return {
    pA: [b(proof.pi_a[0]), b(proof.pi_a[1])],
    // snarkjs orders G2 coordinates [x1, x0]; the Solidity verifier expects them swapped, as in its own export
    pB: [[b(proof.pi_b[0][1]), b(proof.pi_b[0][0])], [b(proof.pi_b[1][1]), b(proof.pi_b[1][0])]],
    pC: [b(proof.pi_c[0]), b(proof.pi_c[1])],
    root: mp.root,
    ms: Date.now() - t0,
  };
}

export const withdrawArgs = (proof: Proof, nullifierHash: bigint, recipient: Address, relayer: Address, fee: bigint) =>
  [proof.pA, proof.pB, proof.pC, toBytes32(proof.root), toBytes32(nullifierHash), recipient, relayer, fee, 0n] as const;

// ------------------------------------------------------------------ relayer (api/cash.js)

export type RelayerConfig = { ready: boolean; relayer: Address | null; fee: bigint };

/** Who pays gas for withdrawals. `ready: false` means users must send the withdrawal from their own wallet. */
export async function fetchRelayerConfig(): Promise<RelayerConfig> {
  try {
    const r = await fetch("/api/cash?op=config");
    if (!r.ok) return { ready: false, relayer: null, fee: 0n };
    const j = (await r.json()) as { ready: boolean; relayer: string | null; fee: string };
    return { ready: !!j.ready && !!j.relayer, relayer: (j.relayer as Address) ?? null, fee: BigInt(j.fee ?? "0") };
  } catch {
    return { ready: false, relayer: null, fee: 0n };
  }
}

/** Hand a finished proof to the relayer; it simulates, then broadcasts and returns the tx hash. */
export async function relayWithdraw(pool: Pool, proof: Proof, nullifierHash: bigint, recipient: Address, fee: bigint): Promise<`0x${string}`> {
  const s = (x: bigint) => x.toString();
  const r = await fetch("/api/cash?op=withdraw", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pool: pool.address, pA: proof.pA.map(s), pB: proof.pB.map((row) => row.map(s)), pC: proof.pC.map(s), root: toBytes32(proof.root), nullifierHash: toBytes32(nullifierHash), recipient, fee: s(fee) }),
  });
  const j = (await r.json().catch(() => ({}))) as { hash?: `0x${string}`; error?: string };
  if (!r.ok || !j.hash) throw new Error(j.error || "The relayer could not send the withdrawal.");
  return j.hash;
}
