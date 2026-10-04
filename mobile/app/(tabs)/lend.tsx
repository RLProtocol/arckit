import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { parseEther } from "viem";
import { useWallet } from "@/wallet/provider";
import { useTx } from "@/wallet/useTx";
import { ADDR } from "@/chain";
import { arcLendAbi, erc20Abi } from "@/contracts";
import { useMarkets, usePosition, type Market } from "@/hooks/useArcKit";
import { useBalances } from "@/hooks/useBalances";
import { Button, Card, Eyebrow, Field, H1, H2, Ledger, Notice, P, Pill, Row, Screen, Seg, Skeleton } from "@/components/ui";
import { Brand, TokenLogo } from "@/components/TokenLogo";
import { useTokenImages } from "@/hooks/useTokenImages";
import { TxStatus } from "@/components/TxStatus";
import { fmtBps, fmtPrice, fmtTok, fmtUsd, safeParse } from "@/lib/format";
import { colors, fonts, radius } from "@/theme";

const BPS = 10_000n;
const value = (amount: bigint, price: bigint, dec: number) => (amount * price) / 10n ** BigInt(dec);

export default function Lend() {
  const markets = useMarkets();
  const [sel, setSel] = useState<number | undefined>();
  const m = markets.data?.find((x) => x.id === sel);
  const supplied = (markets.data ?? []).reduce((a, x) => a + x.cash + x.totalBorrows - x.reserves, 0n);
  const images = useTokenImages((markets.data ?? []).map((x) => x.token));
  return (
    <Screen>
      <Brand subtitle="ARCLEND" />
      <View style={{ marginTop: 22 }}><H1>Lend USDC. Borrow against tokens.</H1><P small style={{ marginTop: 6 }}>Isolated markets, one per token, priced by a 30-minute on-chain average. {markets.data ? `${fmtUsd(supplied, 0)} USDC supplied.` : ""}</P></View>
      {!m && (
        <Card tight>
          <Row style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 }}><Text style={[styles.head, { flex: 1.4 }]}>Market</Text><Text style={styles.head}>Supply APY</Text><Text style={styles.head}>Borrow APR</Text></Row>
          {markets.isLoading && [0, 1, 2].map((i) => <View key={i} style={{ padding: 14 }}><Skeleton /></View>)}
          {markets.data?.map((x) => (
            <Pressable key={x.id} onPress={() => setSel(x.id)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", padding: 12, borderRadius: radius.md, backgroundColor: pressed ? colors.navy600 : "transparent" })}>
              <Row style={{ flex: 1.4 }}><TokenLogo symbol={x.symbol} uri={images[x.token.toLowerCase()]} size={32} /><View><Text style={{ fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text }}>{x.symbol}</Text><Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.faint }}>${fmtPrice(x.price)}</Text></View></Row>
              <Text style={{ flex: 1, fontFamily: fonts.mono, fontSize: 14, color: colors.aqua }}>{fmtBps(x.supplyAprBps)}</Text>
              <Text style={{ flex: 1, fontFamily: fonts.mono, fontSize: 14, color: colors.text }}>{fmtBps(x.borrowAprBps)}</Text>
            </Pressable>
          ))}
        </Card>
      )}
      {m && <MarketPanel m={m} uri={images[m.token.toLowerCase()]} onBack={() => setSel(undefined)} />}
    </Screen>
  );
}

