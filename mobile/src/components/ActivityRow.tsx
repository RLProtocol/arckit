import { Pressable, View } from "react-native";
import { Text } from "../i18n/Text";
import { Ionicons } from "@expo/vector-icons";
import type { Activity } from "../hooks/useArcKit";
import { fmtCompact, shortAddr, timeAgo } from "../lib/format";
import { colors, fonts } from "../theme";

/**
 * One activity line. The label side shrinks and truncates; the amount never wraps or leaves the screen
 * (compact K/M/B formatting, one line, capped width), so long contract names and big numbers both fit.
 */
export function ActivityRow({ a, me, first, onPress }: { a: Activity; me?: string; first?: boolean; onPress?: () => void }) {
  const out = a.from.toLowerCase() === me?.toLowerCase();
  const amount = a.value > 0n ? `${out ? "−" : "+"}${a.token ? fmtCompact(a.value, a.token.decimals) : fmtCompact(a.value, 18)} ${a.token?.symbol ?? "USDC"}` : "";
  const tint = !a.ok ? colors.gold : out ? colors.coral : colors.aqua;
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderTopWidth: first ? 0 : 1, borderTopColor: colors.line }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: !a.ok ? colors.goldSoft : out ? colors.coralSoft : colors.aquaSoft, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={!a.ok ? "alert" : out ? "arrow-up" : "arrow-down"} size={16} color={tint} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text }}>{a.fn}{a.ok ? "" : " · failed"}</Text>
        <Text numberOfLines={1} style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.faint, marginTop: 2 }}>{out ? `to ${shortAddr(a.to)}` : `from ${shortAddr(a.from)}`} · {timeAgo(a.ts)}</Text>
      </View>
      {amount ? <Text numberOfLines={1} style={{ fontFamily: fonts.mono, fontSize: 13, color: out ? colors.text : colors.aqua, maxWidth: "42%", textAlign: "right" }}>{amount}</Text> : null}
    </Pressable>
  );
}
