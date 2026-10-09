import { useState } from "react";
import { Linking, Pressable, Share, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useQuery } from "@tanstack/react-query";
import { isAddress, type Address } from "viem";
import { Text } from "@/i18n/Text";
import { useWallet } from "@/wallet/provider";
import { useTx } from "@/wallet/useTx";
import { useArgusTerms, useLaunch, type LaunchStats } from "@/hooks/useArgus";
import { escrowAbi, imageUrl, LANES } from "@/argus";
import { ADDR, explorerAddress, publicClient } from "@/chain";
import { erc20Abi, lockerAbi, stakingAbi } from "@/contracts";
import { customTokens, saveCustomTokens } from "@/wallet/store";
import { Button, Card, Eyebrow, Field, H1, H2, Ledger, Notice, P, Pill, Row, Screen, Skeleton } from "@/components/ui";
import { TokenLogo } from "@/components/TokenLogo";
import { TxStatus } from "@/components/TxStatus";
import { ActionTile, BondBar, compactUsd, SplitBar, SplitLegend, Stat } from "@/components/launch";
import { fmtCompact, fmtPrice, fmtTok, fmtUsd, safeParse, shortAddr } from "@/lib/format";
import { colors, fonts, radius } from "@/theme";

const T = { blue: ["rgba(143,179,255,0.22)", "#8fb3ff"], aqua: ["rgba(95,227,201,0.2)", "#5fe3c9"], gold: ["rgba(242,196,100,0.2)", "#f2c464"], coral: ["rgba(255,122,110,0.2)", "#ff7a6e"], violet: ["rgba(186,156,255,0.22)", "#ba9cff"] } as const;
const DAY = 86_400;

