// ArcCash relayer. Pays the gas for withdrawals so the recipient never needs a funded wallet.
//   GET  ?op=config            relayer address, fee (0), pools
//   POST ?op=withdraw          { pool, pA, pB, pC, root, nullifierHash, recipient, fee } -> { hash }
//   GET  ?op=status&hash=0x…   { status: "pending" | "success" | "reverted" }
// The proof binds relayer + fee, so a request can only pay out the way the prover intended. Every request is
// simulated before it is broadcast, so an invalid proof costs the relayer nothing but CPU. The relayer learns the
// recipient address and the caller's IP, and nothing about which deposit was spent.
const { createPublicClient, createWalletClient, http, fallback, defineChain, parseAbi, isAddress, getAddress, BaseError, ContractFunctionRevertedError } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const kv = require("./_lib/pay/kv");

const POOLS = {
  "0xdbf688e09c296df6ef4a02995427ee637d1e3ebe": { label: "1 USDC", denomination: 10n ** 18n },
  "0x0303ae09b4f9f599823634aa9c88b6a517b24e1b": { label: "10 USDC", denomination: 10n * 10n ** 18n },
};
const FEE = 0n; // we cover gas; nothing is taken from the withdrawal
const MAX_GAS = 900_000n;
const PER_IP_PER_HOUR = 6;

const abi = parseAbi([
  "function withdraw(uint256[2] _pA, uint256[2][2] _pB, uint256[2] _pC, bytes32 _root, bytes32 _nullifierHash, address _recipient, address _relayer, uint256 _fee, uint256 _refund) payable",
  "error UnknownRoot()",
  "error NoteAlreadySpent()",
  "error InvalidProof()",
  "error FeeExceedsDenomination()",
  "error RefundNotSupported()",
  "error TransferFailed()",
]);
const arc = defineChain({ id: 5042, name: "Arc", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: ["https://5042.rpc.thirdweb.com"] } } });
const transport = () => fallback([process.env.ARC_RPC_URL, "https://5042.rpc.thirdweb.com", "https://rpc.arc-scan.org"].filter(Boolean).map((u) => http(u, { timeout: 12_000, retryCount: 2 })));
const pub = () => createPublicClient({ chain: arc, transport: transport() });

function account() {
  const k = (process.env.ARCCASH_RELAYER_KEY || "").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(k)) return null;
  return privateKeyToAccount(k);
}

class UserError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const uint = (v, what) => { if (typeof v !== "string" || !/^\d+$/.test(v)) throw new UserError(`Bad ${what}.`); return BigInt(v); };
const uints = (a, n, what) => { if (!Array.isArray(a) || a.length !== n) throw new UserError(`Bad ${what}.`); return a.map((x) => uint(x, what)); };

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let data = typeof req.body === "string" ? req.body : "";
    if (data) return resolve(safeJson(data));
    req.on("data", (c) => { data += c; if (data.length > 16 * 1024) reject(new UserError("Request too large.", 413)); });
    req.on("end", () => resolve(safeJson(data)));
    req.on("error", reject);
  });
}
const safeJson = (s) => { try { return JSON.parse(s || "{}"); } catch { return {}; } };
function send(res, status, body, cache) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", cache || "no-store");
  res.end(JSON.stringify(body));
}
function revertReason(e) {
  if (e instanceof BaseError) {
    const r = e.walk((x) => x instanceof ContractFunctionRevertedError);
    const name = r?.data?.errorName;
    if (name === "NoteAlreadySpent") return "This note has already been withdrawn.";
    if (name === "UnknownRoot") return "The pool changed while you were proving. Generate the proof again.";
    if (name === "InvalidProof") return "The pool rejected the proof.";
    if (name) return `The pool rejected the withdrawal (${name}).`;
    return e.shortMessage || e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

module.exports = async (req, res) => {
  const url = new URL(req.url, "http://x");
  const op = url.searchParams.get("op") || "";
  const relayer = account();
  try {
    if (req.method === "GET" && op === "config") {
      return send(res, 200, { ready: !!relayer, relayer: relayer?.address ?? null, fee: FEE.toString(), pools: Object.keys(POOLS) }, "public, max-age=60");
    }
    if (req.method === "GET" && op === "status") {
      const hash = url.searchParams.get("hash") || "";
      if (!HEX32.test(hash)) throw new UserError("Bad hash.");
      const rc = await pub().getTransactionReceipt({ hash }).catch(() => null);
      return send(res, 200, { status: rc ? rc.status : "pending" });
    }
    if (req.method === "POST" && op === "withdraw") {
      if (!relayer) throw new UserError("The relayer is not available right now. You can pay gas yourself instead.", 503);
      const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "?").split(",")[0].trim();
      if (kv.configured()) {
        const n = await kv.incr(`cash:rl:${ip}`, 3600);
        if (n > PER_IP_PER_HOUR) throw new UserError("Too many withdrawals from this connection. Try again in an hour.", 429);
      }
      const b = await readBody(req);
      const poolKey = String(b.pool || "").toLowerCase();
      if (!POOLS[poolKey]) throw new UserError("Unknown pool.");
      const pA = uints(b.pA, 2, "proof");
      if (!Array.isArray(b.pB) || b.pB.length !== 2) throw new UserError("Bad proof.");
      const pB = [uints(b.pB[0], 2, "proof"), uints(b.pB[1], 2, "proof")];
      const pC = uints(b.pC, 2, "proof");
      if (!HEX32.test(b.root) || !HEX32.test(b.nullifierHash)) throw new UserError("Bad root or nullifier.");
      if (!isAddress(b.recipient || "")) throw new UserError("Bad recipient.");
      const recipient = getAddress(b.recipient);
      const fee = uint(String(b.fee ?? "0"), "fee");
      if (fee !== FEE) throw new UserError(`The relayer fee is ${FEE}. Prove with that fee.`);
      const args = [pA, pB, pC, b.root, b.nullifierHash, recipient, relayer.address, fee, 0n];

      const client = pub();
      // simulate first: rejects bad proofs, spent notes, stale roots, and the wrong relayer bound in the proof
      let gas;
      try {
        gas = await client.estimateContractGas({ address: getAddress(poolKey), abi, functionName: "withdraw", args, account: relayer.address });
      } catch (e) {
        throw new UserError(revertReason(e), 422);
      }
      if (gas > MAX_GAS) throw new UserError("Withdrawal needs more gas than the relayer allows.", 422);
      const wallet = createWalletClient({ account: relayer, chain: arc, transport: transport() });
      const hash = await wallet.writeContract({ address: getAddress(poolKey), abi, functionName: "withdraw", args, gas: (gas * 12n) / 10n });
      return send(res, 200, { hash });
    }
    return send(res, 404, { error: "Unknown operation." });
  } catch (e) {
    if (e instanceof UserError) return send(res, e.status, { error: e.message });
    console.error("[cash]", e);
    return send(res, 500, { error: "The relayer hit an error. Try again, or pay gas yourself." });
  }
};
