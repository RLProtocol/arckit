// Same-origin JSON-RPC proxy for the frontend.
// Forwards read-only Arc RPC calls to the private endpoint in ARC_RPC_URL so the
// API key never ships in the browser bundle and CORS is a non-issue.
// Wallet transactions never pass through here; the user's wallet broadcasts them.

const ALLOWED = new Set([
  "eth_chainId",
  "net_version",
  "eth_blockNumber",
  "eth_getBlockByNumber",
  "eth_getBlockByHash",
  "eth_call",
  "eth_estimateGas",
  "eth_gasPrice",
  "eth_maxPriorityFeePerGas",
  "eth_feeHistory",
  "eth_getBalance",
  "eth_getCode",
  "eth_getStorageAt",
  "eth_getTransactionCount",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "eth_getLogs",
  "eth_createAccessList",
  "web3_clientVersion",
  "net_listening",
  "eth_syncing",
  "eth_blobBaseFee",
]);

const MAX_BODY = 512 * 1024; // 512 KB: multicall batches are well under this

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > MAX_BODY) reject(new Error("body too large"));
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function methodsOf(payload) {
  const list = Array.isArray(payload) ? payload : [payload];
  return list.map((p) => (p && typeof p === "object" ? String(p.method || "") : ""));
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    return res.end(JSON.stringify({ error: "POST only" }));
  }
  // the private node first; public thirdweb when it is missing, down, or refusing the key (it returned 403
  // api_key_blocked on 2026-10-19 and every client fell back to slower public RPCs)
  const upstreams = [process.env.ARC_RPC_URL, "https://5042.rpc.thirdweb.com"].filter(Boolean);

  let raw;
  try {
    raw = typeof req.body === "string" ? req.body : req.body && Object.keys(req.body).length ? JSON.stringify(req.body) : await readBody(req);
  } catch {
    res.statusCode = 413;
    return res.end(JSON.stringify({ error: "body too large" }));
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "invalid JSON" }));
  }

  const bad = methodsOf(payload).find((m) => !ALLOWED.has(m));
  if (bad !== undefined) {
    res.statusCode = 403;
    return res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32601, message: `method not allowed via proxy: ${bad || "(none)"}` } }));
  }

  let last = "error";
  for (const upstream of upstreams) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const r = await fetch(upstream, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: raw,
        signal: controller.signal,
      });
      const text = await r.text();
      if (!r.ok) { last = `HTTP ${r.status}`; continue; } // blocked key, rate limit, outage: try the next one
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      return res.end(text);
    } catch (e) {
      last = e && e.name === "AbortError" ? "timeout" : "error";
    } finally {
      clearTimeout(timer);
    }
  }
  res.statusCode = 502;
  return res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: `upstream unreachable: ${last}` } }));
};