export default function LaunchDetail() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const { address } = useWallet();
  const terms = useArgusTerms();
  const q = useLaunch(token && isAddress(token) ? (token as Address) : undefined, address);
  const l = q.data;
  const [open, setOpen] = useState<"lock" | "stake" | null>(null);
  const [copied, setCopied] = useState(false);

  const header = (
    <Row between style={{ marginTop: 6 }}>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/launch"))} hitSlop={10} style={{ width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.lineStrong, alignItems: "center", justifyContent: "center", backgroundColor: colors.card }}>
        <Ionicons name="chevron-back" size={20} color={colors.text} />
      </Pressable>
      <Eyebrow>Launch</Eyebrow>
      <Pressable onPress={() => l && void Share.share({ message: `${l.name} ($${l.symbol}) is live on Arc.\nhttps://dexscreener.com/arc/${l.token}` })} hitSlop={10} style={{ width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.lineStrong, alignItems: "center", justifyContent: "center", backgroundColor: colors.card }}>
        <Ionicons name="share-outline" size={18} color={colors.text} />
      </Pressable>
    </Row>
  );

  if (q.isLoading || !terms.data) return <Screen>{header}<Card>{[0, 1, 2, 3].map((i) => <View key={i} style={{ paddingVertical: 10 }}><Skeleton /></View>)}</Card></Screen>;
  if (!l) return <Screen>{header}<Notice tone="coral">{q.error ? String((q.error as Error).message) : "This is not an Argus Portal #8 token."}</Notice></Screen>;

  const isPayee = !!address && l.payout.toLowerCase() === address.toLowerCase();
  const links = [["globe-outline", l.meta?.website], ["logo-twitter", l.meta?.twitter], ["paper-plane-outline", l.meta?.telegram]].filter(([, u]) => !!u) as [keyof typeof Ionicons.glyphMap, string][];

  return (
    <Screen>
      {header}
      <View style={{ alignItems: "center", marginTop: 20 }}>
        <TokenLogo symbol={l.symbol} uri={imageUrl(l.meta?.imageURI)} size={76} />
        <H1 style={{ textAlign: "center", marginTop: 12 }}>{l.name}</H1>
        <Pressable onPress={() => { void Clipboard.setStringAsync(l.token); setCopied(true); setTimeout(() => setCopied(false), 1500); }} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
          <Text style={{ fontFamily: fonts.mono, fontSize: 13, color: colors.aqua }}>{`$${l.symbol}`}</Text>
          <Text style={{ fontFamily: fonts.mono, fontSize: 12, color: colors.faint }}>{shortAddr(l.token, 5)}</Text>
          <Ionicons name={copied ? "checkmark" : "copy-outline"} size={13} color={copied ? colors.aqua : colors.faint} />
        </Pressable>
        {links.length ? (
          <Row style={{ marginTop: 12, gap: 8 }}>
            {links.map(([icon, u]) => (
              <Pressable key={icon} onPress={() => void Linking.openURL(/^https?:\/\//.test(u) ? u : `https://${u}`)} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.navy600, alignItems: "center", justifyContent: "center" }}><Ionicons name={icon} size={16} color={colors.dim} /></Pressable>
            ))}
          </Row>
        ) : null}
        {l.meta?.description ? <P small style={{ textAlign: "center", marginTop: 12 }}>{l.meta.description}</P> : null}
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 20 }}>
        <Stat label="Price" value={l.price > 0n ? `$${fmtPrice(l.price)}` : "—"} />
        <Stat label="Market cap" value={l.fdv > 0n ? `$${compactUsd(l.fdv)}` : "—"} />
        <Stat label="Tax collected" value={l.usdcQuote ? `$${compactUsd(l.collected)}` : `${fmtCompact(l.collected, 18)} ${l.quoteSymbol}`} sub="all lanes, lifetime" />
        <Stat label="You hold" value={fmtCompact(l.balance, 18)} sub={l.balance > 0n && l.price > 0n ? `≈ $${compactUsd((l.balance * l.price) / 10n ** 18n)}` : l.symbol} />
      </View>

      {/* the bond is a USDC FDV, so progress only means something for USDC launches */}
      {l.usdcQuote ? <Card>
        <Row between><H2>Bond progress</H2><Pill tone={l.fdv >= terms.data.bondFdv ? "aqua" : "dim"}>{l.fdv >= terms.data.bondFdv ? "bonded" : "bonding"}</Pill></Row>
        <P small style={{ marginTop: 4, marginBottom: 14 }}>{`From the $${compactUsd(terms.data.startFdv)} start to Argus's $${compactUsd(terms.data.bondFdv)} milestone.`}</P>
        <BondBar fdv={l.fdv} start={terms.data.startFdv} bond={terms.data.bondFdv} />
      </Card> : null}

      <Fees l={l} isPayee={isPayee} />

      <Card>
        <H2>Grow it with Arc Kit</H2>
        <P small style={{ marginTop: 4 }}>Every tool runs right here and signs with this wallet.</P>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
          <ActionTile icon="lock-closed-outline" title="Lock supply" text="Lock tokens with a public certificate." tint={T.blue} active={open === "lock"} onPress={() => setOpen(open === "lock" ? null : "lock")} />
          <ActionTile icon="layers-outline" title="Open staking" text="Reward holders who stake." tint={T.aqua} active={open === "stake"} onPress={() => setOpen(open === "stake" ? null : "stake")} />
          <ActionTile icon="people-outline" title="List on P2P" text="Sell a slice for USDC, no slippage." tint={T.gold} onPress={() => router.push({ pathname: "/(tabs)/p2p", params: { token: l.token, tab: "sell" } })} />
          <ActionTile icon="pulse-outline" title="Trade" text="Buy or sell at the pool price." tint={T.coral} onPress={() => router.push({ pathname: "/(tabs)/trade", params: { token: l.token } })} />
          <ActionTile icon="gift-outline" title="Airdrop" text="Send to up to 500 wallets at once." tint={T.violet} onPress={() => router.push({ pathname: "/dapp", params: { path: "/airdrop", title: "Airdrop" } })} />
          <ActionTile icon="wallet-outline" title="Add to wallet" text="Show it on your Wallet tab." tint={T.blue} onPress={() => void addToWallet(l)} />
        </View>
        {open === "lock" ? <LockForm l={l} /> : null}
        {open === "stake" ? <StakeForm l={l} /> : null}
      </Card>

      <Row style={{ justifyContent: "center", gap: 18, marginTop: 18 }}>
        <Pressable onPress={() => void Linking.openURL(`https://dexscreener.com/arc/${l.token}`)}><Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.accent }}>DexScreener</Text></Pressable>
        <Pressable onPress={() => void Linking.openURL(explorerAddress(l.token))}><Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.accent }}>Etherscan</Text></Pressable>
      </Row>
    </Screen>
  );
}

async function addToWallet(l: LaunchStats) {
  const list = await customTokens().catch(() => []);
  if (list.some((t) => t.address.toLowerCase() === l.token.toLowerCase())) return;
  await saveCustomTokens([...list, { address: l.token, symbol: l.symbol, name: l.name, decimals: 18 }]);
}

