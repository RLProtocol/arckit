import { useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { isAddress, type Address } from "viem";
import { Text } from "@/i18n/Text";
import { useWallet } from "@/wallet/provider";
import { useTx } from "@/wallet/useTx";
import { ADDR, explorerAddress } from "@/chain";
import { erc20Abi } from "@/contracts";
import { tokenLockerAbi } from "@/tools/abis";
import { useLock, type LockRow } from "@/tools/hooks";
import { Button, Card, Eyebrow, Field, H2, Ledger, Notice, P, Pill, Row, Screen, Seg, Skeleton } from "@/components/ui";
import { TokenLogo } from "@/components/TokenLogo";
import { TxStatus } from "@/components/TxStatus";
import { BackHeader, DAY, DaysPicker, fmtDate, fmtDateTime, fmtSpan, MaxButton, nowSec, Progress, unitsToInput, useTokenInfo } from "@/components/tools";
import { useTokenImages } from "@/hooks/useTokenImages";
import { fmtTok, safeParse, shortAddr } from "@/lib/format";
import { colors, fonts, radius } from "@/theme";

type Action = "withdraw" | "topup" | "extend" | "split" | "transfer" | "withdrawer";

export default function LockDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const lockId = id && /^\d+$/.test(id) ? BigInt(id) : undefined;
  const { address } = useWallet();
  const q = useLock(lockId);
  const l = q.data;
  const images = useTokenImages(l ? [l.token] : []);
  const share = `https://www.usearckit.online/lock/${id}`;

  if (q.isLoading) return <Screen><BackHeader title="ArcLock" /><Card>{[0, 1, 2].map((i) => <View key={i} style={{ paddingVertical: 10 }}><Skeleton /></View>)}</Card></Screen>;
  if (!l) return <Screen><BackHeader title="ArcLock" /><Notice tone="coral">{q.error ? String((q.error as Error).message) : `Lock #${id} does not exist.`}</Notice></Screen>;

  const now = nowSec();
  const start = Number(l.lockDate), end = Number(l.unlockDate);
  const unlocked = now >= end;
  const pct = end > start ? ((now - start) / (end - start)) * 100 : 100;
  const isOwner = !!address && l.owner.toLowerCase() === address.toLowerCase();
  const isWithdrawer = !!address && l.withdrawer.toLowerCase() === address.toLowerCase();
  const status = l.amount === 0n ? "Withdrawn" : unlocked ? "Unlocked" : "Locked";

  return (
    <Screen>
      <BackHeader title="ArcLock" share={share} />
      {/* the certificate */}
      <View style={{ marginTop: 18, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.accentLine, backgroundColor: colors.card, padding: 20, overflow: "hidden" }}>
        <View style={{ position: "absolute", right: -60, top: -60, width: 200, height: 200, borderRadius: 100, borderWidth: 1.5, borderColor: colors.line }} />
        <Row between>
          <Eyebrow color={colors.accent}>{`Certificate · lock #${l.id}`}</Eyebrow>
          <Pill tone={status === "Locked" ? "accent" : status === "Unlocked" ? "aqua" : "dim"}>{status}</Pill>
        </Row>
        <Row style={{ marginTop: 16, gap: 14 }}>
          <TokenLogo symbol={l.meta.symbol} uri={images[l.token.toLowerCase()]} size={52} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 26, color: colors.text }} numberOfLines={1} adjustsFontSizeToFit>{fmtTok(l.amount, l.meta.decimals, 2)}</Text>
            <Text style={{ fontFamily: fonts.mono, fontSize: 13, color: colors.aqua }}>{`${l.meta.symbol} · ${l.meta.name}`}</Text>
          </View>
        </Row>
        <View style={{ marginTop: 18 }}>
          <Progress pct={pct} tone={unlocked ? colors.aqua : colors.accent} />
          <Row between style={{ marginTop: 6 }}>
            <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.faint }}>{fmtDate(start)}</Text>
            <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: unlocked ? colors.aqua : colors.dim }}>{unlocked ? "unlocked" : `${fmtSpan(end - now)} left`}</Text>
            <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.faint }}>{fmtDate(end)}</Text>
          </Row>
        </View>
        <Ledger rows={[
          ["Unlocks", fmtDateTime(end)],
          ["Owner", isOwner ? "This wallet" : shortAddr(l.owner, 6)],
          ["Withdrawer", isWithdrawer ? "This wallet" : shortAddr(l.withdrawer, 6)],
          ["Token", <Pressable key="t" onPress={() => void Linking.openURL(explorerAddress(l.token))}><Text style={{ fontFamily: fonts.mono, fontSize: 13, color: colors.accent }}>{shortAddr(l.token, 6)}</Text></Pressable>],
        ]} />
      </View>

      {isOwner || isWithdrawer ? <Manage l={l} isOwner={isOwner} isWithdrawer={isWithdrawer} unlocked={unlocked} /> : (
        <Notice>The owner can top up, extend, split and transfer this lock. The withdrawer takes the tokens out after the unlock date.</Notice>
      )}
    </Screen>
  );
}

