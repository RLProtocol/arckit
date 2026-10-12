// Key storage. The seed phrase never leaves the device: on iOS/Android it sits in the Keychain / Keystore via
// expo-secure-store; in the PWA it is encrypted under the PIN in the browser vault (./webVault).
//
// Performance: turning a seed phrase into a key (BIP-39 PBKDF2, 2048 rounds of HMAC-SHA512) takes seconds on a
// phone's JS engine, so it happens exactly once, when the wallet is created or imported. The derived private key
// is stored in the same secure slot and every later unlock loads it directly, which is near-instant.
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { english, generateMnemonic, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { deriveFirstAccount } from "./derive";
import { validateMnemonic } from "@scure/bip39";
import { forgetSecrets, sealWallet, unlockedSecrets, unlockWallet, vaultExists, wipeVault } from "./webVault";
import { keccak256, toHex, type Address, type Hex } from "viem";

const K = { mnemonic: "arckit.mnemonic", pk: "arckit.pk", pin: "arckit.pin", bio: "arckit.biometrics", tokens: "arckit.tokens", address: "arckit.address" } as const;

const WEB = Platform.OS === "web";
const legacy = (key: string) => (typeof localStorage !== "undefined" ? localStorage.getItem(key) : null);

// Native only: the web build never stores a secret outside the encrypted vault.
async function secureGet(key: string): Promise<string | null> {
  return WEB ? null : SecureStore.getItemAsync(key);
}
async function secureSet(key: string, value: string) {
  if (WEB) return;
  await SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}
async function secureDel(key: string) {
  if (WEB) return;
  await SecureStore.deleteItemAsync(key);
}

export const isWebPreview = WEB;
export { forgetSecrets };
export type WalletAccount = PrivateKeyAccount;

const normalize = (m: string) => m.trim().toLowerCase().split(/\s+/).join(" ");

export async function hasWallet(): Promise<boolean> {
  if (WEB) return vaultExists() || !!legacy(K.mnemonic);
  return !!(await secureGet(K.mnemonic));
}

/** The public address is kept outside the secure slot so the locked screen can show it without the seed. */
export async function storedAddress(): Promise<Address | null> {
  return (await AsyncStorage.getItem(K.address)) as Address | null;
}

export function newMnemonic(): string {
  return generateMnemonic(english);
}

/** Cheap checksum validation only; no key derivation. */
export function isValidMnemonic(m: string): boolean {
  const words = normalize(m).split(" ");
  if (words.length !== 12 && words.length !== 24) return false;
  return validateMnemonic(words.join(" "), english);
}

/** The slow step, run in slices so the app stays responsive. */
export function deriveAccount(mnemonic: string): Promise<{ account: PrivateKeyAccount; privateKey: Hex }> {
  return deriveFirstAccount(normalize(mnemonic));
}

const hashPin = (pin: string) => keccak256(toHex(`arckit:${pin}`));

/** Persists a wallet whose account was already derived with `deriveAccount`. */
export async function saveWallet(mnemonic: string, account: PrivateKeyAccount, privateKey: Hex, pin: string) {
  if (WEB) {
    await sealWallet({ mnemonic: normalize(mnemonic), pk: privateKey }, pin);
    await AsyncStorage.setItem(K.address, account.address);
    return;
  }
  await secureSet(K.mnemonic, normalize(mnemonic));
  await secureSet(K.pk, privateKey);
  await secureSet(K.pin, hashPin(pin));
  await AsyncStorage.setItem(K.address, account.address);
}

export async function verifyPin(pin: string): Promise<boolean> {
  if (WEB) {
    if (vaultExists()) return unlockWallet(pin);
    // a wallet from an old web preview stored in the clear: seal it under this PIN, then drop the plaintext
    const m = legacy(K.mnemonic), h = legacy(K.pin);
    if (!m || !h || h !== hashPin(pin)) return false;
    const pk = legacy(K.pk) as Hex | null;
    await sealWallet({ mnemonic: m, pk: pk && /^0x[0-9a-fA-F]{64}$/.test(pk) ? pk : (await deriveAccount(m)).privateKey }, pin);
    for (const k of [K.mnemonic, K.pk, K.pin, K.bio]) localStorage.removeItem(k);
    return true;
  }
  const h = await secureGet(K.pin);
  return !!h && h === hashPin(pin);
}

export async function changePin(oldPin: string, newPin: string): Promise<boolean> {
  if (!(await verifyPin(oldPin))) return false;
  if (WEB) { await sealWallet(unlockedSecrets()!, newPin); return true; }
  await secureSet(K.pin, hashPin(newPin));
  return true;
}

/** Loads the signing account. Fast path: the stored private key. Fallback for wallets saved before it existed. */
export async function loadAccount(): Promise<WalletAccount | null> {
  if (WEB) { const s = unlockedSecrets(); return s ? privateKeyToAccount(s.pk) : null; }
  const pk = await secureGet(K.pk);
  if (pk && /^0x[0-9a-fA-F]{64}$/.test(pk)) return privateKeyToAccount(pk as Hex);
  const m = await secureGet(K.mnemonic);
  if (!m) return null;
  const { account, privateKey } = await deriveAccount(m);
  await secureSet(K.pk, privateKey);
  return account;
}

/** Reads the seed. Callers must have authenticated (PIN or biometrics) first. */
export async function readMnemonic(): Promise<string | null> {
  if (WEB) return unlockedSecrets()?.mnemonic ?? null;
  return secureGet(K.mnemonic);
}

export async function wipeWallet() {
  if (WEB) { wipeVault(); for (const k of [K.mnemonic, K.pk, K.pin, K.bio]) localStorage.removeItem(k); }
  await Promise.all([secureDel(K.mnemonic), secureDel(K.pk), secureDel(K.pin), secureDel(K.bio), AsyncStorage.multiRemove([K.address, K.tokens])]);
}

export async function biometricsEnabled(): Promise<boolean> {
  return (await secureGet(K.bio)) === "1";
}
export async function setBiometricsEnabled(on: boolean) {
  if (on) await secureSet(K.bio, "1");
  else await secureDel(K.bio);
}

export type CustomToken = { address: Address; symbol: string; name: string; decimals: number };
export async function customTokens(): Promise<CustomToken[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(K.tokens)) || "[]");
  } catch {
    return [];
  }
}
export async function saveCustomTokens(list: CustomToken[]) {
  await AsyncStorage.setItem(K.tokens, JSON.stringify(list));
}
