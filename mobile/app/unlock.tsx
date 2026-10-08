import { useEffect, useState } from "react";
import { Image, Pressable, View } from "react-native";
import { Text } from "@/i18n/Text";
import { useRouter } from "expo-router";
import { Eyebrow, H1, Notice, P, Screen } from "@/components/ui";
import { PinPad } from "@/components/PinPad";
import { useWallet } from "@/wallet/provider";
import { shortAddr } from "@/lib/format";
import { colors, fonts } from "@/theme";

export default function Unlock() {
  const { address, biometrics, unlockWithPin, unlockWithBiometrics, reset } = useWallet();
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [fails, setFails] = useState(0);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => { if (biometrics) void unlockWithBiometrics(); }, [biometrics, unlockWithBiometrics]);

  const onChange = async (v: string) => {
    setPin(v);
    if (v.length === 6) {
      const ok = await unlockWithPin(v);
      if (ok) router.replace("/(tabs)");
      else { setFails((f) => f + 1); setPin(""); }
    }
  };

  return (
    <Screen scroll={false}>
      <View style={{ alignItems: "center", marginTop: 40 }}>
        <Image source={require("../assets/icon.png")} style={{ width: 64, height: 64, borderRadius: 18, borderWidth: 1, borderColor: colors.lineStrong }} />
        <Eyebrow>{shortAddr(address, 6)}</Eyebrow>
        <H1 style={{ textAlign: "center" }}>Enter your PIN</H1>
        {fails > 0 && <Notice tone="coral">{fails > 2 ? `Wrong PIN, ${fails} attempts` : "Wrong PIN."}</Notice>}
      </View>
      <PinPad value={pin} onChange={onChange} extra={biometrics ? { label: "Face ID", onPress: () => void unlockWithBiometrics().then((ok) => ok && router.replace("/(tabs)")) } : undefined} />
      <Pressable onPress={() => setConfirmReset(!confirmReset)} style={{ alignSelf: "center", marginBottom: 14 }}><Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.faint }}>Forgot your PIN?</Text></Pressable>
      {confirmReset && (
        <View style={{ marginBottom: 20 }}>
          <P small style={{ textAlign: "center" }}>The only way back in is to erase this wallet from the phone and import your seed phrase again.</P>
          <Pressable onPress={() => void reset().then(() => router.replace("/onboarding"))} style={{ alignSelf: "center", marginTop: 8 }}><Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: colors.coral }}>Erase and import seed phrase</Text></Pressable>
        </View>
      )}
    </Screen>
  );
}
