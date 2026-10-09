import { useMemo, useState } from "react";
import { Linking, Pressable, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useQuery } from "@tanstack/react-query";
import { type Address, type Hex } from "viem";
import { Text } from "../i18n/Text";
import { ADDR, explorerTx, publicClient } from "../chain";
import { airdropAbi, erc20Abi } from "../contracts";
import { useWallet, waitFor } from "../wallet/provider";
import { friendlyError } from "../wallet/useTx";
import { useBalances } from "../hooks/useBalances";
import { chunk, mergeDuplicates, parseRecipients } from "../tools/airdropParse";
import { fmtTok, fmtUsd, safeParse } from "../lib/format";
import { colors, fonts } from "../theme";
import { useTokenInfo } from "./tools";
import { Button, Field, Ledger, Notice, Pill } from "./ui";

const BATCH = 250; // the contract allows 500; 250 keeps each transaction well under Arc's block gas limit
const NATIVE_GAS_BUFFER = 50_000_000_000_000_000n; // 0.05 USDC kept back for gas when sending native USDC

/**
 * Send one token (or native USDC) to many wallets: one approval, then one transaction per 250 recipients.
 * `token` undefined means native USDC. Used by the Airdrop tool and on each launch.
 */
export function AirdropPanel({ token }: { token?: Address }) {
  const { address, walletClient } = useWallet();
  const native = !token;
  const [same, setSame] = useState(true);
  const [list, setList] = useState("");
  const [each, setEach] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [sent, setSent] = useState<Hex[]>([]);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const info = useTokenInfo(token, address, ADDR.airdrop);
  const bal = useBalances(native ? address : undefined);
  const fee = useQuery({ queryKey: ["airdrop-fee"], staleTime: 5 * 60_000, queryFn: () => publicClient.readContract({ address: ADDR.airdrop, abi: airdropAbi, functionName: "fee" }) });

  const decimals = native ? 18 : info.data?.decimals ?? 18;
  const symbol = native ? "USDC" : info.data?.symbol ?? "";
  const balance = native ? bal.data?.native ?? 0n : info.data?.balance ?? 0n;
  const parsed = useMemo(() => parseRecipients(list, decimals, same), [list, decimals, same]);
  const rows = useMemo(() => mergeDuplicates(parsed.rows), [parsed.rows]);
  const eachWei = safeParse(each, decimals);
  const amounts = rows.map((r) => (same ? eachWei ?? 0n : r.amount ?? 0n));
  const total = amounts.reduce((a, b) => a + b, 0n);
  const batches = Math.ceil(rows.length / BATCH);
  const fees = (fee.data ?? 0n) * BigInt(Math.max(batches, 1));
  const needed = native ? total + fees + NATIVE_GAS_BUFFER : total;

  const firstErr = parsed.errors[0];
  const err = firstErr ? `Line ${firstErr.line}: ${firstErr.reason}${parsed.errors.length > 1 ? ` (and ${parsed.errors.length - 1} more)` : ""}.`
    : same && each.trim() && !eachWei ? "Enter an amount per wallet."
    : total > 0n && needed > balance ? (native ? "Not enough USDC for this, the fee and gas." : `You hold ${fmtTok(balance, decimals)} ${symbol}.`) : "";
  const ready = rows.length > 0 && !err && total > 0n && fee.data !== undefined && !!walletClient && (native || !!info.data);

  const run = async () => {
    const wc = walletClient!;
    setBusy(true); setResult(null); setSent([]);
    try {
      if (!native && (info.data?.allowance ?? 0n) < total) {
        setProgress(`Approve ${symbol}`);
        const rc = await waitFor(await wc.writeContract({ account: wc.account!, chain: wc.chain, address: token!, abi: erc20Abi, functionName: "approve", args: [ADDR.airdrop, total] }));
        if (rc.status !== "success") throw new Error("The approval failed on chain.");
      }
      const toBatches = chunk(rows.map((r) => r.address), BATCH);
      const amtBatches = chunk(amounts, BATCH);
      for (let b = 0; b < toBatches.length; b++) {
        setProgress(`Sending batch ${b + 1} of ${toBatches.length}`);
        const to = toBatches[b], am = amtBatches[b];
        const hash = native
          ? await wc.writeContract({ account: wc.account!, chain: wc.chain, address: ADDR.airdrop, abi: airdropAbi, functionName: "airdropNative", args: [to, am], value: am.reduce((a, x) => a + x, 0n) + fee.data! })
          : same
            ? await wc.writeContract({ account: wc.account!, chain: wc.chain, address: ADDR.airdrop, abi: airdropAbi, functionName: "airdropERC20Same", args: [token!, to, eachWei!], value: fee.data! })
            : await wc.writeContract({ account: wc.account!, chain: wc.chain, address: ADDR.airdrop, abi: airdropAbi, functionName: "airdropERC20", args: [token!, to, am], value: fee.data! });
        setSent((s) => [...s, hash]);
        const rc = await waitFor(hash);
        if (rc.status !== "success") throw new Error(`Batch ${b + 1} failed on chain. Earlier batches were sent.`);
      }
      setResult({ ok: true, text: `Sent ${fmtTok(total, decimals)} ${symbol} to ${rows.length} wallets.` });
      setList("");
      void info.refetch(); void bal.refetch();
    } catch (e) {
      setResult({ ok: false, text: friendlyError(e) });
    } finally {
      setBusy(false); setProgress("");
    }
  };

  return (
    <View>
      <View style={{ flexDirection: "row", gap: 6, marginTop: 14 }}>
        <Pill tone={same ? "accent" : "dim"} onPress={() => setSame(true)}>Same amount</Pill>
        <Pill tone={!same ? "accent" : "dim"} onPress={() => setSame(false)}>Amount per wallet</Pill>
      </View>
      <Field
        label="Recipients"
        placeholder={same ? "0x… one address per line" : "0x…, 100 one per line"}
        value={list}
        onChangeText={setList}
        multiline
        style={{ minHeight: 120, maxHeight: 260, textAlignVertical: "top", fontSize: 13 }}
        right={<Pressable onPress={() => void Clipboard.getStringAsync().then((t) => t && setList(t))} style={{ paddingHorizontal: 14, alignSelf: "flex-start", paddingTop: 14 }}><Text style={{ fontFamily: fonts.bodyMedium, color: colors.accent }}>Paste</Text></Pressable>}
        hint={rows.length ? `${rows.length} wallets${batches > 1 ? ` · ${batches} transactions` : ""}${parsed.duplicates.length ? ` · ${parsed.duplicates.length} duplicates merged` : ""}` : "Paste a list or a CSV. Any number of wallets, sent 250 per transaction."}
      />
      {same ? <Field label={`${symbol || "Amount"} per wallet`} placeholder="0" keyboardType="decimal-pad" value={each} onChangeText={setEach} /> : null}
      {err ? <Notice tone="coral">{err}</Notice> : null}
      <Ledger rows={[
        ["Total", total > 0n ? `${fmtTok(total, decimals)} ${symbol}` : "—"],
        ["You hold", `${fmtTok(balance, decimals, 2)} ${symbol}`],
        ["Fee", fee.data !== undefined ? `${fmtUsd(fees)} USDC${batches > 1 ? ` (${batches} × ${fmtUsd(fee.data)})` : ""}` : "…"],
      ]} />
      <Button title={busy ? progress || "Confirming…" : rows.length ? `Airdrop to ${rows.length} wallets` : "Airdrop"} disabled={!ready} loading={busy} onPress={() => void run()} />
      {busy && progress ? <Notice>{`${progress}…`}</Notice> : null}
      {result ? <Notice tone={result.ok ? "aqua" : "coral"}>{result.text}</Notice> : null}
      {sent.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 10 }}>
          {sent.map((h, i) => <Pressable key={h} onPress={() => void Linking.openURL(explorerTx(h))}><Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.accent, textDecorationLine: "underline" }}>{`Batch ${i + 1}`}</Text></Pressable>)}
        </View>
      ) : null}
    </View>
  );
}
