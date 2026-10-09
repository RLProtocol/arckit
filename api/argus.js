// Argus launchpad (Portal #8) support for the Arc Kit app's Launch tab.
//   POST ?op=salt      { creator, buyTaxBps, sellTaxBps }  -> { hookSalt, hook, escrow, attempts }
//   POST ?op=image     { data: base64, type }               -> { uri }   (ipfs:// when PINATA_JWT is set, else https)
//   GET  ?op=img&id=…                                        -> the image (fallback hosting)
//   GET  ?op=launches&creator=0x…                            -> { launches: [{ token, hook, escrow, ..., meta }] }
// The salt is a pure search the phone re-checks against the Portal before signing, so nothing here can redirect funds:
// a wrong salt only makes the launch revert. Launch history comes from Etherscan logs because Arc RPCs prune events.
const crypto = require("crypto");
const kv = require("./_lib/pay/kv");
const { findHookSalt, PORTAL } = require("./_lib/argus/salt");

const USDC_ERC20 = "0x3600000000000000000000000000000000000000";
const ETHERSCAN = "https://api.etherscan.io/v2/api?chainid=5042";
const LAUNCHED = "0xc32e25061af0b7f7d77b7fb015333ecb0004127b71abbda4d7ba4c18bcd497f3"; // Launched(address,address,address,address,address,uint256,int24,int24)
const METADATA = "0x" + require("viem").keccak256(Buffer.from("LaunchMetadata(address,string,string,string,string,string)")).slice(2);
const MAX_IMAGE = 700_000; // bytes after base64 decoding; the app sends a ~512px JPEG

const isAddr = (a) => typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a);
const pad = (a) => "0x" + a.toLowerCase().slice(2).padStart(64, "0");
const word = (data, i) => data.slice(2 + i * 64, 2 + (i + 1) * 64);

async function logs(params) {
  const key = (process.env.ETHERSCAN_KEY || "").trim();
  if (!key) throw new Error("ETHERSCAN_KEY not configured");
  const u = `${ETHERSCAN}&module=logs&action=getLogs&address=${PORTAL}&fromBlock=0&toBlock=latest&page=1&offset=1000&${params}&apikey=${key}`;
  for (let attempt = 0; ; attempt++) {
    const j = await (await fetch(u, { signal: AbortSignal.timeout(20_000) })).json();
    if (/rate limit/i.test(String(j.result)) && attempt < 3) { await new Promise((r) => setTimeout(r, 1200)); continue; }
    if (j.status !== "1") { if (/no records/i.test(String(j.message))) return []; throw new Error("etherscan: " + (j.result || j.message)); }
    return j.result;
  }
}

function decodeStrings(data, n) {
  const hex = data.slice(2);
  const out = [];
  for (let i = 0; i < n; i++) {
    const off = parseInt(hex.slice(i * 64, i * 64 + 64), 16) * 2;
    const len = parseInt(hex.slice(off, off + 64), 16);
    out.push(Buffer.from(hex.slice(off + 64, off + 64 + len * 2), "hex").toString("utf8"));
  }
  return out;
}

async function metaFor(token) {
  const key = `argus:meta:${token}`;
  try { const hit = await kv.get(key); if (hit) return JSON.parse(hit); } catch { /* fall through */ }
  const ls = await logs(`topic0=${METADATA}&topic0_1_opr=and&topic1=${pad(token)}`);
  if (!ls.length) return null;
  const [imageURI, website, twitter, telegram, description] = decodeStrings(ls[0].data, 5);
  const meta = { imageURI, website, twitter, telegram, description };
  try { await kv.set(key, JSON.stringify(meta)); } catch { /* metadata is immutable; caching is best effort */ }
  return meta;
}

