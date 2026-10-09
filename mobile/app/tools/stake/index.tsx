import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { isAddress, parseEventLogs } from "viem";
import { Text } from "@/i18n/Text";
import { useWallet } from "@/wallet/provider";
import { useTx } from "@/wallet/useTx";
import { ADDR } from "@/chain";
import { erc20Abi } from "@/contracts";
import { arcStakingAbi, fmtApr, perDay, statusOf, useAllPools, useCreateFee, useMyPools, type StakePool } from "@/tools/staking";
import { Button, Card, Field, H1, Ledger, Notice, P, Pill, Screen, Seg, Skeleton } from "@/components/ui";
import { TokenLogo } from "@/components/TokenLogo";
import { TxStatus } from "@/components/TxStatus";
import { BackHeader, DAY, DaysPicker, Empty, fmtDate, fmtSpan, ListRow, MaxButton, nowSec, TokenField, unitsToInput, useTokenInfo } from "@/components/tools";
import { useTokenImages } from "@/hooks/useTokenImages";
import { fmtCompact, fmtTok, fmtUsd, safeParse } from "@/lib/format";
import { colors, fonts } from "@/theme";

export default function Staking() {
  const params = useLocalSearchParams<{ token?: string; tab?: string }>();
  const [tab, setTab] = useState<"pools" | "mine" | "create">(params.tab === "create" ? "create" : "pools");
  return (
    <Screen>
      <BackHeader title="Staking" />
      <View style={{ marginTop: 18 }}>
        <H1>Stake and earn</H1>
        <P small style={{ marginTop: 6 }}>Time-boxed reward pools for any Arc token. Stake to earn, or open a pool for your own community.</P>
      </View>
      <Seg value={tab} options={[["pools", "Pools"], ["mine", "Mine"], ["create", "Create"]]} onChange={setTab} />
      {tab === "pools" ? <Pools /> : tab === "mine" ? <Mine onCreate={() => setTab("create")} /> : <Create initialToken={params.token} onDone={() => setTab("mine")} />}
    </Screen>
  );
}

function PoolRow({ p, uri, extra }: { p: StakePool; uri?: string; extra?: string }) {
  const router = useRouter();
  const now = nowSec();
  const st = statusOf(p, now);
  const time = st === "live" ? `${fmtSpan(p.finish - now)} left` : st === "upcoming" ? `starts in ${fmtSpan(p.start - now)}` : st;
  const yieldText = p.same ? (st === "live" ? `${fmtApr(p.aprBps)} APR` : "—") : `${fmtCompact(perDay(p), p.reward.decimals)} ${p.reward.symbol}/day`;
  return (
    <ListRow left={<TokenLogo symbol={p.stake.symbol} uri={uri} size={40} />} title={p.cfg.name || `${p.stake.symbol} pool`} sub={extra ?? `stake ${p.stake.symbol} · earn ${p.reward.symbol} · ${time}`}
      right={yieldText} rightSub={`${fmtCompact(p.totalStaked, p.stake.decimals)} staked`} rightTone={colors.faint}
      onPress={() => router.push({ pathname: "/tools/stake/[id]", params: { id: p.id.toString() } })} />
  );
}

function Pools() {
  const q = useAllPools();
  const [filter, setFilter] = useState<"live" | "all">("live");
  const now = nowSec();
  const list = useMemo(() => (q.data ?? []).filter((p) => filter === "all" || statusOf(p, now) === "live" || statusOf(p, now) === "upcoming"), [q.data, filter, now]);
  const images = useTokenImages((q.data ?? []).map((p) => p.cfg.stakeToken));
  if (q.isLoading) return <Card tight>{[0, 1, 2, 3].map((i) => <View key={i} style={{ padding: 14 }}><Skeleton /></View>)}</Card>;
  if (q.error) return <Notice tone="coral">{String((q.error as Error).message)}</Notice>;
  return (
    <>
      <View style={{ flexDirection: "row", gap: 6, marginTop: 14 }}>
        <Pill tone={filter === "live" ? "accent" : "dim"} onPress={() => setFilter("live")}>Live</Pill>
        <Pill tone={filter === "all" ? "accent" : "dim"} onPress={() => setFilter("all")}>All</Pill>
      </View>
      <Card tight>
        {list.length ? list.map((p) => <PoolRow key={p.id.toString()} p={p} uri={images[p.cfg.stakeToken.toLowerCase()]} />) : <Empty icon="layers-outline" title="No live pools" text="Open one for your token from the Create tab." />}
      </Card>
    </>
  );
}

