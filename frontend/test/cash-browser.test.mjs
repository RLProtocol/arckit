// Proves a withdrawal inside headless Chrome (against the Vite dev server) and checks the proof with the
// Groth16 verifier deployed on Arc mainnet, via eth_call. No transaction is sent.
//   NOTE=<arccash note> RPC=<arc rpc> PW=<dir with playwright installed> node test/cash-browser.test.mjs
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createPublicClient, http, parseAbi } from "viem";

const { chromium } = await import(pathToFileURL(path.join(process.env.PW, "node_modules/playwright/index.mjs")).href);
const note = process.env.NOTE;
const recipient = "0x000000000000000000000000000000000000dEaD";
const here = path.resolve(import.meta.dirname);

const b = await chromium.launch({ channel: "chrome" });
const p = await b.newPage();
p.on("console", (m) => { if (m.type() === "error") console.log("  browser:", m.text().slice(0, 200)); });
await p.goto("http://localhost:5173/cash", { waitUntil: "networkidle" });
const modUrl = "/@fs/" + here.replace(/\\/g, "/") + "/cash-browser.ts";
const t0 = Date.now();
const r = await p.evaluate(async ([modUrl, note, recipient]) => {
  const m = await import(modUrl);
  return m.proveInBrowser(note, recipient);
}, [modUrl, note, recipient]);
await b.close();
console.log(`browser: ${r.leaves} leaves, ours at ${r.leafIndex}; proof in ${r.ms} ms (wall ${Date.now() - t0} ms)`);
console.log("stages:", r.stages.filter((s, i, a) => a.indexOf(s) === i).join(" → "));

const client = createPublicClient({ transport: http(process.env.RPC) });
const ok = await client.readContract({
  address: "0x6d25c8ebe5549adf216a48a12660664b8b23e4fd",
  abi: parseAbi(["function verifyProof(uint256[2] _pA, uint256[2][2] _pB, uint256[2] _pC, uint256[6] _pubSignals) view returns (bool)"]),
  functionName: "verifyProof",
  args: [r.pA.map(BigInt), r.pB.map((x) => x.map(BigInt)), r.pC.map(BigInt), r.pub.map(BigInt)],
});
const knownRoot = await client.readContract({ address: r.pool, abi: parseAbi(["function isKnownRoot(bytes32) view returns (bool)"]), functionName: "isKnownRoot", args: [`0x${BigInt(r.pub[0]).toString(16).padStart(64, "0")}`] });
console.log("on-chain verifier accepts the browser proof:", ok);
console.log("browser-rebuilt root is known to the pool:", knownRoot);
process.exit(ok && knownRoot ? 0 : 1);
