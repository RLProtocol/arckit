import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { formatEther, hexToString, isHex, toHex, type Address, type Hex } from "viem";
import { arc, publicClient, SITE } from "@/chain";
import { useWallet } from "@/wallet/provider";
import { injectedProvider } from "@/dapp/injected";
import { Button, Ledger, Mono, P } from "@/components/ui";
import { fmtUsd, shortAddr } from "@/lib/format";
import { colors, fonts, radius } from "@/theme";

type Req = { id: number; method: string; params: unknown[] };
type Ask = { req: Req; kind: "tx" | "sign"; summary: [string, string][]; resolve: (ok: boolean) => void };

/**
 * In-app dApp browser. Loads an Arc Kit page with the wallet injected as window.ethereum; reads go straight to
 * the RPC, signatures and transactions pause on a confirmation sheet before the key touches anything.
 */
export default function DApp() {
  const { path = "/", title = "Arc Kit" } = useLocalSearchParams<{ path?: string; title?: string }>();
  const router = useRouter();
  const { address, walletClient } = useWallet();
  const web = useRef<WebView>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [loading, setLoading] = useState(true);
  const chainHex = toHex(arc.id);

  const reply = useCallback((id: number, result?: unknown, error?: { code: number; message: string }) => {
    web.current?.injectJavaScript(`window.__arckitResolve(${JSON.stringify({ id, result, error })}); true;`);
  }, []);

  const confirm = (req: Req, kind: Ask["kind"], summary: [string, string][]) => new Promise<boolean>((resolve) => setAsk({ req, kind, summary, resolve }));

  const onMessage = useCallback(async (e: WebViewMessageEvent) => {
    let msg: { type?: string } & Req;
    try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (msg.type !== "arckit:request" || !walletClient || !address) return;
    const { id, method, params } = msg;
    try {
      switch (method) {
        case "eth_sendTransaction": {
          const t = (params[0] ?? {}) as { to?: Address; value?: Hex; data?: Hex; gas?: Hex };
          const value = t.value ? BigInt(t.value) : 0n;
          const ok = await confirm(msg, "tx", [["To", shortAddr(t.to, 6)], ["Value", `${fmtUsd(value, 6)} USDC`], ["Data", t.data && t.data !== "0x" ? `${(t.data.length - 2) / 2} bytes · ${t.data.slice(0, 10)}` : "none"]]);
          if (!ok) return reply(id, undefined, { code: 4001, message: "User rejected the request." });
          const hash = await walletClient.sendTransaction({ account: walletClient.account!, chain: arc, to: t.to, value, data: t.data, gas: t.gas ? BigInt(t.gas) : undefined });
          return reply(id, hash);
        }
        case "personal_sign": {
          const raw = params[0] as Hex; const text = isHex(raw) ? safeUtf8(raw) : String(raw);
          const ok = await confirm(msg, "sign", [["Message", text.slice(0, 300)]]);
          if (!ok) return reply(id, undefined, { code: 4001, message: "User rejected the request." });
          return reply(id, await walletClient.signMessage({ account: walletClient.account!, message: isHex(raw) ? { raw } : raw }));
        }
        case "eth_signTypedData_v4": {
          const data = typeof params[1] === "string" ? JSON.parse(params[1] as string) : params[1];
          const ok = await confirm(msg, "sign", [["Typed data", `${data?.domain?.name ?? "unknown"} · ${data?.primaryType ?? ""}`]]);
          if (!ok) return reply(id, undefined, { code: 4001, message: "User rejected the request." });
          return reply(id, await walletClient.signTypedData({ account: walletClient.account!, ...data }));
        }
        case "eth_sign": return reply(id, undefined, { code: 4200, message: "eth_sign is disabled for safety." });
        default: {
          // read-only JSON-RPC straight to Arc
          const result = await publicClient.request({ method: method as never, params: params as never });
          return reply(id, result);
        }
      }
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      return reply(id, undefined, { code: -32000, message: m.slice(0, 200) });
    }
  }, [walletClient, address, reply]);

  if (Platform.OS === "web") return <SafeAreaView style={{ flex: 1, backgroundColor: colors.navy900, padding: 20 }}><P>The in-app browser is only available in the iOS and Android builds.</P><Button title="Back" onPress={() => router.back()} /></SafeAreaView>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.navy900 }}>
      <SafeAreaView edges={["top"]} style={{ backgroundColor: colors.navy800 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line }}>
          <Pressable onPress={() => router.back()} hitSlop={10}><Ionicons name="chevron-down" size={24} color={colors.text} /></Pressable>
          <View style={{ flex: 1 }}><Text style={{ fontFamily: fonts.display, fontSize: 16, color: colors.text }}>{title}</Text><Mono size={11} style={{ color: colors.faint }}>usearckit.online{path} · {shortAddr(address)}</Mono></View>
          {loading ? <ActivityIndicator color={colors.accent} /> : <Pressable onPress={() => web.current?.reload()} hitSlop={10}><Ionicons name="refresh" size={20} color={colors.dim} /></Pressable>}
        </View>
      </SafeAreaView>
      <WebView
        ref={web}
        source={{ uri: `${SITE}${path}` }}
        injectedJavaScriptBeforeContentLoaded={injectedProvider(address ?? "", chainHex)}
        onMessage={(e) => void onMessage(e)}
        onLoadEnd={() => setLoading(false)}
        originWhitelist={["https://*"]}
        allowsBackForwardNavigationGestures
        setSupportMultipleWindows={false}
        style={{ backgroundColor: colors.navy900 }}
      />
      <Modal visible={!!ask} transparent animationType="slide" onRequestClose={() => ask?.resolve(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }} onPress={() => { ask?.resolve(false); setAsk(null); }} />
        <View style={{ backgroundColor: colors.navy800, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 22, paddingBottom: 40, borderTopWidth: 1, borderColor: colors.lineStrong }}>
          <Text style={{ fontFamily: fonts.mono, fontSize: 11, letterSpacing: 2, color: colors.aqua, textTransform: "uppercase" }}>{ask?.kind === "tx" ? "Confirm transaction" : "Sign message"}</Text>
          <Text style={{ fontFamily: fonts.display, fontSize: 22, color: colors.text, marginTop: 6 }}>{title} asks your wallet to {ask?.kind === "tx" ? "send a transaction" : "sign"}</Text>
          {ask && <Ledger rows={[...ask.summary, ["From", shortAddr(address, 6)], ["Network", `Arc · gas in USDC${ask.kind === "tx" ? ", usually under a cent" : ""}`]]} />}
          <Button title={ask?.kind === "tx" ? "Confirm and send" : "Sign"} onPress={() => { ask?.resolve(true); setAsk(null); }} />
          <Button title="Reject" kind="ghost" onPress={() => { ask?.resolve(false); setAsk(null); }} />
        </View>
      </Modal>
    </View>
  );
}

function safeUtf8(hex: Hex) { try { return hexToString(hex); } catch { return hex; } }
void formatEther;
