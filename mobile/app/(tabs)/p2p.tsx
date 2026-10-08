import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/i18n/Text";
import { isAddress, zeroAddress, type Address, type Hex } from "viem";
import { useWallet } from "@/wallet/provider";
import { useTx } from "@/wallet/useTx";
import { ADDR, publicClient } from "@/chain";
import { arcP2PAbi, erc20Abi } from "@/contracts";
import { useListings, usePoolsFor, type Listing } from "@/hooks/useArcKit";
import { fetchTokenMeta, useBalances } from "@/hooks/useBalances";
import { Button, Card, Eyebrow, Field, H1, H2, Ledger, Notice, P, Pill, Row, Screen, Seg, Skeleton } from "@/components/ui";
import { Brand, TokenLogo } from "@/components/TokenLogo";
import { useTokenImages } from "@/hooks/useTokenImages";
import { TxStatus } from "@/components/TxStatus";
import { costOf, fmtPct, fmtPrice, fmtTok, fmtUsd, safeParse, shortAddr } from "@/lib/format";
import { colors, fonts, radius } from "@/theme";
import { useQuery } from "@tanstack/react-query";

const spreadText = (bps: number) => (bps === 0 ? "at market" : bps < 0 ? `${-bps / 100}% below market` : `${bps / 100}% above market`);

export default function P2P() {
  const [tab, setTab] = useState<"buy" | "sell" | "mine">("buy");
  const { address } = useWallet();
  const listings = useListings();
  const [sel, setSel] = useState<number | undefined>();
  const open = useMemo(() => (listings.data ?? []).filter((l) => l.active && (l.buyer === zeroAddress || l.buyer.toLowerCase() === address?.toLowerCase())).sort((a, b) => b.createdAt - a.createdAt), [listings.data, address]);
  const selected = open.find((l) => l.id === sel);
  const mine = useMemo(() => (listings.data ?? []).filter((l) => l.seller.toLowerCase() === address?.toLowerCase()).reverse(), [listings.data, address]);
  const images = useTokenImages((listings.data ?? []).map((l) => l.token));

  return (
    <Screen>
      <Brand subtitle="ARCP2P" />
      <View style={{ marginTop: 22 }}><H1>Trade peer to peer</H1><P small style={{ marginTop: 6 }}>Sell any token for USDC at a fixed or market price. Buy whole listings or a slice. The pool is never touched: zero slippage.</P></View>
      <Seg value={tab} options={[["buy", "Buy"], ["sell", "Sell"], ["mine", "Mine"]]} onChange={(v) => { setTab(v); setSel(undefined); }} />

      {tab === "buy" && !selected && (
        <Card tight>
          {listings.isLoading && [0, 1, 2].map((i) => <View key={i} style={{ padding: 14 }}><Skeleton /></View>)}
          {!listings.isLoading && open.length === 0 && <P small style={{ padding: 14 }}>No open listings right now. Be the first to sell.</P>}
          {open.map((l) => {
            const vs = l.mode === 1 && l.marketRef > 0n ? (Number(l.price) / Number(l.marketRef) - 1) * 100 : undefined;
            return (
              <Pressable key={l.id} onPress={() => setSel(l.id)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 12, borderRadius: radius.md, backgroundColor: pressed ? colors.navy600 : "transparent" })}>
                <Row><TokenLogo symbol={l.symbol} uri={images[l.token.toLowerCase()]} /><View><Text style={{ fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text }}>{l.symbol}</Text><Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.faint }}>{l.mode === 1 ? spreadText(l.spreadBps) : "fixed price"} · {fmtTok(l.remaining, l.decimals, 0)} left</Text></View></Row>
                <View style={{ alignItems: "flex-end" }}><Text style={{ fontFamily: fonts.mono, fontSize: 14, color: colors.text }}>${fmtPrice(l.price)}</Text>{vs !== undefined && <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: vs < 0 ? colors.aqua : colors.faint }}>{fmtPct(vs)} vs market</Text>}</View>
              </Pressable>
            );
          })}
        </Card>
      )}
      {tab === "buy" && selected && <BuyPanel l={selected} uri={images[selected.token.toLowerCase()]} onBack={() => setSel(undefined)} />}
      {tab === "sell" && <SellForm onDone={() => setTab("mine")} />}
      {tab === "mine" && <Mine mine={mine} images={images} />}
    </Screen>
  );
}

