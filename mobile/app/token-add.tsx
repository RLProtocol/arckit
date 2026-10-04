import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { isAddress, type Address } from "viem";
import { useQueryClient } from "@tanstack/react-query";
import { fetchTokenMeta, type TokenMeta } from "@/hooks/useBalances";
import { customTokens, saveCustomTokens } from "@/wallet/store";
import { Button, Eyebrow, Field, H1, Notice, Row, Screen } from "@/components/ui";
import { colors, fonts } from "@/theme";

export default function TokenAdd() {
  const router = useRouter();
  const qc = useQueryClient();
  const [addr, setAddr] = useState("");
  const [meta, setMeta] = useState<TokenMeta | null | undefined>();
  useEffect(() => { if (!isAddress(addr)) return setMeta(undefined); let live = true; void fetchTokenMeta(addr as Address).then((m) => live && setMeta(m)); return () => { live = false; }; }, [addr]);
  const add = async () => {
    if (!meta || !isAddress(addr)) return;
    const list = await customTokens();
    if (!list.some((t) => t.address.toLowerCase() === addr.toLowerCase())) await saveCustomTokens([...list, { address: addr as Address, ...meta }]);
    void qc.invalidateQueries({ queryKey: ["balances"] });
    router.back();
  };
  return (
    <Screen footer={<View style={{ padding: 20, paddingBottom: 34 }}><Button title={meta ? `Add ${meta.symbol}` : "Add token"} disabled={!meta} onPress={() => void add()} /></View>}>
      <Row between style={{ marginTop: 14 }}><View><Eyebrow>Assets</Eyebrow><H1>Add a token</H1></View><Pressable onPress={() => router.back()}><Text style={{ fontFamily: fonts.bodyMedium, color: colors.dim }}>Close</Text></Pressable></Row>
      <Field label="Token contract address on Arc" placeholder="0x…" value={addr} onChangeText={(v) => setAddr(v.trim())} hint={meta ? `${meta.name} (${meta.symbol}) · ${meta.decimals} decimals` : isAddress(addr) ? (meta === null ? "No ERC-20 found at that address." : "Looking up…") : "Paste the contract address from Arc Etherscan or the project."} />
      <Notice tone="gold">Anyone can create a token with any name. Check the address against an official source before trusting a balance.</Notice>
    </Screen>
  );
}
