import { useEffect, useState } from "react";
import { Image, Linking, Pressable, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { isAddress, type Address } from "viem";
import { Text } from "@/i18n/Text";
import { useWallet } from "@/wallet/provider";
import { useTx } from "@/wallet/useTx";
import { arcNamesAbi, NAMES, siteUrl, TEXT_KEYS, useNameInfo, usePrimaryName, useTexts } from "@/tools/names";
import { Button, Card, Eyebrow, Field, H2, Ledger, Notice, P, Pill, Row, Screen, Skeleton } from "@/components/ui";
import { TxStatus } from "@/components/TxStatus";
import { BackHeader, fmtDate } from "@/components/tools";
import { fmtUsd, shortAddr } from "@/lib/format";
import { colors, fonts, radius } from "@/theme";

type Panel = "profile" | "website" | "address" | "renew";

export default function ManageName() {
  const { label = "" } = useLocalSearchParams<{ label: string }>();
  const { address, walletClient } = useWallet();
  const info = useNameInfo(label);
  const primary = usePrimaryName(address);
  const [panel, setPanel] = useState<Panel>("profile");
  const primaryTx = useTx();
  const i = info.data;
  const texts = useTexts(label).data;
  const avatarRaw = texts?.[0] ?? "";
  const avatar = avatarRaw.startsWith("ipfs://") ? `https://ipfs.filebase.io/ipfs/${avatarRaw.slice(7)}` : avatarRaw.startsWith("https://") ? avatarRaw : "";
  const bio = texts?.[1] ?? "";

  if (!i) return <Screen><BackHeader title=".arc names" /><Card>{[0, 1, 2].map((k) => <View key={k} style={{ paddingVertical: 10 }}><Skeleton /></View>)}</Card></Screen>;
  const mine = !!address && i.owner.toLowerCase() === address.toLowerCase();
  const pointsHere = !!address && i.addr.toLowerCase() === address.toLowerCase();
  const expired = Number(i.expires) * 1000 < Date.now();

  return (
    <Screen>
      <BackHeader title=".arc names" share={`${label}.arc on Arc${i.contenthash ? `\n${siteUrl(label)}` : ""}`} />
      <View style={{ marginTop: 20, padding: 20, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.accentLine, backgroundColor: colors.card }}>
        <Row style={{ gap: 14 }}>
          {avatar ? <Image source={{ uri: avatar }} style={{ width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: "rgba(95,227,201,0.5)" }} />
            : <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }}><Text style={{ fontFamily: fonts.displayBold, fontSize: 26, color: colors.accent }}>{label[0]?.toUpperCase() ?? "?"}</Text></View>}
          <View style={{ flex: 1 }}>
            <Eyebrow color={colors.accent}>Arc name</Eyebrow>
            <Text style={{ fontFamily: fonts.display, fontSize: 28, color: colors.text, marginTop: 4 }} numberOfLines={1} adjustsFontSizeToFit>{`${label}.arc`}</Text>
          </View>
        </Row>
        {bio ? <P small style={{ marginTop: 12, color: colors.text }}>{bio}</P> : null}
        <Row style={{ marginTop: 10, gap: 6, flexWrap: "wrap" }}>
          {primary.data === label ? <Pill tone="aqua">primary</Pill> : null}
          <Pill tone={expired ? "gold" : "dim"}>{expired ? `expired ${fmtDate(Number(i.expires))}` : `until ${fmtDate(Number(i.expires))}`}</Pill>
        </Row>
        <Ledger rows={[["Points to", pointsHere ? "This wallet" : shortAddr(i.addr, 6)], ["Owner", mine ? "This wallet" : shortAddr(i.owner, 6)]]} />
        {i.contenthash ? (
          <Pressable onPress={() => void Linking.openURL(siteUrl(label))}><Text style={{ fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.accent, marginTop: 12 }}>{`${label}.usearckit.online ↗`}</Text></Pressable>
        ) : null}
      </View>

      {!mine ? <Notice>Only the owner can change this name.</Notice> : (
        <>
          {primary.data !== label ? (
            <Card>
              <P small>{pointsHere ? `Show ${label}.arc as your name in Arc Kit.` : `Point ${label}.arc at this wallet first to use it as your name.`}</P>
              <Button kind="soft" title="Make primary name" disabled={!pointsHere || expired} loading={primaryTx.busy}
                onPress={() => void primaryTx.send(() => walletClient!.writeContract({ account: walletClient!.account!, chain: walletClient!.chain, address: NAMES, abi: arcNamesAbi, functionName: "setPrimaryName", args: [label] }))} />
              <TxStatus tx={primaryTx} done={`${label}.arc is your primary name.`} />
            </Card>
          ) : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 16 }}>
            {(["profile", "website", "address", "renew"] as Panel[]).map((p) => <Pill key={p} tone={panel === p ? "accent" : "dim"} onPress={() => setPanel(p)}>{p === "profile" ? "Profile" : p === "website" ? "Website" : p === "address" ? "Address" : "Renew"}</Pill>)}
          </View>
          {panel === "profile" ? <Profile label={label} /> : null}
          {panel === "website" ? <Website label={label} current={i.contenthash} /> : null}
          {panel === "address" ? <AddressPanel label={label} current={i.addr} /> : null}
          {panel === "renew" ? <Renew label={label} yearly={i.yearlyPrice} expires={Number(i.expires)} /> : null}
        </>
      )}
    </Screen>
  );
}

