import { useMemo } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { parseAbi, zeroAddress, type Address, type Hex } from "viem";
import deployments from "@deployments/arc-5042.json";
import { arc } from "@/wagmi";
import { V4_STATE_VIEW } from "@/contracts";
import { erc20Abi } from "@/hooks/useArcLend";

const dc = deployments.contracts as Record<string, { address: string } | undefined>;
export const ARCP2P_ADDRESS = dc.ArcP2P?.address as Address | undefined;

export const arcP2PAbi = parseAbi([
  "struct Pricing { uint8 mode; uint256 fixedPrice; int32 spreadBps; uint256 floorPrice; }",
  "struct Pool { bytes32 poolId; bool usdcIs0; uint8 poolUsdcDecimals; }",
  "struct Terms { uint128 minFill; uint40 expiry; address buyer; }",
  "struct Listing { address seller; address token; uint8 tokenDecimals; uint40 createdAt; uint128 remaining; uint128 sold; uint256 proceeds; Pricing pricing; Pool pool; Terms terms; }",
  "function listingCount() view returns (uint256)",
  "function getListing(uint256 id) view returns (Listing)",
  "function getListings(uint256 from, uint256 to) view returns (Listing[])",
  "function listingsOf(address seller) view returns (uint256[])",
  "function price(uint256 id) view returns (uint256 current, uint256 marketRef)",
  "function quote(uint256 id, uint256 amount) view returns (uint256 cost, uint256 fee, uint256 unitPrice)",
  "function amountFor(uint256 id, uint256 usdc) view returns (uint256 amount)",
  "function isActive(uint256 id) view returns (bool)",
  "function feeBps() view returns (uint16)",
  "function pendingPayouts(address) view returns (uint256)",
  "function list(address token, uint256 amount, Pricing pricing, Pool pool, Terms terms) returns (uint256 id)",
  "function update(uint256 id, Pricing pricing, Terms terms)",
  "function topUp(uint256 id, uint256 amount)",
  "function cancel(uint256 id)",
  "function fill(uint256 id, uint256 amount) payable returns (uint256 cost)",
  "function claimPayout()",
  "error ListingNotFound()",
  "error NotSeller()",
  "error NotActive()",
  "error Expired()",
  "error NotAllowedBuyer()",
  "error ZeroAmount()",
  "error ExceedsRemaining(uint256 remaining)",
  "error BelowMinFill(uint256 minFill)",
  "error InsufficientPayment(uint256 cost, uint256 sent)",
  "error BadPrice()",
  "error BadSpread()",
  "error BadPoolDecimals()",
  "error PoolRequired()",
  "error BadExpiry()",
  "error FeeTooHigh()",
  "error NothingToClaim()",
  "error TransferFailed()",
]);

const stateViewAbi = parseAbi([
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
  "function getLiquidity(bytes32 poolId) view returns (uint128 liquidity)",
]);

export const USDC_ERC20 = "0x3600000000000000000000000000000000000000" as Address;
export const BPS = 10_000n;
export const MIN_TWAP_COVERAGE = 10 * 60;

export type Mode = 0 | 1; // Fixed | Market

export type Listing = {
  id: number;
  seller: Address;
  token: Address;
  decimals: number;
  symbol: string;
  name: string;
  createdAt: number;
  remaining: bigint;
  sold: bigint;
  proceeds: bigint;
  mode: Mode;
  fixedPrice: bigint;
  spreadBps: number;
  floorPrice: bigint;
  poolId: Hex;
  usdcIs0: boolean;
  poolUsdcDecimals: number;
  minFill: bigint;
  expiry: number;
  buyer: Address;
  price: bigint; // USDC wei per whole token, right now
  marketRef: bigint; // reference the market price came from (0 for fixed)
  active: boolean;
};

type RawListing = {
  seller: Address; token: Address; tokenDecimals: number; createdAt: number; remaining: bigint; sold: bigint; proceeds: bigint;
  pricing: { mode: number; fixedPrice: bigint; spreadBps: number; floorPrice: bigint };
  pool: { poolId: Hex; usdcIs0: boolean; poolUsdcDecimals: number };
  terms: { minFill: bigint; expiry: number; buyer: Address };
};

