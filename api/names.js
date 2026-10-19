// .arc names: websites and uploads.
//   GET  ?op=site&name=alice&path=/about   -> serves alice.arc's website (its contenthash on ArcNames), via IPFS
//   POST ?op=upload { files: [{ path, data(base64) }] } -> pins a folder to IPFS -> { cid, uri: "ipfs://cid" }
// name.usearckit.online is rewritten here by host (vercel.json). The contract is the source of truth; this only
// reads it. HTML-sized files are proxied so the URL stays on the name; anything large redirects to the gateway.
const kv = require("./_lib/pay/kv");
const { createPublicClient, http, fallback, parseAbi } = require("viem");

const NAMES = "0x4C643E7133c20816dF778Cb4FcEF004201852F08";
const GATEWAY = "https://gateway.pinata.cloud/ipfs/";
const MAX_PROXY = 4_000_000; // Vercel response limit is 4.5 MB
const MAX_UPLOAD = 4_000_000;
const abi = parseAbi(["function contenthash(string label) view returns (string)", "function resolve(string label) view returns (address)", "function isValid(string label) view returns (bool)"]);

const client = createPublicClient({
  transport: fallback([process.env.ARC_RPC_URL, "https://5042.rpc.thirdweb.com"].filter(Boolean).map((u) => http(u, { timeout: 10_000, retryCount: 1 }))),
});

const TYPES = { html: "text/html; charset=utf-8", css: "text/css", js: "text/javascript", mjs: "text/javascript", json: "application/json", svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", ico: "image/x-icon", txt: "text/plain; charset=utf-8", woff2: "font/woff2", woff: "font/woff", ttf: "font/ttf", mp4: "video/mp4", wasm: "application/wasm", xml: "application/xml" };
const ext = (p) => (p.match(/\.([a-z0-9]+)$/i)?.[1] || "").toLowerCase();
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

async function siteOf(label) {
  const key = `names:site:${label}`;
  try { const hit = await kv.get(key); if (hit !== null && hit !== undefined) return hit; } catch { /* no cache */ }
  const hash = await client.readContract({ address: NAMES, abi, functionName: "contenthash", args: [label] });
  try { await kv.set(key, hash, { ex: 60 }); } catch { /* best effort */ }
  return hash;
}

function placeholder(res, label, status) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=30");
  const title = status === 404 && label ? `${esc(label)}.arc` : "Arc names";
  const body = status === 404 && label
    ? `<p>${esc(label)}.arc has no website yet.</p><a href="https://www.usearckit.online/names?q=${encodeURIComponent(label)}">See ${esc(label)}.arc on Arc Kit</a>`
    : `<p>That is not a valid .arc name.</p><a href="https://www.usearckit.online/names">Find a name</a>`;
  res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#071426;color:#eef4ff;font:16px/1.5 system-ui,sans-serif;text-align:center}h1{font-weight:600;margin:0 0 8px}a{color:#5fe3c9}p{color:#a9b9d6}</style></head><body><main><h1>${title}</h1>${body}</main></body></html>`);
}

// Public gateways in order. Pinata's public gateway refuses HTML, so pages come from Filebase; a dedicated
// gateway (PINATA_GATEWAY, e.g. https://name.mypinata.cloud/ipfs/) goes first when configured.
const GATEWAYS = [process.env.PINATA_GATEWAY, "https://ipfs.filebase.io/ipfs/", GATEWAY].filter(Boolean);

/** One file from the first gateway that has it. null when every gateway says 404. */
async function fetchFile(root, p) {
  let notFound = false;
  for (const g of GATEWAYS) {
    try {
      const r = await fetch(`${g}${root}${p}`, { signal: AbortSignal.timeout(15_000) });
      if (r.ok) return { r, url: `${g}${root}${p}` };
      if (r.status === 404) notFound = true; // keep asking: a gateway may not have fetched it yet
    } catch { /* timeout: next gateway */ }
  }
  if (notFound) return null;
  throw new Error("IPFS gateways are not answering. Try again in a minute.");
}

/** Fetches one path of an IPFS folder, trying page-style fallbacks for clean URLs and single-page apps. */
async function fromIpfs(root, path) {
  const tries = path.endsWith("/") ? [`${path}index.html`] : ext(path) ? [path] : [path, `${path}.html`, `${path}/index.html`, "/index.html"];
  for (const p of tries) {
    const got = await fetchFile(root, p);
    if (got) return { r: got.r, p, url: got.url };
  }
  return null;
}

