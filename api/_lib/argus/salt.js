// Hook-salt search for Argus Portal #8 launches.
//
// Uniswap v4 reads a hook's permissions from the low 14 bits of its address, so every launch needs a `hookSalt`
// whose CREATE2 address carries exactly the flags the Argus tax hook declares. The address is
//   create2(hookFactory, hookSalt, keccak256(initCode))
// and initCode embeds the launch's escrow address, which itself depends on (creator, hookSalt):
//   escrow = create2(partsFactory, keccak256(portal ‖ keccak256("argus.v5.escrow" ‖ creator ‖ hookSalt)), escrowInitCodeHash)
// So each attempt changes the escrow word inside a ~20 KB init code. Keccak absorbs input in 136-byte blocks, so the
// unchanged prefix is absorbed once and the sponge state is cloned per attempt; only the tail is hashed each time.
// Expected attempts: 2^14 = 16,384 (an exact 14-bit match). Typically well under a second in Node.
const { keccak_256 } = require("@noble/hashes/sha3");
const { createPublicClient, http, fallback, defineChain, parseAbi, getAddress, concat, keccak256, encodePacked, toHex, hexToBytes, bytesToHex } = require("viem");

const PORTAL = "0xeed7559B8A6ABf64427dc41Cb5cc6400109C5D93";
const ALL_MASK = (1n << 14n) - 1n;
// ArgusV5TaxHook: BEFORE_INITIALIZE | BEFORE_SWAP | AFTER_SWAP | BEFORE_SWAP_RETURNS_DELTA | AFTER_SWAP_RETURNS_DELTA
const REQUIRED = (1n << 13n) | (1n << 7n) | (1n << 6n) | (1n << 3n) | (1n << 2n);

const arc = defineChain({ id: 5042, name: "Arc", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: ["https://5042.rpc.thirdweb.com"] } } });
const client = () => createPublicClient({ chain: arc, transport: fallback([process.env.ARC_RPC_URL, "https://5042.rpc.thirdweb.com"].filter(Boolean).map((u) => http(u, { timeout: 15_000, retryCount: 2 }))) });

const portalAbi = parseAbi([
  "function partsFactory() view returns (address)",
  "function hookFactory() view returns (address)",
  "function hookInitCodeTemplate(address quote, uint16 buyTaxBps, uint16 sellTaxBps) view returns (bytes)",
  "function hookInitCodeHash(address creator, bytes32 hookSalt, address quote, uint16 buyTaxBps, uint16 sellTaxBps) view returns (bytes32)",
  "function predictEscrow(address creator, bytes32 hookSalt) view returns (address)",
]);
const partsAbi = parseAbi(["function escrowInitCodeHash(address portal) view returns (bytes32)"]);

let cachedChain; // the factories and escrow init-code hash never change for a deployed Portal
async function chainConstants() {
  if (cachedChain) return cachedChain;
  const c = client();
  const [partsFactory, hookFactory] = await Promise.all([
    c.readContract({ address: PORTAL, abi: portalAbi, functionName: "partsFactory" }),
    c.readContract({ address: PORTAL, abi: portalAbi, functionName: "hookFactory" }),
  ]);
  const escrowCodeHash = await c.readContract({ address: partsFactory, abi: partsAbi, functionName: "escrowInitCodeHash", args: [PORTAL] });
  cachedChain = { partsFactory, hookFactory, escrowCodeHash };
  return cachedChain;
}

const create2 = (deployer, salt, codeHash) => getAddress(`0x${keccak256(concat(["0xff", deployer, salt, codeHash])).slice(26)}`);

/** Escrow address the Portal will deploy for (creator, hookSalt). */
function escrowFor(k, creator, hookSalt) {
  const escrowSalt = keccak256(encodePacked(["string", "address", "bytes32"], ["argus.v5.escrow", creator, hookSalt]));
  return create2(k.partsFactory, keccak256(encodePacked(["address", "bytes32"], [PORTAL, escrowSalt])), k.escrowCodeHash);
}

/**
 * Finds a hookSalt for (creator, quote, buyTaxBps, sellTaxBps). Returns the salt, the hook and escrow addresses it
 * produces, and how many attempts it took. Deterministic for a given `start`.
 */
async function findHookSalt({ creator, quote, buyTaxBps, sellTaxBps, start, maxAttempts = 400_000 }) {
  const k = await chainConstants();
  const template = hexToBytes(await client().readContract({ address: PORTAL, abi: portalAbi, functionName: "hookInitCodeTemplate", args: [quote, buyTaxBps, sellTaxBps] }));
  // constructor args are 11 words at the end; the escrow is the third (poolManager, portal, escrow, ...)
  const escrowOffset = template.length - 11 * 32 + 2 * 32;
  const RATE = 136;
  const prefixLen = Math.floor(escrowOffset / RATE) * RATE;
  const base = keccak_256.create().update(template.subarray(0, prefixLen));
  const tail = template.slice(prefixLen);
  const escrowInTail = escrowOffset - prefixLen;
  const factory = hexToBytes(k.hookFactory);
  const seed = BigInt(start ?? `0x${bytesToHex(crypto.getRandomValues(new Uint8Array(16))).slice(2)}`) << 64n;

  for (let i = 0; i < maxAttempts; i++) {
    const hookSalt = toHex(seed + BigInt(i), { size: 32 });
    const escrow = escrowFor(k, creator, hookSalt);
    tail.fill(0, escrowInTail, escrowInTail + 12);
    tail.set(hexToBytes(escrow), escrowInTail + 12);
    const codeHash = base.clone().update(tail).digest();
    const pre = new Uint8Array(1 + 20 + 32 + 32);
    pre[0] = 0xff; pre.set(factory, 1); pre.set(hexToBytes(hookSalt), 21); pre.set(codeHash, 53);
    const h = keccak_256(pre);
    // low 14 bits of the address = last two bytes of the hash (address is the last 20 bytes)
    const low = (BigInt(h[30]) << 8n) | BigInt(h[31]);
    if ((low & ALL_MASK) === REQUIRED) {
      const hook = getAddress(bytesToHex(h.slice(12)));
      return { hookSalt, hook, escrow, codeHash: bytesToHex(codeHash), attempts: i + 1 };
    }
  }
  throw new Error("No valid hook salt found in the attempt budget.");
}

module.exports = { PORTAL, REQUIRED, ALL_MASK, findHookSalt, chainConstants, portalAbi, client };
