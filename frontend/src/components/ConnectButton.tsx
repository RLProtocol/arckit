import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { arc } from "@/wagmi";
import { shortAddr } from "@/lib/format";

const WcMark = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M6.2 9.3c3.2-3.1 8.4-3.1 11.6 0l.4.4a.4.4 0 0 1 0 .6l-1.3 1.3a.2.2 0 0 1-.3 0l-.5-.5a5.7 5.7 0 0 0-8 0l-.6.6a.2.2 0 0 1-.3 0L5.9 10.3a.4.4 0 0 1 0-.6zm14.3 2.6 1.2 1.2a.4.4 0 0 1 0 .6l-5.3 5.2a.4.4 0 0 1-.6 0L12 15.2a.1.1 0 0 0-.1 0l-3.8 3.7a.4.4 0 0 1-.6 0l-5.3-5.2a.4.4 0 0 1 0-.6l1.2-1.2a.4.4 0 0 1 .6 0l3.8 3.7a.1.1 0 0 0 .1 0l3.8-3.7a.4.4 0 0 1 .6 0l3.8 3.7a.1.1 0 0 0 .1 0l3.8-3.7a.4.4 0 0 1 .6 0z" fill="#8fb3ff"/></svg>
);

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
    // EIP-6963 discovered wallets get their own entry; hide the generic fallback when any exist. WalletConnect is
    // always offered so mobile-browser visitors can reach a wallet app.
    const discovered = connectors.filter((c) => c.id !== "injected");
    const list = discovered.length > 0 ? discovered : connectors;
    const label = (c: (typeof connectors)[number]) => (c.id === "walletConnect" ? "WalletConnect · mobile wallets" : c.name);

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
          {isPending ? "Connecting…" : list[0].id === "walletConnect" ? "Connect wallet app" : "Connect wallet"}
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
                {c.icon ? <img src={c.icon} width={18} height={18} alt="" style={{ borderRadius: 4 }} /> : c.id === "walletConnect" ? <WcMark /> : null}
                {label(c)}
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
