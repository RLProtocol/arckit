import { useQuery } from "@tanstack/react-query";
import { parseAbi, parseEventLogs, type Address, type Hex, type TransactionReceipt } from "viem";
import { publicClient, SITE, withTimeout } from "../chain";
import { erc20Abi } from "../contracts";
import { creatorRegistryAbi, escrowAbi, hookFor, poolIdOf, PORTAL, portalAbi, QUOTE, quoteRegistryAbi, STATE_VIEW, stateViewAbi } from "../argus";
import { priceFromSqrt } from "./useArcKit";
import { waitFor } from "../wallet/provider";
import type { useWallet } from "../wallet/provider";

const supplyAbi = parseAbi(["function totalSupply() view returns (uint256)"]);
const USDC6_TO_WEI = 10n ** 12n; // escrow and economics figures are 6-decimal USDC; the app works in 18-decimal wei

// ---------------------------------------------------------------- terms

export type ArgusTerms = { startFdv: bigint; bondFdv: bigint; minSeed: bigint; treasuryBps: number; hookFactory: Address; creatorRegistry: Address };

/** Live Portal #8 terms: start and bond FDV (wei), the minimum opening buy (6-decimal USDC), Argus's share. */
export function useArgusTerms() {
  return useQuery({
    queryKey: ["argus-terms"],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<ArgusTerms> => {
      const [registry, seedPpm, treasuryBps, hookFactory, creatorRegistry] = await withTimeout(publicClient.multicall({
        contracts: (["registry", "minSeedPpm", "treasuryBps", "hookFactory", "creatorRegistry"] as const).map((functionName) => ({ address: PORTAL, abi: portalAbi, functionName }) as const),
        allowFailure: false,
      }));
      const econ = await publicClient.readContract({ address: registry as Address, abi: quoteRegistryAbi, functionName: "economicsFor", args: [QUOTE] });
      return {
        startFdv: econ.startFdvQuote * USDC6_TO_WEI,
        bondFdv: econ.bondFdvQuote * USDC6_TO_WEI,
        minSeed: (econ.bondFdvQuote * BigInt(seedPpm as number)) / 1_000_000n,
        treasuryBps: Number(treasuryBps),
        hookFactory: hookFactory as Address,
        creatorRegistry: creatorRegistry as Address,
      };
    },
  });
}

// ---------------------------------------------------------------- launches

export type LaunchMeta = { imageURI: string; website: string; twitter: string; telegram: string; description: string };
export type LaunchRow = { token: Address; hook: Address; escrow: Address; tickStart: number; tickBond: number; txHash: Hex; ts: number; meta: LaunchMeta | null };
export type LaunchStats = LaunchRow & {
  name: string; symbol: string; supply: bigint; tokenIsToken0: boolean;
  // fees are in the launch quote: USDC for launches from this app, sometimes another asset for launches made elsewhere
  quote: Address; quoteSymbol: string; usdcQuote: boolean;
  price: bigint; fdv: bigint; owed: bigint; claimed: bigint; collected: bigint; payout: Address; balance: bigint;
  split: [number, number, number, number, number];
};

async function fetchLaunchRows(creator: Address): Promise<LaunchRow[]> {
  // network failures surface as one plain sentence, not "Failed to fetch"
  const j = await fetch(`${SITE}/api/argus?op=launches&creator=${creator}`, { signal: AbortSignal.timeout(30_000) }).then((r) => r.json() as Promise<{ launches?: LaunchRow[] }>).catch(() => ({ launches: undefined }));
  if (!j.launches) throw new Error("Could not load your launches.");
  return j.launches;
}

