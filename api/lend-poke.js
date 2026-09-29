// ArcLend keeper. Vercel cron calls this every few minutes to accrue interest and record a fresh oracle observation
// on every market, so the 30-minute TWAP is always covered even when nobody is transacting. Also callable by hand.
// Uses the ArcCash relayer wallet (already funded with USDC for gas): ARCCASH_RELAYER_KEY.
const { createPublicClient, createWalletClient, http, fallback, defineChain, parseAbi } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");

const LEND = (process.env.ARCLEND_ADDRESS || "").trim();
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
    const results = [];
    for (let id = 0; id < n; id++) {
      try {
        const hash = await wallet.writeContract({ address: LEND, abi, functionName: "poke", args: [BigInt(id)] });
        results.push({ id, hash });
      } catch (e) {
        results.push({ id, error: (e && e.shortMessage) || String(e).slice(0, 120) });
      }
    }
    return send(200, { keeper: account.address, markets: n, results });
  } catch (e) {
    console.error("[lend-poke]", e);
    return send(500, { error: (e && e.shortMessage) || "keeper failed" });
  }
};
