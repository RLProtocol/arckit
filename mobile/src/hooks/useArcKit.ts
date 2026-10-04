import { useQuery } from "@tanstack/react-query";
import { type Address, type Hex } from "viem";
import { ADDR, KNOWN_TOKENS, publicClient, SITE } from "../chain";
import { arcLendAbi, arcP2PAbi, erc20Abi } from "../contracts";

// ---------------------------------------------------------------- ArcP2P

export type Listing = {
  id: number; seller: Address; token: Address; decimals: number; symbol: string; createdAt: number;
  remaining: bigint; sold: bigint; proceeds: bigint; mode: 0 | 1; fixedPrice: bigint; spreadBps: number; floorPrice: bigint; dumpProtection: boolean;
  poolId: Hex; usdcIs0: boolean; poolUsdcDecimals: number; minFill: bigint; expiry: number; buyer: Address; price: bigint; marketRef: bigint; active: boolean;
};

type Raw = { seller: Address; token: Address; tokenDecimals: number; createdAt: number; remaining: bigint; sold: bigint; proceeds: bigint; pricing: { mode: number; fixedPrice: bigint; spreadBps: number; floorPrice: bigint; dumpProtection: boolean }; pool: { poolId: Hex; usdcIs0: boolean; poolUsdcDecimals: number }; terms: { minFill: bigint; expiry: number; buyer: Address } };

export function useListings() {
  return useQuery({
    queryKey: ["p2p-listings"],
    enabled: !!ADDR.p2p,
    refetchInterval: 12_000,
    queryFn: async (): Promise<Listing[]> => {
      const n = Number(await publicClient.readContract({ address: ADDR.p2p, abi: arcP2PAbi, functionName: "listingCount" }));
      if (n === 0) return [];
      const rows: Raw[] = [];
      for (let i = 0; i < n; i += 100) rows.push(...((await publicClient.readContract({ address: ADDR.p2p, abi: arcP2PAbi, functionName: "getListings", args: [BigInt(i), BigInt(Math.min(n, i + 100))] })) as unknown as Raw[]));
      const tokens = Array.from(new Set(rows.map((r) => r.token.toLowerCase()))) as Address[];
      const [prices, syms] = await Promise.all([
        publicClient.multicall({ contracts: rows.map((_, i) => ({ address: ADDR.p2p, abi: arcP2PAbi, functionName: "price", args: [BigInt(i)] }) as const), allowFailure: true }),
        publicClient.multicall({ contracts: tokens.map((t) => ({ address: t, abi: erc20Abi, functionName: "symbol" }) as const), allowFailure: true }),
      ]);
      const now = Math.floor(Date.now() / 1000);
      return rows.map((r, i) => {
        const p = prices[i].result as readonly [bigint, bigint] | undefined;
        const known = KNOWN_TOKENS.find((k) => k.address.toLowerCase() === r.token.toLowerCase());
        const sym = known?.symbol ?? ((syms[tokens.indexOf(r.token.toLowerCase() as Address)]?.result as string | undefined) ?? "TOKEN");
        return {
          id: i, seller: r.seller, token: r.token, decimals: r.tokenDecimals, symbol: sym, createdAt: Number(r.createdAt), remaining: r.remaining, sold: r.sold, proceeds: r.proceeds,
          mode: r.pricing.mode as 0 | 1, fixedPrice: r.pricing.fixedPrice, spreadBps: Number(r.pricing.spreadBps), floorPrice: r.pricing.floorPrice, dumpProtection: r.pricing.dumpProtection,
          poolId: r.pool.poolId, usdcIs0: r.pool.usdcIs0, poolUsdcDecimals: r.pool.poolUsdcDecimals, minFill: r.terms.minFill, expiry: Number(r.terms.expiry), buyer: r.terms.buyer,
          price: p?.[0] ?? (r.pricing.mode === 0 ? r.pricing.fixedPrice : 0n), marketRef: p?.[1] ?? 0n,
          active: r.remaining > 0n && (Number(r.terms.expiry) === 0 || Number(r.terms.expiry) >= now),
        };
      });
    },
  });
}