/** Live numbers for launches: price and FDV from the pool, fees from the escrow, the payee from the registry. */
async function enrich(rows: LaunchRow[], viewer: Address | undefined, creatorRegistry: Address): Promise<LaunchStats[]> {
  if (!rows.length) return [];
  const base = await publicClient.multicall({
    allowFailure: true,
    contracts: rows.flatMap((l) => [
      { address: l.token, abi: erc20Abi, functionName: "name" },
      { address: l.token, abi: erc20Abi, functionName: "symbol" },
      { address: l.token, abi: supplyAbi, functionName: "totalSupply" },
      { address: PORTAL, abi: portalAbi, functionName: "launches", args: [l.token] },
      { address: l.escrow, abi: escrowAbi, functionName: "owedCreator" },
      { address: l.escrow, abi: escrowAbi, functionName: "creatorDrawn" },
      { address: l.escrow, abi: escrowAbi, functionName: "totalReceived" },
      { address: creatorRegistry, abi: creatorRegistryAbi, functionName: "payoutOf", args: [l.token] },
      { address: l.token, abi: erc20Abi, functionName: "balanceOf", args: [viewer ?? PORTAL] },
      ...(["creatorBps", "burnBps", "dividendBps", "liquidityBps", "lockBps", "quoteAsset"] as const).map((functionName) => ({ address: l.escrow, abi: escrowAbi, functionName }) as const),
    ] as const),
  });
  const N = 15;
  const r = (i: number, k: number) => base[i * N + k]?.result as unknown;
  const recs = rows.map((_, i) => r(i, 3) as readonly [Address, Address, Address, bigint, number, number, boolean] | undefined);
  const quotes = rows.map((_, i) => (r(i, 14) as Address | undefined) ?? QUOTE);
  const foreign = Array.from(new Set(quotes.filter((q) => q.toLowerCase() !== QUOTE.toLowerCase()).map((q) => q.toLowerCase()))) as Address[];
  const [slots, qmeta] = await Promise.all([
    publicClient.multicall({
      allowFailure: true,
      contracts: rows.map((l, i) => ({ address: STATE_VIEW, abi: stateViewAbi, functionName: "getSlot0", args: [poolIdOf(l.token, recs[i]?.[0] ?? l.hook, recs[i]?.[6] ?? false, quotes[i])] }) as const),
    }),
    foreign.length ? publicClient.multicall({ allowFailure: true, contracts: foreign.flatMap((q) => [{ address: q, abi: erc20Abi, functionName: "decimals" }, { address: q, abi: erc20Abi, functionName: "symbol" }] as const) }) : Promise.resolve([]),
  ]);
  const quoteInfo = (q: Address) => { const k = foreign.indexOf(q.toLowerCase() as Address); return k < 0 ? { decimals: 6, symbol: "USDC" } : { decimals: Number((qmeta[k * 2]?.result as number | undefined) ?? 18), symbol: (qmeta[k * 2 + 1]?.result as string | undefined) ?? "TOKEN" }; };
  return rows.map((l, i) => {
    const tokenIsToken0 = recs[i]?.[6] ?? false;
    const supply = (r(i, 2) as bigint | undefined) ?? 0n;
    const qi = quoteInfo(quotes[i]);
    const usdcQuote = qi.symbol === "USDC" && quotes[i].toLowerCase() === QUOTE.toLowerCase();
    const toWei = 10n ** BigInt(Math.max(0, 18 - qi.decimals));
    const sqrt = (slots[i].result as readonly [bigint, number, number, number] | undefined)?.[0] ?? 0n;
    // only a USDC pool gives a dollar price; other quotes would need their own USD rate
    const price = sqrt > 0n && usdcQuote ? priceFromSqrt(sqrt, !tokenIsToken0, 18, 6) : 0n;
    return {
      ...l,
      name: (r(i, 0) as string | undefined) ?? "Token",
      symbol: (r(i, 1) as string | undefined) ?? "TOKEN",
      supply, tokenIsToken0, price, quote: quotes[i], quoteSymbol: qi.symbol, usdcQuote,
      fdv: (price * supply) / 10n ** 18n,
      owed: ((r(i, 4) as bigint | undefined) ?? 0n) * toWei,
      claimed: ((r(i, 5) as bigint | undefined) ?? 0n) * toWei,
      collected: ((r(i, 6) as bigint | undefined) ?? 0n) * toWei,
      payout: (r(i, 7) as Address | undefined) ?? l.escrow,
      balance: viewer ? ((r(i, 8) as bigint | undefined) ?? 0n) : 0n,
      split: [9, 10, 11, 12, 13].map((k) => Number((r(i, k) as number | undefined) ?? 0)) as LaunchStats["split"],
    };
  });
}

/** Every Portal #8 token this wallet launched (from the Argus app or this one), newest first, with live stats. */
export function useMyLaunches(address?: Address) {
  const terms = useArgusTerms();
  return useQuery({
    queryKey: ["argus-launches", address],
    enabled: !!address && !!terms.data,
    refetchInterval: 20_000,
    queryFn: async () => enrich(await fetchLaunchRows(address!), address, terms.data!.creatorRegistry),
  });
}

/** One launch by token address. Works the moment a launch confirms, before the indexer has seen it. */
export function useLaunch(token: Address | undefined, address?: Address) {
  const terms = useArgusTerms();
  const mine = useMyLaunches(address);
  return useQuery({
    queryKey: ["argus-launch", token, address, !!mine.data],
    enabled: !!token && !!terms.data,
    refetchInterval: 15_000,
    queryFn: async (): Promise<LaunchStats | null> => {
      const known = mine.data?.find((l) => l.token.toLowerCase() === token!.toLowerCase());
      const rec = await publicClient.readContract({ address: PORTAL, abi: portalAbi, functionName: "launches", args: [token!] });
      if (rec[0] === "0x0000000000000000000000000000000000000000") return null;
      const row: LaunchRow = known ?? { token: token!, hook: rec[0], escrow: rec[1], tickStart: rec[4], tickBond: rec[5], txHash: "0x" as Hex, ts: Math.floor(Date.now() / 1000), meta: null };
      return (await enrich([row], address, terms.data!.creatorRegistry))[0] ?? null;
    },
  });
}

