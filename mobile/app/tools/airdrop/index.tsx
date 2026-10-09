import { useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { isAddress, type Address } from "viem";
import { useWallet } from "@/wallet/provider";
import { ADDR } from "@/chain";
import { Card, H1, P, Seg, Screen } from "@/components/ui";
import { AirdropPanel } from "@/components/AirdropPanel";
import { BackHeader, TokenField, useTokenInfo } from "@/components/tools";

export default function Airdrop() {
  const params = useLocalSearchParams<{ token?: string }>();
  const { address } = useWallet();
  const [kind, setKind] = useState<"token" | "usdc">("token");
  const [token, setToken] = useState(params.token && isAddress(params.token) ? params.token : "");
  const info = useTokenInfo(token, address, ADDR.airdrop);
  return (
    <Screen>
      <BackHeader title="Airdrop" />
      <View style={{ marginTop: 18 }}>
        <H1>Airdrop</H1>
        <P small style={{ marginTop: 6 }}>Send a token or USDC to a list of wallets, 250 per transaction, with one approval.</P>
      </View>
      <Seg value={kind} options={[["token", "A token"], ["usdc", "USDC"]]} onChange={setKind} />
      <Card>
        {kind === "token" ? (
          <>
            <TokenField value={token} onChange={setToken} info={info.data} loading={info.isLoading} />
            {info.data ? <AirdropPanel key={info.data.address} token={info.data.address as Address} /> : null}
          </>
        ) : <AirdropPanel key="native" />}
      </Card>
    </Screen>
  );
}