function Fees({ l, isPayee }: { l: LaunchStats; isPayee: boolean }) {
  const { walletClient } = useWallet();
  const tx = useTx();
  return (
    <Card>
      <Row between>
        <H2>Creator fees</H2>
        <Pill tone="gold">{l.quoteSymbol}</Pill>
      </Row>
      <View style={{ marginTop: 14, padding: 16, borderRadius: radius.md, backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: "rgba(242,196,100,0.35)" }}>
        <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.gold }}>Ready to claim</Text>
        <Text style={{ fontFamily: fonts.display, fontSize: 30, color: colors.text, marginTop: 2 }}>{`${fmtUsd(l.owed, 4)} ${l.quoteSymbol}`}</Text>
        <Text style={{ fontFamily: fonts.mono, fontSize: 12, color: colors.dim, marginTop: 4 }}>{`${fmtUsd(l.claimed)} ${l.quoteSymbol} claimed so far`}</Text>
      </View>
      <Ledger rows={[["Paid to", isPayee ? "This wallet" : shortAddr(l.payout, 6)], ["Split", <View key="s" style={{ paddingTop: 4 }}><SplitBar alloc={l.split} height={8} /><SplitLegend alloc={l.split} /></View>]]} />
      {!isPayee ? <Notice>{`Fees from this launch go to ${shortAddr(l.payout, 6)}. Anyone can trigger the payout; it always lands there.`}</Notice> : null}
      <Button title={tx.busy ? "Claiming…" : "Claim fees"} disabled={l.owed === 0n} loading={tx.busy} onPress={() => void tx.send(() => walletClient!.writeContract({ account: walletClient!.account!, chain: walletClient!.chain, address: l.escrow, abi: escrowAbi, functionName: "claimCreator" }))} />
      <TxStatus tx={tx} done="Fees claimed." />
      {l.split[0] === 0 ? <P small style={{ marginTop: 10 }}>{`This launch sends nothing to the creator: its tax goes to ${l.split.map((b, i) => (b ? LANES[i].label.toLowerCase() : "")).filter(Boolean).join(", ")}.`}</P> : null}
    </Card>
  );
}

/** Balance + allowance of the launch token for a spender, refreshed after every write. */
function useTokenFor(token: Address, spender: Address | undefined, owner?: Address) {
  return useQuery({
    queryKey: ["tok-for", token, spender, owner],
    enabled: !!owner && !!spender,
    queryFn: async () => {
      const [b, a] = await publicClient.multicall({ contracts: [{ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner!] }, { address: token, abi: erc20Abi, functionName: "allowance", args: [owner!, spender!] }], allowFailure: false });
      return { balance: b as bigint, allowance: a as bigint };
    },
  });
}

const LOCK_TERMS: [number, string][] = [[30, "30 days"], [90, "90 days"], [180, "6 months"], [365, "1 year"], [730, "2 years"]];

function LockForm({ l }: { l: LaunchStats }) {
  const { address, walletClient } = useWallet();
  const tx = useTx();
  const [amt, setAmt] = useState("");
  const [days, setDays] = useState(180);
  const bal = useTokenFor(l.token, ADDR.locker, address);
  const fee = useQuery({ queryKey: ["lock-fee"], queryFn: () => publicClient.readContract({ address: ADDR.locker, abi: lockerAbi, functionName: "lockFee" }) });
  const units = safeParse(amt, 18);
  const needsApproval = !!units && (bal.data?.allowance ?? 0n) < units;
  const err = units && bal.data && units > bal.data.balance ? `You hold ${fmtTok(bal.data.balance, 18)} ${l.symbol}.` : "";
  const pct = units && l.supply > 0n ? Number((units * 10_000n) / l.supply) / 100 : 0;
  const unlock = new Date(Date.now() + days * DAY * 1000);
  const submit = () => void tx.send(() => {
    const wc = walletClient!;
    if (needsApproval) return wc.writeContract({ account: wc.account!, chain: wc.chain, address: l.token, abi: erc20Abi, functionName: "approve", args: [ADDR.locker, units!] });
    return wc.writeContract({ account: wc.account!, chain: wc.chain, address: ADDR.locker, abi: lockerAbi, functionName: "lock", args: [l.token, units!, BigInt(Math.floor(unlock.getTime() / 1000)), address!], value: fee.data ?? 0n });
  });
  return (
    <View style={{ marginTop: 16, paddingTop: 4, borderTopWidth: 1, borderTopColor: colors.line }}>
      <Eyebrow color={colors.accent}>ArcLock</Eyebrow>
      <Field label={`${l.symbol} to lock`} placeholder="0" keyboardType="decimal-pad" value={amt} onChangeText={setAmt} error={err || undefined} hint={bal.data ? `You hold ${fmtTok(bal.data.balance, 18, 2)}${pct ? ` · locking ${pct}% of supply` : ""}` : undefined} right={bal.data ? <Pressable onPress={() => setAmt(fmtTok(bal.data!.balance, 18, 18).replace(/,/g, ""))} style={{ paddingHorizontal: 14 }}><Text style={{ fontFamily: fonts.bodyMedium, color: colors.accent }}>Max</Text></Pressable> : undefined} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 }}>{LOCK_TERMS.map(([d, label]) => <Pill key={d} tone={days === d ? "accent" : "dim"} onPress={() => setDays(d)}>{label}</Pill>)}</View>
      <Ledger rows={[["Unlocks", unlock.toLocaleDateString()], ["Lock fee", fee.data !== undefined ? `${fmtUsd(fee.data)} USDC` : "…"], ["Withdrawer", "This wallet"]]} />
      <Button title={tx.busy ? "Confirming…" : needsApproval ? `Approve ${l.symbol}` : "Lock tokens"} disabled={!units || !!err || fee.data === undefined} loading={tx.busy} onPress={submit} />
      <TxStatus tx={tx} done={needsApproval ? "Approved. Now lock." : "Locked. The certificate is public on usearckit.online."} />
    </View>
  );
}

