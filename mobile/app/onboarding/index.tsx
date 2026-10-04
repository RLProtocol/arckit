import { Image, Text, View } from "react-native";
const USDC = require("../../assets/usdc.png");
import { useRouter } from "expo-router";
import { Button, Eyebrow, H1, P, Screen } from "@/components/ui";
import { colors, fonts } from "@/theme";

const FEATURES: [string, string][] = [
  ["Your keys", "A 12-word seed phrase made on this phone, stored in its secure enclave. Nobody else ever sees it."],
  ["USDC native", "Arc's gas coin is USDC. Hold it, send it, earn on it, spend it on gift cards."],
  ["Every Arc Kit tool", "Lock, vest, stake, lend, trade peer to peer, send privately. All signed by this wallet."],
];

export default function Welcome() {
  const router = useRouter();
  return (
    <Screen footer={<View style={{ padding: 20, paddingBottom: 34 }}><Button title="Create a new wallet" onPress={() => router.push("/onboarding/create")} /><Button title="I already have a seed phrase" kind="ghost" onPress={() => router.push("/onboarding/import")} /></View>}>
      <View style={{ alignItems: "center", marginTop: 40 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Image source={require("../../assets/logo.png")} style={{ width: 84, height: 84, borderRadius: 24, borderWidth: 1, borderColor: colors.lineStrong }} />
          <Image source={USDC} style={{ width: 56, height: 56, borderRadius: 28, marginLeft: -14, borderWidth: 2, borderColor: colors.navy800 }} />
        </View>
        <Text style={{ fontFamily: fonts.display, fontSize: 40, color: colors.text, marginTop: 22, letterSpacing: -1 }}>Arc<Text style={{ fontFamily: fonts.displayLight, color: colors.dim }}> Kit</Text></Text>
        <P style={{ textAlign: "center", marginTop: 6 }}>The wallet for Arc. Self-custody, USDC first.</P>
      </View>
      <View style={{ marginTop: 44, gap: 18 }}>
        {FEATURES.map(([t, d]) => (
          <View key={t} style={{ flexDirection: "row", gap: 14 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.aqua, marginTop: 7 }} />
            <View style={{ flex: 1 }}><Eyebrow>{t}</Eyebrow><P style={{ marginTop: 4 }}>{d}</P></View>
          </View>
        ))}
      </View>
      <H1 style={{ display: "none" }}>Arc Kit</H1>
    </Screen>
  );
}
