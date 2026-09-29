import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";

type DexPair = {
  chainId: string;
  baseToken?: { address?: string };
  quoteToken?: { address?: string };
  info?: { imageUrl?: string };
};

/** DexScreener accepts up to 30 comma-separated token addresses per call. */
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
        // the pair's image describes its base token
        const base = p.baseToken?.address?.toLowerCase();
        if (base && chunk.includes(base) && !out[base]) out[base] = p.info.imageUrl;
      }
    } catch {
      /* no image for this chunk; the UI falls back to the symbol */
    }
  }
  return out;
}

/**
 * Token logo URLs from DexScreener, keyed by lowercase address. Only tokens that
 * have a listed pair on Arc get an image; everything else falls back to text.
 */
export function useTokenImages(tokens: readonly Address[]): Record<string, string> {
  const key = Array.from(new Set(tokens.map((t) => t.toLowerCase()))).sort().join(",");
  const addrs = useMemo(() => (key ? key.split(",") : []), [key]);
  const q = useQuery({
    queryKey: ["dex-token-images", key],
    queryFn: () => fetchImages(addrs),
    enabled: addrs.length > 0,
    staleTime: 6 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
    retry: 1,
  });
  return q.data ?? {};
}
