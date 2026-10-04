import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState, Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { createWalletClient, http, type Address, type Hash, type WalletClient } from "viem";
import type { HDAccount } from "viem/accounts";
import { arc, publicClient } from "../chain";
import { biometricsEnabled, deriveAccount, hasWallet, loadAccount, saveWallet, storedAddress, verifyPin, wipeWallet, type WalletAccount } from "./store";

type Status = "loading" | "none" | "locked" | "ready";

type Ctx = {
  status: Status;
  address?: Address;
  account?: WalletAccount;
  walletClient?: WalletClient;
  biometrics: boolean;
  create: (mnemonic: string, pin: string) => Promise<void>;
  unlockWithPin: (pin: string) => Promise<boolean>;
  unlockWithBiometrics: () => Promise<boolean>;
  lock: () => void;
  reset: () => Promise<void>;
  refresh: () => Promise<void>;
};

const WalletCtx = createContext<Ctx | null>(null);
const AUTO_LOCK_MS = 5 * 60_000;

export function WalletProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [address, setAddress] = useState<Address | undefined>();
  const [account, setAccount] = useState<WalletAccount | undefined>();
  const [biometrics, setBiometrics] = useState(false);
  const backgroundedAt = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    const exists = await hasWallet();
    setBiometrics(await biometricsEnabled());
    if (!exists) { setStatus("none"); setAddress(undefined); setAccount(undefined); return; }
    setAddress((await storedAddress()) ?? undefined);
    setStatus((s) => (s === "ready" ? "ready" : "locked"));
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // Lock when the app has been in the background for a while.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => {
      if (st === "background" || st === "inactive") backgroundedAt.current = Date.now();
      else if (st === "active" && backgroundedAt.current && Date.now() - backgroundedAt.current > AUTO_LOCK_MS) { setAccount(undefined); setStatus((s) => (s === "ready" ? "locked" : s)); }
    });
    return () => sub.remove();
  }, []);

  const open = useCallback(async () => {
    const acct = await loadAccount();
    if (!acct) return false;
    setAccount(acct); setAddress(acct.address); setStatus("ready");
    return true;
  }, []);

  /** Derives the key once (the slow step), stores it, and opens the wallet. */
  const create = useCallback(async (mnemonic: string, pin: string) => {
    const acct: HDAccount = await deriveAccount(mnemonic);
    await saveWallet(mnemonic, acct, pin);
    setAccount(acct); setAddress(acct.address); setStatus("ready");
    setBiometrics(await biometricsEnabled());
  }, []);
  const unlockWithPin = useCallback(async (pin: string) => ((await verifyPin(pin)) ? open() : false), [open]);
  const unlockWithBiometrics = useCallback(async () => {
    if (Platform.OS === "web") return false;
    const ok = await LocalAuthentication.hasHardwareAsync();
    if (!ok || !(await LocalAuthentication.isEnrolledAsync())) return false;
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: "Unlock Arc Kit", cancelLabel: "Use PIN", disableDeviceFallback: true });
    return r.success ? open() : false;
  }, [open]);
  const lock = useCallback(() => { setAccount(undefined); setStatus("locked"); }, []);
  const reset = useCallback(async () => { await wipeWallet(); setAccount(undefined); setAddress(undefined); setStatus("none"); }, []);

  const walletClient = useMemo(() => (account ? createWalletClient({ account, chain: arc, transport: http("https://5042.rpc.thirdweb.com", { timeout: 20_000, retryCount: 2 }) }) : undefined), [account]);

  const value = useMemo<Ctx>(() => ({ status, address, account, walletClient, biometrics, create, unlockWithPin, unlockWithBiometrics, lock, reset, refresh }), [status, address, account, walletClient, biometrics, create, unlockWithPin, unlockWithBiometrics, lock, reset, refresh]);
  return <WalletCtx.Provider value={value}>{children}</WalletCtx.Provider>;
}

export function useWallet() {
  const c = useContext(WalletCtx);
  if (!c) throw new Error("useWallet outside WalletProvider");
  return c;
}

/** Wait for a hash and return the receipt; surfaces through useTx. */
export const waitFor = (hash: Hash) => publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
