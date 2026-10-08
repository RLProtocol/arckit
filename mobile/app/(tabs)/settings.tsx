import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Linking, Platform, Pressable, Switch, View } from "react-native";
import { Text } from "@/i18n/Text";
import { Text as RNText } from "react-native";
import { useRouter } from "expo-router";
import * as LocalAuthentication from "expo-local-authentication";
import * as Clipboard from "expo-clipboard";
import { useWallet } from "@/wallet/provider";
import { setBiometricsEnabled } from "@/wallet/store";
import { explorerAddress, SITE } from "@/chain";
import { Card, Eyebrow, H1, Mono, Notice, P, Row, Screen } from "@/components/ui";
import { Brand } from "@/components/TokenLogo";
import { LANGS, useLang } from "@/i18n";
import { shortAddr } from "@/lib/format";
import { colors, fonts } from "@/theme";

export default function Settings() {
  const { address, biometrics, lock, reset, refresh } = useWallet();
  const router = useRouter();
  const [bioAvailable, setBioAvailable] = useState(false);
  const [confirmErase, setConfirmErase] = useState(false);
  const { lang, setLang } = useLang();
  useEffect(() => { if (Platform.OS !== "web") void LocalAuthentication.hasHardwareAsync().then(async (h) => setBioAvailable(h && (await LocalAuthentication.isEnrolledAsync()))); }, []);

  const toggleBio = async (on: boolean) => {
    if (on) { const r = await LocalAuthentication.authenticateAsync({ promptMessage: "Enable biometric unlock" }); if (!r.success) return; }
    await setBiometricsEnabled(on); await refresh();
  };

  return (
    <Screen>
      <Brand subtitle="SETTINGS" />
      <View style={{ marginTop: 22 }}><H1>Wallet</H1></View>
      <Card>
        <Eyebrow color={colors.accent}>Address</Eyebrow>
        <Pressable onPress={() => address && void Clipboard.setStringAsync(address)}><Mono size={13} style={{ marginTop: 8, color: colors.dim }}>{address}</Mono></Pressable>
        <Row style={{ marginTop: 12, gap: 16 }}>
          <Link label="Copy" onPress={() => address && void Clipboard.setStringAsync(address)} />
          <Link label="View on Etherscan" onPress={() => address && Linking.openURL(explorerAddress(address))} />
        </Row>
      </Card>
      <Card>
        <Eyebrow color={colors.accent}>Language</Eyebrow>
        <View style={{ marginTop: 10, gap: 8 }}>
          {LANGS.map((l) => {
            const on = l.code === lang;
            return (
              <Pressable key={l.code} onPress={() => setLang(l.code)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: on ? colors.accentLine : colors.line, backgroundColor: on ? colors.accentSoft : pressed ? colors.navy600 : "transparent" })}>
                <View>
                  <RNText style={{ fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text }}>{l.native}</RNText>
                  {l.code !== "en" ? <RNText style={{ fontFamily: fonts.body, fontSize: 12, color: colors.faint }}>{l.label}</RNText> : null}
                </View>
                {on ? <Ionicons name="checkmark-circle" size={20} color={colors.accent} /> : <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: colors.lineStrong }} />}
              </Pressable>
            );
          })}
        </View>
      </Card>
      <Card>
        <Eyebrow color={colors.accent}>Security</Eyebrow>
        <Row between style={{ marginTop: 12 }}><View style={{ flex: 1 }}><Text style={styles.item}>Unlock with Face ID / fingerprint</Text><P small>{bioAvailable ? "Skip the PIN when opening the app." : "Not available on this device."}</P></View><Switch value={biometrics} disabled={!bioAvailable} onValueChange={(v) => void toggleBio(v)} trackColor={{ true: colors.aqua, false: colors.navy600 }} thumbColor="#fff" /></Row>
        <Item label="Back up seed phrase" sub="Shows your 12 words after the PIN." onPress={() => router.push("/backup")} />
        <Item label="Lock now" sub="Requires the PIN or biometrics to continue." onPress={lock} />
      </Card>
      <Card>
        <Eyebrow color={colors.accent}>About</Eyebrow>
        <Item label="Arc Kit website" sub="usearckit.online" onPress={() => Linking.openURL(SITE)} />
        <Item label="Documentation" sub="How every tool works" onPress={() => Linking.openURL(`${SITE}/docs`)} />
        <P small style={{ marginTop: 12 }}>Arc Kit Wallet 1.0 · Arc chain 5042 · keys never leave this device.</P>
      </Card>
      <Card style={{ borderColor: "rgba(255,122,110,0.35)" }}>
        <Eyebrow color={colors.coral}>Danger zone</Eyebrow>
        <Item label="Erase wallet from this phone" sub={`Removes ${shortAddr(address)} and its seed. Funds stay on Arc; only the phrase brings them back.`} onPress={() => setConfirmErase(!confirmErase)} danger />
        {confirmErase && <Notice tone="coral"><Text style={{ color: colors.coral, fontFamily: fonts.body, fontSize: 13 }}>Make sure your seed phrase is written down. </Text><Text onPress={() => void reset().then(() => router.replace("/onboarding"))} style={{ color: colors.coral, fontFamily: fonts.bodyBold, fontSize: 13, textDecorationLine: "underline" }}>Erase now</Text></Notice>}
      </Card>
    </Screen>
  );
}

function Item({ label, sub, onPress, danger }: { label: string; sub?: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.line, marginTop: 10, opacity: pressed ? 0.7 : 1 })}>
      <Text style={[styles.item, danger && { color: colors.coral }]}>{label}</Text>
      {sub ? <P small>{sub}</P> : null}
    </Pressable>
  );
}
function Link({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable onPress={onPress}><Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.accent }}>{label}</Text></Pressable>;
}
const styles = { item: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text } };
