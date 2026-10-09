import { useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { isAddress, parseEventLogs, type Address } from "viem";
import { Text } from "@/i18n/Text";
import { useWallet } from "@/wallet/provider";
import { useTx } from "@/wallet/useTx";
import { ADDR } from "@/chain";
import { erc20Abi } from "@/contracts";
import { vestingAbi } from "@/tools/abis";
import { useMyVestings, useVestingFee, type VestingRow } from "@/tools/hooks";
import { Button, Card, Field, H1, Ledger, Notice, P, Pill, Screen, Seg, Skeleton } from "@/components/ui";
import { TokenLogo } from "@/components/TokenLogo";
import { TxStatus } from "@/components/TxStatus";
import { BackHeader, DAY, DaysPicker, Empty, fmtDate, ListRow, MaxButton, nowSec, TokenField, unitsToInput, useTokenInfo } from "@/components/tools";
import { useTokenImages } from "@/hooks/useTokenImages";
import { fmtCompact, fmtTok, fmtUsd, safeParse } from "@/lib/format";
import { colors, fonts } from "@/theme";

const CLIFFS: [number, string][] = [[0, "No cliff"], [30, "30 days"], [90, "90 days"], [180, "6 months"], [365, "1 year"]];
const LENGTHS: [number, string][] = [[90, "3 months"], [180, "6 months"], [365, "1 year"], [730, "2 years"], [1095, "3 years"]];

export default function Vestings() {
  const params = useLocalSearchParams<{ token?: string }>();
  const [tab, setTab] = useState<"new" | "mine">("new");
  return (
    <Screen>
      <BackHeader title="Vesting" />
      <View style={{ marginTop: 18 }}>
        <H1>Vest tokens</H1>
        <P small style={{ marginTop: 6 }}>Pay a team member, investor or advisor over time: nothing before the cliff, then a steady stream until the end date.</P>
      </View>
      <Seg value={tab} options={[["new", "New schedule"], ["mine", "My vestings"]]} onChange={setTab} />
      {tab === "new" ? <NewVesting initialToken={params.token} /> : <Mine onNew={() => setTab("new")} />}
    </Screen>
  );
}

function NewVesting({ initialToken }: { initialToken?: string }) {
  const router = useRouter();
  const { address, walletClient } = useWallet();
  const tx = useTx();
  const fee = useVestingFee();
  const [token, setToken] = useState(initialToken && isAddress(initialToken) ? initialToken : "");
  const [who, setWho] = useState("");
  const [amt, setAmt] = useState("");
  const [laterDays, setLaterDays] = useState<number | null>(0);
  const [cliff, setCliff] = useState<number | null>(90);
  const [length, setLength] = useState<number | null>(365);
  const info = useTokenInfo(token, address, ADDR.vesting);
  const t = info.data;
  const units = t ? safeParse(amt, t.decimals) : undefined;
  const start = nowSec() + Math.round((laterDays ?? 0) * DAY);
  const cliffAt = cliff !== null ? start + Math.round(cliff * DAY) : null;
  const end = length !== null ? start + Math.round(length * DAY) : null;
  const needsApproval = !!units && !!t && t.allowance < units;
  const err = !t ? "" : who && !isAddress(who) ? "Not a valid beneficiary address." : !amt ? "" : !units ? "Enter an amount." : units > t.balance ? `You hold ${fmtTok(t.balance, t.decimals)} ${t.symbol}.` : cliff === null || length === null || laterDays === null ? "Fill in the start, cliff and length." : cliff > length ? "The cliff cannot be longer than the whole schedule." : "";
  const ready = !!t && !!units && isAddress(who) && !err && cliffAt !== null && end !== null && fee.data !== undefined && !!walletClient;
  const created = (() => { try { return tx.receipt ? parseEventLogs({ abi: vestingAbi, logs: tx.receipt.logs, eventName: "VestingCreated" })[0]?.args.vestingId : undefined; } catch { return undefined; } })();

  const submit = () => void tx.send(() => {
    const wc = walletClient!;
    if (needsApproval) return wc.writeContract({ account: wc.account!, chain: wc.chain, address: t!.address, abi: erc20Abi, functionName: "approve", args: [ADDR.vesting, units!] });
    return wc.writeContract({ account: wc.account!, chain: wc.chain, address: ADDR.vesting, abi: vestingAbi, functionName: "createVesting", args: [t!.address, { beneficiary: who as Address, amount: units!, start: BigInt(start), cliff: BigInt(cliffAt!), end: BigInt(end!) }], value: fee.data! });
  });

  if (created !== undefined) {
    return (
      <Card style={{ alignItems: "center", paddingVertical: 26 }}>
        <View style={{ width: 64, height: 64, borderRadius: 22, backgroundColor: colors.aquaSoft, alignItems: "center", justifyContent: "center" }}><Ionicons name="hourglass" size={28} color={colors.aqua} /></View>
        <Text style={{ fontFamily: fonts.display, fontSize: 22, color: colors.text, marginTop: 14 }}>{`Vesting #${created} created`}</Text>
        <P small style={{ textAlign: "center", marginTop: 6 }}>The beneficiary can claim from the cliff onward, from this app or usearckit.online.</P>
        <Button title="Open schedule" style={{ alignSelf: "stretch" }} onPress={() => router.push({ pathname: "/tools/vest/[id]", params: { id: created.toString() } })} />
        <Button kind="ghost" title="Create another" style={{ alignSelf: "stretch" }} onPress={() => { tx.reset(); setAmt(""); setWho(""); }} />
      </Card>
    );
  }

  return (
    <Card>
      <TokenField value={token} onChange={setToken} info={t} loading={info.isLoading} />
      <Field label="Beneficiary" placeholder="0x…" value={who} onChangeText={(v) => setWho(v.trim())} hint="The wallet that receives the tokens." />
      <Field label="Total amount" placeholder="0" keyboardType="decimal-pad" value={amt} onChangeText={setAmt} right={t ? <MaxButton onPress={() => setAmt(unitsToInput(t.balance, t.decimals))} /> : undefined} />
      <DaysPicker label="Starts" presets={[[0, "Now"], [7, "In 7 days"], [30, "In 30 days"]]} value={laterDays} onChange={setLaterDays} allowZero />
      <DaysPicker label="Cliff" presets={CLIFFS} value={cliff} onChange={setCliff} allowZero />
      <DaysPicker label="Total length" presets={LENGTHS} value={length} onChange={setLength} />
      <Ledger rows={[
        ["Starts", fmtDate(start)],
        ["Cliff ends", cliffAt ? fmtDate(cliffAt) : "—"],
        ["Fully vested", end ? fmtDate(end) : "—"],
        ["Fee", fee.data !== undefined ? `${fmtUsd(fee.data)} USDC` : "…"],
      ]} />
      {err ? <Notice tone="coral">{err}</Notice> : null}
      <Notice>The schedule is fixed once created: it cannot be cancelled or clawed back. The beneficiary can move it to a new wallet.</Notice>
      <Button title={tx.busy ? "Confirming…" : needsApproval ? `Approve ${t?.symbol ?? ""}` : "Create schedule"} disabled={!ready} loading={tx.busy} onPress={submit} />
      <TxStatus tx={tx} done={needsApproval ? "Approved. Now create the schedule." : "Created."} />
    </Card>
  );
}


function Mine({ onNew }: { onNew: () => void }) {
  const { address } = useWallet();
  const q = useMyVestings(address);
  const [side, setSide] = useState<"receiving" | "created">("receiving");
  const list = q.data?.[side] ?? [];
  const images = useTokenImages([...(q.data?.receiving ?? []), ...(q.data?.created ?? [])].map((v) => v.token));
  if (q.isLoading) return <Card tight>{[0, 1, 2].map((i) => <View key={i} style={{ padding: 14 }}><Skeleton /></View>)}</Card>;
  if (q.error) return <Notice tone="coral">{String((q.error as Error).message)}</Notice>;
  return (
    <>
      <View style={{ flexDirection: "row", gap: 6, marginTop: 14 }}>
        <Pill tone={side === "receiving" ? "accent" : "dim"} onPress={() => setSide("receiving")}>{`Paying me · ${q.data?.receiving.length ?? 0}`}</Pill>
        <Pill tone={side === "created" ? "accent" : "dim"} onPress={() => setSide("created")}>{`Created by me · ${q.data?.created.length ?? 0}`}</Pill>
      </View>
      <Card tight>
        {list.length ? list.map((v) => <VestRow key={v.id.toString()} v={v} uri={images[v.token.toLowerCase()]} />) : (
          <Empty icon="hourglass-outline" title={side === "receiving" ? "Nothing vesting to you" : "No schedules yet"} text={side === "receiving" ? "Schedules that pay this wallet show up here." : "Schedules this wallet created show up here."}>
            {side === "created" ? <Button title="Create a schedule" style={{ alignSelf: "stretch" }} onPress={onNew} /> : null}
          </Empty>
        )}
      </Card>
    </>
  );
}

function VestRow({ v, uri }: { v: VestingRow; uri?: string }) {
  const router = useRouter();
  const pct = v.total > 0n ? Number(((v.released + v.claimable) * 1000n) / v.total) / 10 : 0;
  return (
    <ListRow left={<TokenLogo symbol={v.meta.symbol} uri={uri} size={40} />} title={`${v.meta.symbol} · #${v.id}`} sub={`${pct}% vested · ends ${fmtDate(Number(v.end))}`}
      right={fmtCompact(v.total, v.meta.decimals)} rightSub={v.claimable > 0n ? `${fmtCompact(v.claimable, v.meta.decimals)} to claim` : undefined} rightTone={colors.gold}
      onPress={() => router.push({ pathname: "/tools/vest/[id]", params: { id: v.id.toString() } })} />
  );
}

