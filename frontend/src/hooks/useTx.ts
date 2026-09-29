import { useEffect } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { BaseError, ContractFunctionRevertedError } from "viem";
import { ERROR_TEXT } from "@/contracts";

/** Turn a viem/wagmi error into one plain sentence a user can act on. */
export function friendlyError(err: unknown): string {
  if (!err) return "";
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError) as
      | ContractFunctionRevertedError
      | null;
    const name = revert?.data?.errorName;
    if (name && ERROR_TEXT[name]) return ERROR_TEXT[name];
    const msg = err.shortMessage || err.message;
    if (/user rejected|denied|rejected the request/i.test(msg)) return "You cancelled the request in your wallet.";
    // MetaMask surfaces its own RPC failures as a "revert" through viem; keep the wallet's words so the UI can detect it.
    if (/too many errors|Consider using a different RPC|Internal JSON-RPC error/i.test(err.message)) return err.message.match(/RPC endpoint returned too many errors[^"]*|Internal JSON-RPC error[^"]*/)?.[0] ?? err.message;
    if (/insufficient funds/i.test(msg)) return "Not enough USDC in your wallet to cover gas and the fee.";
    if (/transfer amount exceeds|insufficient allowance|ERC20InsufficientAllowance/i.test(msg))
      return "The locker is not approved for that amount yet. Approve first.";
    if (/ERC20InsufficientBalance|exceeds balance/i.test(msg)) return "Your wallet does not hold that much of this token.";
    return msg;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * One write + its receipt. On confirmation every cached read is invalidated so
 * balances, allowances and lock data refresh without page reloads.
 */
export function useTx() {
  const qc = useQueryClient();
  const write = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: write.data });

  useEffect(() => {
    if (receipt.isSuccess) void qc.invalidateQueries();
  }, [receipt.isSuccess, qc]);

  const error = write.error ?? receipt.error;
  return {
    writeContract: write.writeContract,
    hash: write.data,
    isSigning: write.isPending,
    isConfirming: !!write.data && receipt.isLoading,
    isSuccess: receipt.isSuccess,
    receipt: receipt.data,
    error: error ? friendlyError(error) : "",
    busy: write.isPending || (!!write.data && receipt.isLoading),
    reset: write.reset,
  };
}

export type Tx = ReturnType<typeof useTx>;
