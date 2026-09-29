import { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import type { Address } from "viem";
import { LOCKER_ADDRESS, lockerAbi, erc20Abi, type Lock, type TokenMeta } from "@/contracts";

const locker = { address: LOCKER_ADDRESS, abi: lockerAbi } as const;

type MulticallItem = { status: "success" | "failure"; result?: unknown; error?: unknown };

export function useLockFee() {
  return useReadContract({ ...locker, functionName: "lockFee" });
}

export function useLock(id?: bigint) {
  return useReadContract({
    ...locker,
    functionName: "getLock",
    args: [id ?? 0n],
    query: { enabled: id !== undefined, refetchInterval: 20_000 },
  });
}

export function useUserLockIds(user?: Address) {
  return useReadContract({
    ...locker,
    functionName: "getLocksForUser",
    args: [user ?? LOCKER_ADDRESS],
    query: { enabled: !!user },
  });
}

export function useTokenLockIds(token?: Address) {
  return useReadContract({
    ...locker,
    functionName: "getLocksForToken",
    args: [token ?? LOCKER_ADDRESS],
    query: { enabled: !!token },
  });
}

/** Batch-read full Lock structs for a list of ids (multicall). */
export function useLocksByIds(ids?: readonly bigint[]) {
  const key = ids?.map(String).join(",") ?? "";
  const contracts = useMemo(
    () => (ids ?? []).map((id) => ({ ...locker, functionName: "getLock" as const, args: [id] as const })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  const q = useReadContracts({
    contracts,
    allowFailure: false,
    query: { enabled: contracts.length > 0, refetchInterval: 30_000 },
  });
  const locks = useMemo<Lock[] | undefined>(() => {
    if (ids && ids.length === 0) return [];
    return q.data as Lock[] | undefined;
  }, [q.data, ids]);
  return { ...q, locks, isLoading: contracts.length > 0 && q.isLoading };
}

/** Newest `limit` locks by id. Fine for the early network; swap for an indexer later. */
export function useAllLocks(limit = 200) {
  const next = useReadContract({ ...locker, functionName: "nextLockId", query: { refetchInterval: 20_000 } });
  const ids = useMemo(() => {
    if (next.data === undefined) return undefined;
    const count = Number(next.data) - 1;
    const start = Math.max(1, count - limit + 1);
    const out: bigint[] = [];
    for (let i = count; i >= start; i--) out.push(BigInt(i));
    return out;
  }, [next.data, limit]);
  const res = useLocksByIds(ids);
  return {
    ...res,
    isLoading: next.isLoading || res.isLoading,
    isError: next.isError || res.isError,
    total: next.data !== undefined ? Number(next.data) - 1 : undefined,
  };
}

/** name / symbol / decimals / totalSupply for one token. `notToken` when decimals() fails. */
export function useTokenMeta(token?: Address) {
  const q = useReadContracts({
    contracts: token
      ? [
          { address: token, abi: erc20Abi, functionName: "name" },
          { address: token, abi: erc20Abi, functionName: "symbol" },
          { address: token, abi: erc20Abi, functionName: "decimals" },
          { address: token, abi: erc20Abi, functionName: "totalSupply" },
        ]
      : [],
    allowFailure: true,
    query: { enabled: !!token, staleTime: 5 * 60_000 },
  });
  const data = q.data as MulticallItem[] | undefined;
  const meta = useMemo<TokenMeta | undefined>(() => {
    if (!token || !data) return undefined;
    const [name, symbol, decimals, supply] = data;
    if (!decimals || decimals.status !== "success") return undefined;
    return {
      address: token,
      name: name?.status === "success" ? String(name.result) : "Unknown token",
      symbol: symbol?.status === "success" ? String(symbol.result) : "TOKEN",
      decimals: Number(decimals.result),
      totalSupply: supply?.status === "success" ? (supply.result as bigint) : undefined,
    };
  }, [token, data]);
  return { ...q, meta, notToken: !!data && data[2]?.status !== "success" };
}

/** balance + allowance for one wallet on one token. `spender` defaults to the locker; pass the vesting or airdrop contract otherwise. */
export function useTokenAccount(token?: Address, account?: Address, spender: Address = LOCKER_ADDRESS) {
  const enabled = !!token && !!account;
  const q = useReadContracts({
    contracts:
      token && account
        ? [
            { address: token, abi: erc20Abi, functionName: "balanceOf", args: [account] },
            { address: token, abi: erc20Abi, functionName: "allowance", args: [account, spender] },
          ]
        : [],
    allowFailure: false,
    query: { enabled, refetchInterval: 15_000 },
  });
  const [balance, allowance] = (q.data as [bigint, bigint] | undefined) ?? [undefined, undefined];
  return { ...q, balance, allowance };
}

export type MiniMeta = { symbol: string; decimals: number };

/** symbol + decimals for many tokens at once, keyed by lowercase address. */
export function useTokenMetas(tokens: readonly Address[]): Map<string, MiniMeta> {
  const key = Array.from(new Set(tokens.map((t) => t.toLowerCase()))).sort().join(",");
  const uniq = useMemo(() => (key ? (key.split(",") as Address[]) : []), [key]);
  const contracts = useMemo(
    () =>
      uniq.flatMap((t) => [
        { address: t, abi: erc20Abi, functionName: "symbol" as const },
        { address: t, abi: erc20Abi, functionName: "decimals" as const },
      ]),
    [uniq],
  );
  const q = useReadContracts({
    contracts,
    allowFailure: true,
    query: { enabled: contracts.length > 0, staleTime: 5 * 60_000 },
  });
  return useMemo(() => {
    const map = new Map<string, MiniMeta>();
    const d = q.data as MulticallItem[] | undefined;
    if (!d) return map;
    uniq.forEach((t, i) => {
      const s = d[i * 2];
      const dec = d[i * 2 + 1];
      map.set(t, {
        symbol: s?.status === "success" ? String(s.result) : "TOKEN",
        decimals: dec?.status === "success" ? Number(dec.result) : 18,
      });
    });
    return map;
  }, [q.data, uniq]);
}