/** Every listing with its live price and token metadata. */
export function useListings() {
  const count = useReadContract({ address: ARCP2P_ADDRESS, abi: arcP2PAbi, functionName: "listingCount", chainId: arc.id, query: { enabled: !!ARCP2P_ADDRESS, refetchInterval: 20_000 } });
  const n = Number(count.data ?? 0);
  const pages = useMemo(() => { const out: [bigint, bigint][] = []; for (let i = 0; i < n; i += 100) out.push([BigInt(i), BigInt(Math.min(n, i + 100))]); return out; }, [n]);
  const raw = useReadContracts({
    contracts: pages.map(([a, b]) => ({ address: ARCP2P_ADDRESS!, abi: arcP2PAbi, functionName: "getListings", args: [a, b] }) as const),
    query: { enabled: n > 0, refetchInterval: 15_000 },
  });
  const rows = useMemo(() => (raw.data ?? []).flatMap((r) => (r.result as readonly RawListing[] | undefined) ?? []), [raw.data]);
  const prices = useReadContracts({
    contracts: rows.map((_, i) => ({ address: ARCP2P_ADDRESS!, abi: arcP2PAbi, functionName: "price", args: [BigInt(i)] }) as const),
    query: { enabled: rows.length > 0, refetchInterval: 10_000 },
  });
  const tokens = useMemo(() => Array.from(new Set(rows.map((r) => r.token.toLowerCase()))) as Address[], [rows]);
  const meta = useReadContracts({
    contracts: tokens.flatMap((t) => [{ address: t, abi: erc20Abi, functionName: "symbol" } as const, { address: t, abi: erc20Abi, functionName: "name" } as const]),
    query: { enabled: tokens.length > 0, staleTime: Infinity },
  });
  const now = Math.floor(Date.now() / 1000);

  const listings: Listing[] = useMemo(() => rows.map((r, i) => {
    const ti = tokens.indexOf(r.token.toLowerCase() as Address);
    const p = prices.data?.[i]?.result as readonly [bigint, bigint] | undefined;
    const price = p?.[0] ?? (r.pricing.mode === 0 ? r.pricing.fixedPrice : 0n);
    return {
      id: i, seller: r.seller, token: r.token, decimals: r.tokenDecimals,
      symbol: (meta.data?.[ti * 2]?.result as string) ?? "…", name: (meta.data?.[ti * 2 + 1]?.result as string) ?? "",
      createdAt: Number(r.createdAt), remaining: r.remaining, sold: r.sold, proceeds: r.proceeds,
      mode: r.pricing.mode as Mode, fixedPrice: r.pricing.fixedPrice, spreadBps: Number(r.pricing.spreadBps), floorPrice: r.pricing.floorPrice,
      poolId: r.pool.poolId, usdcIs0: r.pool.usdcIs0, poolUsdcDecimals: r.pool.poolUsdcDecimals,
      minFill: r.terms.minFill, expiry: Number(r.terms.expiry), buyer: r.terms.buyer,
      price, marketRef: p?.[1] ?? 0n,
      active: r.remaining > 0n && (Number(r.terms.expiry) === 0 || Number(r.terms.expiry) >= now),
    } satisfies Listing;
  }), [rows, prices.data, meta.data, tokens, now]);

  return { listings, isLoading: count.isLoading || (n > 0 && raw.isLoading), isError: count.isError || raw.isError, deployed: !!ARCP2P_ADDRESS, refetch: () => { void count.refetch(); void raw.refetch(); void prices.refetch(); } };
}

/** The connected wallet's view of a token: metadata, balance and allowance for ArcP2P. */
export function useTokenInfo(token: Address | undefined) {
  const { address } = useAccount();
  const valid = !!token && /^0x[0-9a-fA-F]{40}$/.test(token);
  const who = address ?? zeroAddress;
  const q = useReadContracts({
    contracts: valid ? [
      { address: token, abi: erc20Abi, functionName: "symbol" } as const,
      { address: token, abi: erc20Abi, functionName: "name" } as const,
      { address: token, abi: erc20Abi, functionName: "decimals" } as const,
      { address: token, abi: erc20Abi, functionName: "balanceOf", args: [who] } as const,
      { address: token, abi: erc20Abi, functionName: "allowance", args: [who, ARCP2P_ADDRESS ?? who] } as const,
    ] : [],
    query: { enabled: valid, refetchInterval: 15_000 },
  });
  const d = q.data as readonly { status: string; result?: unknown }[] | undefined;
  const ok = !!d && d[0]?.status === "success" && d[2]?.status === "success";
  return {
    isLoading: valid && q.isLoading,
    found: ok,
    symbol: ok ? (d[0].result as string) : "",
    name: ok ? ((d[1]?.result as string) ?? "") : "",
    decimals: ok ? Number(d[2].result) : 18,
    balance: ok && address ? ((d[3]?.result as bigint) ?? 0n) : 0n,
    allowance: ok && address ? ((d[4]?.result as bigint) ?? 0n) : 0n,
  };
}

export type PoolCandidate = { poolId: Hex; fee: number; tickSpacing: number; hooks: Address; usdcIs0: boolean; poolUsdcDecimals: number; liquidity: bigint; price: bigint; initialized: boolean };

