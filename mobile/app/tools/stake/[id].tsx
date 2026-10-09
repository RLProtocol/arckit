import { useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Text } from "@/i18n/Text";
import { useWallet } from "@/wallet/provider";
import { useTx } from "@/wallet/useTx";
import { ADDR, publicClient } from "@/chain";
import { erc20Abi } from "@/contracts";
import { arcStakingAbi, fmtApr, perDay, statusOf, usePool, type StakePool } from "@/tools/staking";
import { Button, Card, Eyebrow, Field, H2, Ledger, Notice, P, Pill, Row, Screen, Seg, Skeleton } from "@/components/ui";
import { TokenLogo } from "@/components/TokenLogo";
import { TxStatus } from "@/components/TxStatus";
import { Stat } from "@/components/launch";
import { BackHeader, DAY, DaysPicker, fmtDate, fmtSpan, MaxButton, nowSec, Progress, unitsToInput, useTokenInfo } from "@/components/tools";
import { useTokenImages } from "@/hooks/useTokenImages";
import { fmtCompact, fmtTok, safeParse, shortAddr } from "@/lib/format";
import { colors, fonts, radius } from "@/theme";

type Pos = StakePool & { staked: bigint; earned: bigint };

export default function PoolDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const pid = id && /^\d+$/.test(id) ? BigInt(id) : undefined;
  const { address } = useWallet();
  const q = usePool(pid, address);
  const p = q.data as Pos | null | undefined;
  const images = useTokenImages(p ? [p.cfg.stakeToken, p.cfg.rewardToken] : []);

  if (q.isLoading) return <Screen><BackHeader title="Staking" /><Card>{[0, 1, 2].map((i) => <View key={i} style={{ paddingVertical: 10 }}><Skeleton /></View>)}</Card></Screen>;
  if (!p) return <Screen><BackHeader title="Staking" /><Notice tone="coral">{q.error ? String((q.error as Error).message) : `Pool #${id} does not exist.`}</Notice></Screen>;

  const now = nowSec();
  const st = statusOf(p, now);
  const pct = p.finish > p.start ? ((now - p.start) / (p.finish - p.start)) * 100 : 100;
  const isCreator = !!address && p.creator.toLowerCase() === address.toLowerCase();

  return (
    <Screen>
      <BackHeader title="Staking" share={`https://www.usearckit.online/stake/${id}`} />
      <Row style={{ marginTop: 20, gap: 14 }}>
        <View>
          <TokenLogo symbol={p.stake.symbol} uri={images[p.cfg.stakeToken.toLowerCase()]} size={52} />
          {!p.same ? <View style={{ position: "absolute", right: -8, bottom: -6 }}><TokenLogo symbol={p.reward.symbol} uri={images[p.cfg.rewardToken.toLowerCase()]} size={26} /></View> : null}
        </View>
        <View style={{ flex: 1 }}>
          <Eyebrow color={colors.accent}>{`Pool #${p.id}`}</Eyebrow>
          <Text style={{ fontFamily: fonts.display, fontSize: 24, color: colors.text, marginTop: 2 }} numberOfLines={1} adjustsFontSizeToFit>{p.cfg.name || `${p.stake.symbol} pool`}</Text>
          <Text style={{ fontFamily: fonts.mono, fontSize: 12, color: colors.aqua }}>{`stake ${p.stake.symbol} · earn ${p.reward.symbol}`}</Text>
        </View>
        <Pill tone={st === "live" ? "aqua" : st === "upcoming" ? "accent" : "dim"}>{st}</Pill>
      </Row>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 18 }}>
        <Stat label={p.same ? "APR now" : "Paid per day"} value={p.same ? fmtApr(p.aprBps) : fmtCompact(perDay(p), p.reward.decimals)} sub={p.same ? "changes as people join" : p.reward.symbol} tone={colors.aqua} />
        <Stat label="Total staked" value={fmtCompact(p.totalStaked, p.stake.decimals)} sub={`${p.stakers} stakers`} />
        <Stat label="Rewards left" value={fmtCompact(p.remaining, p.reward.decimals)} sub={p.reward.symbol} />
        <Stat label={st === "upcoming" ? "Starts in" : "Time left"} value={st === "ended" ? "Ended" : fmtSpan(st === "upcoming" ? p.start - now : p.finish - now)} sub={fmtDate(st === "upcoming" ? p.start : p.finish)} />
      </View>

      <Card>
        <Progress pct={pct} tone={st === "ended" ? colors.faint : colors.accent} />
        <Row between style={{ marginTop: 6 }}>
          <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.faint }}>{fmtDate(p.start)}</Text>
          <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.faint }}>{fmtDate(p.finish)}</Text>
        </Row>
        <Ledger rows={[
          ["Early exit", p.cfg.penaltyBps ? `${p.cfg.penaltyBps / 100}% before the end` : "No penalty"],
          ...(p.cfg.minStake > 0n ? [["Minimum", `${fmtTok(p.cfg.minStake, p.stake.decimals)} ${p.stake.symbol}`] as [string, string]] : []),
          ...(p.cfg.maxStakePerWallet > 0n ? [["Per wallet", `up to ${fmtTok(p.cfg.maxStakePerWallet, p.stake.decimals)}`] as [string, string]] : []),
          ...(p.cfg.maxTotalStaked > 0n ? [["Pool cap", `${fmtTok(p.cfg.maxTotalStaked, p.stake.decimals)} ${p.stake.symbol}`] as [string, string]] : []),
          ["Creator", isCreator ? "This wallet" : shortAddr(p.creator, 6)],
        ]} />
      </Card>

      <Position p={p} />
      {isCreator ? <CreatorTools p={p} /> : null}
    </Screen>
  );
}

