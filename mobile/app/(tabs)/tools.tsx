import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Eyebrow, H1, Notice, P, Screen } from "@/components/ui";
import { Brand } from "@/components/TokenLogo";
import { colors, fonts, radius } from "@/theme";

type Tool = { key: string; name: string; text: string; icon: keyof typeof Ionicons.glyphMap; path?: string; tab?: string; tint: [string, string] };
const T = { blue: ["rgba(143,179,255,0.22)", "#8fb3ff"], aqua: ["rgba(95,227,201,0.2)", "#5fe3c9"], gold: ["rgba(242,196,100,0.2)", "#f2c464"], coral: ["rgba(255,122,110,0.2)", "#ff7a6e"], violet: ["rgba(186,156,255,0.22)", "#ba9cff"] } as const;
const TOOLS: Tool[] = [
  { key: "lock", name: "ArcLock", text: "Lock tokens or LP with a public certificate.", icon: "lock-closed-outline", path: "/lock/new", tint: [...T.blue] },
  { key: "vest", name: "Vesting", text: "Linear schedules with a cliff.", icon: "hourglass-outline", path: "/vest/new", tint: [...T.violet] },
  { key: "airdrop", name: "Airdrop", text: "Pay up to 500 wallets in one transaction.", icon: "gift-outline", path: "/airdrop", tint: [...T.gold] },
  { key: "stake", name: "Staking", text: "Time-boxed reward pools for any token.", icon: "layers-outline", path: "/stake", tint: [...T.aqua] },
  { key: "flow", name: "ArcFlow", text: "Concentrated Uniswap v4 liquidity, fees streamed.", icon: "water-outline", path: "/flow", tint: [...T.blue] },
  { key: "pay", name: "ArcPay", text: "Gift cards and top-ups with USDC, 100+ countries.", icon: "cart-outline", path: "/pay", tint: [...T.coral] },
  { key: "cash", name: "ArcCash", text: "Private transfers with a zero-knowledge proof.", icon: "eye-off-outline", path: "/cash", tint: [...T.violet] },
  { key: "lend", name: "ArcLend", text: "Lend USDC, borrow against tokens.", icon: "trending-up-outline", tab: "/lend", tint: [...T.aqua] },
  { key: "p2p", name: "ArcP2P", text: "Sell any token for USDC, zero slippage.", icon: "swap-horizontal-outline", tab: "/p2p", tint: [...T.gold] },
  { key: "docs", name: "Docs", text: "How every tool works, in EN · 中文 · ID.", icon: "book-outline", path: "/docs", tint: [...T.blue] },
];

export default function Tools() {
  const router = useRouter();
  return (
    <Screen>
      <Brand subtitle="TOOLS" />
      <View style={{ marginTop: 22 }}><H1>Every tool, one wallet</H1><P small style={{ marginTop: 6 }}>Tools open inside the app and sign with this wallet. No browser extension, no WalletConnect.</P></View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
        {TOOLS.map((t) => (
          <Pressable key={t.key} onPress={() => (t.tab ? router.push(t.tab as never) : router.push({ pathname: "/dapp", params: { path: t.path!, title: t.name } }))} style={({ pressed }) => ({ width: "48%", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.lineStrong, borderRadius: radius.lg, padding: 16, minHeight: 136, opacity: pressed ? 0.8 : 1 })}>
            <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: t.tint[0], alignItems: "center", justifyContent: "center" }}><Ionicons name={t.icon} size={21} color={t.tint[1]} /></View>
            <Text style={{ fontFamily: fonts.display, fontSize: 17, color: colors.text, marginTop: 12 }}>{t.name}</Text>
            <Text style={{ fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.dim, marginTop: 4 }}>{t.text}</Text>
          </Pressable>
        ))}
      </View>
      <Notice>Lending and P2P run natively in the app. The other tools load usearckit.online inside the app with your wallet already connected; every transaction still asks for your confirmation.</Notice>
    </Screen>
  );
}
