import { createPublicClient, defineChain, fallback, http, type Address } from "viem";
import deployments from "../../deployments/arc-5042.json";

/** Arc (Circle's L1). Gas coin is USDC with 18 decimals; the 6-decimal ERC-20 view lives at 0x3600…0000. */
export const arc = defineChain({
  id: deployments.chainId,
  name: deployments.chainName,
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://5042.rpc.thirdweb.com", deployments.rpcUrl] } },
  blockExplorers: { default: { name: "Arc Etherscan", url: deployments.explorer } },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11", blockCreated: 0 } },
});

// usearckit.online: a common ending every DNS resolves (some carrier/VPN DNS cannot resolve .locker). The www host is
// used directly because the bare domain answers with a redirect, which would turn RPC POSTs into extra round trips.
export const SITE = "https://www.usearckit.online";
export const SITE_LABEL = "usearckit.online";
export const EXPLORER = deployments.explorer;
export const explorerTx = (h: string) => `${EXPLORER}/tx/${h}`;
export const explorerAddress = (a: string) => `${EXPLORER}/address/${a}`;

// maxResponseBodySize: false makes viem read responses with response.text(). The default streams the body through
// response.body.getReader(), which stalls on Android under Expo's fetch, so balances never arrived.
export const rpcOpts = { batch: true, retryCount: 1, retryDelay: 300, timeout: 8_000, maxResponseBodySize: false } as const;
const opts = rpcOpts;
export const publicClient = createPublicClient({
  chain: arc,
  // Our proxy first: it fronts a private Arc node with no public rate limit. thirdweb returned HTTP 429 on mobile networks.
  transport: fallback([http(`${SITE}/api/rpc`, opts), http("https://5042.rpc.thirdweb.com", opts), http(deployments.rpcUrl, opts)], { rank: false }),
});

/** Rejects after `ms` so a stalled network call becomes a visible error with a retry instead of an endless skeleton. */
export function withTimeout<T>(p: Promise<T>, ms = 20_000, what = "Arc"): Promise<T> {
  return new Promise<T>((resolve, reject) => { const t = setTimeout(() => reject(new Error(`${what} did not answer in time. Check your connection and try again.`)), ms); p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); }); });
}

export const USDC_ERC20 = "0x3600000000000000000000000000000000000000" as Address;

const dc = deployments.contracts as Record<string, { address: string } | undefined>;
export const ADDR = {
  p2p: dc.ArcP2P?.address as Address,
  lend: dc.ArcLend?.address as Address,
  oracle: dc.ArcTwapOracle?.address as Address,
  locker: dc.TokenLocker?.address as Address,
  vesting: dc.TokenVesting?.address as Address,
  airdrop: dc.BulkAirdrop?.address as Address,
  staking: dc.ArcStaking?.address as Address,
};

/** Tokens shown by default in the wallet; users can add more. */
export const KNOWN_TOKENS: { address: Address; symbol: string; name: string; decimals: number }[] = [
  { address: "0xBc3764348131Fe1962f267f442a8Fe30459ededD", symbol: "AKIT", name: "ArcKit", decimals: 18 },
  { address: "0x5849Fd68a097B3eE7d87ce88a0fcBb76857648FF", symbol: "ARCMAN", name: "Arcman", decimals: 18 },
  { address: "0x4621A0baA0b5D97AAe77704Cf2a84DabE78a4FED", symbol: "ARCOON", name: "Arcoon", decimals: 18 },
  { address: "0x75d658f8101fBE6DC217FBba7E20a0312af5Fa2E", symbol: "AF", name: "Arc Fun", decimals: 18 },
  { address: "0x4C9b47Dbd5933aa4574B2c27F82419E4DBBD0222", symbol: "ASTOCK", name: "Arc Stock", decimals: 18 },
];
