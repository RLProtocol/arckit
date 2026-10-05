import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useWallet } from "@/wallet/provider";
import { useBalances } from "@/hooks/useBalances";
import { useActivity } from "@/hooks/useArcKit";
import { useTokenImages } from "@/hooks/useTokenImages";
import { Card, Eyebrow, Mono, P, Row, Skeleton } from "@/components/ui";
import { Brand, TokenLogo } from "@/components/TokenLogo";
import { ActivityRow } from "@/components/ActivityRow";
import { fmtPrice, fmtTok, fmtUsd, shortAddr, timeAgo } from "@/lib/format";
import { colors, fonts, radius } from "@/theme";

const USDC = require("../../assets/usdc.png");

export default function Wallet() {
  const { address } = useWallet();
  const router = useRouter();
  const bal = useBalances(address);
  const act = useActivity(address);
  const images = useTokenImages(bal.data?.tokens.map((t) => t.address) ?? []);
  const total = bal.data?.total ?? 0n;
  const shown = bal.data?.tokens.filter((t) => t.balance > 0n || t.symbol === "AKIT") ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.navy900 }}>
      <LinearGradient colors={[colors.navy800, colors.navy700, "#0a2a3a"]} locations={[0, 0.55, 1]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]} />
      <SafeAreaView style={{ flex: 1, zIndex: 1 }} edges={["top"]}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={bal.isRefetching} onRefresh={() => { void bal.refetch(); void act.refetch(); }} tintColor={colors.accent} />} showsVerticalScrollIndicator={false}>
          <Brand subtitle="WALLET · ARC" right={<Row style={{ gap: 8 }}><Pressable onPress={() => router.push("/activity")} hitSlop={8} style={styles.iconBtn}><Ionicons name="time-outline" size={19} color={colors.dim} /></Pressable><Pressable onPress={() => router.push("/settings")} hitSlop={8} style={styles.iconBtn}><Ionicons name="settings-outline" size={19} color={colors.dim} /></Pressable></Row>} />

          {/* hero balance card */}
          <LinearGradient colors={["#123a63", "#0b2240", "#0e3a4a"]} locations={[0, 0.55, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
            <View style={styles.heroArc} pointerEvents="none" />
            <View style={[styles.heroArc, { width: 420, height: 420, right: -170, top: -230, borderWidth: 1 }]} pointerEvents="none" />
            <Row between>
              <Eyebrow color="rgba(238,244,255,0.7)">Total balance</Eyebrow>
              <Pressable onPress={() => address && void Clipboard.setStringAsync(address)} style={styles.addrChip}><Mono size={11} style={{ color: colors.text }}>{shortAddr(address, 4)}</Mono><Ionicons name="copy-outline" size={12} color={colors.dim} /></Pressable>
            </Row>
            {bal.isLoading ? <View style={{ marginTop: 14 }}><Skeleton width={190} height={46} /></View> : (
              <Row style={{ marginTop: 10, gap: 12 }}>
                <Image source={USDC} style={{ width: 40, height: 40, borderRadius: 20 }} />
                <Text style={{ fontFamily: fonts.display, fontSize: 42, letterSpacing: -1.4, color: colors.text }}>{fmtUsd(total)}<Text style={{ fontSize: 18, color: colors.dim, fontFamily: fonts.displayLight }}>  USDC</Text></Text>
              </Row>
            )}
            {bal.isError ? (
              <Pressable onPress={() => void bal.refetch()} style={{ marginTop: 8 }}><Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.gold }}>Could not load balances. Tap to retry.</Text><Text style={{ fontFamily: fonts.mono, fontSize: 11, color: "rgba(238,244,255,0.6)", marginTop: 4 }} selectable>{(bal.error as Error)?.message?.slice(0, 200)}</Text></Pressable>
            ) : (
              <Text style={{ fontFamily: fonts.body, fontSize: 13, color: "rgba(238,244,255,0.72)", marginTop: 8 }}>{bal.data ? `${fmtUsd(bal.data.native)} USDC cash · ${fmtUsd(total - bal.data.native)} in Arc tokens` : "Reading Arc…"}</Text>
            )}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 20 }}>
              <Action icon="arrow-up" label="Send" onPress={() => router.push("/send")} primary />
              <Action icon="arrow-down" label="Receive" onPress={() => router.push("/receive")} />
              <Action icon="pulse-outline" label="Trade" onPress={() => router.push("/trade")} />
              <Action icon="people-outline" label="P2P" onPress={() => router.push("/p2p")} />
            </View>
          </LinearGradient>

          <Card>
            <Row between><Eyebrow color={colors.accent}>Assets</Eyebrow><Pressable onPress={() => router.push("/token-add")}><Text style={styles.link}>+ Add token</Text></Pressable></Row>
            <TokenRow logo={<TokenLogo symbol="USDC" />} symbol="USDC" name="USD Coin · native on Arc" amount={bal.data ? fmtUsd(bal.data.native, 4) : undefined} value={bal.data ? fmtUsd(bal.data.native) : undefined} price="1.00" />
            {bal.isLoading && [0, 1].map((i) => <View key={i} style={{ paddingVertical: 12 }}><Skeleton /></View>)}
            {bal.isError && <P small style={{ marginTop: 10 }}>Balances could not be loaded. Pull down to refresh.</P>}
            {shown.map((t) => (
              <TokenRow key={t.address} logo={<TokenLogo symbol={t.symbol} uri={images[t.address.toLowerCase()]} />} symbol={t.symbol} name={t.name} amount={fmtTok(t.balance, t.decimals, 2)} value={t.price > 0n ? fmtUsd(t.value) : undefined} price={t.price > 0n ? fmtPrice(t.price) : undefined} onPress={() => router.push({ pathname: "/send", params: { token: t.address } })} />
            ))}
          </Card>

          <Card>
            <Row between><Eyebrow color={colors.accent}>Recent activity</Eyebrow><Pressable onPress={() => router.push("/activity")}><Text style={styles.link}>See all</Text></Pressable></Row>
            {act.isLoading && <View style={{ paddingVertical: 12 }}><Skeleton /></View>}
            {act.data?.length === 0 && <P small style={{ marginTop: 10 }}>No transactions yet. Receive some USDC to get started.</P>}
            {act.data?.slice(0, 4).map((a) => <ActivityRow key={a.hash} a={a} me={address} />)}
          </Card>
          <Row style={{ marginTop: 16, gap: 8 }}><View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.aqua }} /><Mono size={11} style={{ color: colors.faint }}>Arc · chain 5042 · gas paid in USDC</Mono></Row>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Action({ icon, label, onPress, primary }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flex: 1, alignItems: "center", gap: 6, paddingVertical: 12, borderRadius: radius.md, backgroundColor: primary ? colors.accent : "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: primary ? colors.accent : "rgba(255,255,255,0.12)", opacity: pressed ? 0.8 : 1 })}>
      <Ionicons name={icon} size={18} color={primary ? colors.navy800 : colors.text} />
      <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: primary ? colors.navy800 : colors.text }}>{label}</Text>
    </Pressable>
  );
}

function TokenRow({ logo, symbol, name, amount, value, price, onPress }: { logo: React.ReactNode; symbol: string; name: string; amount?: string; value?: string; price?: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.line, marginTop: 2 }}>
      <Row>{logo}<View><Text style={{ fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text }}>{symbol}</Text><Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.faint }}>{price ? `$${price} · ${name}` : name}</Text></View></Row>
      <View style={{ alignItems: "flex-end" }}>{amount === undefined ? <Skeleton width={70} /> : <Text style={{ fontFamily: fonts.mono, fontSize: 14, color: colors.text }}>{amount}</Text>}{value !== undefined && <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.faint }}>{value} USDC</Text>}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { marginTop: 18, borderRadius: radius.xl, padding: 20, borderWidth: 1, borderColor: "rgba(143,179,255,0.28)", overflow: "hidden" },
  heroArc: { position: "absolute", width: 300, height: 300, borderRadius: 150, right: -110, top: -160, borderWidth: 1.5, borderColor: "rgba(214,230,255,0.14)" },
  addrChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: "rgba(5,13,26,0.45)", borderWidth: 1, borderColor: "rgba(214,230,255,0.16)" },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.card },
  link: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.accent },
});
