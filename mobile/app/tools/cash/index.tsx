import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, Share, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useQuery } from "@tanstack/react-query";
import { isAddress, type Address, type Hex } from "viem";
import { Text } from "@/i18n/Text";
import { useWallet, waitFor } from "@/wallet/provider";
import { friendlyError } from "@/wallet/useTx";
import { explorerTx, publicClient } from "@/chain";
import { useBalances } from "@/hooks/useBalances";
import { arcCashAbi, CHAIN_ID, createDeposit, encodeNote, fetchLeaves, fetchRelayerConfig, isSpent, listNotes, parseNote, poolFor, POOLS, reconcileNotes, relayWithdraw, removeNote, saveNote, toBytes32, updateNote, type Pool, type SavedNote } from "@/tools/cash";
import { useProver, type ProveStage } from "@/tools/cash/Prover";
import { Button, Card, Eyebrow, Field, H1, H2, Ledger, Notice, P, Pill, Row, Screen, Seg } from "@/components/ui";
import { BackHeader, Empty, fmtDateTime } from "@/components/tools";
import { fmtUsd, shortAddr } from "@/lib/format";
import { colors, fonts, radius } from "@/theme";

export default function Cash() {
  const [tab, setTab] = useState<"deposit" | "withdraw" | "notes">("deposit");
  const [notes, setNotes] = useState<SavedNote[]>([]);
  const [picked, setPicked] = useState<string | undefined>();
  const reload = useCallback(() => {
    void listNotes().then(async (ns) => { setNotes(ns); if (await reconcileNotes(ns).catch(() => false)) setNotes(await listNotes()); }).catch(() => setNotes([]));
  }, []);
  useEffect(reload, [reload]);
  const prover = useProver();
  return (
    <Screen>
      <BackHeader title="ArcCash" />
      <View style={{ marginTop: 18 }}>
        <H1>Private transfers</H1>
        <P small style={{ marginTop: 6 }}>Deposit a fixed amount, then withdraw it to any wallet later. A zero-knowledge proof shows the money is yours without showing which deposit it was.</P>
      </View>
      <Seg value={tab} options={[["deposit", "Deposit"], ["withdraw", "Withdraw"], ["notes", notes.length ? `Notes · ${notes.length}` : "Notes"]]} onChange={setTab} />
      {tab === "deposit" ? <Deposit onSaved={reload} onDone={() => setTab("notes")} /> : null}
      {tab === "withdraw" ? <Withdraw notes={notes} picked={picked} onChanged={reload} prover={prover} /> : null}
      {tab === "notes" ? <Notes notes={notes} onChanged={reload} onWithdraw={(id) => { setPicked(id); setTab("withdraw"); }} /> : null}
      {prover.element}
      <Notice tone="gold">ArcCash is an experiment. Keep amounts small. The circuit's trusted setup had a single contributor.</Notice>
    </Screen>
  );
}

// ---------------------------------------------------------------- deposit

