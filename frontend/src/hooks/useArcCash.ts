import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useReadContracts, usePublicClient } from "wagmi";
import type { Address } from "viem";
import { arc } from "@/wagmi";
import { arcCashAbi, POOLS, fetchLeaves, fetchRelayerConfig, proveWithdrawal, relayWithdraw, type Deposit, type Pool, type Proof, type ProveStage, type RelayerConfig } from "@/lib/arccash";

export type PoolStats = Pool & { deposits: number; unspent: number; balance: bigint };

/** Deposits and unspent notes per pool. Unspent = balance / denomination; that is the anonymity set. */
export function usePoolStats() {
  const q = useReadContracts({
    contracts: POOLS.flatMap((p) => [{ address: p.address, abi: arcCashAbi, functionName: "nextIndex" } as const]),
    query: { refetchInterval: 30_000 },
  });
  const bal = useReadContracts({
    // getBalance is not a multicall target; read each pool's balance through the multicall3 helper instead
    contracts: POOLS.map((p) => ({ address: arc.contracts.multicall3.address, abi: multicallBalanceAbi, functionName: "getEthBalance", args: [p.address] }) as const),
    query: { refetchInterval: 30_000 },
  });
  const stats: PoolStats[] = POOLS.map((p, i) => {
    const deposits = Number(q.data?.[i]?.result ?? 0);
    const balance = (bal.data?.[i]?.result as bigint | undefined) ?? 0n;
    return { ...p, deposits, balance, unspent: Number(balance / p.denomination) };
  });
  return { stats, isLoading: q.isLoading || bal.isLoading };
}
const multicallBalanceAbi = [{ type: "function", name: "getEthBalance", stateMutability: "view", inputs: [{ name: "addr", type: "address" }], outputs: [{ type: "uint256" }] }] as const;

export type WithdrawProgress =
  | { stage: "idle" }
  | { stage: ProveStage; ratio?: number; done?: number; total?: number }
  | { stage: "ready"; proof: Proof; leafIndex: number; leaves: number }
  | { stage: "error"; message: string };

/** Drives the withdraw pipeline: read deposits → rebuild tree → download prover → prove → verify. */
export function useProver() {
  const client = usePublicClient({ chainId: arc.id });
  const [progress, setProgress] = useState<WithdrawProgress>({ stage: "idle" });

  const run = useCallback(
    async (pool: Pool, deposit: Deposit, recipient: Address, relayer: Address, fee: bigint) => {
      if (!client) return;
      try {
        setProgress({ stage: "leaves", done: 0, total: 1 });
        const leaves = await fetchLeaves(client, pool, (done, total) => setProgress({ stage: "leaves", done, total }));
        const leafIndex = leaves.findIndex((l) => l === deposit.commitment);
        if (leafIndex < 0) throw new Error("This note's deposit is not in the pool. Check that you pasted the whole note.");
        const proof = await proveWithdrawal({ deposit, leaves, leafIndex, recipient, relayer, fee }, (p) => setProgress(p));
        setProgress({ stage: "ready", proof, leafIndex, leaves: leaves.length });
      } catch (e) {
        setProgress({ stage: "error", message: e instanceof Error ? e.message : String(e) });
      }
    },
    [client],
  );

  const reset = useCallback(() => setProgress({ stage: "idle" }), []);
  return { progress, run, reset };
}

/** Relayer availability + address; the proof must be built against this address. */
export function useRelayerConfig(): RelayerConfig {
  const q = useQuery({ queryKey: ["arccash-relayer"], queryFn: fetchRelayerConfig, staleTime: 60_000, refetchInterval: 60_000 });
  return q.data ?? { ready: false, relayer: null, fee: 0n };
}

export type RelayState = { status: "idle" | "sending" | "pending" | "success" | "reverted"; hash?: `0x${string}`; error: string; busy: boolean };

/** Sends a finished proof through the relayer and follows the transaction to its receipt. */
export function useRelay() {
  const client = usePublicClient({ chainId: arc.id });
  const qc = useQueryClient();
  const [s, setS] = useState<RelayState>({ status: "idle", error: "", busy: false });

  const send = useCallback(async (pool: Pool, proof: Proof, nullifierHash: bigint, recipient: Address, fee: bigint) => {
    setS({ status: "sending", error: "", busy: true });
    try {
      const hash = await relayWithdraw(pool, proof, nullifierHash, recipient, fee);
      setS({ status: "pending", hash, error: "", busy: true });
    } catch (e) {
      setS({ status: "idle", error: e instanceof Error ? e.message : String(e), busy: false });
    }
  }, []);

  useEffect(() => {
    if (s.status !== "pending" || !s.hash || !client) return;
    const hash = s.hash;
    let stop = false;
    (async () => {
      try {
        const rc = await client.waitForTransactionReceipt({ hash, timeout: 120_000 });
        if (stop) return;
        setS((p) => ({ ...p, status: rc.status === "success" ? "success" : "reverted", busy: false }));
        void qc.invalidateQueries();
      } catch (e) {
        if (!stop) setS((p) => ({ ...p, status: "idle", error: e instanceof Error ? e.message : String(e), busy: false }));
      }
    })();
    return () => { stop = true; };
  }, [s.status, s.hash, client, qc]);

  const reset = useCallback(() => setS({ status: "idle", error: "", busy: false }), []);
  return { ...s, send, reset };
}
