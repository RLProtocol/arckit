import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";

type DexPair = { chainId: string; baseToken?: { address?: string }; info?: { imageUrl?: string } };
const BATCH = 30;

async function fetchImages(addrs: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (let i = 0; i < addrs.length; i += BATCH) {
    const chunk = addrs.slice(i, i + BATCH);
    try {
      const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${chunk.join(",")}`, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) continue;
      const j = (await r.json()) as { pairs?: DexPair[] };
      for (const p of j.pairs ?? []) {
        if (p.chainId !== "arc" || !p.info?.imageUrl) continue;
        const base = p.baseToken?.address?.toLowerCase();
        if (base && chunk.includes(base) && !out[base]) out[base] = p.info.imageUrl;
      }
    } catch {
      /* fall back to the symbol avatar */
    }
  }
  return out;
}

/** Real token logos from DexScreener (same source as the website), keyed by lowercase address. */
export function useTokenImages(tokens: readonly (Address | string)[]): Record<string, string> {
  const key = Array.from(new Set(tokens.map((t) => t.toLowerCase()))).sort().join(",");
  const addrs = useMemo(() => (key ? key.split(",") : []), [key]);
  const q = useQuery({ queryKey: ["dex-token-images", key], queryFn: () => fetchImages(addrs), enabled: addrs.length > 0, staleTime: 6 * 60 * 60_000, gcTime: 24 * 60 * 60_000, retry: 1 });
  return q.data ?? {};
}
