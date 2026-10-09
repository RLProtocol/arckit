import { useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { isAddress, type Address } from "viem";
import { Text } from "@/i18n/Text";
import { useWallet } from "@/wallet/provider";
import { useTx } from "@/wallet/useTx";
import { useBalances } from "@/hooks/useBalances";
import { launchedToken, sendLaunch, useArgusTerms, useMyLaunches, type LaunchForm, type LaunchStage, type LaunchStats } from "@/hooks/useArgus";
import { imageUrl, LANES, MAX_TAX_BPS, SPLIT_PRESETS, TOTAL_SUPPLY } from "@/argus";
import { Button, Card, Eyebrow, Field, H1, H2, Ledger, Notice, P, Pill, Row, Screen, Seg, Skeleton } from "@/components/ui";
import { Brand, TokenLogo } from "@/components/TokenLogo";
import { TxStatus } from "@/components/TxStatus";
import { compactUsd, ImageSlot, pickTokenImage, SplitBar, SplitLegend, StepBar, type PickedImage } from "@/components/launch";
import { fmtCompact, fmtUsd, safeParse, shortAddr, timeAgo } from "@/lib/format";
import { colors, fonts, radius } from "@/theme";

const TAXES = [0, 100, 200, 300, 500, 1000];
const STEPS = ["Token", "Fees", "Opening buy", "Review"] as const;
const STAGES: [LaunchStage, string][] = [["image", "Uploading the image"], ["salt", "Preparing the pool address"], ["approve", "Approving USDC for the opening buy"], ["launch", "Launching on Argus"]];

export default function Launch() {
  const { address } = useWallet();
  const [tab, setTab] = useState<"create" | "mine">("create");
  const [step, setStep] = useState(0);
  const mine = useMyLaunches(address);
  const count = mine.data?.length ?? 0;
  return (
    <Screen scrollTopKey={`${tab}-${step}`}>
      <Brand subtitle="LAUNCH · ARGUS" />
      <View style={{ marginTop: 22 }}>
        <H1>Launch a token</H1>
        <P small style={{ marginTop: 6 }}>On Argus, Arc's launchpad. Your token gets its own Uniswap v4 pool and a trading tax you choose, paid to you in USDC.</P>
      </View>
      <Seg value={tab} options={[["create", "Create"], ["mine", count ? `My launches · ${count}` : "My launches"]]} onChange={setTab} />
      {tab === "create" ? <Create step={step} setStep={setStep} onSeeMine={() => setTab("mine")} /> : <Mine launches={mine.data} loading={mine.isLoading} error={mine.error ? String((mine.error as Error).message) : ""} onCreate={() => setTab("create")} />}
    </Screen>
  );
}

// ---------------------------------------------------------------- create

const blank = { name: "", symbol: "", description: "", website: "", twitter: "", telegram: "" };

function Create({ step, setStep, onSeeMine }: { step: number; setStep: (n: number) => void; onSeeMine: () => void }) {
  const router = useRouter();
  const { address, walletClient } = useWallet();
  const terms = useArgusTerms();
  const bal = useBalances(address);
  const tx = useTx();
  const [f, setF] = useState(blank);
  const [showProblem, setShowProblem] = useState(false);
  const [image, setImage] = useState<PickedImage | null>(null);
  const [links, setLinks] = useState(false);
  const [buy, setBuy] = useState(300);
  const [sell, setSell] = useState(300);
  const [alloc, setAlloc] = useState<[number, number, number, number, number]>([5000, 2000, 2000, 1000, 0]);
  const [seedText, setSeedText] = useState("");
  const [payoutOn, setPayoutOn] = useState(false);
  const [payout, setPayout] = useState("");
  const [stage, setStage] = useState<LaunchStage | null>(null);
  const [imgErr, setImgErr] = useState("");

  const set = (k: keyof typeof blank) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  const t = terms.data;
  const minSeed = t?.minSeed ?? 4_500_000n;
  const seed = safeParse(seedText, 6);
  const usdc = bal.data?.native ?? 0n;
  const total = alloc.reduce((a, b) => a + b, 0);

  // step checks: one message per step, shown under its fields
  const nameErr = !f.name.trim() ? "" : f.name.trim().length > 32 ? "Name is at most 32 characters." : "";
  const symErr = !f.symbol.trim() ? "" : !/^[A-Za-z0-9$]{1,10}$/.test(f.symbol.trim()) ? "Ticker: up to 10 letters or numbers, no spaces." : "";
  const step0ok = !!f.name.trim() && !!f.symbol.trim() && !nameErr && !symErr && f.description.length <= 500;
  const step1ok = total === 10_000;
  const seedErr = !seedText.trim() ? "" : !seed ? "Enter an amount in USDC." : seed < minSeed ? `Minimum ${fmtUsd(minSeed * 10n ** 12n)} USDC.` : seed * 10n ** 12n + 50_000_000_000_000_000n > usdc ? "Not enough USDC for this and gas." : "";
  const payoutErr = payoutOn && payout && !isAddress(payout) ? "Not a valid address." : "";
  const step2ok = !!seed && !seedErr && (!payoutOn || isAddress(payout));
  const stepOk = [step0ok, step1ok, step2ok, true][step];
  // what blocks Continue, in words: shown when it is tapped instead of a silently disabled button
  const problem = step === 0
    ? (!f.name.trim() ? "Add a name." : nameErr || (!f.symbol.trim() ? "Add a ticker." : symErr) || (f.description.length > 500 ? "Description is at most 500 characters." : ""))
    : step === 1 ? (total !== 10_000 ? "The fee split must add up to 100%." : "")
    : step === 2 ? (!seedText.trim() ? "Enter the opening buy." : seedErr || (payoutOn && !isAddress(payout) ? "Enter a valid payout address." : "")) : "";

  // rough share at the opening price; the real fill is a little lower (the curve moves and fees apply)
  const estTokens = seed && t ? (seed * 10n ** 12n * TOTAL_SUPPLY) / t.startFdv : 0n;
  const estPct = estTokens > 0n ? Number((estTokens * 10_000n) / TOTAL_SUPPLY) / 100 : 0;

  const form = (): LaunchForm => ({ ...f, imageURI: "", buyTaxBps: buy, sellTaxBps: sell, alloc, seed: seed!, payoutAddress: payoutOn && isAddress(payout) ? (payout as Address) : null });
  const launch = () => { if (!walletClient || !t) return; void tx.send(() => sendLaunch(walletClient, form(), t, setStage, image ?? undefined)).finally(() => setStage(null)); };
  const token = launchedToken(tx.receipt);

  if (tx.status === "success" && token) {
    return (
      <Card style={{ alignItems: "center", paddingVertical: 28 }}>
        <View style={{ width: 92, height: 92, borderRadius: 46, borderWidth: 2, borderColor: colors.aqua, alignItems: "center", justifyContent: "center" }}>
          <TokenLogo symbol={f.symbol} uri={image?.uri} size={80} />
        </View>
        <Eyebrow color={colors.aqua}>Live on Arc</Eyebrow>
        <H2 style={{ marginTop: 6, textAlign: "center" }}>{`${f.symbol.toUpperCase()} is launched`}</H2>
        <P small style={{ textAlign: "center", marginTop: 6 }}>Your opening buy is in your wallet and trading is open. Fees start building with the first trade.</P>
        <Button title="Open my launch" style={{ alignSelf: "stretch" }} onPress={() => router.push({ pathname: "/launch/[token]", params: { token } })} />
        <Button kind="ghost" title="See all my launches" style={{ alignSelf: "stretch" }} onPress={() => { tx.reset(); setStep(0); setF(blank); setImage(null); setSeedText(""); onSeeMine(); }} />
      </Card>
    );
  }

  return (
    <View>
      <StepBar step={step} total={STEPS.length} />
      <Row between style={{ marginTop: 10 }}>
        <Eyebrow color={colors.accent}>{`Step ${step + 1} of ${STEPS.length}`}</Eyebrow>
        <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.dim }}>{STEPS[step]}</Text>
      </Row>

      {step === 0 && (
        <Card>
          <Row style={{ gap: 16 }}>
            <ImageSlot image={image} onPress={() => { setImgErr(""); pickTokenImage().then((i) => i && setImage(i)).catch(() => setImgErr("Could not open your photos. Allow access in Settings.")); }} />
            <View style={{ flex: 1 }}>
              <H2>{f.name.trim() || "Your token"}</H2>
              <Text style={{ fontFamily: fonts.mono, fontSize: 13, color: colors.aqua, marginTop: 2 }}>{f.symbol.trim() ? `$${f.symbol.trim().toUpperCase()}` : "$TICKER"}</Text>
              <P small style={{ marginTop: 6 }}>Square image, shown on Argus, DexScreener and wallets.</P>
            </View>
          </Row>
          {imgErr ? <Notice tone="coral">{imgErr}</Notice> : null}
          <Field label="Name" placeholder="Arc Cat" value={f.name} onChangeText={set("name")} autoCapitalize="words" error={nameErr || undefined} />
          <Field label="Ticker" placeholder="ACAT" value={f.symbol} onChangeText={set("symbol")} autoCapitalize="characters" keyboardType={Platform.OS === "android" ? "visible-password" : "default"} maxLength={10} error={symErr || undefined} />
          <Field label="Description" placeholder="What is it? Why should people care?" value={f.description} onChangeText={set("description")} multiline maxLength={500} style={{ minHeight: 88, textAlignVertical: "top", fontFamily: fonts.body, fontSize: 15 }} hint={`${f.description.length}/500`} />
          <Pressable onPress={() => setLinks(!links)} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 16 }}>
            <Ionicons name={links ? "chevron-down" : "chevron-forward"} size={16} color={colors.accent} />
            <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.accent }}>Links (optional)</Text>
          </Pressable>
          {links && (
            <>
              <Field label="Website" placeholder="https://…" value={f.website} onChangeText={set("website")} keyboardType="url" />
              <Field label="X (Twitter)" placeholder="https://x.com/…" value={f.twitter} onChangeText={set("twitter")} keyboardType="url" />
              <Field label="Telegram" placeholder="https://t.me/…" value={f.telegram} onChangeText={set("telegram")} keyboardType="url" />
            </>
          )}
        </Card>
      )}

      {step === 1 && (
        <>
          <Card>
            <H2>Trading tax</H2>
            <P small style={{ marginTop: 4 }}>Taken in USDC on every trade and split the way you choose below. Up to 10% each way.</P>
            {([["Buy", buy, setBuy], ["Sell", sell, setSell]] as const).map(([label, v, setV]) => (
              <View key={label} style={{ marginTop: 14 }}>
                <Row between><Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.dim }}>{`${label} tax`}</Text><Text style={{ fontFamily: fonts.mono, fontSize: 13, color: colors.text }}>{v / 100}%</Text></Row>
                <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
                  {TAXES.filter((x) => x <= MAX_TAX_BPS).map((x) => (
                    <Pressable key={x} onPress={() => setV(x)} style={{ flex: 1, paddingVertical: 9, alignItems: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: v === x ? colors.accentLine : colors.line, backgroundColor: v === x ? colors.accentSoft : "transparent" }}>
                      <Text style={{ fontFamily: fonts.mono, fontSize: 13, color: v === x ? colors.text : colors.dim }}>{x / 100}%</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
            {buy === 0 && sell === 0 ? <Notice tone="gold">With 0% tax there are no fees to collect, for you or anyone.</Notice> : null}
          </Card>
          <Card>
            <H2>Where the tax goes</H2>
            <P small style={{ marginTop: 4 }}>{`Argus keeps ${(t?.treasuryBps ?? 3000) / 100}% of tax revenue. Your split covers the rest.`}</P>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 14 }}>
              {SPLIT_PRESETS.map((p) => <Pill key={p.key} tone={p.alloc.every((v, i) => v === alloc[i]) ? "accent" : "dim"} onPress={() => setAlloc([...p.alloc])}>{p.label}</Pill>)}
            </View>
            <View style={{ marginTop: 16 }}><SplitBar alloc={alloc} /></View>
            {LANES.map((lane, i) => (
              <View key={lane.key} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: i < LANES.length - 1 ? 1 : 0, borderBottomColor: colors.line, marginTop: i === 0 ? 8 : 0 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: lane.color, marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text }}>{lane.label}</Text>
                  <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.faint }}>{lane.text}</Text>
                </View>
                <Stepper value={alloc[i]} onChange={(v) => setAlloc((a) => a.map((x, j) => (j === i ? v : x)) as typeof a)} />
              </View>
            ))}
            <Row between style={{ marginTop: 10 }}>
              <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.dim }}>Total</Text>
              <Text style={{ fontFamily: fonts.mono, fontSize: 14, color: total === 10_000 ? colors.aqua : colors.coral }}>{total / 100}%{total !== 10_000 ? ` · ${total < 10_000 ? "add" : "remove"} ${Math.abs(10_000 - total) / 100}%` : ""}</Text>
            </Row>
          </Card>
        </>
      )}

      {step === 2 && (
        <Card>
          <H2>Opening buy</H2>
          <P small style={{ marginTop: 4 }}>Argus requires the creator to buy first. It happens inside the launch transaction, so no bot can get in ahead of you.</P>
          <Field label="USDC to spend" placeholder={fmtUsd(minSeed * 10n ** 12n)} keyboardType="decimal-pad" value={seedText} onChangeText={setSeedText} error={seedErr || undefined} hint={`Wallet: ${fmtUsd(usdc)} USDC · minimum ${fmtUsd(minSeed * 10n ** 12n)}`} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {[Number(minSeed) / 1e6, 10, 25, 50, 100].map((v, i) => <Pill key={i} tone={seedText === String(v) ? "accent" : "dim"} onPress={() => setSeedText(String(v))}>{i === 0 ? `Min ${v}` : `${v}`}</Pill>)}
          </View>
          {estTokens > 0n && !seedErr ? (
            <View style={{ marginTop: 16, padding: 14, borderRadius: radius.md, backgroundColor: "rgba(5,13,26,0.45)", borderWidth: 1, borderColor: colors.line }}>
              <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.faint }}>You get about</Text>
              <Text style={{ fontFamily: fonts.display, fontSize: 24, color: colors.text, marginTop: 2 }}>{`${fmtCompact(estTokens, 18)} ${f.symbol.toUpperCase()}`}</Text>
              <Text style={{ fontFamily: fonts.mono, fontSize: 12, color: colors.aqua, marginTop: 2 }}>{`≈ ${estPct.toFixed(estPct < 1 ? 2 : 1)}% of supply at the starting price`}</Text>
            </View>
          ) : null}
          <Pressable onPress={() => setPayoutOn(!payoutOn)} style={{ flexDirection: "row", gap: 10, marginTop: 18, alignItems: "flex-start" }}>
            <View style={{ width: 20, height: 20, borderRadius: 6, borderWidth: 1, borderColor: payoutOn ? colors.aqua : colors.lineStrong, backgroundColor: payoutOn ? colors.aquaSoft : "transparent", alignItems: "center", justifyContent: "center" }}>{payoutOn && <Ionicons name="checkmark" size={14} color={colors.aqua} />}</View>
            <P small style={{ flex: 1 }}><Text style={{ color: colors.text, fontFamily: fonts.bodyMedium }}>Send my fees to another wallet.</Text> For a cold wallet or a team multisig. Off: fees go to this wallet.</P>
          </Pressable>
          {payoutOn ? <Field label="Payout address" placeholder="0x…" value={payout} onChangeText={(v) => setPayout(v.trim())} error={payoutErr || undefined} /> : null}
        </Card>
      )}

      {step === 3 && (
        <>
          <Card>
            <Row style={{ gap: 14 }}>
              <TokenLogo symbol={f.symbol || "?"} uri={image?.uri} size={56} />
              <View style={{ flex: 1 }}>
                <H2>{f.name.trim()}</H2>
                <Text style={{ fontFamily: fonts.mono, fontSize: 13, color: colors.aqua, marginTop: 2 }}>{`$${f.symbol.trim().toUpperCase()}`}</Text>
              </View>
            </Row>
            {f.description.trim() ? <P small style={{ marginTop: 12 }}>{f.description.trim()}</P> : null}
            <Ledger rows={[
              ["Supply", "1,000,000,000"],
              ["Tax", `${buy / 100}% buy · ${sell / 100}% sell`],
              ["Opening buy", `${fmtUsd((seed ?? 0n) * 10n ** 12n)} USDC`],
              ["Starts at", t ? `$${compactUsd(t.startFdv)} FDV` : "…"],
              ["Bond at", t ? `$${compactUsd(t.bondFdv)} FDV` : "…"],
              ["Fees paid to", payoutOn && isAddress(payout) ? shortAddr(payout, 6) : "This wallet"],
            ]} />
            <View style={{ marginTop: 14 }}><SplitBar alloc={alloc} /><SplitLegend alloc={alloc} /></View>
          </Card>
          <Notice>Launching is permanent: the name, ticker, tax and split cannot be changed later. You can redirect where your fees go at any time.</Notice>
          {tx.busy || stage ? (
            <Card>
              {STAGES.filter(([s]) => s !== "image" || !!image).map(([s, label]) => {
                const order = STAGES.findIndex(([x]) => x === s), cur = STAGES.findIndex(([x]) => x === (stage ?? "launch"));
                const done = order < cur || (tx.status === "pending" && s === "launch");
                const now = order === cur && !done;
                return (
                  <Row key={s} style={{ paddingVertical: 7 }}>
                    <Ionicons name={done ? "checkmark-circle" : now ? "ellipse" : "ellipse-outline"} size={18} color={done ? colors.aqua : now ? colors.accent : colors.faint} />
                    <Text style={{ fontFamily: now ? fonts.bodyMedium : fonts.body, fontSize: 14, color: done || now ? colors.text : colors.faint }}>{label}</Text>
                  </Row>
                );
              })}
            </Card>
          ) : null}
          <TxStatus tx={tx} done="Launched." />
        </>
      )}

      {showProblem && problem ? <Notice tone="coral">{problem}</Notice> : null}
      <Row style={{ marginTop: 6 }}>
        {step > 0 ? <Button kind="ghost" title="Back" style={{ flex: 1 }} disabled={tx.busy} onPress={() => { setShowProblem(false); setStep(step - 1); }} /> : null}
        {step < STEPS.length - 1
          ? <Button title="Continue" style={{ flex: 2 }} onPress={() => { if (stepOk) { setShowProblem(false); setStep(step + 1); } else setShowProblem(true); }} />
          : <Button title={tx.busy ? "Launching…" : "Launch on Argus"} style={{ flex: 2 }} loading={tx.busy} disabled={!t || !walletClient} onPress={launch} />}
      </Row>
    </View>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const btn = (icon: "remove" | "add", next: number, disabled: boolean) => (
    <Pressable onPress={() => onChange(next)} disabled={disabled} hitSlop={6} style={{ width: 30, height: 30, borderRadius: 9, borderWidth: 1, borderColor: colors.lineStrong, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.35 : 1 }}>
      <Ionicons name={icon} size={16} color={colors.text} />
    </Pressable>
  );
  return (
    <Row style={{ gap: 8 }}>
      {btn("remove", Math.max(0, value - 500), value === 0)}
      <Text style={{ fontFamily: fonts.mono, fontSize: 14, color: colors.text, width: 42, textAlign: "center" }}>{value / 100}%</Text>
      {btn("add", Math.min(10_000, value + 500), value === 10_000)}
    </Row>
  );
}

