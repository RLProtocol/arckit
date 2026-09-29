import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, useSignMessage } from "wagmi";
import { parseAbi, type Address, type Hex } from "viem";

export const arcPayRouterAbi = parseAbi(["function pay(bytes32 orderId) payable", "error AlreadyPaid(bytes32 orderId)", "error ZeroAmount()", "error EmptyOrderId()", "error ForwardFailed()"]);

export type PayProduct = {
  id: string;
  name: string;
  category: string;
  country: string;
  currency: string;
  image: string | null;
  tint: string | null;
  packages: { value: string }[];
  range: { min: number; max: number; step: number } | null;
  recipient: "email" | "phone" | "none";
  description: string;
};

export type PayOrderState = "awaiting_payment" | "expired" | "paid" | "bridging" | "bridged" | "delivered" | "refunding" | "refunded" | "needs_support";

export type PayOrder = {
  id: Hex;
  product: { id: string; name: string; image: string | null; tint?: string | null; category: string; terms?: string; redeemOn?: string[] };
  value: string;
  currency: string;
  recipient: { email?: string; phone?: string };
  chargeUnits: string;
  chargeWei: string;
  router: Address;
  state: PayOrderState;
  createdAt: number;
  expiresAt: number;
  paidAt: number | null;
  deliveredAt: number | null;
  refundTx: Hex | null;
  bridgeTx: Hex | null;
  note: string | null;
  demo: boolean;
  delivery: { code: string | null; pin: string | null; link: string | null; instructions: string | null } | null;
};

export class PayError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function api<T>(op: string, init?: { query?: Record<string, string | undefined>; body?: unknown }): Promise<T> {
  const qs = new URLSearchParams({ op });
  for (const [k, v] of Object.entries(init?.query ?? {})) if (v) qs.set(k, v);
  const r = await fetch(`/api/pay?${qs}`, init?.body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(init.body) } : undefined);
  const j = (await r.json().catch(() => ({}))) as { error?: string } & T;
  if (!r.ok) throw new PayError(j.error || "ArcPay is unavailable right now.", r.status);
  return j;
}

// ---------- catalogue ----------

export function usePayConfig() {
  return useQuery({ queryKey: ["arcpay", "config"], queryFn: () => api<{ ready: boolean; demo: boolean; router: Address }>("config"), staleTime: 60_000, retry: 1 });
}

/** Country from the visitor's connection, remembered once they change it. */
export function usePayCountry() {
  const [country, setCountryState] = useState<string | undefined>(() => {
    try {
      return localStorage.getItem("arcpay:country") || undefined;
    } catch {
      return undefined;
    }
  });
  const geo = useQuery({ queryKey: ["arcpay", "geo"], queryFn: () => api<{ country: string | null }>("geo"), staleTime: Infinity, enabled: !country, retry: 0 });
  const detected = geo.data?.country || undefined;
  const fromLocale = (() => {
    try {
      return new Intl.Locale(navigator.language).region || undefined;
    } catch {
      return undefined;
    }
  })();
  const setCountry = useCallback((c: string) => {
    setCountryState(c);
    try {
      localStorage.setItem("arcpay:country", c);
    } catch {
      /* private mode */
    }
  }, []);
  const settled = !!country || !geo.isLoading;
  return { country: country ?? detected ?? (settled ? fromLocale ?? "US" : undefined), detected: !country && !!detected, setCountry };
}

export function usePayProducts(country?: string) {
  return useQuery({ queryKey: ["arcpay", "products", country], queryFn: () => api<{ items: PayProduct[] }>("products", { query: { country } }), enabled: !!country, staleTime: 5 * 60_000, retry: 1 });
}

export function usePaySearch(q: string, country?: string) {
  const term = q.trim();
  return useQuery({ queryKey: ["arcpay", "search", term.toLowerCase(), country], queryFn: () => api<{ items: PayProduct[] }>("search", { query: { q: term, country } }), enabled: term.length >= 2, staleTime: 2 * 60_000, retry: 0 });
}

// ---------- session ----------

const sessionKey = (a: string) => `arcpay:session:${a.toLowerCase()}`;
function storedSession(address?: string): string | undefined {
  if (!address) return undefined;
  try {
    const raw = localStorage.getItem(sessionKey(address));
    if (!raw) return undefined;
    const { token, expiresAt } = JSON.parse(raw) as { token: string; expiresAt: number };
    return expiresAt > Date.now() + 60_000 ? token : undefined;
  } catch {
    return undefined;
  }
}

export function usePaySession() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [token, setToken] = useState<string | undefined>(() => storedSession(address));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setToken(storedSession(address)), [address]);

  const signIn = useCallback(async (): Promise<string | undefined> => {
    if (!address) return undefined;
    const existing = storedSession(address);
    if (existing) return existing;
    setBusy(true);
    setError("");
    try {
      const prep = await api<{ time: string; message: string }>("session", { body: { prepare: true, address } });
      const signature = await signMessageAsync({ message: prep.message });
      const s = await api<{ token: string; expiresAt: number }>("session", { body: { address, time: prep.time, signature } });
      try {
        localStorage.setItem(sessionKey(address), JSON.stringify(s));
      } catch {
        /* private mode: session lives for this page only */
      }
      setToken(s.token);
      return s.token;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(/rejected|denied/i.test(msg) ? "You cancelled the sign-in request." : msg);
      return undefined;
    } finally {
      setBusy(false);
    }
  }, [address, signMessageAsync]);

  const signOut = useCallback(() => {
    if (address)
      try {
        localStorage.removeItem(sessionKey(address));
      } catch {
        /* ignore */
      }
    setToken(undefined);
  }, [address]);

  return { token, signIn, signOut, busy, error };
}