function Mine({ onCreate }: { onCreate: () => void }) {
  const { address } = useWallet();
  const q = useMyPools(address);
  const images = useTokenImages((q.data ?? []).map((p) => p.cfg.stakeToken));
  if (q.isLoading) return <Card tight>{[0, 1, 2].map((i) => <View key={i} style={{ padding: 14 }}><Skeleton /></View>)}</Card>;
  if (q.error) return <Notice tone="coral">{String((q.error as Error).message)}</Notice>;
  if (!q.data?.length) return <Card><Empty icon="layers-outline" title="Nothing staked" text="Pools you stake in or created show up here."><Button title="Create a pool" style={{ alignSelf: "stretch" }} onPress={onCreate} /></Empty></Card>;
  return (
    <Card tight>
      {q.data.map((p) => (
        <PoolRow key={p.id.toString()} p={p} uri={images[p.cfg.stakeToken.toLowerCase()]}
          extra={p.staked > 0n || p.earned > 0n ? `staked ${fmtCompact(p.staked, p.stake.decimals)} · earned ${fmtCompact(p.earned, p.reward.decimals)} ${p.reward.symbol}` : p.isCreator ? "you created this pool" : undefined} />
      ))}
    </Card>
  );
}

const DURATIONS: [number, string][] = [[7, "7 days"], [30, "30 days"], [90, "90 days"], [180, "6 months"], [365, "1 year"]];

