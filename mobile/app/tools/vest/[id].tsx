import { useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { isAddress, type Address } from "viem";
import { Text } from "@/i18n/Text";
import { useWallet } from "@/wallet/provider";
import { useTx } from "@/wallet/useTx";
import { ADDR } from "@/chain";
import { vestingAbi } from "@/tools/abis";
import { useVesting, vestedAt, type VestingRow } from "@/tools/hooks";
import { Button, Card, Eyebrow, Field, H2, Ledger, Notice, P, Pill, Row, Screen, Skeleton } from "@/components/ui";
import { TokenLogo } from "@/components/TokenLogo";
import { TxStatus } from "@/components/TxStatus";
import { Stat } from "@/components/launch";
import { BackHeader, fmtDate, fmtSpan, nowSec } from "@/components/tools";
import { useTokenImages } from "@/hooks/useTokenImages";
import { fmtCompact, fmtTok, shortAddr } from "@/lib/format";
import { colors, fonts, radius } from "@/theme";

export default function VestingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const vid = id && /^\d+$/.test(id) ? BigInt(id) : undefined;
  const { address } = useWallet();
  const q = useVesting(vid);
  const v = q.data;
  const images = useTokenImages(v ? [v.token] : []);

  if (q.isLoading) return <Screen><BackHeader title="Vesting" /><Card>{[0, 1, 2].map((i) => <View key={i} style={{ paddingVertical: 10 }}><Skeleton /></View>)}</Card></Screen>;
  if (!v) return <Screen><BackHeader title="Vesting" /><Notice tone="coral">{q.error ? String((q.error as Error).message) : `Vesting #${id} does not exist.`}</Notice></Screen>;

  const now = nowSec();
  const d = v.meta.decimals;
  const vested = vestedAt(v, now);
  const isBeneficiary = !!address && v.beneficiary.toLowerCase() === address.toLowerCase();
  const isCreator = !!address && v.creator.toLowerCase() === address.toLowerCase();
  const phase = now < Number(v.cliff) ? (now < Number(v.start) ? "not started" : "in cliff") : now >= Number(v.end) ? "fully vested" : "vesting";

  return (
    <Screen>
      <BackHeader title="Vesting" share={`https://www.usearckit.online/vest/${id}`} />
      <Row style={{ marginTop: 20, gap: 14 }}>
        <TokenLogo symbol={v.meta.symbol} uri={images[v.token.toLowerCase()]} size={52} />
        <View style={{ flex: 1 }}>
          <Eyebrow color={colors.accent}>{`Schedule #${v.id}`}</Eyebrow>
          <Text style={{ fontFamily: fonts.display, fontSize: 26, color: colors.text, marginTop: 2 }} numberOfLines={1} adjustsFontSizeToFit>{`${fmtTok(v.total, d, 2)} ${v.meta.symbol}`}</Text>
        </View>
        <Pill tone={phase === "vesting" ? "accent" : phase === "fully vested" ? "aqua" : "dim"}>{phase}</Pill>
      </Row>

      <Card>
        <Curve v={v} now={now} />
        <Ledger rows={[
          ["Starts", fmtDate(Number(v.start))],
          ["Cliff ends", Number(v.cliff) > Number(v.start) ? fmtDate(Number(v.cliff)) : "No cliff"],
          ["Fully vested", now < Number(v.end) ? `${fmtDate(Number(v.end))} · in ${fmtSpan(Number(v.end) - now)}` : fmtDate(Number(v.end))],
          ["Beneficiary", isBeneficiary ? "This wallet" : shortAddr(v.beneficiary, 6)],
          ["Created by", isCreator ? "This wallet" : shortAddr(v.creator, 6)],
        ]} />
      </Card>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
        <Stat label="Vested" value={fmtCompact(vested, d)} sub={`${v.total > 0n ? Number((vested * 1000n) / v.total) / 10 : 0}% of total`} />
        <Stat label="Claimed" value={fmtCompact(v.released, d)} sub={v.meta.symbol} />
        <Stat label="Ready to claim" value={fmtCompact(v.claimable, d)} tone={v.claimable > 0n ? colors.gold : undefined} sub={v.meta.symbol} />
        <Stat label="Still locked" value={fmtCompact(v.total - vested, d)} sub={v.meta.symbol} />
      </View>

      {isBeneficiary ? <Claim v={v} /> : <Notice>Only the beneficiary can claim. Tokens unlock steadily from the cliff to the end date.</Notice>}
      {isBeneficiary ? <MoveBeneficiary v={v} /> : null}
    </Screen>
  );
}

/** Vested share over the schedule as 24 bars; past bars are filled, the cliff shows as a flat start. */
function Curve({ v, now }: { v: VestingRow; now: number }) {
  const N = 24;
  const s = Number(v.start), e = Number(v.end);
  const span = Math.max(e - s, 1);
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: 96, gap: 3 }}>
        {Array.from({ length: N }, (_, i) => {
          const t = s + ((i + 1) / N) * span;
          const frac = v.total > 0n ? Number((vestedAt(v, Math.floor(t)) * 1000n) / v.total) / 1000 : 0;
          const past = t <= now;
          return <View key={i} style={{ flex: 1, height: Math.max(3, frac * 96), borderRadius: 3, backgroundColor: past ? colors.accent : colors.navy600 }} />;
        })}
      </View>
      <Row between style={{ marginTop: 6 }}>
        <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.faint }}>{fmtDate(s)}</Text>
        <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.faint }}>{fmtDate(e)}</Text>
      </Row>
    </View>
  );
}

function Claim({ v }: { v: VestingRow }) {
  const { walletClient } = useWallet();
  const tx = useTx();
  return (
    <Card>
      <View style={{ padding: 16, borderRadius: radius.md, backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: "rgba(242,196,100,0.35)" }}>
        <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.gold }}>Ready to claim</Text>
        <Text style={{ fontFamily: fonts.display, fontSize: 28, color: colors.text, marginTop: 2 }}>{`${fmtTok(v.claimable, v.meta.decimals)} ${v.meta.symbol}`}</Text>
      </View>
      <Button title={tx.busy ? "Claiming…" : "Claim"} disabled={v.claimable === 0n} loading={tx.busy} onPress={() => void tx.send(() => walletClient!.writeContract({ account: walletClient!.account!, chain: walletClient!.chain, address: ADDR.vesting, abi: vestingAbi, functionName: "claim", args: [v.id] }))} />
      <TxStatus tx={tx} done="Claimed to this wallet." />
    </Card>
  );
}

function MoveBeneficiary({ v }: { v: VestingRow }) {
  const { walletClient } = useWallet();
  const tx = useTx();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  if (!open) return <Button kind="ghost" title="Move to another wallet" onPress={() => setOpen(true)} />;
  return (
    <Card>
      <H2>Move this schedule</H2>
      <P small style={{ marginTop: 4 }}>The new wallet receives everything not yet claimed. Claim first if you want what has vested so far.</P>
      <Field label="New beneficiary" placeholder="0x…" value={to} onChangeText={(x) => setTo(x.trim())} error={to && !isAddress(to) ? "Not a valid address." : undefined} />
      <Button kind="danger" title={tx.busy ? "Confirming…" : "Move schedule"} disabled={!isAddress(to)} loading={tx.busy} onPress={() => void tx.send(() => walletClient!.writeContract({ account: walletClient!.account!, chain: walletClient!.chain, address: ADDR.vesting, abi: vestingAbi, functionName: "setBeneficiary", args: [v.id, to as Address] }))} />
      <TxStatus tx={tx} done="Moved. The new wallet is now the beneficiary." />
    </Card>
  );
}
