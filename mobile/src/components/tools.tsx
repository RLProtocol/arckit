import { useState, type ReactNode } from "react";
import { Pressable, Share, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { isAddress, parseAbi, type Address } from "viem";
import { Text } from "../i18n/Text";
import { publicClient } from "../chain";
import { erc20Abi } from "../contracts";
import { fmtTok } from "../lib/format";
import { colors, fonts, radius } from "../theme";
import { Eyebrow, Field, Pill } from "./ui";

export const DAY = 86_400;
export const nowSec = () => Math.floor(Date.now() / 1000);

const circle = { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.lineStrong, alignItems: "center", justifyContent: "center", backgroundColor: colors.card } as const;

/** Back button, a small title, and an optional share action: the top of every native tool screen. */
export function BackHeader({ title, share, right }: { title: string; share?: string; right?: ReactNode }) {
  const router = useRouter();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/tools"))} hitSlop={10} style={circle}><Ionicons name="chevron-back" size={20} color={colors.text} /></Pressable>
      <Eyebrow>{title}</Eyebrow>
      {share ? <Pressable onPress={() => void Share.share({ message: share })} hitSlop={10} style={circle}><Ionicons name="share-outline" size={18} color={colors.text} /></Pressable> : right ?? <View style={{ width: 38 }} />}
    </View>
  );
}

const supplyAbi = parseAbi(["function totalSupply() view returns (uint256)"]);
export type TokenInfo = { address: Address; name: string; symbol: string; decimals: number; totalSupply?: bigint; balance: bigint; allowance: bigint };

/** Metadata, balance and allowance (to `spender`) for one token; `null` when the address is not an ERC-20. */
export function useTokenInfo(token: string | undefined, owner: Address | undefined, spender: Address | undefined) {
  const valid = !!token && isAddress(token);
  return useQuery({
    queryKey: ["token-info", token?.toLowerCase(), owner, spender],
    enabled: valid,
    refetchInterval: 15_000,
    queryFn: async (): Promise<TokenInfo | null> => {
      const t = token as Address;
      const r = await publicClient.multicall({
        allowFailure: true,
        contracts: [
          { address: t, abi: erc20Abi, functionName: "name" },
          { address: t, abi: erc20Abi, functionName: "symbol" },
          { address: t, abi: erc20Abi, functionName: "decimals" },
          { address: t, abi: supplyAbi, functionName: "totalSupply" },
          { address: t, abi: erc20Abi, functionName: "balanceOf", args: [owner ?? t] },
          { address: t, abi: erc20Abi, functionName: "allowance", args: [owner ?? t, spender ?? t] },
        ],
      });
      if (r[2].status !== "success") return null;
      return {
        address: t,
        name: r[0].status === "success" ? String(r[0].result) : "Unknown token",
        symbol: r[1].status === "success" ? String(r[1].result) : "TOKEN",
        decimals: Number(r[2].result),
        totalSupply: r[3].status === "success" ? (r[3].result as bigint) : undefined,
        balance: owner && r[4].status === "success" ? (r[4].result as bigint) : 0n,
        allowance: owner && spender && r[5].status === "success" ? (r[5].result as bigint) : 0n,
      };
    },
  });
}

/** Token address input that shows what the address is and how much of it you hold. */
export function TokenField({ value, onChange, info, loading, label = "Token address", hint }: { value: string; onChange: (v: string) => void; info: TokenInfo | null | undefined; loading?: boolean; label?: string; hint?: string }) {
  const bad = !!value && !isAddress(value);
  const error = bad ? "Not a valid address." : info === null ? "No ERC-20 token at that address." : undefined;
  const ok = info ? `${info.name} (${info.symbol}) · you hold ${fmtTok(info.balance, info.decimals)}` : loading && value ? "Reading the token…" : hint;
  return <Field label={label} placeholder="0x…" value={value} onChangeText={(v) => onChange(v.trim())} error={error} hint={ok} />;
}

/** A Max button for a Field's `right` slot. */
export function MaxButton({ onPress }: { onPress: () => void }) {
  return <Pressable onPress={onPress} style={{ paddingHorizontal: 14 }}><Text style={{ fontFamily: fonts.bodyMedium, color: colors.accent }}>Max</Text></Pressable>;
}

