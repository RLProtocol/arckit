import { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Button, Card, Eyebrow, H1, Notice, P, Screen } from "@/components/ui";
import { PinPad } from "@/components/PinPad";
import { readMnemonic, verifyPin } from "@/wallet/store";
import { colors, fonts, radius } from "@/theme";

/** Shows the seed phrase again, after the PIN. */
export default function Backup() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [words, setWords] = useState<string[] | null>(null);
  const [bad, setBad] = useState(false);
  if (!words) {
    return (
      <Screen scroll={false}>
        <View style={{ marginTop: 30 }}><Eyebrow>Backup</Eyebrow><H1>Enter your PIN to reveal the phrase</H1>{bad && <Notice tone="coral">Wrong PIN.</Notice>}</View>
        <PinPad value={pin} onChange={async (v) => { setPin(v); if (v.length === 6) { if (await verifyPin(v)) setWords(((await readMnemonic()) ?? "").split(" ")); else { setBad(true); setPin(""); } } }} />
      </Screen>
    );
  }
  return (
    <Screen footer={<View style={{ padding: 20, paddingBottom: 34 }}><Button title="Done" onPress={() => router.back()} /></View>}>
      <View style={{ marginTop: 30 }}><Eyebrow>Backup</Eyebrow><H1>Your seed phrase</H1><P style={{ marginTop: 8 }}>Make sure nobody is looking. Write it down, never store it as a screenshot.</P></View>
      <Card>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {words.map((w, i) => <View key={i} style={{ width: "31%", flexDirection: "row", gap: 8, alignItems: "center", borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingVertical: 10, paddingHorizontal: 10, backgroundColor: colors.input }}><Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.faint, width: 18 }}>{i + 1}</Text><Text style={{ fontFamily: fonts.mono, fontSize: 14, color: colors.text }}>{w}</Text></View>)}
        </View>
      </Card>
    </Screen>
  );
}
