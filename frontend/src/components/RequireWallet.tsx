import type { ReactNode } from "react";
import { useAccount } from "wagmi";
import { arc } from "@/wagmi";
import { ConnectButton } from "@/components/ConnectButton";

/** Gate a screen behind a connected wallet on Arc. `what` finishes the sentence "Connect a wallet to …". */
export function RequireWallet({ children, what }: { children: ReactNode; what: string }) {
  const { isConnected, chainId } = useAccount();

  if (!isConnected) {
    return (
      <div className="empty">
        <h3>Connect a wallet</h3>
        <p className="muted" style={{ marginTop: 6 }}>
          Connect to {what}.
        </p>
        <div className="row" style={{ justifyContent: "center", marginTop: 18 }}>
          <ConnectButton />
        </div>
      </div>
    );
  }
  if (chainId !== arc.id) {
    return (
      <div className="empty">
        <h3>Switch to Arc</h3>
        <p className="muted" style={{ marginTop: 6 }}>
          Your wallet is on another network. Switch to Arc to {what}.
        </p>
        <div className="row" style={{ justifyContent: "center", marginTop: 18 }}>
          <ConnectButton />
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