// ---------- orders ----------

export const createPayOrder = (session: string, input: { productId: string; value: string; email?: string; phone?: string }) => api<{ order: PayOrder }>("order", { body: { session, ...input } });

const LIVE: PayOrderState[] = ["awaiting_payment", "paid", "bridging", "bridged", "refunding"];
export const isLiveState = (s: PayOrderState) => LIVE.includes(s);

/** Polls an order while it can still change. Faster once money is moving. */
export function usePayOrder(session?: string, id?: Hex, initial?: PayOrder) {
  return useQuery({
    queryKey: ["arcpay", "order", id],
    queryFn: async () => (await api<{ order: PayOrder }>("status", { body: { session, id } })).order,
    enabled: !!session && !!id,
    initialData: initial,
    refetchInterval: (q) => {
      const s = q.state.data?.state;
      if (!s || !isLiveState(s)) return false;
      return s === "awaiting_payment" ? 4000 : 2200;
    },
    retry: 2,
  });
}

export function usePayHistory(session?: string) {
  return useQuery({ queryKey: ["arcpay", "history", session], queryFn: async () => (await api<{ orders: PayOrder[] }>("history", { body: { session } })).orders, enabled: !!session, refetchInterval: 20_000 });
}

export function useInvalidatePayHistory() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["arcpay", "history"] });
}

// ---------- presentation helpers ----------

export function flagOf(country?: string): string {
  if (!country || !/^[A-Za-z]{2}$/.test(country)) return "🌍";
  return String.fromCodePoint(...[...country.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export function countryName(code?: string): string {
  if (!code) return "your country";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) || code;
  } catch {
    return code;
  }
}

/** Shown first in the picker, in this order. */
const POPULAR_COUNTRIES = ["US", "GB", "IN", "DE", "FR", "CA", "AU", "AE", "SG", "JP", "BR", "MX", "NG", "ZA", "PH", "ID", "TR", "KR"];

// Codes the browser can name but that are not places anyone shops from: unions, reserved and retired codes.
const NOT_COUNTRIES = new Set(["EU", "EZ", "UN", "ZZ", "XA", "XB", "AC", "CP", "CQ", "DG", "EA", "IC", "TA", "AN", "BU", "CS", "DD", "FX", "NT", "SU", "TP", "YD", "YU", "ZR", "QO", "AQ", "BV", "HM", "TF", "GS", "UM"]);

/**
 * Every country, straight from the browser's own region names: popular ones first, then A to Z. Deliberately
 * not a list of "countries with products": that would have to be measured against the supplier and can be
 * wrong. A country with nothing to sell simply shows an empty shelf.
 */
export const COUNTRIES: string[] = (() => {
  let names: Intl.DisplayNames | undefined;
  try {
    names = new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return POPULAR_COUNTRIES;
  }
  const all: string[] = [];
  for (let i = 65; i <= 90; i++)
    for (let j = 65; j <= 90; j++) {
      const c = String.fromCharCode(i, j);
      if (NOT_COUNTRIES.has(c)) continue;
      let n: string | undefined;
      try {
        n = names.of(c);
      } catch {
        n = undefined;
      }
      if (n && n !== c && !/unknown/i.test(n)) all.push(c);
    }
  const rest = all.filter((c) => !POPULAR_COUNTRIES.includes(c)).sort((x, y) => (names!.of(x) ?? x).localeCompare(names!.of(y) ?? y));
  return [...POPULAR_COUNTRIES.filter((c) => all.includes(c)), ...rest];
})();

export function fmtMoney(value: string | number, currency: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return `${value} ${currency}`;
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: n % 1 === 0 ? 0 : 2 }).format(n);
  } catch {
    return `${n} ${currency}`;
  }
}

export const fmtUsdcUnits = (units: string) => (Number(units) / 1e6).toFixed(2);

/** Stable, pleasant gradient for a product with no artwork. */
export function tileGradient(seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const a = h % 360;
  const b = (a + 40 + (h % 50)) % 360;
  return `linear-gradient(135deg, hsl(${a} 62% 34%), hsl(${b} 70% 22%))`;
}

export const CATEGORY_LABEL: Record<string, string> = {
  shopping: "Shopping",
  games: "Gaming",
  gaming: "Gaming",
  entertainment: "Entertainment",
  food: "Food & drink",
  travel: "Travel",
  refill: "Top-ups & bills",
  "mobile-refill": "Top-ups & bills",
  gasoline: "Fuel",
  vpn: "VPN",
  esim: "eSIM",
  "gift-cards": "Gift cards",
  other: "More",
};
export const categoryLabel = (c: string) => CATEGORY_LABEL[c] ?? c.replace(/[-_]/g, " ").replace(/^\w/, (m) => m.toUpperCase());
