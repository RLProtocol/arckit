import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { Button, Card, Eyebrow, H1, Notice, P, Screen } from "@/components/ui";
import { PinPad } from "@/components/PinPad";
import { newMnemonic } from "@/wallet/store";
import { useWallet } from "@/wallet/provider";
import { colors, fonts, radius } from "@/theme";

type Step = "show" | "confirm" | "pin";

export default function Create() {
  const router = useRouter();
  const { create } = useWallet();
  const mnemonic = useMemo(() => newMnemonic(), []);
  const words = mnemonic.split(" ");
  const [step, setStep] = useState<Step>("show");
  const [copied, setCopied] = useState(false);
  // confirm three words at random positions
  const quiz = useMemo(() => [...Array(12).keys()].sort(() => Math.random() - 0.5).slice(0, 3).sort((a, b) => a - b), []);
  const [picked, setPicked] = useState<string[]>([]);
  const options = useMemo(() => { const need = quiz.map((i) => words[i]); const pool = words.filter((w) => !need.includes(w)).sort(() => Math.random() - 0.5).slice(0, 6); return [...need, ...pool].sort(() => Math.random() - 0.5); }, [quiz, words]);
  const quizOk = picked.length === 3 && picked.every((w, i) => w === words[quiz[i]]);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [busy, setBusy] = useState(false);

  const finish = async (p: string) => { setBusy(true); try { await create(mnemonic, p); router.replace("/(tabs)"); } finally { setBusy(false); } };

  if (step === "pin") {
    const confirming = pin.length === 6;
    return (
      <Screen scroll={false}>
        <View style={{ marginTop: 30 }}><Eyebrow>Step 3 of 3</Eyebrow><H1>{confirming ? "Repeat your PIN" : "Choose a 6-digit PIN"}</H1><P style={{ marginTop: 8 }}>The PIN unlocks the app and approves transactions. You can add Face ID or fingerprint afterwards in Settings.</P></View>
        <PinPad value={confirming ? pin2 : pin} onChange={(v) => { if (confirming) { setPin2(v); if (v.length === 6) { if (v === pin) void finish(v); else { setPin(""); setPin2(""); } } } else setPin(v); }} disabled={busy} />
        {confirming && pin2.length === 6 && pin2 !== pin ? <Notice tone="coral">PINs did not match. Start again.</Notice> : null}
        {busy ? <Notice tone="aqua">Securing your wallet… deriving the key from your phrase takes a few seconds on a phone.</Notice> : null}
      </Screen>
    );
  }

  if (step === "confirm") {
    return (
      <Screen footer={<View style={{ padding: 20, paddingBottom: 34 }}><Button title="Continue" disabled={!quizOk} onPress={() => setStep("pin")} /><Button title="Back to the phrase" kind="ghost" onPress={() => { setPicked([]); setStep("show"); }} /></View>}>
        <View style={{ marginTop: 30 }}><Eyebrow>Step 2 of 3</Eyebrow><H1>Confirm your phrase</H1><P style={{ marginTop: 8 }}>Tap word #{quiz[0] + 1}, then #{quiz[1] + 1}, then #{quiz[2] + 1}.</P></View>
        <Card>
          <View style={{ flexDirection: "row", gap: 8, minHeight: 44 }}>
            {quiz.map((q, i) => <View key={q} style={{ flex: 1, borderWidth: 1, borderColor: picked[i] ? (picked[i] === words[q] ? colors.aqua : colors.coral) : colors.lineStrong, borderRadius: radius.sm, padding: 10, alignItems: "center" }}><Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.faint }}>#{q + 1}</Text><Text style={{ fontFamily: fonts.bodyMedium, color: colors.text, marginTop: 2 }}>{picked[i] ?? " "}</Text></View>)}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
            {options.map((w) => { const used = picked.includes(w); return <Pressable key={w} disabled={used || picked.length >= 3} onPress={() => setPicked([...picked, w])} style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: used ? colors.navy600 : colors.input, opacity: used ? 0.4 : 1 }}><Text style={{ fontFamily: fonts.mono, fontSize: 13, color: colors.text }}>{w}</Text></Pressable>; })}
          </View>
          {picked.length === 3 && !quizOk ? <Notice tone="coral">That is not the right order. <Text onPress={() => setPicked([])} style={{ textDecorationLine: "underline" }}>Try again</Text>.</Notice> : null}
          {picked.length > 0 && picked.length < 3 ? <Pressable onPress={() => setPicked([])} style={{ marginTop: 10 }}><Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.faint }}>Clear</Text></Pressable> : null}
        </Card>
      </Screen>
    );
  }

  return (
    <Screen footer={<View style={{ padding: 20, paddingBottom: 34 }}><Button title="I wrote it down" onPress={() => setStep("confirm")} /></View>}>
      <View style={{ marginTop: 30 }}><Eyebrow>Step 1 of 3</Eyebrow><H1>Your seed phrase</H1><P style={{ marginTop: 8 }}>These 12 words are your wallet. Write them down in order and keep them offline. Anyone with them controls your funds; without them, lost funds cannot be recovered.</P></View>
      <Card>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {words.map((w, i) => <View key={i} style={{ width: "31%", flexDirection: "row", gap: 8, alignItems: "center", borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingVertical: 10, paddingHorizontal: 10, backgroundColor: colors.input }}><Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.faint, width: 18 }}>{i + 1}</Text><Text style={{ fontFamily: fonts.mono, fontSize: 14, color: colors.text }}>{w}</Text></View>)}
        </View>
        <Pressable onPress={async () => { await Clipboard.setStringAsync(mnemonic); setCopied(true); setTimeout(() => setCopied(false), 2500); }} style={{ marginTop: 14, alignSelf: "flex-start" }}><Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.accent }}>{copied ? "Copied. Clear your clipboard after saving it." : "Copy to clipboard"}</Text></Pressable>
      </Card>
      <Notice tone="gold">Never type this phrase into a website or share a screenshot of it. Arc Kit will never ask for it.</Notice>
    </Screen>
  );
}