/** Whole token units as an exact decimal string (for Max buttons). */
export const unitsToInput = (units: bigint, decimals: number) => {
  const s = units.toString().padStart(decimals + 1, "0");
  const whole = s.slice(0, s.length - decimals);
  const frac = decimals ? s.slice(-decimals).replace(/0+$/, "") : "";
  return frac ? `${whole}.${frac}` : whole;
};

/**
 * Preset durations plus a custom number of days. Returns days through onChange (null while the custom
 * field is empty or invalid). Days, not a calendar: no native date picker needed and nothing to mis-tap.
 */
export function DaysPicker({ presets, value, onChange, label, allowZero = false }: { presets: [number, string][]; value: number | null; onChange: (d: number | null) => void; label?: string; allowZero?: boolean }) {
  const [custom, setCustom] = useState(false);
  const [text, setText] = useState("");
  const isPreset = !custom && presets.some(([d]) => d === value);
  return (
    <View style={{ marginTop: 14 }}>
      {label ? <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.dim, marginBottom: 8 }}>{label}</Text> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {presets.map(([d, l]) => <Pill key={d} tone={isPreset && value === d ? "accent" : "dim"} onPress={() => { setCustom(false); onChange(d); }}>{l}</Pill>)}
        <Pill tone={custom || !isPreset ? "accent" : "dim"} onPress={() => { setCustom(true); const n = Number(text); onChange(text && Number.isFinite(n) && (allowZero ? n >= 0 : n > 0) ? n : null); }}>Custom</Pill>
      </View>
      {custom || !isPreset ? (
        <Field placeholder="Number of days" keyboardType="decimal-pad" value={text} onChangeText={(v) => { setText(v); const n = Number(v.replace(",", ".")); onChange(v.trim() && Number.isFinite(n) && (allowZero ? n >= 0 : n > 0) ? n : null); }} />
      ) : null}
    </View>
  );
}

export const fmtDate = (sec: number) => new Date(sec * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
export const fmtDateTime = (sec: number) => new Date(sec * 1000).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** "12d 4h", "3h 20m", "45s" — the largest two units. */
export function fmtSpan(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const d = Math.floor(s / DAY), h = Math.floor((s % DAY) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

export function Progress({ pct, tone = colors.accent, height = 8 }: { pct: number; tone?: string; height?: number }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: colors.navy600, overflow: "hidden" }}>
      <View style={{ width: `${p > 0 ? Math.max(p, 1.5) : 0}%`, height, borderRadius: height / 2, backgroundColor: tone }} />
    </View>
  );
}

/** One row in a list of records (locks, vestings, pools): logo slot, two lines, right column. */
export function ListRow({ left, title, sub, right, rightSub, onPress, rightTone }: { left: ReactNode; title: string; sub: string; right?: string; rightSub?: string; onPress: () => void; rightTone?: string }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", padding: 12, borderRadius: radius.md, backgroundColor: pressed ? colors.navy600 : "transparent" })}>
      {left}
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text }} numberOfLines={1}>{title}</Text>
        <Text style={{ fontFamily: fonts.mono, fontSize: 12, color: colors.faint }} numberOfLines={1}>{sub}</Text>
      </View>
      {right !== undefined ? (
        <View style={{ alignItems: "flex-end", marginLeft: 8 }}>
          <Text style={{ fontFamily: fonts.mono, fontSize: 14, color: colors.text }}>{right}</Text>
          {rightSub ? <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: rightTone ?? colors.faint }}>{rightSub}</Text> : null}
        </View>
      ) : null}
    </Pressable>
  );
}

/** Icon + headline + one line, for empty lists. */
export function Empty({ icon, title, text, children }: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string; children?: ReactNode }) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 22, paddingHorizontal: 8 }}>
      <View style={{ width: 52, height: 52, borderRadius: 17, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }}><Ionicons name={icon} size={24} color={colors.accent} /></View>
      <Text style={{ fontFamily: fonts.display, fontSize: 18, color: colors.text, marginTop: 12 }}>{title}</Text>
      <Text style={{ fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.dim, textAlign: "center", marginTop: 6 }}>{text}</Text>
      {children}
    </View>
  );
}
