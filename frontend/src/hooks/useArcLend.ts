import { useMemo } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { parseAbi, type Address } from "viem";
import deployments from "@deployments/arc-5042.json";
import { arc } from "@/wagmi";

const dc = deployments.contracts as Record<string, { address: string } | undefined>;
export const ARCLEND_ADDRESS = dc.ArcLend?.address as Address | undefined;
export const ARCLEND_ORACLE = dc.ArcTwapOracle?.address as Address | undefined;

export const arcLendAbi = parseAbi([
  "struct RiskParams { uint16 ltvBps; uint16 liqThresholdBps; uint16 liqBonusBps; uint16 reserveFactorBps; uint16 baseRateBps; uint16 slope1Bps; uint16 slope2Bps; uint16 kinkBps; uint256 supplyCap; uint256 borrowCap; }",
  "struct Market { address token; uint8 tokenDecimals; uint8 poolUsdcDecimals; bool usdcIs0; bool borrowsPaused; bytes32 poolId; RiskParams risk; uint256 totalSupplyShares; uint256 cash; uint256 totalBorrows; uint256 borrowIndex; uint64 lastAccrual; uint256 reserves; uint256 totalCollateral; }",
  "struct Account { uint256 supplyShares; uint256 collateral; uint256 borrowPrincipal; uint256 borrowIndexSnapshot; }",
  "function marketCount() view returns (uint256)",
  "function getMarket(uint256 id) view returns (Market)",
  "function getAccount(uint256 id, address user) view returns (Account)",
  "function debtOf(uint256 id, address user) view returns (uint256)",
  "function supplyBalanceOf(uint256 id, address user) view returns (uint256)",
  "function healthFactor(uint256 id, address user) view returns (uint256)",
  "function rates(uint256 id) view returns (uint256 borrowAprBps, uint256 supplyAprBps, uint256 utilBps)",
  "function priceOf(uint256 id) view returns (uint256 twap, uint256 spotPrice, uint32 covered)",
  "function supply(uint256 id) payable returns (uint256 shares)",
  "function withdraw(uint256 id, uint256 shares) returns (uint256 amount)",
  "function depositCollateral(uint256 id, uint256 amount)",
  "function withdrawCollateral(uint256 id, uint256 amount)",
  "function borrow(uint256 id, uint256 amount)",
  "function repay(uint256 id, address borrower) payable returns (uint256 repaid)",
  "function liquidate(uint256 id, address borrower) payable returns (uint256 repaid, uint256 seized)",
  "function poke(uint256 id)",
  "error MarketNotFound()",
  "error ZeroAmount()",
  "error SupplyCapReached()",
  "error BorrowCapReached()",
  "error BorrowsArePaused()",
  "error InsufficientLiquidity()",
  "error InsufficientShares()",
  "error InsufficientCollateral()",
  "error ExceedsBorrowLimit()",
  "error NotLiquidatable()",
  "error NothingToRepay()",
  "error OracleNotReady()",
  "error PriceDeviation()",
  "error TransferFailed()",
  "error NothingReceived()",
]);

