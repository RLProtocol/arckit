import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { isAddress, parseEther, type Address } from "viem";
import { useWallet } from "@/wallet/provider";
import { useTx } from "@/wallet/useTx";
import { useBalances } from "@/hooks/useBalances";
import { erc20Abi } from "@/contracts";
import { publicClient } from "@/chain";
import { Avatar, Button, Card, Eyebrow, Field, H1, Ledger, Notice, P, Row, Screen } from "@/components/ui";
import { TxStatus } from "@/components/TxStatus";
import { fmtTok, fmtUsd, safeParse, shortAddr } from "@/lib/format";
import { colors, fonts } from "@/theme";

export default function Send() {
  const { token: preset } = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();
  const { address, walletClient } = useWallet();
  const bal = useBalances(address);
  const [token, setToken] = useState<Address | "native">((preset as Address) || "native");
  const [to, setTo] = useState("");
  const [amt, setAmt] = useState("");
  const tx = useTx();
  const [gas, setGas] = useState<bigint | undefined>();

  const asset = useMemo(() => (token === "native" ? { symbol: "USDC", decimals: 18, balance: bal.data?.native ?? 0n } : bal.data?.tokens.find((t) => t.address.toLowerCase() === token.toLowerCase()) ?? { symbol: "…", decimals: 18, balance: 0n }), [token, bal.data]);
  const units = safeParse(amt, asset.decimals);
  const err = !to ? "" : !isAddress(to) ? "That is not a valid Arc address." : !units ? "" : units > asset.balance ? `More than your ${asset.symbol} balance.` : "";
  const ready = !!units && isAddress(to) && !err;

  const estimate = async () => {
    if (!ready || !address) return;
    try {
      const g = token === "native" ? await publicClient.estimateGas({ account: address, to: to as Address, value: units }) : await publicClient.estimateContractGas({ account: address, address: token, abi: erc20Abi, functionName: "transfer", args: [to as Address, units!] });
      const price = await publicClient.getGasPrice();
      setGas(g * price);
    } catch { setGas(undefined); }
  };

  const submit = () => void tx.send(async () => {
    if (!walletClient || !address) throw new Error("Wallet is locked.");
    if (token === "native") return walletClient.sendTransaction({ account: walletClient.account!, chain: walletClient.chain, to: to as Address, value: units! });
    return walletClient.writeContract({ account: walletClient.account!, chain: walletClient.chain, address: token, abi: erc20Abi, functionName: "transfer", args: [to as Address, units!] });
  });

  return (
    <Screen footer={<View style={{ padding: 20, paddingBottom: 34 }}>{tx.status === "success" ? <Button title="Done" onPress={() => router.back()} /> : <Button title={tx.busy ? "Sending…" : `Send ${asset.symbol}`} disabled={!ready} loading={tx.busy} onPress={submit} />}</View>}>
      <Row between style={{ marginTop: 14 }}><View><Eyebrow>Send</Eyebrow><H1>Send {asset.symbol}</H1></View><Pressable onPress={() => router.back()}><Text style={{ fontFamily: fonts.bodyMedium, color: colors.dim }}>Close</Text></Pressable></Row>
      <Card tight style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, padding: 8 }}>
        <AssetChip on={token === "native"} symbol="USDC" onPress={() => { setToken("native"); setAmt(""); }} />
        {bal.data?.tokens.filter((t) => t.balance > 0n || t.address.toLowerCase() === token.toLowerCase()).map((t) => <AssetChip key={t.address} on={token.toLowerCase() === t.address.toLowerCase()} symbol={t.symbol} onPress={() => { setToken(t.address); setAmt(""); }} />)}
      </Card>
      <Field label="To" placeholder="0x…" value={to} onChangeText={(v) => setTo(v.trim())} error={to && !isAddress(to) ? "That is not a valid Arc address." : undefined} hint={isAddress(to) ? `Sending on Arc to ${shortAddr(to, 6)}` : "An Arc / EVM address. Double-check it: transfers cannot be reversed."} />
      <Field label={`Amount in ${asset.symbol}`} placeholder="0.00" keyboardType="decimal-pad" value={amt} onChangeText={setAmt} onBlur={estimate} error={err && units ? err : undefined} hint={`Balance: ${token === "native" ? fmtUsd(asset.balance, 4) : fmtTok(asset.balance, asset.decimals)} ${asset.symbol}`}
        right={<Pressable onPress={() => setAmt(token === "native" ? (asset.balance > parseEther("0.01") ? (Number(asset.balance - parseEther("0.01")) / 1e18).toString() : "0") : (Number(asset.balance) / 10 ** asset.decimals).toString())} style={{ paddingHorizontal: 14 }}><Text style={{ fontFamily: fonts.bodyMedium, color: colors.accent }}>Max</Text></Pressable>} />
      {ready && (
        <Ledger rows={[["You send", `${amt} ${asset.symbol}`], ["To", shortAddr(to, 8)], ["Network fee", gas !== undefined ? `≈ ${fmtUsd(gas, 5)} USDC` : "tap outside the field to estimate"]]} />
      )}
      <TxStatus tx={tx} done={`Sent. ${asset.symbol} is on its way.`} />
      {!ready && !tx.hash && <Notice>Gas on Arc is paid in USDC and usually costs less than a cent.</Notice>}
      <P small style={{ marginTop: 10 }}>{" "}</P>
    </Screen>
  );
}

function AssetChip({ on, symbol, onPress }: { on: boolean; symbol: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, backgroundColor: on ? colors.accentSoft : "transparent", borderWidth: 1, borderColor: on ? colors.accentLine : colors.line }}>
      <Avatar symbol={symbol} size={20} /><Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: on ? colors.accent : colors.dim }}>{symbol}</Text>
    </Pressable>
  );
}