// ---------------------------------------------------------------- my launches

function Mine({ launches, loading, error, onCreate }: { launches?: LaunchStats[]; loading: boolean; error: string; onCreate: () => void }) {
  const router = useRouter();
  if (loading) return <Card tight>{[0, 1, 2].map((i) => <View key={i} style={{ padding: 14 }}><Skeleton /></View>)}</Card>;
  if (error) return <Notice tone="coral">{error}</Notice>;
  if (!launches?.length) {
    return (
      <Card style={{ alignItems: "center", paddingVertical: 28 }}>
        <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }}><Ionicons name="rocket-outline" size={26} color={colors.accent} /></View>
        <H2 style={{ marginTop: 12 }}>No launches yet</H2>
        <P small style={{ textAlign: "center", marginTop: 6 }}>Tokens this wallet launches on Argus show up here, from this app or argus.world.</P>
        <Button title="Launch your first token" style={{ alignSelf: "stretch" }} onPress={onCreate} />
      </Card>
    );
  }
  const owedTotal = launches.reduce((a, l) => a + (l.usdcQuote ? l.owed : 0n), 0n);
  const DUST = 10n ** 16n; // under 0.01 is not worth a claim transaction
  return (
    <>
      {owedTotal >= DUST ? (
        <Card style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View><Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.faint }}>Fees ready to claim</Text><Text style={{ fontFamily: fonts.display, fontSize: 24, color: colors.gold, marginTop: 2 }}>{`${fmtUsd(owedTotal)} USDC`}</Text></View>
          <Ionicons name="cash-outline" size={28} color={colors.gold} />
        </Card>
      ) : null}
      <Card tight>
        {launches.map((l) => (
          <Pressable key={l.token} onPress={() => router.push({ pathname: "/launch/[token]", params: { token: l.token } })} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", padding: 12, borderRadius: radius.md, backgroundColor: pressed ? colors.navy600 : "transparent" })}>
            <TokenLogo symbol={l.symbol} uri={imageUrl(l.meta?.imageURI)} size={42} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text }} numberOfLines={1}>{l.name}</Text>
              <Text style={{ fontFamily: fonts.mono, fontSize: 12, color: colors.faint }}>{`$${l.symbol} · ${timeAgo(l.ts)}`}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ fontFamily: fonts.mono, fontSize: 14, color: colors.text }}>{l.fdv > 0n ? `$${compactUsd(l.fdv)}` : "—"}</Text>
              {l.owed >= DUST ? <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.gold }}>{`${fmtUsd(l.owed)} ${l.quoteSymbol} to claim`}</Text> : <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.faint }}>mcap</Text>}
            </View>
          </Pressable>
        ))}
      </Card>
    </>
  );
}
