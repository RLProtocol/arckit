import { Children, type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts, radius } from "../theme";

/** Full-screen Arc backdrop: navy gradient with the teal glow and the signature arcs. */
export function Screen({ children, scroll = true, padded = true, footer }: { children: ReactNode; scroll?: boolean; padded?: boolean; footer?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const body = (
    <View style={[{ flex: 1 }, padded && { paddingHorizontal: 20 }]}>{children}</View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: colors.navy900 }}>
      <LinearGradient colors={[colors.navy800, colors.navy700, "#0a2a3a"]} locations={[0, 0.55, 1]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]} />
      <View style={[styles.arc, { width: 620, height: 620, right: -260, top: -330, pointerEvents: "none" }]} />
      <View style={[styles.arc, { width: 900, height: 900, right: -420, top: -520, borderWidth: 1, pointerEvents: "none" }]} />
      <View style={[styles.glow, { pointerEvents: "none" }]} />
      <SafeAreaView style={{ flex: 1, zIndex: 1 }} edges={["top", "left", "right"]}>
        {scroll ? <ScrollView contentContainerStyle={{ paddingBottom: 110 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{body}</ScrollView> : body}
        {footer ? <View style={{ paddingBottom: Math.max(insets.bottom - 20, 0) }}>{footer}</View> : null}
      </SafeAreaView>
    </View>
  );
}

export function Eyebrow({ children, color = colors.aqua }: { children: ReactNode; color?: string }) {
  return <Text style={{ fontFamily: fonts.mono, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color }}>{children}</Text>;
}
export function H1({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[{ fontFamily: fonts.display, fontSize: 32, lineHeight: 36, letterSpacing: -0.6, color: colors.text, marginTop: 8 }, style]}>{children}</Text>;
}
export function H2({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[{ fontFamily: fonts.display, fontSize: 20, color: colors.text }, style]}>{children}</Text>;
}
export function P({ children, dim = true, small = false, style }: { children: ReactNode; dim?: boolean; small?: boolean; style?: StyleProp<TextStyle> }) {
  return <Text style={[{ fontFamily: fonts.body, fontSize: small ? 13 : 15, lineHeight: small ? 18 : 22, color: dim ? colors.dim : colors.text }, style]}>{children}</Text>;
}
export function Mono({ children, style, size = 13 }: { children: ReactNode; style?: StyleProp<TextStyle>; size?: number }) {
  return <Text style={[{ fontFamily: fonts.mono, fontSize: size, color: colors.text }, style]}>{children}</Text>;
}

export function Card({ children, style, tight }: { children: ReactNode; style?: StyleProp<ViewStyle>; tight?: boolean }) {
  return <View style={[styles.card, tight && { padding: 8 }, style]}>{children}</View>;
}

type BtnKind = "primary" | "soft" | "ghost" | "danger";
export function Button({ title, onPress, kind = "primary", disabled, loading, style, small }: { title: string; onPress?: () => void; kind?: BtnKind; disabled?: boolean; loading?: boolean; style?: StyleProp<ViewStyle>; small?: boolean }) {
  const bg = kind === "primary" ? colors.accent : kind === "danger" ? colors.coral : kind === "soft" ? colors.navy600 : "transparent";
  const fg = kind === "primary" || kind === "danger" ? colors.navy800 : colors.text;
  return (
    <Pressable onPress={onPress} disabled={disabled || loading} style={({ pressed }) => [styles.btn, small && styles.btnSmall, { backgroundColor: bg, borderColor: kind === "ghost" ? colors.lineStrong : bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 }, style]}>
      {loading ? <ActivityIndicator color={fg} /> : <Text style={{ fontFamily: fonts.bodyBold, fontSize: small ? 13 : 15, color: fg }}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, hint, error, right, ...input }: TextInputProps & { label?: string; hint?: ReactNode; error?: string; right?: ReactNode }) {
  return (
    <View style={{ marginTop: 14 }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.inputWrap, error ? { borderColor: colors.coral } : null]}>
        <TextInput placeholderTextColor={colors.faint} autoCapitalize="none" autoCorrect={false} {...input} style={[styles.input, input.style]} />
        {right}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <View style={styles.seg}>
      {options.map(([v, label]) => (
        <Pressable key={v} onPress={() => onChange(v)} style={[styles.segItem, v === value && styles.segOn]}>
          <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: v === value ? colors.text : colors.dim }}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Pill({ children, tone = "accent", onPress }: { children: ReactNode; tone?: "accent" | "aqua" | "coral" | "gold" | "dim"; onPress?: () => void }) {
  const map = { accent: [colors.accentSoft, colors.accent], aqua: [colors.aquaSoft, colors.aqua], coral: [colors.coralSoft, colors.coral], gold: [colors.goldSoft, colors.gold], dim: [colors.navy600, colors.dim] } as const;
  const [bg, fg] = map[tone];
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={{ backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5, alignSelf: "flex-start" }}>
      <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: fg }}>{children}</Text>
    </Pressable>
  );
}

