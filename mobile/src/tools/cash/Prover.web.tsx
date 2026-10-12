import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SITE } from "../../chain";
import type { Proof } from "./index";
import { buildInput, makeDispatcher, type ProveArgs, type ProverMsg, type ProveStage } from "./proverCore";

export type { ProveStage };

// PWA prover: the same usearckit.online/cash/prover.html as the native app, in a hidden iframe, talking over
// postMessage. Browsers have WebAssembly, but keeping one prover page means one place to update the circuit.
const origin = typeof window !== "undefined" && /usearckit\.online$/.test(window.location.hostname) ? window.location.origin : SITE;

export function useProver() {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const d = useMemo(() => makeDispatcher(setReady), []);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || typeof e.data?.arcProver !== "string") return;
      try { d.handle(JSON.parse(e.data.arcProver) as ProverMsg); } catch { /* not ours */ }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [d]);

  const prove = useCallback(async (a: ProveArgs, onStage: (s: ProveStage, ratio?: number) => void): Promise<Proof> => {
    const w = frame.current?.contentWindow;
    if (!w) throw new Error("The prover is still starting. Try again in a few seconds.");
    const { input, root } = await buildInput(a, onStage);
    return d.request((id, inp) => w.postMessage({ arcProve: { id, input: inp } }, origin), input, root, onStage);
  }, [d]);

  const element = <iframe ref={frame} src={`${origin}/cash/prover.html`} title="prover" style={{ position: "absolute", width: 1, height: 1, opacity: 0, border: 0, left: -10, top: -10, pointerEvents: "none" }} />;

  return { element, prove, ready, supported: true };
}
