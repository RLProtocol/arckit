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

export const SITE = "https://www.usearckit.locker";
export const EXPLORER = deployments.explorer;
export const explorerTx = (h: string) => `${EXPLORER}/tx/${h}`;
export const explorerAddress = (a: string) => `${EXPLORER}/address/${a}`;

const opts = { batch: true, retryCount: 2, retryDelay: 400, timeout: 12_000 } as const;
export const publicClient = createPublicClient({
  chain: arc,
  transport: fallback([http(`${SITE}/api/rpc`, opts), http("https://5042.rpc.thirdweb.com", opts), http(deployments.rpcUrl, opts)], { rank: false }),
});

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