const STAKE_TERMS = [7, 30, 90, 180];

function StakeForm({ l }: { l: LaunchStats }) {
  const { address, walletClient } = useWallet();
  const tx = useTx();
  const [amt, setAmt] = useState("");
  const [days, setDays] = useState(30);
  const bal = useTokenFor(l.token, ADDR.staking, address);
  const fee = useQuery({ queryKey: ["stake-fee"], queryFn: () => publicClient.readContract({ address: ADDR.staking, abi: stakingAbi, functionName: "createFee" }) });
  const units = safeParse(amt, 18);
  const needsApproval = !!units && (bal.data?.allowance ?? 0n) < units;
  const err = units && bal.data && units > bal.data.balance ? `You hold ${fmtTok(bal.data.balance, 18)} ${l.symbol}.` : "";
  const submit = () => void tx.send(() => {
    const wc = walletClient!;
    if (needsApproval) return wc.writeContract({ account: wc.account!, chain: wc.chain, address: l.token, abi: erc20Abi, functionName: "approve", args: [ADDR.staking, units!] });
    return wc.writeContract({
      account: wc.account!, chain: wc.chain, address: ADDR.staking, abi: stakingAbi, functionName: "createPool", value: fee.data ?? 0n,
      args: [{ stakeToken: l.token, rewardToken: l.token, startTime: 0n, duration: BigInt(days * DAY), penaltyBps: 0, minStake: 0n, maxStakePerWallet: 0n, maxTotalStaked: 0n, name: `${l.symbol} ${days} days` }, units!],
    });
  });
  return (
    <View style={{ marginTop: 16, paddingTop: 4, borderTopWidth: 1, borderTopColor: colors.line }}>
      <Eyebrow color={colors.aqua}>Staking</Eyebrow>
      <P small style={{ marginTop: 6 }}>{`Holders stake ${l.symbol} and earn ${l.symbol}. You deposit the rewards now; they stream out evenly over the pool's life.`}</P>
      <Field label={`${l.symbol} rewards to deposit`} placeholder="0" keyboardType="decimal-pad" value={amt} onChangeText={setAmt} error={err || undefined} hint={bal.data ? `You hold ${fmtTok(bal.data.balance, 18, 2)}` : undefined} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 }}>{STAKE_TERMS.map((d) => <Pill key={d} tone={days === d ? "accent" : "dim"} onPress={() => setDays(d)}>{`${d} days`}</Pill>)}</View>
      <Ledger rows={[["Pays out", units ? `${fmtCompact(units / BigInt(days), 18)} ${l.symbol} a day` : "—"], ["Early exit", "No penalty"], ["Creation fee", fee.data !== undefined ? `${fmtUsd(fee.data)} USDC` : "…"]]} />
      <Button title={tx.busy ? "Confirming…" : needsApproval ? `Approve ${l.symbol}` : "Open staking pool"} disabled={!units || !!err || fee.data === undefined} loading={tx.busy} onPress={submit} />
      <TxStatus tx={tx} done={needsApproval ? "Approved. Now open the pool." : "Staking is open. Share it from usearckit.online/stake."} />
    </View>
  );
}
