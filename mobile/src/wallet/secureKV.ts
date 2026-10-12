// Secret key-value storage that works on every build: the Keychain/Keystore on iOS/Android, and the PIN-encrypted
// browser vault in the PWA (which requires the wallet to be unlocked, as it is whenever these are used).
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { kvDel, kvGet, kvSet } from "./webVault";

const web = Platform.OS === "web";

export const secureKV = {
  get: (k: string): Promise<string | null> => (web ? kvGet(k) : SecureStore.getItemAsync(k)),
  set: (k: string, v: string): Promise<void> => (web ? kvSet(k, v) : SecureStore.setItemAsync(k, v, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY })),
  del: (k: string): Promise<void> => (web ? kvDel(k) : SecureStore.deleteItemAsync(k)),
};
