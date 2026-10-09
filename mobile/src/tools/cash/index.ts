// ArcCash in the app: pools, ABI, the secure note book, leaves from the indexer, and the relayer.
// Hashing lives in ./crypto (a copy of the website's, checked against circomlibjs); proving runs in ./Prover.
import * as SecureStore from "expo-secure-store";
import { parseAbi, type Address, type Hex } from "viem";
import { publicClient, SITE } from "../../chain";
import { createDeposit, parseNote, toBytes32 } from "./crypto";

export * from "./crypto";

export const CHAIN_ID = 5042;
export type Pool = { address: Address; denomination: bigint; label: string };
/** Fixed denominations: every deposit in a pool is identical, which is what makes withdrawals unlinkable. */
export const POOLS: Pool[] = [
  { address: "0xdbf688e09c296df6ef4a02995427ee637d1e3ebe", denomination: 10n ** 18n, label: "1 USDC" },
  { address: "0x0303ae09b4f9f599823634aa9c88b6a517b24e1b", denomination: 10n * 10n ** 18n, label: "10 USDC" },
];
export const poolFor = (denomination: bigint) => POOLS.find((p) => p.denomination === denomination);

export const arcCashAbi = parseAbi([
  "function deposit(bytes32 _commitment) payable",
  "function nextIndex() view returns (uint32)",
  "function isSpent(bytes32) view returns (bool)",
  "function commitments(bytes32) view returns (bool)",
  "error CommitmentAlreadySubmitted()",
  "error WrongDenomination(uint256 sent, uint256 expected)",
  "error UnknownRoot()",
  "error NoteAlreadySpent()",
  "error InvalidProof()",
]);

// ---------------------------------------------------------------- note book (secure storage)
// Each note in its own SecureStore key (values are capped near 2 KB), plus an index of ids.
// A note is written BEFORE its deposit is broadcast: a deposit without a saved note is money lost for good.

export type SavedNote = { id: string; note: string; pool: Address; label: string; createdAt: number; status: "pending" | "deposited" | "failed" | "spent"; tx?: Hex };
const INDEX = "arckit.cash.index";
const key = (id: string) => `arckit.cash.note.${id}`;

export async function listNotes(): Promise<SavedNote[]> {
  const ids = JSON.parse((await SecureStore.getItemAsync(INDEX)) ?? "[]") as string[];
  const notes = await Promise.all(ids.map(async (id) => { const v = await SecureStore.getItemAsync(key(id)); return v ? (JSON.parse(v) as SavedNote) : null; }));
  return notes.filter((n): n is SavedNote => !!n).sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveNote(n: SavedNote) {
  await SecureStore.setItemAsync(key(n.id), JSON.stringify(n));
  const ids = JSON.parse((await SecureStore.getItemAsync(INDEX)) ?? "[]") as string[];
  if (!ids.includes(n.id)) await SecureStore.setItemAsync(INDEX, JSON.stringify([...ids, n.id]));
}

export async function updateNote(id: string, patch: Partial<SavedNote>) {
  const v = await SecureStore.getItemAsync(key(id));
  if (v) await SecureStore.setItemAsync(key(id), JSON.stringify({ ...(JSON.parse(v) as SavedNote), ...patch }));
}

export async function removeNote(id: string) {
  await SecureStore.deleteItemAsync(key(id));
  const ids = JSON.parse((await SecureStore.getItemAsync(INDEX)) ?? "[]") as string[];
  await SecureStore.setItemAsync(INDEX, JSON.stringify(ids.filter((x) => x !== id)));
}

// ---------------------------------------------------------------- chain + relayer

/** All deposit leaves in order, from the site's Etherscan-backed indexer, checked against the pool's count. */
export async function fetchLeaves(pool: Pool): Promise<bigint[]> {
  const expected = Number(await publicClient.readContract({ address: pool.address, abi: arcCashAbi, functionName: "nextIndex" }));
  const r = await fetch(`${SITE}/api/cash?op=leaves&pool=${pool.address}`, { signal: AbortSignal.timeout(30_000) });
  const j = (await r.json()) as { leaves?: string[] };
  if (!r.ok || !Array.isArray(j.leaves) || j.leaves.length !== expected || !j.leaves.every((h) => /^0x[0-9a-fA-F]{64}$/.test(h))) {
    throw new Error("Could not read the pool's deposits. Try again in a minute.");
  }
  return j.leaves.map((h) => BigInt(h));
}

export type RelayerConfig = { ready: boolean; relayer: Address | null; fee: bigint };
export async function fetchRelayerConfig(): Promise<RelayerConfig> {
  try {
    const r = await fetch(`${SITE}/api/cash?op=config`, { signal: AbortSignal.timeout(15_000) });
    const j = (await r.json()) as { ready: boolean; relayer: string | null; fee: string };
    return { ready: !!j.ready && !!j.relayer, relayer: (j.relayer as Address) ?? null, fee: BigInt(j.fee ?? "0") };
  } catch {
    return { ready: false, relayer: null, fee: 0n };
  }
}

export type Proof = { pA: [bigint, bigint]; pB: [[bigint, bigint], [bigint, bigint]]; pC: [bigint, bigint]; root: bigint };

/** Hands a finished proof to the relayer, which simulates, broadcasts and pays the gas. The note never leaves the phone. */
export async function relayWithdraw(pool: Pool, proof: Proof, nullifierHash: bigint, recipient: Address, fee: bigint): Promise<Hex> {
  const s = (x: bigint) => x.toString();
  const r = await fetch(`${SITE}/api/cash?op=withdraw`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pool: pool.address, pA: proof.pA.map(s), pB: proof.pB.map((row) => row.map(s)), pC: proof.pC.map(s), root: toBytes32(proof.root), nullifierHash: toBytes32(nullifierHash), recipient, fee: s(fee) }),
    signal: AbortSignal.timeout(60_000),
  });
  const j = (await r.json().catch(() => ({}))) as { hash?: Hex; error?: string };
  if (!r.ok || !j.hash) throw new Error(j.error || "The relayer could not send the withdrawal.");
  return j.hash;
}

export const isSpent = (pool: Pool, nullifierHash: bigint) => publicClient.readContract({ address: pool.address, abi: arcCashAbi, functionName: "isSpent", args: [toBytes32(nullifierHash)] });

/** Pending notes whose deposit landed while the app was closed become "deposited" (checked on the pool itself). */
export async function reconcileNotes(notes: SavedNote[]): Promise<boolean> {
  const pending = notes.filter((n) => n.status === "pending" || (n.status === "failed" && n.tx));
  if (!pending.length) return false;
  const found = await publicClient.multicall({
    allowFailure: true,
    contracts: pending.map((n) => { const p = parseNote(n.note)!; return { address: n.pool, abi: arcCashAbi, functionName: "commitments", args: [toBytes32(createDeposit(p.nullifier, p.secret).commitment)] } as const; }),
  });
  let changed = false;
  for (let i = 0; i < pending.length; i++) if (found[i].result === true) { await updateNote(pending[i].id, { status: "deposited" }); changed = true; }
  return changed;
}