function BuyPanel({ l, uri, onBack }: { l: Listing; uri?: string; onBack: () => void }) {
  const { address, walletClient } = useWallet();
  const bal = useBalances(address);
  const [amt, setAmt] = useState("");
  const tx = useTx();
  const units = safeParse(amt, l.decimals);
  const cost = units ? costOf(units, l.price, l.decimals) : 0n;
  const value = l.mode === 1 ? cost + cost / 100n : cost;
  const usdc = bal.data?.native ?? 0n;
  const err = !units ? "" : units > l.remaining ? `Only ${fmtTok(l.remaining, l.decimals)} ${l.symbol} left.` : units !== l.remaining && units < l.minFill ? `Minimum ${fmtTok(l.minFill, l.decimals)} ${l.symbol}.` : value > usdc ? "Not enough USDC in your wallet." : "";
  const vs = l.mode === 1 && l.marketRef > 0n ? (Number(l.price) / Number(l.marketRef) - 1) * 100 : undefined;
  return (
    <Card>
      <Row between><Row><TokenLogo symbol={l.symbol} uri={uri} /><View><Eyebrow color={colors.accent}>Listing #{l.id}</Eyebrow><H2>Buy {l.symbol}</H2></View></Row><Pressable onPress={onBack}><Text style={{ fontFamily: fonts.bodyMedium, color: colors.dim }}>Back</Text></Pressable></Row>
      <Ledger rows={[["Price", `$${fmtPrice(l.price)} per ${l.symbol}${vs !== undefined ? ` · ${fmtPct(vs)} vs market` : ""}`], ["Pricing", l.mode === 1 ? `${spreadText(l.spreadBps)}${l.floorPrice > 0n ? ` · floor $${fmtPrice(l.floorPrice)}` : ""}${l.dumpProtection ? " · dump protection" : ""}` : "fixed by the seller"], ["Available", `${fmtTok(l.remaining, l.decimals)} ${l.symbol} ≈ ${fmtUsd(costOf(l.remaining, l.price, l.decimals))} USDC`], ["Seller", shortAddr(l.seller, 6)]]} />
      <Field label={`${l.symbol} to buy`} placeholder="0.00" keyboardType="decimal-pad" value={amt} onChangeText={setAmt} error={err || undefined} hint={`Wallet: ${fmtUsd(usdc)} USDC`} right={<Pressable onPress={() => setAmt((Number(l.remaining) / 10 ** l.decimals).toString())} style={{ paddingHorizontal: 14 }}><Text style={{ fontFamily: fonts.bodyMedium, color: colors.accent }}>Max</Text></Pressable>} />
      {units && !err ? <Notice>You receive {fmtTok(units, l.decimals)} {l.symbol} for {fmtUsd(cost, 4)} USDC.{l.mode === 1 ? " Up to 1% extra is sent for price movement and refunded in the same transaction." : ""}</Notice> : null}
      <Button title={tx.busy ? "Confirming…" : `Buy ${l.symbol}`} disabled={!units || !!err} loading={tx.busy} onPress={() => void tx.send(() => walletClient!.writeContract({ account: walletClient!.account!, chain: walletClient!.chain, address: ADDR.p2p, abi: arcP2PAbi, functionName: "fill", args: [BigInt(l.id), units!], value }))} />
      <TxStatus tx={tx} done={`Bought. ${l.symbol} is in your wallet.`} />
    </Card>
  );
}

const SPREADS: [number, string][] = [[-1000, "−10%"], [-500, "−5%"], [-200, "−2%"], [0, "Market"], [200, "+2%"], [500, "+5%"]];

