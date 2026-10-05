// Token swaps on Arc through the Relay API: USDC (Arc's native coin) in, any Arc token out, and back.
// Relay returns ready-to-sign transactions (an approve step when selling, then the swap); the in-app key signs each.
import { useQuery } from "@tanstack/react-query";
import type { Address, Hex, WalletClient } from "viem";
import { arc, KNOWN_TOKENS, publicClient } from "../chain";

const RELAY = "https://api.relay.link";
export const NATIVE = "0x0000000000000000000000000000000000000000" as Address;

export type TradeToken = { address: Address; symbol: string; name: string; decimals?: number; image?: string; priceUsd?: number; liquidityUsd?: number; verified?: boolean };

export type RelayItem = { status: string; data: { to: Address; data: Hex; value?: string; gas?: string; chainId?: number }; check?: { endpoint: string; method: string } };
export type RelayStep = { id: string; action?: string; description?: string; kind: string; items: RelayItem[] };
export type Quote = {
  steps: RelayStep[];
  amountIn: string; amountOut: string; amountOutRaw: bigint; symbolIn: string; symbolOut: string;
  impactPct?: number; rate?: string; feeUsd?: number; fetchedAt: number;
};

type RelayQuoteResponse = {
  steps?: RelayStep[];
  details?: {
    currencyIn?: { amountFormatted?: string; currency?: { symbol?: string } };
    currencyOut?: { amount?: string; amountFormatted?: string; currency?: { symbol?: string } };
    totalImpact?: { percent?: string };
    rate?: string;
  };
  fees?: { relayer?: { amountUsd?: string }; gas?: { amountUsd?: string } };
  message?: string;
  errorCode?: string;
};

const FRIENDLY: Record<string, string> = {
  AMOUNT_TOO_LOW: "That amount is too small to swap. Try at least about 0.50 USDC worth.",
  NO_SWAP_ROUTES_FOUND: "No route found for this token on Arc right now.",
  INSUFFICIENT_LIQUIDITY: "Not enough liquidity in this token's pool for that size.",
};

/** A Relay quote for swapping `amount` (base units of `from`) into `to`, both on Arc. */
export async function fetchQuote(user: Address, from: Address, to: Address, amount: bigint): Promise<Quote> {
  const r = await fetch(`${RELAY}/quote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user, recipient: user, originChainId: arc.id, destinationChainId: arc.id, originCurrency: from, destinationCurrency: to, amount: amount.toString(), tradeType: "EXACT_INPUT" }),
    signal: AbortSignal.timeout(20_000),
  });
  const j = (await r.json()) as RelayQuoteResponse;
  if (!r.ok || j.message || !j.steps?.length) throw new Error((j.errorCode && FRIENDLY[j.errorCode]) || j.message || "No quote available right now.");
  const d = j.details ?? {};
  const fee = Number(j.fees?.relayer?.amountUsd ?? 0) + Number(j.fees?.gas?.amountUsd ?? 0);
  return {
    steps: j.steps,
    amountIn: d.currencyIn?.amountFormatted ?? "", symbolIn: d.currencyIn?.currency?.symbol ?? "",
    amountOut: d.currencyOut?.amountFormatted ?? "", amountOutRaw: BigInt(d.currencyOut?.amount ?? "0"), symbolOut: d.currencyOut?.currency?.symbol ?? "",
    impactPct: d.totalImpact?.percent !== undefined ? Number(d.totalImpact.percent) : undefined, rate: d.rate,
    feeUsd: Number.isFinite(fee) && fee > 0 ? fee : undefined, fetchedAt: Date.now(),
  };
}

export type ExecProgress = { step: string; index: number; total: number; hash?: Hex };

/** Signs and sends every pending transaction in the quote, in order, waiting for each to confirm. */
export async function executeQuote(wallet: WalletClient, quote: Quote, onProgress: (p: ExecProgress) => void): Promise<Hex> {
  const items = quote.steps.flatMap((s) => s.items.filter((i) => i.status !== "complete").map((i) => ({ step: s, item: i })));
  let last: Hex | undefined;
  for (let n = 0; n < items.length; n++) {
    const { step, item } = items[n];
    const label = step.id === "approve" ? "Approving token" : "Swapping";
    onProgress({ step: label, index: n, total: items.length });
    const hash = await wallet.sendTransaction({
      account: wallet.account!, chain: arc,
      to: item.data.to, data: item.data.data, value: BigInt(item.data.value ?? "0"),
      gas: item.data.gas ? BigInt(item.data.gas) : undefined,
    });
    onProgress({ step: label, index: n, total: items.length, hash });
    const rc = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
    if (rc.status !== "success") throw new Error(`${label} failed on chain.`);
    last = hash;
  }
  if (!last) throw new Error("Nothing to sign in this quote.");
  return last;
}

/** Arc tokens matching a name, symbol or address, ranked by pool liquidity. Known Arc Kit tokens are marked verified. */
export function useTokenSearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ["token-search", q.toLowerCase()],
    enabled: q.length >= 2,
    staleTime: 60_000,
    queryFn: async (): Promise<TradeToken[]> => {
      const r = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(10_000) });
      const j = (await r.json()) as { pairs?: { chainId: string; baseToken: { address: string; symbol: string; name: string }; priceUsd?: string; liquidity?: { usd?: number }; info?: { imageUrl?: string } }[] };
      const best = new Map<string, TradeToken>();
      for (const p of j.pairs ?? []) {
        if (p.chainId !== "arc") continue;
        const a = p.baseToken.address.toLowerCase();
        if (a === NATIVE || a === "0x3600000000000000000000000000000000000000") continue;
        const liq = p.liquidity?.usd ?? 0;
        const cur = best.get(a);
        if (!cur || (cur.liquidityUsd ?? 0) < liq) best.set(a, { address: p.baseToken.address as Address, symbol: p.baseToken.symbol, name: p.baseToken.name, image: p.info?.imageUrl ?? cur?.image, priceUsd: p.priceUsd ? Number(p.priceUsd) : undefined, liquidityUsd: liq, verified: KNOWN_TOKENS.some((k) => k.address.toLowerCase() === a) });
      }
      return [...best.values()].sort((x, y) => Number(!!y.verified) - Number(!!x.verified) || (y.liquidityUsd ?? 0) - (x.liquidityUsd ?? 0)).slice(0, 25);
    },
  });
}
