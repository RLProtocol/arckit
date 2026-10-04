import { useState } from "react";
import { Text, View } from "react-native";
import { publicClient, SITE } from "../chain";
import { colors, fonts } from "../theme";
import { Button, Card, Eyebrow, P } from "./ui";

type Result = { name: string; ok: boolean; ms: number; detail: string };

const ENDPOINTS: [string, string][] = [
  ["Arc Kit RPC proxy", `${SITE}/api/rpc`],
  ["thirdweb RPC", "https://5042.rpc.thirdweb.com"],
  ["arc-scan RPC", "https://rpc.arc-scan.org"],
];

async function probe(name: string, fn: () => Promise<string>): Promise<Result> {
  const t0 = Date.now();
  try {
    const detail = await fn();
    return { name, ok: true, ms: Date.now() - t0, detail };
  } catch (e) {
    return { name, ok: false, ms: Date.now() - t0, detail: (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).slice(0, 220) };
  }
}

/** Runs the same kinds of requests the wallet makes and shows exactly what each one returned. */
export function Diagnostics({ address }: { address?: string }) {
  const [results, setResults] = useState<Result[] | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    const out: Result[] = [];
    for (const [name, url] of ENDPOINTS) {
      out.push(await probe(`${name} · eth_chainId`, async () => {
        const c = new AbortController(); const t = setTimeout(() => c.abort(), 8000);
        const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }), signal: c.signal });
        clearTimeout(t);
        const text = await r.text();
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 80)}`);
        return `chain ${parseInt(JSON.parse(text).result, 16)}`;
      }));
      setResults([...out]);
    }
    out.push(await probe("viem getBlockNumber", async () => `block ${await publicClient.getBlockNumber()}`));
    setResults([...out]);
    if (address) {
      out.push(await probe("viem getBalance", async () => `${await publicClient.getBalance({ address: address as `0x${string}` })} wei`));
      setResults([...out]);
      out.push(await probe("viem multicall (AKIT balanceOf)", async () => {
        const r = await publicClient.multicall({ contracts: [{ address: "0xBc3764348131Fe1962f267f442a8Fe30459ededD", abi: [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }] as const, functionName: "balanceOf", args: [address as `0x${string}`] }], allowFailure: false });
        return `${r[0]} units`;
      }));
      setResults([...out]);
    }
    out.push(await probe("Activity API", async () => { const r = await fetch(`${SITE}/api/activity?address=${address ?? "0x0000000000000000000000000000000000000000"}`); const j = await r.json(); return `HTTP ${r.status} · ${j.items?.length ?? 0} items`; }));
    out.push(await probe("Runtime", async () => `TextDecoder ${typeof TextDecoder}, BigInt ${typeof BigInt}, crypto.getRandomValues ${typeof globalThis.crypto?.getRandomValues}, AbortSignal.timeout ${typeof (AbortSignal as unknown as { timeout?: unknown }).timeout}`));
    setResults([...out]);
    setRunning(false);
  };

  return (
    <Card>
      <Eyebrow color={colors.accent}>Connection check</Eyebrow>
      <P small style={{ marginTop: 6 }}>Runs the same requests the wallet uses and shows what each one answered.</P>
      <Button small kind="soft" title={running ? "Running…" : "Run check"} loading={running} onPress={() => void run()} style={{ alignSelf: "flex-start", marginTop: 12 }} />
      {results?.map((r) => (
        <View key={r.name} style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8 }}>
          <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: r.ok ? colors.aqua : colors.coral }}>{r.ok ? "OK" : "FAIL"} · {r.name} · {r.ms} ms</Text>
          <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.dim, marginTop: 2 }} selectable>{r.detail}</Text>
        </View>
      ))}
    </Card>
  );
}
