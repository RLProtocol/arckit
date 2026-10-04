import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useWallet } from "@/wallet/provider";
import { useBalances } from "@/hooks/useBalances";
import { useActivity } from "@/hooks/useArcKit";
import { Avatar, Card, Eyebrow, Mono, P, Pill, Row, Skeleton } from "@/components/ui";
import { fmtPrice, fmtTok, fmtUsd, shortAddr, timeAgo } from "@/lib/format";
import { colors, fonts, radius } from "@/theme";

export default function Wallet() {
  const { address } = useWallet();
  const router = useRouter();
  const bal = useBalances(address);
  const act = useActivity(address);
  const total = bal.data?.total ?? 0n;

  return (
    <View style={{ flex: 1, backgroundColor: colors.navy900 }}>
      <LinearGradient colors={[colors.navy800, colors.navy700, "#0a2a3a"]} locations={[0, 0.55, 1]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none" }} />
      <SafeAreaView style={{ flex: 1, zIndex: 1 }} edges={["top"]}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={bal.isRefetching} onRefresh={() => { void bal.refetch(); void act.refetch(); }} tintColor={colors.accent} />} showsVerticalScrollIndicator={false}>
          <Row between>
            <Row><Avatar symbol="AK" size={34} /><View><Text style={{ fontFamily: fonts.display, fontSize: 17, color: colors.text }}>Main wallet</Text><Pressable onPress={() => address && void Clipboard.setStringAsync(address)}><Mono size={11} style={{ color: colors.faint }}>{shortAddr(address, 6)} · tap to copy</Mono></Pressable></View></Row>
            <Pressable onPress={() => router.push("/activity")} hitSlop={10}><Ionicons name="time-outline" size={22} color={colors.dim} /></Pressable>
          </Row>

          <View style={{ marginTop: 28 }}>
            <Eyebrow>Total balance</Eyebrow>
            {bal.isLoading ? <Skeleton width={200} height={44} /> : <Text style={{ fontFamily: fonts.display, fontSize: 44, letterSpacing: -1.2, color: colors.text, marginTop: 6 }}>{fmtUsd(total)} <Text style={{ fontSize: 20, color: colors.dim, fontFamily: fonts.displayLight }}>USDC</Text></Text>}
            <P small style={{ marginTop: 4 }}>{bal.data ? `${fmtUsd(bal.data.native)} USDC in cash · ${fmtUsd(total - bal.data.native)} in tokens` : "Reading Arc…"}</P>
          </View>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 22 }}>
            <Action icon="arrow-up-outline" label="Send" onPress={() => router.push("/send")} primary />
            <Action icon="arrow-down-outline" label="Receive" onPress={() => router.push("/receive")} />
            <Action icon="cart-outline" label="Buy" onPress={() => router.push({ pathname: "/dapp", params: { path: "/pay", title: "ArcPay" } })} />
            <Action icon="swap-horizontal-outline" label="Trade" onPress={() => router.push("/p2p")} />
          </View>

          <Card>
            <Row between><Eyebrow color={colors.accent}>Assets</Eyebrow><Pressable onPress={() => router.push("/token-add")}><Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.accent }}>+ Add token</Text></Pressable></Row>
            <TokenRow symbol="USDC" name="Arc native coin" amount={bal.data ? fmtUsd(bal.data.native, 4) : undefined} value={bal.data ? fmtUsd(bal.data.native) : undefined} price="1.00" />
            {bal.isLoading && [0, 1, 2].map((i) => <View key={i} style={{ paddingVertical: 12 }}><Skeleton /></View>)}
            {bal.data?.tokens.filter((t) => t.balance > 0n || t.symbol === "AKIT").map((t) => (
              <TokenRow key={t.address} symbol={t.symbol} name={t.name} amount={fmtTok(t.balance, t.decimals, 2)} value={t.price > 0n ? fmtUsd(t.value) : undefined} price={t.price > 0n ? fmtPrice(t.price) : undefined} onPress={() => router.push({ pathname: "/send", params: { token: t.address } })} />
            ))}
          </Card>

          <Card>
            <Row between><Eyebrow color={colors.accent}>Recent activity</Eyebrow><Pressable onPress={() => router.push("/activity")}><Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.accent }}>See all</Text></Pressable></Row>
            {act.isLoading && <View style={{ paddingVertical: 12 }}><Skeleton /></View>}
            {act.data?.length === 0 && <P small style={{ marginTop: 10 }}>No transactions yet. Receive some USDC to get started.</P>}
            {act.data?.slice(0, 4).map((a) => {
              const out = a.from.toLowerCase() === address?.toLowerCase();
              return (
                <Row key={a.hash} between style={{ paddingVertical: 11, borderTopWidth: 1, borderTopColor: colors.line }}>
                  <Row><View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: out ? colors.coralSoft : colors.aquaSoft, alignItems: "center", justifyContent: "center" }}><Ionicons name={out ? "arrow-up" : "arrow-down"} size={16} color={out ? colors.coral : colors.aqua} /></View><View><Text style={{ fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text }}>{a.fn}</Text><Mono size={11} style={{ color: colors.faint }}>{out ? `to ${shortAddr(a.to)}` : `from ${shortAddr(a.from)}`} · {timeAgo(a.ts)}</Mono></View></Row>
                  <Text style={{ fontFamily: fonts.mono, fontSize: 13, color: out ? colors.text : colors.aqua }}>{a.value > 0n ? `${out ? "−" : "+"}${a.token ? fmtTok(a.value, a.token.decimals, 2) + " " + a.token.symbol : fmtUsd(a.value, 4) + " USDC"}` : ""}</Text>
                </Row>
              );
            })}
          </Card>
          <Pill tone="dim">Arc · chain 5042 · gas in USDC</Pill>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Action({ icon, label, onPress, primary }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flex: 1, alignItems: "center", gap: 7, paddingVertical: 14, borderRadius: radius.lg, backgroundColor: primary ? colors.accent : colors.card, borderWidth: 1, borderColor: primary ? colors.accent : colors.lineStrong, opacity: pressed ? 0.8 : 1 })}>
      <Ionicons name={icon} size={20} color={primary ? colors.navy800 : colors.text} />
      <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: primary ? colors.navy800 : colors.dim }}>{label}</Text>
    </Pressable>
  );
}

function TokenRow({ symbol, name, amount, value, price, onPress }: { symbol: string; name: string; amount?: string; value?: string; price?: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.line, marginTop: 2 }}>
      <Row><Avatar symbol={symbol} /><View><Text style={{ fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text }}>{symbol}</Text><Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.faint }}>{price ? `$${price} · ${name}` : name}</Text></View></Row>
      <View style={{ alignItems: "flex-end" }}>{amount === undefined ? <Skeleton width={70} /> : <Text style={{ fontFamily: fonts.mono, fontSize: 14, color: colors.text }}>{amount}</Text>}{value !== undefined && <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.faint }}>{value} USDC</Text>}</View>
    </Pressable>
  );
}
