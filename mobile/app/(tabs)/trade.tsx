import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { formatUnits, isAddress, parseEther, type Address, type Hex } from "viem";
import { KNOWN_TOKENS, publicClient } from "@/chain";
import { erc20Abi } from "@/contracts";
import { useWallet } from "@/wallet/provider";
import { friendlyError } from "@/wallet/useTx";
import { customTokens, saveCustomTokens } from "@/wallet/store";
import { useBalances, fetchTokenMeta } from "@/hooks/useBalances";
import { useTokenImages } from "@/hooks/useTokenImages";
import { executeQuote, fetchQuote, NATIVE, useTokenSearch, type ExecProgress, type Quote, type TradeToken } from "@/hooks/useTrade";
import { Brand, TokenLogo } from "@/components/TokenLogo";
import { Button, Card, H1, Ledger, Notice, P, Pill, Row, Screen, Seg } from "@/components/ui";
import { fmtCompact, fmtUsd, safeParse, shortAddr } from "@/lib/format";
import { explorerTx } from "@/chain";
import { colors, fonts, radius } from "@/theme";
import { Linking } from "react-native";

type Side = "buy" | "sell";
const DEFAULT: TradeToken = { ...KNOWN_TOKENS[0], verified: true };

export default function Trade() {
  const params = useLocalSearchParams<{ token?: string; side?: string }>();
  const { address, walletClient } = useWallet();
  const qc = useQueryClient();
  const bal = useBalances(address);
  const [side, setSide] = useState<Side>(params.side === "sell" ? "sell" : "buy");
  const [token, setToken] = useState<TradeToken>(DEFAULT);
  const [picking, setPicking] = useState(false);
  const [amt, setAmt] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteErr, setQuoteErr] = useState("");
  const [quoting, setQuoting] = useState(false);
  const [progress, setProgress] = useState<ExecProgress | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string; hash?: Hex } | null>(null);
  const images = useTokenImages([token.address]);

  // open with a token from elsewhere in the app (e.g. tapping an asset)
  useEffect(() => {
    if (!params.token || !isAddress(params.token)) return;
    const known = KNOWN_TOKENS.find((k) => k.address.toLowerCase() === params.token!.toLowerCase());
    if (known) setToken({ ...known, verified: true });
    else void fetchTokenMeta(params.token as Address).then((m) => m && setToken({ address: params.token as Address, ...m }));
  }, [params.token]);

  const meta = useQuery({ queryKey: ["meta", token.address], queryFn: () => fetchTokenMeta(token.address), staleTime: Infinity });
  const decimals = token.decimals ?? meta.data?.decimals ?? 18;
  const tokenBal = useQuery({ queryKey: ["tokbal", token.address, address], enabled: !!address, refetchInterval: 15_000, queryFn: async () => (await publicClient.readContract({ address: token.address, abi: erc20Abi, functionName: "balanceOf", args: [address!] })) as bigint });
  const usdc = bal.data?.native ?? 0n;
  const held = tokenBal.data ?? 0n;
  const amount = safeParse(amt, side === "buy" ? 18 : decimals);
  const insufficient = !!amount && (side === "buy" ? amount + parseEther("0.01") > usdc : amount > held);

  // debounce quotes while typing
  useEffect(() => {
    setQuote(null); setQuoteErr(""); setResult(null);
    if (!address || !amount || insufficient) return;
    let live = true;
    setQuoting(true);
    const t = setTimeout(() => {
      fetchQuote(address, side === "buy" ? NATIVE : token.address, side === "buy" ? token.address : NATIVE, amount)
        .then((q) => live && setQuote(q)).catch((e) => live && setQuoteErr(e instanceof Error ? e.message : String(e))).finally(() => live && setQuoting(false));
    }, 550);
    return () => { live = false; clearTimeout(t); setQuoting(false); };
  }, [address, amount, side, token.address, insufficient]);

  const execute = async () => {
    if (!walletClient || !address || !amount) { setResult({ ok: false, text: "Your wallet key is still loading. Try again in a few seconds." }); return; }
    setResult(null);
    try {
      // quotes are short-lived; refresh anything older than 20 seconds before signing
      const q = quote && Date.now() - quote.fetchedAt < 20_000 ? quote : await fetchQuote(address, side === "buy" ? NATIVE : token.address, side === "buy" ? token.address : NATIVE, amount);
      const hash = await executeQuote(walletClient, q, setProgress);
      const after = (await publicClient.readContract({ address: token.address, abi: erc20Abi, functionName: "balanceOf", args: [address] })) as bigint;
      // keep the home asset list in step: add what was bought, drop what was fully sold
      const list = await customTokens();
      const isKnown = KNOWN_TOKENS.some((k) => k.address.toLowerCase() === token.address.toLowerCase());
      if (side === "buy" && !isKnown && !list.some((t) => t.address.toLowerCase() === token.address.toLowerCase())) {
        const m = meta.data ?? (await fetchTokenMeta(token.address));
        if (m) await saveCustomTokens([...list, { address: token.address, ...m }]);
      }
      if (side === "sell" && after === 0n) await saveCustomTokens(list.filter((t) => t.address.toLowerCase() !== token.address.toLowerCase()));
      setResult({ ok: true, hash, text: side === "buy" ? `Bought ${q.amountOut ? Number(q.amountOut).toLocaleString("en-US", { maximumFractionDigits: 4 }) : ""} ${token.symbol}. It is now in your wallet.` : `Sold for ${q.amountOut ? Number(q.amountOut).toLocaleString("en-US", { maximumFractionDigits: 4 }) : ""} USDC.` });
      setAmt(""); setQuote(null);
      void qc.invalidateQueries();
    } catch (e) {
      setResult({ ok: false, text: friendlyError(e) });
    } finally {
      setProgress(null);
    }
  };

  const impact = quote?.impactPct;
  const impactTone = impact === undefined ? colors.dim : impact <= -10 ? colors.coral : impact <= -3 ? colors.gold : colors.aqua;
  const busy = !!progress;
  const pct = (p: number) => setAmt(formatUnits((held * BigInt(p)) / 100n, decimals));

  return (
    <Screen>
      <Brand subtitle="TRADE" />
      <View style={{ marginTop: 22 }}><H1>Buy and sell Arc tokens</H1><P small style={{ marginTop: 6 }}>Swap USDC for any token on Arc, and back. Best route found by Relay, signed by your wallet.</P></View>
      <Seg value={side} options={[["buy", "Buy"], ["sell", "Sell"]]} onChange={(v) => { setSide(v); setAmt(""); }} />

      <Card>
        {/* token selector */}
        <Pressable onPress={() => setPicking(true)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: pressed ? colors.navy600 : colors.input })}>
          <Row>
            <TokenLogo symbol={token.symbol} uri={token.image ?? images[token.address.toLowerCase()]} size={38} />
            <View><Row style={{ gap: 6 }}><Text style={{ fontFamily: fonts.display, fontSize: 18, color: colors.text }}>{token.symbol}</Text>{token.verified ? <Ionicons name="checkmark-circle" size={15} color={colors.aqua} /> : null}</Row><Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.faint }}>{shortAddr(token.address)} · you hold {fmtCompact(held, decimals)}</Text></View>
          </Row>
          <Row style={{ gap: 4 }}><Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.accent }}>Change</Text><Ionicons name="chevron-down" size={16} color={colors.accent} /></Row>
        </Pressable>

        {/* amount */}
        <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.dim, marginTop: 16, marginBottom: 8 }}>{side === "buy" ? "You pay" : "You sell"}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: insufficient ? colors.coral : colors.lineStrong, borderRadius: radius.md, backgroundColor: colors.input, paddingRight: 12 }}>
          <TextInput value={amt} onChangeText={setAmt} placeholder="0.00" placeholderTextColor={colors.faint} keyboardType="decimal-pad" style={{ flex: 1, paddingHorizontal: 14, paddingVertical: 14, fontFamily: fonts.mono, fontSize: 22, color: colors.text }} />
          <TokenLogo symbol={side === "buy" ? "USDC" : token.symbol} uri={side === "buy" ? undefined : token.image ?? images[token.address.toLowerCase()]} size={24} />
          <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text, marginLeft: 6 }}>{side === "buy" ? "USDC" : token.symbol}</Text>
        </View>
        <Row between style={{ marginTop: 8 }}>
          <Text style={{ fontFamily: fonts.body, fontSize: 12, color: insufficient ? colors.coral : colors.faint }}>{insufficient ? "Not enough balance (keep a little USDC for gas)." : `Balance: ${side === "buy" ? `${fmtUsd(usdc)} USDC` : `${fmtCompact(held, decimals)} ${token.symbol}`}`}</Text>
          {side === "buy"
            ? <Row style={{ gap: 6 }}>{["1", "5", "10"].map((v) => <Pill key={v} tone="dim" onPress={() => setAmt(v)}>{v}</Pill>)}</Row>
            : <Row style={{ gap: 6 }}>{[25, 50, 100].map((p) => <Pill key={p} tone="dim" onPress={() => pct(p)}>{p === 100 ? "Max" : `${p}%`}</Pill>)}</Row>}
        </Row>

        {/* quote */}
        {quoting ? <Row style={{ marginTop: 16 }}><ActivityIndicator color={colors.accent} /><P small>Finding the best price…</P></Row> : null}
        {quoteErr ? <Notice tone="gold">{quoteErr}</Notice> : null}
        {quote ? (
          <>
            <View style={{ marginTop: 16, padding: 14, borderRadius: radius.md, backgroundColor: colors.aquaSoft, borderWidth: 1, borderColor: "rgba(95,227,201,0.35)" }}>
              <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.dim }}>You receive about</Text>
              <Row style={{ marginTop: 4 }}><TokenLogo symbol={side === "buy" ? token.symbol : "USDC"} uri={side === "buy" ? token.image ?? images[token.address.toLowerCase()] : undefined} size={26} /><Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: fonts.display, fontSize: 24, color: colors.text }}>{Number(quote.amountOut).toLocaleString("en-US", { maximumFractionDigits: side === "buy" ? 2 : 4 })} {side === "buy" ? token.symbol : "USDC"}</Text></Row>
            </View>
            <Ledger rows={[
              ["Price impact", <Text key="i" style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: impactTone }}>{impact !== undefined ? `${impact.toFixed(2)}%` : "—"}</Text>],
              ["Route", `Relay · ${quote.steps.map((s) => (s.id === "approve" ? "approve" : "swap")).join(" → ")}`],
              ["Fees", quote.feeUsd !== undefined ? `≈ $${quote.feeUsd.toFixed(3)} incl. gas` : "network gas only"],
            ]} />
            {impact !== undefined && impact <= -10 ? <Notice tone="coral">High price impact: this trade moves the pool by more than 10%. Consider a smaller amount, or list it on ArcP2P for zero slippage.</Notice> : null}
          </>
        ) : null}

        <Button title={busy ? `${progress!.step}… (${progress!.index + 1}/${progress!.total})` : side === "buy" ? `Buy ${token.symbol}` : `Sell ${token.symbol}`} disabled={!quote || busy || insufficient} loading={busy} onPress={() => void execute()} />
        {result ? (
          <Notice tone={result.ok ? "aqua" : "coral"}>
            <Text style={{ fontFamily: fonts.body, fontSize: 13, color: result.ok ? colors.aqua : colors.coral }}>{result.text} </Text>
            {result.hash ? <Text onPress={() => Linking.openURL(explorerTx(result.hash!))} style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.aqua, textDecorationLine: "underline" }}>View on Etherscan</Text> : null}
          </Notice>
        ) : null}
      </Card>
      <P small style={{ marginTop: 12 }}>Swaps go through the token's on-chain pools, so large orders move the price. For size, list on ArcP2P instead.</P>

      <TokenPicker visible={picking} onClose={() => setPicking(false)} onPick={(t) => { setToken(t); setPicking(false); setAmt(""); }} />
    </Screen>
  );
}

