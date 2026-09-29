import { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import type { Address, Hex } from "viem";
import { POSITIONS_ADDRESS, VAULT_V2_ADDRESS, positionsAbi, vaultV2Abi, type FlowStrategy, type PoolKey } from "@/contracts";

const vault = { address: VAULT_V2_ADDRESS as Address, abi: vaultV2Abi } as const;
const positions = { address: POSITIONS_ADDRESS as Address, abi: positionsAbi } as const;
const vaultOn = !!VAULT_V2_ADDRESS;
const posOn = !!POSITIONS_ADDRESS;

export const WIDTHS = [
  { id: 0, name: "Tight", approx: "±10%", ticks: 1000, blurb: "Most fees per dollar. Leaves the band soonest." },
  { id: 1, name: "Medium", approx: "±25%", ticks: 2200, blurb: "A balance of fee income and staying in range." },
  { id: 2, name: "Wide", approx: "±49%", ticks: 4000, blurb: "Fewer fees per dollar. Rarely needs a rebalance." },
] as const;

export const SHAPES = [
  { id: 0, name: "Spot", blurb: "One even range around the price. Simple and efficient." },
  { id: 1, name: "Curve", blurb: "Densest at the price, thinning toward the edges. Best when the price stays put." },
  { id: 2, name: "Bid-ask", blurb: "Heaviest at the edges, thin in the middle. Earns on swings between two levels." },
] as const;

export const RANGE_PRESETS = [
  { label: "±5%", ticks: 500 },
  { label: "±10%", ticks: 1000 },
  { label: "±25%", ticks: 2200 },
  { label: "±50%", ticks: 4000 },
] as const;

// ---------- price helpers ----------

/** USDC price of one whole token at `tick`. Raw pool price is currency1 per currency0. */
export function tickToUsdcPrice(tick: number, usdcIs0: boolean, tokenDecimals: number): number {
  const raw = Math.pow(1.0001, tick); // currency1 wei per currency0 wei
  // usdcIs0: raw = tokenWei per usdcWei  -> price = 1/raw * 10^(tokenDec-6)
  // else:    raw = usdcWei per tokenWei  -> price = raw * 10^(tokenDec-6)
  const scale = Math.pow(10, tokenDecimals - 6);
  return usdcIs0 ? scale / raw : raw * scale;
}

export function fmtPrice(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "—";
  if (n >= 1) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toPrecision(3)}`;
}

/** Band edges as [lowPrice, highPrice] in USDC per token, whichever way the pool is ordered. */
export function bandPrices(tickLower: number, tickUpper: number, usdcIs0: boolean, tokenDecimals: number): [number, number] {
  const a = tickToUsdcPrice(tickLower, usdcIs0, tokenDecimals);
  const b = tickToUsdcPrice(tickUpper, usdcIs0, tokenDecimals);
  return a < b ? [a, b] : [b, a];
}

// ---------- Stakes v2 ----------

export function useStrategyIds(key?: PoolKey) {
  const q = useReadContracts({
    contracts: key ? WIDTHS.map((w) => ({ ...vault, functionName: "strategyIdFor" as const, args: [key, w.id] as const })) : [],
    allowFailure: false,
    query: { enabled: vaultOn && !!key, staleTime: Infinity },
  });
  return q.data as readonly Hex[] | undefined;
}

/** Everything the stake panel needs for one (pool, width), in one multicall. */
export function useStrategy(key?: PoolKey, width?: number, sid?: Hex, user?: Address) {
  const enabled = vaultOn && !!key && width !== undefined && !!sid;
  const q = useReadContracts({
    contracts: enabled
      ? [
          { ...vault, functionName: "strategyInfo" as const, args: [sid!] as const },
          { ...vault, functionName: "strategyState" as const, args: [sid!] as const },
          { ...vault, functionName: "bandFor" as const, args: [key!, width!] as const },
          { ...vault, functionName: "userState" as const, args: [sid!, (user ?? VAULT_V2_ADDRESS) as Address] as const },
        ]
      : [],
    allowFailure: true,
    query: { enabled, refetchInterval: 12_000 },
  });
  const d = q.data as Array<{ status: string; result?: unknown }> | undefined;
  const ok = (i: number) => (d?.[i]?.status === "success" ? d[i].result : undefined);
  const info = ok(0) as FlowStrategy | undefined;
  const state = ok(1) as readonly [boolean, number, bigint, bigint, bigint] | undefined;
  const band = ok(2) as readonly [number, number, boolean] | undefined;
  const me = user ? (ok(3) as readonly [bigint, bigint, bigint, bigint, bigint] | undefined) : undefined;
  return {
    ...q,
    info: info?.exists ? info : undefined,
    exists: !!info?.exists,
    inRange: state?.[0],
    tick: state?.[1],
    tvlUsdc: state?.[2],
    aprBps: state?.[3],
    streamRemaining: state?.[4],
    tickLower: band?.[0],
    tickUpper: band?.[1],
    shares: me?.[0],
    amount0: me?.[1],
    amount1: me?.[2],
    valueUsdc: me?.[3],
    pending: me?.[4],
  };
}

export function useVaultV2Params() {
  const q = useReadContracts({
    contracts: [
      { ...vault, functionName: "capUsdc" as const },
      { ...vault, functionName: "bountyBps" as const },
      { ...vault, functionName: "depositsPaused" as const },
    ],
    allowFailure: false,
    query: { enabled: vaultOn, staleTime: 60_000 },
  });
  const d = q.data as readonly [bigint, bigint, boolean] | undefined;
  return { capUsdc: d?.[0], bountyBps: d?.[1], paused: d?.[2] };
}

// ---------- Pools (shaped positions) ----------

export type LegSpec = { tickLower: number; tickUpper: number; weight: number };
export type Leg = { tickLower: number; tickUpper: number; liquidity: bigint };
export type FlowPosition = { owner: Address; poolId: Hex; shape: number; createdAt: bigint; lockedUntil: bigint; closed: boolean };

export function usePreviewLegs(key?: PoolKey, shape?: number, halfWidthTicks?: number) {
  const q = useReadContract({
    ...positions,
    functionName: "previewLegs",
    args: [key as PoolKey, shape ?? 0, halfWidthTicks ?? 1000],
    query: { enabled: posOn && !!key && shape !== undefined && !!halfWidthTicks, refetchInterval: 30_000 },
  });
  return q.data as readonly LegSpec[] | undefined;
}

export function usePositionLockFee() {
  return useReadContract({ ...positions, functionName: "lockFee", query: { enabled: posOn, staleTime: 60_000 } });
}

export function useMyPositionIds(user?: Address) {
  return useReadContract({
    ...positions,
    functionName: "positionsOf",
    args: [(user ?? POSITIONS_ADDRESS) as Address],
    query: { enabled: posOn && !!user, refetchInterval: 20_000 },
  });
}

export type PositionRow = {
  id: bigint;
  p: FlowPosition;
  key: PoolKey;
  legs: readonly Leg[];
  amount0: bigint;
  amount1: bigint;
  inRange: boolean;
  fees0: bigint;
  fees1: bigint;
};

/** Full detail for a list of position ids: info, principal at spot, and uncollected fees. */
export function usePositions(ids?: readonly bigint[]) {
  const keyStr = ids?.map(String).join(",") ?? "";
  const contracts = useMemo(
    () =>
      (ids ?? []).flatMap((id) => [
        { ...positions, functionName: "positionInfo" as const, args: [id] as const },
        { ...positions, functionName: "positionAmounts" as const, args: [id] as const },
        { ...positions, functionName: "pendingFees" as const, args: [id] as const },
      ]),
    [keyStr], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const q = useReadContracts({ contracts, allowFailure: true, query: { enabled: posOn && contracts.length > 0, refetchInterval: 15_000 } });
  const rows = useMemo<PositionRow[]>(() => {
    const d = q.data as Array<{ status: string; result?: unknown }> | undefined;
    if (!d || !ids) return [];
    const out: PositionRow[] = [];
    ids.forEach((id, i) => {
      const info = d[i * 3];
      if (info?.status !== "success") return;
      const [p, key, legs] = info.result as readonly [FlowPosition, PoolKey, readonly Leg[]];
      const am = d[i * 3 + 1]?.status === "success" ? (d[i * 3 + 1].result as readonly [bigint, bigint, boolean]) : ([0n, 0n, false] as const);
      const fe = d[i * 3 + 2]?.status === "success" ? (d[i * 3 + 2].result as readonly [bigint, bigint]) : ([0n, 0n] as const);
      out.push({ id, p, key: { ...key, fee: Number(key.fee), tickSpacing: Number(key.tickSpacing) }, legs, amount0: am[0], amount1: am[1], inRange: am[2], fees0: fe[0], fees1: fe[1] });
    });
    return out;
  }, [q.data, ids]);
  return { ...q, rows };
}

export function useLockedPositionIds(limit = 100) {
  const q = useReadContract({ ...positions, functionName: "lockedPositionIds", args: [0n, BigInt(limit)], query: { enabled: posOn, refetchInterval: 30_000 } });
  const d = q.data as readonly [readonly bigint[], bigint] | undefined;
  return { ...q, ids: d?.[0], total: d?.[1] };
}
