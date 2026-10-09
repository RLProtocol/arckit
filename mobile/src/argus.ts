import { concat, encodeAbiParameters, getAddress, keccak256, parseAbi, type Address, type Hex } from "viem";

// Argus launchpad, Portal #8 (ArgusV5Portal): the only launch target Argus supports; #1-#7 are legacy.
// Every launch gets its own Uniswap v4 pool (USDC/token), a tax hook, a payout escrow and a creator registry entry.
export const PORTAL = "0xeed7559B8A6ABf64427dc41Cb5cc6400109C5D93" as Address;
export const QUOTE = "0x3600000000000000000000000000000000000000" as Address; // USDC, 6-decimal ERC-20 view
export const TOTAL_SUPPLY = 1_000_000_000n * 10n ** 18n; // 1B, the Argus default
export const MAX_TAX_BPS = 1000; // the hook refuses more than 10% each way
export const BPS = 10_000;
const DYNAMIC_FEE_FLAG = 0x800000;
const TICK_SPACING = 200;
// v4 reads hook permissions from the address's low 14 bits; the Argus tax hook needs exactly these
const HOOK_MASK = (1n << 14n) - 1n;
const HOOK_FLAGS = (1n << 13n) | (1n << 7n) | (1n << 6n) | (1n << 3n) | (1n << 2n);

export const portalAbi = parseAbi([
  "struct BundleEntry { address to; uint128 amountQuote; }",
  "struct Meta { string imageURI; string website; string twitter; string telegram; string description; }",
  "struct LaunchParams { string name; string symbol; uint256 totalSupply; uint16 buyTaxBps; uint16 sellTaxBps; uint16[5] alloc; address quoteAsset; address payoutAsset; uint16 kothBps; address payoutAddress; bytes32 identityProvider; uint256 identitySubject; BundleEntry[] bundle; address[] snipeExempt; Meta meta; }",
  "function launch(LaunchParams p, bytes32 hookSalt) returns (address token)",
  "function launches(address token) view returns (address hook, address escrow, address locker, uint256 positionId, int24 tickStart, int24 tickBond, bool tokenIsToken0)",
  "function registry() view returns (address)",
  "function creatorRegistry() view returns (address)",
  "function hookFactory() view returns (address)",
  "function minSeedPpm() view returns (uint32)",
  "function treasuryBps() view returns (uint16)",
  "function hookInitCodeHash(address creator, bytes32 hookSalt, address quote, uint16 buyTaxBps, uint16 sellTaxBps) view returns (bytes32)",
  "event Launched(address indexed token, address indexed creator, address hook, address escrow, address locker, uint256 positionId, int24 tickStart, int24 tickBond)",
  "error InvalidConfig()",
  "error EconomicsMissing()",
  "error QuoteAdmissionRevoked(address quote)",
  "error PayoutNotAllowed()",
  "error HookMismatch(address predicted, address deployed)",
  "error BundleTooLong(uint256 n)",
  "error BundleEmptyEntry()",
  "error BundleRecipientRefused(address to)",
  "error CreatorPayoutRefused(address to)",
  "error BundleCrossedTheBond(int24 tick, int24 bond)",
  "error SeedBuyTooSmall(uint256 offered, uint256 required)",
  "error KothAboveCeiling(uint16 asked, uint16 ceiling)",
]);

export const quoteRegistryAbi = parseAbi([
  "struct QuoteEconomics { uint128 startFdvQuote; uint128 bondFdvQuote; uint8 decimals; }",
  "function economicsFor(address quote) view returns (QuoteEconomics)",
]);

export const escrowAbi = parseAbi([
  "function quoteAsset() view returns (address)",
  "function owedCreator() view returns (uint256)",
  "function creatorDrawn() view returns (uint256)",
  "function totalReceived() view returns (uint256)",
  "function creatorBps() view returns (uint16)",
  "function burnBps() view returns (uint16)",
  "function dividendBps() view returns (uint16)",
  "function liquidityBps() view returns (uint16)",
  "function lockBps() view returns (uint16)",
  "function claimCreator() returns (uint256)",
  "error NothingOwed()",
]);

export const creatorRegistryAbi = parseAbi(["function payoutOf(address token) view returns (address)"]);

export const stateViewAbi = parseAbi(["function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)"]);
export const STATE_VIEW = "0xf3334192d15450cdd385c8b70e03f9a6bd9e673b" as Address;

/** The launch's v4 pool id: keccak(abi.encode(PoolKey)) exactly as the Portal builds it. */
export function poolIdOf(token: Address, hook: Address, tokenIsToken0: boolean, quote: Address = QUOTE): Hex {
  const [c0, c1] = tokenIsToken0 ? [token, quote] : [quote, token];
  return keccak256(encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }], [c0, c1, DYNAMIC_FEE_FLAG, TICK_SPACING, hook]));
}

/** The hook address a salt produces, and whether v4 will accept its permission bits. */
export function hookFor(hookFactory: Address, hookSalt: Hex, initCodeHash: Hex): { hook: Address; ok: boolean } {
  const hook = getAddress(`0x${keccak256(concat(["0xff", hookFactory, hookSalt, initCodeHash])).slice(26)}`);
  return { hook, ok: (BigInt(hook) & HOOK_MASK) === HOOK_FLAGS };
}

/** Where fee revenue goes, in the Portal's alloc order. */
export const LANES = [
  { key: "creator", label: "You", text: "Paid to your wallet in USDC.", color: "#8fb3ff" },
  { key: "burn", label: "Burn", text: "Buys the token and burns it.", color: "#ff7a6e" },
  { key: "holders", label: "Holders", text: "Paid to holders as USDC dividends.", color: "#5fe3c9" },
  { key: "liquidity", label: "Liquidity", text: "Deepens the pool for good.", color: "#ba9cff" },
  { key: "lock", label: "Buy & lock", text: "Buys the token and locks it.", color: "#f2c464" },
] as const;

export const SPLIT_PRESETS: { key: string; label: string; alloc: [number, number, number, number, number] }[] = [
  { key: "creator", label: "All to you", alloc: [10000, 0, 0, 0, 0] },
  { key: "balanced", label: "Balanced", alloc: [5000, 2000, 2000, 1000, 0] },
  { key: "community", label: "Community", alloc: [2000, 2000, 4000, 2000, 0] },
  { key: "deflation", label: "Deflationary", alloc: [3000, 5000, 0, 0, 2000] },
];

/** ipfs:// URIs (what almost every Argus launch uses) through a public gateway; https passes through. */
export const imageUrl = (uri?: string) => (!uri ? undefined : uri.startsWith("ipfs://") ? `https://ipfs.io/ipfs/${uri.slice(7)}` : uri);

export const ARGUS_ERRORS: Record<string, string> = {
  SeedBuyTooSmall: "The opening buy is below Argus's minimum. Raise it and try again.",
  InvalidConfig: "Argus refused these settings. Check the name, ticker and fee split.",
  HookMismatch: "The launch address did not match. Try again; a fresh one is found each time.",
  BundleCrossedTheBond: "That opening buy is so large it would pass the bond milestone. Lower it.",
  CreatorPayoutRefused: "That payout address is not allowed. Use your own wallet or another normal address.",
  QuoteAdmissionRevoked: "Argus is not accepting USDC launches right now.",
  EconomicsMissing: "Argus is not accepting USDC launches right now.",
  NothingOwed: "No fees to claim yet.",
};
