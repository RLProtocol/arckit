import { Linking, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useWallet } from "@/wallet/provider";
import { useActivity } from "@/hooks/useArcKit";
import { explorerTx } from "@/chain";
import { Card, Eyebrow, H1, Mono, P, Row, Screen, Skeleton } from "@/components/ui";
import { fmtTok, fmtUsd, shortAddr, timeAgo } from "@/lib/format";
import { colors, fonts } from "@/theme";

export default function Activity() {
  const { address } = useWallet();
  const router = useRouter();
  const act = useActivity(address);
  return (
    <Screen>
      <Row between style={{ marginTop: 14 }}><View><Eyebrow>History</Eyebrow><H1>Activity</H1></View><Pressable onPress={() => router.back()}><Text style={{ fontFamily: fonts.bodyMedium, color: colors.dim }}>Close</Text></Pressable></Row>
      <Card tight style={{ paddingHorizontal: 14 }}>
        {act.isLoading && [0, 1, 2, 3].map((i) => <View key={i} style={{ paddingVertical: 14 }}><Skeleton /></View>)}
        {act.isError && <P small style={{ padding: 12 }}>Could not load activity. Pull to refresh later.</P>}
        {act.data?.length === 0 && <P small style={{ padding: 12 }}>No transactions yet.</P>}
        {act.data?.map((a, i) => {
          const out = a.from.toLowerCase() === address?.toLowerCase();
          return (
            <Pressable key={a.hash} onPress={() => Linking.openURL(explorerTx(a.hash))} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: colors.line }}>
              <Row><View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: a.ok ? (out ? colors.coralSoft : colors.aquaSoft) : colors.goldSoft, alignItems: "center", justifyContent: "center" }}><Ionicons name={!a.ok ? "alert" : out ? "arrow-up" : "arrow-down"} size={16} color={!a.ok ? colors.gold : out ? colors.coral : colors.aqua} /></View><View style={{ flex: 1 }}><Text style={{ fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text }}>{a.fn}{a.ok ? "" : " · failed"}</Text><Mono size={11} style={{ color: colors.faint }}>{out ? `to ${shortAddr(a.to)}` : `from ${shortAddr(a.from)}`} · {timeAgo(a.ts)}</Mono></View></Row>
              <Text style={{ fontFamily: fonts.mono, fontSize: 13, color: out ? colors.text : colors.aqua, marginLeft: 8 }}>{a.value > 0n ? `${out ? "−" : "+"}${a.token ? `${fmtTok(a.value, a.token.decimals, 2)} ${a.token.symbol}` : `${fmtUsd(a.value, 4)} USDC`}` : ""}</Text>
            </Pressable>
          );
        })}
      </Card>
      <P small style={{ marginTop: 10 }}>Tap a row to open it on Arc Etherscan.</P>
    </Screen>
  );
}
