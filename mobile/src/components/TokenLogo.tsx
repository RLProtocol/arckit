import { useState } from "react";
import { Image, View } from "react-native";
import { Text } from "../i18n/Text";
import { LinearGradient } from "expo-linear-gradient";
import { colors, fonts } from "../theme";

const USDC = require("../../assets/usdc.png");
const ARCKIT = require("../../assets/logo.png");

/**
 * Real token artwork: the official USDC mark, the Arc Kit mark for AKIT, DexScreener images for other Arc tokens,
 * and a gradient monogram only when nothing else exists.
 */
export function TokenLogo({ symbol, uri, size = 36 }: { symbol: string; uri?: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const local = symbol.toUpperCase() === "USDC" ? USDC : symbol.toUpperCase() === "AKIT" ? ARCKIT : undefined;
  const source = local ?? (uri && !failed ? { uri } : undefined);
  const ring = { width: size, height: size, borderRadius: size / 2, borderWidth: 1, borderColor: colors.lineStrong, overflow: "hidden" as const, backgroundColor: colors.navy600 };
  if (source) {
    return <View style={ring}><Image source={source} onError={() => setFailed(true)} style={{ width: size, height: size }} resizeMode="cover" /></View>;
  }
  return (
    <LinearGradient colors={["#2b4f8a", "#112233"]} style={[ring, { alignItems: "center", justifyContent: "center" }]}>
      <Text style={{ fontFamily: fonts.displayBold, fontSize: size * 0.3, color: colors.text }}>{symbol.slice(0, 3).toUpperCase()}</Text>
    </LinearGradient>
  );
}

/** Arc Kit mark + wordmark, used at the top of every tab. */
export function Brand({ right, subtitle }: { right?: React.ReactNode; subtitle?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Image source={ARCKIT} style={{ width: 30, height: 30, borderRadius: 8 }} />
        <View>
          <Text style={{ fontFamily: fonts.display, fontSize: 17, color: colors.text, letterSpacing: -0.2 }}>Arc<Text style={{ fontFamily: fonts.displayLight, color: colors.dim }}> Kit</Text></Text>
          {subtitle ? <Text style={{ fontFamily: fonts.mono, fontSize: 10, color: colors.faint, letterSpacing: 1 }}>{subtitle}</Text> : null}
        </View>
      </View>
      {right}
    </View>
  );
}