function SellForm({ onDone }: { onDone: () => void }) {
  const { address, walletClient } = useWallet();
  const [token, setToken] = useState("");
  const [amt, setAmt] = useState("");
  const [mode, setMode] = useState<"market" | "fixed">("market");
  const [spread, setSpread] = useState(0);
  const [fixed, setFixed] = useState("");
  const [floor, setFloor] = useState("");
  const [protect, setProtect] = useState(false);
  const tx = useTx();
  const valid = isAddress(token);
  const meta = useQuery({ queryKey: ["meta", token], enabled: valid, queryFn: () => fetchTokenMeta(token as Address) });
  const dec = meta.data?.decimals ?? 18;
  const pools = usePoolsFor(valid && meta.data ? (token as Address) : undefined, dec);
  const pool = pools.data?.[0];
  const bal = useQuery({ queryKey: ["tokbal", token, address], enabled: valid && !!address, queryFn: async () => { const [b, a] = await publicClient.multicall({ contracts: [{ address: token as Address, abi: erc20Abi, functionName: "balanceOf", args: [address!] }, { address: token as Address, abi: erc20Abi, functionName: "allowance", args: [address!, ADDR.p2p] }], allowFailure: false }); return { balance: b as bigint, allowance: a as bigint }; } });
  const units = safeParse(amt, dec);
  const fixedWei = safeParse(fixed, 18);
  const floorWei = floor.trim() ? safeParse(floor, 18) : 0n;
  const marketNow = pool?.price ?? 0n;
  const effective = mode === "fixed" ? (fixedWei ?? 0n) : (() => { let p = (marketNow * BigInt(10_000 + spread)) / 10_000n; if (floorWei && p < floorWei) p = floorWei; return p; })();
  const needsApproval = !!units && (bal.data?.allowance ?? 0n) < units;
  const err = !valid ? (token ? "Not a valid address." : "") : meta.data === null ? "No ERC-20 at that address." : !units ? "" : bal.data && units > bal.data.balance ? `You hold ${fmtTok(bal.data.balance, dec)} ${meta.data?.symbol}.` : mode === "fixed" && !fixedWei ? "Set a price in USDC." : mode === "market" && !pool ? (pools.isLoading ? "" : "No USDC pool found. Use a fixed price.") : floor.trim() && floorWei === undefined ? "Floor must be a positive price." : "";
  const sym = meta.data?.symbol ?? "token";

  const submit = () => void tx.send(async () => {
    const wc = walletClient!;
    if (needsApproval) return wc.writeContract({ account: wc.account!, chain: wc.chain, address: token as Address, abi: erc20Abi, functionName: "approve", args: [ADDR.p2p, units!] });
    const pricing = { mode: mode === "fixed" ? 0 : 1, fixedPrice: mode === "fixed" ? fixedWei! : 0n, spreadBps: mode === "market" ? spread : 0, floorPrice: mode === "market" ? (floorWei ?? 0n) : 0n, dumpProtection: mode === "market" && protect };
    const poolArg = mode === "market" && pool ? { poolId: pool.poolId, usdcIs0: pool.usdcIs0, poolUsdcDecimals: pool.poolUsdcDecimals } : { poolId: ("0x" + "0".repeat(64)) as Hex, usdcIs0: false, poolUsdcDecimals: 6 };
    return wc.writeContract({ account: wc.account!, chain: wc.chain, address: ADDR.p2p, abi: arcP2PAbi, functionName: "list", args: [token as Address, units!, pricing, poolArg, { minFill: 0n, expiry: 0, buyer: zeroAddress }] });
  });

  return (
    <Card>
      <Eyebrow color={colors.accent}>Sell</Eyebrow><H2>Create a listing</H2>
      <Field label="Token address" placeholder="0x…" value={token} onChangeText={(v) => setToken(v.trim())} hint={meta.data ? `${meta.data.name} (${meta.data.symbol})${bal.data ? ` · you hold ${fmtTok(bal.data.balance, dec)}` : ""}` : "Any ERC-20 on Arc."} />
      <Field label="Amount to sell" placeholder="0.00" keyboardType="decimal-pad" value={amt} onChangeText={setAmt} right={bal.data ? <Pressable onPress={() => setAmt((Number(bal.data!.balance) / 10 ** dec).toString())} style={{ paddingHorizontal: 14 }}><Text style={{ fontFamily: fonts.bodyMedium, color: colors.accent }}>Max</Text></Pressable> : undefined} />
      <Seg value={mode} options={[["market", "Market ± %"], ["fixed", "Fixed price"]]} onChange={setMode} />
      {mode === "fixed" ? (
        <Field label={`Price per ${sym} in USDC`} placeholder="0.00" keyboardType="decimal-pad" value={fixed} onChangeText={setFixed} hint={marketNow > 0n && fixedWei ? `Market is $${fmtPrice(marketNow)}: yours is ${fmtPct((Number(fixedWei) / Number(marketNow) - 1) * 100)} vs market.` : undefined} />
      ) : (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 14 }}>{SPREADS.map(([bps, label]) => <Pill key={bps} tone={spread === bps ? "accent" : "dim"} onPress={() => setSpread(bps)}>{label}</Pill>)}</View>
          <P small style={{ marginTop: 10 }}>{pool ? `Market now $${fmtPrice(marketNow)} → you sell at $${fmtPrice(effective)}. Read live from the pool on every fill.` : pools.isLoading ? "Finding the token's USDC pool…" : valid && meta.data ? "No USDC pool found for this token." : "Enter a token to see its market price."}</P>
          <Field label="Floor price in USDC (optional)" placeholder="never sell below…" keyboardType="decimal-pad" value={floor} onChangeText={setFloor} hint={spread < 0 && !floor.trim() ? "Recommended for a discounted listing on a thin pool." : undefined} />
          <Pressable onPress={() => setProtect(!protect)} style={{ flexDirection: "row", gap: 10, marginTop: 14, alignItems: "flex-start" }}><View style={{ width: 20, height: 20, borderRadius: 6, borderWidth: 1, borderColor: protect ? colors.aqua : colors.lineStrong, backgroundColor: protect ? colors.aquaSoft : "transparent", alignItems: "center", justifyContent: "center" }}>{protect && <Text style={{ color: colors.aqua, fontSize: 13 }}>✓</Text>}</View><P small style={{ flex: 1 }}><Text style={{ color: colors.text, fontFamily: fonts.bodyMedium }}>Dump protection.</Text> Price off the higher of live spot and the 30-minute average. Off means pure live price, like the chart.</P></Pressable>
        </>
      )}
      {err ? <Notice tone="coral">{err}</Notice> : units && meta.data && effective > 0n ? <Notice>Listing {fmtTok(units, dec)} {sym} at ${fmtPrice(effective)} ≈ {fmtUsd(costOf(units, effective, dec))} USDC if it all sells. You keep 99.5% of every fill.</Notice> : null}
      <Button title={tx.busy ? "Confirming…" : needsApproval ? `Approve ${sym}` : "List for sale"} disabled={!units || !!err || !meta.data} loading={tx.busy} onPress={submit} />
      <TxStatus tx={tx} done={needsApproval ? "Approved. Now list." : "Listed. Buyers can see it now."} />
      {tx.status === "success" && !needsApproval ? <Button kind="ghost" title="See my listings" onPress={onDone} /> : null}
    </Card>
  );
}

