import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useReadContract, useReadContracts } from "wagmi";
import type { Address, Hex } from "viem";
import { ARCFLOW_ADDRESS, ARC_USDC, V4_POSITION_MANAGER, V4_STATE_VIEW, arcflowAbi, v4PositionManagerAbi, v4StateViewAbi, type PoolKey } from "@/contracts";

const vaultC = { address: ARCFLOW_ADDRESS as Address, abi: arcflowAbi } as const;
const enabledVault = !!ARCFLOW_ADDRESS;

// ---------- DexScreener: discover v4 USDC pools on Arc ----------

export type DexPool = {
  poolId: Hex;
  base: { symbol: string; name: string; address: Address };
  quote: { symbol: string; address: Address };
  liquidityUsd: number;
  volume24h: number;
  priceUsd: number;
  priceChange24h: number;
  txns24h: number;
  fdv: number;
  imageUrl?: string;
  url: string;
};

/** DexScreener's embeddable chart for a pool. */
export function dexChartUrl(poolId: Hex, theme: "dark" | "light" = "dark") {
  return `https://dexscreener.com/arc/${poolId}?embed=1&loadChartSettings=0&trades=0&tabs=0&info=0&chartLeftToolbar=0&chartTheme=${theme}&theme=${theme}&chartStyle=1&chartType=usd&interval=15`;
}

type DsPair = {
  chainId: string;
  dexId: string;
  labels?: string[];
  pairAddress: string;
  baseToken: { symbol: string; name: string; address: string };
  quoteToken: { symbol: string; address: string };
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  priceChange?: { h24?: number };
  txns?: { h24?: { buys?: number; sells?: number } };
  fdv?: number;
  info?: { imageUrl?: string };
  priceUsd?: string;
  url: string;
};

function toDexPool(p: DsPair): DexPool | null {
  if (p.chainId !== "arc" || p.dexId !== "uniswap" || !(p.labels ?? []).includes("v4")) return null;
  const q = p.quoteToken.address.toLowerCase();
  const b = p.baseToken.address.toLowerCase();
  const usdc = ARC_USDC.toLowerCase();
  if (q !== usdc && b !== usdc) return null;
  // Normalise so `base` is the non-USDC side.
  const base = q === usdc ? p.baseToken : p.quoteToken;
  const quote = q === usdc ? p.quoteToken : p.baseToken;
  return {
    poolId: p.pairAddress as Hex,
    base: { symbol: base.symbol, name: (base as { name?: string }).name ?? base.symbol, address: base.address as Address },
    quote: { symbol: quote.symbol, address: quote.address as Address },
    liquidityUsd: p.liquidity?.usd ?? 0,
    volume24h: p.volume?.h24 ?? 0,
    priceUsd: Number(p.priceUsd ?? 0),
    priceChange24h: p.priceChange?.h24 ?? 0,
    txns24h: (p.txns?.h24?.buys ?? 0) + (p.txns?.h24?.sells ?? 0),
    fdv: p.fdv ?? 0,
    imageUrl: p.info?.imageUrl,
    url: p.url,
  };
}