function Deposit({ onSaved, onDone }: { onSaved: () => void; onDone: () => void }) {
  const { address, walletClient } = useWallet();
  const bal = useBalances(address);
  const [pool, setPool] = useState<Pool>(POOLS[0]);
  const [note, setNote] = useState<SavedNote | null>(null);
  const [backedUp, setBackedUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string; hash?: Hex } | null>(null);
  const sizes = useQuery({ queryKey: ["cash-sizes"], refetchInterval: 30_000, queryFn: () => publicClient.multicall({ allowFailure: true, contracts: POOLS.map((p) => ({ address: p.address, abi: arcCashAbi, functionName: "nextIndex" }) as const) }) });
  const usdc = bal.data?.native ?? 0n;
  const enough = usdc >= pool.denomination + 20_000_000_000_000_000n;

  // the note is generated and saved to secure storage before anything is signed
  const create = async () => {
    setBusy(true); setStage("Creating your note"); setResult(null);
    await new Promise((r) => setTimeout(r, 30));
    try {
      const d = createDeposit();
      const n: SavedNote = { id: d.commitment.toString(16).slice(0, 16), note: encodeNote(d, CHAIN_ID, pool.denomination), pool: pool.address, label: pool.label, createdAt: Date.now(), status: "pending" };
      await saveNote(n);
      setNote(n); setBackedUp(false); onSaved();
    } catch (e) {
      setResult({ ok: false, text: friendlyError(e) });
    } finally { setBusy(false); setStage(""); }
  };

  const deposit = async () => {
    if (!note || !walletClient) return;
    const parsed = parseNote(note.note)!;
    const d = createDeposit(parsed.nullifier, parsed.secret);
    setBusy(true); setResult(null); setStage("Signing the deposit");
    try {
      const hash = await walletClient.writeContract({ account: walletClient.account!, chain: walletClient.chain, address: pool.address, abi: arcCashAbi, functionName: "deposit", args: [toBytes32(d.commitment)], value: pool.denomination });
      await updateNote(note.id, { tx: hash });
      setStage("Waiting for Arc to confirm");
      const rc = await waitFor(hash);
      await updateNote(note.id, { status: rc.status === "success" ? "deposited" : "failed" });
      onSaved();
      setResult(rc.status === "success" ? { ok: true, text: `Deposited ${pool.label}. Your note is saved on this phone. Withdraw any time, ideally after more people have deposited.`, hash } : { ok: false, text: "The deposit reverted. No money left your wallet except gas.", hash });
      if (rc.status === "success") setNote(null);
    } catch (e) {
      await updateNote(note.id, { status: "failed" });
      onSaved();
      setResult({ ok: false, text: friendlyError(e) });
    } finally { setBusy(false); setStage(""); }
  };

  return (
    <Card>
      <H2>Choose an amount</H2>
      <P small style={{ marginTop: 4 }}>Every deposit in a pool is the same size, so withdrawals cannot be matched to deposits by amount.</P>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
        {POOLS.map((p, i) => {
          const on = p.address === pool.address;
          const count = sizes.data?.[i]?.result as number | undefined;
          return (
            <Pressable key={p.address} disabled={!!note} onPress={() => setPool(p)} style={{ flex: 1, padding: 16, borderRadius: radius.lg, borderWidth: 1, borderColor: on ? colors.accentLine : colors.line, backgroundColor: on ? colors.accentSoft : "rgba(5,13,26,0.45)", opacity: note && !on ? 0.4 : 1 }}>
              <Text style={{ fontFamily: fonts.display, fontSize: 22, color: colors.text }}>{p.label}</Text>
              <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.faint, marginTop: 4 }}>{count !== undefined ? `${count} deposits so far` : "…"}</Text>
            </Pressable>
          );
        })}
      </View>

      {!note ? (
        <>
          {!enough ? <Notice tone="coral">{`You need ${pool.label} plus a little gas. Wallet: ${fmtUsd(usdc)} USDC.`}</Notice> : null}
          <Button title={busy ? stage || "Working…" : "Create a note"} disabled={!enough || busy} loading={busy} onPress={() => void create()} />
          <P small style={{ marginTop: 10 }}>A note is the secret that lets you withdraw. It is saved on this phone first; nothing is sent until you confirm the deposit.</P>
        </>
      ) : (
        <>
          <Eyebrow color={colors.gold}>Your note</Eyebrow>
          <View style={{ marginTop: 8, padding: 14, borderRadius: radius.md, backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: "rgba(242,196,100,0.35)" }}>
            <Text style={{ fontFamily: fonts.mono, fontSize: 12, lineHeight: 18, color: colors.text }} selectable>{note.note}</Text>
          </View>
          <Row style={{ marginTop: 4 }}>
            <Button kind="soft" small title="Copy" style={{ flex: 1, marginTop: 10 }} onPress={() => void Clipboard.setStringAsync(note.note)} />
            <Button kind="soft" small title="Share" style={{ flex: 1, marginTop: 10 }} onPress={() => void Share.share({ message: note.note })} />
          </Row>
          <Notice>Anyone with this note can withdraw the money. It is stored securely in this app, but if you lose this phone without a copy, the deposit is gone for good.</Notice>
          <Pressable onPress={() => setBackedUp(!backedUp)} style={{ flexDirection: "row", gap: 10, marginTop: 14, alignItems: "flex-start" }}>
            <View style={{ width: 20, height: 20, borderRadius: 6, borderWidth: 1, borderColor: backedUp ? colors.aqua : colors.lineStrong, backgroundColor: backedUp ? colors.aquaSoft : "transparent", alignItems: "center", justifyContent: "center" }}>{backedUp && <Ionicons name="checkmark" size={14} color={colors.aqua} />}</View>
            <P small style={{ flex: 1 }}><Text style={{ color: colors.text, fontFamily: fonts.bodyMedium }}>I saved a copy somewhere safe.</Text></P>
          </Pressable>
          <Button title={busy ? stage || "Working…" : `Deposit ${pool.label}`} disabled={!backedUp || busy} loading={busy} onPress={() => void deposit()} />
        </>
      )}
      {result ? <Notice tone={result.ok ? "aqua" : "coral"}>{result.text}</Notice> : null}
      {result?.hash ? <Pressable onPress={() => void Linking.openURL(explorerTx(result.hash!))}><Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.accent, marginTop: 8 }}>View on Etherscan</Text></Pressable> : null}
      {result?.ok ? <Button kind="ghost" title="See my notes" onPress={onDone} /> : null}
    </Card>
  );
}

// ---------------------------------------------------------------- withdraw