export type PoolCandidate = { poolId: Hex; fee: number; usdcIs0: boolean; poolUsdcDecimals: number; liquidity: bigint; price: bigint };

const stateViewAbi = [
  { type: "function", name: "getSlot0", stateMutability: "view", inputs: [{ name: "poolId", type: "bytes32" }], outputs: [{ type: "uint160" }, { type: "int24" }, { type: "uint24" }, { type: "uint24" }] },
  { type: "function", name: "getLiquidity", stateMutability: "view", inputs: [{ name: "poolId", type: "bytes32" }], outputs: [{ type: "uint128" }] },
] as const;
const STATE_VIEW = "0xf3334192d15450cdd385c8b70e03f9a6bd9e673b" as Address;
const Q96 = 1n << 96n;
export function priceFromSqrt(sqrtP: bigint, usdcIs0: boolean, tokenDecimals: number, poolUsdcDecimals: number): bigint {
  const scale = 10n ** BigInt(tokenDecimals) * 10n ** BigInt(18 - poolUsdcDecimals);
  return usdcIs0 ? (Q96 * Q96 * scale) / (sqrtP * sqrtP) : (sqrtP * sqrtP * scale) / (Q96 * Q96);
}

/** The token's USDC pools from the site's indexer, with live liquidity; deepest sane-fee pool first. */
export function usePoolsFor(token: Address | undefined, decimals: number) {
  return useQuery({
    queryKey: ["pools", token?.toLowerCase(), decimals],
    enabled: !!token,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<PoolCandidate[]> => {
      const r = await fetch(`${SITE}/api/pools?token=${token}`);
      const j = (await r.json()) as { pools?: { poolId: Hex; fee: number; usdcIs0: boolean; poolUsdcDecimals: number }[] };
      const pools = j.pools ?? [];
      if (!pools.length) return [];
      const live = await publicClient.multicall({ contracts: pools.flatMap((p) => [{ address: STATE_VIEW, abi: stateViewAbi, functionName: "getLiquidity", args: [p.poolId] } as const, { address: STATE_VIEW, abi: stateViewAbi, functionName: "getSlot0", args: [p.poolId] } as const]), allowFailure: true });
      return pools
        .map((p, i) => { const liq = (live[i * 2].result as bigint | undefined) ?? 0n; const slot = live[i * 2 + 1].result as readonly [bigint, number, number, number] | undefined; const sqrt = slot?.[0] ?? 0n; return { ...p, liquidity: liq, price: sqrt > 0n ? priceFromSqrt(sqrt, p.usdcIs0, decimals, p.poolUsdcDecimals) : 0n }; })
        .filter((p) => p.price > 0n)
        .sort((a, b) => (a.fee <= 100_000) === (b.fee <= 100_000) ? (b.liquidity > a.liquidity ? 1 : -1) : a.fee <= 100_000 ? -1 : 1);
    },
  });
}

// ---------------------------------------------------------------- ArcLend

export type Market = { id: number; token: Address; symbol: string; decimals: number; price: bigint; cash: bigint; totalBorrows: bigint; reserves: bigint; available: bigint; supplyCap: bigint; borrowCap: bigint; ltvBps: number; liqThresholdBps: number; borrowAprBps: number; supplyAprBps: number; utilBps: number; borrowsPaused: boolean };