function MarketPanel({ m, uri, onBack }: { m: Market; uri?: string; onBack: () => void }) {
  const { address, walletClient } = useWallet();
  const pos = usePosition(m, address);
  const bal = useBalances(address);
  const [side, setSide] = useState<"lend" | "borrow">("lend");
  const [mode, setMode] = useState<"supply" | "withdraw" | "deposit" | "borrow" | "repay" | "withdrawCol">("supply");
  const [amt, setAmt] = useState("");
  const tx = useTx();
  const p = pos.data;
  const usdc = bal.data?.native ?? 0n;
  const isToken = mode === "deposit" || mode === "withdrawCol";
  const units = safeParse(amt, isToken ? m.decimals : 18);
  const colValue = p ? value(p.collateral, m.price, m.decimals) : 0n;
  const limit = (colValue * BigInt(m.ltvBps)) / BPS;
  const capacity = p ? (limit > p.debt ? limit - p.debt : 0n) : 0n;
  const cap = capacity < m.available ? capacity : m.available;
  const needsApproval = mode === "deposit" && !!units && (p?.allowance ?? 0n) < units;
  const liqPrice = p && p.collateral > 0n && p.debt > 0n ? (p.debt * 10n ** BigInt(m.decimals) * BPS) / (p.collateral * BigInt(m.liqThresholdBps)) : 0n;

  const err = !units || !p ? "" :
    mode === "supply" ? (units > usdc ? "More than your USDC balance." : m.supplyCap > 0n && m.cash + m.totalBorrows - m.reserves + units > m.supplyCap ? `This market's cap leaves room for ${fmtUsd(m.supplyCap - (m.cash + m.totalBorrows - m.reserves))} USDC.` : "") :
    mode === "withdraw" ? (units > p.supplied ? "More than you have supplied." : units > m.available ? `Only ${fmtUsd(m.available)} USDC is idle right now.` : "") :
    mode === "deposit" ? (units > p.tokenBalance ? `More than your ${m.symbol} balance.` : "") :
    mode === "borrow" ? (m.borrowsPaused ? "Borrows are paused." : units > cap ? `You can borrow up to ${fmtUsd(cap)} USDC.` : "") :
    mode === "repay" ? (units > usdc ? "More than your USDC balance." : "") :
    (units > p.collateral ? "More than your collateral." : p.debt > 0n && (value(p.collateral - units, m.price, m.decimals) * BigInt(m.ltvBps)) / BPS < p.debt ? "That would put your loan over the limit. Repay first." : "");

  const submit = () => void tx.send(async () => {
    const wc = walletClient!; const id = BigInt(m.id); const base = { account: wc.account!, chain: wc.chain, address: ADDR.lend, abi: arcLendAbi } as const;
    if (mode === "supply") return wc.writeContract({ ...base, functionName: "supply", args: [id], value: units! });
    if (mode === "withdraw") { const shares = p!.supplied === 0n ? 0n : units! >= p!.supplied ? p!.supplyShares : (units! * p!.supplyShares + p!.supplied - 1n) / p!.supplied; return wc.writeContract({ ...base, functionName: "withdraw", args: [id, shares] }); }
    if (mode === "deposit") { if (needsApproval) return wc.writeContract({ account: wc.account!, chain: wc.chain, address: m.token, abi: erc20Abi, functionName: "approve", args: [ADDR.lend, units!] }); return wc.writeContract({ ...base, functionName: "depositCollateral", args: [id, units!] }); }
    if (mode === "withdrawCol") return wc.writeContract({ ...base, functionName: "withdrawCollateral", args: [id, units!] });
    if (mode === "borrow") return wc.writeContract({ ...base, functionName: "borrow", args: [id, units!] });
    const val = units! >= p!.debt ? p!.debt + p!.debt / 10_000n + 1n : units!;
    return wc.writeContract({ ...base, functionName: "repay", args: [id, address!], value: val });
  });

  const labels: Record<typeof mode, string> = { supply: "USDC to supply", withdraw: "USDC to withdraw", deposit: `${m.symbol} to deposit`, borrow: "USDC to borrow", repay: "USDC to repay", withdrawCol: `${m.symbol} to withdraw` };
  const maxFor = () => mode === "supply" ? fmtRaw(usdc > parseEther("0.02") ? usdc - parseEther("0.02") : 0n, 18) : mode === "withdraw" ? fmtRaw((p?.supplied ?? 0n) < m.available ? p?.supplied ?? 0n : m.available, 18) : mode === "deposit" ? fmtRaw(p?.tokenBalance ?? 0n, m.decimals) : mode === "borrow" ? fmtRaw(cap, 18) : mode === "repay" ? fmtRaw((p?.debt ?? 0n) < usdc ? p?.debt ?? 0n : usdc, 18) : fmtRaw(p?.collateral ?? 0n, m.decimals);

  return (
    <Card>
      <Row between><Row><TokenLogo symbol={m.symbol} uri={uri} /><View><Eyebrow color={colors.accent}>Market #{m.id}</Eyebrow><H2>{m.symbol} / USDC</H2></View></Row><Pressable onPress={onBack}><Text style={{ fontFamily: fonts.bodyMedium, color: colors.dim }}>Back</Text></Pressable></Row>
      <Row style={{ marginTop: 12, flexWrap: "wrap", gap: 6 }}><Pill tone="aqua">Supply {fmtBps(m.supplyAprBps)}</Pill><Pill>Borrow {fmtBps(m.borrowAprBps)}</Pill><Pill tone="dim">LTV {m.ltvBps / 100}%</Pill><Pill tone="dim">${fmtPrice(m.price)}</Pill></Row>
      <Seg value={side} options={[["lend", "Lend USDC"], ["borrow", "Borrow"]]} onChange={(v) => { setSide(v); setMode(v === "lend" ? "supply" : "deposit"); setAmt(""); }} />
      {p && side === "lend" && <Ledger rows={[["Your supply", `${fmtUsd(p.supplied)} USDC`], ["Earning", `${fmtBps(m.supplyAprBps)} APY, every second`], ["Idle in market", `${fmtUsd(m.available)} USDC`]]} />}
      {p && side === "borrow" && <Ledger rows={[["Collateral", `${fmtTok(p.collateral, m.decimals)} ${m.symbol} ≈ ${fmtUsd(colValue)} USDC`], ["Debt", `${fmtUsd(p.debt)} USDC`], ["Can borrow", `${fmtUsd(cap)} USDC more`], ["Health", p.debt === 0n ? "no debt" : `${(Number(p.health) / 1e18).toFixed(2)} · liquidation if ${m.symbol} falls to $${fmtPrice(liqPrice)}`]]} />}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 14 }}>
        {(side === "lend" ? ([["supply", "Supply"], ["withdraw", "Withdraw"]] as const) : ([["deposit", "Deposit collateral"], ["borrow", "Borrow"], ["repay", "Repay"], ["withdrawCol", "Withdraw collateral"]] as const)).map(([k, label]) => <Pill key={k} tone={mode === k ? "accent" : "dim"} onPress={() => { setMode(k); setAmt(""); }}>{label}</Pill>)}
      </View>
      <Field label={labels[mode]} placeholder="0.00" keyboardType="decimal-pad" value={amt} onChangeText={setAmt} error={err || undefined} hint={mode === "supply" || mode === "repay" ? `Wallet: ${fmtUsd(usdc)} USDC` : mode === "deposit" ? `Wallet: ${fmtTok(p?.tokenBalance ?? 0n, m.decimals)} ${m.symbol}` : undefined} right={<Pressable onPress={() => setAmt(maxFor())} style={{ paddingHorizontal: 14 }}><Text style={{ fontFamily: fonts.bodyMedium, color: colors.accent }}>Max</Text></Pressable>} />
      {mode === "supply" && units && !err ? <Notice>About {fmtUsd((units * BigInt(m.supplyAprBps)) / BPS)} USDC a year at today's rate.</Notice> : null}
      <Button title={tx.busy ? "Confirming…" : needsApproval ? `Approve ${m.symbol}` : ({ supply: "Supply USDC", withdraw: "Withdraw USDC", deposit: "Deposit collateral", borrow: "Borrow USDC", repay: "Repay USDC", withdrawCol: "Withdraw collateral" } as const)[mode]} disabled={!units || !!err} loading={tx.busy} onPress={submit} />
      <TxStatus tx={tx} done="Done." />
    </Card>
  );
}

const fmtRaw = (v: bigint, dec: number) => (Number(v) / 10 ** dec).toString();
const styles = { head: { flex: 1, fontFamily: fonts.mono, fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase" as const, color: colors.faint } };