function Manage({ l, isOwner, isWithdrawer, unlocked }: { l: LockRow; isOwner: boolean; isWithdrawer: boolean; unlocked: boolean }) {
  const all: [Action, string, boolean][] = [
    ["withdraw", "Withdraw", isWithdrawer],
    ["topup", "Top up", isOwner && !unlocked],
    ["extend", "Extend", isOwner],
    ["split", "Split", isOwner && !unlocked],
    ["transfer", "Transfer", isOwner],
    ["withdrawer", "Withdrawer", isWithdrawer],
  ];
  const shown = all.filter(([, , ok]) => ok);
  const [action, setAction] = useState<Action>(shown[0][0]);
  return (
    <Card>
      <H2>Manage</H2>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
        {shown.map(([k, label]) => <Pill key={k} tone={action === k ? "accent" : "dim"} onPress={() => setAction(k)}>{label}</Pill>)}
      </View>
      {action === "withdraw" ? <Withdraw l={l} unlocked={unlocked} /> : null}
      {action === "topup" ? <TopUp l={l} /> : null}
      {action === "extend" ? <Extend l={l} /> : null}
      {action === "split" ? <Split l={l} /> : null}
      {action === "transfer" ? <Transfer l={l} isWithdrawer={isWithdrawer} /> : null}
      {action === "withdrawer" ? <ChangeWithdrawer l={l} /> : null}
    </Card>
  );
}

const write = (wc: NonNullable<ReturnType<typeof useWallet>["walletClient"]>, functionName: "withdraw" | "incrementLock" | "extendLock" | "splitLock", args: readonly [bigint, bigint]) =>
  wc.writeContract({ account: wc.account!, chain: wc.chain, address: ADDR.locker, abi: tokenLockerAbi, functionName, args });

function Withdraw({ l, unlocked }: { l: LockRow; unlocked: boolean }) {
  const { walletClient } = useWallet();
  const tx = useTx();
  const [amt, setAmt] = useState("");
  const units = safeParse(amt, l.meta.decimals);
  const err = units && units > l.amount ? "That is more than the lock holds." : "";
  if (!unlocked) return <Notice>{`Withdrawals open on ${fmtDateTime(Number(l.unlockDate))}.`}</Notice>;
  return (
    <View>
      <Field label={`${l.meta.symbol} to withdraw`} placeholder="0" keyboardType="decimal-pad" value={amt} onChangeText={setAmt} error={err || undefined} right={<MaxButton onPress={() => setAmt(unitsToInput(l.amount, l.meta.decimals))} />} hint={`In lock: ${fmtTok(l.amount, l.meta.decimals)}`} />
      <Button title={tx.busy ? "Confirming…" : "Withdraw"} disabled={!units || !!err} loading={tx.busy} onPress={() => void tx.send(() => write(walletClient!, "withdraw", [l.id, units!]))} />
      <TxStatus tx={tx} done="Withdrawn to the withdrawer wallet." />
    </View>
  );
}

function TopUp({ l }: { l: LockRow }) {
  const { address, walletClient } = useWallet();
  const tx = useTx();
  const [amt, setAmt] = useState("");
  const info = useTokenInfo(l.token, address, ADDR.locker);
  const units = safeParse(amt, l.meta.decimals);
  const bal = info.data?.balance ?? 0n;
  const needsApproval = !!units && (info.data?.allowance ?? 0n) < units;
  const err = units && units > bal ? `You hold ${fmtTok(bal, l.meta.decimals)} ${l.meta.symbol}.` : "";
  return (
    <View>
      <P small style={{ marginTop: 12 }}>Add more tokens to this lock. They unlock on the same date.</P>
      <Field label={`${l.meta.symbol} to add`} placeholder="0" keyboardType="decimal-pad" value={amt} onChangeText={setAmt} error={err || undefined} right={<MaxButton onPress={() => setAmt(unitsToInput(bal, l.meta.decimals))} />} hint={`You hold ${fmtTok(bal, l.meta.decimals)}`} />
      <Button title={tx.busy ? "Confirming…" : needsApproval ? `Approve ${l.meta.symbol}` : "Top up"} disabled={!units || !!err} loading={tx.busy}
        onPress={() => void tx.send(() => needsApproval ? walletClient!.writeContract({ account: walletClient!.account!, chain: walletClient!.chain, address: l.token, abi: erc20Abi, functionName: "approve", args: [ADDR.locker, units!] }) : write(walletClient!, "incrementLock", [l.id, units!]))} />
      <TxStatus tx={tx} done={needsApproval ? "Approved. Now top up." : "Added to the lock."} />
    </View>
  );
}