export function useMarkets() {
  return useQuery({
    queryKey: ["lend-markets"],
    enabled: !!ADDR.lend,
    refetchInterval: 20_000,
    queryFn: async (): Promise<Market[]> => {
      const n = Number(await publicClient.readContract({ address: ADDR.lend, abi: arcLendAbi, functionName: "marketCount" }));
      const ids = Array.from({ length: n }, (_, i) => BigInt(i));
      const res = await publicClient.multicall({
        contracts: ids.flatMap((id) => [{ address: ADDR.lend, abi: arcLendAbi, functionName: "getMarket", args: [id] } as const, { address: ADDR.lend, abi: arcLendAbi, functionName: "rates", args: [id] } as const, { address: ADDR.lend, abi: arcLendAbi, functionName: "priceOf", args: [id] } as const]),
        allowFailure: true,
      });
      return ids.map((id, i) => {
        const m = res[i * 3].result as { token: Address; tokenDecimals: number; borrowsPaused: boolean; cash: bigint; totalBorrows: bigint; reserves: bigint; risk: { ltvBps: number; liqThresholdBps: number; supplyCap: bigint; borrowCap: bigint } };
        const r = res[i * 3 + 1].result as readonly [bigint, bigint, bigint] | undefined;
        const p = res[i * 3 + 2].result as readonly [bigint, bigint, number] | undefined;
        const known = KNOWN_TOKENS.find((k) => k.address.toLowerCase() === m.token.toLowerCase());
        return { id: Number(id), token: m.token, symbol: known?.symbol ?? `Market ${id}`, decimals: m.tokenDecimals, price: p?.[0] ?? 0n, cash: m.cash, totalBorrows: m.totalBorrows, reserves: m.reserves, available: m.cash > m.reserves ? m.cash - m.reserves : 0n, supplyCap: m.risk.supplyCap, borrowCap: m.risk.borrowCap, ltvBps: m.risk.ltvBps, liqThresholdBps: m.risk.liqThresholdBps, borrowAprBps: Number(r?.[0] ?? 0n), supplyAprBps: Number(r?.[1] ?? 0n), utilBps: Number(r?.[2] ?? 0n), borrowsPaused: m.borrowsPaused };
      });
    },
  });
}

export type Position = { supplyShares: bigint; supplied: bigint; collateral: bigint; debt: bigint; health: bigint; tokenBalance: bigint; allowance: bigint };
export function usePosition(m: Market | undefined, address?: Address) {
  return useQuery({
    queryKey: ["lend-position", m?.id, address],
    enabled: !!m && !!address,
    refetchInterval: 15_000,
    queryFn: async (): Promise<Position> => {
      const id = BigInt(m!.id);
      const r = await publicClient.multicall({
        contracts: [
          { address: ADDR.lend, abi: arcLendAbi, functionName: "getAccount", args: [id, address!] },
          { address: ADDR.lend, abi: arcLendAbi, functionName: "supplyBalanceOf", args: [id, address!] },
          { address: ADDR.lend, abi: arcLendAbi, functionName: "debtOf", args: [id, address!] },
          { address: ADDR.lend, abi: arcLendAbi, functionName: "healthFactor", args: [id, address!] },
          { address: m!.token, abi: erc20Abi, functionName: "balanceOf", args: [address!] },
          { address: m!.token, abi: erc20Abi, functionName: "allowance", args: [address!, ADDR.lend] },
        ],
        allowFailure: false,
      });
      const acct = r[0] as { supplyShares: bigint; collateral: bigint };
      return { supplyShares: acct.supplyShares, supplied: r[1] as bigint, collateral: acct.collateral, debt: r[2] as bigint, health: r[3] as bigint, tokenBalance: r[4] as bigint, allowance: r[5] as bigint };
    },
  });
}

// ---------------------------------------------------------------- activity

export type Activity = { hash: Hex; ts: number; from: Address; to: Address; value: bigint; token?: { symbol: string; decimals: number; address: Address }; fn: string; ok: boolean };
export function useActivity(address?: Address) {
  return useQuery({
    queryKey: ["activity", address],
    enabled: !!address,
    refetchInterval: 30_000,
    queryFn: async (): Promise<Activity[]> => {
      const r = await fetch(`${SITE}/api/activity?address=${address}`);
      if (!r.ok) throw new Error("Could not load activity.");
      const j = (await r.json()) as { items: { hash: Hex; ts: number; from: Address; to: Address; value: string; token?: { symbol: string; decimals: number; address: Address }; fn: string; ok: boolean }[] };
      return j.items.map((it) => ({ ...it, value: BigInt(it.value) }));
    },
  });
}
