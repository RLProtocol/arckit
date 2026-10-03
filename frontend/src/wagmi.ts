import { http, fallback, createConfig } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { defineChain } from "viem";
import deployments from "@deployments/arc-5042.json";

/**
 * Public endpoints. Also handed to wallets when they add the Arc network, so they must be absolute
 * URLs, and ORDER MATTERS: MetaMask uses the first one for gas estimates and broadcasting.
 * thirdweb answered every probe; rpc.arc-scan.org drops ~25% of requests and makes MetaMask
 * show "RPC endpoint returned too many errors".
 */
export const WALLET_RPC = "https://5042.rpc.thirdweb.com";
const PUBLIC_RPCS = [WALLET_RPC, deployments.rpcUrl];

/**
 * Arc (Circle's L1). Native gas coin is USDC represented with 18 decimals on-chain.
 * Multicall3 is deployed at the canonical address, so wagmi can batch reads.
 */
export const arc = defineChain({
  id: deployments.chainId,
  name: deployments.chainName,
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: PUBLIC_RPCS } },
  blockExplorers: { default: { name: "ArcScan", url: deployments.explorer } },
  contracts: {
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11", blockCreated: 0 },
  },
});

/**
 * Read transport, in order of preference:
 *  1. /api/rpc: same-origin proxy (api/rpc.js) in front of a private, keyed RPC.
 *     No CORS, key stays server-side. In dev, Vite proxies this path too.
 *  2. rpc.arc-scan.org: public gateway, drops ~25% of requests at random.
 *  3. 5042.rpc.thirdweb.com: public, keyless; intermittent errors under load.
 * `fallback` with `rank` measures each endpoint and prefers the healthiest;
 * a failed request is retried on the next endpoint before surfacing an error.
 * Wallet transactions do not use this transport; the wallet broadcasts them.
 */
const opts = { batch: true, retryCount: 2, retryDelay: 400, timeout: 12_000 } as const;
const transport = fallback(
  [http(`${typeof window !== "undefined" ? window.location.origin : ""}/api/rpc`, opts), ...PUBLIC_RPCS.map((u) => http(u, opts))],
  { rank: { interval: 30_000, sampleCount: 5, timeout: 4_000 } },
);

/**
 * WalletConnect (Reown) lets a visitor on mobile Chrome, or any browser without an extension, connect a wallet app
 * by QR code or deep link. The project ID is public (it only identifies this site to the relay); without one the
 * connector is left out and only injected wallets are offered.
 */
export const WALLETCONNECT_PROJECT_ID = (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "").trim();
const SITE = typeof window !== "undefined" ? window.location.origin : "https://www.usearckit.locker";
const connectors = [
  injected(),
  ...(WALLETCONNECT_PROJECT_ID
    ? [
        walletConnect({
          projectId: WALLETCONNECT_PROJECT_ID,
          showQrModal: true,
          metadata: { name: "Arc Kit", description: "On-chain tools for teams and users on Arc: locks, vesting, airdrops, staking, lending, P2P, private transfers.", url: SITE, icons: [`${SITE}/icon-512.png`] },
          qrModalOptions: { themeMode: "dark", themeVariables: { "--wcm-accent-color": "#8fb3ff", "--wcm-background-color": "#0b1d36", "--wcm-z-index": "1000" } },
        }),
      ]
    : []),
];

export const config = createConfig({
  chains: [arc],
  connectors,
  transports: { [arc.id]: transport },
  multiInjectedProviderDiscovery: true,
  // Fewer background polls: the default 4s block watcher was a large share of the failing requests.
  pollingInterval: 12_000,
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
