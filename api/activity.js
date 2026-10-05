// Wallet activity for the Arc Kit mobile app.
//   GET ?address=0x…  -> { items: [{ hash, ts, from, to, value, token?, fn, ok }] }   newest first, last 60
// Arc RPCs prune history, so this reads Etherscan's indexer (normal + ERC-20 transfers) server-side with our key
// and caches each address for 30 s.
const kv = require("./_lib/pay/kv");

const ETHERSCAN = "https://api.etherscan.io/v2/api?chainid=5042";

async function es(params) {
  const key = (process.env.ETHERSCAN_KEY || "").trim();
  if (!key) throw new Error("ETHERSCAN_KEY not configured");
  const u = `${ETHERSCAN}&${new URLSearchParams({ ...params, apikey: key })}`;
  for (let attempt = 0; ; attempt++) {
    const j = await (await fetch(u, { signal: AbortSignal.timeout(20_000) })).json();
    if (/rate limit/i.test(String(j.result)) && attempt < 3) { await new Promise((r) => setTimeout(r, 1200)); continue; }
    if (j.status !== "1") return [];
    return j.result;
  }
}

const KNOWN = {
  "0xf2e95760534c92268ef7c8f9bc28b84b75129631": "ArcP2P",
  "0xbf0ad5cae94a9e4abeaefc7ca5816b7f28983793": "ArcLend",
  "0xdf2640625231b662a949e0b3c868f9d9109cfeaf": "ArcLock",
  "0x5d2828b7bdde377b51713dfa31afba83c6011788": "Vesting",
  "0x89ad5678d3edb28ee067d430ab384ed4a3136ec3": "Airdrop",
  "0x9b226f3e6fdf0798da926c9b3686ef6fe826ea46": "Staking",
  "0x958db3732bfb021c2f2879b9124decba0b30cd2c": "ArcPay",
  "0xdbf688e09c296df6ef4a02995427ee637d1e3ebe": "ArcCash",
  "0x0303ae09b4f9f599823634aa9c88b6a517b24e1b": "ArcCash",
};

module.exports = async (req, res) => {
  // read-only and public: let the mobile app's web preview and other sites call it directly
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  res.setHeader("Content-Type", "application/json");
  const url = new URL(req.url, "http://x");
  const address = String(url.searchParams.get("address") || "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(address)) { res.statusCode = 400; return res.end(JSON.stringify({ error: "Bad address." })); }
  try {
    const cacheKey = `activity:v2:${address}`;
    let items = kv.configured() ? await kv.getJson(cacheKey).catch(() => null) : null;
    if (!Array.isArray(items)) {
      const [txs, erc20] = await Promise.all([
        es({ module: "account", action: "txlist", address, startblock: 0, endblock: 99999999, page: 1, offset: 60, sort: "desc" }),
        new Promise((r) => setTimeout(r, 400)).then(() => es({ module: "account", action: "tokentx", address, startblock: 0, endblock: 99999999, page: 1, offset: 60, sort: "desc" })),
      ]);
      const byHash = new Map();
      for (const t of txs) {
        const to = String(t.to || "").toLowerCase();
        const fn = t.functionName ? t.functionName.replace(/\(.*$/, "") : t.input && t.input !== "0x" ? "contract call" : "transfer";
        byHash.set(t.hash, { hash: t.hash, ts: Number(t.timeStamp), from: t.from, to: t.to, value: String(t.value), fn: KNOWN[to] ? `${KNOWN[to]} · ${fn}` : fn, ok: t.isError === "0" && t.txreceipt_status !== "0" });
      }
      // Arc logs each native USDC move twice: as the 6-decimal USDC token (0x3600…) and from the system address
      // 0xffff…fffe with no symbol and 0 decimals but an 18-decimal amount. Drop the system copy, and per transaction
      // show the transfer that involves this wallet, preferring a non-USDC token (the thing actually traded).
      const SYSTEM = "0xfffffffffffffffffffffffffffffffffffffffe";
      const pick = new Map();
      for (const t of erc20) {
        if (String(t.contractAddress).toLowerCase() === SYSTEM) continue;
        if (String(t.from).toLowerCase() !== address && String(t.to).toLowerCase() !== address) continue;
        const cur = pick.get(t.hash);
        const isUsdc = String(t.tokenSymbol).toUpperCase() === "USDC";
        if (!cur || (cur.isUsdc && !isUsdc)) pick.set(t.hash, { t, isUsdc });
      }
      for (const { t } of pick.values()) {
        const prev = byHash.get(t.hash);
        const decimals = Number(t.tokenDecimal);
        const token = { symbol: t.tokenSymbol || "TOKEN", decimals: Number.isFinite(decimals) ? decimals : 18, address: t.contractAddress };
        const patch = { token, tokenValue: String(t.value), tokenFrom: t.from, tokenTo: t.to };
        if (prev) Object.assign(prev, patch);
        else byHash.set(t.hash, { hash: t.hash, ts: Number(t.timeStamp), from: t.from, to: t.to, value: "0", ...patch, fn: "token transfer", ok: true });
      }
      items = [...byHash.values()].sort((a, b) => b.ts - a.ts).slice(0, 60).map((it) => ({
        hash: it.hash, ts: it.ts, from: it.tokenFrom || it.from, to: it.tokenTo || it.to,
        value: it.token ? it.tokenValue : it.value, token: it.token, fn: it.fn, ok: it.ok,
      }));
      if (kv.configured()) await kv.setJson(cacheKey, items, { ex: 30 }).catch(() => {});
    }
    res.setHeader("Cache-Control", "public, max-age=15");
    return res.end(JSON.stringify({ address, items }));
  } catch (e) {
    console.error("[activity]", e);
    res.statusCode = 502;
    return res.end(JSON.stringify({ error: "Could not load activity right now." }));
  }
};
