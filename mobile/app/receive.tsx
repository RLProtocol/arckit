import { useState } from "react";
import { Pressable, Share, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import QRCode from "react-native-qrcode-svg";
import { useWallet } from "@/wallet/provider";
import { Button, Card, Eyebrow, H1, Mono, Notice, P, Row, Screen } from "@/components/ui";
import { colors, fonts } from "@/theme";

export default function Receive() {
  const { address } = useWallet();
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  return (
    <Screen footer={<View style={{ padding: 20, paddingBottom: 34 }}><Button title="Done" onPress={() => router.back()} /></View>}>
      <Row between style={{ marginTop: 14 }}><View><Eyebrow>Receive</Eyebrow><H1>Your Arc address</H1></View><Pressable onPress={() => router.back()}><Text style={{ fontFamily: fonts.bodyMedium, color: colors.dim }}>Close</Text></Pressable></Row>
      <Card style={{ alignItems: "center", paddingVertical: 28 }}>
        <View style={{ padding: 14, backgroundColor: "#fff", borderRadius: 18 }}>{address && <QRCode value={address} size={208} backgroundColor="#fff" color="#071426" />}</View>
        <Mono size={13} style={{ marginTop: 18, textAlign: "center", color: colors.dim, paddingHorizontal: 10 }}>{address}</Mono>
        <Row style={{ marginTop: 16 }}>
          <Button small kind="soft" title={copied ? "Copied" : "Copy address"} onPress={async () => { if (address) { await Clipboard.setStringAsync(address); setCopied(true); setTimeout(() => setCopied(false), 2000); } }} />
          <Button small kind="ghost" title="Share" onPress={() => address && void Share.share({ message: address })} />
        </Row>
      </Card>
      <Notice>Send only assets on the <Text style={{ fontFamily: fonts.bodyBold }}>Arc network</Text> (chain 5042) to this address: USDC and Arc tokens. Funds sent on other chains will not appear here.</Notice>
      <P small style={{ marginTop: 10 }}>Need USDC on Arc? Bridge from another chain with Circle CCTP or buy on an exchange that supports Arc withdrawals.</P>
    </Screen>
  );
}
