import { explorerTx } from "@/contracts";
import type { Tx } from "@/hooks/useTx";
import { FixWalletRpc } from "@/components/FixWalletRpc";

const WALLET_RPC_ERROR = /too many errors|RPC endpoint|Consider using a different RPC|Internal JSON-RPC error|could not coalesce|failed to fetch/i;

export function TxStatus({ tx, done }: { tx: Tx; done?: string }) {
  const link = tx.hash ? (
    <a href={explorerTx(tx.hash)} target="_blank" rel="noreferrer" style={{ textDecoration: "underline", marginLeft: 6 }}>
      View transaction
    </a>
  ) : null;

  if (tx.error) {
    const walletRpc = WALLET_RPC_ERROR.test(tx.error);
    return (
      <div className="notice notice-err stack" role="alert" style={{ gap: 8 }}>
        <div>{walletRpc ? "Your wallet's Arc RPC failed before the transaction was sent. Nothing was submitted." : tx.error}</div>
        {walletRpc && <FixWalletRpc compact />}
        {walletRpc && <div className="tiny faint">Wallet said: {tx.error.slice(0, 140)}</div>}
      </div>
    );
  }
  if (tx.isSigning) return <div className="notice">Confirm in your wallet…</div>;
  if (tx.isConfirming) return <div className="notice">Waiting for Arc to confirm…{link}</div>;
  if (tx.isSuccess) return <div className="notice notice-ok">{done ?? "Done."}{link}</div>;
  return null;
}
