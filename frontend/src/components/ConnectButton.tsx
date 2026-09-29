import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { arc } from "@/wagmi";
import { shortAddr } from "@/lib/format";

export function ConnectButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (!isConnected) {
    // EIP-6963 discovered wallets get their own entry; hide the generic fallback when any exist.
    const discovered = connectors.filter((c) => c.id !== "injected");
    const list = discovered.length > 0 ? discovered : connectors;

    if (list.length === 0) {
      return (
        <a className="btn btn-ghost" href="https://metamask.io/download/" target="_blank" rel="noreferrer">
          Install a wallet
        </a>
      );
    }
    if (list.length === 1) {
      return (
        <button className="btn btn-primary" onClick={() => connect({ connector: list[0] })} disabled={isPending}>
          {isPending ? "Connecting…" : "Connect wallet"}
        </button>
      );
    }
    return (
      <div ref={ref} style={{ position: "relative" }}>
        <button className="btn btn-primary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          Connect wallet
        </button>
        {open && (
          <div className="panel" style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", minWidth: 240, zIndex: 30, padding: 8 }}>
            {list.map((c) => (
              <button
                key={c.uid}
                className="btn btn-ghost btn-block"
                style={{ justifyContent: "flex-start", marginBottom: 4, border: "none" }}
                onClick={() => {
                  connect({ connector: c });
                  setOpen(false);
                }}
              >
                {c.icon && <img src={c.icon} width={18} height={18} alt="" style={{ borderRadius: 4 }} />}
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (chainId !== arc.id) {
    return (
      <button className="btn btn-danger" onClick={() => switchChain({ chainId: arc.id })} disabled={switching}>
        {switching ? "Switching…" : "Switch to Arc"}
      </button>
    );
  }

  return (
    <button className="btn btn-ghost mono" onClick={() => disconnect()} title={`${address}\nClick to disconnect`}>
      <span style={{ width: 8, height: 8, borderRadius: 4, background: "var(--aqua)" }} />
      {shortAddr(address)}
    </button>
  );
}