function Mine({ mine, images }: { mine: Listing[]; images: Record<string, string> }) {
  const { walletClient } = useWallet();
  const tx = useTx();
  if (mine.length === 0) return <Card><P small>You have no listings yet.</P></Card>;
  return (
    <>
      {mine.map((l) => {
        const total = l.remaining + l.sold;
        const status = l.remaining === 0n ? (l.sold > 0n ? "sold out" : "cancelled") : l.expiry > 0 && l.expiry * 1000 < Date.now() ? "expired" : "open";
        return (
          <Card key={l.id}>
            <Row between><Row><TokenLogo symbol={l.symbol} uri={images[l.token.toLowerCase()]} size={30} /><Text style={{ fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text }}>{l.symbol} <Text style={{ color: colors.faint, fontFamily: fonts.mono, fontSize: 12 }}>#{l.id}</Text></Text></Row><Pill tone={status === "open" ? "aqua" : "dim"}>{status}</Pill></Row>
            <Ledger rows={[["Price", `$${fmtPrice(l.price)} · ${l.mode === 1 ? spreadText(l.spreadBps) : "fixed"}`], ["Remaining", `${fmtTok(l.remaining, l.decimals)} ${l.symbol}`], ["Sold", `${fmtTok(l.sold, l.decimals)} (${total === 0n ? 0 : Number((l.sold * 1000n) / total) / 10}%) · received ${fmtUsd(l.proceeds)} USDC`]]} />
            {l.remaining > 0n && <Button kind="ghost" title="Cancel and withdraw tokens" loading={tx.busy} onPress={() => void tx.send(() => walletClient!.writeContract({ account: walletClient!.account!, chain: walletClient!.chain, address: ADDR.p2p, abi: arcP2PAbi, functionName: "cancel", args: [BigInt(l.id)] }))} />}
          </Card>
        );
      })}
      <TxStatus tx={tx} done="Done." />
    </>
  );
}