function TokenPicker({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (t: TradeToken) => void }) {
  const [q, setQ] = useState("");
  const search = useTokenSearch(isAddress(q) ? "" : q);
  const mine = useQuery({ queryKey: ["custom-tokens"], queryFn: customTokens, enabled: visible });
  const pasted = useQuery({ queryKey: ["meta", q], enabled: isAddress(q), queryFn: () => fetchTokenMeta(q as Address) });
  const defaults: TradeToken[] = useMemo(() => [...KNOWN_TOKENS.map((t) => ({ ...t, verified: true })), ...(mine.data ?? []).filter((t) => !KNOWN_TOKENS.some((k) => k.address.toLowerCase() === t.address.toLowerCase()))], [mine.data]);
  const list: TradeToken[] = isAddress(q) ? (pasted.data ? [{ address: q as Address, ...pasted.data }] : []) : q.trim().length >= 2 ? search.data ?? [] : defaults;
  const images = useTokenImages(list.map((t) => t.address));
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)" }} onPress={onClose} />
      <View style={{ maxHeight: "82%", backgroundColor: colors.navy800, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderTopWidth: 1, borderColor: colors.lineStrong, paddingTop: 18, paddingHorizontal: 18, paddingBottom: 30 }}>
        <Row between><Text style={{ fontFamily: fonts.display, fontSize: 20, color: colors.text }}>Choose a token</Text><Pressable onPress={onClose} hitSlop={10}><Ionicons name="close" size={22} color={colors.dim} /></Pressable></Row>
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 14, borderWidth: 1, borderColor: colors.lineStrong, borderRadius: radius.md, backgroundColor: colors.input, paddingHorizontal: 12 }}>
          <Ionicons name="search" size={16} color={colors.faint} />
          <TextInput value={q} onChangeText={setQ} placeholder="Name, symbol or 0x address" placeholderTextColor={colors.faint} autoCapitalize="none" autoCorrect={false} style={{ flex: 1, paddingHorizontal: 10, paddingVertical: 12, fontFamily: fonts.body, fontSize: 15, color: colors.text }} />
        </View>
        <ScrollView style={{ marginTop: 10 }} keyboardShouldPersistTaps="handled">
          {(search.isFetching || pasted.isFetching) && <Row style={{ padding: 12 }}><ActivityIndicator color={colors.accent} /><P small>Searching Arc…</P></Row>}
          {!search.isFetching && q.trim().length >= 2 && list.length === 0 && <P small style={{ padding: 12 }}>No Arc token found. Paste its contract address instead.</P>}
          {list.map((t) => (
            <Pressable key={t.address} onPress={() => onPick({ ...t, image: t.image ?? images[t.address.toLowerCase()] })} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, paddingHorizontal: 6, borderRadius: radius.md, backgroundColor: pressed ? colors.navy600 : "transparent" })}>
              <TokenLogo symbol={t.symbol} uri={t.image ?? images[t.address.toLowerCase()]} size={36} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Row style={{ gap: 6 }}><Text numberOfLines={1} style={{ fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text }}>{t.symbol}</Text>{t.verified ? <Ionicons name="checkmark-circle" size={14} color={colors.aqua} /> : null}</Row>
                <Text numberOfLines={1} style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.faint }}>{t.name} · {shortAddr(t.address)}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                {t.priceUsd !== undefined ? <Text style={{ fontFamily: fonts.mono, fontSize: 12, color: colors.text }}>${t.priceUsd < 0.01 ? t.priceUsd.toPrecision(3) : t.priceUsd.toFixed(4)}</Text> : null}
                {t.liquidityUsd !== undefined ? <Text style={{ fontFamily: fonts.body, fontSize: 11, color: t.liquidityUsd < 10_000 ? colors.gold : colors.faint }}>liq ${t.liquidityUsd >= 1000 ? `${Math.round(t.liquidityUsd / 1000)}K` : Math.round(t.liquidityUsd)}</Text> : null}
              </View>
            </Pressable>
          ))}
        </ScrollView>
        {q.trim().length >= 2 && !isAddress(q) ? <P small style={{ marginTop: 8 }}>Anyone can launch a token with any name. Check the address, and prefer the one with real liquidity.</P> : null}
      </View>
    </Modal>
  );
}