async function launchesOf(creator) {
  const cacheKey = `argus:launches:${creator.toLowerCase()}`;
  try { const hit = await kv.get(cacheKey); if (hit) return JSON.parse(hit); } catch { /* fall through */ }
  const ls = await logs(`topic0=${LAUNCHED}&topic0_2_opr=and&topic2=${pad(creator)}`);
  const out = [];
  for (const l of ls.reverse()) {
    const token = "0x" + l.topics[1].slice(26);
    const d = l.data;
    out.push({
      token,
      hook: "0x" + word(d, 0).slice(24),
      escrow: "0x" + word(d, 1).slice(24),
      locker: "0x" + word(d, 2).slice(24),
      positionId: BigInt("0x" + word(d, 3)).toString(),
      tickStart: Number(BigInt.asIntN(24, BigInt("0x" + word(d, 4)))),
      tickBond: Number(BigInt.asIntN(24, BigInt("0x" + word(d, 5)))),
      txHash: l.transactionHash,
      ts: parseInt(l.timeStamp, 16),
      // metadata never changes and is cached forever; the first look-up for a prolific creator is capped to stay in time
      meta: out.length < 40 ? await metaFor(token).catch(() => null) : null,
    });
    if (out.length <= 40) await new Promise((r) => setTimeout(r, 340)); // Etherscan free tier: 3 calls a second
  }
  try { await kv.set(cacheKey, JSON.stringify(out), { ex: 45 }); } catch { /* best effort */ }
  return out;
}

async function storeImage(buf, type) {
  const jwt = (process.env.PINATA_JWT || "").trim();
  if (jwt) {
    const form = new FormData();
    form.append("file", new Blob([buf], { type }), `arckit-${Date.now()}.${type === "image/png" ? "png" : "jpg"}`);
    form.append("network", "public");
    const r = await fetch("https://uploads.pinata.cloud/v3/files", { method: "POST", headers: { Authorization: `Bearer ${jwt}` }, body: form, signal: AbortSignal.timeout(30_000) });
    const j = await r.json();
    if (!r.ok || !j.data?.cid) throw new Error("IPFS upload failed: " + (j.error?.message || j.error || r.status));
    return `ipfs://${j.data.cid}`;
  }
  // No pinning key: host it ourselves, content-addressed so the URL never changes.
  const id = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 32);
  await kv.set(`argus:img:${id}`, JSON.stringify({ type, b64: buf.toString("base64") }));
  return `https://www.usearckit.online/api/argus?op=img&id=${id}`;
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body);
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  if (req.method === "OPTIONS") return res.status(204).end();
  const op = String(req.query.op || "");
  try {
    if (op === "salt" && req.method === "POST") {
      const { creator, buyTaxBps, sellTaxBps } = await readJson(req);
      const buy = Number(buyTaxBps), sell = Number(sellTaxBps);
      if (!isAddr(creator) || !Number.isInteger(buy) || !Number.isInteger(sell) || buy < 0 || sell < 0 || buy > 1000 || sell > 1000) return res.status(400).json({ error: "bad request" });
      const r = await findHookSalt({ creator, quote: USDC_ERC20, buyTaxBps: buy, sellTaxBps: sell, maxAttempts: 200_000 });
      return res.status(200).json({ hookSalt: r.hookSalt, hook: r.hook, escrow: r.escrow, attempts: r.attempts });
    }
    if (op === "image" && req.method === "POST") {
      const { data, type = "image/jpeg" } = await readJson(req);
      if (!/^image\/(jpeg|png|webp|gif)$/.test(type) || typeof data !== "string") return res.status(400).json({ error: "bad image" });
      const buf = Buffer.from(data, "base64");
      if (!buf.length || buf.length > MAX_IMAGE) return res.status(413).json({ error: "Image is too large. Pick a smaller one." });
      return res.status(200).json({ uri: await storeImage(buf, type) });
    }
    if (op === "img") {
      const id = String(req.query.id || "");
      if (!/^[0-9a-f]{32}$/.test(id)) return res.status(400).end();
      const hit = await kv.get(`argus:img:${id}`);
      if (!hit) return res.status(404).end();
      const { type, b64 } = JSON.parse(hit);
      res.setHeader("Content-Type", type);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return res.status(200).send(Buffer.from(b64, "base64"));
    }
    if (op === "launches") {
      const creator = String(req.query.creator || "");
      if (!isAddr(creator)) return res.status(400).json({ error: "bad creator" });
      res.setHeader("Cache-Control", "s-maxage=20, stale-while-revalidate=60");
      return res.status(200).json({ launches: await launchesOf(creator) });
    }
    return res.status(404).json({ error: "unknown op" });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
};