async function serveSite(req, res) {
  const label = String(req.query.name || "").toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{1,30})[a-z0-9]$/.test(label)) return placeholder(res, "", 400);
  let path = "/" + String(req.query.path || "").replace(/^\/+/, "");
  if (path.includes("..")) return placeholder(res, label, 400);
  const hash = await siteOf(label);
  // ipfs://CID or ipfs://CID/sub/folder (a zip with one top-level folder)
  const m = /^ipfs:\/\/([a-zA-Z0-9]+)((?:\/[A-Za-z0-9._~-]+)*)\/?$/.exec(hash || "");
  if (!m) return placeholder(res, label, 404);
  const root = m[1] + (m[2] || "");
  const got = await fromIpfs(root, path);
  if (!got) return placeholder(res, label, 404);
  const { r, p, url } = got;
  const len = Number(r.headers.get("content-length") || 0);
  if (len > MAX_PROXY) { res.statusCode = 302; res.setHeader("Location", url); return res.end(); }
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > MAX_PROXY) { res.statusCode = 302; res.setHeader("Location", url); return res.end(); }
  res.statusCode = r.status;
  res.setHeader("Content-Type", TYPES[ext(p)] || r.headers.get("content-type") || "application/octet-stream");
  res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=600");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.end(buf);
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body);
  const chunks = [];
  let size = 0;
  for await (const c of req) { size += c.length; if (size > MAX_UPLOAD * 1.4) throw new Error("too large"); chunks.push(c); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function upload(req, res) {
  const jwt = (process.env.PINATA_JWT || "").trim();
  if (!jwt) return res.status(503).json({ error: "Uploads are not configured." });
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "anon";
  try {
    const n = Number((await kv.get(`names:up:${ip}`)) || 0);
    if (n >= 20) return res.status(429).json({ error: "Too many uploads. Try again in an hour." });
    await kv.set(`names:up:${ip}`, String(n + 1), { ex: 3600 });
  } catch { /* no limiter without KV */ }
  let body;
  try { body = await readJson(req); } catch { return res.status(413).json({ error: "The site is too large (4 MB max)." }); }
  const files = Array.isArray(body.files) ? body.files : [];
  if (!files.length || files.length > 300) return res.status(400).json({ error: "Add between 1 and 300 files." });
  const form = new FormData();
  let total = 0;
  for (const f of files) {
    const rel = String(f.path || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (!rel || rel.includes("..") || typeof f.data !== "string") return res.status(400).json({ error: `Bad file: ${rel || "(no name)"}` });
    const buf = Buffer.from(f.data, "base64");
    total += buf.length;
    if (total > MAX_UPLOAD) return res.status(413).json({ error: "The site is too large (4 MB max)." });
    form.append("file", new Blob([buf], { type: TYPES[ext(rel)] || "application/octet-stream" }), `site/${rel}`);
  }
  if (!files.some((f) => /(^|\/)index\.html$/i.test(String(f.path)))) return res.status(400).json({ error: "The site needs an index.html." });
  form.append("pinataMetadata", JSON.stringify({ name: `arcname-site-${Date.now()}` }));
  const r = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", { method: "POST", headers: { Authorization: `Bearer ${jwt}` }, body: form, signal: AbortSignal.timeout(60_000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.IpfsHash) return res.status(502).json({ error: "IPFS upload failed. Try again." });
  // single top-level folder (e.g. a zipped "dist/"): point at it so index.html sits at the root
  const tops = new Set(files.map((f) => String(f.path).replace(/^\/+/, "").split("/")[0]));
  const nested = tops.size === 1 && files.every((f) => String(f.path).includes("/"));
  return res.status(200).json({ cid: j.IpfsHash, uri: nested ? `ipfs://${j.IpfsHash}/${[...tops][0]}` : `ipfs://${j.IpfsHash}`, bytes: total });
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  if (req.method === "OPTIONS") return res.status(204).end();
  const op = String(req.query.op || "");
  try {
    if (op === "site") return await serveSite(req, res);
    if (op === "upload" && req.method === "POST") return await upload(req, res);
    return res.status(404).json({ error: "unknown op" });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e).slice(0, 200) });
  }
};
