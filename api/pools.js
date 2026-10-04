// Uniswap v4 pools on Arc that pair a token with USDC, for ArcP2P's market-priced listings.
//   GET ?token=0x…   -> { token, pools: [{ poolId, currency0, currency1, fee, tickSpacing, hooks, usdcIs0, poolUsdcDecimals }] }
// Arc RPCs prune event history after a few days, so pools are found from the PoolManager's Initialize events in
// Etherscan's indexer and cached in KV for an hour. The frontend then reads each pool's liquidity from StateView
// and offers the deepest one. Nothing here is trusted for pricing: the contract reads the pool itself.
const kv = require("./_lib/pay/kv");

const ETHERSCAN = "https://api.etherscan.io/v2/api?chainid=5042";
const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
// Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)
const INITIALIZE_TOPIC = "0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438";
const USDC_ERC20 = "0x3600000000000000000000000000000000000000"; // 6-decimal view
const NATIVE = "0x0000000000000000000000000000000000000000"; // 18-decimal native USDC
const TTL = 3600;

const pad = (addr) => "0x" + addr.toLowerCase().slice(2).padStart(64, "0");
const unpad = (topic) => "0x" + topic.slice(26).toLowerCase();

async function initializeLogs(topicIndex, token) {
  const key = (process.env.ETHERSCAN_KEY || "").trim();
  if (!key) throw new Error("ETHERSCAN_KEY not configured");
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const u = `${ETHERSCAN}&module=logs&action=getLogs&address=${POOL_MANAGER}&topic0=${INITIALIZE_TOPIC}&topic0_${topicIndex}_opr=and&topic${topicIndex}=${pad(token)}&fromBlock=0&toBlock=latest&page=${page}&offset=1000&apikey=${key}`;
    let j;
    for (let attempt = 0; ; attempt++) {
      j = await (await fetch(u, { signal: AbortSignal.timeout(20_000) })).json();
      if (!/rate limit/i.test(String(j.result)) || attempt >= 3) break;
      await new Promise((r) => setTimeout(r, 1200)); // free tier: 3 calls per second
    }
    if (j.status !== "1") {
      if (/no records/i.test(String(j.message))) break;
      throw new Error("etherscan: " + (j.result || j.message));
    }
    out.push(...j.result);
    if (j.result.length < 1000) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  return out;
}

function decode(log) {
  const d = log.data.slice(2);
  return {
    poolId: log.topics[1],
    currency0: unpad(log.topics[2]),
    currency1: unpad(log.topics[3]),
    fee: parseInt(d.slice(0, 64), 16),
    tickSpacing: Number(BigInt.asIntN(24, BigInt("0x" + d.slice(64, 128)))),
    hooks: "0x" + d.slice(128 + 24, 192),
    block: parseInt(log.blockNumber, 16),
  };
}

async function poolsFor(token) {
  const as1 = await initializeLogs(3, token);
  await new Promise((r) => setTimeout(r, 400));
  const as0 = await initializeLogs(2, token);
  const seen = new Set();
  const pools = [];
  for (const log of [...as1, ...as0]) {
    const p = decode(log);
    if (seen.has(p.poolId)) continue;
    seen.add(p.poolId);
    const other = p.currency0 === token ? p.currency1 : p.currency0;
    if (other !== USDC_ERC20 && other !== NATIVE) continue;
    pools.push({ ...p, usdcIs0: p.currency0 !== token, poolUsdcDecimals: other === NATIVE ? 18 : 6 });
  }
  return pools.sort((a, b) => a.block - b.block);
}

module.exports = async (req, res) => {
  // read-only and public: let the mobile app's web preview and other sites call it directly
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  res.setHeader("Content-Type", "application/json");
  const url = new URL(req.url, "http://x");
  const token = String(url.searchParams.get("token") || "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(token)) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "Bad token address." }));
  }
  try {
    const cacheKey = `pools:${token}`;
    let pools = kv.configured() ? await kv.getJson(cacheKey).catch(() => null) : null;
    if (!Array.isArray(pools)) {
      pools = await poolsFor(token);
      if (kv.configured()) await kv.setJson(cacheKey, pools, { ex: TTL }).catch(() => {});
    }
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.end(JSON.stringify({ token, pools }));
  } catch (e) {
    console.error("[pools]", e);
    res.statusCode = 502;
    res.setHeader("Cache-Control", "no-store");
    return res.end(JSON.stringify({ error: "Could not look up pools right now." }));
  }
};
