import { Image, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { Text } from "../i18n/Text";
import { LANES } from "../argus";
import { colors, fonts, radius } from "../theme";

/** The fee split as one stacked bar, lanes in the Portal's order. */
export function SplitBar({ alloc, height = 10 }: { alloc: readonly number[]; height?: number }) {
  const total = alloc.reduce((a, b) => a + b, 0) || 1;
  return (
    <View style={{ flexDirection: "row", height, borderRadius: height / 2, overflow: "hidden", backgroundColor: colors.navy600, gap: 2 }}>
      {alloc.map((bps, i) => (bps > 0 ? <View key={i} style={{ flex: bps / total, backgroundColor: LANES[i].color }} /> : null))}
    </View>
  );
}

/** Legend under a SplitBar: only lanes that get something. */
export function SplitLegend({ alloc }: { alloc: readonly number[] }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 10 }}>
      {alloc.map((bps, i) => bps > 0 ? (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: LANES[i].color }} />
          <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.dim }}>{LANES[i].label}</Text>
          <Text style={{ fontFamily: fonts.mono, fontSize: 12, color: colors.text }}>{bps / 100}%</Text>
        </View>
      ) : null)}
    </View>
  );
}

/** Four thin bars over the wizard: done, current, to come. */
export function StepBar({ step, total }: { step: number; total: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 6, marginTop: 18 }}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i < step ? colors.aqua : i === step ? colors.accent : colors.navy600 }} />
      ))}
    </View>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <View style={{ width: "48.5%", backgroundColor: "rgba(5,13,26,0.45)", borderColor: colors.line, borderWidth: 1, borderRadius: radius.md, padding: 14 }}>
      <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.faint }}>{label}</Text>
      <Text style={{ fontFamily: fonts.display, fontSize: 19, color: tone ?? colors.text, marginTop: 4 }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {sub ? <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.faint, marginTop: 2 }} numberOfLines={1}>{sub}</Text> : null}
    </View>
  );
}

/** Progress from the starting FDV to Argus's bond milestone. */
export function BondBar({ fdv, start, bond }: { fdv: bigint; start: bigint; bond: bigint }) {
  const pct = bond > 0n ? Math.max(0, Math.min(100, Number((fdv * 10_000n) / bond) / 100)) : 0;
  return (
    <View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.navy600, overflow: "hidden" }}>
        <View style={{ width: `${Math.max(pct, 1.5)}%`, height: 8, borderRadius: 4, backgroundColor: pct >= 100 ? colors.aqua : colors.accent }} />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
        <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.faint }}>${compactUsd(start)}</Text>
        <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: pct >= 100 ? colors.aqua : colors.dim }}>{pct.toFixed(pct < 10 ? 1 : 0)}%</Text>
        <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.faint }}>${compactUsd(bond)}</Text>
      </View>
    </View>
  );
}

/** USDC wei as $1.2K / $45K / $3.4M. */
export function compactUsd(wei: bigint): string {
  const n = Number(wei / 10n ** 12n) / 1e6;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2).replace(/\.?0+$/, "")}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 1 : 2).replace(/\.?0+$/, "")}K`;
  return n.toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 4 : 2 });
}

export type PickedImage = { uri: string; base64: string; type: string };

/** Square crop, 512px JPEG: small enough to upload quickly, sharp enough for any token list. */
export async function pickTokenImage(): Promise<PickedImage | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 1 });
  if (res.canceled || !res.assets?.[0]) return null;
  const out = await manipulateAsync(res.assets[0].uri, [{ resize: { width: 512, height: 512 } }], { compress: 0.85, format: SaveFormat.JPEG, base64: true });
  if (!out.base64) return null;
  return { uri: out.uri, base64: out.base64, type: "image/jpeg" };
}

export function ImageSlot({ image, uri, onPress, size = 96 }: { image?: PickedImage | null; uri?: string; onPress: () => void; size?: number }) {
  const src = image?.uri ?? uri;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, borderWidth: src ? 1 : 1.5, borderStyle: src ? "solid" : "dashed", borderColor: src ? colors.lineStrong : colors.accentLine, backgroundColor: colors.input, alignItems: "center", justifyContent: "center", overflow: "hidden", opacity: pressed ? 0.8 : 1 })}>
      {src ? <Image source={{ uri: src }} style={{ width: size, height: size }} /> : (
        <View style={{ alignItems: "center", gap: 4 }}>
          <Ionicons name="image-outline" size={24} color={colors.accent} />
          <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.accent }}>Add image</Text>
        </View>
      )}
    </Pressable>
  );
}

/** A tappable tile in the "grow it" grid on a launch. */
export function ActionTile({ icon, title, text, tint, onPress, active }: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string; tint: readonly [string, string]; onPress: () => void; active?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ width: "48.5%", backgroundColor: active ? colors.navy600 : "rgba(5,13,26,0.45)", borderWidth: 1, borderColor: active ? colors.accentLine : colors.line, borderRadius: radius.md, padding: 14, minHeight: 112, opacity: pressed ? 0.8 : 1 })}>
      <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: tint[0], alignItems: "center", justifyContent: "center" }}><Ionicons name={icon} size={18} color={tint[1]} /></View>
      <Text style={{ fontFamily: fonts.display, fontSize: 15, color: colors.text, marginTop: 10 }}>{title}</Text>
      <Text style={{ fontFamily: fonts.body, fontSize: 12, lineHeight: 16, color: colors.dim, marginTop: 2 }}>{text}</Text>
    </Pressable>
  );
}