function Position({ p }: { p: Pos }) {
  const { address, walletClient } = useWallet();
  const [mode, setMode] = useState<"stake" | "unstake">("stake");
  const [amt, setAmt] = useState("");
  const tx = useTx();
  const info = useTokenInfo(p.cfg.stakeToken, address, ADDR.staking);
  const units = safeParse(amt, p.stake.decimals);
  const now = nowSec();
  const st = statusOf(p, now);
  const penalty = useQuery({
    queryKey: ["stake-penalty", p.id.toString(), units?.toString()],
    enabled: mode === "unstake" && !!units && p.cfg.penaltyBps > 0,
    queryFn: () => publicClient.readContract({ address: ADDR.staking, abi: arcStakingAbi, functionName: "penaltyFor", args: [p.id, units!] }),
  });
  const bal = info.data?.balance ?? 0n;
  const needsApproval = mode === "stake" && !!units && (info.data?.allowance ?? 0n) < units;
  const err = !units ? "" : mode === "stake"
    ? units > bal ? `You hold ${fmtTok(bal, p.stake.decimals)} ${p.stake.symbol}.` : st !== "live" ? (st === "upcoming" ? "This pool has not started yet." : "This pool is not taking new stakes.") : p.cfg.minStake > 0n && p.staked + units < p.cfg.minStake ? `Minimum ${fmtTok(p.cfg.minStake, p.stake.decimals)} ${p.stake.symbol}.` : ""
    : units > p.staked ? "That is more than you have staked." : "";
  const call = (functionName: "stake" | "unstake" | "claim" | "compound" | "exit") => {
    const wc = walletClient!;
    return functionName === "stake" || functionName === "unstake"
      ? wc.writeContract({ account: wc.account!, chain: wc.chain, address: ADDR.staking, abi: arcStakingAbi, functionName, args: [p.id, units!] })
      : wc.writeContract({ account: wc.account!, chain: wc.chain, address: ADDR.staking, abi: arcStakingAbi, functionName, args: [p.id] });
  };

  return (
    <Card>
      <H2>Your position</H2>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
        <View style={{ flex: 1, padding: 14, borderRadius: radius.md, backgroundColor: "rgba(5,13,26,0.45)", borderWidth: 1, borderColor: colors.line }}>
          <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.faint }}>Staked</Text>
          <Text style={{ fontFamily: fonts.display, fontSize: 20, color: colors.text, marginTop: 2 }} numberOfLines={1} adjustsFontSizeToFit>{fmtCompact(p.staked, p.stake.decimals)}</Text>
          <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.faint }}>{p.stake.symbol}</Text>
        </View>
        <View style={{ flex: 1, padding: 14, borderRadius: radius.md, backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: "rgba(242,196,100,0.35)" }}>
          <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.gold }}>Earned</Text>
          <Text style={{ fontFamily: fonts.display, fontSize: 20, color: colors.text, marginTop: 2 }} numberOfLines={1} adjustsFontSizeToFit>{fmtCompact(p.earned, p.reward.decimals)}</Text>
          <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.faint }}>{p.reward.symbol}</Text>
        </View>
      </View>
      {p.earned > 0n ? (
        <Row style={{ marginTop: 4 }}>
          <Button kind="soft" title="Claim" style={{ flex: 1 }} loading={tx.busy} onPress={() => void tx.send(() => call("claim"))} />
          {p.same && st === "live" ? <Button kind="soft" title="Compound" style={{ flex: 1 }} loading={tx.busy} onPress={() => void tx.send(() => call("compound"))} /> : null}
        </Row>
      ) : null}
      <Seg value={mode} options={[["stake", "Stake"], ["unstake", "Unstake"]]} onChange={(m) => { setMode(m); setAmt(""); }} />
      <Field label={`${p.stake.symbol} to ${mode}`} placeholder="0" keyboardType="decimal-pad" value={amt} onChangeText={setAmt} error={err || undefined}
        right={<MaxButton onPress={() => setAmt(unitsToInput(mode === "stake" ? bal : p.staked, p.stake.decimals))} />}
        hint={mode === "stake" ? `You hold ${fmtTok(bal, p.stake.decimals, 2)}` : `Staked: ${fmtTok(p.staked, p.stake.decimals, 2)}`} />
      {mode === "unstake" && penalty.data ? <Notice tone="gold">{`Leaving early costs ${fmtTok(penalty.data, p.stake.decimals)} ${p.stake.symbol}. You receive ${fmtTok(units! - penalty.data, p.stake.decimals)}.`}</Notice> : null}
      <Button title={tx.busy ? "Confirming…" : needsApproval ? `Approve ${p.stake.symbol}` : mode === "stake" ? "Stake" : "Unstake"} disabled={!units || !!err} loading={tx.busy}
        onPress={() => void tx.send(() => needsApproval ? walletClient!.writeContract({ account: walletClient!.account!, chain: walletClient!.chain, address: p.cfg.stakeToken, abi: erc20Abi, functionName: "approve", args: [ADDR.staking, units!] }) : call(mode))} />
      {p.staked > 0n ? <Button kind="ghost" title="Exit: unstake everything and claim" loading={tx.busy} onPress={() => void tx.send(() => call("exit"))} /> : null}
      <TxStatus tx={tx} done={needsApproval ? "Approved. Now stake." : "Done."} />
    </Card>
  );
}

