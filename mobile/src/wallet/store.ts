// Key storage. The seed phrase never leaves the device: on iOS/Android it sits in the Keychain / Keystore via
// expo-secure-store; the web build (used only for design previews) falls back to localStorage with a warning.
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { english, generateMnemonic, mnemonicToAccount, type HDAccount } from "viem/accounts";
import { keccak256, toHex, type Address } from "viem";

const K = { mnemonic: "arckit.mnemonic", pin: "arckit.pin", bio: "arckit.biometrics", tokens: "arckit.tokens", address: "arckit.address" } as const;

async function secureGet(key: string): Promise<string | null> {
  if (Platform.OS === "web") return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
  return SecureStore.getItemAsync(key);
}
async function secureSet(key: string, value: string) {
  if (Platform.OS === "web") return void localStorage.setItem(key, value);
  await SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}
async function secureDel(key: string) {
  if (Platform.OS === "web") return void localStorage.removeItem(key);
  await SecureStore.deleteItemAsync(key);
}

export const isWebPreview = Platform.OS === "web";

export async function hasWallet(): Promise<boolean> {
  return !!(await secureGet(K.mnemonic));
}

/** The public address is kept outside the secure slot so the locked screen can show it without the seed. */
export async function storedAddress(): Promise<Address | null> {
  return (await AsyncStorage.getItem(K.address)) as Address | null;
}

export function newMnemonic(): string {
  return generateMnemonic(english);
}

export function isValidMnemonic(m: string): boolean {
  const words = m.trim().toLowerCase().split(/\s+/);
  if (words.length !== 12 && words.length !== 24) return false;
  try {
    mnemonicToAccount(words.join(" "));
    return true;
  } catch {
    return false;
  }
}

export function accountFrom(mnemonic: string): HDAccount {
  return mnemonicToAccount(mnemonic.trim().toLowerCase().split(/\s+/).join(" "));
}

const hashPin = (pin: string) => keccak256(toHex(`arckit:${pin}`));

export async function saveWallet(mnemonic: string, pin: string) {
  const acct = accountFrom(mnemonic);
  await secureSet(K.mnemonic, mnemonic.trim().toLowerCase().split(/\s+/).join(" "));
  await secureSet(K.pin, hashPin(pin));
  await AsyncStorage.setItem(K.address, acct.address);
}

export async function verifyPin(pin: string): Promise<boolean> {
  const h = await secureGet(K.pin);
  return !!h && h === hashPin(pin);
}

export async function changePin(oldPin: string, newPin: string): Promise<boolean> {
  if (!(await verifyPin(oldPin))) return false;
  await secureSet(K.pin, hashPin(newPin));
  return true;
}

/** Reads the seed. Callers must have authenticated (PIN or biometrics) first. */
export async function readMnemonic(): Promise<string | null> {
  return secureGet(K.mnemonic);
}

export async function wipeWallet() {
  await Promise.all([secureDel(K.mnemonic), secureDel(K.pin), secureDel(K.bio), AsyncStorage.multiRemove([K.address, K.tokens])]);
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
