import { Linking, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useWallet } from "@/wallet/provider";
import { useActivity } from "@/hooks/useArcKit";
import { explorerTx } from "@/chain";
import { Card, Eyebrow, H1, P, Row, Screen, Skeleton } from "@/components/ui";
import { ActivityRow } from "@/components/ActivityRow";
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
        {act.data?.map((a, i) => <ActivityRow key={a.hash} a={a} me={address} first={i === 0} onPress={() => Linking.openURL(explorerTx(a.hash))} />)}
      </Card>
      <P small style={{ marginTop: 10 }}>Tap a row to open it on Arc Etherscan.</P>
    </Screen>
  );
}