function CreatorTools({ p }: { p: Pos }) {
  const { address, walletClient } = useWallet();
  const tx = useTx();
  const now = nowSec();
  const ended = now >= p.finish;
  const [mode, setMode] = useState<"add" | "extend">("add");
  const [amt, setAmt] = useState("");
  const [days, setDays] = useState<number | null>(30);
  const info = useTokenInfo(p.cfg.rewardToken, address, ADDR.staking);
  const units = amt.trim() ? safeParse(amt, p.reward.decimals) : 0n;
  const needsApproval = !!units && (info.data?.allowance ?? 0n) < units;
  const err = units === undefined ? "Enter an amount." : units && units > (info.data?.balance ?? 0n) ? `You hold ${fmtTok(info.data?.balance ?? 0n, p.reward.decimals)} ${p.reward.symbol}.` : "";
  const wc = walletClient;
  const approve = () => wc!.writeContract({ account: wc!.account!, chain: wc!.chain, address: p.cfg.rewardToken, abi: erc20Abi, functionName: "approve", args: [ADDR.staking, units!] });
  return (
    <Card>
      <H2>Creator tools</H2>
      <P small style={{ marginTop: 4 }}>Only you see these: top up rewards, run the pool longer, or take back what was never paid out.</P>
      {ended ? (
        <>
          <Notice>The pool has ended. Rewards nobody earned can go back to you.</Notice>
          <Button title={tx.busy ? "Confirming…" : "Reclaim unpaid rewards"} loading={tx.busy} onPress={() => void tx.send(() => wc!.writeContract({ account: wc!.account!, chain: wc!.chain, address: ADDR.staking, abi: arcStakingAbi, functionName: "reclaimUndistributed", args: [p.id] }))} />
        </>
      ) : null}
      <Seg value={mode} options={ended ? [["extend", "Restart"]] : [["add", "Add rewards"], ["extend", "Extend"]]} onChange={setMode} />
      {mode === "extend" || ended ? <DaysPicker label="Add time" presets={[[7, "+7 days"], [30, "+30 days"], [90, "+90 days"]]} value={days} onChange={setDays} /> : null}
      <Field label={mode === "add" && !ended ? `${p.reward.symbol} to add` : `${p.reward.symbol} to add (optional)`} placeholder="0" keyboardType="decimal-pad" value={amt} onChangeText={setAmt} error={err || undefined} hint={`You hold ${fmtTok(info.data?.balance ?? 0n, p.reward.decimals, 2)}`} />
      <Button
        title={tx.busy ? "Confirming…" : needsApproval ? `Approve ${p.reward.symbol}` : mode === "add" && !ended ? "Add rewards" : "Extend pool"}
        disabled={!!err || (mode === "add" && !ended ? !units : !days)} loading={tx.busy}
        onPress={() => void tx.send(() => needsApproval ? approve() : mode === "add" && !ended
          ? wc!.writeContract({ account: wc!.account!, chain: wc!.chain, address: ADDR.staking, abi: arcStakingAbi, functionName: "addRewards", args: [p.id, units!] })
          : wc!.writeContract({ account: wc!.account!, chain: wc!.chain, address: ADDR.staking, abi: arcStakingAbi, functionName: "extendPool", args: [p.id, BigInt(Math.round(days! * DAY)), units ?? 0n] }))} />
      <TxStatus tx={tx} done={needsApproval ? "Approved. Now confirm." : "Pool updated."} />
    </Card>
  );
}
