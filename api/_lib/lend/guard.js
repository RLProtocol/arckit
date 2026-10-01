// ArcLend guardian: watches every market's live pool price and liquidates underwater positions at spot through
// ArcLend.guardianLiquidate. Shared by the Vercel cron function (api/lend-guard.js, loops inside one invocation)
// and the standalone keeper (keeper/liquidator.mjs, runs forever). Borrowers are discovered from Borrowed events
// and refreshed periodically; each tick reads liquidationState for every known borrower.
const { createPublicClient, createWalletClient, http, fallback, defineChain, parseAbi, formatEther } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");

const abi = parseAbi([
  "function marketCount() view returns (uint256)",
  "function guardian() view returns (address)",
  "function poke(uint256 id)",
  "function liquidationState(uint256 id, address user) view returns (uint256 debt, uint256 collateral, uint256 twap, uint256 spotPrice, uint256 liqPrice, bool byPublic, bool byGuardian)",
  "function guardianLiquidate(uint256 id, address borrower) payable returns (uint256 repaid, uint256 seized)",
  "event Borrowed(uint256 indexed id, address indexed user, uint256 amount)",
]);
const arc = defineChain({ id: 5042, name: "Arc", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: ["https://5042.rpc.thirdweb.com"] } } });
const transport = () => fallback([process.env.ARC_RPC_URL, "https://5042.rpc.thirdweb.com", "https://rpc.arc-scan.org"].filter(Boolean).map((u) => http(u, { timeout: 10_000, retryCount: 2 })));

const KEEP_GAS = 10n ** 17n; // always leave 0.1 USDC in the wallet for gas
const MAX_POKE_AGE_MS = 60_000; // refresh oracle observations at most once a minute per market

function createGuard({ lend, deployBlock, key, log = console.log }) {
  const account = privateKeyToAccount(key);
  const pub = createPublicClient({ chain: arc, transport: transport() });
  const wallet = createWalletClient({ account, chain: arc, transport: transport() });
  const borrowers = new Map(); // market id -> Set<address>
  let scannedTo = BigInt(deployBlock) - 1n;
  let lastPoke = 0;
  let marketCount = 0;

  /** Pull Borrowed events since the last scan (chunked: Arc RPCs cap eth_getLogs at 100k blocks). */
  async function refreshBorrowers() {
    const head = await pub.getBlockNumber({ cacheTime: 0 });
    marketCount = Number(await pub.readContract({ address: lend, abi, functionName: "marketCount" }));
    for (let from = scannedTo + 1n; from <= head; from += 50_000n) {
      const to = from + 49_999n < head ? from + 49_999n : head;
      const logs = await pub.getContractEvents({ address: lend, abi, eventName: "Borrowed", fromBlock: from, toBlock: to, strict: true });
      for (const l of logs) {
        const id = Number(l.args.id);
        if (!borrowers.has(id)) borrowers.set(id, new Set());
        borrowers.get(id).add(l.args.user.toLowerCase());
      }
      scannedTo = to;
    }
    return [...borrowers.values()].reduce((n, s) => n + s.size, 0);
  }

  /** One pass over every known borrower; liquidates anything the guardian may close. Returns what it did. */
  async function tick() {
    const actions = [];
    const now = Date.now();
    // No periodic pokes here: every cron invocation starts a fresh guard, so poking from tick() meant five
    // transactions a minute and drained the wallet (2026-09-30). The ten-minute keeper (api/lend-poke.js) records
    // observations; guardianLiquidate pokes on its own before pricing.
    void now; void lastPoke;
    for (const [id, users] of borrowers) {
      for (const user of users) {
        let st;
        try {
          st = await pub.readContract({ address: lend, abi, functionName: "liquidationState", args: [BigInt(id), user] });
        } catch (e) {
          actions.push({ id, user, error: "read: " + (e.shortMessage || e.message) });
          continue;
        }
        const [debt, collateral, , spot, liqPrice, , byGuardian] = st;
        if (debt === 0n) { users.delete(user); continue; } // repaid or fully liquidated
        if (!byGuardian) continue;
        // repay as much as the rules allow, bounded by what the wallet holds (contract returns any excess)
        const balance = await pub.getBalance({ address: account.address });
        const spend = balance > KEEP_GAS ? balance - KEEP_GAS : 0n;
        if (spend === 0n) { actions.push({ id, user, error: "guardian wallet has no USDC to repay with" }); continue; }
        try {
          const hash = await wallet.writeContract({ address: lend, abi, functionName: "guardianLiquidate", args: [BigInt(id), user], value: spend < debt ? spend : debt });
          log(`[guard] liquidated market ${id} ${user} debt ${formatEther(debt)} spot ${formatEther(spot)} liq ${formatEther(liqPrice)} tx ${hash}`);
          actions.push({ id, user, hash, debt: debt.toString(), collateral: collateral.toString() });
        } catch (e) {
          actions.push({ id, user, error: "liquidate: " + (e.shortMessage || e.message) });
        }
      }
    }
    return actions;
  }

  return { account, refreshBorrowers, tick, borrowers };
}

module.exports = { createGuard, abi };