const STAGES: [string, string][] = [["check", "Checking the note"], ["leaves", "Reading the pool"], ["tree", "Rebuilding the tree"], ["download", "Loading the prover"], ["prove", "Creating the proof"], ["verify", "Checking the proof"], ["send", "Sending (gas paid by Arc Kit)"]];

function Withdraw({ notes, picked, onChanged, prover }: { notes: SavedNote[]; picked?: string; onChanged: () => void; prover: ReturnType<typeof useProver> }) {
  const { address } = useWallet();
  const usable = notes.filter((n) => n.status === "deposited");
  const [noteId, setNoteId] = useState<string | undefined>(picked ?? usable[0]?.id);
  const [pasted, setPasted] = useState("");
  const [to, setTo] = useState("");
  const [stage, setStage] = useState<string | null>(null);
  const [ratio, setRatio] = useState(0);
  const [result, setResult] = useState<{ ok: boolean; text: string; hash?: Hex } | null>(null);
  const relayer = useQuery({ queryKey: ["cash-relayer"], staleTime: 60_000, queryFn: fetchRelayerConfig });
  useEffect(() => { if (picked) setNoteId(picked); }, [picked]);

  const saved = usable.find((n) => n.id === noteId);
  const raw = pasted.trim() || saved?.note || "";
  const parsed = raw ? parseNote(raw) : null;
  const pool = parsed ? poolFor(parsed.denomination) : undefined;
  const ownWallet = !!address && to.toLowerCase() === address.toLowerCase();
  const err = pasted.trim() && !parsed ? "That is not an ArcCash note." : parsed && parsed.chainId !== CHAIN_ID ? "That note is for another network." : parsed && !pool ? "No pool for that amount." : to && !isAddress(to) ? "Not a valid address." : "";
  const ready = !!parsed && !!pool && isAddress(to) && !err && relayer.data?.ready && prover.ready && !stage;

  const run = async () => {
    const d = createDeposit(parsed!.nullifier, parsed!.secret);
    setResult(null); setRatio(0);
    try {
      setStage("check");
      if (await isSpent(pool!, d.nullifierHash)) { if (saved) await updateNote(saved.id, { status: "spent" }); onChanged(); throw new Error("This note was already withdrawn."); }
      setStage("leaves");
      const leaves = await fetchLeaves(pool!);
      const leafIndex = leaves.findIndex((l) => l === d.commitment);
      if (leafIndex < 0) throw new Error("This note's deposit is not in the pool. Check that the note is complete and its deposit confirmed.");
      const proof = await prover.prove({ deposit: d, leaves, leafIndex, recipient: to as Address, relayer: relayer.data!.relayer!, fee: relayer.data!.fee }, (s: ProveStage, r?: number) => { setStage(s); if (r !== undefined) setRatio(r); });
      setStage("send");
      const hash = await relayWithdraw(pool!, proof, d.nullifierHash, to as Address, relayer.data!.fee);
      const rc = await waitFor(hash);
      if (rc.status !== "success") throw new Error("The withdrawal reverted on chain. Your note is still valid.");
      if (saved) await updateNote(saved.id, { status: "spent" });
      onChanged();
      setResult({ ok: true, text: `${pool!.label} sent to ${shortAddr(to, 6)}.`, hash });
      setPasted("");
    } catch (e) {
      setResult({ ok: false, text: friendlyError(e) });
    } finally { setStage(null); }
  };

  if (!prover.supported) return <Card><Notice>Withdrawals need the Arc Kit app on a phone. Use usearckit.online/cash in a browser instead.</Notice></Card>;

  return (
    <>
      <Card>
        <H2>Which note</H2>
        {usable.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
            {usable.map((n) => <Pill key={n.id} tone={!pasted.trim() && noteId === n.id ? "accent" : "dim"} onPress={() => { setNoteId(n.id); setPasted(""); }}>{`${n.label} · ${new Date(n.createdAt).toLocaleDateString()}`}</Pill>)}
          </View>
        ) : <P small style={{ marginTop: 6 }}>No saved notes ready to withdraw. Paste one below.</P>}
        <Field label="Or paste a note" placeholder="arccash-…" value={pasted} onChangeText={setPasted} multiline style={{ minHeight: 70, textAlignVertical: "top", fontSize: 12 }}
          right={<Pressable onPress={() => void Clipboard.getStringAsync().then((t) => t && setPasted(t.trim()))} style={{ paddingHorizontal: 14, alignSelf: "flex-start", paddingTop: 14 }}><Text style={{ fontFamily: fonts.bodyMedium, color: colors.accent }}>Paste</Text></Pressable>} />
        <Field label="Send to" placeholder="0x… a fresh wallet is best" value={to} onChangeText={(v) => setTo(v.trim())} />
        {ownWallet ? <Notice tone="gold">Withdrawing to the wallet that deposited links the two. Use a new wallet for privacy.</Notice> : null}
        <Ledger rows={[["Amount", pool ? pool.label : "—"], ["Gas", relayer.data?.ready ? (relayer.data.fee > 0n ? `${fmtUsd(relayer.data.fee)} USDC fee` : "Paid by Arc Kit") : relayer.isLoading ? "…" : "Relayer offline"], ["Proof", "Made on this phone"]]} />
        {err ? <Notice tone="coral">{err}</Notice> : null}
        {relayer.data && !relayer.data.ready ? <Notice tone="coral">The gas relayer is offline right now. Try again later.</Notice> : null}
        <Button title={stage ? "Working…" : "Withdraw"} disabled={!ready} loading={!!stage} onPress={() => void run()} />
        {!prover.ready && !stage ? <P small style={{ marginTop: 8 }}>Starting the prover…</P> : null}
      </Card>
      {stage ? (
        <Card>
          {STAGES.map(([s, label]) => {
            const order = STAGES.findIndex(([x]) => x === s), cur = STAGES.findIndex(([x]) => x === stage);
            const done = order < cur, now = order === cur;
            return (
              <Row key={s} style={{ paddingVertical: 6 }}>
                <Ionicons name={done ? "checkmark-circle" : now ? "ellipse" : "ellipse-outline"} size={18} color={done ? colors.aqua : now ? colors.accent : colors.faint} />
                <Text style={{ fontFamily: now ? fonts.bodyMedium : fonts.body, fontSize: 14, color: done || now ? colors.text : colors.faint }}>{s === "download" && now && ratio > 0 && ratio < 1 ? `${label} · ${Math.round(ratio * 100)}%` : label}</Text>
              </Row>
            );
          })}
          <P small style={{ marginTop: 6 }}>The first withdrawal downloads the 20 MB prover; later ones reuse it. Creating the proof takes up to a minute.</P>
        </Card>
      ) : null}
      {result ? <Notice tone={result.ok ? "aqua" : "coral"}>{result.text}</Notice> : null}
      {result?.hash ? <Pressable onPress={() => void Linking.openURL(explorerTx(result.hash!))}><Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.accent, marginTop: 8 }}>View on Etherscan</Text></Pressable> : null}
    </>
  );
}

