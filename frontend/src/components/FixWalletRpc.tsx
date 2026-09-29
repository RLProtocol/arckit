import { useState } from "react";
import { useAccount } from "wagmi";
import { arc, WALLET_RPC } from "@/wagmi";

/**
 * Wallets keep their own RPC for Arc. If a user added Arc while we listed the flaky
 * endpoint first, MetaMask shows "RPC endpoint returned too many errors" on every
 * transaction. This asks the wallet to add the healthy endpoint for chain 5042; MetaMask
 * then prompts the user to switch its Arc network to it.
 */
export function FixWalletRpc({ compact = false }: { compact?: boolean }) {
  const { connector, isConnected } = useAccount();
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  if (!isConnected || !connector) return null;

  async function run() {
    setState("busy");
    try {
      const provider = (await connector!.getProvider()) as { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: `0x${arc.id.toString(16)}`,
            chainName: "Arc",
            nativeCurrency: arc.nativeCurrency,
            rpcUrls: [WALLET_RPC],
            blockExplorerUrls: [arc.blockExplorers.default.url],
          },
        ],
      });
      setState("done");
      setMsg("Your wallet now has the healthier Arc RPC. Retry the transaction.");
    } catch (e) {
      setState("error");
      setMsg((e as Error)?.message?.slice(0, 160) || "Wallet refused. Edit the Arc network in your wallet and set the RPC URL manually.");
    }
  }

  return (
    <div className={compact ? "small" : "notice small stack"} style={compact ? undefined : { gap: 8 }}>
      {!compact && (
        <div>
          Your wallet talks to Arc through its own RPC, and the default one is unreliable right now. Switch it to{" "}
          <span className="mono">{WALLET_RPC.replace("https://", "")}</span>:
        </div>
      )}
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn btn-soft btn-sm" onClick={run} disabled={state === "busy"}>
          {state === "busy" ? "Waiting for wallet…" : "Fix wallet RPC"}
        </button>
        {msg && <span className={state === "error" ? "faint" : ""} style={{ color: state === "done" ? "var(--aqua)" : undefined }}>{msg}</span>}
      </div>
    </div>
  );
}
