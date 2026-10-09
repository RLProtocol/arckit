import { useState } from "react";
import { Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { isAddress, parseEventLogs, type Address } from "viem";
import { Text } from "@/i18n/Text";
import { useWallet } from "@/wallet/provider";
import { useTx } from "@/wallet/useTx";
import { ADDR } from "@/chain";
import { erc20Abi } from "@/contracts";
import { tokenLockerAbi } from "@/tools/abis";
import { useLockFee, useMyLocks } from "@/tools/hooks";
import { Button, Card, Field, H1, Ledger, Notice, P, Screen, Seg, Skeleton } from "@/components/ui";
import { TokenLogo } from "@/components/TokenLogo";
import { TxStatus } from "@/components/TxStatus";
import { BackHeader, DAY, DaysPicker, Empty, fmtDate, fmtSpan, ListRow, MaxButton, nowSec, TokenField, unitsToInput, useTokenInfo } from "@/components/tools";
import { useTokenImages } from "@/hooks/useTokenImages";
import { fmtCompact, fmtTok, fmtUsd, safeParse, shortAddr } from "@/lib/format";
import { colors, fonts } from "@/theme";

const PRESETS: [number, string][] = [[30, "30 days"], [90, "90 days"], [180, "6 months"], [365, "1 year"], [730, "2 years"]];

export default function Locks() {
  const params = useLocalSearchParams<{ token?: string }>();
  const [tab, setTab] = useState<"new" | "mine">("new");
  return (
    <Screen>
      <BackHeader title="ArcLock" />
      <View style={{ marginTop: 18 }}>
        <H1>Lock tokens</H1>
        <P small style={{ marginTop: 6 }}>Lock any token or LP on Arc until a date you choose. Each lock gets a public certificate anyone can check.</P>
      </View>
      <Seg value={tab} options={[["new", "New lock"], ["mine", "My locks"]]} onChange={setTab} />
      {tab === "new" ? <NewLock initialToken={params.token} /> : <MyLocks onNew={() => setTab("new")} />}
    </Screen>
  );
}

function NewLock({ initialToken }: { initialToken?: string }) {
  const router = useRouter();
  const { address, walletClient } = useWallet();
  const tx = useTx();
  const fee = useLockFee();
  const [token, setToken] = useState(initialToken && isAddress(initialToken) ? initialToken : "");
  const [amt, setAmt] = useState("");
  const [days, setDays] = useState<number | null>(90);
  const [other, setOther] = useState(false);
  const [withdrawer, setWithdrawer] = useState("");
  const info = useTokenInfo(token, address, ADDR.locker);
  const t = info.data;
  const units = t ? safeParse(amt, t.decimals) : undefined;
  const unlock = days !== null ? nowSec() + Math.round(days * DAY) : null;
  const needsApproval = !!units && !!t && t.allowance < units;
  const err = !t || !amt ? "" : !units ? "Enter an amount." : units > t.balance ? `You hold ${fmtTok(t.balance, t.decimals)} ${t.symbol}.` : days === null ? "Choose how long to lock." : unlock! < nowSec() + 3600 ? "Lock for at least an hour." : other && !isAddress(withdrawer) ? "Enter a valid withdrawer address." : "";
  const ready = !!t && !!units && !err && fee.data !== undefined && !!walletClient;
  const created = (() => { try { return tx.receipt ? parseEventLogs({ abi: tokenLockerAbi, logs: tx.receipt.logs, eventName: "LockCreated" })[0]?.args.lockId : undefined; } catch { return undefined; } })();

  const submit = () => void tx.send(() => {
    const wc = walletClient!;
    if (needsApproval) return wc.writeContract({ account: wc.account!, chain: wc.chain, address: t!.address, abi: erc20Abi, functionName: "approve", args: [ADDR.locker, units!] });
    return wc.writeContract({ account: wc.account!, chain: wc.chain, address: ADDR.locker, abi: tokenLockerAbi, functionName: "lock", args: [t!.address, units!, BigInt(unlock!), other ? (withdrawer as Address) : address!], value: fee.data! });
  });

  if (created !== undefined) {
    return (
      <Card style={{ alignItems: "center", paddingVertical: 26 }}>
        <View style={{ width: 64, height: 64, borderRadius: 22, backgroundColor: colors.aquaSoft, alignItems: "center", justifyContent: "center" }}><Ionicons name="lock-closed" size={30} color={colors.aqua} /></View>
        <Text style={{ fontFamily: fonts.display, fontSize: 22, color: colors.text, marginTop: 14 }}>{`Lock #${created} is live`}</Text>
        <P small style={{ textAlign: "center", marginTop: 6 }}>{`${fmtTok(units ?? 0n, t?.decimals ?? 18)} ${t?.symbol ?? ""} locked until ${unlock ? fmtDate(unlock) : ""}.`}</P>
        <Button title="Open certificate" style={{ alignSelf: "stretch" }} onPress={() => router.push({ pathname: "/tools/lock/[id]", params: { id: created.toString() } })} />
        <Button kind="ghost" title="Lock more" style={{ alignSelf: "stretch" }} onPress={() => { tx.reset(); setAmt(""); }} />
      </Card>
    );
  }

  return (
    <Card>
      <TokenField value={token} onChange={setToken} info={t} loading={info.isLoading} label="Token or LP address" hint="Any ERC-20. For LP, paste the pair address." />
      <Field label="Amount" placeholder="0" keyboardType="decimal-pad" value={amt} onChangeText={setAmt} right={t ? <MaxButton onPress={() => setAmt(unitsToInput(t.balance, t.decimals))} /> : undefined}
        hint={t && units && t.totalSupply ? `${(Number((units * 1_000_000n) / t.totalSupply) / 10_000).toLocaleString("en-US", { maximumFractionDigits: 2 })}% of the supply` : undefined} />
      <DaysPicker label="Lock for" presets={PRESETS} value={days} onChange={setDays} />
      <Pressable onPress={() => setOther(!other)} style={{ flexDirection: "row", gap: 10, marginTop: 16, alignItems: "flex-start" }}>
        <View style={{ width: 20, height: 20, borderRadius: 6, borderWidth: 1, borderColor: other ? colors.aqua : colors.lineStrong, backgroundColor: other ? colors.aquaSoft : "transparent", alignItems: "center", justifyContent: "center" }}>{other && <Ionicons name="checkmark" size={14} color={colors.aqua} />}</View>
        <P small style={{ flex: 1 }}><Text style={{ color: colors.text, fontFamily: fonts.bodyMedium }}>Another wallet withdraws.</Text> Off: this wallet takes the tokens out after the unlock date.</P>
      </Pressable>
      {other ? <Field label="Withdrawer" placeholder="0x…" value={withdrawer} onChangeText={(v) => setWithdrawer(v.trim())} /> : null}
      <Ledger rows={[["Unlocks", unlock ? fmtDate(unlock) : "—"], ["Lock fee", fee.data !== undefined ? `${fmtUsd(fee.data)} USDC` : "…"], ["Withdrawer", other ? (isAddress(withdrawer) ? shortAddr(withdrawer, 6) : "—") : "This wallet"]]} />
      {err ? <Notice tone="coral">{err}</Notice> : null}
      <Button title={tx.busy ? "Confirming…" : needsApproval ? `Approve ${t?.symbol ?? ""}` : "Lock tokens"} disabled={!ready} loading={tx.busy} onPress={submit} />
      <TxStatus tx={tx} done={needsApproval ? "Approved. Now lock." : "Locked."} />
    </Card>
  );
}

/** Open any lock by its number, e.g. to check a certificate someone shared. */
function FindLock() {
  const router = useRouter();
  const [n, setN] = useState("");
  const ok = /^\d+$/.test(n.trim()) && n.trim() !== "0";
  return (
    <Field label="Look up a lock" placeholder="Lock number, e.g. 12" keyboardType="number-pad" value={n} onChangeText={setN}
      right={<Pressable disabled={!ok} onPress={() => router.push({ pathname: "/tools/lock/[id]", params: { id: n.trim() } })} style={{ paddingHorizontal: 14, opacity: ok ? 1 : 0.4 }}><Text style={{ fontFamily: fonts.bodyMedium, color: colors.accent }}>Open</Text></Pressable>} />
  );
}

function MyLocks({ onNew }: { onNew: () => void }) {
  return <><MyLockList onNew={onNew} /><FindLock /></>;
}

function MyLockList({ onNew }: { onNew: () => void }) {
  const router = useRouter();
  const { address } = useWallet();
  const q = useMyLocks(address);
  const images = useTokenImages((q.data ?? []).map((l) => l.token));
  if (q.isLoading) return <Card tight>{[0, 1, 2].map((i) => <View key={i} style={{ padding: 14 }}><Skeleton /></View>)}</Card>;
  if (q.error) return <Notice tone="coral">{String((q.error as Error).message)}</Notice>;
  if (!q.data?.length) return <Card><Empty icon="lock-closed-outline" title="No locks yet" text="Locks owned by this wallet show up here."><Button title="Create a lock" style={{ alignSelf: "stretch" }} onPress={onNew} /></Empty></Card>;
  const now = nowSec();
  return (
    <Card tight>
      {q.data.map((l) => {
        const left = Number(l.unlockDate) - now;
        const status = l.amount === 0n ? "withdrawn" : left > 0 ? `unlocks in ${fmtSpan(left)}` : "unlocked";
        return (
          <ListRow key={l.id.toString()} left={<TokenLogo symbol={l.meta.symbol} uri={images[l.token.toLowerCase()]} size={40} />} title={`${l.meta.symbol} · #${l.id}`} sub={fmtDate(Number(l.unlockDate))}
            right={fmtCompact(l.amount, l.meta.decimals)} rightSub={status} rightTone={left > 0 ? colors.faint : l.amount > 0n ? colors.aqua : colors.faint}
            onPress={() => router.push({ pathname: "/tools/lock/[id]", params: { id: l.id.toString() } })} />
        );
      })}
    </Card>
  );
}
