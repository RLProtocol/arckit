import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BaseError, ContractFunctionRevertedError, type Hash, type TransactionReceipt } from "viem";
import { ERROR_TEXT } from "../contracts";
import { useWallet, waitFor } from "./provider";

export function friendlyError(err: unknown): string {
  if (!err) return "";
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    const name = revert?.data?.errorName;
    if (name && ERROR_TEXT[name]) return ERROR_TEXT[name];
    const msg = err.shortMessage || err.message;
    if (/insufficient funds/i.test(msg)) return "Not enough USDC in your wallet to cover this and gas.";
    if (/ERC20InsufficientBalance|exceeds balance/i.test(msg)) return "Your wallet does not hold that much of this token.";
    if (/insufficient allowance|ERC20InsufficientAllowance/i.test(msg)) return "Approve the token first.";
    return msg;
  }
  return err instanceof Error ? err.message : String(err);
}

export type TxState = { status: "idle" | "signing" | "pending" | "success" | "error"; hash?: Hash; receipt?: TransactionReceipt; error: string; busy: boolean };

/**
 * Runs one write with the in-app key: sign, broadcast, wait, then refresh every cached read.
 * `run` receives nothing and returns the hash so screens stay declarative.
 */
export function useTx() {
  const qc = useQueryClient();
  const { walletClient } = useWallet();
  const [s, setS] = useState<TxState>({ status: "idle", error: "", busy: false });

  const send = useCallback(async (fn: () => Promise<Hash>) => {
    if (!walletClient) { setS({ status: "error", error: "Wallet is locked.", busy: false }); return; }
    setS({ status: "signing", error: "", busy: true });
    try {
      const hash = await fn();
      setS({ status: "pending", hash, error: "", busy: true });
      const receipt = await waitFor(hash);
      setS({ status: receipt.status === "success" ? "success" : "error", hash, receipt, error: receipt.status === "success" ? "" : "The transaction reverted.", busy: false });
      void qc.invalidateQueries();
      return receipt;
    } catch (e) {
      setS({ status: "error", error: friendlyError(e), busy: false });
    }
  }, [walletClient, qc]);

  const reset = useCallback(() => setS({ status: "idle", error: "", busy: false }), []);
  return { ...s, send, reset };
}
