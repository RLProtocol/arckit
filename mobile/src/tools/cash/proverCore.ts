// Shared by the native prover (hidden WebView) and the PWA prover (hidden iframe): both load
// usearckit.online/cash/prover.html; only the transport differs.
import type { Address } from "viem";
import { LEVELS, merklePath, type Deposit } from "./crypto";
import type { Proof } from "./index";

export type ProveStage = "tree" | "download" | "prove" | "verify";
export type ProveArgs = { deposit: Deposit; leaves: bigint[]; leafIndex: number; recipient: Address; relayer: Address; fee: bigint };
export type ProverMsg = { id?: string; type: string; stage?: ProveStage; ratio?: number; proof?: { pi_a: string[]; pi_b: string[][]; pi_c: string[] }; message?: string };

/** Rebuilds the Merkle path on the device and returns the circuit inputs plus the root they prove against. */
export async function buildInput(a: ProveArgs, onStage: (s: ProveStage) => void) {
  onStage("tree");
  await new Promise((r) => setTimeout(r, 30)); // let the screen paint before the hashing
  const mp = merklePath(a.leaves, a.leafIndex);
  if (mp.pathElements.length !== LEVELS) throw new Error("Could not rebuild the pool's tree.");
  const input = {
    root: mp.root.toString(), nullifierHash: a.deposit.nullifierHash.toString(), recipient: BigInt(a.recipient).toString(), relayer: BigInt(a.relayer).toString(),
    fee: a.fee.toString(), refund: "0", nullifier: a.deposit.nullifier.toString(), secret: a.deposit.secret.toString(),
    pathElements: mp.pathElements.map(String), pathIndices: mp.pathIndices.map(String),
  };
  return { input, root: mp.root };
}

/** snarkjs orders G2 coordinates [x1, x0]; the Solidity verifier expects them swapped. */
export function parseProof(pr: NonNullable<ProverMsg["proof"]>, root: bigint): Proof {
  const b = (x: string) => BigInt(x);
  return { pA: [b(pr.pi_a[0]), b(pr.pi_a[1])], pB: [[b(pr.pi_b[0][1]), b(pr.pi_b[0][0])], [b(pr.pi_b[1][1]), b(pr.pi_b[1][0])]], pC: [b(pr.pi_c[0]), b(pr.pi_c[1])], root };
}

type Pending = { resolve: (p: Proof) => void; reject: (e: Error) => void; onStage: (s: ProveStage, ratio?: number) => void; root: bigint };

/** Routes prover replies to the waiting request. */
export function makeDispatcher(setReady: (r: boolean) => void) {
  const pending: Record<string, Pending> = {};
  const handle = (m: ProverMsg) => {
    if (m.type === "ready") { setReady(true); return; }
    const p = m.id ? pending[m.id] : undefined;
    if (!p) return;
    if (m.type === "progress" && m.stage) p.onStage(m.stage, m.ratio);
    else if (m.type === "error") { delete pending[m.id!]; p.reject(new Error(m.message || "The proof failed.")); }
    else if (m.type === "done" && m.proof) { delete pending[m.id!]; p.resolve(parseProof(m.proof, p.root)); }
  };
  const request = (send: (id: string, input: unknown) => void, input: unknown, root: bigint, onStage: Pending["onStage"]) => new Promise<Proof>((resolve, reject) => {
    const id = Math.random().toString(36).slice(2);
    pending[id] = { resolve, reject, onStage, root };
    send(id, input);
  });
  return { handle, request };
}