export const erc20Abi = parseAbi([
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

export type LendMarket = {
  id: number;
  token: Address;
  symbol: string;
  name: string;
  decimals: number;
  price: bigint; // USDC wei per whole token (TWAP)
  spot: bigint;
  covered: number;
  cash: bigint;
  totalBorrows: bigint;
  reserves: bigint;
  totalCollateral: bigint;
  supplyCap: bigint;
  borrowCap: bigint;
  ltvBps: number;
  liqThresholdBps: number;
  liqBonusBps: number;
  borrowAprBps: number;
  supplyAprBps: number;
  utilBps: number;
  borrowsPaused: boolean;
  available: bigint; // USDC that can be borrowed / withdrawn right now
};

/** Every market with its live rates, prices and token metadata. */
export function useLendMarkets() {
  const count = useReadContract({ address: ARCLEND_ADDRESS, abi: arcLendAbi, functionName: "marketCount", chainId: arc.id, query: { enabled: !!ARCLEND_ADDRESS, refetchInterval: 30_000 } });
  const n = Number(count.data ?? 0);
  const ids = useMemo(() => Array.from({ length: n }, (_, i) => BigInt(i)), [n]);
  const core = useReadContracts({
    contracts: ids.flatMap((id) => [
      { address: ARCLEND_ADDRESS!, abi: arcLendAbi, functionName: "getMarket", args: [id] } as const,
      { address: ARCLEND_ADDRESS!, abi: arcLendAbi, functionName: "rates", args: [id] } as const,
      { address: ARCLEND_ADDRESS!, abi: arcLendAbi, functionName: "priceOf", args: [id] } as const,
    ]),
    query: { enabled: n > 0, refetchInterval: 20_000 },
  });
  const tokens = useMemo(() => (core.data ?? []).filter((_, i) => i % 3 === 0).map((r) => (r.result as { token: Address } | undefined)?.token).filter(Boolean) as Address[], [core.data]);
  const meta = useReadContracts({
    contracts: tokens.flatMap((t) => [{ address: t, abi: erc20Abi, functionName: "symbol" } as const, { address: t, abi: erc20Abi, functionName: "name" } as const]),
    query: { enabled: tokens.length > 0, staleTime: Infinity },
  });

  const markets: LendMarket[] = useMemo(() => {
    if (!core.data) return [];
    return ids.map((id, i) => {
      const m = core.data[i * 3]?.result as { token: Address; tokenDecimals: number; borrowsPaused: boolean; cash: bigint; totalBorrows: bigint; reserves: bigint; totalCollateral: bigint; risk: { ltvBps: number; liqThresholdBps: number; liqBonusBps: number; supplyCap: bigint; borrowCap: bigint } } | undefined;
      const r = core.data[i * 3 + 1]?.result as readonly [bigint, bigint, bigint] | undefined;
      const p = core.data[i * 3 + 2]?.result as readonly [bigint, bigint, number] | undefined;
      if (!m) return undefined;
      const available = m.cash > m.reserves ? m.cash - m.reserves : 0n;
      return {
        id: Number(id), token: m.token, symbol: (meta.data?.[i * 2]?.result as string) ?? "…", name: (meta.data?.[i * 2 + 1]?.result as string) ?? "", decimals: m.tokenDecimals,
        price: p?.[0] ?? 0n, spot: p?.[1] ?? 0n, covered: p?.[2] ?? 0,
        cash: m.cash, totalBorrows: m.totalBorrows, reserves: m.reserves, totalCollateral: m.totalCollateral,
        supplyCap: m.risk.supplyCap, borrowCap: m.risk.borrowCap, ltvBps: m.risk.ltvBps, liqThresholdBps: m.risk.liqThresholdBps, liqBonusBps: m.risk.liqBonusBps,
        borrowAprBps: Number(r?.[0] ?? 0n), supplyAprBps: Number(r?.[1] ?? 0n), utilBps: Number(r?.[2] ?? 0n), borrowsPaused: m.borrowsPaused, available,
      } satisfies LendMarket;
    }).filter(Boolean) as LendMarket[];
  }, [core.data, meta.data, ids]);

  return { markets, isLoading: count.isLoading || (n > 0 && core.isLoading), isError: count.isError || core.isError, deployed: !!ARCLEND_ADDRESS };
}

export type LendPosition = { supplyShares: bigint; supplied: bigint; collateral: bigint; debt: bigint; health: bigint; tokenBalance: bigint; allowance: bigint };

/** The connected wallet's position in one market. */
export function useLendPosition(market: LendMarket | undefined) {
  const { address } = useAccount();
  const id = market ? BigInt(market.id) : undefined;
  const q = useReadContracts({
    contracts: market && address && id !== undefined ? [
      { address: ARCLEND_ADDRESS!, abi: arcLendAbi, functionName: "getAccount", args: [id, address] } as const,
      { address: ARCLEND_ADDRESS!, abi: arcLendAbi, functionName: "supplyBalanceOf", args: [id, address] } as const,
      { address: ARCLEND_ADDRESS!, abi: arcLendAbi, functionName: "debtOf", args: [id, address] } as const,
      { address: ARCLEND_ADDRESS!, abi: arcLendAbi, functionName: "healthFactor", args: [id, address] } as const,
      { address: market.token, abi: erc20Abi, functionName: "balanceOf", args: [address] } as const,
      { address: market.token, abi: erc20Abi, functionName: "allowance", args: [address, ARCLEND_ADDRESS!] } as const,
    ] : [],
    query: { enabled: !!market && !!address, refetchInterval: 15_000 },
  });
  const d = q.data;
  const acct = d?.[0]?.result as { supplyShares: bigint; collateral: bigint } | undefined;
  const pos: LendPosition | undefined = d && acct ? {
    supplyShares: acct.supplyShares, supplied: (d[1]?.result as bigint) ?? 0n, collateral: acct.collateral, debt: (d[2]?.result as bigint) ?? 0n,
    health: (d[3]?.result as bigint) ?? 0n, tokenBalance: (d[4]?.result as bigint) ?? 0n, allowance: (d[5]?.result as bigint) ?? 0n,
  } : undefined;
  return { position: pos, isLoading: q.isLoading, refetch: q.refetch };
}

// ---------- pure helpers ----------

export const BPS = 10_000n;

/** USDC value (wei) of `amount` token units at `price` (USDC wei per whole token). */
export const collateralValue = (amount: bigint, price: bigint, decimals: number) => (amount * price) / 10n ** BigInt(decimals);

/** Max additional USDC that can be borrowed against `collateral` given existing `debt`. */
export function borrowCapacity(m: LendMarket, collateral: bigint, debt: bigint): bigint {
  const limit = (collateralValue(collateral, m.price, m.decimals) * BigInt(m.ltvBps)) / BPS;
  const room = limit > debt ? limit - debt : 0n;
  return room < m.available ? room : m.available;
}

/** Token price (USDC wei per whole token) at which the position becomes liquidatable. */
export function liquidationPrice(m: LendMarket, collateral: bigint, debt: bigint): bigint {
  if (collateral === 0n || debt === 0n) return 0n;
  // debt = collateral * price * liqThreshold / (10^dec * BPS)  =>  price = debt * 10^dec * BPS / (collateral * liqThreshold)
  return (debt * 10n ** BigInt(m.decimals) * BPS) / (collateral * BigInt(m.liqThresholdBps));
}

export const fmtBps = (bps: number, digits = 2) => `${(bps / 100).toFixed(digits)}%`;
export const fmtHealth = (h: bigint) => (h >= 10n ** 30n ? "∞" : (Number(h) / 1e18).toFixed(2));
