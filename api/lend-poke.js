// ArcLend keeper. Vercel cron calls this every ten minutes to record a fresh oracle observation for every market's
// pool, so the 30-minute TWAP tracks the market even when nobody is transacting. It pokes ArcTwapOracle directly
// (cheaper than ArcLend.poke, which also accrues interest; user actions accrue interest anyway).
// Uses the ArcCash relayer wallet for gas: ARCCASH_RELAYER_KEY.
// Cost at ~0.0007 USDC per poke: about 0.5 USDC a day for five markets. Keep the wallet above 1 USDC.
const { createPublicClient, createWalletClient, http, fallback, defineChain, parseAbi } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");

const LEND = (process.env.ARCLEND_ADDRESS || "").trim();
const ORACLE = (process.env.ARCLEND_ORACLE || "0xedf33dA5bED98b5BAbDa4D71F55962CF74462491").trim();
const oracleAbi = parseAbi(["function poke(bytes32 poolId) returns (int24)", "event Poked(bytes32 indexed poolId, int24 tick, uint32 timestamp)"]);
const abi = parseAbi(["function marketCount() view returns (uint256)", "function poke(uint256 id)", "function getMarket(uint256 id) view returns ((address token,uint8 tokenDecimals,uint8 poolUsdcDecimals,bool usdcIs0,bool borrowsPaused,bytes32 poolId,(uint16,uint16,uint16,uint16,uint16,uint16,uint16,uint16,uint256,uint256) risk,uint256 totalSupplyShares,uint256 cash,uint256 totalBorrows,uint256 borrowIndex,uint64 lastAccrual,uint256 reserves,uint256 totalCollateral))"]);
const arc = defineChain({ id: 5042, name: "Arc", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: ["https://5042.rpc.thirdweb.com"] } } });
const transport = () => fallback([process.env.ARC_RPC_URL, "https://5042.rpc.thirdweb.com", "https://rpc.arc-scan.org"].filter(Boolean).map((u) => http(u, { timeout: 12_000, retryCount: 2 })));

module.exports = async (req, res) => {
  const send = (status, body) => { res.statusCode = status; res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify(body)); };
  // Vercel cron requests carry this header; a manual call needs the same secret so nobody can burn the keeper's gas
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) return send(401, { error: "unauthorized" });
  const k = (process.env.ARCCASH_RELAYER_KEY || "").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(k) || !/^0x[0-9a-fA-F]{40}$/.test(LEND)) return send(503, { error: "keeper not configured" });
  const account = privateKeyToAccount(k);
  const pub = createPublicClient({ chain: arc, transport: transport() });
  const wallet = createWalletClient({ account, chain: arc, transport: transport() });
  try {
    const n = Number(await pub.readContract({ address: LEND, abi, functionName: "marketCount" }));
    const balance = await pub.getBalance({ address: account.address });
    const results = [];
    const pools = new Set();
    for (let id = 0; id < n; id++) {
      const m = await pub.readContract({ address: LEND, abi, functionName: "getMarket", args: [BigInt(id)] });
      pools.add(m.poolId);
    }
    for (const poolId of pools) {
      try {
        const hash = await wallet.writeContract({ address: ORACLE, abi: oracleAbi, functionName: "poke", args: [poolId] });
        results.push({ poolId, hash });
      } catch (e) {
        results.push({ poolId, error: (e && e.shortMessage) || String(e).slice(0, 120) });
      }
    }
    if (balance < 10n ** 18n) console.warn("[lend-poke] keeper wallet below 1 USDC:", account.address, balance.toString());
    return send(200, { keeper: account.address, balanceUsdc: Number(balance) / 1e18, markets: n, results });
  } catch (e) {
    console.error("[lend-poke]", e);
    return send(500, { error: (e && e.shortMessage) || "keeper failed" });
  }
};