function Create({ initialToken, onDone }: { initialToken?: string; onDone: () => void }) {
  const router = useRouter();
  const { address, walletClient } = useWallet();
  const tx = useTx();
  const fee = useCreateFee();
  const [stakeToken, setStakeToken] = useState(initialToken && isAddress(initialToken) ? initialToken : "");
  const [same, setSame] = useState(true);
  const [rewardToken, setRewardToken] = useState("");
  const [amt, setAmt] = useState("");
  const [days, setDays] = useState<number | null>(30);
  const [penalty, setPenalty] = useState(0);
  const [laterDays, setLaterDays] = useState<number | null>(0);
  const [more, setMore] = useState(false);
  const [minStake, setMinStake] = useState("");
  const [maxWallet, setMaxWallet] = useState("");
  const [maxTotal, setMaxTotal] = useState("");
  const [name, setName] = useState("");
  const sInfo = useTokenInfo(stakeToken, address, ADDR.staking);
  const rAddr = same ? stakeToken : rewardToken;
  const rInfo = useTokenInfo(rAddr, address, ADDR.staking);
  const s = sInfo.data, r = rInfo.data;
  const units = r ? safeParse(amt, r.decimals) : undefined;
  const limit = (v: string) => (!v.trim() ? 0n : s ? safeParse(v, s.decimals) ?? null : null);
  const [minW, maxW, maxT] = [limit(minStake), limit(maxWallet), limit(maxTotal)];
  const durSec = days !== null ? Math.round(days * DAY) : 0;
  const startAt = laterDays ? nowSec() + Math.round(laterDays * DAY) : 0;
  const needsApproval = !!units && !!r && r.allowance < units;
  const err = !s || !r ? "" : !amt ? "" : !units ? "Enter the reward amount." : units > r.balance ? `You hold ${fmtTok(r.balance, r.decimals)} ${r.symbol}.` : days === null || durSec < 3600 ? "Run the pool for at least an hour." : durSec > 4 * 365 * DAY ? "A pool can run for at most 4 years." : minW === null || maxW === null || maxT === null ? "Check the limit amounts." : minW && maxW && minW > maxW ? "The minimum stake is above the per-wallet maximum." : name.length > 48 ? "Name is at most 48 characters." : "";
  const ready = !!s && !!r && !!units && !err && fee.data !== undefined && !!walletClient;
  const created = (() => { try { return tx.receipt ? parseEventLogs({ abi: arcStakingAbi, logs: tx.receipt.logs, eventName: "PoolCreated" })[0]?.args.poolId : undefined; } catch { return undefined; } })();
  const projected = units && days ? `${fmtCompact(units / BigInt(Math.max(1, Math.round(days))), r!.decimals)} ${r!.symbol} a day` : "—";

  const submit = () => void tx.send(() => {
    const wc = walletClient!;
    if (needsApproval) return wc.writeContract({ account: wc.account!, chain: wc.chain, address: r!.address, abi: erc20Abi, functionName: "approve", args: [ADDR.staking, units!] });
    return wc.writeContract({
      account: wc.account!, chain: wc.chain, address: ADDR.staking, abi: arcStakingAbi, functionName: "createPool", value: fee.data!,
      args: [{ stakeToken: s!.address, rewardToken: r!.address, startTime: BigInt(startAt), duration: BigInt(durSec), penaltyBps: penalty, minStake: minW ?? 0n, maxStakePerWallet: maxW ?? 0n, maxTotalStaked: maxT ?? 0n, name: name.trim() || `${s!.symbol} ${Math.round(days!)} days` }, units!],
    });
  });

  if (created !== undefined) {
    return (
      <Card style={{ alignItems: "center", paddingVertical: 26 }}>
        <View style={{ width: 64, height: 64, borderRadius: 22, backgroundColor: colors.aquaSoft, alignItems: "center", justifyContent: "center" }}><Ionicons name="layers" size={28} color={colors.aqua} /></View>
        <Text style={{ fontFamily: fonts.display, fontSize: 22, color: colors.text, marginTop: 14 }}>{`Pool #${created} is open`}</Text>
        <P small style={{ textAlign: "center", marginTop: 6 }}>{`Share it so holders can stake: usearckit.online/stake/${created}`}</P>
        <Button title="Open pool" style={{ alignSelf: "stretch" }} onPress={() => router.push({ pathname: "/tools/stake/[id]", params: { id: created.toString() } })} />
        <Button kind="ghost" title="See my pools" style={{ alignSelf: "stretch" }} onPress={() => { tx.reset(); onDone(); }} />
      </Card>
    );
  }

  return (
    <Card>
      <TokenField value={stakeToken} onChange={setStakeToken} info={s} loading={sInfo.isLoading} label="Token people stake" />
      <View style={{ flexDirection: "row", gap: 6, marginTop: 14 }}>
        <Pill tone={same ? "accent" : "dim"} onPress={() => setSame(true)}>Rewards in the same token</Pill>
        <Pill tone={!same ? "accent" : "dim"} onPress={() => setSame(false)}>Another token</Pill>
      </View>
      {!same ? <TokenField value={rewardToken} onChange={setRewardToken} info={r} loading={rInfo.isLoading} label="Reward token" /> : null}
      <Field label={`Rewards to deposit${r ? ` (${r.symbol})` : ""}`} placeholder="0" keyboardType="decimal-pad" value={amt} onChangeText={setAmt} right={r ? <MaxButton onPress={() => setAmt(unitsToInput(r.balance, r.decimals))} /> : undefined} hint="Deposited now and paid out evenly over the pool's life." />
      <DaysPicker label="Runs for" presets={DURATIONS} value={days} onChange={setDays} />
      <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.dim, marginTop: 16, marginBottom: 8 }}>Early-exit penalty</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {[0, 500, 1000, 2000].map((b) => <Pill key={b} tone={penalty === b ? "accent" : "dim"} onPress={() => setPenalty(b)}>{b === 0 ? "None" : `${b / 100}%`}</Pill>)}
      </View>
      <P small style={{ marginTop: 6 }}>{penalty ? (same ? `Unstaking before the end costs ${penalty / 100}% of the amount, paid out to the stakers who stay.` : `Unstaking before the end costs ${penalty / 100}% of the amount, sent to you as the creator.`) : "Stakers can leave at any time for free."}</P>
      <Pressable onPress={() => setMore(!more)} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 16 }}>
        <Ionicons name={more ? "chevron-down" : "chevron-forward"} size={16} color={colors.accent} />
        <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.accent }}>More options</Text>
      </Pressable>
      {more ? (
        <>
          <DaysPicker label="Starts" presets={[[0, "Now"], [1, "In 1 day"], [7, "In 7 days"]]} value={laterDays} onChange={setLaterDays} allowZero />
          <Field label="Minimum stake (optional)" placeholder="no minimum" keyboardType="decimal-pad" value={minStake} onChangeText={setMinStake} />
          <Field label="Maximum per wallet (optional)" placeholder="no limit" keyboardType="decimal-pad" value={maxWallet} onChangeText={setMaxWallet} />
          <Field label="Pool cap (optional)" placeholder="no limit" keyboardType="decimal-pad" value={maxTotal} onChangeText={setMaxTotal} />
          <Field label="Name (optional)" placeholder={s ? `${s.symbol} ${days ?? 30} days` : "Pool name"} value={name} onChangeText={setName} autoCapitalize="words" maxLength={48} />
        </>
      ) : null}
      <Ledger rows={[["Pays out", projected], ["Ends", days ? fmtDate((startAt || nowSec()) + durSec) : "—"], ["Creation fee", fee.data !== undefined ? `${fmtUsd(fee.data)} USDC` : "…"]]} />
      {err ? <Notice tone="coral">{err}</Notice> : null}
      <Button title={tx.busy ? "Confirming…" : needsApproval ? `Approve ${r?.symbol ?? ""}` : "Open staking pool"} disabled={!ready} loading={tx.busy} onPress={submit} />
      <TxStatus tx={tx} done={needsApproval ? "Approved. Now open the pool." : "Pool created."} />
    </Card>
  );
}

