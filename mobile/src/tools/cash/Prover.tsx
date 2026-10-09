import { useCallback, useRef, useState } from "react";
import { Platform, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { SITE } from "../../chain";
import { LEVELS, merklePath, type Deposit } from "./crypto";
import type { Proof } from "./index";
import type { Address } from "viem";

// Hermes has no WebAssembly, and a Groth16 proof needs it. So the proof runs in an invisible engine that loads
// usearckit.online/cash/prover.html (snarkjs + the circuit). It is never shown: every screen stays native, and the
// note's inputs go to it through postMessage on the phone, never over the network.

export type ProveStage = "tree" | "download" | "prove" | "verify";
type Pending = { resolve: (p: Proof) => void; reject: (e: Error) => void; onStage: (s: ProveStage, ratio?: number) => void };

export function useProver() {
  const web = useRef<WebView>(null);
  const pending = useRef<Record<string, Pending>>({});
  const [ready, setReady] = useState(false);

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    let m: { id?: string; type: string; stage?: ProveStage; ratio?: number; proof?: { pi_a: string[]; pi_b: string[][]; pi_c: string[] }; message?: string };
    try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (m.type === "ready") { setReady(true); return; }
    const p = m.id ? pending.current[m.id] : undefined;
    if (!p) return;
    if (m.type === "progress" && m.stage) p.onStage(m.stage, m.ratio);
    else if (m.type === "error") { delete pending.current[m.id!]; p.reject(new Error(m.message || "The proof failed.")); }
    else if (m.type === "done" && m.proof) {
      delete pending.current[m.id!];
      const b = (x: string) => BigInt(x);
      const pr = m.proof;
      // snarkjs orders G2 coordinates [x1, x0]; the Solidity verifier expects them swapped
      p.resolve({ pA: [b(pr.pi_a[0]), b(pr.pi_a[1])], pB: [[b(pr.pi_b[0][1]), b(pr.pi_b[0][0])], [b(pr.pi_b[1][1]), b(pr.pi_b[1][0])]], pC: [b(pr.pi_c[0]), b(pr.pi_c[1])], root: 0n });
    }
  }, []);

  /** Builds the Merkle path natively, then asks the engine for the proof. Resolves with the proof and its root. */
  const prove = useCallback(async (a: { deposit: Deposit; leaves: bigint[]; leafIndex: number; recipient: Address; relayer: Address; fee: bigint }, onStage: (s: ProveStage, ratio?: number) => void): Promise<Proof> => {
    if (!web.current) throw new Error("The prover is still starting. Try again in a few seconds.");
    onStage("tree");
    await new Promise((r) => setTimeout(r, 30)); // let the screen paint before the hashing
    const mp = merklePath(a.leaves, a.leafIndex);
    if (mp.pathElements.length !== LEVELS) throw new Error("Could not rebuild the pool's tree.");
    const input = {
      root: mp.root.toString(), nullifierHash: a.deposit.nullifierHash.toString(), recipient: BigInt(a.recipient).toString(), relayer: BigInt(a.relayer).toString(),
      fee: a.fee.toString(), refund: "0", nullifier: a.deposit.nullifier.toString(), secret: a.deposit.secret.toString(),
      pathElements: mp.pathElements.map(String), pathIndices: mp.pathIndices.map(String),
    };
    const id = Math.random().toString(36).slice(2);
    const proof = await new Promise<Proof>((resolve, reject) => {
      pending.current[id] = { resolve, reject, onStage };
      web.current!.injectJavaScript(`window.arcProve(${JSON.stringify(id)}, ${JSON.stringify(input)}); true;`);
    });
    return { ...proof, root: mp.root };
  }, []);

  const element = Platform.OS === "web" ? null : (
    <View style={{ width: 1, height: 1, opacity: 0, position: "absolute", left: -10, top: -10 }} pointerEvents="none">
      <WebView ref={web} source={{ uri: `${SITE}/cash/prover.html` }} onMessage={onMessage} javaScriptEnabled originWhitelist={["https://*"]} cacheEnabled
        onError={() => setReady(false)} style={{ width: 1, height: 1, backgroundColor: "transparent" }} />
    </View>
  );

  return { element, prove, ready, supported: Platform.OS !== "web" };
}
