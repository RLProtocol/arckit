import { useQuery } from "@tanstack/react-query";
import { type Address } from "viem";
import { ADDR, KNOWN_TOKENS, publicClient, withTimeout } from "../chain";
import { arcLendAbi, erc20Abi } from "../contracts";
import { customTokens, type CustomToken } from "../wallet/store";

export type TokenBalance = CustomToken & { balance: bigint; price: bigint; value: bigint };

/** Native USDC plus every known and user-added token, with ArcLend oracle prices where a market exists. */
export function useBalances(address?: Address) {
  return useQuery({
    queryKey: ["balances", address],
    enabled: !!address,
    refetchInterval: 15_000,
    retry: 2,
    queryFn: async () => {
      const extra = await customTokens().catch(() => []);
      const tokens = [...KNOWN_TOKENS, ...extra.filter((t) => !KNOWN_TOKENS.some((k) => k.address.toLowerCase() === t.address.toLowerCase()))];
      const [native, bals, prices] = await withTimeout(Promise.all([
        publicClient.getBalance({ address: address! }),
        publicClient.multicall({ contracts: tokens.map((t) => ({ address: t.address, abi: erc20Abi, functionName: "balanceOf", args: [address!] }) as const), allowFailure: true }),
        marketPrices(),
      ]));
      const list: TokenBalance[] = tokens.map((t, i) => {
        const balance = bals[i].status === "success" ? (bals[i].result as bigint) : 0n;
        const price = prices[t.address.toLowerCase()] ?? 0n;
        return { ...t, balance, price, value: (balance * price) / 10n ** BigInt(t.decimals) };
      });
      const total = native + list.reduce((a, t) => a + t.value, 0n);
      return { native, tokens: list, total };
    },
  });
}

/** USDC wei per whole token for every ArcLend market token (TWAP). */
async function marketPrices(): Promise<Record<string, bigint>> {
  if (!ADDR.lend) return {};
  try {
    const n = Number(await publicClient.readContract({ address: ADDR.lend, abi: arcLendAbi, functionName: "marketCount" }));
    if (n === 0) return {};
    const ids = Array.from({ length: n }, (_, i) => BigInt(i));
    const res = await publicClient.multicall({
      contracts: ids.flatMap((id) => [{ address: ADDR.lend, abi: arcLendAbi, functionName: "getMarket", args: [id] } as const, { address: ADDR.lend, abi: arcLendAbi, functionName: "priceOf", args: [id] } as const]),
      allowFailure: true,
    });
    const out: Record<string, bigint> = {};
    ids.forEach((_, i) => {
      const m = res[i * 2].result as { token: Address } | undefined;
      const p = res[i * 2 + 1].result as readonly [bigint, bigint, number] | undefined;
      if (m && p) out[m.token.toLowerCase()] = p[0];
    });
    return out;
  } catch {
    return {};
  }
}

export type TokenMeta = { symbol: string; name: string; decimals: number };
export async function fetchTokenMeta(address: Address): Promise<TokenMeta | null> {
  try {
    const r = await publicClient.multicall({ contracts: [{ address, abi: erc20Abi, functionName: "symbol" }, { address, abi: erc20Abi, functionName: "name" }, { address, abi: erc20Abi, functionName: "decimals" }], allowFailure: false });
    return { symbol: r[0] as string, name: r[1] as string, decimals: Number(r[2]) };
  } catch {
    return null;
  }
}