/** USDC pools for a token (from /api/pools), with live liquidity and spot price, deepest first. */
export function usePoolsFor(token: Address | undefined, tokenDecimals: number) {
  const valid = !!token && /^0x[0-9a-fA-F]{40}$/.test(token);
  const found = useQuery({
    queryKey: ["p2p-pools", token?.toLowerCase()],
    queryFn: async () => {
      const r = await fetch(`/api/pools?token=${token}`);
      const j = (await r.json()) as { pools?: Omit<PoolCandidate, "liquidity" | "price" | "initialized">[]; error?: string };
      if (!r.ok || !j.pools) throw new Error(j.error || "Pool lookup failed.");
      return j.pools;
    },
    enabled: valid,
    staleTime: 10 * 60_000,
    retry: 1,
  });
  const pools = found.data ?? [];
  const live = useReadContracts({
    contracts: pools.flatMap((p) => [
      { address: V4_STATE_VIEW, abi: stateViewAbi, functionName: "getLiquidity", args: [p.poolId] } as const,
      { address: V4_STATE_VIEW, abi: stateViewAbi, functionName: "getSlot0", args: [p.poolId] } as const,
    ]),
    query: { enabled: pools.length > 0, refetchInterval: 30_000 },
  });
  const candidates: PoolCandidate[] = useMemo(() => pools.map((p, i) => {
    const liq = (live.data?.[i * 2]?.result as bigint | undefined) ?? 0n;
    const slot = live.data?.[i * 2 + 1]?.result as readonly [bigint, number, number, number] | undefined;
    const sqrt = slot?.[0] ?? 0n;
    return { ...p, liquidity: liq, initialized: sqrt > 0n, price: sqrt > 0n ? priceFromSqrt(sqrt, p.usdcIs0, tokenDecimals, p.poolUsdcDecimals) : 0n };
  }).filter((p) => p.initialized).sort((a, b) => (b.liquidity > a.liquidity ? 1 : b.liquidity < a.liquidity ? -1 : 0)), [pools, live.data, tokenDecimals]);
  // the deepest pool with a sane LP fee; a 50% fee pool is a trap, not a market
  const best = candidates.find((p) => p.fee <= 100_000) ?? candidates[0];
  return { candidates, best, isLoading: found.isLoading || (pools.length > 0 && live.isLoading), error: found.error ? (found.error as Error).message : "" };
}

/** The connected wallet's own listings and any USDC waiting to be claimed. */
export function useMyListings(all: Listing[]) {
  const { address } = useAccount();
  const ids = useReadContract({ address: ARCP2P_ADDRESS, abi: arcP2PAbi, functionName: "listingsOf", args: address ? [address] : undefined, chainId: arc.id, query: { enabled: !!ARCP2P_ADDRESS && !!address, refetchInterval: 15_000 } });
  const pending = useReadContract({ address: ARCP2P_ADDRESS, abi: arcP2PAbi, functionName: "pendingPayouts", args: address ? [address] : undefined, chainId: arc.id, query: { enabled: !!ARCP2P_ADDRESS && !!address, refetchInterval: 15_000 } });
  const mine = useMemo(() => ((ids.data as readonly bigint[] | undefined) ?? []).map((i) => all[Number(i)]).filter(Boolean), [ids.data, all]);
  return { mine, pending: (pending.data as bigint | undefined) ?? 0n };
}

// ---------- pure helpers ----------

const Q96 = 1n << 96n;

/** USDC wei (18 dec) per whole token from a v4 sqrtPriceX96, mirroring ArcTwapOracle.priceFromSqrt. */
export function priceFromSqrt(sqrtP: bigint, usdcIs0: boolean, tokenDecimals: number, poolUsdcDecimals: number): bigint {
  const scale = 10n ** BigInt(tokenDecimals) * 10n ** BigInt(18 - poolUsdcDecimals);
  if (usdcIs0) return (Q96 * Q96 * scale) / (sqrtP * sqrtP);
  return (sqrtP * sqrtP * scale) / (Q96 * Q96);
}

/** USDC cost (wei) for `amount` token units at `price`, rounded up like the contract. */
export const costOf = (amount: bigint, price: bigint, decimals: number) => { const d = 10n ** BigInt(decimals); return (amount * price + d - 1n) / d; };
export const amountForUsdc = (usdc: bigint, price: bigint, decimals: number) => (price === 0n ? 0n : (usdc * 10n ** BigInt(decimals)) / price);

/** Percent above (+) or below (−) the market reference the current price sits, or undefined when unknown. */
export function vsMarket(l: Listing, market: bigint | undefined): number | undefined {
  const ref = l.mode === 1 ? l.marketRef : market;
  if (!ref || ref === 0n || l.price === 0n) return undefined;
  return (Number(l.price) / Number(ref) - 1) * 100;
}

export const fmtSpread = (bps: number) => (bps === 0 ? "at market" : bps < 0 ? `${(-bps / 100).toFixed(bps % 100 ? 2 : 0)}% below market` : `${(bps / 100).toFixed(bps % 100 ? 2 : 0)}% above market`);
