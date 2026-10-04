import { Linking, Pressable, Text } from "react-native";
import { explorerTx } from "../chain";
import { colors, fonts } from "../theme";
import type { TxState } from "../wallet/useTx";
import { Notice } from "./ui";

/** One line under a form button: signing, pending, done (with explorer link) or the error in plain words. */
export function TxStatus({ tx, done }: { tx: TxState; done: string }) {
  if (tx.status === "idle") return null;
  if (tx.status === "signing") return <Notice>Signing with your Arc Kit wallet…</Notice>;
  if (tx.status === "pending") return <Notice>Sent. Waiting for Arc to confirm…</Notice>;
  if (tx.status === "error") return <Notice tone="coral">{tx.error}</Notice>;
  return (
    <Notice tone="aqua">
      <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.aqua }}>{done} </Text>
      {tx.hash && (
        <Pressable onPress={() => Linking.openURL(explorerTx(tx.hash!))}>
          <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.aqua, textDecorationLine: "underline" }}>View on Etherscan</Text>
        </Pressable>
      )}
    </Notice>
  );
}