// ---------------------------------------------------------------- notes

function Notes({ notes, onChanged, onWithdraw }: { notes: SavedNote[]; onChanged: () => void; onWithdraw: (id: string) => void }) {
  const [confirm, setConfirm] = useState<string | null>(null);
  if (!notes.length) return <Card><Empty icon="key-outline" title="No notes yet" text="Notes for your deposits are kept here, encrypted on this phone." /></Card>;
  return (
    <>
      {notes.map((n) => {
        const tone = n.status === "deposited" ? "aqua" : n.status === "spent" ? "dim" : n.status === "failed" ? "coral" : "gold";
        return (
          <Card key={n.id}>
            <Row between>
              <Text style={{ fontFamily: fonts.display, fontSize: 18, color: colors.text }}>{n.label}</Text>
              <Pill tone={tone}>{n.status === "deposited" ? "ready" : n.status === "spent" ? "withdrawn" : n.status === "failed" ? "not deposited" : "pending"}</Pill>
            </Row>
            <Text style={{ fontFamily: fonts.mono, fontSize: 12, color: colors.faint, marginTop: 4 }}>{fmtDateTime(Math.floor(n.createdAt / 1000))}</Text>
            <Row style={{ marginTop: 6, flexWrap: "wrap" }}>
              {n.status === "deposited" ? <Button small title="Withdraw" style={{ marginTop: 8 }} onPress={() => onWithdraw(n.id)} /> : null}
              <Button small kind="soft" title="Copy note" style={{ marginTop: 8 }} onPress={() => void Clipboard.setStringAsync(n.note)} />
              {n.tx ? <Button small kind="ghost" title="Deposit tx" style={{ marginTop: 8 }} onPress={() => void Linking.openURL(explorerTx(n.tx!))} /> : null}
              <Button small kind="ghost" title="Remove" style={{ marginTop: 8 }} onPress={() => setConfirm(n.id)} />
            </Row>
            {confirm === n.id ? (
              <>
                <Notice tone={n.status === "deposited" || n.status === "pending" ? "coral" : "accent"}>{n.status === "deposited" || n.status === "pending" ? "This note may still hold money. Without a copy, removing it loses that money for good." : "This note is already used. Removing it is safe."}</Notice>
                <Row>
                  <Button small kind="danger" title="Remove note" style={{ marginTop: 10 }} onPress={() => void removeNote(n.id).then(() => { setConfirm(null); onChanged(); })} />
                  <Button small kind="ghost" title="Keep" style={{ marginTop: 10 }} onPress={() => setConfirm(null)} />
                </Row>
              </>
            ) : null}
          </Card>
        );
      })}
    </>
  );
}