/** Pools for a token address, or a keyword search when `q` is not an address. */
export function useDexPools(q: string) {
  const isAddr = /^0x[0-9a-fA-F]{40}$/.test(q);
  return useQuery({
    queryKey: ["dexscreener", q.toLowerCase()],
    enabled: q.length >= 2,
    staleTime: 60_000,
    queryFn: async (): Promise<DexPool[]> => {
      const url = isAddr
        ? `https://api.dexscreener.com/latest/dex/tokens/${q}`
        : `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q + " arc")}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`DexScreener ${r.status}`);
      const j = (await r.json()) as { pairs?: DsPair[] };
      const pools = (j.pairs ?? []).map(toDexPool).filter((x): x is DexPool => !!x);
      // De-dupe by pool id, best liquidity first
      const seen = new Set<string>();
      return pools
        .sort((a, b) => b.liquidityUsd - a.liquidityUsd)
        .filter((p) => (seen.has(p.poolId) ? false : (seen.add(p.poolId), true)));
    },
  });
}

/** Trending v4 USDC pools on Arc (DexScreener search, top by liquidity). */
export function useTrendingPools() {
  return useDexPools("usdc");
}

// ---------- On-chain pool facts ----------

export function usePoolKey(poolId?: Hex) {
  const q = useReadContract({
    address: V4_POSITION_MANAGER,
    abi: v4PositionManagerAbi,
    functionName: "poolKeys",
    args: [(poolId ? (poolId.slice(0, 52) as Hex) : "0x0000000000000000000000000000000000000000000000000000") as Hex],
    query: { enabled: !!poolId, staleTime: Infinity },
  });
  const key = useMemo<PoolKey | undefined>(() => {
    if (!q.data) return undefined;
    const [currency0, currency1, fee, tickSpacing, hooks] = q.data;
    if (currency0 === "0x0000000000000000000000000000000000000000" && currency1 === "0x0000000000000000000000000000000000000000") return undefined;
    return { currency0, currency1, fee: Number(fee), tickSpacing: Number(tickSpacing), hooks };
  }, [q.data]);
  return { ...q, key };
}

export function usePoolState(poolId?: Hex) {
  return useReadContracts({
    contracts: poolId
      ? [
          { address: V4_STATE_VIEW, abi: v4StateViewAbi, functionName: "getSlot0", args: [poolId] },
          { address: V4_STATE_VIEW, abi: v4StateViewAbi, functionName: "getLiquidity", args: [poolId] },
        ]
      : [],
    allowFailure: true,
    query: { enabled: !!poolId, refetchInterval: 20_000 },
  });
}

/** Decode hook permission flags from the low 14 bits of the hook address. */
export function hookFlags(hooks: Address): string[] {
  const names = [
    "afterRemoveLiquidityReturnDelta",
    "afterAddLiquidityReturnDelta",
    "afterSwapReturnDelta",
    "beforeSwapReturnDelta",
    "afterDonate",
    "beforeDonate",
    "afterRemoveLiquidity",
    "beforeRemoveLiquidity",
    "afterAddLiquidity",
    "beforeAddLiquidity",
    "afterSwap",
    "beforeSwap",
    "afterInitialize",
    "beforeInitialize",
  ];
  const f = Number(BigInt(hooks) & 0x3fffn);
  return names.filter((_, i) => f & (1 << i));
}

// ---------- Vault reads ----------

export function useVaultPool(poolId?: Hex) {
  return useReadContract({
    ...vaultC,
    functionName: "poolInfo",
    args: [poolId ?? ("0x" + "0".repeat(64)) as Hex],
    query: { enabled: enabledVault && !!poolId, refetchInterval: 20_000 },
  });
}

export function useVaultUser(poolId?: Hex, user?: Address) {
  const q = useReadContracts({
    contracts:
      poolId && user
        ? [
            { ...vaultC, functionName: "positionOf", args: [poolId, user] },
            { ...vaultC, functionName: "pendingRewards", args: [poolId, user] },
            { ...vaultC, functionName: "streamInfo", args: [poolId] },
          ]
        : [],
    allowFailure: true,
    query: { enabled: enabledVault && !!poolId && !!user, refetchInterval: 10_000 },
  });
  const d = q.data as Array<{ status: string; result?: unknown }> | undefined;
  const pos = d?.[0]?.status === "success" ? (d[0].result as readonly [bigint, bigint, bigint]) : undefined;
  const pending = d?.[1]?.status === "success" ? (d[1].result as bigint) : undefined;
  const stream = d?.[2]?.status === "success" ? (d[2].result as readonly [bigint, bigint, bigint]) : undefined;
  return {
    ...q,
    shares: pos?.[0],
    amount0: pos?.[1],
    amount1: pos?.[2],
    pending,
    rewardRate: stream?.[0],
    periodFinish: stream?.[1],
    remainingUsdc: stream?.[2],
  };
}

export function usePreviewStake(key?: PoolKey, usdcAmount?: bigint) {
  return useReadContract({
    ...vaultC,
    functionName: "previewStakeUsdc",
    args: [key ?? { currency0: ARC_USDC, currency1: ARC_USDC, fee: 0, tickSpacing: 1, hooks: ARC_USDC }, usdcAmount ?? 0n],
    query: { enabled: enabledVault && !!key && !!usdcAmount && usdcAmount > 0n, refetchInterval: 15_000 },
  });
}

/** All pools the vault has ever seen, with the connected user's shares in each. */
export function useVaultPools(user?: Address) {
  const count = useReadContract({ ...vaultC, functionName: "poolCount", query: { enabled: enabledVault, refetchInterval: 30_000 } });
  const n = Number(count.data ?? 0n);
  const idCalls = useMemo(() => Array.from({ length: n }, (_, i) => ({ ...vaultC, functionName: "poolList" as const, args: [BigInt(i)] as const })), [n]);
  const ids = useReadContracts({ contracts: idCalls, allowFailure: false, query: { enabled: enabledVault && n > 0 } });
  const idList = (ids.data as Hex[] | undefined) ?? [];
  const infoCalls = useMemo(
    () =>
      idList.flatMap((id) => [
        { ...vaultC, functionName: "poolInfo" as const, args: [id] as const },
        ...(user ? [{ ...vaultC, functionName: "shares" as const, args: [id, user] as const }] : []),
      ]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idList.join(","), user],
  );
  const infos = useReadContracts({ contracts: infoCalls, allowFailure: true, query: { enabled: enabledVault && idList.length > 0, refetchInterval: 30_000 } });
  const rows = useMemo(() => {
    const d = infos.data as Array<{ status: string; result?: unknown }> | undefined;
    if (!d) return [];
    const stride = user ? 2 : 1;
    return idList.map((id, i) => {
      const info = d[i * stride]?.status === "success" ? (d[i * stride].result as { key: PoolKey; totalShares: bigint; totalFeesUsdc: bigint; rewardRate: bigint; periodFinish: bigint; usdcIs0: boolean }) : undefined;
      const userShares = user && d[i * stride + 1]?.status === "success" ? (d[i * stride + 1].result as bigint) : 0n;
      return { id, info, userShares };
    });
  }, [infos.data, idList, user]);
  return { rows, isLoading: count.isLoading || ids.isLoading || infos.isLoading };
}