// ---------------------------------------------------------------- the launch itself

export type LaunchForm = {
  name: string; symbol: string; description: string; website: string; twitter: string; telegram: string;
  imageURI: string; buyTaxBps: number; sellTaxBps: number; alloc: [number, number, number, number, number];
  seed: bigint; // opening buy, 6-decimal USDC
  payoutAddress: Address | null;
};

export type LaunchStage = "image" | "salt" | "approve" | "launch";

export async function uploadImage(base64: string, type = "image/jpeg"): Promise<string> {
  const r = await fetch(`${SITE}/api/argus?op=image`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: base64, type }), signal: AbortSignal.timeout(45_000) });
  const j = (await r.json()) as { uri?: string; error?: string };
  if (!r.ok || !j.uri) throw new Error(j.error || "Could not upload the image.");
  return j.uri;
}

/** Finds a hook salt on the server, then checks it against the Portal itself before anything is signed. */
async function hookSalt(creator: Address, buy: number, sell: number, hookFactory: Address): Promise<Hex> {
  const r = await fetch(`${SITE}/api/argus?op=salt`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ creator, buyTaxBps: buy, sellTaxBps: sell }), signal: AbortSignal.timeout(70_000) });
  const j = (await r.json()) as { hookSalt?: Hex; error?: string };
  if (!r.ok || !j.hookSalt) throw new Error(j.error || "Could not prepare the launch. Try again.");
  const initHash = await publicClient.readContract({ address: PORTAL, abi: portalAbi, functionName: "hookInitCodeHash", args: [creator, j.hookSalt, QUOTE, buy, sell] });
  if (!hookFor(hookFactory, j.hookSalt, initHash).ok) throw new Error("The launch address failed its check. Try again.");
  return j.hookSalt;
}

/**
 * Signs the launch: image upload (if any), hook salt, USDC approval for the opening buy, then Portal.launch.
 * Returns the launch transaction hash; the caller waits for it (useTx).
 */
export async function sendLaunch(wc: NonNullable<ReturnType<typeof useWallet>["walletClient"]>, form: LaunchForm, terms: ArgusTerms, onStage: (s: LaunchStage) => void, image?: { base64: string; type: string }): Promise<Hex> {
  const creator = wc.account!.address;
  let imageURI = form.imageURI;
  if (image && !imageURI) { onStage("image"); imageURI = await uploadImage(image.base64, image.type); }
  onStage("salt");
  const salt = await hookSalt(creator, form.buyTaxBps, form.sellTaxBps, terms.hookFactory);
  const allowance = await publicClient.readContract({ address: QUOTE, abi: erc20Abi, functionName: "allowance", args: [creator, PORTAL] });
  if (allowance < form.seed) {
    onStage("approve");
    const h = await wc.writeContract({ account: wc.account!, chain: wc.chain, address: QUOTE, abi: erc20Abi, functionName: "approve", args: [PORTAL, form.seed] });
    const rc = await waitFor(h);
    if (rc.status !== "success") throw new Error("The USDC approval failed on chain.");
  }
  onStage("launch");
  return wc.writeContract({
    account: wc.account!, chain: wc.chain, address: PORTAL, abi: portalAbi, functionName: "launch",
    args: [{
      name: form.name.trim(), symbol: form.symbol.trim().toUpperCase(), totalSupply: 1_000_000_000n * 10n ** 18n,
      buyTaxBps: form.buyTaxBps, sellTaxBps: form.sellTaxBps, alloc: form.alloc,
      quoteAsset: QUOTE, payoutAsset: QUOTE, kothBps: 0,
      payoutAddress: form.payoutAddress ?? "0x0000000000000000000000000000000000000000",
      identityProvider: `0x${"0".repeat(64)}`, identitySubject: 0n,
      bundle: [{ to: creator, amountQuote: form.seed }], snipeExempt: [],
      meta: { imageURI, website: form.website.trim(), twitter: form.twitter.trim(), telegram: form.telegram.trim(), description: form.description.trim() },
    }, salt],
  });
}

/** The new token's address, read from the Launched event in the receipt. */
export function launchedToken(receipt?: TransactionReceipt): Address | undefined {
  if (!receipt) return undefined;
  try { return parseEventLogs({ abi: portalAbi, logs: receipt.logs, eventName: "Launched" })[0]?.args.token; } catch { return undefined; }
}
