// BIP-39 seed → first Ethereum account, without freezing the phone.
//
// PBKDF2-HMAC-SHA512 with 2048 rounds is pure JavaScript here and can take a long time on a phone's JS engine
// (minutes in Expo Go's debug engine). Library "async" modes only yield to promise microtasks, which still blocks
// network callbacks and timers, so balances never load while it runs. This loop hands control back to the event
// loop with setTimeout every few rounds, so the rest of the app keeps working while the key is derived.
import { hmac } from "@noble/hashes/hmac";
import { sha512 } from "@noble/hashes/sha2";
import { HDKey } from "@scure/bip32";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { toHex, type Hex } from "viem";

const ROUNDS = 2048;
const ROUNDS_PER_SLICE = 32;
const yieldToLoop = () => new Promise<void>((r) => setTimeout(r, 0));
const utf8 = (s: string) => new TextEncoder().encode(s.normalize("NFKD"));

/** BIP-39 mnemonicToSeed (64 bytes), byte-identical to the reference, yielding to the event loop as it goes. */
export async function mnemonicToSeedYielding(mnemonic: string, passphrase = ""): Promise<Uint8Array> {
  const password = utf8(mnemonic);
  const salt = utf8(`mnemonic${passphrase}`);
  const prf = hmac.create(sha512, password);
  // single output block (dkLen 64 = SHA-512 size): U1 = PRF(salt || INT(1))
  const block1 = new Uint8Array(salt.length + 4);
  block1.set(salt);
  block1[salt.length + 3] = 1;
  let u = prf.clone().update(block1).digest();
  const t = u.slice();
  for (let i = 1; i < ROUNDS; i++) {
    u = prf.clone().update(u).digest();
    for (let j = 0; j < t.length; j++) t[j] ^= u[j];
    if (i % ROUNDS_PER_SLICE === 0) await yieldToLoop();
  }
  return t;
}

/** First account on the standard Ethereum path m/44'/60'/0'/0/0, plus its private key for storage. */
export async function deriveFirstAccount(mnemonic: string): Promise<{ account: PrivateKeyAccount; privateKey: Hex }> {
  const seed = await mnemonicToSeedYielding(mnemonic);
  await yieldToLoop();
  const key = HDKey.fromMasterSeed(seed).derive("m/44'/60'/0'/0/0");
  if (!key.privateKey) throw new Error("Could not derive a key from this phrase.");
  const privateKey = toHex(key.privateKey);
  return { account: privateKeyToAccount(privateKey), privateKey };
}
