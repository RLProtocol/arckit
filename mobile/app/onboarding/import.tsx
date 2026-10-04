import { useEffect, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { Button, Eyebrow, Field, H1, Notice, P, Screen } from "@/components/ui";
import { PinPad } from "@/components/PinPad";
import { deriveAccount, isValidMnemonic } from "@/wallet/store";
import { useWallet } from "@/wallet/provider";
import { shortAddr } from "@/lib/format";

export default function Import() {
  const router = useRouter();
  const { create } = useWallet();
  const [phrase, setPhrase] = useState("");
  const [step, setStep] = useState<"phrase" | "pin">("phrase");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [busy, setBusy] = useState(false);
  const clean = phrase.trim().toLowerCase().replace(/\s+/g, " ");
  const n = clean ? clean.split(" ").length : 0;
  const valid = isValidMnemonic(clean);
  const [address, setAddress] = useState<string | undefined>();
  useEffect(() => {
    setAddress(undefined);
    if (!valid) return;
    let live = true;
    const t = setTimeout(() => void deriveAccount(clean).then((a) => live && setAddress(a.address)).catch(() => {}), 500);
    return () => { live = false; clearTimeout(t); };
  }, [clean, valid]);

  if (step === "pin") {
    const confirming = pin.length === 6;
    return (
      <Screen scroll={false}>
        <View style={{ marginTop: 30 }}><Eyebrow>Wallet {shortAddr(address)}</Eyebrow><H1>{confirming ? "Repeat your PIN" : "Choose a 6-digit PIN"}</H1><P style={{ marginTop: 8 }}>The PIN unlocks the app and approves transactions on this phone.</P></View>
        {busy ? <Notice tone="aqua">Securing your wallet… deriving the key from your phrase takes a few seconds on a phone.</Notice> : null}
        <PinPad value={confirming ? pin2 : pin} disabled={busy} onChange={async (v) => { if (!confirming) return setPin(v); setPin2(v); if (v.length === 6) { if (v === pin) { setBusy(true); try { await create(clean, v); router.replace("/(tabs)"); } finally { setBusy(false); } } else { setPin(""); setPin2(""); } } }} />
      </Screen>
    );
  }

  return (
    <Screen footer={<View style={{ padding: 20, paddingBottom: 34 }}><Button title="Import wallet" disabled={!valid} onPress={() => setStep("pin")} /></View>}>
      <View style={{ marginTop: 30 }}><Eyebrow>Import</Eyebrow><H1>Enter your seed phrase</H1><P style={{ marginTop: 8 }}>12 or 24 words from any Ethereum-style wallet (MetaMask, Trust, Rabby). The first account is used.</P></View>
      <Field label="Seed phrase" multiline numberOfLines={4} value={phrase} onChangeText={setPhrase} placeholder="word word word …" style={{ minHeight: 110, textAlignVertical: "top", fontSize: 15 }} hint={n ? `${n} words${valid ? (address ? ` · ${shortAddr(address, 6)}` : " · valid phrase, deriving address…") : ""}` : "Words separated by spaces."} error={n >= 12 && !valid ? "That is not a valid phrase. Check the spelling and order." : undefined} />
      <Notice tone="gold">Only import on a phone you trust. The phrase is stored in the secure enclave and never sent anywhere.</Notice>
    </Screen>
  );
}
