// Browser key vault for the PWA. iOS/Android keep secrets in the Keychain/Keystore; a browser has no such store,
// so here every secret is encrypted with AES-GCM under a key derived from the PIN (PBKDF2-SHA256, 600k rounds,
// WebCrypto). Nothing secret is stored in the clear, and no PIN hash is stored either: the only way to check a PIN
// is to decrypt with it, so a copied localStorage cannot be brute-forced cheaply.
// The derived key and the decrypted wallet live in memory only while the app is unlocked; locking forgets them.
import type { Hex } from "viem";

const VAULT = "arckit.vault.v1";
const KV_PREFIX = "arckit.vkv.";
const ITERATIONS = 600_000;

type Sealed = { salt: string; iv: string; ct: string; iter: number };
type Secrets = { mnemonic: string; pk: Hex };

let key: CryptoKey | null = null;
let secrets: Secrets | null = null;

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const enc = new TextEncoder();
const dec = new TextDecoder();

async function deriveKey(pin: string, s: Uint8Array, iter: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(`arckit:${pin}`), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: s as BufferSource, iterations: iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function encrypt(k: CryptoKey, plain: string): Promise<{ iv: string; ct: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, enc.encode(plain)));
  return { iv: b64(iv), ct: b64(ct) };
}

async function decrypt(k: CryptoKey, iv: string, ct: string): Promise<string> {
  return dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) as BufferSource }, k, unb64(ct) as BufferSource));
}

export const vaultExists = () => typeof localStorage !== "undefined" && !!localStorage.getItem(VAULT);

/** Encrypts the wallet under `pin` and keeps it unlocked. Re-encrypts the note store when the PIN changes. */
export async function sealWallet(s: Secrets, pin: string) {
  const oldKey = key;
  const newSalt = crypto.getRandomValues(new Uint8Array(16));
  const k = await deriveKey(pin, newSalt, ITERATIONS);
  const { iv, ct } = await encrypt(k, JSON.stringify(s));
  // move every stored secret (ArcCash notes) to the new key before the vault switches over
  if (oldKey) {
    for (const name of kvKeys()) {
      const raw = JSON.parse(localStorage.getItem(name)!) as { iv: string; ct: string };
      const plain = await decrypt(oldKey, raw.iv, raw.ct);
      localStorage.setItem(name, JSON.stringify(await encrypt(k, plain)));
    }
  }
  localStorage.setItem(VAULT, JSON.stringify({ salt: b64(newSalt), iv, ct, iter: ITERATIONS } satisfies Sealed));
  key = k; secrets = s;
}

/** Tries `pin`; on success the wallet is unlocked in memory. A wrong PIN fails AES-GCM authentication. */
export async function unlockWallet(pin: string): Promise<boolean> {
  const raw = localStorage.getItem(VAULT);
  if (!raw) return false;
  const v = JSON.parse(raw) as Sealed;
  try {
    const s = unb64(v.salt);
    const k = await deriveKey(pin, s, v.iter);
    secrets = JSON.parse(await decrypt(k, v.iv, v.ct)) as Secrets;
    key = k;
    return true;
  } catch {
    return false;
  }
}

export const unlockedSecrets = () => secrets;
export const isUnlocked = () => !!key;

/** Drops the key and the decrypted wallet from memory (lock, auto-lock). */
export function forgetSecrets() { key = null; secrets = null; }

export function wipeVault() {
  for (const name of kvKeys()) localStorage.removeItem(name);
  localStorage.removeItem(VAULT);
  forgetSecrets();
}

// ---------------------------------------------------------------- encrypted key-value store (ArcCash notes)

function kvKeys(): string[] {
  const out: string[] = [];
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith(KV_PREFIX)) out.push(k); }
  return out;
}

function needKey(): CryptoKey {
  if (!key) throw new Error("Unlock the wallet first.");
  return key;
}

export async function kvGet(name: string): Promise<string | null> {
  const raw = localStorage.getItem(KV_PREFIX + name);
  if (!raw) return null;
  const v = JSON.parse(raw) as { iv: string; ct: string };
  return decrypt(needKey(), v.iv, v.ct);
}

export async function kvSet(name: string, value: string) {
  localStorage.setItem(KV_PREFIX + name, JSON.stringify(await encrypt(needKey(), value)));
}

export async function kvDel(name: string) {
  localStorage.removeItem(KV_PREFIX + name);
}

