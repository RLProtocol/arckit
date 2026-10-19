import { useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/i18n/Text";
import { useWallet } from "@/wallet/provider";
import { useTx } from "@/wallet/useTx";
import { arcNamesAbi, isValidName, NAMES, normalizeName, useMyNames, useNameInfo, usePrimaryName, type NameInfo } from "@/tools/names";
import { useBalances } from "@/hooks/useBalances";
import { Button, Card, Field, H1, H2, Ledger, Notice, P, Pill, Row, Screen, Skeleton } from "@/components/ui";
import { TxStatus } from "@/components/TxStatus";
import { BackHeader, Empty, fmtDate, ListRow } from "@/components/tools";
import { fmtUsd, shortAddr } from "@/lib/format";
import { colors, fonts, radius } from "@/theme";

const YEARS = [1, 2, 3, 5];

export default function Names() {
  const [q, setQ] = useState("");
  const label = normalizeName(q);
  return (
    <Screen>
      <BackHeader title=".arc names" />
      <View style={{ marginTop: 18 }}>
        <H1>Your name on Arc</H1>
        <P small style={{ marginTop: 6 }}>Get paid at yourname.arc instead of a long address, and host a website at yourname.usearckit.online.</P>
      </View>
      <Card>
        <Field label="Find a name" placeholder="yourname" value={q} onChangeText={(v) => setQ(v.replace(/\s/g, ""))} autoCapitalize="none"
          right={<Text style={{ fontFamily: fonts.mono, fontSize: 16, color: colors.aqua, paddingHorizontal: 14 }}>.arc</Text>}
          hint="a-z, 0-9 and hyphens · 5+ chars 5 USDC/yr · 4 chars 20 · 3 chars 50" />
        {label && !isValidName(label) ? <Notice tone="coral">Names use a-z, 0-9 and hyphens, 3 to 32 characters, not starting or ending with a hyphen.</Notice> : null}
        {isValidName(label) ? <Lookup label={label} /> : null}
      </Card>
      <MyNames />
    </Screen>
  );
}

function Lookup({ label }: { label: string }) {
  const router = useRouter();
  const q = useNameInfo(label);
  const i = q.data;
  if (!i) return <View style={{ marginTop: 14 }}><Skeleton /></View>;
  if (i.available) return <Register label={label} info={i} />;
  if (i.isReserved && i.owner === "0x0000000000000000000000000000000000000000") return <Notice>{`${label}.arc is reserved.`}</Notice>;
  const expired = Number(i.expires) * 1000 < Date.now();
  return (
    <View style={{ marginTop: 14 }}>
      <Row between><Text style={{ fontFamily: fonts.display, fontSize: 20, color: colors.text }}>{`${label}.arc`}</Text><Pill tone={expired ? "gold" : "dim"}>{expired ? "in grace" : "taken"}</Pill></Row>
      <Ledger rows={[["Points to", i.addr !== "0x0000000000000000000000000000000000000000" ? shortAddr(i.addr, 6) : "nothing"], ["Owner", shortAddr(i.owner, 6)], ["Until", fmtDate(Number(i.expires))], ...(i.contenthash ? [["Website", `${label}.usearckit.online`] as [string, string]] : [])]} />
      <Button kind="ghost" title={`Send to ${label}.arc`} onPress={() => router.push({ pathname: "/send", params: { to: `${label}.arc` } })} />
    </View>
  );
}

function Register({ label, info }: { label: string; info: NameInfo }) {
  const router = useRouter();
  const { address, walletClient } = useWallet();
  const bal = useBalances(address);
  const [years, setYears] = useState(1);
  const tx = useTx();
  const cost = info.yearlyPrice * BigInt(years);
  const short = (bal.data?.native ?? 0n) < cost + 20_000_000_000_000_000n;
  if (tx.status === "success") {
    return (
      <View style={{ marginTop: 16, alignItems: "center" }}>
        <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: colors.aquaSoft, alignItems: "center", justifyContent: "center" }}><Ionicons name="at" size={28} color={colors.aqua} /></View>
        <Text style={{ fontFamily: fonts.display, fontSize: 22, color: colors.text, marginTop: 12 }}>{`${label}.arc is yours`}</Text>
        <Button title="Set it up" style={{ alignSelf: "stretch" }} onPress={() => router.push({ pathname: "/tools/names/[label]", params: { label } })} />
      </View>
    );
  }
  return (
    <View style={{ marginTop: 14 }}>
      <Row between><Text style={{ fontFamily: fonts.display, fontSize: 20, color: colors.text }}>{`${label}.arc`}</Text><Pill tone="aqua">available</Pill></Row>
      <View style={{ flexDirection: "row", gap: 6, marginTop: 14 }}>{YEARS.map((y) => <Pill key={y} tone={years === y ? "accent" : "dim"} onPress={() => setYears(y)}>{y === 1 ? "1 year" : `${y} years`}</Pill>)}</View>
      <Ledger rows={[["Per year", `${fmtUsd(info.yearlyPrice)} USDC`], ["Total", `${fmtUsd(cost)} USDC`], ["Points to", "This wallet"]]} />
      {short ? <Notice tone="coral">Not enough USDC for this and gas.</Notice> : null}
      <Button title={tx.busy ? "Registering…" : `Register ${label}.arc`} disabled={short || !walletClient} loading={tx.busy}
        onPress={() => void tx.send(() => walletClient!.writeContract({ account: walletClient!.account!, chain: walletClient!.chain, address: NAMES, abi: arcNamesAbi, functionName: "register", args: [label, BigInt(years), address!], value: cost }))} />
      <TxStatus tx={tx} done={`${label}.arc is yours.`} />
    </View>
  );
}

function MyNames() {
  const router = useRouter();
  const { address } = useWallet();
  const q = useMyNames(address);
  const primary = usePrimaryName(address);
  if (q.isLoading) return <Card tight>{[0, 1].map((i) => <View key={i} style={{ padding: 14 }}><Skeleton /></View>)}</Card>;
  if (!q.data?.length) return <Card><Empty icon="at-outline" title="No names yet" text="Search above to get your first .arc name." /></Card>;
  return (
    <>
      <H2 style={{ marginTop: 22 }}>Your names</H2>
      <Card tight>
        {q.data.map((n) => {
          const days = Math.floor((Number(n.expires) - Date.now() / 1000) / 86_400);
          return (
            <ListRow key={n.label}
              left={<View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }}><Ionicons name="at" size={20} color={colors.accent} /></View>}
              title={`${n.label}.arc`} sub={primary.data === n.label ? "primary name" : `until ${fmtDate(Number(n.expires))}`}
              right={days < 0 ? "expired" : days < 30 ? `${days}d left` : ""} rightTone={days < 30 ? colors.gold : colors.faint}
              onPress={() => router.push({ pathname: "/tools/names/[label]", params: { label: n.label } })} />
          );
        })}
      </Card>
    </>
  );
}