function Extend({ l }: { l: LockRow }) {
  const { walletClient } = useWallet();
  const tx = useTx();
  const [days, setDays] = useState<number | null>(90);
  const base = Math.max(Number(l.unlockDate), nowSec());
  const next = days !== null ? base + Math.round(days * DAY) : null;
  return (
    <View>
      <DaysPicker label="Add to the unlock date" presets={[[30, "+30 days"], [90, "+90 days"], [180, "+6 months"], [365, "+1 year"]]} value={days} onChange={setDays} />
      <Ledger rows={[["Now", fmtDate(Number(l.unlockDate))], ["New date", next ? fmtDate(next) : "—"]]} />
      <Button title={tx.busy ? "Confirming…" : "Extend lock"} disabled={!next} loading={tx.busy} onPress={() => void tx.send(() => write(walletClient!, "extendLock", [l.id, BigInt(next!)]))} />
      <TxStatus tx={tx} done="Unlock date extended." />
    </View>
  );
}

function Split({ l }: { l: LockRow }) {
  const { walletClient } = useWallet();
  const tx = useTx();
  const [amt, setAmt] = useState("");
  const units = safeParse(amt, l.meta.decimals);
  const err = units && units >= l.amount ? "Split off less than the full lock." : "";
  return (
    <View>
      <P small style={{ marginTop: 12 }}>Move part of this lock into a new lock with the same date and roles, so you can extend or transfer just that part.</P>
      <Field label={`${l.meta.symbol} to split off`} placeholder="0" keyboardType="decimal-pad" value={amt} onChangeText={setAmt} error={err || undefined} hint={`In lock: ${fmtTok(l.amount, l.meta.decimals)}`} />
      <Button title={tx.busy ? "Confirming…" : "Split lock"} disabled={!units || !!err} loading={tx.busy} onPress={() => void tx.send(() => write(walletClient!, "splitLock", [l.id, units!]))} />
      <TxStatus tx={tx} done="Split. The new lock is in My locks." />
    </View>
  );
}

function Transfer({ l, isWithdrawer }: { l: LockRow; isWithdrawer: boolean }) {
  const { walletClient } = useWallet();
  const tx = useTx();
  const [to, setTo] = useState("");
  const [rights, setRights] = useState(true);
  return (
    <View>
      <P small style={{ marginTop: 12 }}>Hand this lock to another wallet. The new owner can top up, extend, split and transfer it.</P>
      <Field label="New owner" placeholder="0x…" value={to} onChangeText={(v) => setTo(v.trim())} error={to && !isAddress(to) ? "Not a valid address." : undefined} />
      {isWithdrawer ? (
        <Pressable onPress={() => setRights(!rights)} style={{ flexDirection: "row", gap: 10, marginTop: 14, alignItems: "flex-start" }}>
          <View style={{ width: 20, height: 20, borderRadius: 6, borderWidth: 1, borderColor: rights ? colors.aqua : colors.lineStrong, backgroundColor: rights ? colors.aquaSoft : "transparent", alignItems: "center", justifyContent: "center" }}>{rights && <Ionicons name="checkmark" size={14} color={colors.aqua} />}</View>
          <P small style={{ flex: 1 }}><Text style={{ color: colors.text, fontFamily: fonts.bodyMedium }}>Also hand over withdrawal.</Text> Off: you keep the right to withdraw after the unlock date.</P>
        </Pressable>
      ) : <Notice>You are not the withdrawer, so withdrawal rights stay where they are.</Notice>}
      <Notice tone="gold">After this you no longer control the lock. Only the new owner can hand it back.</Notice>
      <Button kind="danger" title={tx.busy ? "Confirming…" : "Transfer lock"} disabled={!isAddress(to)} loading={tx.busy}
        onPress={() => void tx.send(() => walletClient!.writeContract({ account: walletClient!.account!, chain: walletClient!.chain, address: ADDR.locker, abi: tokenLockerAbi, functionName: "transferLockOwnership", args: [l.id, to as Address, isWithdrawer && rights] }))} />
      <TxStatus tx={tx} done="Ownership transferred." />
    </View>
  );
}

function ChangeWithdrawer({ l }: { l: LockRow }) {
  const { walletClient } = useWallet();
  const tx = useTx();
  const [to, setTo] = useState("");
  return (
    <View>
      <P small style={{ marginTop: 12 }}>Choose which wallet takes the tokens out after the unlock date.</P>
      <Field label="New withdrawer" placeholder="0x…" value={to} onChangeText={(v) => setTo(v.trim())} error={to && !isAddress(to) ? "Not a valid address." : undefined} />
      <Notice tone="gold">After this you lose withdrawal rights. Only the new withdrawer can hand them back.</Notice>
      <Button kind="danger" title={tx.busy ? "Confirming…" : "Change withdrawer"} disabled={!isAddress(to)} loading={tx.busy}
        onPress={() => void tx.send(() => walletClient!.writeContract({ account: walletClient!.account!, chain: walletClient!.chain, address: ADDR.locker, abi: tokenLockerAbi, functionName: "setWithdrawer", args: [l.id, to as Address] }))} />
      <TxStatus tx={tx} done="Withdrawer updated." />
    </View>
  );
}