const write = (wc: NonNullable<ReturnType<typeof useWallet>["walletClient"]>, functionName: "setTexts" | "setContenthash" | "setAddr", args: readonly unknown[]) =>
  wc.writeContract({ account: wc.account!, chain: wc.chain, address: NAMES, abi: arcNamesAbi, functionName, args: args as never });

function Profile({ label }: { label: string }) {
  const { walletClient } = useWallet();
  const texts = useTexts(label);
  const [vals, setVals] = useState<string[]>([]);
  useEffect(() => { if (texts.data) setVals(texts.data); }, [texts.data]);
  const tx = useTx();
  const changed = TEXT_KEYS.map(([k], i) => [k, (vals[i] ?? "").trim()] as const).filter(([, v], i) => v !== (texts.data?.[i] ?? ""));
  return (
    <Card>
      <H2>Profile</H2>
      <P small style={{ marginTop: 4 }}>Shown wherever your name appears. Everything here is public.</P>
      {TEXT_KEYS.map(([k, l, ph], i) => <Field key={k} label={l} placeholder={ph} value={vals[i] ?? ""} onChangeText={(v) => setVals((s) => { const n = [...s]; n[i] = v; return n; })} />)}
      <Button title={tx.busy ? "Saving…" : changed.length ? "Save profile" : "No changes"} disabled={!changed.length} loading={tx.busy}
        onPress={() => void tx.send(() => write(walletClient!, "setTexts", [label, changed.map(([k]) => k), changed.map(([, v]) => v)]))} />
      <TxStatus tx={tx} done="Profile saved." />
    </Card>
  );
}

function Website({ label, current }: { label: string; current: string }) {
  const { walletClient } = useWallet();
  const [link, setLink] = useState("");
  const tx = useTx();
  const ok = /^ipfs:\/\/[a-zA-Z0-9]+(\/[A-Za-z0-9._~-]+)*\/?$/.test(link.trim());
  return (
    <Card>
      <H2>Website</H2>
      <P small style={{ marginTop: 4 }}>{`Your site opens at ${label}.usearckit.online. Upload a folder from usearckit.online/names on a computer, or paste an IPFS link here.`}</P>
      {current ? <Notice tone="aqua">{`Live: ${current.slice(0, 40)}${current.length > 40 ? "…" : ""}`}</Notice> : null}
      <Field label="IPFS link" placeholder="ipfs://bafy…" value={link} onChangeText={setLink} error={link && !ok ? "Paste a link that starts with ipfs://" : undefined} />
      <Button title={tx.busy ? "Publishing…" : "Publish"} disabled={!ok} loading={tx.busy} onPress={() => void tx.send(() => write(walletClient!, "setContenthash", [label, link.trim()]))} />
      {current ? <Button kind="ghost" title="Take the website down" loading={tx.busy} onPress={() => void tx.send(() => write(walletClient!, "setContenthash", [label, ""]))} /> : null}
      <TxStatus tx={tx} done={`Updated. ${label}.usearckit.online refreshes within a minute.`} />
    </Card>
  );
}

function AddressPanel({ label, current }: { label: string; current: Address }) {
  const { walletClient } = useWallet();
  const [to, setTo] = useState("");
  const tx = useTx();
  return (
    <Card>
      <H2>Address</H2>
      <P small style={{ marginTop: 4 }}>{`Payments to ${label}.arc go to ${shortAddr(current, 6)}. Point it at another wallet, such as a cold wallet or a multisig.`}</P>
      <Field label="New address" placeholder="0x…" value={to} onChangeText={(v) => setTo(v.trim())} error={to && !isAddress(to) ? "Not a valid address." : undefined} />
      <Button title={tx.busy ? "Updating…" : "Update address"} disabled={!isAddress(to)} loading={tx.busy} onPress={() => void tx.send(() => write(walletClient!, "setAddr", [label, to as Address]))} />
      <TxStatus tx={tx} done="Address updated." />
    </Card>
  );
}

function Renew({ label, yearly, expires }: { label: string; yearly: bigint; expires: number }) {
  const { walletClient } = useWallet();
  const [years, setYears] = useState(1);
  const tx = useTx();
  const cost = yearly * BigInt(years);
  return (
    <Card>
      <H2>Renew</H2>
      <View style={{ flexDirection: "row", gap: 6, marginTop: 12 }}>{[1, 2, 3, 5].map((y) => <Pill key={y} tone={years === y ? "accent" : "dim"} onPress={() => setYears(y)}>{`+${y} ${y === 1 ? "year" : "years"}`}</Pill>)}</View>
      <Ledger rows={[["New expiry", fmtDate(expires + years * 365 * 86_400)], ["Cost", `${fmtUsd(cost)} USDC`]]} />
      <Button title={tx.busy ? "Renewing…" : `Renew ${label}.arc`} loading={tx.busy}
        onPress={() => void tx.send(() => walletClient!.writeContract({ account: walletClient!.account!, chain: walletClient!.chain, address: NAMES, abi: arcNamesAbi, functionName: "renew", args: [label, BigInt(years)], value: cost }))} />
      <TxStatus tx={tx} done="Renewed." />
    </Card>
  );
}