export function Row({ children, style, between }: { children: ReactNode; style?: StyleProp<ViewStyle>; between?: boolean }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", gap: 10 }, between && { justifyContent: "space-between" }, style]}>{children}</View>;
}

export function Ledger({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <View style={styles.ledger}>
      {rows.map(([k, v], i) => (
        <View key={i} style={{ flexDirection: "row", gap: 12, paddingVertical: 5 }}>
          <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.faint, width: 104 }}>{k}</Text>
          <View style={{ flex: 1 }}>{typeof v === "string" || typeof v === "number" ? <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text }}>{v}</Text> : v}</View>
        </View>
      ))}
    </View>
  );
}

export function Notice({ children, tone = "accent" }: { children: ReactNode; tone?: "accent" | "aqua" | "coral" | "gold" }) {
  const map = { accent: [colors.accentSoft, colors.accentLine, colors.text], aqua: [colors.aquaSoft, "rgba(95,227,201,0.4)", colors.aqua], coral: [colors.coralSoft, "rgba(255,122,110,0.4)", colors.coral], gold: [colors.goldSoft, "rgba(242,196,100,0.4)", colors.gold] } as const;
  const [bg, line, fg] = map[tone];
  return (
    <View style={{ backgroundColor: bg, borderColor: line, borderWidth: 1, borderRadius: radius.sm, padding: 12, marginTop: 12 }}>
      {/* any bare string in the children (alone or mixed with <Text> spans) must sit inside a <Text> on native */}
      {Children.toArray(children).some((c) => typeof c === "string" || typeof c === "number") ? <Text style={{ fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: fg }}>{children}</Text> : children}
    </View>
  );
}

export function Avatar({ symbol, size = 36 }: { symbol: string; size?: number }) {
  return (
    <LinearGradient colors={["#2b4f8a", "#112233"]} style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.lineStrong }}>
      <Text style={{ fontFamily: fonts.displayBold, fontSize: size * 0.3, color: colors.text }}>{symbol.slice(0, 3).toUpperCase()}</Text>
    </LinearGradient>
  );
}

export function Skeleton({ width = "100%", height = 16 }: { width?: number | `${number}%`; height?: number }) {
  return <View style={{ width, height, borderRadius: 6, backgroundColor: colors.navy600, opacity: 0.6 }} />;
}

const styles = StyleSheet.create({
  arc: { position: "absolute", borderRadius: 9999, borderWidth: 1.5, borderColor: colors.line },
  glow: { position: "absolute", width: 420, height: 420, borderRadius: 210, right: -120, top: -140, backgroundColor: "rgba(95,227,201,0.10)" },
  card: { backgroundColor: colors.card, borderColor: colors.lineStrong, borderWidth: 1, borderRadius: radius.xl, padding: 18, marginTop: 14 },
  btn: { marginTop: 14, paddingVertical: 15, paddingHorizontal: 18, borderRadius: radius.md, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  btnSmall: { paddingVertical: 9, paddingHorizontal: 14, marginTop: 0, borderRadius: radius.sm },
  label: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.dim, marginBottom: 8 },
  inputWrap: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.lineStrong, borderRadius: radius.md, backgroundColor: colors.input },
  input: { flex: 1, paddingHorizontal: 14, paddingVertical: 13, fontFamily: fonts.mono, fontSize: 16, color: colors.text, minHeight: 50 },
  hint: { fontFamily: fonts.body, fontSize: 12, color: colors.faint, marginTop: 6, lineHeight: 17 },
  error: { fontFamily: fonts.body, fontSize: 12, color: colors.coral, marginTop: 6 },
  seg: { flexDirection: "row", padding: 4, borderRadius: 12, backgroundColor: "rgba(5,13,26,0.6)", borderWidth: 1, borderColor: colors.line, gap: 4, marginTop: 14 },
  segItem: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 9 },
  segOn: { backgroundColor: colors.navy600 },
  ledger: { backgroundColor: "rgba(5,13,26,0.45)", borderColor: colors.line, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 6, marginTop: 12 },
});
