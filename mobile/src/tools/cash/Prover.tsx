import { useCallback, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { SITE } from "../../chain";
import type { Proof } from "./index";
import { buildInput, makeDispatcher, type ProveArgs, type ProverMsg, type ProveStage } from "./proverCore";

export type { ProveStage };

// Hermes has no WebAssembly, and a Groth16 proof needs it. So the proof runs in an invisible engine that loads
// usearckit.online/cash/prover.html (snarkjs + the circuit). It is never shown: every screen stays native, and the
// note's inputs go to it through postMessage on the phone, never over the network. (Prover.web.tsx: the PWA.)
export function useProver() {
  const web = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const d = useMemo(() => makeDispatcher(setReady), []);

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    try { d.handle(JSON.parse(e.nativeEvent.data) as ProverMsg); } catch { /* not ours */ }
  }, [d]);

  const prove = useCallback(async (a: ProveArgs, onStage: (s: ProveStage, ratio?: number) => void): Promise<Proof> => {
    if (!web.current) throw new Error("The prover is still starting. Try again in a few seconds.");
    const { input, root } = await buildInput(a, onStage);
    return d.request((id, inp) => web.current!.injectJavaScript(`window.arcProve(${JSON.stringify(id)}, ${JSON.stringify(inp)}); true;`), input, root, onStage);
  }, [d]);

  const element = (
    <View style={{ width: 1, height: 1, opacity: 0, position: "absolute", left: -10, top: -10 }} pointerEvents="none">
      <WebView ref={web} source={{ uri: `${SITE}/cash/prover.html` }} onMessage={onMessage} javaScriptEnabled originWhitelist={["https://*"]} cacheEnabled
        onError={() => setReady(false)} style={{ width: 1, height: 1, backgroundColor: "transparent" }} />
    </View>
  );

  return { element, prove, ready, supported: true };
}
