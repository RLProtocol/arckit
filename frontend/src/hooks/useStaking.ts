import { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import type { Address } from "viem";
import { STAKING_ADDRESS, stakingAbi, type StakingPool } from "@/contracts";

const c = { address: STAKING_ADDRESS as Address, abi: stakingAbi } as const;
const on = !!STAKING_ADDRESS;

export function useCreateFee() {
  return useReadContract({ ...c, functionName: "createFee", query: { enabled: on } });
}

export function useStakingPool(id?: bigint) {
  return useReadContract({ ...c, functionName: "poolInfo", args: [id ?? 0n], query: { enabled: on && id !== undefined, refetchInterval: 15_000 } });
}

export function useStakingPoolExists(id?: bigint): boolean | undefined {
  const q = useReadContract({ ...c, functionName: "poolExists", args: [id ?? 0n], query: { enabled: on && id !== undefined, staleTime: 60_000 } });
  return q.data as boolean | undefined;
}

export function useStakingPoolsByIds(ids?: readonly bigint[]) {
  const key = ids?.map(String).join(",") ?? "";
  const contracts = useMemo(() => (ids ?? []).map((id) => ({ ...c, functionName: "poolInfo" as const, args: [id] as const })), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const q = useReadContracts({ contracts, allowFailure: false, query: { enabled: on && contracts.length > 0, refetchInterval: 30_000 } });
  const pools = useMemo(() => (ids && ids.length === 0 ? [] : (q.data as StakingPool[] | undefined)), [q.data, ids]);
  return { ...q, pools, isLoading: contracts.length > 0 && q.isLoading };
}

/** Newest `limit` pools. */
export function useAllStakingPools(limit = 200) {
  const next = useReadContract({ ...c, functionName: "nextPoolId", query: { enabled: on, refetchInterval: 20_000 } });
  const ids = useMemo(() => {
    if (next.data === undefined) return undefined;
    const count = Number(next.data) - 1;
    const start = Math.max(1, count - limit + 1);
    const out: bigint[] = [];
    for (let i = count; i >= start; i--) out.push(BigInt(i));
    return out;
  }, [next.data, limit]);
  const res = useStakingPoolsByIds(ids);
  return { ...res, ids, isLoading: next.isLoading || res.isLoading, isError: next.isError || res.isError, total: next.data !== undefined ? Number(next.data) - 1 : undefined };
}

export function useUserPoolIds(who?: Address) {
  return useReadContract({ ...c, functionName: "getPoolsForUser", args: [who ?? (STAKING_ADDRESS as Address)], query: { enabled: on && !!who } });
}
export function useCreatorPoolIds(who?: Address) {
  return useReadContract({ ...c, functionName: "getPoolsByCreator", args: [who ?? (STAKING_ADDRESS as Address)], query: { enabled: on && !!who } });
}

/** Live per-pool numbers, plus the connected user's position when `who` is given. */
export function useStakingLive(id?: bigint, who?: Address) {
  const base = id !== undefined
    ? [
        { ...c, functionName: "currentAprBps" as const, args: [id] as const },
        { ...c, functionName: "rewardsRemaining" as const, args: [id] as const },
      ]
    : [];
  const user = id !== undefined && who
    ? [
        { ...c, functionName: "users" as const, args: [id, who] as const },
        { ...c, functionName: "earned" as const, args: [id, who] as const },
      ]
    : [];
  const q = useReadContracts({ contracts: [...base, ...user], allowFailure: true, query: { enabled: on && id !== undefined, refetchInterval: 10_000 } });
  const d = q.data as Array<{ status: string; result?: unknown }> | undefined;
  const u = d?.[2]?.status === "success" ? (d[2].result as readonly [bigint, bigint, bigint, bigint]) : undefined;
  return {
    ...q,
    aprBps: d?.[0]?.status === "success" ? (d[0].result as bigint) : undefined,
    rewardsRemaining: d?.[1]?.status === "success" ? (d[1].result as bigint) : undefined,
    staked: u?.[0],
    firstStakeAt: u?.[3],
    earned: d?.[3]?.status === "success" ? (d[3].result as bigint) : undefined,
  };
}

/** Hypothetical APR for the create form or "if I stake X". */
export function useAprFor(id?: bigint, staked?: bigint) {
  return useReadContract({ ...c, functionName: "aprBpsFor", args: [id ?? 0n, staked ?? 0n], query: { enabled: on && id !== undefined && !!staked && staked > 0n } });
}

// ---------- math helpers (mirror the contract) ----------

export const YEAR = 365n * 86_400n;

/** APR % for a hypothetical pool before it exists: rewards over duration, annualised, against a staked amount (same token). */
export function projectedAprPct(rewards: bigint, durationSec: bigint, staked: bigint): number {
  if (staked === 0n || durationSec === 0n) return 0;
  const perYear = (rewards * YEAR) / durationSec;
  return Number((perYear * 10_000n) / staked) / 100;
}

export function fmtApr(bps?: bigint): string {
  if (bps === undefined) return "—";
  const pct = Number(bps) / 100;
  if (pct >= 10_000) return `${(pct / 1000).toFixed(1)}k%`;
  if (pct >= 100) return `${pct.toFixed(0)}%`;
  return `${pct.toFixed(2)}%`;
}
